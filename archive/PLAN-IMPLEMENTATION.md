# Plan d'implémentation x10tube

## Vue d'ensemble

**Objectif** : Créer un agrégateur de transcripts YouTube qui génère des pages publiques consultables par humains (HTML) et LLM (Markdown).

**État actuel** :
- Extension Chrome basique existante (extraction de sous-titres YouTube)
- Aucun backend
- L'extension n'est pas connectée à un service x10tube

**À créer** :
- Backend complet Node.js + Hono
- Base de données SQLite
- Frontend Pug + Tailwind
- Refonte de l'extension Chrome pour intégration

---

## Phase 1 : Infrastructure et Setup (Fondations)

### 1.1 Initialisation du projet backend

```
/server
├── src/
│   ├── index.ts           # Point d'entrée Hono
│   ├── db.ts              # Configuration SQLite
│   ├── routes/
│   │   ├── index.ts       # Route /
│   │   ├── auth.ts        # Routes /login, /logout
│   │   ├── dashboard.ts   # Route /dashboard
│   │   ├── x10.ts         # Routes /s/:id, /s/:id.md
│   │   └── api.ts         # API pour extension
│   ├── services/
│   │   ├── transcript.ts  # Extraction YouTube
│   │   ├── auth.ts        # Magic link / sessions
│   │   └── x10.ts         # CRUD x10s
│   ├── middleware/
│   │   └── auth.ts        # Middleware auth
│   └── views/             # Templates Pug
│       ├── layout.pug
│       ├── landing.pug
│       ├── login.pug
│       ├── dashboard.pug
│       └── x10.pug
├── public/
│   └── styles.css         # CSS généré par Tailwind
├── package.json
├── tsconfig.json
├── nodemon.json
└── tailwind.config.js
```

**Tâches** :
- [ ] Créer la structure de dossiers `/server`
- [ ] Initialiser package.json avec les dépendances
- [ ] Configurer TypeScript (tsconfig.json)
- [ ] Configurer Nodemon pour hot reload
- [ ] Configurer Tailwind CSS avec séparateur `_`
- [ ] Créer le fichier d'entrée Hono de base

**Dépendances** :
```bash
# Production
hono better-sqlite3 pug nanoid

# Développement
typescript tsx nodemon tailwindcss @types/node @types/better-sqlite3
```

### 1.2 Base de données SQLite

**Tâches** :
- [ ] Créer `src/db.ts` avec initialisation des tables
- [ ] Table `users` (id, email, created_at)
- [ ] Table `x10s` (id, user_id nullable, title, created_at, updated_at)
- [ ] Table `videos` (id, x10_id, url, youtube_id, title, channel, duration, transcript, added_at)
- [ ] Ajouter `x10tube.db` au `.gitignore`

**Schema** :
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE x10s (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  x10_id TEXT NOT NULL,
  url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  duration TEXT,
  transcript TEXT,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (x10_id) REFERENCES x10s(id) ON DELETE CASCADE
);
```

---

## Phase 2 : Service d'extraction de transcripts

### 2.1 Module d'extraction YouTube

**Tâches** :
- [ ] Créer `src/services/transcript.ts`
- [ ] Implémenter l'extraction via YouTube InnerTube API (`/player` endpoint)
- [ ] Parser les caption tracks pour obtenir l'URL des sous-titres
- [ ] Télécharger et parser le XML des sous-titres
- [ ] Extraire les métadonnées vidéo (titre, chaîne, durée)
- [ ] Gérer les erreurs (vidéo sans sous-titres, vidéo privée, etc.)

**Interface** :
```typescript
interface VideoInfo {
  youtubeId: string;
  url: string;
  title: string;
  channel: string;
  duration: string;
  transcript: string;
}

async function extractVideoInfo(youtubeUrl: string): Promise<VideoInfo>
```

**Méthode** :
1. Extraire l'ID vidéo de l'URL
2. Appeler `/youtubei/v1/player` avec l'API InnerTube
3. Récupérer `captionTracks` depuis la réponse
4. Télécharger le XML des sous-titres (première piste disponible)
5. Parser le XML et extraire le texte
6. Retourner les métadonnées + transcript

---

## Phase 3 : Routes et pages web

### 3.1 Landing page (`/`)

**Tâches** :
- [ ] Créer `src/routes/index.ts`
- [ ] Créer `src/views/landing.pug`
- [ ] Champ textarea pour coller 1-10 URLs
- [ ] Bouton "Create my x10"
- [ ] Section "Why x10tube?"
- [ ] Section "How it works"
- [ ] Section exemples (x10s publics)
- [ ] FAQ
- [ ] Appliquer la direction artistique (Tailwind, style indie)

**Flow** :
1. Utilisateur colle des URLs
2. POST vers `/api/x10/create`
3. Backend extrait les transcripts
4. Création d'un x10 orphelin (pas de user_id)
5. Redirect vers `/s/:id`

### 3.2 Page x10 (`/s/:id`)

**Tâches** :
- [ ] Créer `src/routes/x10.ts`
- [ ] Créer `src/views/x10.pug`
- [ ] Afficher le titre du x10 (éditable si propriétaire)
- [ ] Liste des vidéos avec titre, chaîne, durée
- [ ] Accordéon "Show transcript" pour chaque vidéo
- [ ] Boutons "Open in Claude" / "Open in ChatGPT"
- [ ] Bouton "Copy .md link"
- [ ] Afficher le nombre de tokens estimé
- [ ] Formulaire "Add a video" (si propriétaire ou orphelin)
- [ ] Boutons de suppression [x] par vidéo (si propriétaire)
- [ ] Bouton "Copy to my account" (si connecté mais pas propriétaire)
- [ ] Logique de réclamation d'orphelin

**Comportement selon droits** :
| Action | Propriétaire | Non proprio connecté | Non connecté |
|--------|--------------|---------------------|--------------|
| Modifier titre | Oui | Non | Non |
| Ajouter vidéo | Oui | Non | Login → réclame |
| Supprimer vidéo | Oui | Non | Login → réclame |
| Copy to account | Non | Oui | Login |

### 3.3 Page Markdown (`/s/:id.md`)

**Tâches** :
- [ ] Route qui retourne du `text/markdown`
- [ ] Format structuré pour LLM :

```markdown
# [Title]

## Videos included
1. [Video title 1] — [Channel] — [Duration]
2. [Video title 2] — [Channel] — [Duration]

---

## Transcripts

### 1. [Video title 1]
**Channel**: [name]
**Duration**: [duration]
**URL**: [YouTube link]

[Full transcript]

---

*Generated by x10tube — [date]*
```

### 3.4 Dashboard (`/dashboard`)

**Tâches** :
- [ ] Créer `src/routes/dashboard.ts`
- [ ] Créer `src/views/dashboard.pug`
- [ ] Protéger la route (middleware auth)
- [ ] Liste des x10s de l'utilisateur
- [ ] Pour chaque x10 : titre, date, nb vidéos, tokens estimés
- [ ] Actions : Open, Claude, ChatGPT, Copy link, Delete
- [ ] Bouton "+ New" avec modal
- [ ] État vide avec CTA

### 3.5 Layout et composants Pug

**Tâches** :
- [ ] `layout.pug` : structure HTML de base, header, footer
- [ ] Header : logo "x10tube", lien login/dashboard
- [ ] Footer minimal
- [ ] Styles Tailwind avec séparateur `_`
- [ ] Logo textuel : `x10` noir + `tube` rouge

---

## Phase 4 : Authentification

### 4.1 Magic Link (MVP)

**Tâches** :
- [ ] Créer `src/services/auth.ts`
- [ ] Créer `src/routes/auth.ts`
- [ ] Page `/login` avec champ email
- [ ] Génération de token unique (nanoid)
- [ ] Stockage temporaire du token (table `magic_links` ou in-memory)
- [ ] Envoi d'email avec le lien (pour MVP : afficher le lien dans la console)
- [ ] Route `/auth/verify/:token` qui crée la session
- [ ] Middleware de session (cookie sécurisé)
- [ ] Route `/logout`

**Table magic_links** :
```sql
CREATE TABLE magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
```

### 4.2 Sessions

**Tâches** :
- [ ] Table `sessions` ou utiliser des JWT simples
- [ ] Cookie `x10_session` httpOnly, secure
- [ ] Middleware `requireAuth` pour routes protégées
- [ ] Helper `getCurrentUser(c)` pour obtenir l'utilisateur

---

## Phase 5 : API pour l'extension

### 5.1 Endpoints API

**Tâches** :
- [ ] Créer `src/routes/api.ts`
- [ ] `GET /api/x10s` : liste des x10s de l'utilisateur connecté
- [ ] `POST /api/x10/create` : créer un x10 (avec ou sans auth)
- [ ] `POST /api/x10/:id/add` : ajouter une vidéo (requiert auth + propriétaire)
- [ ] `DELETE /api/x10/:id/video/:videoId` : supprimer une vidéo
- [ ] `POST /api/x10/:id/claim` : réclamer un x10 orphelin
- [ ] `POST /api/x10/:id/fork` : copier un x10 dans son compte
- [ ] `DELETE /api/x10/:id` : supprimer un x10
- [ ] `PATCH /api/x10/:id` : modifier le titre
- [ ] Support CORS pour l'extension

**Authentification API** :
- Token dans header `Authorization: Bearer <token>`
- Ou cookie de session partagé

### 5.2 Réponses API

```typescript
// GET /api/x10s
{
  x10s: [
    { id: "abc123", title: "Startup Strategies", videoCount: 6, tokens: 45000, updatedAt: "..." }
  ]
}

// POST /api/x10/create
Request: { urls: ["https://youtube.com/..."] }
Response: { id: "abc123", url: "/s/abc123" }

// POST /api/x10/:id/add
Request: { url: "https://youtube.com/..." }
Response: { success: true, video: { ... } }
```

---

## Phase 6 : Refonte de l'extension Chrome

### 6.1 Architecture extension

```
/extension
├── manifest.json
├── background.js          # Service worker
├── content.js             # Injection YouTube
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── api.js                 # Client API x10tube
└── icons/
```

### 6.2 Popup extension

**Tâches** :
- [ ] Refaire `popup.html` selon les maquettes
- [ ] Afficher aperçu vidéo courante (si sur YouTube)
- [ ] Liste des x10s de l'utilisateur (via API)
- [ ] "+ Create a new x10"
- [ ] "→ My dashboard" ou "→ Log in"
- [ ] Coche à côté du x10 si vidéo déjà présente
- [ ] Toast "Added to [name]" après ajout

**États** :
- Non connecté : seulement "+ Create" et "→ Log in"
- Connecté, 0 x10 : seulement "+ Create" et "→ Dashboard"
- Connecté avec x10s : liste complète

### 6.3 Bouton intégré YouTube (dropdown)

**Tâches** :
- [ ] Injecter un bouton "x10" dans la barre d'actions YouTube
- [ ] Dropdown au clic avec la même interface que la popup
- [ ] Observer les changements de page (YouTube SPA)
- [ ] Re-injecter le bouton à chaque navigation

### 6.4 Authentification extension

**Tâches** :
- [ ] Stocker le token dans `chrome.storage.local`
- [ ] Popup de login qui redirige vers x10tube.com/login
- [ ] Callback pour récupérer le token après auth
- [ ] Ou : ouvrir x10tube.com/login dans un nouvel onglet, l'extension écoute le storage

### 6.5 Client API

**Tâches** :
- [ ] Créer `api.js` avec fonctions :
  - `getMyX10s()`
  - `createX10(urls)`
  - `addVideoToX10(x10Id, url)`
  - `checkVideoInX10s(videoUrl)`
- [ ] Gestion des erreurs et retry
- [ ] Base URL configurable (dev/prod)

---

## Phase 7 : Intégrations LLM

### 7.1 Boutons "Open in Claude/ChatGPT"

**Tâches** :
- [ ] Générer le prompt :
  ```
  Read https://x10tube.com/s/abc123.md
  which contains transcripts from multiple YouTube videos.
  Then answer my questions about this content.
  ```
- [ ] Claude : `https://claude.ai/new?q=...` (URL encoded)
- [ ] ChatGPT : `https://chat.openai.com/?q=...` (URL encoded)

### 7.2 Estimation tokens

**Tâches** :
- [ ] Fonction `estimateTokens(text)` (~4 chars = 1 token)
- [ ] Afficher sur la page x10 : "~45K tokens"
- [ ] Warning si > 100K tokens

---

## Phase 8 : Polish et production

### 8.1 Direction artistique

**Tâches** :
- [ ] Appliquer la palette Tailwind (gray-800, red-600, etc.)
- [ ] Logo textuel : "x10" + "tube" rouge
- [ ] Typographie système
- [ ] Boutons : primary (red), secondary (border), text link
- [ ] Cards avec border-gray-200, pas de shadow
- [ ] Espacement généreux
- [ ] Pas d'emoji, pas d'icônes décoratives

### 8.2 Responsive

**Tâches** :
- [ ] Mobile-first avec Tailwind
- [ ] Max-width 2xl (672px) pour le contenu
- [ ] Extension popup : 350px de large

### 8.3 Sécurité

**Tâches** :
- [ ] Rate limiting par IP (10 x10s/jour sans compte)
- [ ] Validation des URLs YouTube
- [ ] Sanitization des inputs
- [ ] CSRF protection
- [ ] Cookies httpOnly, secure, sameSite

### 8.4 Déploiement

**Tâches** :
- [ ] Configuration Railway
- [ ] Variables d'environnement (SESSION_SECRET, BASE_URL)
- [ ] Build TypeScript → JavaScript
- [ ] Domaine x10tube.com

### 8.5 Extension Chrome Web Store

**Tâches** :
- [ ] Mettre à jour manifest.json (nom, description, permissions)
- [ ] Screenshots pour le store
- [ ] Description et privacy policy
- [ ] Soumettre à la review

---

## Ordre d'implémentation recommandé

### Sprint 1 : MVP Backend (Semaine 1)
1. Setup projet (Phase 1.1)
2. Base de données (Phase 1.2)
3. Service transcript (Phase 2.1)
4. Landing page (Phase 3.1)
5. Page x10 HTML (Phase 3.2)
6. Page x10 Markdown (Phase 3.3)

**Livrable** : Créer un x10 sans compte, consulter la page, ouvrir dans Claude

### Sprint 2 : Auth + Dashboard (Semaine 2)
1. Magic link auth (Phase 4.1)
2. Sessions (Phase 4.2)
3. Dashboard (Phase 3.4)
4. Actions d'édition sur page x10

**Livrable** : Se connecter, voir son dashboard, modifier ses x10s

### Sprint 3 : API + Extension (Semaine 3)
1. Endpoints API (Phase 5)
2. Refonte popup extension (Phase 6.2)
3. Client API extension (Phase 6.5)
4. Auth extension (Phase 6.4)

**Livrable** : Ajouter des vidéos depuis YouTube via l'extension

### Sprint 4 : Polish + Launch (Semaine 4)
1. Bouton intégré YouTube (Phase 6.3)
2. Intégrations LLM (Phase 7)
3. Direction artistique finale (Phase 8.1)
4. Sécurité et rate limiting (Phase 8.3)
5. Déploiement Railway (Phase 8.4)

**Livrable** : Produit complet prêt pour le lancement

---

## Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| API YouTube change | Extraction cassée | Plusieurs méthodes de fallback |
| Rate limit YouTube | Création lente | Cache des transcripts, extraction asynchrone |
| Extension rejetée | Pas de distribution | Respecter les policies Chrome |
| Claude ne lit pas l'URL | Feature principale cassée | Tester régulièrement, fallback copier-coller |

---

## Métriques de succès MVP

- [ ] Créer un x10 en < 30 secondes
- [ ] Extraction transcript réussie > 95% des vidéos avec sous-titres
- [ ] Page .md lisible par Claude sans erreur
- [ ] Extension fonctionne sur YouTube
- [ ] Temps de chargement page < 2 secondes

---

*Document généré le 21 janvier 2026*
