# Plan : Popup universelle unifiée

## Objectif

Unifier toutes les interfaces en **une seule popup overlay** (dans le content script) accessible via :
1. **Clic sur bouton titre** (YouTube) — existant, mode ancré
2. **Clic sur icône extension** — nouveau, mode centré
3. **Raccourci clavier** : `ALT+SHIFT+A` — nouveau, mode centré
4. **Menu contextuel** : clic droit → "Send to my AI" — nouveau, mode centré

---

## Architecture actuelle

```
popup.ts           → Popup browser action (clic icône) - 640 lignes
content.ts         → Dropdown YouTube uniquement - 1560 lignes
  └── showDropdownForVideo(videoId, anchorElement)  → mode ancré seulement
  └── createDropdown()                               → HTML spécifique YouTube
  └── closeDropdown()                                → ferme le dropdown
```

**Limitations actuelles :**
- Le dropdown est conçu uniquement pour les vidéos YouTube
- Pas de backdrop (fond semi-transparent)
- Pas de listener pour la touche Escape
- Content script limité à `*://*.youtube.com/*`

---

## Architecture cible

```
content.ts         → Overlay unifié pour YouTube + pages web
  └── showOverlay(options)        → mode ancré OU centré selon options
  └── createOverlay(pageInfo)     → HTML adaptatif (YouTube ou page web)
  └── closeOverlay()              → ferme l'overlay + backdrop
  └── initYouTubeFeatures()       → boutons titre, master toggle (YouTube seulement)

background.ts      → Dispatcher pour les nouveaux déclencheurs
  └── contextMenus.onClicked      → menu clic droit
  └── action.onClicked            → clic icône extension
  └── commands.onCommand          → raccourci clavier
```

---

## Étapes d'implémentation détaillées

### Phase 1 : Modifications du manifest

**Fichier : `manifest.json`**

```diff
{
  "manifest_version": 3,
  "name": "StraightToYourAI",
- "version": "3.2",
+ "version": "3.3",
  "description": "A page, a video, a document... to your AI",
- "permissions": ["activeTab", "scripting", "storage", "tabs"],
+ "permissions": ["activeTab", "scripting", "storage", "tabs", "contextMenus"],
  "host_permissions": ["<all_urls>"],

+ "commands": {
+   "open-overlay": {
+     "suggested_key": {
+       "default": "Alt+Shift+A",
+       "mac": "Alt+Shift+A"
+     },
+     "description": "Send this page to my AI"
+   }
+ },

  "action": {
-   "default_popup": "popup/popup.html",
    "default_icon": { ... }
  },

  "content_scripts": [
    {
-     "matches": ["*://*.youtube.com/*"],
+     "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

**Changements :**
- Ajout permission `contextMenus`
- Ajout section `commands` avec `Alt+Shift+A`
- Suppression de `default_popup` (le clic déclenche `action.onClicked`)
- Extension de `content_scripts.matches` à `<all_urls>`
- Bump version 3.2 → 3.3

---

### Phase 2 : Refactoring de background.ts

**Fichier : `src/background.ts`**

```typescript
// StraightToYourAI Background Service Worker

console.log('[STYA] Background service worker loaded');

// ─────────────────────────────────────────────────────────────
// Installation : créer le menu contextuel
// ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[STYA] Extension', details.reason);

  // Créer le menu contextuel
  chrome.contextMenus.create({
    id: 'stya-send-to-ai',
    title: 'Send to my AI',
    contexts: ['page', 'link', 'video', 'image']
  });
});

// ─────────────────────────────────────────────────────────────
// Handlers des déclencheurs
// ─────────────────────────────────────────────────────────────

// Menu contextuel (clic droit)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'stya-send-to-ai' && tab?.id) {
    await triggerOverlay(tab, {
      linkUrl: info.linkUrl,
      srcUrl: info.srcUrl,
      pageUrl: info.pageUrl
    });
  }
});

// Clic sur l'icône extension
chrome.action.onClicked.addListener(async (tab) => {
  await triggerOverlay(tab);
});

// Raccourci clavier (Alt+Shift+A)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-overlay') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await triggerOverlay(tab);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Fonction commune : déclencher l'overlay dans un onglet
// ─────────────────────────────────────────────────────────────

interface OverlayContext {
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
}

async function triggerOverlay(tab: chrome.tabs.Tab, context?: OverlayContext): Promise<void> {
  if (!tab.id || !tab.url) return;

  // Pages où on ne peut pas injecter de content script
  if (isRestrictedUrl(tab.url)) {
    console.log('[STYA] Page non supportée:', tab.url);
    // Feedback visuel sur l'icône
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
    return;
  }

  const message = {
    action: 'openOverlay',
    centered: true,
    context: context || { pageUrl: tab.url }
  };

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    // Content script pas encore chargé → l'injecter dynamiquement
    console.log('[STYA] Injecting content script...');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    // Attendre un peu puis réessayer
    await new Promise(r => setTimeout(r, 100));
    await chrome.tabs.sendMessage(tab.id, message);
  }
}

function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url.includes('chromewebstore.google.com') ||
    url.startsWith('file://')
  );
}
```

---

### Phase 3 : Refactoring de content.ts

#### 3.1 Restructurer l'initialisation

Ajouter la détection du contexte et modifier `init()` pour conditionner les features YouTube :

```typescript
// ============================================
// Détection du contexte (ajouter en haut du fichier, après les imports)
// ============================================

const isYouTube = window.location.hostname.includes('youtube.com');

// ============================================
// Modifier init() existant (ligne ~1540)
// ============================================

function init(): void {
  console.log('[STYA] Initializing...');

  injectStyles();
  createToast();

  // Features YouTube uniquement
  if (isYouTube) {
    createMasterToggle();
    setTimeout(startTitleButtonInjection, 1000);
    urlObserver.observe(document.body, { subtree: true, childList: true });
    window.addEventListener('popstate', onUrlChange);
  }

  console.log('[STYA] Initialized');
}

init();
```

**Note** : Le listener de messages est déjà configuré avant `init()` (ligne 61), donc pas besoin de l'appeler dans init.

#### 3.2 Modifier le listener de messages

Le listener existant (ligne 61-80) gère `getVideoInfo`. Ajouter `openOverlay` **avant** le handler existant :

```typescript
// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!isExtensionContextValid()) return;

  // Nouveau : ouvrir l'overlay (depuis background.ts)
  if (request.action === 'openOverlay') {
    showOverlay({
      centered: request.centered ?? true,
      context: request.context
    });
    sendResponse({ success: true });
    return true;  // Indique une réponse async
  }

  // Existant : info vidéo (depuis popup.ts - sera supprimé en phase 4)
  if (request.action === 'getVideoInfo') {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    if (!videoId) {
      sendResponse({ success: false, error: 'Not on a video page' });
      return true;
    }
    sendResponse({
      success: true,
      videoId: videoId,
      title: document.title.replace(' - YouTube', ''),
      url: window.location.href
    });
    return true;
  }

  return false;
});
```

#### 3.3 Types et interfaces

```typescript
interface OverlayContext {
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
}

interface OverlayOptions {
  centered: boolean;
  anchorElement?: HTMLElement;
  videoId?: string;
  context?: OverlayContext;
}

interface PageInfo {
  type: 'youtube-video' | 'webpage' | 'link';
  title: string;
  url: string;
  thumbnail?: string;
  favicon?: string;
  videoId?: string;
  channel?: string;
  duration?: string;
}
```

#### 3.4 Créer la fonction `showOverlay`

Remplacer/refactorer `showDropdownForVideo` :

```typescript
let overlayElement: HTMLDivElement | null = null;
let backdropElement: HTMLDivElement | null = null;

async function showOverlay(options: OverlayOptions): Promise<void> {
  // Fermer si déjà ouvert
  closeOverlay();

  injectStyles();
  createToast();

  // Déterminer les infos de la page/vidéo
  const pageInfo = getPageInfo(options);

  // Créer le backdrop (seulement en mode centré)
  if (options.centered) {
    backdropElement = document.createElement('div');
    backdropElement.id = 'stya-backdrop';
    backdropElement.addEventListener('click', closeOverlay);
    document.body.appendChild(backdropElement);
  }

  // Créer l'overlay
  overlayElement = createOverlay(pageInfo);
  document.body.appendChild(overlayElement);

  // Positionner
  if (options.centered) {
    overlayElement.classList.add('stya-centered');
  } else if (options.anchorElement) {
    positionNearAnchor(overlayElement, options.anchorElement);
  }

  // Bloquer le scroll de la page
  document.body.style.overflow = 'hidden';

  // Afficher
  overlayElement.classList.add('open');

  // Listeners
  document.addEventListener('keydown', handleEscapeKey);
  setupOutsideClickHandler();

  // Charger les collections
  await loadCollectionsForOverlay(pageInfo);
}

function closeOverlay(): void {
  if (overlayElement) {
    overlayElement.classList.remove('open');
    overlayElement.remove();
    overlayElement = null;
  }
  if (backdropElement) {
    backdropElement.remove();
    backdropElement = null;
  }
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleEscapeKey);
  isDropdownOpen = false;
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeOverlay();
  }
}

function positionNearAnchor(overlay: HTMLElement, anchor: HTMLElement): void {
  // Extraire la logique existante de showDropdownForVideo (lignes 996-1015)
  const rect = anchor.getBoundingClientRect();
  const overlayWidth = 280;
  const overlayHeight = 300;

  let top = rect.bottom + 8;
  let left = rect.left;

  // Garder dans le viewport
  if (left + overlayWidth > window.innerWidth) {
    left = window.innerWidth - overlayWidth - 10;
  }
  if (top + overlayHeight > window.innerHeight) {
    top = rect.top - overlayHeight - 8;
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  overlay.style.top = top + 'px';
  overlay.style.left = left + 'px';
}

function setupOutsideClickHandler(): void {
  // Logique existante (lignes 1033-1041), adaptée pour le mode
  setTimeout(() => {
    const closeHandler = (e: MouseEvent) => {
      const target = e.target as Element;
      // Ne pas fermer si clic dans l'overlay ou sur un bouton titre
      if (target.closest('#stya-dropdown') || target.closest('.stya-title-btn')) {
        return;
      }
      // Ne pas fermer si clic sur le backdrop (géré séparément)
      if (target.closest('#stya-backdrop')) {
        return;
      }
      closeOverlay();
      document.removeEventListener('click', closeHandler);
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}
```

#### 3.5 Créer `getPageInfo`

```typescript
function getPageInfo(options: OverlayOptions): PageInfo {
  // Cas 1 : videoId explicite (clic bouton titre YouTube)
  if (options.videoId) {
    return {
      type: 'youtube-video',
      title: getVideoTitleFromPage() || document.title.replace(' - YouTube', ''),
      url: `https://www.youtube.com/watch?v=${options.videoId}`,
      thumbnail: `https://img.youtube.com/vi/${options.videoId}/mqdefault.jpg`,
      videoId: options.videoId,
      channel: getChannelFromPage(),
      duration: getDurationFromPage()
    };
  }

  // Cas 2 : Page YouTube avec vidéo en cours
  if (isYouTube && window.location.pathname === '/watch') {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (videoId) {
      return {
        type: 'youtube-video',
        title: document.title.replace(' - YouTube', ''),
        url: window.location.href,
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        videoId,
        channel: getChannelFromPage(),
        duration: getDurationFromPage()
      };
    }
  }

  // Cas 3 : Lien (clic droit sur un lien)
  if (options.context?.linkUrl) {
    const linkUrl = options.context.linkUrl;
    // Détecter si c'est un lien YouTube
    const ytMatch = linkUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/);
    if (ytMatch) {
      return {
        type: 'youtube-video',
        title: linkUrl,
        url: linkUrl,
        thumbnail: `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`,
        videoId: ytMatch[1]
      };
    }
    return {
      type: 'link',
      title: linkUrl,
      url: linkUrl,
      favicon: getFaviconForUrl(linkUrl)
    };
  }

  // Cas 4 : Page web standard
  return {
    type: 'webpage',
    title: document.title || window.location.hostname,
    url: window.location.href,
    favicon: getFavicon()
  };
}

function getFavicon(): string {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );
  if (link?.href) return link.href;
  return `https://www.google.com/s2/favicons?domain=${window.location.hostname}&sz=64`;
}

function getFaviconForUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return '';
  }
}

// Helpers YouTube (existants ou à créer)
function getVideoTitleFromPage(): string | null {
  return document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim()
    || document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim()
    || null;
}

function getChannelFromPage(): string | undefined {
  return document.querySelector('#channel-name a')?.textContent?.trim()
    || document.querySelector('ytd-channel-name a')?.textContent?.trim()
    || undefined;
}

function getDurationFromPage(): string | undefined {
  return document.querySelector('.ytp-time-duration')?.textContent || undefined;
}
```

#### 3.6 Créer `createOverlay` (adaptatif)

```typescript
function createOverlay(pageInfo: PageInfo): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'stya-dropdown';  // Garder le même ID pour les styles existants
  overlay.dataset.currentUrl = pageInfo.url;
  if (pageInfo.videoId) {
    overlay.dataset.currentVideoId = pageInfo.videoId;
  }

  // Header (identique)
  const header = `
    <div class="x10-dropdown-header">
      <span class="x10-logo">
        <svg viewBox="0 0 100 100" style="width:16px;height:16px;vertical-align:-2px;margin-right:4px;">
          <path d="M35 50 L72 29 A37 37 0 1 0 72 71 Z" fill="#dc2626"/>
          <circle cx="65" cy="50" r="6" fill="#fff"/>
          <circle cx="82" cy="50" r="6" fill="#fff"/>
        </svg>
        <span class="x10-logo-main">StraightToYour</span><span class="x10-logo-ai">AI</span>
      </span>
      <button class="x10-dropdown-close">&times;</button>
    </div>
  `;

  // Info section (adaptatif selon le type)
  let infoSection: string;
  if (pageInfo.type === 'youtube-video') {
    infoSection = `
      <div class="x10-video-info" id="x10-video-info">
        <div class="x10-video-thumb" style="background-image: url(${pageInfo.thumbnail})"></div>
        <div class="x10-video-details">
          <div class="x10-video-title">${escapeHtml(pageInfo.title)}</div>
          <div class="x10-video-meta">${pageInfo.channel || 'YouTube video'}${pageInfo.duration ? ' · ' + pageInfo.duration : ''}</div>
        </div>
      </div>
    `;
  } else {
    infoSection = `
      <div class="x10-video-info" id="x10-video-info">
        <div class="x10-page-icon" style="background-image: url(${pageInfo.favicon})"></div>
        <div class="x10-video-details">
          <div class="x10-video-title">${escapeHtml(pageInfo.title)}</div>
          <div class="x10-video-meta">${new URL(pageInfo.url).hostname}</div>
        </div>
      </div>
    `;
  }

  // Quick actions (identiques)
  const quickActions = `
    <div class="x10-quick-actions">
      <button class="x10-quick-item" id="x10-open-direct" style="display:none;">
        <span class="x10-quick-icon"></span>
        <span id="x10-open-direct-label">Open in</span>
      </button>
      <button class="x10-quick-item" id="x10-open-in">
        <span class="x10-quick-icon">▸</span>
        <span>Open in...</span>
      </button>
      <div class="x10-submenu-inline" id="x10-llm-submenu">
        <button class="x10-submenu-item" data-llm="claude">Claude</button>
        <button class="x10-submenu-item" data-llm="chatgpt">ChatGPT</button>
        <button class="x10-submenu-item" data-llm="gemini">Gemini</button>
        <button class="x10-submenu-item" data-llm="perplexity">Perplexity</button>
        <button class="x10-submenu-item" data-llm="grok">Grok</button>
        <button class="x10-submenu-item" data-llm="copilot">Copilot</button>
      </div>
      <button class="x10-quick-item" id="x10-copy-link">
        <span class="x10-quick-icon">🔗</span>
        <span>Copy Link</span>
      </button>
      <button class="x10-quick-item" id="x10-copy-content">
        <span class="x10-quick-icon">📋</span>
        <span>Copy MD</span>
      </button>
    </div>
  `;

  // Collection list + footer
  const listAndFooter = `
    <div class="x10-section-label">Add to...</div>
    <div class="x10-list" id="stya-list"></div>
    <div class="x10-footer">
      <a href="#" id="stya-dashboard">My collections</a>
      <span style="color:#555;">·</span>
      <a href="#" id="stya-sync">Sync</a>
    </div>
  `;

  overlay.innerHTML = header + infoSection + quickActions + listAndFooter;

  // Event listeners
  setupOverlayListeners(overlay, pageInfo);

  return overlay;
}

function setupOverlayListeners(overlay: HTMLDivElement, pageInfo: PageInfo): void {
  // Bouton fermer
  overlay.querySelector('.x10-dropdown-close')?.addEventListener('click', closeOverlay);

  // Dashboard et Sync
  overlay.querySelector('#stya-dashboard')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(api.getDashboardUrl(), '_blank');
  });
  overlay.querySelector('#stya-sync')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(`${api.baseUrl}/sync`, '_blank');
  });

  // Open in LLM (direct)
  overlay.querySelector('#x10-open-direct')?.addEventListener('click', async () => {
    const data = await safeStorageGet(['styaLastLLM']);
    if (data.styaLastLLM) {
      handleOpenInLLM(pageInfo.url, data.styaLastLLM as string);
    }
  });

  // Open in... (submenu toggle)
  overlay.querySelector('#x10-open-in')?.addEventListener('click', () => {
    const submenu = overlay.querySelector('#x10-llm-submenu');
    submenu?.classList.toggle('open');
    const arrow = overlay.querySelector('#x10-open-in .x10-quick-icon');
    if (arrow) arrow.textContent = submenu?.classList.contains('open') ? '▾' : '▸';
  });

  // LLM submenu items
  overlay.querySelectorAll('.x10-submenu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const llm = (item as HTMLElement).dataset.llm;
      if (!llm) return;
      safeStorageSet({ styaLastLLM: llm });
      updateDirectButton(overlay, llm);
      handleOpenInLLM(pageInfo.url, llm);
    });
  });

  // Copy Link (utilise la fonction existante handleCopyMDLink)
  overlay.querySelector('#x10-copy-link')?.addEventListener('click', () => {
    handleCopyMDLink(pageInfo.url);
  });

  // Copy Content (utilise la fonction existante handleCopyMDContent)
  overlay.querySelector('#x10-copy-content')?.addEventListener('click', () => {
    handleCopyMDContent(pageInfo.url);
  });

  // Charger la préférence LLM
  safeStorageGet(['styaLastLLM']).then(data => {
    if (data.styaLastLLM) {
      updateDirectButton(overlay, data.styaLastLLM as string);
    }
  });
}
```

#### 3.7 Fonctions existantes — Aucune modification nécessaire

Les handlers existants acceptent **déjà une URL** comme paramètre :

- `handleOpenInLLM(url: string, llmType: string)` — ligne 1207
- `handleCopyMDLink(url: string)` — ligne 1232
- `handleCopyMDContent(url: string)` — ligne 1254

Ces fonctions sont déjà génériques et fonctionneront avec n'importe quelle URL (YouTube ou page web).

**Seul changement** : dans `setupOverlayListeners`, utiliser `pageInfo.url` au lieu de construire l'URL depuis `videoId` :

```typescript
// Ancien code (dans createDropdown, ligne 914) :
const url = `https://www.youtube.com/watch?v=${videoId}`;
handleCopyMDLink(url);

// Nouveau code (dans setupOverlayListeners) :
handleCopyMDLink(pageInfo.url);
```

#### 3.8 Adapter `loadX10sForDropdown` → `loadCollectionsForOverlay`

Renommer et adapter pour accepter `pageInfo` au lieu de `videoId` :

```typescript
async function loadCollectionsForOverlay(pageInfo: PageInfo): Promise<void> {
  const listEl = document.getElementById('stya-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="x10-empty">Loading...</div>';

  try {
    let initOk = await api.init();
    if (!initOk) {
      await new Promise(r => setTimeout(r, 500));
      initOk = await api.init();
    }
    if (!initOk) {
      listEl.innerHTML = `<div class="x10-empty">Could not connect<br><small style="color:#888">${api.baseUrl}</small></div>`;
      return;
    }

    const result = await api.getMyX10s();
    currentX10s = result.x10s || [];

    // Vérifier si l'URL est déjà dans des collections
    // Note : cette API pourrait nécessiter une adaptation côté serveur
    // pour supporter les URLs non-YouTube
    if (pageInfo.videoId) {
      const checkResult = await api.checkVideoInX10s(pageInfo.videoId);
      videoInX10s = checkResult.inX10s || [];
    } else {
      videoInX10s = [];  // Pour l'instant, pas de check pour les pages web
    }

    renderCollectionList(pageInfo);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    listEl.innerHTML = `<div class="x10-empty">Error: ${errorMessage}</div>`;
  }
}

function renderCollectionList(pageInfo: PageInfo): void {
  const listEl = document.getElementById('stya-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  // Bouton "Create new collection"
  const createItem = document.createElement('button');
  createItem.className = 'x10-item x10-item-create';
  createItem.innerHTML = `
    <span class="x10-item-check" style="font-weight: bold;">+</span>
    <span class="x10-item-name">A new collection</span>
    <span class="x10-item-count"></span>
  `;
  createItem.addEventListener('click', () => handleCreateWithUrl(pageInfo.url));
  listEl.appendChild(createItem);

  // Collections existantes
  currentX10s.forEach(x10 => {
    const isIn = pageInfo.videoId ? videoInX10s.includes(x10.id) : false;
    const item = document.createElement('button');
    item.className = 'x10-item';
    item.dataset.x10Id = x10.id;
    item.innerHTML = `
      <span class="x10-item-check">${isIn ? '✓' : ''}</span>
      <span class="x10-item-name">${escapeHtml(x10.title || 'Untitled')}</span>
      <span class="x10-item-count">${x10.videoCount}</span>
    `;
    if (!isIn) {
      item.addEventListener('click', () => handleAddToCollection(x10.id, x10.title, pageInfo.url));
    } else {
      item.style.cursor = 'default';
    }
    listEl.appendChild(item);
  });
}

// Adapter handleCreateWithVideo → handleCreateWithUrl
async function handleCreateWithUrl(url: string): Promise<void> {
  const createItem = document.querySelector('.x10-item-create');
  if (createItem) {
    createItem.classList.add('adding');
    const nameSpan = createItem.querySelector('.x10-item-name');
    if (nameSpan) nameSpan.textContent = 'Creating...';
  }

  const result = await api.createX10WithExtraction(url, true);

  if (result.success) {
    showToast('Added to new collection!', 'success');
    closeOverlay();
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (createItem) {
      createItem.classList.remove('adding');
      const nameSpan = createItem.querySelector('.x10-item-name');
      if (nameSpan) nameSpan.textContent = 'A new collection';
    }
  }
}

// Adapter handleAddVideoToX10 → handleAddToCollection
async function handleAddToCollection(x10Id: string, x10Title: string, url: string): Promise<void> {
  const item = document.querySelector(`[data-x10-id="${x10Id}"]`);
  if (item) item.classList.add('adding');

  const result = await api.addVideoToX10WithExtraction(x10Id, url);

  if (result.success) {
    showToast(`Added to ${x10Title || 'collection'}`, 'success');
    if (item) {
      item.classList.remove('adding');
      const check = item.querySelector('.x10-item-check');
      if (check) check.textContent = '✓';
      (item as HTMLElement).style.cursor = 'default';
    }
    closeOverlay();
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (item) item.classList.remove('adding');
  }
}
```

#### 3.9 Adapter le bridge entre `showDropdownForVideo` et `showOverlay`

Pour garder la compatibilité avec les boutons titre YouTube :

```typescript
// L'ancienne fonction devient un wrapper
async function showDropdownForVideo(videoId: string, anchorElement: HTMLElement): Promise<void> {
  await showOverlay({
    centered: false,
    anchorElement,
    videoId
  });
}
```

#### 3.10 Nouveaux styles CSS

Ajouter dans `injectStyles()` :

```css
/* Backdrop pour overlay centré */
#stya-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2147483646;
  animation: stya-fade-in 0.15s ease-out;
}

@keyframes stya-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Mode centré pour l'overlay */
#stya-dropdown.stya-centered {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: stya-scale-in 0.15s ease-out;
}

@keyframes stya-scale-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* Icône de page web (au lieu de thumbnail) */
.x10-page-icon {
  width: 48px;
  height: 48px;
  min-width: 48px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 4px;
  background-color: #3f3f3f;
}
```

---

### Phase 4 : Suppression du code obsolète

**Après validation complète :**

1. Supprimer `src/popup.ts`
2. Supprimer `popup/popup.html`
3. Supprimer `popup/popup.css`
4. Mettre à jour `build.mjs` :

```diff
const entryPoints = [
  'src/background.ts',
  'src/content.ts',
- 'src/popup.ts',
];

function copyStatic(outdir) {
  mkdirSync(`${outdir}/icons`, { recursive: true });
- mkdirSync(`${outdir}/popup`, { recursive: true });
- cpSync('popup/popup.html', `${outdir}/popup/popup.html`);
- cpSync('popup/popup.css', `${outdir}/popup/popup.css`);
  cpSync('icons', `${outdir}/icons`, { recursive: true });
  cpSync('manifest.json', `${outdir}/manifest.json`);
}
```

---

## Résumé des fichiers modifiés

| Fichier | Action | Détail |
|---------|--------|--------|
| `manifest.json` | Modifier | +contextMenus, +commands, -default_popup, matches→all_urls |
| `src/background.ts` | Réécrire | Dispatcher pour 3 déclencheurs |
| `src/content.ts` | Refactor | showOverlay(), createOverlay(), getPageInfo(), styles |
| `build.mjs` | Modifier | Retirer popup.ts des entryPoints |
| `src/popup.ts` | Supprimer | Phase 4 |
| `popup/popup.html` | Supprimer | Phase 4 |
| `popup/popup.css` | Supprimer | Phase 4 |

---

## Checklist de tests

### Déclencheurs
- [ ] Clic bouton titre YouTube → overlay ancré près du bouton
- [ ] Raccourci Alt+Shift+A sur YouTube → overlay centré
- [ ] Raccourci Alt+Shift+A sur page web → overlay centré avec favicon
- [ ] Clic icône extension sur YouTube → overlay centré
- [ ] Clic icône extension sur page web → overlay centré
- [ ] Menu contextuel sur page → overlay centré
- [ ] Menu contextuel sur lien → overlay avec infos du lien
- [ ] Menu contextuel sur lien YouTube → détection vidéo, thumbnail

### Fonctionnalités overlay
- [ ] Fermeture via bouton X
- [ ] Fermeture via Escape
- [ ] Fermeture via clic sur backdrop
- [ ] Fermeture via clic extérieur (mode ancré)
- [ ] Scroll page bloqué quand ouvert
- [ ] Scroll interne fonctionne
- [ ] Open in Claude/ChatGPT/etc
- [ ] Copy Link → crée collection, copie lien MD
- [ ] Copy MD → extrait et copie le contenu
- [ ] Liste des collections se charge
- [ ] Ajout à collection existante
- [ ] Création nouvelle collection

### Edge cases
- [ ] Page chrome:// → badge ! sur icône, pas d'erreur
- [ ] Page file:// → idem
- [ ] Chrome Web Store → idem
- [ ] Content script pas chargé → injection dynamique fonctionne
- [ ] Extension context invalidated → gestion gracieuse

---

## Ordre d'implémentation recommandé

1. **manifest.json** - Ajouter commands + contextMenus (garder default_popup pour l'instant)
2. **background.ts** - Implémenter les handlers
3. **content.ts** - Ajouter le listener `openOverlay` + styles backdrop/centré
4. **content.ts** - Créer `showOverlay()` qui appelle l'ancien `showDropdownForVideo`
5. **Tester** les 3 nouveaux déclencheurs sur YouTube
6. **content.ts** - Refactorer `createOverlay()` pour supporter pages web
7. **content.ts** - Implémenter `getPageInfo()` complet
8. **Tester** sur pages web non-YouTube
9. **manifest.json** - Retirer `default_popup`
10. **Supprimer** popup.ts, popup/, maj build.mjs
