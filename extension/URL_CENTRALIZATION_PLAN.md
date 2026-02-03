# Plan : Centraliser les URLs et générer l'extension en dev + prod

## Objectif

Éliminer tous les `http://localhost:3000` hardcodés. Côté serveur, centraliser dans un `config.ts` chargé via `.env`. Côté extension, produire deux variantes (dev/prod) via un script shell et un fichier `config.js` interchangeable.

---

## Partie 1 : Serveur

### 1.1 Installer dotenv

```bash
cd server && npm install dotenv
```

### 1.2 Créer `server/src/config.ts`

```typescript
export const config = {
  port: Number(process.env.PORT) || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  brandName: process.env.BRAND_NAME || 'straighttoyour.ai',
};
```

### 1.3 Créer `server/.env.example` (commité) et `server/.env` (gitignoré)

```
PORT=3000
BASE_URL=http://localhost:3000
BRAND_NAME=straighttoyour.ai
```

### 1.4 Modifier `server/src/index.ts`

- Ajouter `import 'dotenv/config';` en première ligne
- Ajouter `import { config } from './config.js';`
- Remplacer `process.env.PORT || 3000` par `config.port`
- Ajouter `app.locals.baseUrl = config.baseUrl;` et `app.locals.brandName = config.brandName;`

### 1.5 Modifier `server/src/routes/index.ts`

- Importer `{ config }` depuis `'../config.js'`
- Remplacer les 9 occurrences de `'straighttoyour.ai'` par `config.brandName`
- Remplacer `process.env.BASE_URL || 'http://localhost:3000'` par `config.baseUrl`

### 1.6 Modifier `server/src/routes/x10.ts`

- Importer `{ config }` depuis `'../config.js'`
- Ligne 54 : remplacer `process.env.BASE_URL || 'http://localhost:3000'` par `config.baseUrl`
- Lignes 78, 132 : remplacer `straighttoyour.ai` par `config.brandName`

### 1.7 Modifier `server/src/routes/api.ts`

- Importer `{ config }` depuis `'../config.js'`
- Remplacer `origin.includes('localhost:3000')` par une vérification dynamique basée sur `config.baseUrl`
- Garder `youtube.com` et `chrome-extension://` en dur (ce sont des domaines externes fixes)

### 1.8 Modifier les templates Pug

`app.locals.baseUrl` est automatiquement disponible dans Pug. Remplacer :

**`server/src/views/x10.pug`** (3 occurrences) :
- `process.env.BASE_URL || 'http://localhost:3000'` → `baseUrl`

**`server/src/views/myx10s.pug`** (2 occurrences) :
- `process.env.BASE_URL || 'http://localhost:3000'` → `baseUrl`

### 1.9 Ajouter `server/.env` au `.gitignore`

---

## Partie 2 : Extension

### 2.1 Créer 3 fichiers de config

**`extension/config.js`** (actif, identique au dev par défaut) :
```javascript
const STYA_CONFIG = {
  DEFAULT_BASE_URL: 'http://localhost:3000',
};
```

**`extension/config.dev.js`** (copie dev) :
```javascript
const STYA_CONFIG = {
  DEFAULT_BASE_URL: 'http://localhost:3000',
};
```

**`extension/config.prod.js`** (production) :
```javascript
const STYA_CONFIG = {
  DEFAULT_BASE_URL: 'https://straighttoyour.ai',
};
```

### 2.2 Modifier `extension/manifest.json`

Ajouter `config.js` dans les content_scripts avant `content.js` :
```json
"content_scripts": [
  {
    "matches": ["*://*.youtube.com/*"],
    "js": ["config.js", "content.js"],
    "run_at": "document_idle"
  }
]
```

### 2.3 Modifier les 3 fichiers JS

Remplacer `const DEFAULT_BASE_URL = 'http://localhost:3000';` dans chaque fichier :

**`extension/content.js`** et **`extension/api.js`** :
```javascript
const DEFAULT_BASE_URL = (typeof STYA_CONFIG !== 'undefined') ? STYA_CONFIG.DEFAULT_BASE_URL : 'http://localhost:3000';
```

**`extension/background.js`** (service worker, pas de DOM) :
```javascript
try { importScripts('config.js'); } catch(e) {}
const DEFAULT_BASE_URL = (typeof STYA_CONFIG !== 'undefined') ? STYA_CONFIG.DEFAULT_BASE_URL : 'http://localhost:3000';
```

### 2.4 Modifier `extension/popup/popup.html`

Ajouter le script config avant api.js :
```html
<script src="../config.js"></script>
<script src="../api.js"></script>
```

### 2.5 Créer le script de build `scripts/build-extension.sh`

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_SRC="$PROJECT_DIR/extension"
DIST_DIR="$PROJECT_DIR/dist-extension"

rm -rf "$DIST_DIR"

for ENV in dev prod; do
  echo "Building $ENV extension..."
  mkdir -p "$DIST_DIR/$ENV"
  cp -r "$EXT_SRC"/* "$DIST_DIR/$ENV/"
  cp "$EXT_SRC/config.$ENV.js" "$DIST_DIR/$ENV/config.js"
  rm -f "$DIST_DIR/$ENV/config.dev.js" "$DIST_DIR/$ENV/config.prod.js"
  rm -f "$DIST_DIR/$ENV/"*.md
done

echo "Done! Extensions in dist-extension/dev and dist-extension/prod"
```

### 2.6 Ajouter au `.gitignore`

```
dist-extension/
```

### 2.7 Ajouter un script npm dans le `package.json` racine

```json
"scripts": {
  "ext:build": "bash scripts/build-extension.sh"
}
```

---

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `server/src/config.ts` | **Nouveau** — config centralisée |
| `server/.env.example` | **Nouveau** — template des variables |
| `server/.env` | **Nouveau** (gitignoré) — variables locales |
| `server/src/index.ts` | Import dotenv + config, app.locals |
| `server/src/routes/index.ts` | 10 remplacements (brandName + baseUrl) |
| `server/src/routes/x10.ts` | 3 remplacements (baseUrl + brandName) |
| `server/src/routes/api.ts` | CORS dynamique basé sur config.baseUrl |
| `server/src/views/x10.pug` | 3 remplacements → `baseUrl` |
| `server/src/views/myx10s.pug` | 2 remplacements → `baseUrl` |
| `extension/config.js` | **Nouveau** — config active |
| `extension/config.dev.js` | **Nouveau** — config dev |
| `extension/config.prod.js` | **Nouveau** — config prod |
| `extension/manifest.json` | Ajout de `config.js` dans content_scripts |
| `extension/content.js` | Lire DEFAULT_BASE_URL depuis STYA_CONFIG |
| `extension/api.js` | Lire DEFAULT_BASE_URL depuis STYA_CONFIG |
| `extension/background.js` | importScripts + lire STYA_CONFIG |
| `extension/popup/popup.html` | Ajout `<script src="../config.js">` |
| `scripts/build-extension.sh` | **Nouveau** — génère dev + prod |
| `package.json` (racine) | Ajout script `ext:build` |
| `.gitignore` | Ajout `server/.env` et `dist-extension/` |

---

## Vérification

1. `cd server && npm run dev` → le serveur démarre, les pages affichent les bonnes URLs
2. Charger `extension/` en mode développeur dans Chrome → fonctionne avec localhost
3. `npm run ext:build` → crée `dist-extension/dev/` et `dist-extension/prod/`
4. Charger `dist-extension/prod/` dans Chrome → l'extension pointe vers `https://straighttoyour.ai`
5. Modifier `server/.env` avec `BASE_URL=https://straighttoyour.ai` → les templates Pug utilisent la bonne URL
