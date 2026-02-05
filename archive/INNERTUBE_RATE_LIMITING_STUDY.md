# Étude : Services Externes, Rate Limiting et Stratégie de Scalabilité

## Le défi

Si x10tube est lancé sur Hacker News ou Reddit et que ça prend, on pourrait passer de quelques utilisateurs à des milliers en quelques heures. Tout repose actuellement sur deux services externes appelés **depuis le serveur** :

1. **YouTube InnerTube** — transcriptions vidéo (`server/src/services/transcript.ts`)
2. **Jina Reader** (`r.jina.ai`) — conversion de pages web en Markdown (`server/src/services/content.ts`)

Si l'un de ces services bloque notre IP serveur pendant la montée virale, **tout s'arrête**. Il faut un plan qui empêche ça.

---

## 1. État des lieux : les requêtes actuelles

### YouTube InnerTube

- **POST** vers `youtube.com/youtubei/v1/player` → métadonnées + URLs des sous-titres
- **GET** vers l'URL de sous-titres → XML des captions
- Deux clients (WEB + ANDROID en fallback), 3 tentatives avec backoff
- Code maison, aucune bibliothèque externe

### Jina Reader

- **GET** vers `https://r.jina.ai/<URL>` avec `Accept: application/json`
- Retourne le contenu de la page en Markdown
- **Aucune clé API configurée** — on est sur le tier sans authentification

---

## 2. Les limites de chaque service

### YouTube InnerTube — Vue d'ensemble

| Aspect | Détail |
|--------|--------|
| Quota formelle | **Aucune** (contrairement à l'API Data v3 et ses 10K unités/jour) |
| Rate limiting | Pas de limite stricte, mais throttle possible après ~250 requêtes rapides |
| Ban IP datacenter | **Oui** — YouTube bloque activement AWS, GCP, Azure, DigitalOcean |
| Ban IP résidentielle | Rare, sauf abus massif |
| Durée du ban | Jusqu'à **24h** une fois déclenché (confirmé par la doc Invidious) |
| Proxies datacenter | 20-40% de succès |
| Proxies résidentiels | 85-95% de succès |

### YouTube Player API (`/youtubei/v1/player`) — L'endpoint critique

C'est l'endpoint le plus surveillé de toute l'API InnerTube. Il fournit les URLs de stream vidéo et les URLs de sous-titres. YouTube y applique ses mesures anti-abus les plus strictes.

#### Seuils connus

| Condition | Seuil approximatif | Source |
|-----------|-------------------|--------|
| **Session invité (pas de cookies)** | ~300 vidéos/heure (~1 000 req player+webpage/h) | yt-dlp wiki |
| **Session authentifiée (cookies)** | ~2 000 vidéos/heure (~4 000 req/h) | yt-dlp wiki |
| **youtube-transcript-api (non auth)** | ~250 requêtes consécutives avant erreurs | Issue #66 |
| **Intervalle recommandé** | 5-10 secondes entre chaque requête | yt-dlp wiki |
| **Cooldown après un 429** | Jusqu'à **24 heures** | Doc Invidious |

**Important** : ces seuils s'appliquent aux **IPs résidentielles**. Sur une IP datacenter, le blocage peut être **immédiat**, quel que soit le volume.

#### Modes de blocage (pas juste un 429)

YouTube ne renvoie pas toujours un simple HTTP 429. Les réponses de blocage sont variées et parfois difficiles à détecter :

| Réponse | Description |
|---------|-------------|
| **HTTP 429** | Rate limit classique |
| **HTTP 403** | Utilisé aussi bien pour les restrictions vidéo que pour les blocages IP |
| **"Sign in to confirm you're not a bot"** | Page HTML au lieu du JSON attendu — soft block, contournable avec auth |
| **Page de consentement HTML** | Redirect vers `consent.youtube.com` au lieu du JSON |
| **`streamingData` vide** | JSON techniquement valide mais sans données utiles — requiert un PO Token |
| **CAPTCHA / reCAPTCHA** | Page HTML avec challenge Google |
| **Métadonnées d'une autre vidéo** | Dans certains cas de 429, YouTube renvoie les données d'une vidéo *différente* |

#### Le Player est plus surveillé que les autres endpoints

- C'est là que YouTube applique les **PO Tokens** (Proof of Origin, générés via BotGuard)
- Les endpoints `/browse` et `/search` sont bien moins surveillés — Invidious note que leurs limites sont "si hautes qu'on ne les atteint jamais"
- L'endpoint `timedtext` (sous-titres) est moins surveillé que le Player

#### Différences selon le type de client

YouTube différencie les clients par niveau de confiance :

| Client | Niveau de confiance | Notes |
|--------|-------------------|-------|
| **`web`** | Élevé (avec PO Token) | Requiert BotGuard, accès complet |
| **`android` / `android_sdkless`** | Moyen-élevé | Moins de restrictions, recommandé par yt-dlp (défaut en janvier 2026) |
| **`mweb`** | Moyen | Recommandé en fallback avec PO Token |
| **`tv_embedded`** | Faible | Limité à 720p, YouTube y teste le DRM obligatoire |

**Notre code utilise `WEB` puis `ANDROID` en fallback** — c'est cohérent avec les bonnes pratiques actuelles.

#### Évolutions récentes (2024-2026)

- **PO Tokens (2024)** — YouTube exige des tokens générés par un vrai navigateur (BotGuard). Sans PO Token, le Player peut renvoyer des réponses dégradées
- **"Sign in to confirm you're not a bot" (2024-2025)** — Déployé massivement, affecte même les VPN et les réseaux d'entreprise (Cisco a documenté le problème)
- **DRM sur certains clients (2025)** — YouTube A/B teste l'envoi de flux Widevine uniquement sur le client TV
- **OAuth bloqué (2025)** — Seule l'authentification par cookies fonctionne encore pour les outils tiers
- **Nouveau client `android_sdkless` (janvier 2026)** — Introduit par yt-dlp comme nouveau défaut après restrictions sur les autres clients
- **Invidious cassé sur datacenter (2024-présent)** — Les instances publiques sur IPs datacenter ne fonctionnent plus sans mesures additionnelles

### Jina Reader

| Aspect | Sans clé API | Clé gratuite | Payante | Premium |
|--------|-------------|-------------|---------|---------|
| **RPM** | **20** | 500 | 500 | 5 000 |
| **Concurrent** | ? | 2 | 50 | 500 |
| **Tokens inclus** | - | 10M offerts | Payant | Payant |

- Tarification : basée sur les tokens de sortie (taille du Markdown retourné)
- Coût approximatif : ~$0.02 / million de tokens (rapports communautaires, pas de prix officiel clair)
- Jina n'affiche pas clairement ses tarifs — des utilisateurs s'en plaignent sur GitHub
- Limite IP globale : 10 000 req/60s (pas un problème)

**Problème immédiat : sans clé API, on est à 20 RPM.** C'est le goulot le plus critique.

---

## 3. Scénario de lancement viral

### Hypothèse : 5000 nouveaux utilisateurs en 24h

Si chaque utilisateur crée 1-2 collections avec 2-3 items :
- **~10 000-15 000 requêtes InnerTube/jour** depuis une seule IP serveur
- **~2 000-5 000 requêtes Jina/jour** (pages web = proportion moindre)
- Pic de charge concentré sur quelques heures

### Ce qui casse en premier

1. **Jina Reader** (20 RPM sans clé) → bloqué presque immédiatement
2. **YouTube InnerTube** → risque de ban IP si serveur sur datacenter connu

### Conséquence

L'appli devient inutilisable au moment exact où elle a le plus de visibilité. Le pire timing possible.

---

## 4. L'extraction côté extension : une vraie solution

### Pourquoi c'est faisable

L'extension Chrome a `"host_permissions": ["<all_urls>"]`, ce qui lui permet de faire des requêtes cross-origin **sans restriction CORS**. Depuis le background script, on peut appeler :
- L'API InnerTube de YouTube (pour les transcriptions)
- L'API Jina Reader (pour convertir les pages web en Markdown)

### Comment ça marcherait

```
┌──────────────────────────────────────────────────┐
│  Extension Chrome (IP de l'utilisateur)           │
│                                                   │
│  1. Utilisateur ajoute une URL                    │
│  2. Background script extrait le contenu :        │
│     - YouTube → InnerTube API → transcription     │
│     - Page web → Jina Reader API → Markdown       │
│  3. Envoie le résultat au serveur en POST         │
│     { url, title, channel, transcript, ... }      │
└──────────────────────┬────────────────────────────┘
                       │ POST /api/x10/add-content
                       ▼
┌──────────────────────────────────────────────────┐
│  Serveur (ne contacte JAMAIS YouTube ni Jina)    │
│                                                  │
│  Reçoit le contenu déjà extrait → stocke en DB   │
│  Zéro requête externe = zéro risque de ban       │
└──────────────────────────────────────────────────┘
```

**Point clé pour Jina Reader** : les requêtes partent de l'IP de chaque utilisateur. Jina rate-limite par IP (10 000 req/60s) et par clé API. Sans clé API, chaque utilisateur a ses propres 20 RPM — largement suffisant pour un usage individuel. Avec une clé API partagée dans l'extension, on aurait 500 RPM mutualisés, mais les IPs seraient distribuées. Dans les deux cas, c'est bien mieux qu'un seul serveur qui centralise tout.

### Avantages

- **Chaque utilisateur utilise sa propre IP** → pas de ban centralisé, scalabilité infinie
- **Jina Reader distribué** — chaque utilisateur appelle Jina depuis sa propre IP, le rate limit de 20 RPM (sans clé) s'applique par utilisateur, pas sur une seule IP serveur
- **Le serveur ne fait aucune requête externe** → il ne peut pas être banni
- **Les collections ne sont pas affectées** — l'extraction se fait item par item, la collection est juste un regroupement côté serveur. Que le contenu vienne du front ou du back, le résultat est le même
- **Gratuit** — aucun service externe payant nécessaire

### Et le site web (formulaire) ?

Découverte importante : **Jina Reader supporte CORS**. Il renvoie `Access-Control-Allow-Origin` pour n'importe quel domaine. Ça veut dire que le formulaire du site web peut appeler Jina Reader **directement depuis le navigateur du visiteur**, sans passer par le serveur.

```
┌──────────────────────────────────────────────────┐
│  Navigateur du visiteur (formulaire web)          │
│                                                   │
│  Page web ajoutée :                               │
│    → JS appelle r.jina.ai depuis le browser       │
│    → IP du visiteur, pas du serveur               │
│    → Résultat envoyé au serveur en POST           │
│                                                   │
│  Vidéo YouTube ajoutée :                          │
│    → CORS bloqué par YouTube (403 sur preflight)  │
│    → Le serveur doit faire la requête InnerTube   │
└──────────────────────────────────────────────────┘
```

| Source | Formulaire web (front) | Extension | Serveur (backend) |
|--------|----------------------|-----------|-------------------|
| **Page web → Jina** | **OUI** (CORS OK) | OUI | OUI (mais centralise l'IP) |
| **YouTube → InnerTube (player)** | **NON** (CORS bloqué) | OUI | OUI (mais centralise l'IP) |
| **YouTube → timedtext (captions)** | **OUI** (CORS OK !) | OUI | OUI |

### Découverte : l'endpoint `timedtext` supporte CORS

L'extraction InnerTube se fait en deux étapes :
1. **POST** vers `/youtubei/v1/player` avec le `videoId` → retourne les métadonnées + l'URL des sous-titres (signée, non prédictible)
2. **GET** vers l'URL `timedtext` retournée → le XML des sous-titres

L'URL des sous-titres contient des paramètres dynamiques et signés (`ei`, `expire`, `sig`...) — **impossible de la deviner depuis le videoId seul**. L'étape 1 est donc obligatoire.

**Mais** : l'endpoint `timedtext` (étape 2) renvoie `Access-Control-Allow-Origin` pour n'importe quel domaine. Testé avec `Origin: https://straighttoyour.ai` → réponse 200 avec les bons headers CORS.

### Schéma hybride possible pour YouTube

```
┌──────────────────────────────────────────────────┐
│  Serveur (étape 1 — légère)                       │
│                                                   │
│  POST /youtubei/v1/player → obtient l'URL caption │
│  Renvoie l'URL au navigateur                      │
│  (requête légère : ~1-2 Ko utile)                 │
└──────────────────────┬────────────────────────────┘
                       │ URL timedtext
                       ▼
┌──────────────────────────────────────────────────┐
│  Navigateur du visiteur (étape 2 — le gros)       │
│                                                   │
│  GET timedtext URL → XML des sous-titres          │
│  IP du visiteur, pas du serveur                   │
│  CORS OK sur cet endpoint !                       │
│  Renvoie le XML au serveur                        │
└──────────────────────────────────────────────────┘
```

**Avantages du schéma hybride :**
- L'étape 1 (player API) reste sur le serveur mais c'est une requête légère
- L'étape 2 (téléchargement du contenu) se fait depuis l'IP de chaque visiteur
- YouTube ne voit le serveur que pour les appels player, pas pour le téléchargement
- Divise par deux l'empreinte du serveur auprès de YouTube

**Conséquence pour le jour du lancement :**
- Les pages web peuvent être extraites côté front depuis le formulaire → zéro charge serveur, zéro risque de ban Jina
- Les vidéos YouTube : le serveur fait seulement l'appel player (léger), le navigateur télécharge les sous-titres directement → charge serveur réduite, WARP en filet de sécurité
- L'extension gère tout sans problème (pas de CORS)

### Pour les pages web : Jina Reader reste nécessaire

Convertir du HTML en Markdown propre (tableaux, listes, images, nettoyage du bruit, pages JS-rendered) est un vrai défi. C'est exactement ce que fait Jina Reader. Réimplémenter ça dans l'extension serait un projet en soi.

La différence clé : au lieu que le **serveur** appelle Jina (1 IP, rate-limited), c'est **l'extension de chaque utilisateur** qui appelle Jina (N IPs distribuées). Le rate limit par IP (20 RPM sans clé) est largement suffisant pour un usage individuel — personne ne convertit 20 pages par minute.

---

## 5. Les proxies Webshare datacenter marchent-ils ?

### Pour YouTube InnerTube : NON

Les proxies datacenter Webshare **ne fonctionnent pas** avec YouTube. C'est documenté :

- Un utilisateur a testé 100 proxies datacenter Webshare → **seulement 30 fonctionnaient**, les 70 autres étaient bloqués
- L'issue [#511](https://github.com/jdepoix/youtube-transcript-api/issues/511) de `youtube-transcript-api` montre un utilisateur bloqué même avec `proxy.webshare.io`
- YouTube bloque les ranges IP de datacenters connus — Webshare inclus

Webshare propose un **"YouTube Proxy Plan"** spécifique (via leur équipe commerciale), mais c'est un produit séparé des proxies datacenter classiques.

**Conclusion : les 500 proxies datacenter Webshare sont inutiles pour InnerTube.**

### Pour Jina Reader : OUI (probablement)

Jina Reader ne bloque pas les IPs de datacenters. Les proxies Webshare pourraient servir à distribuer les requêtes Jina si besoin, mais c'est un plan de secours — l'extraction côté extension est la meilleure solution.

---

## 6. Cloudflare WARP : c'est quoi et combien ça coûte ?

### C'est quoi ?

Cloudflare WARP est un VPN gratuit basé sur WireGuard, fourni par Cloudflare. Il remplace l'IP de sortie par une **IP Cloudflare**. L'intérêt : YouTube ne bloque pas les IPs Cloudflare, car Cloudflare est un partenaire réseau majeur.

Sur un serveur Linux, ça s'installe via le client `warp-cli` ou via un container Docker (WireGuard + Squid). On peut configurer le routage pour que **seules les requêtes vers YouTube** passent par WARP, le reste du trafic restant sur l'IP normale du serveur.

### Comment ça marche concrètement

```
┌──────────────────────────────────────────────────┐
│  Serveur                                          │
│                                                   │
│  Requête InnerTube → WireGuard tunnel → Cloudflare│
│                                        IP WARP    │
│                                        (pas bannie)│
│                                                   │
│  Tout le reste   → IP normale du serveur          │
└──────────────────────────────────────────────────┘
```

YouTube voit une IP Cloudflare au lieu de l'IP du datacenter → pas de ban.

### Combien ça coûte ?

| Offre | Prix | Détail |
|-------|------|--------|
| **WARP gratuit** | **$0** | Données illimitées, fonctionne sur desktop et mobile |
| **WARP+** | ~$5/mois | Routage optimisé (plus rapide), pas nécessaire pour notre usage |
| **Zero Trust (50 users)** | **$0** | Tier gratuit, suffisant pour un serveur unique |
| **Zero Trust (payant)** | $7/user/mois | Pour les organisations, pas nécessaire ici |

**Pour notre cas : c'est gratuit.** On installe WARP sur le serveur, on route le trafic YouTube à travers, et c'est tout.

### Limites et risques

- **Fiabilité incertaine à long terme** — En août 2025, certains utilisateurs rapportent des erreurs 403 intermittentes même avec WARP. Ça marche la plupart du temps, mais pas 100%
- **YouTube évolue en permanence** — C'est un jeu du chat et de la souris. YouTube pourrait décider de bloquer les IPs Cloudflare demain
- **Pas conçu pour ça** — WARP est un VPN grand public. Les ToS de Cloudflare interdisent l'usage de leurs services pour du scraping automatisé. En pratique, personne ne semble avoir été banni pour ça, mais le risque théorique existe
- **Speed cap sur le tier gratuit** — Cloudflare throttle le free tier à environ 20 Mbit/s. Pour des requêtes API légères (quelques Ko de JSON/XML), c'est largement suffisant
- **Pas de ban connu pour heavy usage** — Aucun cas documenté de ban WARP pour usage intensif côté serveur. Mais Cloudflare se réserve le droit de couper l'accès à tout moment ("at any time in its sole discretion")
- **Le projet Invidious** (front-end YouTube alternatif) utilise des approches similaires. Leur doc confirme que les IPs datacenter sont bloquées et recommande WARP ou la rotation IPv6

### Peut-on tout passer par WARP ?

**En théorie, oui.** On installe WARP sur le serveur, on route les requêtes YouTube à travers, et les requêtes Jina Reader n'en ont pas besoin (pas de blocage datacenter chez Jina).

**En pratique, c'est risqué comme solution unique** :
- Si WARP tombe ou si YouTube bloque les IPs Cloudflare → retour à la case départ
- On reste dépendant d'un service gratuit tiers sans SLA ni garantie
- Tout le trafic passe par un seul point (WARP) → single point of failure

### Verdict

WARP est une **excellente solution de secours gratuite et immédiate**. On l'installe en 10 minutes, ça marche, c'est gratuit. Mais ce n'est pas une architecture robuste pour la production à long terme — c'est un plan B.

**L'extraction côté extension reste la vraie solution structurelle** : zéro dépendance à un VPN tiers, zéro single point of failure, scalabilité infinie.

La bonne stratégie : **WARP en filet de sécurité pour le backend (démo), extraction côté extension pour le trafic réel.**

---

## 7. Plan d'action par phase

### Phase 1 — Avant le lancement (priorité haute)

| Action | Effort | Impact |
|--------|--------|--------|
| Créer une clé API Jina gratuite, l'ajouter au `.env` | 5 min | 20 → 500 RPM |
| Cache des transcriptions déjà extraites (même vidéo = 1 seule requête InnerTube) | Faible | Réduit le volume de 30-50% |
| Vérifier que le serveur n'est pas sur un datacenter blacklisté par YouTube | 5 min | Évite les mauvaises surprises |

### Phase 2 — Extraction côté extension (avant le lancement idéalement)

| Action | Effort | Impact |
|--------|--------|--------|
| Ajouter l'extraction InnerTube dans le background script de l'extension | Moyen | Zéro requête YouTube depuis le serveur pour les users extension |
| Ajouter l'appel Jina Reader dans l'extension (pages web → Markdown) | Moyen | Requêtes Jina distribuées sur les IPs utilisateurs |
| Créer un endpoint `POST /api/x10/add-content` qui reçoit le contenu pré-extrait | Faible | Le serveur stocke sans extraire |
| Rate-limiter l'extraction backend (démo) : max 3 collections/jour sans extension | Faible | Protège le serveur |

### Phase 3 — Si ça explose (solutions de secours)

| Action | Effort | Impact |
|--------|--------|--------|
| Cloudflare WARP devant les requêtes InnerTube du backend | Faible | YouTube ne bloque pas les IPs Cloudflare |
| Proxy résidentiel rotatif (Webshare, etc.) | Moyen | 85-95% de succès |
| Self-host Jina Reader (Docker) | Moyen | Plus de limites sur la conversion web |
| Passer Jina au tier payant | Nul | 50 concurrentes, ~$0.02/M tokens |

---

## 8. Alternatives à Jina Reader (si besoin de self-host)

| Outil | Self-hosted | Gratuit | Note |
|-------|-------------|---------|------|
| **Jina Reader Docker** | Oui | Oui (Apache-2.0) | Drop-in replacement de `r.jina.ai` |
| **Crawl4AI** | Oui | Oui | #1 open-source, async, LLM-optimized |
| **Firecrawl** | Oui (limité) | Open source | Rich features, API-first |
| **ReaderLM-v2** | Oui | Oui (modèle 1.5B) | Qualité ML, besoin d'un GPU |
| **DIY Playwright + html2text** | Oui | Oui | Contrôle total, plus de travail |

---

## 9. Recommandation finale

**L'architecture cible est claire : extraction côté extension, backend en fallback limité.**

C'est la seule approche qui scale sans limites et sans coût. Le serveur devient un simple stockage — il ne contacte jamais les services externes pour les utilisateurs de l'extension.

Le backend garde une capacité d'extraction limitée pour la démo du site web (avec Jina + InnerTube), protégée par un rate limit strict et une clé API Jina.

Si le lancement est imminent, la Phase 1 (clé API Jina + cache) est le minimum vital. La Phase 2 (extraction côté extension) est ce qui permet de vraiment scaler.

---

## Sources

### Jina Reader
- [Jina Reader API — Page officielle](https://jina.ai/reader/)
- [Jina Reader GitHub](https://github.com/jina-ai/reader)
- [Jina Reader pricing discussion (Issue #1145)](https://github.com/jina-ai/reader/issues/1145)
- [Jina AI Reader — Simon Willison's analysis](https://simonwillison.net/2024/Jun/16/jina-ai-reader/)
- [Self-hosted Jina Reader Docker](https://github.com/open-webui/open-webui/discussions/5789)
- [Jina AI vs. Firecrawl comparison](https://blog.apify.com/jina-ai-vs-firecrawl/)

### InnerTube / YouTube — Général
- [Can YouTube IP Ban You? 2026 Guide](https://multilogin.com/blog/youtube-ip-ban/)
- [Fixing YouTube Transcript API RequestBlocked Error](https://medium.com/@lhc1990/fixing-youtube-transcript-api-requestblocked-error-a-developers-guide-83c77c061e7b)
- [youtube-transcript-api — Request limits discussion (Issue #66)](https://github.com/jdepoix/youtube-transcript-api/issues/66)
- [youtube-transcript-api — Cloud IP blocking (Issue #303)](https://github.com/jdepoix/youtube-transcript-api/issues/303)
- [youtube-transcript-api — Blocking with Webshare (Issue #511)](https://github.com/jdepoix/youtube-transcript-api/issues/511)
- [yt-dlp — IP blocked by YouTube (Issue #9890)](https://github.com/yt-dlp/yt-dlp/issues/9890)
- [YouTube Proxy: Prevent Server IP Blocks](https://proxy001.com/blog/youtube-proxy-prevent-server-ip-blocks-after-deploying-yt-dlp-style-server-workloads)
- [Leveraging Cloudflare WARP to bypass YouTube API Restrictions](https://blog.arfevrier.fr/leveraging-cloudflare-warp-to-bypass-youtubes-api-restrictions/)
- [Hacker News — YouTube cracking down on yt-dlp](https://news.ycombinator.com/item?id=43398222)
- [InnerTube NuGet Package (rate limit documentation)](https://www.nuget.org/packages/InnerTube)

### YouTube Player API — Spécifique
- [yt-dlp Extractors Wiki — Seuils et recommandations](https://github.com/yt-dlp/yt-dlp/wiki/Extractors)
- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- [yt-dlp Issue #7143 — HTTP 429 behavior](https://github.com/yt-dlp/yt-dlp/issues/7143)
- [yt-dlp Issue #9427 — Rate limiting details](https://github.com/yt-dlp/yt-dlp/issues/9427)
- [yt-dlp Issue #10128 — Player endpoint failures](https://github.com/yt-dlp/yt-dlp/issues/10128)
- [yt-dlp Issue #12563 — DRM on TV client](https://github.com/yt-dlp/yt-dlp/issues/12563)
- [yt-dlp commit — Default clients update (Jan 2026)](https://github.com/yt-dlp/yt-dlp/commit/23b846506378a6a9c9a0958382d37f943f7cfa51)
- [Invidious — YouTube Errors Explained](https://docs.invidious.io/youtube-errors-explained/)
- [Invidious Issue #1981 — Rate limits](https://github.com/iv-org/invidious/issues/1981)
- [Invidious Issue #4978 — Datacenter IP blocking](https://github.com/iv-org/invidious/issues/4978)
- [YouTube.js Issue #602 — HTML responses](https://github.com/LuanRT/YouTube.js/issues/602)
- [NewPipe Issue #8190 — Bot detection](https://github.com/TeamNewPipe/NewPipe/issues/8190)
- [Cisco — YouTube bot warning for Secure Access](https://community.cisco.com/t5/secure-access-announcements/youtube-com-bot-warning-message-for-secure-access-swg/ta-p/5229828)
- [Hacker News — InnerTube A/B testing](https://news.ycombinator.com/item?id=43324384)
- [Cobalt Issue #551 — Player restrictions](https://github.com/imputnet/cobalt/issues/551)

### Webshare / Proxies
- [youtube-transcript-api — Blocking with Webshare (Issue #511)](https://github.com/jdepoix/youtube-transcript-api/issues/511)
- [BlackHatWorld — Webshare datacenter proxies for YouTube](https://www.blackhatworld.com/seo/need-suggestions-for-youtube-scraping-proxy.1743759/)
- [Webshare YouTube Proxies — Help Center](https://help.webshare.io/en/articles/11432234-youtube-proxies)

### Cloudflare WARP
- [Leveraging Cloudflare WARP to bypass YouTube API Restrictions](https://blog.arfevrier.fr/leveraging-cloudflare-warp-to-bypass-youtubes-api-restrictions/)
- [WARP Review 2026 — Is It Really Free & Safe?](https://www.vpnmentor.com/reviews/warp-by-cloudflare/)
- [Cloudflare WARP Architecture docs](https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/warp/configure-warp/route-traffic/warp-architecture/)
- [WARP and YouTube — Cloudflare Community](https://community.cloudflare.com/t/warp-and-youtube/651109)

### Alternatives
- [Crawl4AI — Open-source web crawler for LLMs](https://openalternative.co/alternatives/jina)
- [Best Jina.ai alternatives (Apify)](https://apify.com/alternatives/jina-ai-alternatives)
