# X10Tube - Plan d'intégration dans le menu YouTube

> **Mise à jour Janvier 2026**: YouTube a modernisé le sidebar des suggestions. Les `ytd-compact-video-renderer` ont été remplacés par des `yt-lockup-view-model` qui N'ONT PAS de menu ⋮.

## Contexte

L'extension X10Tube utilise actuellement plusieurs approches d'intégration selon les pages :

| Page | Intégration actuelle | Problème |
|------|---------------------|----------|
| Homepage | Rien | Pas de bouton visible |
| Page vidéo | Logo X10Tube en overlay sur le player | Style différent, pas intégré |
| Sidebar (suggestions) | Bouton + rouge en hover | Pousse le contenu, style incohérent |
| Page recherche | Gros + rouge en haut à droite | Style non natif |

**Objectif** : Harmoniser en ajoutant X10Tube dans le menu à 3 points verticaux (⋮) de YouTube, présent partout.

---

## Structure du menu YouTube (3 points verticaux)

### Éléments clés du DOM

```
ytd-video-renderer / ytd-rich-item-renderer / ytd-compact-video-renderer
└── #dismissible
    └── ytd-menu-renderer
        └── yt-icon-button#button (le bouton ⋮)
            └── button[aria-label="Action menu"]
                └── yt-icon (icône 3 points)
```

Quand on clique sur le bouton, YouTube crée/réutilise un popup global :

```
ytd-popup-container (singleton, contient tous les popups)
└── tp-yt-iron-dropdown
    └── ytd-menu-popup-renderer
        └── tp-yt-paper-listbox#items
            └── ytd-menu-service-item-renderer (chaque item du menu)
                └── tp-yt-paper-item
                    └── yt-icon + yt-formatted-string
```

### Sélecteurs importants

- **Container des popups** : `ytd-popup-container` (singleton)
- **Popup menu** : `ytd-menu-popup-renderer`
- **Liste des items** : `tp-yt-paper-listbox#items`
- **Un item natif** : `ytd-menu-service-item-renderer`

### Contrainte technique : Trusted Types

YouTube utilise une Content Security Policy avec Trusted Types. **L'utilisation de `innerHTML` est bloquée**. Tous les éléments doivent être créés via `document.createElement()`.

---

## Approche d'intégration

### Stratégie hybride (Recommandée)

| Contexte | Approche |
|----------|----------|
| Vignettes (homepage, recherche, sidebar, playlists) | Injection dans le menu ⋮ |
| Page vidéo (/watch) | Garder le bouton overlay sur le player (déjà fonctionnel) |
| YouTube Shorts | À évaluer (structure différente) |

**Justification** : Sur la page vidéo, le menu ⋮ sous la vidéo concerne des actions différentes (signaler, transcription, etc.) et n'est pas le bon endroit pour "Ajouter à X10". Le bouton overlay sur le player reste pertinent.

---

## Plan d'implémentation

### Phase 1 : Capturer le videoId AVANT l'ouverture du menu

Le popup est un singleton réutilisé - on ne peut pas remonter au renderer vidéo depuis le popup. Il faut capturer le videoId au moment du clic sur le bouton ⋮.

```javascript
let pendingVideoId = null;

function setupMenuButtonListeners() {
  // Écouter les clics sur tous les boutons menu (event delegation)
  document.addEventListener('click', (e) => {
    const menuButton = e.target.closest('ytd-menu-renderer yt-icon-button#button, ytd-menu-renderer button[aria-label="Action menu"]');
    if (!menuButton) return;

    // Remonter au renderer vidéo parent
    const renderer = menuButton.closest(`
      ytd-video-renderer,
      ytd-rich-item-renderer,
      ytd-compact-video-renderer,
      ytd-playlist-video-renderer,
      ytd-grid-video-renderer
    `);

    if (!renderer) return;

    // Extraire le videoId
    const link = renderer.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (link) {
      const match = link.href.match(/[?&]v=([^&]+)/) || link.href.match(/\/shorts\/([^?&]+)/);
      pendingVideoId = match ? match[1] : null;
    }
  }, true); // Capture phase pour être avant YouTube
}
```

### Phase 2 : Observer uniquement le container de popups

Pour la performance, cibler spécifiquement `ytd-popup-container` plutôt que tout le body.

```javascript
function setupPopupObserver() {
  const popupContainer = document.querySelector('ytd-popup-container');
  if (!popupContainer) {
    // Réessayer plus tard si pas encore chargé
    setTimeout(setupPopupObserver, 1000);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Vérifier si un menu popup est devenu visible
      const popup = popupContainer.querySelector('ytd-menu-popup-renderer');
      if (popup && pendingVideoId) {
        injectX10MenuItem(popup, pendingVideoId);
      }
    }
  });

  observer.observe(popupContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'hidden'] // Détecter show/hide
  });
}
```

### Phase 3 : Créer l'item de menu (sans innerHTML)

```javascript
function createX10MenuItem(videoId) {
  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'x10tube-menu-item';
  wrapper.setAttribute('role', 'option');
  wrapper.setAttribute('tabindex', '-1');
  wrapper.dataset.videoId = videoId;

  // Paper item (structure YouTube)
  const paperItem = document.createElement('tp-yt-paper-item');
  paperItem.className = 'style-scope ytd-menu-service-item-renderer';
  paperItem.setAttribute('role', 'option');

  // Icône
  const icon = document.createElement('yt-icon');
  icon.className = 'style-scope ytd-menu-service-item-renderer x10tube-icon';
  // L'icône sera stylée en CSS (ou utiliser une image de fond)

  // Texte
  const text = document.createElement('yt-formatted-string');
  text.className = 'style-scope ytd-menu-service-item-renderer';
  text.textContent = 'Add to X10Tube';

  // Assembler
  paperItem.appendChild(icon);
  paperItem.appendChild(text);
  wrapper.appendChild(paperItem);

  // Event listener
  wrapper.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleX10MenuClick(videoId, wrapper);
  });

  return wrapper;
}
```

### Phase 4 : Injecter dans le menu

```javascript
function injectX10MenuItem(popup, videoId) {
  // Supprimer l'ancien item s'il existe (le popup est réutilisé)
  const existingItem = popup.querySelector('.x10tube-menu-item');
  if (existingItem) {
    // Si même videoId, ne rien faire
    if (existingItem.dataset.videoId === videoId) return;
    // Sinon, supprimer l'ancien
    existingItem.remove();
  }

  // Trouver la liste des items
  const itemsList = popup.querySelector('tp-yt-paper-listbox#items');
  if (!itemsList) return;

  // Créer et insérer en première position
  const x10Item = createX10MenuItem(videoId);
  itemsList.insertBefore(x10Item, itemsList.firstChild);
}
```

### Phase 5 : Gérer le clic et le popover

```javascript
function handleX10MenuClick(videoId, menuItem) {
  // Fermer le menu YouTube
  const dropdown = document.querySelector('tp-yt-iron-dropdown[aria-hidden="false"]');
  if (dropdown) {
    dropdown.setAttribute('aria-hidden', 'true');
    // Ou simuler Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  // Positionner et ouvrir le popover X10Tube
  const rect = menuItem.getBoundingClientRect();
  showX10Popover(videoId, rect);

  // Reset
  pendingVideoId = null;
}

function showX10Popover(videoId, anchorRect) {
  // Réutiliser le dropdown existant ou en créer un
  let dropdown = document.getElementById('x10tube-dropdown');
  if (!dropdown) {
    dropdown = createDropdown();
    document.body.appendChild(dropdown);
  }

  // Positionner près de l'ancre
  dropdown.style.top = `${anchorRect.top}px`;
  dropdown.style.left = `${Math.max(10, anchorRect.right - 280)}px`;

  // Stocker le videoId pour les actions
  dropdown.dataset.currentVideoId = videoId;

  // Ouvrir
  dropdown.classList.add('open');
  dropdown.style.display = 'block';

  // Charger les x10s
  loadX10sForDropdown();
}
```

---

## Styles CSS

```css
/* Item dans le menu YouTube */
.x10tube-menu-item {
  display: block;
  cursor: pointer;
}

.x10tube-menu-item tp-yt-paper-item {
  display: flex;
  align-items: center;
  padding: 0 36px 0 16px;
  min-height: 36px;
  font-family: "Roboto", "Arial", sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--yt-spec-text-primary, #f1f1f1);
  cursor: pointer;
}

.x10tube-menu-item tp-yt-paper-item:hover {
  background-color: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
}

/* Icône X10 */
.x10tube-menu-item .x10tube-icon {
  width: 24px;
  height: 24px;
  margin-right: 16px;
}

.x10tube-menu-item .x10tube-icon::before {
  content: '+';
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 18px;
  font-weight: bold;
  color: var(--yt-spec-text-primary, #f1f1f1);
}

/* Alternative: utiliser le logo X10Tube comme background-image */
```

---

## Pages concernées

| Page | Renderer | A le menu ⋮ | Action X10 |
|------|----------|-------------|------------|
| Homepage | `ytd-rich-item-renderer` | Oui | Menu |
| Recherche | `ytd-video-renderer` | Oui | Menu |
| Sidebar suggestions | `ytd-compact-video-renderer` | Oui | Menu |
| Playlists | `ytd-playlist-video-renderer` | Oui | Menu |
| Chaîne/Videos | `ytd-grid-video-renderer` | Oui | Menu |
| Page vidéo (/watch) | N/A (player) | Non pertinent | Overlay (existant) |
| Shorts | `ytd-reel-video-renderer` | À vérifier | À définir |

---

## Cas particuliers

### YouTube Shorts

Les Shorts ont une interface différente (swipe vertical). À investiguer :
- Y a-t-il un menu ⋮ ?
- Si oui, même structure ?
- Sinon, quelle intégration ?

### Mode Théâtre / Plein écran

Le bouton overlay sur le player reste visible. Pas de changement nécessaire.

### Vidéos déjà dans un X10

L'item du menu pourrait afficher "✓ In X10Tube" si la vidéo est déjà ajoutée. Nécessite un appel API au moment de l'ouverture du menu (peut ralentir).

**Décision** : Phase 2 - pour l'instant, toujours afficher "Add to X10Tube".

---

## Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| YouTube change la structure DOM | Moyenne | Élevé | Sélecteurs flexibles, tests réguliers, fallback gracieux |
| Trusted Types bloque l'injection | Faible | Élevé | Utiliser uniquement createElement/textContent |
| Performance (observers) | Faible | Moyen | Observer seulement ytd-popup-container |
| Le menu se ferme trop vite | Moyenne | Moyen | Fermer programmatiquement puis ouvrir popover |
| Conflit avec d'autres extensions | Faible | Faible | Classes préfixées x10tube- |

---

## Ordre d'implémentation

1. **Phase 1** : Capture du videoId au clic sur ⋮ (event delegation)
2. **Phase 2** : Observer ytd-popup-container
3. **Phase 3** : Créer l'item de menu (sans innerHTML)
4. **Phase 4** : Injecter l'item dans le popup
5. **Phase 5** : Ouvrir le popover X10Tube au clic
6. **Phase 6** : Tester sur toutes les pages (homepage, recherche, sidebar, playlists)
7. **Phase 7** : Supprimer les anciens boutons (+ rouge sur thumbnails)
8. **Phase 8** : Garder/améliorer le bouton overlay sur la page vidéo

---

## Ce qui reste inchangé

- **Bouton overlay sur le player** (page /watch) : Reste en place, c'est le point d'entrée principal
- **Popover X10Tube** (`#x10tube-dropdown`) : Réutilisé, juste repositionné
- **API et logique métier** : Inchangées
- **Toast notifications** : Inchangées

---

## Références

- [GitHub Gist - YouTube "Not Interested" script](https://gist.github.com/iosifnicolae2/1a78b5ab1d166fd5d17e6ae0a0fe0901)
- [GitHub - auto-youtube-subscription-playlist-2](https://github.com/Elijas/auto-youtube-subscription-playlist-2/blob/master/removeVidsFromPlaylist.md)
- [GitHub - youtube-watch-later-cleaner](https://github.com/preetamgodase944/youtube-watch-later-cleaner)
