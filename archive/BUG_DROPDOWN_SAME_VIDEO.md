# Bug: Le dropdown affiche le mauvais titre/channel/durée

## Description du problème

Quand l'utilisateur clique sur le bouton STYA à côté d'une vidéo recommandée (sidebar sur une page /watch), le dropdown affiche:
- **Thumbnail**: ✅ Correcte (la vidéo cliquée)
- **Titre**: ❌ Incorrect (la vidéo principale en lecture)
- **Channel**: ❌ Incorrect (la vidéo principale)
- **Durée**: ❌ Incorrecte (la vidéo principale)

**Impact**: Bug d'affichage uniquement. La bonne vidéo est ajoutée à la collection malgré les infos incorrectes affichées.

---

## Cause racine

Dans `getPageInfo()`, quand un `videoId` est passé explicitement (clic sur bouton sidebar), le code utilise des fonctions qui extraient les infos de la **vidéo principale de la page**, pas de la vidéo cliquée.

### Code problématique

```typescript
// content.ts - getPageInfo() - lignes ~952-964
function getPageInfo(options: OverlayOptions): PageInfo {
  if (options.videoId) {
    return {
      type: 'youtube-video',
      title: getVideoTitleFromPage() || document.title.replace(' - YouTube', ''),  // ❌ BUG
      url: `https://www.youtube.com/watch?v=${options.videoId}`,  // ✅ OK
      thumbnail: `https://img.youtube.com/vi/${options.videoId}/mqdefault.jpg`,  // ✅ OK
      videoId: options.videoId,  // ✅ OK
      channel: getChannelFromPage(),  // ❌ BUG
      duration: getDurationFromPage()  // ❌ BUG
    };
  }
}
```

### Fonctions qui récupèrent les mauvaises données

```typescript
// Récupère le titre du <h1> de la page watch → VIDÉO PRINCIPALE
function getVideoTitleFromPage(): string | null {
  return document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim()
    || document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim()
    || null;
}

// Récupère la chaîne depuis #channel-name → VIDÉO PRINCIPALE
function getChannelFromPage(): string | undefined {
  return document.querySelector('#channel-name a')?.textContent?.trim()
    || document.querySelector('ytd-channel-name a')?.textContent?.trim()
    || undefined;
}

// Récupère la durée du player → VIDÉO EN COURS DE LECTURE
function getDurationFromPage(): string | undefined {
  return document.querySelector('.ytp-time-duration')?.textContent || undefined;
}
```

---

## Illustration

```
Page /watch?v=VIDEO_PRINCIPALE (John Heart)
┌─────────────────────────────────────────────────────────┐
│  [Vidéo en lecture: John Heart]    │  Recommandations   │
│  Titre: "Dorian Yates' H.I.T..."   │  ┌──────────────┐  │
│  Channel: Official John Heart      │  │ [Vidéo X]    │  │
│  Durée: 6:56                       │  │ Adrian Crook │  │
│                                    │  │ [🔴 CLIC]    │  │
│                                    │  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────┐
│  Dropdown STYA                                          │
│  ┌─────────┬──────────────────────────────────────────┐ │
│  │ 🖼️      │ Dorian Yates' H.I.T...  ← MAUVAIS!       │ │
│  │ Thumb   │ Official John Heart · 6:56 ← MAUVAIS!    │ │
│  │ (OK ✅) │                                          │ │
│  └─────────┴──────────────────────────────────────────┘ │
│  → La bonne vidéo est ajoutée malgré l'affichage faux   │
└─────────────────────────────────────────────────────────┘
```

---

## Solution

Extraire le titre depuis l'élément DOM au moment du clic, au lieu d'utiliser `getVideoTitleFromPage()`.

### Étape 1: Nouvelle fonction pour extraire les infos depuis le bouton

```typescript
function extractVideoInfoFromButton(btn: HTMLElement): {
  videoId: string | null;
  videoTitle: string | null
} {
  // Remonter au conteneur de la vidéo
  const container = btn.closest(
    'ytd-playlist-video-renderer, ' +
    'yt-lockup-metadata-view-model, ' +
    'ytd-video-renderer, ' +
    'ytd-rich-item-renderer, ' +
    'ytd-compact-video-renderer'
  );

  if (!container) return { videoId: null, videoTitle: null };

  // Trouver le lien titre
  const titleLink = container.querySelector(
    'a#video-title, ' +
    'a.yt-lockup-metadata-view-model__title, ' +
    'a#video-title-link'
  ) as HTMLAnchorElement | null;

  const videoId = titleLink?.href ? extractVideoIdFromUrl(titleLink.href) : null;
  const videoTitle = titleLink?.title || titleLink?.textContent?.trim() || null;

  // Fallback: classe content-id-XXX
  if (!videoId) {
    const lockup = container.closest('yt-lockup-view-model');
    const contentDiv = lockup?.querySelector('[class*="content-id-"]');
    if (contentDiv) {
      const contentClass = Array.from(contentDiv.classList).find(c => c.startsWith('content-id-'));
      const fallbackId = contentClass?.replace('content-id-', '') || null;
      return { videoId: fallbackId, videoTitle };
    }
  }

  return { videoId, videoTitle };
}
```

### Étape 2: Modifier createTitleButton() pour extraire au moment du clic

```typescript
function createTitleButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'stya-title-btn';
  btn.innerHTML = '<svg>...</svg>';
  btn.title = 'Add to StraightToYourAI';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Extraire videoId ET titre AU MOMENT DU CLIC
    const { videoId, videoTitle } = extractVideoInfoFromButton(btn);

    if (!videoId) {
      showToast('Could not find video ID', 'error');
      return;
    }

    if (isDropdownOpen) {
      closeDropdown();
    }

    showDropdownForVideo(videoId, btn, videoTitle);
  });

  return btn;
}
```

### Étape 3: Modifier showDropdownForVideo() pour passer le titre

```typescript
async function showDropdownForVideo(
  videoId: string,
  anchorElement: HTMLElement,
  videoTitle?: string | null
): Promise<void> {
  await showOverlay({
    centered: false,
    anchorElement,
    videoId,
    videoTitle: videoTitle || undefined
  });
}
```

### Étape 4: Modifier OverlayOptions et getPageInfo()

```typescript
interface OverlayOptions {
  centered: boolean;
  anchorElement?: HTMLElement;
  videoId?: string;
  videoTitle?: string;  // NOUVEAU
  context?: OverlayContext;
}

function getPageInfo(options: OverlayOptions): PageInfo {
  // Case 1: Explicit videoId (click on YouTube title button)
  if (options.videoId) {
    return {
      type: 'youtube-video',
      title: options.videoTitle || options.videoId,  // Utiliser le titre passé
      url: `https://www.youtube.com/watch?v=${options.videoId}`,
      thumbnail: `https://img.youtube.com/vi/${options.videoId}/mqdefault.jpg`,
      videoId: options.videoId,
      channel: undefined,  // Non disponible pour sidebar
      duration: undefined  // Non disponible pour sidebar
    };
  }
  // ... reste inchangé
}
```

### Étape 5: Adapter injectTitleButtons() (optionnel mais propre)

Puisque le `videoId` est maintenant extrait au clic, on peut simplifier l'injection:

```typescript
// Avant: createTitleButton(videoId)
// Après: createTitleButton()  ← plus besoin de passer le videoId
```

---

## Fichiers à modifier

| Fichier | Modifications |
|---------|---------------|
| `extension/src/content.ts` | `extractVideoInfoFromButton()` (nouveau), `createTitleButton()`, `showDropdownForVideo()`, `OverlayOptions`, `getPageInfo()` |

## Estimation

- Lignes modifiées: ~40-50
- Complexité: Faible à moyenne

---

## Tests à effectuer

1. **Page /watch - Sidebar**: Cliquer sur une vidéo recommandée → le titre affiché doit correspondre à la vidéo cliquée
2. **Homepage**: Cliquer sur une vidéo → titre correct
3. **Playlist (Watch Later)**: Cliquer sur une vidéo → titre correct
4. **Page /watch - Vidéo principale**: Le bouton sur le h1 de la vidéo principale doit toujours fonctionner
5. **Raccourci clavier (Cmd+Shift+Y)**: Doit toujours ouvrir le dropdown pour la vidéo en cours
