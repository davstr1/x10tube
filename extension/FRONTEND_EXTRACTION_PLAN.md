# Plan d'implémentation : Extraction 100% Frontend

## Objectif

Migrer **tous** les appels aux APIs externes (YouTube InnerTube + Jina Reader) du serveur vers l'extension Chrome. Le serveur devient un simple stockage — il ne contacte plus jamais YouTube ni Jina.

---

## Situation actuelle

```
┌─────────────────┐      POST /api/x10/add      ┌─────────────────┐
│   Extension     │ ──────── { url } ─────────▶ │     Serveur     │
│                 │                              │                 │
│  (envoie URL)   │                              │  Appelle YouTube│
│                 │                              │  Appelle Jina   │
│                 │                              │  Stocke résultat│
└─────────────────┘                              └─────────────────┘
```

**Problèmes** :
- Une seule IP serveur pour tous les appels → rate limiting / ban
- YouTube bloque les IPs datacenter sur l'API Player
- Scalabilité limitée pendant un lancement viral

---

## Architecture cible

```
┌─────────────────────────────────────────────────────────────────┐
│   Extension Chrome (IP de chaque utilisateur)                    │
│                                                                  │
│   1. Utilisateur ajoute une URL                                  │
│   2. Extension détecte le type (YouTube ou page web)             │
│   3. Extension extrait le contenu :                              │
│      - YouTube → InnerTube Player API → timedtext → transcript   │
│      - Page web → Jina Reader API → Markdown                     │
│   4. Extension envoie le contenu extrait au serveur              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ POST /api/x10/add-content
                           │ { url, title, channel, content, type, ... }
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│   Serveur (ne contacte JAMAIS les APIs externes)                 │
│                                                                  │
│   Reçoit le contenu pré-extrait → valide → stocke en DB          │
│   Génère les pages Markdown → sert aux LLMs                      │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages** :
- Chaque utilisateur utilise sa propre IP → pas de ban centralisé
- Scalabilité infinie — le serveur ne fait que du stockage
- Gratuit — aucun proxy ou service payant nécessaire

---

## Étapes d'implémentation

### Phase 0 : Setup TypeScript + esbuild pour l'extension

L'extension est actuellement en JavaScript vanilla. On passe en TypeScript avec **esbuild** comme bundler.

#### Pourquoi esbuild (et pas juste tsc) ?

Les extensions Chrome ont des contraintes spécifiques :
- Les **content scripts** ne supportent **pas** les ES modules (`import`/`export`)
- Les **service workers** peuvent utiliser les modules, mais `importScripts()` ne fonctionne plus
- Le popup charge les scripts via `<script>` tags classiques

**Solution** : esbuild compile le TypeScript ET bundle chaque point d'entrée en un seul fichier IIFE (Immediately Invoked Function Expression), compatible avec tous les contextes Chrome.

#### 0.1 Structure cible

```
extension/
├── src/                    # Sources TypeScript (non chargeable dans Chrome)
│   ├── background.ts       # Entry point: service worker
│   ├── content.ts          # Entry point: content script
│   ├── popup.ts            # Entry point: popup
│   ├── lib/
│   │   ├── innertube.ts    # Extraction YouTube
│   │   ├── jina.ts         # Extraction Jina Reader
│   │   ├── api.ts          # API client (migré)
│   │   ├── config.ts       # Config loader
│   │   └── types.ts        # Types partagés
├── dist/                   # Extension buildée (chargeable dans Chrome après npm run dev)
│   ├── background.js       # Bundle IIFE
│   ├── content.js          # Bundle IIFE
│   ├── popup.js            # Bundle IIFE
│   ├── manifest.json       # Copié par npm run dev
│   ├── popup/              # Copié par npm run dev
│   └── icons/              # Copié par npm run dev
├── popup/                  # Sources statiques
│   ├── popup.html
│   └── popup.css
├── icons/
├── manifest.json           # Source du manifest
├── tsconfig.json
├── package.json
└── build.mjs               # Script de build esbuild
```

**Note** : Pendant le développement, charger `extension/dist/` dans Chrome, pas `extension/`.

#### 0.2 Créer `extension/package.json`

```json
{
  "name": "x10tube-extension",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "dev": "npm run copy-static && npm run watch",
    "copy-static": "mkdir -p dist && cp -r popup icons manifest.json dist/ && cp claude-inject.js dist/ 2>/dev/null || true",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

**Scripts** :
- `npm run build` — Build une fois (pour CI/CD)
- `npm run dev` — Copie les fichiers statiques + watch (pour développement)
- `npm run typecheck` — Vérifie les types sans générer de fichiers

#### 0.3 Créer `extension/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "noEmit": true,
    "types": ["chrome"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Note** : `noEmit: true` car c'est esbuild qui génère le JS, pas tsc. TypeScript sert uniquement au type-checking.

#### 0.4 Créer `extension/build.mjs`

```javascript
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

// Lire l'URL de base depuis la variable d'environnement (défaut: localhost)
const baseUrl = process.env.STYA_BASE_URL || 'http://localhost:3000';

const buildOptions = {
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/popup.ts',
  ],
  outdir: 'dist',
  bundle: true,
  format: 'iife',          // Pas de modules, compatible partout
  target: 'chrome120',
  sourcemap: true,
  minify: false,           // Garder lisible pour debug
  logLevel: 'info',
  define: {
    // Injecter la config au moment du build
    '__STYA_BASE_URL__': JSON.stringify(baseUrl),
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log(`Built with STYA_BASE_URL=${baseUrl}`);
}
```

#### 0.5 Mettre à jour `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "StraightToYourAI",
  "version": "4.0",
  "description": "A page, a video, a document... to your AI",
  "permissions": ["activeTab", "scripting", "storage", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["*://*.youtube.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Changements clés** :
- Plus de `config.js` séparé — la config est intégrée dans chaque bundle
- Plus de préfixe `dist/` — les fichiers JS sont à la racine après le build
- Version bump à 4.0 (changement majeur d'architecture)
- Toutes les permissions et icons conservés

#### 0.6 Mettre à jour `extension/popup/popup.html`

```html
<!-- Avant -->
<script src="../config.js"></script>
<script src="../api.js"></script>
<script src="popup.js"></script>

<!-- Après (dans dist-extension, popup.js est au même niveau que popup/) -->
<script src="../popup.js"></script>
```

Un seul script qui contient tout (config, api, popup). Le chemin `../popup.js` fonctionne car après le build, la structure est :
```
dist-extension/dev/
├── popup/
│   ├── popup.html    ← charge ../popup.js
│   └── popup.css
├── popup.js          ← ici
├── background.js
├── content.js
└── ...
```

#### 0.7 Créer `extension/src/lib/config.ts`

```typescript
// La config est injectée au build par esbuild (voir build.mjs)
// __STYA_BASE_URL__ est remplacé par la vraie valeur au moment du build

declare const __STYA_BASE_URL__: string;

export const config = {
  baseUrl: __STYA_BASE_URL__,  // Injecté par esbuild --define
};
```

**Note développeur** : Pour le développement local, lancer simplement `npm run build` dans `extension/` (utilise localhost par défaut). Pour changer l'URL : `STYA_BASE_URL=https://example.com npm run build`.

#### 0.7.1 Workflow de développement

**Important** : Le dossier `extension/` n'est plus directement chargeable dans Chrome (le manifest pointe vers des fichiers qui sont dans `dist/`). Il faut toujours builder.

**Workflow recommandé :**
```bash
# Terminal 1 : Watch + rebuild automatique
cd extension && npm run dev

# Le dossier extension/dist/ est maintenant chargeable dans Chrome
# (le script dev copie aussi les fichiers statiques)
```

**Pour ça, modifier `extension/package.json` :**
```json
"scripts": {
  "build": "node build.mjs",
  "watch": "node build.mjs --watch",
  "dev": "npm run copy-static && npm run watch",
  "copy-static": "mkdir -p dist && cp -r popup icons manifest.json dist/ && cp claude-inject.js dist/ 2>/dev/null || true"
}
```

**Après `npm run dev`**, la structure de `extension/dist/` est :
```
extension/dist/
├── background.js       ← généré par esbuild
├── content.js          ← généré par esbuild
├── popup.js            ← généré par esbuild
├── manifest.json       ← copié
├── popup/              ← copié
│   ├── popup.html
│   └── popup.css
├── icons/              ← copié
└── claude-inject.js    ← copié
```

**Charger `extension/dist/` dans Chrome** (pas `extension/`).

Pour la production, utiliser `npm run ext:build` depuis la racine.

#### 0.8 Modifier `scripts/build-extension.sh`

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_SRC="$PROJECT_DIR/extension"
DIST_DIR="$PROJECT_DIR/dist-extension"

# Charger les variables depuis .env
if [ -f "$PROJECT_DIR/.env" ]; then
  source "$PROJECT_DIR/.env"
fi

DEV_URL="${DEV_URL:-http://localhost:3000}"
PROD_URL="${PROD_URL:-https://straighttoyour.ai}"

# Installer les dépendances si nécessaire
if [ ! -d "$EXT_SRC/node_modules" ]; then
  echo "Installing extension dependencies..."
  cd "$EXT_SRC" && npm install
  cd "$PROJECT_DIR"
fi

# Nettoyer
rm -rf "$DIST_DIR"

for ENV in dev prod; do
  echo "Building $ENV extension..."

  # Déterminer l'URL
  if [ "$ENV" = "prod" ]; then
    URL="$PROD_URL"
  else
    URL="$DEV_URL"
  fi

  # Compiler TypeScript avec esbuild, en injectant la config via env var
  cd "$EXT_SRC"
  STYA_BASE_URL="$URL" npm run build

  # Copier vers dist-extension
  mkdir -p "$DIST_DIR/$ENV"
  cp -r dist/* "$DIST_DIR/$ENV/"
  cp -r popup icons manifest.json "$DIST_DIR/$ENV/"

  # Copier claude-inject.js (reste en vanilla JS)
  cp claude-inject.js "$DIST_DIR/$ENV/" 2>/dev/null || true

  cd "$PROJECT_DIR"
done

echo "Done! Extensions in dist-extension/dev and dist-extension/prod"
```

#### 0.9 Migrer les fichiers existants

**Ordre de migration** (chaque étape doit compiler avant de passer à la suivante) :

1. Créer `src/lib/types.ts` — interfaces partagées
2. Créer `src/lib/config.ts` — gestion de la config
3. Migrer `api.js` → `src/lib/api.ts`
4. Migrer `background.js` → `src/background.ts`
5. Migrer `content.js` → `src/content.ts`
6. Migrer `popup/popup.js` → `src/popup.ts`
7. Supprimer les anciens fichiers `.js`

#### 0.10 Fichiers à NE PAS migrer

- `claude-inject.js` — script injecté dans la page Claude, reste en JS vanilla (pas chargé par l'extension directement)

---

### Phase 1 : Extension — Extraction YouTube

#### 1.1 Créer le module d'extraction InnerTube

**Fichier** : `extension/src/lib/innertube.ts`

```typescript
// Types
interface TranscriptResult {
  transcript: string;
  title: string;
  channel: string;
  duration: number;
  language: string;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name: { simpleText: string };
}

// Fonction principale
export async function getTranscript(videoId: string): Promise<TranscriptResult>;
```

Fonctionnalités :
- `getTranscript(videoId)` — fonction principale, retourne un `TranscriptResult` typé
- POST vers `/youtubei/v1/player` avec le bon payload (client WEB puis ANDROID en fallback)
- Parser la réponse pour extraire `captions.playerCaptionsTracklistRenderer.captionTracks`
- GET vers l'URL timedtext retournée
- Parser le XML des sous-titres en texte

**Référence** : reprendre la logique de `server/src/services/transcript.ts` et l'adapter (pas de Node.js, le browser a fetch nativement)

**Points d'attention** :
- Gérer les vidéos sans sous-titres (captions désactivées, live streams)
- Gérer les langues multiples (prendre la première disponible ou la langue préférée)
- Gérer les erreurs (vidéo privée, supprimée, géobloquée)
- Inclure `visitorData` et les headers appropriés

#### 1.2 Intégrer dans le background script

**Fichier** : `extension/src/background.ts`

Modifier le flow actuel :
- Quand on reçoit un message `ADD_TO_COLLECTION` ou `QUICK_SEND` avec une URL YouTube
- Au lieu d'envoyer l'URL au serveur, appeler `getTranscript(videoId)`
- Envoyer le transcript extrait au serveur via le nouvel endpoint

---

### Phase 2 : Extension — Extraction Jina Reader

#### 2.1 Créer le module d'extraction Jina

**Fichier** : `extension/src/lib/jina.ts`

```typescript
// Types
interface JinaResult {
  content: string;   // Markdown
  title: string;
  description?: string;
  url: string;
}

// Fonction principale
export async function getMarkdown(url: string): Promise<JinaResult>;
```

Fonctionnalités :
- `getMarkdown(url)` — fonction principale, retourne un `JinaResult` typé
- GET vers `https://r.jina.ai/<url>` avec `Accept: application/json`
- Parser la réponse JSON pour extraire le contenu Markdown
- Gérer les erreurs (timeout, rate limit, page inaccessible)

**Note** : Jina Reader supporte CORS, donc même le content script pourrait l'appeler. Mais pour la cohérence, on garde tout dans le background script.

#### 2.2 Intégrer dans le background script

**Fichier** : `extension/src/background.ts`

Modifier le flow :
- Quand on reçoit une URL non-YouTube (page web)
- Appeler `getMarkdown(url)`
- Envoyer le Markdown extrait au serveur via le nouvel endpoint

---

### Phase 3 : Serveur — Nouvel endpoint

#### 3.0 Endpoints actuels (pour contexte)

| Endpoint | Rôle actuel |
|----------|-------------|
| `POST /api/x10/add` | Reçoit une URL, **le serveur extrait le contenu**, stocke en DB |
| `POST /api/x10/:id/add` | Ajoute une URL à une collection existante, **le serveur extrait** |
| `GET /api/x10s/by-code/:code` | Liste les collections d'un utilisateur |
| `GET /api/whoami` | Retourne le userCode depuis le cookie |

#### 3.1 Créer l'endpoint de réception

**Fichier** : `server/src/routes/api.ts`

Nouvel endpoint : `POST /api/x10/add-content`

Payload attendu :
```typescript
interface AddContentPayload {
  // Authentification (optionnel si cookie présent)
  userCode?: string;

  // Métadonnées
  url: string;
  title: string;
  type: 'youtube' | 'webpage';

  // YouTube spécifique
  youtube_id?: string;
  channel?: string;
  duration?: number;  // en secondes

  // Contenu extrait
  content: string;  // transcript ou markdown

  // Collection cible
  collectionId?: string;  // Si absent, ajoute à la dernière collection ou en crée une
  forceNew?: boolean;     // Force la création d'une nouvelle collection
}
```

Logique :
- Authentifier via cookie httpOnly OU `userCode` dans le payload
- Valider le payload (URL valide, contenu non vide, type reconnu)
- Si `collectionId` fourni → ajouter à cette collection
- Sinon si `forceNew` → créer nouvelle collection
- Sinon → ajouter à la dernière collection de l'utilisateur (ou en créer une)
- Recalculer le token count de la collection
- Retourner le succès avec l'ID de l'item et de la collection

#### 3.2 Sécuriser l'endpoint

- Rate limiting par userId (éviter le spam, suggestion : 100 items/heure)
- Validation de la taille du contenu (max 500KB par item)
- Sanitization du contenu (pas de scripts, pas de HTML dangereux dans le Markdown)

#### 3.3 Considération de sécurité importante

**On ne peut pas vérifier que le contenu correspond à l'URL.**

L'extension envoie `{ url: "...", content: "..." }`. Le serveur ne peut pas confirmer que le contenu vient vraiment de cette URL sans re-fetcher — ce qui annulerait tout l'intérêt de l'architecture.

**Décision** : On fait confiance à l'extension. C'est acceptable car :
1. L'extension est notre code, pas un tiers
2. Un utilisateur malveillant pourrait aussi créer du faux contenu via l'API actuelle
3. Le contenu n'est visible que par l'utilisateur lui-même et son LLM

**Ce qui reste protégé** :
- Rate limiting empêche le spam
- Taille max empêche les abus de stockage
- Sanitization empêche l'injection de code

---

### Phase 4 : Mise à jour du flow extension

#### 4.1 Modifier `content.ts`

Le content script ne change pas beaucoup — il détecte toujours les URLs et les envoie au background script.

#### 4.2 Modifier `background.ts`

Nouveau flow complet :

```typescript
import { config } from './lib/config';
import { getTranscript } from './lib/innertube';
import { getMarkdown } from './lib/jina';

// Pseudo-code du nouveau flow
async function handleAddUrl(
  url: string,
  options: { collectionId?: string; forceNew?: boolean } = {}
): Promise<void> {
  let content: string;
  let metadata: Record<string, unknown>;

  // 1. Extraire le contenu (côté extension = IP utilisateur)
  if (isYouTubeUrl(url)) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const result = await getTranscript(videoId);
    content = result.transcript;
    metadata = {
      type: 'youtube',
      youtube_id: videoId,
      title: result.title,
      channel: result.channel,
      duration: result.duration
    };
  } else {
    const result = await getMarkdown(url);
    content = result.content;
    metadata = {
      type: 'webpage',
      title: result.title
    };
  }

  // 2. Envoyer au serveur (contenu déjà extrait)
  const response = await fetch(`${config.baseUrl}/api/x10/add-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',  // Envoie le cookie httpOnly pour auth
    body: JSON.stringify({
      url,
      content,
      collectionId: options.collectionId,
      forceNew: options.forceNew,
      ...metadata
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to save content');
  }

  return response.json();
}
```

#### 4.3 Modifier `popup/popup.ts` (optionnel)

Le popup n'a pas besoin de changer fondamentalement — il appelle toujours le background script. Migration TypeScript optionnelle.

---

### Phase 5 : Nettoyage du serveur

#### 5.1 Supprimer les appels externes (optionnel mais recommandé)

**Fichiers concernés** :
- `server/src/services/transcript.ts` — peut être supprimé ou gardé comme fallback
- `server/src/services/content.ts` — idem

**Décision à prendre** : garder le code serveur comme fallback pour les utilisateurs sans extension (formulaire web) ou le supprimer complètement ?

**Recommandation** : garder en fallback très limité (rate-limité à quelques requêtes/jour) pour la démo du site, mais le désactiver facilement si nécessaire.

#### 5.2 Mettre à jour les routes existantes

**Fichier** : `server/src/routes/api.ts`

L'endpoint `POST /api/x10/add` actuel :
- Option A : le supprimer (breaking change pour l'extension actuelle)
- Option B : le garder mais le faire pointer vers le fallback limité
- Option C : le garder pour la rétrocompatibilité pendant la transition

**Recommandation** : Option C pendant la transition, puis Option A une fois l'extension mise à jour.

---

## Ordre d'exécution recommandé

1. **Phase 0** (setup TypeScript + esbuild) — Indispensable, migration du code existant
2. **Phase 1** (extraction YouTube) — Module `innertube.ts`, testable en isolation
3. **Phase 2** (extraction Jina) — Module `jina.ts`, testable en isolation
4. **Phase 3** (serveur) — Nouvel endpoint `/add-content`
5. **Phase 4** (intégration) — Connecter extraction → endpoint
6. **Phase 5** (nettoyage) — Supprimer le code serveur obsolète

**Pourquoi cet ordre ?**
- On ne peut pas tester l'endpoint serveur sans module d'extraction
- Les modules peuvent être testés unitairement avant intégration
- Le serveur est modifié en dernier pour minimiser les régressions

---

## Tests à effectuer

### Phase 0 — Build et compilation

- [ ] `npm install` dans `extension/` sans erreur
- [ ] `npm run build` compile sans erreur TypeScript
- [ ] Les fichiers `dist/background.js`, `dist/content.js`, `dist/popup.js` sont générés
- [ ] Charger l'extension dans Chrome (mode développeur) sans erreur
- [ ] Le popup s'ouvre et affiche les collections
- [ ] Le content script s'injecte sur YouTube

### Phases 1-2 — Tests des modules d'extraction

- [ ] `getTranscript()` avec une vidéo ayant des sous-titres
- [ ] `getTranscript()` avec une vidéo sans sous-titres → erreur claire
- [ ] `getTranscript()` avec une vidéo privée → erreur claire
- [ ] `getTranscript()` avec un videoId invalide → erreur claire
- [ ] `getMarkdown()` avec une page standard
- [ ] `getMarkdown()` avec une page JS-rendered (SPA)
- [ ] `getMarkdown()` avec une URL invalide → erreur claire
- [ ] `getMarkdown()` avec un timeout (page très lente)

### Phase 3 — Tests du nouvel endpoint serveur

- [ ] `POST /api/x10/add-content` avec payload YouTube valide → item créé
- [ ] `POST /api/x10/add-content` avec payload webpage valide → item créé
- [ ] `POST /api/x10/add-content` avec `collectionId` → ajouté à la bonne collection
- [ ] `POST /api/x10/add-content` avec `forceNew: true` → nouvelle collection créée
- [ ] `POST /api/x10/add-content` sans `collectionId` → ajouté à la dernière collection
- [ ] `POST /api/x10/add-content` avec contenu > 500KB → rejeté (413)
- [ ] `POST /api/x10/add-content` sans authentification → rejeté (401)
- [ ] Rate limiting fonctionne (101ème requête en 1h → rejeté)

### Phase 4 — Tests d'intégration

- [ ] Ajouter une vidéo YouTube via l'extension → contenu stocké correctement
- [ ] Ajouter une page web via l'extension → contenu stocké correctement
- [ ] Ajouter à une collection existante → collection mise à jour, token count recalculé
- [ ] Quick send vers Claude → prompt correct avec le contenu
- [ ] Erreur d'extraction → message affiché à l'utilisateur

### Tests de non-régression

- [ ] Les collections existantes restent accessibles
- [ ] Le formulaire web continue de fonctionner (fallback serveur)
- [ ] Le sync entre appareils fonctionne toujours

### Tests de charge (optionnel)

- [ ] Ajouter 10 vidéos rapidement → pas de rate limiting (IP utilisateur)
- [ ] Ajouter 50 pages web rapidement → pas de rate limiting Jina (IP utilisateur)

---

## Fichiers impactés

### Extension — Setup TypeScript + esbuild (Phase 0)

| Fichier | Action |
|---------|--------|
| `extension/package.json` | **Créer** — npm config, scripts, dépendances |
| `extension/tsconfig.json` | **Créer** — config TypeScript (noEmit) |
| `extension/build.mjs` | **Créer** — script de build esbuild |
| `extension/.gitignore` | **Créer** — ignorer `dist/`, `node_modules/` |
| `extension/src/lib/types.ts` | **Créer** — types partagés |
| `extension/src/lib/config.ts` | **Créer** — gestion de la config |

### Extension — Migration vers TypeScript (Phase 0)

| Fichier source | Fichier cible | Action |
|----------------|---------------|--------|
| `extension/api.js` | `extension/src/lib/api.ts` | Migrer + typer |
| `extension/background.js` | `extension/src/background.ts` | Migrer + typer |
| `extension/content.js` | `extension/src/content.ts` | Migrer + typer |
| `extension/popup/popup.js` | `extension/src/popup.ts` | Migrer + typer |
| `extension/config.js` | *(supprimé)* | Remplacé par injection esbuild |

### Extension — Mise à jour config (Phase 0)

| Fichier | Action |
|---------|--------|
| `extension/manifest.json` | **Modifier** — pointer vers `dist/`, bump version 4.0 |
| `extension/popup/popup.html` | **Modifier** — charger uniquement `dist/popup.js` |
| `scripts/build-extension.sh` | **Modifier** — npm install + build avec injection config |

### Extension — Nouveaux modules (Phases 1-2)

| Fichier | Action |
|---------|--------|
| `extension/src/lib/innertube.ts` | **Créer** — extraction YouTube (port de `server/src/services/transcript.ts`) |
| `extension/src/lib/jina.ts` | **Créer** — extraction Jina Reader |

### Extension — Fichiers NON migrés

| Fichier | Raison |
|---------|--------|
| `extension/claude-inject.js` | Script injecté dans la page Claude, reste en JS vanilla |
| `extension/popup/popup.css` | CSS, pas de build nécessaire |
| `extension/icons/*` | Assets statiques |

### Serveur (Phases 3 et 5)

| Fichier | Action |
|---------|--------|
| `server/src/routes/api.ts` | **Modifier** — nouvel endpoint `POST /api/x10/add-content` |
| `server/src/services/transcript.ts` | **Optionnel** — garder comme fallback limité ou supprimer |
| `server/src/services/content.ts` | **Optionnel** — garder comme fallback limité ou supprimer |

---

## Gestion des erreurs et états de chargement

### Erreurs d'extraction possibles

| Erreur | Cause | Action |
|--------|-------|--------|
| `No captions available` | Vidéo sans sous-titres, live stream | Afficher message à l'utilisateur |
| `Video unavailable` | Vidéo privée, supprimée, géobloquée | Afficher message à l'utilisateur |
| `Rate limited (429)` | Trop de requêtes (rare depuis l'extension) | Retry avec backoff exponentiel |
| `Network error` | Connexion perdue | Retry automatique, message si persistant |
| `Jina timeout` | Page trop lourde ou lente | Timeout à 30s, message d'erreur |

### États de chargement

L'extraction prend du temps (1-5 secondes). L'UX doit refléter ça :

1. **Popup** : Spinner ou texte "Extracting..." pendant l'opération
2. **Content script** : Si bouton dans la page YouTube, état "loading" sur le bouton
3. **Erreur** : Toast avec message clair, bouton retry si applicable

### Fallback serveur (optionnel)

Si l'extraction côté extension échoue, faut-il fallback sur le serveur ?

**Recommandation** : Non, pour garder l'architecture simple. Si l'extraction échoue côté extension, elle échouera probablement aussi côté serveur (même cause : vidéo indisponible, pas de sous-titres, etc.).

---

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| Régression sur l'extension existante | Tester sur une version dev avant de publier |
| YouTube change son API | Le code est adapté (WEB + ANDROID fallback), surveiller yt-dlp pour les changements |
| Jina Reader change ses headers | Simple à corriger, pas critique |
| Utilisateurs sans extension | Garder un fallback limité côté serveur (formulaire web) |
| Build esbuild échoue | CI/CD avec tests de compilation |
| Migration TypeScript introduit des bugs | Migrer fichier par fichier, tester à chaque étape |

---

## Questions ouvertes

1. **Fallback serveur** : Le garde-t-on pour le formulaire web ou on force l'installation de l'extension ?
2. **Rate limiting du nouvel endpoint** : Quelle limite par utilisateur ? (suggestion : 100 items/heure)
3. **Taille max du contenu** : Quelle limite ? (suggestion : 500KB par item)
4. **Migration des données existantes** : Les items déjà en DB n'ont pas besoin de migration (le contenu est déjà stocké)

---

## Commit préparatoire

Fait : `[CHECKPOINT] Pre-frontend-extraction architecture - server-side API calls`

Ce commit permet de revenir facilement à l'état actuel si la migration pose problème.
