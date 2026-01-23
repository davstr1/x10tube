# YouTube DOM Selectors pour X10Tube

## Résultats d'exploration (Janvier 2026) - MISE À JOUR

### Structure confirmée

| Page | Video Renderer | Has Menu ⋮ | Status |
|------|----------------|------------|--------|
| Search `/results` | `ytd-video-renderer` | ✅ Oui | ✅ Fonctionne |
| Homepage | `ytd-rich-item-renderer` | ✅ Oui | 🔧 À implémenter |
| Watch page - Main video | N/A | N/A | ✅ Overlay existant |
| Watch page - Sidebar | `yt-lockup-view-model` | ✅ OUI ! | 🔧 À implémenter |
| Playlists | `ytd-playlist-video-renderer` | ✅ Oui | 🔧 À implémenter |

---

## ⚠️ DÉCOUVERTE IMPORTANTE: Sidebar Watch Page

**Le sidebar a BIEN un menu à 3 points!** Il est structuré différemment:

```
yt-lockup-view-model
├── yt-thumbnail-view-model
│   └── a[href*="/watch"]
└── yt-lockup-metadata-view-model
    └── button[aria-label="More actions"]  ← MENU ICI !
        └── Classes: yt-spec-button-shape-next
```

### Sélecteurs pour le sidebar Watch page

```javascript
// Conteneur de vidéo
'yt-lockup-view-model'

// Bouton menu (3 points)
'yt-lockup-view-model button[aria-label="More actions"]'
// OU
'yt-lockup-view-model .yt-lockup-metadata-view-model__menu-button button'

// Lien vidéo
'yt-lockup-view-model a[href*="/watch"]'
```

### Structure HTML observée

```html
<yt-lockup-view-model class="ytd-watch-next-secondary-results-renderer lockup">
  <div class="yt-lockup-view-model yt-lockup-view-model--horizontal">
    <!-- Thumbnail -->
    <a href="/watch?v=VIDEO_ID" class="yt-lockup-view-model__content-image">
      <yt-thumbnail-view-model>...</yt-thumbnail-view-model>
    </a>
    <!-- Metadata avec menu -->
    <div class="yt-lockup-view-model__metadata">
      <yt-lockup-metadata-view-model>
        ...
        <!-- BOUTON MENU ICI -->
        <button aria-label="More actions"
                class="yt-spec-button-shape-next yt-spec-button-shape-next--text">
          <yt-icon>...</yt-icon>
        </button>
      </yt-lockup-metadata-view-model>
    </div>
  </div>
</yt-lockup-view-model>
```

---

## Sélecteurs par page

### 1. Page de recherche (`/results`) - ✅ FONCTIONNE

```javascript
// Conteneur
'ytd-video-renderer'

// Menu renderer
'ytd-video-renderer ytd-menu-renderer'

// Bouton menu
'ytd-menu-renderer yt-icon-button#button'

// Lien vidéo
'ytd-video-renderer a[href*="/watch"]'
```

### 2. Page d'accueil (`youtube.com`) - 🔧 À IMPLÉMENTER

```javascript
// Conteneur
'ytd-rich-item-renderer'

// Menu renderer
'ytd-rich-item-renderer ytd-menu-renderer'

// Bouton menu (apparaît au hover)
'ytd-menu-renderer yt-icon-button#button'

// Lien vidéo
'ytd-rich-item-renderer a[href*="/watch"]'
```

**Note**: Le menu n'apparaît qu'au hover sur la vidéo.

### 3. Watch page - Sidebar - 🔧 À IMPLÉMENTER (NOUVEAU!)

```javascript
// Conteneur (NOUVEAU FORMAT)
'yt-lockup-view-model'

// Bouton menu direct (PAS de ytd-menu-renderer ici!)
'yt-lockup-view-model button[aria-label="More actions"]'

// Lien vidéo
'yt-lockup-view-model a[href*="/watch"]'

// Parent container
'ytd-watch-next-secondary-results-renderer'
```

**IMPORTANT**: Ce format utilise `button[aria-label="More actions"]` directement, pas `ytd-menu-renderer`!

### 4. Playlists - 🔧 À IMPLÉMENTER

```javascript
// Conteneur
'ytd-playlist-video-renderer'

// Menu renderer
'ytd-playlist-video-renderer ytd-menu-renderer'

// Bouton menu
'ytd-menu-renderer yt-icon-button#button'
```

---

## Détection du popup menu

```javascript
// Container singleton pour tous les popups
'ytd-popup-container'

// Le menu popup quand ouvert
'ytd-menu-popup-renderer'

// Liste des items dans le menu
'tp-yt-paper-listbox#items'

// Items natifs
'ytd-menu-service-item-renderer'
```

---

## Code de détection mis à jour

```javascript
// Définir les types de renderers avec leur sélecteur de menu
const RENDERER_CONFIGS = [
  {
    // Search results
    renderer: 'ytd-video-renderer',
    menuButton: 'ytd-menu-renderer yt-icon-button#button',
    videoLink: 'a[href*="/watch"]'
  },
  {
    // Homepage
    renderer: 'ytd-rich-item-renderer',
    menuButton: 'ytd-menu-renderer yt-icon-button#button',
    videoLink: 'a[href*="/watch"]'
  },
  {
    // Watch page sidebar (NOUVEAU FORMAT!)
    renderer: 'yt-lockup-view-model',
    menuButton: 'button[aria-label="More actions"]',
    videoLink: 'a[href*="/watch"]'
  },
  {
    // Playlists
    renderer: 'ytd-playlist-video-renderer',
    menuButton: 'ytd-menu-renderer yt-icon-button#button',
    videoLink: 'a[href*="/watch"]'
  }
];

// Écouter les clics sur les menus
document.addEventListener('click', (e) => {
  for (const config of RENDERER_CONFIGS) {
    // Vérifier si le clic est sur un bouton menu correspondant
    const menuButton = e.target.closest(config.menuButton);
    if (!menuButton) continue;

    // Trouver le renderer parent
    const renderer = menuButton.closest(config.renderer);
    if (!renderer) continue;

    // Exclure le menu principal de la page /watch
    if (renderer.closest('ytd-watch-metadata')) continue;

    // Extraire le videoId
    const link = renderer.querySelector(config.videoLink);
    if (link) {
      const match = link.href.match(/[?&]v=([^&]+)/);
      pendingVideoId = match ? match[1] : null;
      console.log('[X10Tube] Menu clicked for video:', pendingVideoId, 'from', config.renderer);
    }
    break;
  }
}, true);
```

---

## Contextes à EXCLURE

### Watch Page - Menu principal

Le menu à 3 points sous la vidéo (`ytd-watch-metadata`) concerne des actions différentes.

```javascript
// Détecter si on est dans le menu principal
if (menuButton.closest('ytd-watch-metadata')) return;
```

---

## Logs de debug Puppeteer (Janvier 2026)

### Watch Page Sidebar - yt-lockup-view-model

```json
{
  "found": true,
  "buttons": [
    {
      "ariaLabel": "More actions",
      "classes": "yt-spec-button-shape-next yt-spec-button-shape-next--text"
    }
  ],
  "menuElements": [
    {"tag": "button", "ariaLabel": "More actions"}
  ],
  "structure": "yt-lockup-view-model > div > yt-lockup-metadata-view-model > button"
}
```

### Classes CSS pertinentes

```
yt-lockup-view-model
yt-lockup-view-model--horizontal
yt-lockup-view-model--compact
yt-lockup-metadata-view-model__menu-button
yt-spec-button-shape-next
yt-spec-button-shape-next--text
```

---

## Stratégie finale

| Page | Méthode d'intégration | Status |
|------|----------------------|--------|
| Search | Menu ⋮ injection (ytd-menu-renderer) | ✅ Fonctionne |
| Homepage | Menu ⋮ injection (ytd-menu-renderer) | 🔧 À implémenter |
| Playlists | Menu ⋮ injection (ytd-menu-renderer) | 🔧 À implémenter |
| Watch page - Player | Overlay button | ✅ Fonctionne |
| Watch page - Sidebar | Menu ⋮ injection (button[aria-label]) | 🔧 À implémenter |

---

## Prochaines étapes pour l'implémentation

1. **Modifier `setupYouTubeMenuIntegration()`** pour utiliser la nouvelle config avec les différents sélecteurs

2. **Ajouter le support pour `yt-lockup-view-model`** en détectant le clic sur `button[aria-label="More actions"]`

3. **Tester sur chaque page**:
   - Homepage: hover puis menu
   - Watch sidebar: clic direct sur le bouton

4. **Le popup reste le même** (`ytd-menu-popup-renderer` avec `tp-yt-paper-listbox#items`)
