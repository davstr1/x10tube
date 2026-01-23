// X10Tube Content Script for YouTube
// Injects button into YouTube interface

const DEFAULT_BASE_URL = 'http://localhost:3000';

// ============================================
// Video Info Functions
// ============================================

function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

function getVideoTitle() {
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string');
  return titleElement?.textContent || document.title.replace(' - YouTube', '');
}

function getChannelName() {
  const channelElement = document.querySelector('#channel-name a, ytd-channel-name a');
  return channelElement?.textContent?.trim() || '';
}

function getVideoDuration() {
  const durationElement = document.querySelector('.ytp-time-duration');
  return durationElement?.textContent || '';
}

// Check if extension context is still valid
function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isExtensionContextValid()) return;

  if (request.action === 'getVideoInfo') {
    const videoId = getVideoId();
    if (!videoId) {
      sendResponse({ success: false, error: 'Not on a video page' });
      return true;
    }
    sendResponse({
      success: true,
      videoId: videoId,
      title: getVideoTitle(),
      channel: getChannelName(),
      duration: getVideoDuration(),
      url: window.location.href
    });
    return true;
  }
});

// ============================================
// API Client (simplified - server is source of truth)
// ============================================

class X10API {
  constructor() {
    this.baseUrl = DEFAULT_BASE_URL;
    this.userCode = null;
  }

  async init() {
    if (!isExtensionContextValid()) {
      console.log('[X10Tube] Extension context invalidated');
      return false;
    }

    try {
      // Get base URL from storage
      const data = await chrome.storage.local.get(['x10BackendUrl']);
      if (data.x10BackendUrl) this.baseUrl = data.x10BackendUrl;

      // Ask the SERVER who we are - server's cookie is the source of truth
      await this.syncFromServer();

      console.log('[X10Tube] Initialized with userCode:', this.userCode);
      return true;
    } catch (error) {
      console.log('[X10Tube] Init error:', error.message);
      return false;
    }
  }

  async syncFromServer() {
    try {
      console.log('[X10Tube] Asking server /api/whoami...');
      const response = await fetch(`${this.baseUrl}/api/whoami`, {
        credentials: 'include' // This sends the httpOnly cookie!
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[X10Tube] Server says userCode:', data.userCode);

      if (data.userCode) {
        this.userCode = data.userCode;
        // Cache locally (only if extension context is valid)
        if (isExtensionContextValid()) {
          await chrome.storage.local.set({ x10UserCode: data.userCode });
        }
      }
    } catch (error) {
      console.log('[X10Tube] Could not reach server:', error.message);
      // Fallback to cached value (only if extension context is valid)
      if (isExtensionContextValid()) {
        const cached = await chrome.storage.local.get(['x10UserCode']);
        if (cached.x10UserCode) {
          console.log('[X10Tube] Using cached userCode:', cached.x10UserCode);
          this.userCode = cached.x10UserCode;
        }
      }
    }
  }

  async getMyX10s() {
    if (!this.userCode) return { x10s: [] };
    try {
      const response = await fetch(`${this.baseUrl}/api/x10s/by-code/${this.userCode}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[X10Tube] getMyX10s error:', error);
      return { x10s: [] };
    }
  }

  async createX10(videoUrl) {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: videoUrl, userCode: this.userCode || undefined })
      });
      const data = await response.json();
      if (data.success && data.userCode) {
        this.userCode = data.userCode;
        // Only save to storage if extension context is still valid
        if (isExtensionContextValid()) {
          await chrome.storage.local.set({ x10UserCode: data.userCode });
        }
      }
      return data;
    } catch (error) {
      console.error('[X10Tube] createX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  async addVideoToX10(x10Id, videoUrl) {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/${x10Id}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: videoUrl, userCode: this.userCode })
      });
      return await response.json();
    } catch (error) {
      console.error('[X10Tube] addVideoToX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  async checkVideoInX10s(youtubeId) {
    if (!this.userCode) return { inX10s: [] };
    try {
      const response = await fetch(`${this.baseUrl}/api/check-video?videoId=${youtubeId}&userCode=${this.userCode}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('[X10Tube] checkVideoInX10s error:', error);
      return { inX10s: [] };
    }
  }

  getDashboardUrl() {
    return `${this.baseUrl}/myx10s`;
  }

  getX10Url(x10Id) {
    return `${this.baseUrl}/s/${x10Id}`;
  }
}

const api = new X10API();

// ============================================
// YouTube Button Injection
// ============================================

let isDropdownOpen = false;
let currentX10s = [];
let videoInX10s = [];

function injectStyles() {
  if (document.getElementById('x10tube-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'x10tube-styles';
  styles.textContent = `
    /* X10Tube Overlay Container */
    #x10tube-overlay {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    #movie_player:hover #x10tube-overlay,
    #x10tube-overlay:hover,
    #x10tube-overlay.show {
      opacity: 1;
      pointer-events: auto;
    }

    /* X10Tube Button */
    #x10tube-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: rgba(0, 0, 0, 0.75);
      border: none;
      border-radius: 8px;
      font-family: 'Roboto', sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #f1f1f1;
      cursor: pointer;
      transition: background 0.2s;
      backdrop-filter: blur(4px);
    }
    #x10tube-btn:hover {
      background: rgba(0, 0, 0, 0.9);
    }
    #x10tube-btn .x10-logo {
      font-weight: 700;
    }
    #x10tube-btn .x10-logo-x10 {
      color: #f1f1f1;
    }
    #x10tube-btn .x10-logo-tube {
      color: #dc2626;
    }

    /* Mini button - X10Tube red circle style */
    .x10tube-mini-btn {
      width: 32px !important;
      height: 32px !important;
      min-width: 32px !important;
      min-height: 32px !important;
      background: #dc2626 !important;
      color: white !important;
      border: none !important;
      border-radius: 50% !important;
      font-size: 20px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1 !important;
      pointer-events: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important;
    }
    .x10tube-mini-btn:hover {
      background: #b91c1c !important;
      transform: scale(1.1);
    }
    .x10tube-mini-btn.added {
      background: #16a34a !important;
    }
    .x10tube-mini-btn.adding {
      opacity: 0.5 !important;
      pointer-events: none !important;
    }

    /* Button wrapper in YouTube's overlay */
    .x10tube-btn-wrapper {
      display: inline-block !important;
    }

    /* Fallback: button in thumbnail (old structure - search page) */
    ytd-thumbnail .x10tube-mini-btn:not(.x10tube-mini-btn-overlay) {
      position: absolute !important;
      top: 4px !important;
      right: 4px !important;
      z-index: 2147483647 !important;
    }

    /* Dropdown */
    #x10tube-dropdown {
      position: fixed;
      width: 280px;
      background: #282828;
      border-radius: 12px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.4);
      z-index: 2147483647;
      overflow: hidden;
      display: none;
    }
    #x10tube-dropdown.open {
      display: block !important;
    }

    /* Dropdown header */
    .x10-dropdown-header {
      padding: 12px 16px;
      border-bottom: 1px solid #3f3f3f;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .x10-dropdown-header .x10-logo {
      font-size: 16px;
      font-weight: 700;
    }
    .x10-dropdown-header .x10-logo-x10 {
      color: #f1f1f1;
    }
    .x10-dropdown-header .x10-logo-tube {
      color: #dc2626;
    }
    .x10-dropdown-close {
      background: none;
      border: none;
      color: #aaa;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .x10-dropdown-close:hover {
      color: #fff;
    }

    /* Section label */
    .x10-section-label {
      padding: 12px 16px 8px;
      font-size: 12px;
      font-weight: 500;
      color: #aaa;
    }

    /* X10 list */
    .x10-list {
      max-height: 200px;
      overflow-y: auto;
    }
    .x10-list::-webkit-scrollbar {
      width: 6px;
    }
    .x10-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .x10-list::-webkit-scrollbar-thumb {
      background: #555;
      border-radius: 3px;
    }

    /* X10 item */
    .x10-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
      font-size: 14px;
    }
    .x10-item:hover {
      background: #3f3f3f;
    }
    .x10-item.adding {
      opacity: 0.5;
      pointer-events: none;
    }
    .x10-item-check {
      width: 16px;
      color: #22c55e;
      font-size: 14px;
      flex-shrink: 0;
    }
    .x10-item-name {
      flex: 1;
      color: #f1f1f1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .x10-item-count {
      font-size: 12px;
      color: #888;
      flex-shrink: 0;
    }

    /* Empty state */
    .x10-empty {
      padding: 16px;
      text-align: center;
      color: #888;
      font-size: 13px;
    }

    /* Actions */
    .x10-actions {
      padding: 12px 16px;
      border-top: 1px solid #3f3f3f;
    }
    .x10-btn-create {
      display: block;
      width: 100%;
      padding: 10px 16px;
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }
    .x10-btn-create:hover {
      background: #b91c1c;
    }
    .x10-btn-create:disabled {
      background: #666;
      cursor: not-allowed;
    }

    /* Footer links */
    .x10-footer {
      padding: 12px 16px;
      border-top: 1px solid #3f3f3f;
      display: flex;
      justify-content: center;
      gap: 16px;
    }
    .x10-footer a {
      font-size: 13px;
      color: #aaa;
      text-decoration: none;
    }
    .x10-footer a:hover {
      color: #fff;
    }

    /* Toast */
    #x10tube-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #323232;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 99999;
      display: none;
      animation: x10-toast-in 0.2s ease-out;
    }
    #x10tube-toast.show {
      display: block;
    }
    #x10tube-toast.success {
      background: #16a34a;
    }
    #x10tube-toast.error {
      background: #dc2626;
    }
    @keyframes x10-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* X10Tube Menu Item (inside YouTube's ⋮ menu) - Native YouTube styling */
    .x10tube-menu-item {
      display: block;
      cursor: pointer;
    }
    .x10tube-menu-item tp-yt-paper-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 0 12px 0 16px;
      min-height: 36px;
      height: 36px;
      font-family: "Roboto", "Arial", sans-serif;
      font-size: 14px;
      font-weight: 400;
      line-height: 20px;
      color: var(--yt-spec-text-primary, #f1f1f1);
      cursor: pointer;
      background-color: transparent;
    }
    .x10tube-menu-item tp-yt-paper-item:hover {
      background-color: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
    }
    .x10tube-menu-item .x10tube-menu-icon {
      width: 24px;
      height: 24px;
      margin-right: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
      color: #dc2626;
    }
  `;
  document.head.appendChild(styles);
}

function createButton() {
  const btn = document.createElement('button');
  btn.id = 'x10tube-btn';
  btn.innerHTML = `
    <span class="x10-logo">+ <span class="x10-logo-x10">X10</span><span class="x10-logo-tube">Tube</span></span>
  `;
  btn.title = 'Add to X10Tube';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleDropdown();
  });
  return btn;
}

function createDropdown() {
  const dropdown = document.createElement('div');
  dropdown.id = 'x10tube-dropdown';
  dropdown.innerHTML = `
    <div class="x10-dropdown-header">
      <span class="x10-logo"><span class="x10-logo-x10">X10</span><span class="x10-logo-tube">Tube</span></span>
      <button class="x10-dropdown-close">&times;</button>
    </div>
    <div class="x10-section-label">Add to...</div>
    <div class="x10-list" id="x10tube-list"></div>
    <div class="x10-actions">
      <button class="x10-btn-create" id="x10tube-create">+ Create a new x10</button>
    </div>
    <div class="x10-footer">
      <a href="#" id="x10tube-dashboard">My x10s</a>
    </div>
  `;

  dropdown.querySelector('.x10-dropdown-close').addEventListener('click', closeDropdown);
  dropdown.querySelector('#x10tube-create').addEventListener('click', handleCreate);
  dropdown.querySelector('#x10tube-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(api.getDashboardUrl(), '_blank');
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  return dropdown;
}

function createToast() {
  if (document.getElementById('x10tube-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'x10tube-toast';
  document.body.appendChild(toast);
}

async function toggleDropdown() {
  const dropdown = document.getElementById('x10tube-dropdown');
  const btn = document.getElementById('x10tube-btn');
  const overlay = document.getElementById('x10tube-overlay');
  if (!dropdown || !btn) return;

  if (isDropdownOpen) {
    closeDropdown();
  } else {
    // Keep overlay visible while dropdown is open
    if (overlay) overlay.classList.add('show');

    // Position dropdown below button
    const rect = btn.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 8) + 'px';
    dropdown.style.left = Math.max(10, rect.right - 280) + 'px';

    dropdown.classList.add('open');
    dropdown.style.display = 'block';
    isDropdownOpen = true;
    await loadX10sForDropdown();
  }
}

function closeDropdown() {
  const dropdown = document.getElementById('x10tube-dropdown');
  const overlay = document.getElementById('x10tube-overlay');
  if (dropdown) {
    dropdown.classList.remove('open');
    dropdown.style.display = 'none';
  }
  if (overlay) {
    overlay.classList.remove('show');
  }
  isDropdownOpen = false;
}

async function loadX10sForDropdown() {
  const listEl = document.getElementById('x10tube-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="x10-empty">Loading...</div>';

  const initOk = await api.init();
  if (!initOk) {
    listEl.innerHTML = '<div class="x10-empty">Could not connect</div>';
    return;
  }

  const result = await api.getMyX10s();
  currentX10s = result.x10s || [];

  const videoId = getVideoId();
  if (videoId) {
    const checkResult = await api.checkVideoInX10s(videoId);
    videoInX10s = checkResult.inX10s || [];
  }

  renderX10List();
}

function renderX10List() {
  const listEl = document.getElementById('x10tube-list');
  if (!listEl) return;

  if (currentX10s.length === 0) {
    listEl.innerHTML = '<div class="x10-empty">No x10s yet</div>';
    return;
  }

  listEl.innerHTML = '';
  currentX10s.forEach(x10 => {
    const isIn = videoInX10s.includes(x10.id);
    const item = document.createElement('button');
    item.className = 'x10-item';
    item.dataset.x10Id = x10.id;
    item.innerHTML = `
      <span class="x10-item-check">${isIn ? '✓' : ''}</span>
      <span class="x10-item-name">${escapeHtml(x10.title || 'Untitled')}</span>
      <span class="x10-item-count">${x10.videoCount}</span>
    `;
    if (!isIn) {
      item.addEventListener('click', () => handleAddToX10(x10.id, x10.title));
    } else {
      item.style.cursor = 'default';
    }
    listEl.appendChild(item);
  });
}

async function handleCreate() {
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  const videoUrl = window.location.href;
  const btn = document.getElementById('x10tube-create');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating...';
  }

  const result = await api.createX10(videoUrl);

  if (result.success) {
    showToast('Created new x10!', 'success');
    closeDropdown();
    setTimeout(() => {
      window.open(api.getX10Url(result.x10Id), '_blank');
    }, 500);
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '+ Create a new x10';
  }
}

async function handleAddToX10(x10Id, x10Title) {
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  const videoUrl = window.location.href;
  const item = document.querySelector(`[data-x10-id="${x10Id}"]`);
  if (item) item.classList.add('adding');

  const result = await api.addVideoToX10(x10Id, videoUrl);

  if (result.success) {
    showToast(`Added to ${x10Title || 'x10'}`, 'success');
    videoInX10s.push(x10Id);
    if (item) {
      item.classList.remove('adding');
      const check = item.querySelector('.x10-item-check');
      if (check) check.textContent = '✓';
      item.style.cursor = 'default';
    }
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (item) item.classList.remove('adding');
  }
}

function showToast(message, type = '') {
  const toast = document.getElementById('x10tube-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'show' + (type ? ` ${type}` : '');
  setTimeout(() => {
    toast.className = '';
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Injection Logic
// ============================================

function findVideoPlayer() {
  // Try to find the video player container
  const selectors = [
    '#movie_player',
    '.html5-video-player',
    '#player-container-inner'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function injectButton() {
  if (!getVideoId()) return;
  if (document.getElementById('x10tube-overlay')) return;

  const player = findVideoPlayer();
  if (!player) {
    setTimeout(injectButton, 1000);
    return;
  }

  // Ensure player has position relative for absolute positioning
  const playerStyle = window.getComputedStyle(player);
  if (playerStyle.position === 'static') {
    player.style.position = 'relative';
  }

  injectStyles();
  createToast();

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'x10tube-overlay';
  overlay.appendChild(createButton());

  player.appendChild(overlay);

  // Append dropdown to body to avoid overflow clipping
  document.body.appendChild(createDropdown());

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (isDropdownOpen && !e.target.closest('#x10tube-overlay') && !e.target.closest('#x10tube-dropdown')) {
      closeDropdown();
    }
  });

  console.log('[X10Tube] Button injected on video player');
}

function removeButton() {
  const overlay = document.getElementById('x10tube-overlay');
  if (overlay) overlay.remove();
  const dropdown = document.getElementById('x10tube-dropdown');
  if (dropdown) dropdown.remove();
}

// ============================================
// Mini buttons on thumbnails
// ============================================

function extractVideoIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/\/shorts\/([^?&]+)/);
  return match ? match[1] : null;
}

function createMiniButton(videoId) {
  const btn = document.createElement('button');
  btn.className = 'x10tube-mini-btn';
  btn.textContent = '+';  // Use textContent instead of innerHTML (Trusted Types)
  btn.title = 'Add to X10Tube';
  btn.dataset.videoId = videoId;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await handleMiniButtonClick(btn, videoId);
  });

  return btn;
}

function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
  if (overlayContainer.querySelector('.x10tube-mini-btn')) return;

  const btn = createMiniButton(videoId);
  btn.classList.add('x10tube-mini-btn-overlay');

  // Create wrapper matching YouTube's button structure
  const wrapper = document.createElement('div');
  wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-btn-wrapper';
  wrapper.appendChild(btn);

  // Insert as FIRST child so it appears at top (before Watch Later, Add to Queue)
  overlayContainer.insertBefore(wrapper, overlayContainer.firstChild);
}

function setupHoverObserver(thumbnailViewModel, videoId) {
  // Check if already has observer
  if (thumbnailViewModel.dataset.x10Observer) return;
  thumbnailViewModel.dataset.x10Observer = 'true';

  // Observer to detect when YouTube adds the hover overlay
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this is the hover overlay container
          if (node.tagName.toLowerCase() === 'yt-thumbnail-hover-overlay-toggle-actions-view-model') {
            injectButtonIntoHoverOverlay(node, videoId);
          }
          // Also check children in case it's wrapped
          const overlay = node.querySelector?.('yt-thumbnail-hover-overlay-toggle-actions-view-model');
          if (overlay) {
            injectButtonIntoHoverOverlay(overlay, videoId);
          }
        }
      }
    }
  });

  observer.observe(thumbnailViewModel, { childList: true, subtree: true });
}

function injectMiniButtons() {
  // Universal selector: target ALL video links
  const videoLinks = document.querySelectorAll('a[href*="/watch?v="]:not([data-x10-processed]), a[href*="/shorts/"]:not([data-x10-processed])');

  let count = 0;
  videoLinks.forEach(link => {
    link.setAttribute('data-x10-processed', 'true');

    const videoId = extractVideoIdFromUrl(link.href);
    if (!videoId) return;

    // Skip player areas
    if (link.closest('#movie_player') || link.closest('ytd-miniplayer') || link.closest('#player')) return;

    // NEW structure: yt-thumbnail-view-model (sidebar, home)
    const thumbnailViewModel = link.closest('yt-lockup-view-model')?.querySelector('yt-thumbnail-view-model')
      || link.closest('yt-thumbnail-view-model');

    if (thumbnailViewModel) {
      // Set up observer to inject button when hover overlay appears
      setupHoverObserver(thumbnailViewModel, videoId);

      // Also check if overlay already exists (e.g., from previous hover)
      const existingOverlay = thumbnailViewModel.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      if (existingOverlay) {
        injectButtonIntoHoverOverlay(existingOverlay, videoId);
      }
      count++;
      return;
    }

    // OLD structure (search page): ytd-thumbnail
    const thumbnail = link.closest('ytd-thumbnail');
    if (thumbnail) {
      // For old structure, add button directly to thumbnail (shown on hover via CSS)
      if (thumbnail.querySelector('.x10tube-mini-btn')) return;

      const rect = thumbnail.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 80) return;

      const btn = createMiniButton(videoId);
      thumbnail.style.position = 'relative';
      thumbnail.appendChild(btn);
      count++;
      return;
    }

    // Fallback: other containers
    const container = link.closest('ytd-video-renderer') ||
      link.closest('ytd-rich-item-renderer') ||
      link.closest('.yt-lockup-view-model');

    if (container) {
      if (container.querySelector('.x10tube-mini-btn')) return;

      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 80) return;

      const btn = createMiniButton(videoId);
      container.style.position = 'relative';
      container.appendChild(btn);
      count++;
    }
  });

  if (count > 0) {
    console.log('[X10Tube] Mini buttons setup:', count);
  }
}

async function handleMiniButtonClick(btn, videoId) {
  if (btn.classList.contains('adding') || btn.classList.contains('added')) return;

  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  btn.classList.add('adding');

  // Initialize API if needed
  await api.init();

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Try to add to most recent x10, or create new one
  const result = await api.createX10(videoUrl);

  if (result.success) {
    btn.classList.remove('adding');
    btn.classList.add('added');
    btn.textContent = '✓';  // Use textContent (Trusted Types)
    showToast('Added to X10Tube!', 'success');
  } else {
    btn.classList.remove('adding');
    showToast(`Error: ${result.error}`, 'error');
  }
}

// Periodically check for new thumbnails (YouTube loads dynamically)
let miniButtonInterval = null;

function startMiniButtonInjection() {
  injectMiniButtons();
  if (!miniButtonInterval) {
    // Check every 5 seconds for new thumbnails (YouTube loads dynamically)
    miniButtonInterval = setInterval(injectMiniButtons, 5000);
  }
}

function stopMiniButtonInjection() {
  if (miniButtonInterval) {
    clearInterval(miniButtonInterval);
    miniButtonInterval = null;
  }
  // Remove all mini buttons
  document.querySelectorAll('.x10tube-mini-btn').forEach(btn => btn.remove());
  // Reset injection markers
  document.querySelectorAll('[data-x10-processed]').forEach(el => {
    el.removeAttribute('data-x10-processed');
  });
}

// ============================================
// YouTube Menu (⋮) Integration
// ============================================

let pendingMenuVideoId = null;

function setupYouTubeMenuIntegration() {
  // Listen for clicks on menu buttons (⋮) to capture videoId BEFORE popup opens
  // Use capture phase to get the event before YouTube handles it
  document.addEventListener('click', (e) => {
    try {
      // Multiple ways to detect the menu button click
      // 1. Direct click on yt-icon-button#button
      // 2. Click on button inside yt-icon-button
      // 3. Click on the icon itself
      // 4. New format: button with aria-label "More actions" (yt-lockup-view-model)
      const menuButton = e.target.closest('yt-icon-button#button') ||
                         e.target.closest('ytd-menu-renderer button') ||
                         e.target.closest('ytd-menu-renderer yt-icon') ||
                         e.target.closest('button[aria-label="More actions"]');

      if (!menuButton) return;

      // Find the menu renderer (may be null for new yt-lockup-view-model format)
      const menuRenderer = menuButton.closest('ytd-menu-renderer');
      const isLockupFormat = !!menuButton.closest('yt-lockup-view-model');

      // For classic format, we require ytd-menu-renderer
      if (!menuRenderer && !isLockupFormat) return;

      console.log('[X10Tube] Menu button clicked, format:', isLockupFormat ? 'lockup' : 'classic');

      // Skip if this is the main video's menu on /watch page (we have overlay button for that)
      // Only applies to classic format with ytd-menu-renderer
      if (menuRenderer && menuRenderer.closest('ytd-watch-metadata')) {
        console.log('[X10Tube] Skipping main video menu (use overlay button instead)');
        return;
      }

      // Find the parent video renderer
      // Search from menuButton upward for any video container
      const rendererSelectors = [
        'ytd-video-renderer',        // Search results
        'ytd-rich-item-renderer',    // Homepage
        'ytd-compact-video-renderer', // Old sidebar (may not exist anymore)
        'ytd-playlist-video-renderer', // Playlists
        'ytd-grid-video-renderer',    // Channel videos
        'ytd-playlist-panel-video-renderer', // Playlist panel
        'yt-lockup-view-model'       // New sidebar format (2024+)
      ].join(', ');

      // Search from menuButton (not menuRenderer) because menuRenderer may be null
      const renderer = menuButton.closest(rendererSelectors);

      if (!renderer) {
        console.log('[X10Tube] No video renderer found, parent chain:');
        let p = menuButton.parentElement;
        for (let i = 0; i < 8 && p; i++) {
          console.log('  ' + i + ':', p.tagName);
          p = p.parentElement;
        }
        pendingMenuVideoId = null;
        return;
      }

      console.log('[X10Tube] Found renderer:', renderer.tagName);

      // Extract the videoId from the link
      const link = renderer.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
      if (link) {
        const match = link.href.match(/[?&]v=([^&]+)/) || link.href.match(/\/shorts\/([^?&]+)/);
        pendingMenuVideoId = match ? match[1] : null;
        console.log('[X10Tube] Menu clicked for video:', pendingMenuVideoId);
      } else {
        console.log('[X10Tube] No video link found in renderer');
        pendingMenuVideoId = null;
      }
    } catch (err) {
      console.error('[X10Tube] Error in menu click handler:', err);
    }
  }, true); // Capture phase - important!

  // Observe popup container for menu opening
  setupPopupObserver();
}

function setupPopupObserver() {
  const popupContainer = document.querySelector('ytd-popup-container');
  if (!popupContainer) {
    console.log('[X10Tube] Popup container not found, retrying...');
    setTimeout(setupPopupObserver, 1000);
    return;
  }

  console.log('[X10Tube] Found popup container, setting up observer');

  const observer = new MutationObserver((mutations) => {
    if (!pendingMenuVideoId) return;

    // Check for classic popup (ytd-menu-popup-renderer)
    const classicPopup = popupContainer.querySelector('ytd-menu-popup-renderer');
    if (classicPopup) {
      console.log('[X10Tube] Classic popup detected, pendingVideoId:', pendingMenuVideoId);
      setTimeout(() => injectX10MenuItemIntoPopup(classicPopup, pendingMenuVideoId), 50);
      return;
    }

    // Check for new format popup (tp-yt-iron-dropdown with yt-list-view-model)
    const ironDropdown = popupContainer.querySelector('tp-yt-iron-dropdown:not([aria-hidden="true"])');
    if (ironDropdown) {
      const listView = ironDropdown.querySelector('yt-list-view-model');
      if (listView) {
        console.log('[X10Tube] New format popup detected, pendingVideoId:', pendingMenuVideoId);
        setTimeout(() => injectX10MenuItemIntoNewPopup(ironDropdown, pendingMenuVideoId), 50);
      }
    }
  });

  observer.observe(popupContainer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'hidden', 'aria-hidden']
  });

  console.log('[X10Tube] Popup observer set up successfully');
}

function injectX10MenuItemIntoPopup(popup, videoId) {
  // Check if already injected
  const existingItem = popup.querySelector('.x10tube-menu-item');
  if (existingItem) {
    // Update videoId if different
    if (existingItem.dataset.videoId === videoId) return;
    existingItem.remove();
  }

  // Find the items list
  const itemsList = popup.querySelector('tp-yt-paper-listbox#items');
  if (!itemsList) {
    console.log('[X10Tube] Could not find menu items list');
    return;
  }

  // Create X10Tube menu item
  const x10Item = createX10MenuItem(videoId);

  // Insert as first item
  itemsList.insertBefore(x10Item, itemsList.firstChild);
  console.log('[X10Tube] Menu item injected for video:', videoId);
}

// Inject menu item into new format popup (yt-list-view-model)
function injectX10MenuItemIntoNewPopup(dropdown, videoId) {
  // Check if already injected
  const existingItem = dropdown.querySelector('.x10tube-menu-item');
  if (existingItem) {
    if (existingItem.dataset.videoId === videoId) return;
    existingItem.remove();
  }

  // Find the list view model
  const listView = dropdown.querySelector('yt-list-view-model');
  if (!listView) {
    console.log('[X10Tube] Could not find yt-list-view-model');
    return;
  }

  // Create X10Tube menu item for new format
  const x10Item = createX10MenuItemNewFormat(videoId);

  // Insert as first item
  listView.insertBefore(x10Item, listView.firstChild);
  console.log('[X10Tube] Menu item injected (new format) for video:', videoId);
}

// Create menu item matching the new yt-list-item-view-model format
function createX10MenuItemNewFormat(videoId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'x10tube-menu-item x10tube-menu-item-new';
  wrapper.dataset.videoId = videoId;
  wrapper.setAttribute('role', 'menuitem');
  wrapper.setAttribute('tabindex', '0');

  wrapper.innerHTML = `
    <div style="display: flex; flex-direction: row; align-items: center; padding: 0 12px 0 16px; min-height: 36px; height: 36px; cursor: pointer; color: var(--yt-spec-text-primary, #f1f1f1);">
      <div style="width: 24px; height: 24px; margin-right: 12px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 18px; font-weight: bold; color: #dc2626;">+</span>
      </div>
      <span style="font-size: 14px; font-family: Roboto, Arial, sans-serif; font-weight: 400; line-height: 20px;">Add to X10Tube</span>
    </div>
  `;

  // Hover effect
  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.backgroundColor = 'var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1))';
  });
  wrapper.addEventListener('mouseleave', () => {
    wrapper.style.backgroundColor = 'transparent';
  });

  // Click handler - capture click position
  wrapper.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleX10MenuItemClick(videoId, { x: e.clientX, y: e.clientY });
  });

  return wrapper;
}

function createX10MenuItem(videoId) {
  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'x10tube-menu-item';
  wrapper.setAttribute('role', 'option');
  wrapper.setAttribute('tabindex', '-1');
  wrapper.dataset.videoId = videoId;

  // Paper item (YouTube's structure)
  const paperItem = document.createElement('tp-yt-paper-item');
  paperItem.className = 'style-scope ytd-menu-service-item-renderer';
  paperItem.setAttribute('role', 'option');
  paperItem.setAttribute('tabindex', '0');

  // Icon container
  const iconContainer = document.createElement('div');
  iconContainer.className = 'x10tube-menu-icon';
  iconContainer.textContent = '+';

  // Text
  const text = document.createElement('yt-formatted-string');
  text.className = 'style-scope ytd-menu-service-item-renderer';
  text.textContent = 'Add to X10Tube';

  // Assemble
  paperItem.appendChild(iconContainer);
  paperItem.appendChild(text);
  wrapper.appendChild(paperItem);

  // Click handler - capture click position
  wrapper.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleX10MenuItemClick(videoId, { x: e.clientX, y: e.clientY });
  });

  return wrapper;
}

function handleX10MenuItemClick(videoId, clickPosition) {
  console.log('[X10Tube] Menu item clicked for video:', videoId);

  // Close YouTube's menu
  const ironDropdown = document.querySelector('tp-yt-iron-dropdown[aria-hidden="false"], tp-yt-iron-dropdown:not([aria-hidden])');
  if (ironDropdown) {
    ironDropdown.setAttribute('aria-hidden', 'true');
    ironDropdown.style.display = 'none';
  }
  // Also try pressing Escape
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  // Show X10Tube dropdown near click position
  showX10DropdownForVideo(videoId, clickPosition);
}

async function showX10DropdownForVideo(videoId, clickPosition) {
  injectStyles();
  createToast();

  // Create or get dropdown
  let dropdown = document.getElementById('x10tube-dropdown');
  if (!dropdown) {
    dropdown = createDropdown();
    document.body.appendChild(dropdown);
  }

  // Store the videoId for actions
  dropdown.dataset.currentVideoId = videoId;

  // Position near the click (with some offset so it doesn't cover the cursor)
  const dropdownWidth = 280;
  const dropdownHeight = 350; // approximate
  let top = clickPosition.y - 20;
  let left = clickPosition.x - dropdownWidth - 10;

  // Keep within viewport bounds
  if (left < 10) {
    left = clickPosition.x + 10; // Show to the right instead
  }
  if (top + dropdownHeight > window.innerHeight) {
    top = window.innerHeight - dropdownHeight - 10;
  }
  if (top < 10) {
    top = 10;
  }

  dropdown.style.top = top + 'px';
  dropdown.style.left = left + 'px';

  // Open dropdown
  dropdown.classList.add('open');
  dropdown.style.display = 'block';
  isDropdownOpen = true;

  // Load X10s
  await loadX10sForDropdownWithVideoId(videoId);

  // Setup close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!e.target.closest('#x10tube-dropdown')) {
        closeDropdown();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}

async function loadX10sForDropdownWithVideoId(videoId) {
  const listEl = document.getElementById('x10tube-list');
  if (!listEl) return;

  listEl.textContent = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'x10-empty';
  loadingDiv.textContent = 'Loading...';
  listEl.appendChild(loadingDiv);

  const initOk = await api.init();
  if (!initOk) {
    listEl.textContent = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'x10-empty';
    errorDiv.textContent = 'Could not connect';
    listEl.appendChild(errorDiv);
    return;
  }

  const result = await api.getMyX10s();
  currentX10s = result.x10s || [];

  // Check if video is already in x10s
  if (videoId) {
    const checkResult = await api.checkVideoInX10s(videoId);
    videoInX10s = checkResult.inX10s || [];
  }

  renderX10ListForVideo(videoId);
}

function renderX10ListForVideo(videoId) {
  const listEl = document.getElementById('x10tube-list');
  const dropdown = document.getElementById('x10tube-dropdown');
  if (!listEl) return;

  listEl.textContent = '';

  if (currentX10s.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'x10-empty';
    emptyDiv.textContent = 'No x10s yet';
    listEl.appendChild(emptyDiv);
    return;
  }

  currentX10s.forEach(x10 => {
    const isIn = videoInX10s.includes(x10.id);
    const item = document.createElement('button');
    item.className = 'x10-item';
    item.dataset.x10Id = x10.id;

    const check = document.createElement('span');
    check.className = 'x10-item-check';
    check.textContent = isIn ? '✓' : '';

    const name = document.createElement('span');
    name.className = 'x10-item-name';
    name.textContent = x10.title || 'Untitled';

    const count = document.createElement('span');
    count.className = 'x10-item-count';
    count.textContent = x10.videoCount;

    item.appendChild(check);
    item.appendChild(name);
    item.appendChild(count);

    if (!isIn) {
      item.addEventListener('click', () => handleAddVideoToX10(x10.id, x10.title, videoId));
    } else {
      item.style.cursor = 'default';
    }
    listEl.appendChild(item);
  });

  // Update create button to use the current video
  const createBtn = document.getElementById('x10tube-create');
  if (createBtn) {
    createBtn.onclick = () => handleCreateWithVideo(videoId);
  }
}

async function handleAddVideoToX10(x10Id, x10Title, videoId) {
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('[X10Tube] Adding video to x10:', { x10Id, videoId, videoUrl });

  const item = document.querySelector(`[data-x10-id="${x10Id}"]`);
  if (item) item.classList.add('adding');

  const result = await api.addVideoToX10(x10Id, videoUrl);
  console.log('[X10Tube] Add result:', result);

  if (result.success) {
    showToast(`Added to ${x10Title || 'x10'}`, 'success');
    videoInX10s.push(x10Id);
    if (item) {
      item.classList.remove('adding');
      const check = item.querySelector('.x10-item-check');
      if (check) check.textContent = '✓';
      item.style.cursor = 'default';
    }
    closeDropdown();
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (item) item.classList.remove('adding');
  }
}

async function handleCreateWithVideo(videoId) {
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const btn = document.getElementById('x10tube-create');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating...';
  }

  const result = await api.createX10(videoUrl);

  if (result.success) {
    showToast('Created new x10!', 'success');
    closeDropdown();
    setTimeout(() => {
      window.open(api.getX10Url(result.x10Id), '_blank');
    }, 500);
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '+ Create a new x10';
  }
}

// ============================================
// SPA Navigation Handling
// ============================================

let lastUrl = location.href;
let injectionTimeout = null;

function onUrlChange() {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;

  lastUrl = newUrl;
  console.log('[X10Tube] URL changed:', newUrl);

  removeButton();
  closeDropdown();
  videoInX10s = [];

  // Main button only on watch pages
  if (getVideoId()) {
    clearTimeout(injectionTimeout);
    injectionTimeout = setTimeout(injectButton, 1000);
  }

}

const observer = new MutationObserver(() => {
  onUrlChange();
});

observer.observe(document.body, { subtree: true, childList: true });
window.addEventListener('popstate', onUrlChange);

// Initial injection
injectStyles();
createToast();

// Main button on watch pages
if (getVideoId()) {
  setTimeout(injectButton, 1500);
}

// YouTube menu (⋮) integration - works on all pages with video thumbnails
setTimeout(setupYouTubeMenuIntegration, 1000);
