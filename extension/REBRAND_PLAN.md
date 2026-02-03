# Extension Rebrand: toyour.ai → StraightToYourAI

## Résumé

L'extension contient **150+ références** à l'ancien branding (`toyour.ai`, `X10Tube`, `x10`, etc.) réparties dans 8 fichiers. Voici les modifications à apporter.

---

## 1. `manifest.json`

| Ligne | Actuel | Nouveau |
|-------|--------|---------|
| 3 | `"name": "toyour.ai"` | `"name": "StraightToYourAI"` |

Les chemins d'icônes (`icons/icon16.png`, etc.) restent inchangés.

---

## 2. `popup/popup.html`

| Ligne | Actuel | Nouveau |
|-------|--------|---------|
| 6 | `<title>toyour.ai</title>` | `<title>StraightToYourAI</title>` |
| 14 | `<span class="logo-toyour">toyour</span><span class="logo-ai">.ai</span>` | `<span class="logo-main">StraightToYour</span><span class="logo-ai">AI</span>` |

---

## 3. `popup/popup.css`

| Ligne | Actuel | Nouveau |
|-------|--------|---------|
| 1 | `/* toyour.ai Extension ... */` | `/* StraightToYourAI Extension ... */` |
| 42 | `.logo-toyour { ... }` | `.logo-main { ... }` |

---

## 4. `content.js` (le plus gros chantier)

### Textes visibles par l'utilisateur
| Ligne | Actuel | Nouveau |
|-------|--------|---------|
| 563 | `<span class="x10-logo-toyour">toyour</span><span class="x10-logo-ai">.ai</span>` | `<span class="x10-logo-main">StraightToYour</span><span class="x10-logo-ai">AI</span>` |
| 745 | `Create a new X10` | `Create a new collection` |
| 788 | `Video added to new X10!` | `Video added to new collection!` |
| 801 | `Create a new X10` | `Create a new collection` |
| 968 | `btn.title = 'Add to toyour.ai'` | `btn.title = 'Add to StraightToYourAI'` |
| 1150 | `<span class="logo-toyour">toyour</span><span class="logo-ai">.ai</span>` | `<span class="logo-main">StraightToYour</span><span class="logo-ai">AI</span>` |
| 1151 | `toggle.title = 'Toggle toyour.ai buttons'` | `toggle.title = 'Toggle StraightToYourAI buttons'` |

### IDs et classes CSS (renommage global)
| Pattern actuel | Nouveau pattern |
|---------------|-----------------|
| `x10tube-styles` | `stya-styles` |
| `x10tube-title-btn` | `stya-title-btn` |
| `x10tube-buttons-hidden` | `stya-buttons-hidden` |
| `x10tube-master-toggle` | `stya-master-toggle` |
| `x10tube-toggle-container` | `stya-toggle-container` |
| `x10tube-toggle-menu` | `stya-toggle-menu` |
| `x10tube-dropdown` | `stya-dropdown` |
| `.x10-*` (dropdown classes) | `.stya-*` |
| `.logo-toyour` | `.logo-main` |

### Console logs
Remplacer tous les `[X10Tube]` par `[STYA]`.

### Fonctions et variables
| Actuel | Nouveau |
|--------|---------|
| `getMyX10s()` | `getMyCollections()` |
| `createX10()` | `createCollection()` |
| `addVideoToX10()` | `addVideoToCollection()` |
| `checkVideoInX10s()` | `checkVideoInCollections()` |

---

## 5. `api.js`

### Classe et export
| Actuel | Nouveau |
|--------|---------|
| `class X10TubeAPI` | `class StyaAPI` |
| `window.X10TubeAPI = X10TubeAPI` | `window.StyaAPI = StyaAPI` |

### Console logs
Remplacer `[X10Tube]` et `[X10Tube API]` par `[STYA]`.

### Fonctions
Même renommage que content.js (`getMyX10s` → `getMyCollections`, etc.)

### URLs d'API
| Actuel | Nouveau |
|--------|---------|
| `/api/x10s/by-code/` | À vérifier côté serveur si l'API change |
| `/api/x10/add` | À vérifier côté serveur si l'API change |
| `/api/x10/${x10Id}/add` | À vérifier côté serveur si l'API change |

> **Note** : Si les routes API côté serveur ne changent pas, les URLs restent telles quelles.

### Variables internes
| Actuel | Nouveau |
|--------|---------|
| `x10BackendUrl` | `styaBackendUrl` |
| `x10UserCode` | `styaUserCode` |
| `x10TitleButtonsEnabled` | `styaTitleButtonsEnabled` |

---

## 6. `background.js`

| Type | Actuel | Nouveau |
|------|--------|---------|
| Commentaire | `// X10Tube Background Service Worker` | `// StraightToYourAI Background Service Worker` |
| Console logs | `[X10Tube]` | `[STYA]` |

---

## 7. `popup/popup.js`

| Type | Actuel | Nouveau |
|------|--------|---------|
| Commentaire | `// X10Tube Extension Popup` | `// StraightToYourAI Extension Popup` |
| Classe | `new X10TubeAPI()` | `new StyaAPI()` |
| Console logs | `[X10Tube]`, `[X10Tube Popup]` | `[STYA]` |
| Variables | `x10Id`, `x10Title`, `x10s` | `collectionId`, `collectionTitle`, `collections` |

---

## 8. `claude-inject.js`

| Type | Actuel | Nouveau |
|------|--------|---------|
| Console logs | `[YT Captions]` | `[STYA]` |

---

## 9. Icônes (`icons/`)

Les fichiers `icon16.png`, `icon48.png`, `icon128.png` existent. Ils devront être **remplacés par le nouveau logo** (le SVG play/forward rouge utilisé sur le site). Les noms de fichiers peuvent rester identiques.

---

## Ordre recommandé

1. **Icônes** : générer les PNG 16x16, 48x48, 128x128 depuis le nouveau SVG
2. **api.js** : renommer la classe et les fonctions (base pour les autres fichiers)
3. **content.js** : le plus gros fichier, renommer IDs/classes/fonctions/textes
4. **popup/** : HTML, CSS, JS
5. **background.js** et **claude-inject.js** : console logs
6. **manifest.json** : nom de l'extension
