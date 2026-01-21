# YouTube DOM Structure Analysis

> **Last inspection:** 2026-01-21 via Puppeteer headless browser

## Key Findings

### Search Page (OLD structure - still works)
```
a#thumbnail                         ← VIDEO LINK (use this!)
└── parent: ytd-thumbnail           ← CONTAINER for button
    └── parent: div#dismissible
        └── parent: ytd-video-renderer
```

**Selector:** `a#thumbnail[href*="/watch?v="]`
**Container:** `ytd-thumbnail`

### Watch Page Sidebar (NEW structure - 2024+)
```
a.yt-lockup-view-model__content-image    ← VIDEO LINK (use this!)
└── parent: div.yt-lockup-view-model     ← CONTAINER for button
    └── parent: yt-lockup-view-model
        └── parent: div#items
            └── parent: ytd-watch-next-secondary-results-renderer
```

**Selector:** `a.yt-lockup-view-model__content-image[href*="/watch?v="]`
**Container:** `.yt-lockup-view-model` (the div, not the custom element)

### Home Page
Requires cookies/login to see videos. Likely uses same `yt-lockup-view-model` structure as watch page sidebar.

---

## Element Counts (from inspection)

| Page | `ytd-thumbnail` | `yt-lockup-view-model` | `a[href*="/watch?v="]` |
|------|-----------------|------------------------|------------------------|
| Home | 3 | 0 | 0 (needs cookies) |
| Search | 15 | 12 | 203 |
| Watch | 3 | 20 | 40 |

---

## Implementation Strategy

### Universal Approach

Target ALL video links, then find appropriate container:

```javascript
// Find all video links not yet processed
const videoLinks = document.querySelectorAll(`
  a[href*="/watch?v="]:not([data-x10-processed]),
  a[href*="/shorts/"]:not([data-x10-processed])
`);

videoLinks.forEach(link => {
  link.setAttribute('data-x10-processed', 'true');

  // Find container - check both OLD and NEW structures
  const container =
    // NEW structure (watch sidebar, home)
    link.closest('.yt-lockup-view-model') ||
    // OLD structure (search)
    link.closest('ytd-thumbnail') ||
    // Fallback to video renderers
    link.closest('ytd-video-renderer') ||
    link.closest('ytd-compact-video-renderer') ||
    link.closest('ytd-rich-item-renderer');

  if (!container) return;

  // Add button to container
  addButtonToContainer(container, videoId);
});
```

### Specific Selectors

```javascript
// OLD structure (Search page)
const oldThumbnails = document.querySelectorAll('a#thumbnail[href*="/watch?v="]');

// NEW structure (Watch sidebar, likely Home)
const newThumbnails = document.querySelectorAll('a.yt-lockup-view-model__content-image[href*="/watch?v="]');
```

---

## Elements to SKIP

```javascript
// Skip these containers
if (container.closest('#movie_player')) return;      // Main video player
if (container.closest('ytd-miniplayer')) return;     // Mini player
if (container.closest('#player')) return;            // Player area
```

---

## CSS for Button

```css
.x10tube-mini-btn {
  position: absolute !important;
  bottom: 4px !important;
  left: 4px !important;
  z-index: 2147483647 !important;
  /* ... */
}
```

The `z-index: 2147483647` is the maximum 32-bit integer, ensuring the button stays above YouTube's overlays.

---

## Debug Commands

Run in browser console:

```javascript
// Check what's on the page
console.log('ytd-thumbnail:', document.querySelectorAll('ytd-thumbnail').length);
console.log('yt-lockup-view-model:', document.querySelectorAll('yt-lockup-view-model').length);
console.log('.yt-lockup-view-model (div):', document.querySelectorAll('.yt-lockup-view-model').length);
console.log('a#thumbnail:', document.querySelectorAll('a#thumbnail').length);
console.log('a.yt-lockup-view-model__content-image:', document.querySelectorAll('a.yt-lockup-view-model__content-image').length);
console.log('a[href*="/watch?v="]:', document.querySelectorAll('a[href*="/watch?v="]').length);
```

---

## Raw Inspection Data

See `youtube-dom-inspection.json` for complete inspection results.
