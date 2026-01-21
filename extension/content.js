// X10Tube Content Script for YouTube
// Injects button into YouTube interface and provides video info to popup

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
// API Client (simplified for content script)
// ============================================

class X10API {
  constructor() {
    this.baseUrl = DEFAULT_BASE_URL;
    this.userCode = null;
  }

  async init() {
    if (!isExtensionContextValid()) {
      console.log('[X10Tube] Extension context invalidated, please reload the page');
      return false;
    }
    try {
      const data = await chrome.storage.local.get(['x10BackendUrl', 'x10UserCode']);
      if (data.x10BackendUrl) this.baseUrl = data.x10BackendUrl;
      if (data.x10UserCode) {
        this.userCode = data.x10UserCode;
      } else {
        // Try to read from website cookie
        await this.syncFromCookie();
      }
      return true;
    } catch (error) {
      console.log('[X10Tube] Extension context invalidated:', error.message);
      return false;
    }
  }

  async syncFromCookie() {
    try {
      const urls = ['http://localhost:3000', 'https://x10tube.com'];
      for (const url of urls) {
        const cookie = await chrome.cookies.get({ url, name: 'x10_user_code' });
        if (cookie && cookie.value) {
          this.userCode = cookie.value;
          await chrome.storage.local.set({ x10UserCode: cookie.value });
          console.log('[X10Tube] User code synced from cookie');
          return true;
        }
      }
    } catch (error) {
      console.log('[X10Tube] Could not read cookie:', error.message);
    }
    return false;
  }

  async setUserCode(code) {
    if (!isExtensionContextValid()) return;
    this.userCode = code;
    try {
      await chrome.storage.local.set({ x10UserCode: code });
    } catch (error) {
      console.log('[X10Tube] Could not save user code:', error.message);
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
        body: JSON.stringify({ url: videoUrl, userCode: this.userCode || undefined })
      });
      const data = await response.json();
      if (data.success && data.userCode && !this.userCode) {
        await this.setUserCode(data.userCode);
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
    return `${this.baseUrl}/dashboard`;
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
    /* X10Tube Button */
    #x10tube-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      height: 36px;
      background: transparent;
      border: none;
      border-radius: 18px;
      font-family: 'Roboto', sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #f1f1f1;
      cursor: pointer;
      transition: background 0.2s;
    }
    #x10tube-btn:hover {
      background: rgba(255,255,255,0.1);
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
    #x10tube-btn .x10-arrow {
      font-size: 10px;
      margin-left: 2px;
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
  `;
  document.head.appendChild(styles);
}

function createButton() {
  const btn = document.createElement('button');
  btn.id = 'x10tube-btn';
  btn.innerHTML = `
    <span class="x10-logo"><span class="x10-logo-x10">X10</span><span class="x10-logo-tube">Tube</span></span>
    <span class="x10-arrow">▼</span>
  `;
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
      <a href="#" id="x10tube-dashboard">My dashboard</a>
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
  if (!dropdown || !btn) return;

  if (isDropdownOpen) {
    closeDropdown();
  } else {
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
  if (dropdown) {
    dropdown.classList.remove('open');
    dropdown.style.display = 'none';
  }
  isDropdownOpen = false;
}

async function loadX10sForDropdown() {
  const listEl = document.getElementById('x10tube-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="x10-empty">Loading...</div>';

  const initOk = await api.init();
  if (!initOk) {
    listEl.innerHTML = '<div class="x10-empty">Please reload the page</div>';
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

function findActionBar() {
  // Try different selectors for YouTube's action bar
  const selectors = [
    '#top-level-buttons-computed',
    'ytd-menu-renderer #top-level-buttons-computed',
    '#actions #top-level-buttons-computed',
    'ytd-watch-metadata #actions-inner #menu #top-level-buttons-computed'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function injectButton() {
  if (!getVideoId()) return;
  if (document.getElementById('x10tube-btn')) return;

  const actionBar = findActionBar();
  if (!actionBar) {
    // Retry later
    setTimeout(injectButton, 1000);
    return;
  }

  injectStyles();
  createToast();

  // Create container for button
  const container = document.createElement('div');
  container.id = 'x10tube-container';
  container.style.cssText = 'display: inline-flex; align-items: center;';

  container.appendChild(createButton());
  actionBar.appendChild(container);

  // Append dropdown to body to avoid overflow clipping
  document.body.appendChild(createDropdown());

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (isDropdownOpen && !e.target.closest('#x10tube-container') && !e.target.closest('#x10tube-dropdown')) {
      closeDropdown();
    }
  });

  console.log('[X10Tube] Button injected');
}

function removeButton() {
  const container = document.getElementById('x10tube-container');
  if (container) container.remove();
  const dropdown = document.getElementById('x10tube-dropdown');
  if (dropdown) dropdown.remove();
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

  // Remove old button
  removeButton();
  closeDropdown();
  videoInX10s = [];

  // Inject new button if on video page
  if (getVideoId()) {
    clearTimeout(injectionTimeout);
    injectionTimeout = setTimeout(injectButton, 1000);
  }
}

// Watch for URL changes (YouTube is SPA)
const observer = new MutationObserver(() => {
  onUrlChange();
});

observer.observe(document.body, { subtree: true, childList: true });

// Also listen to popstate
window.addEventListener('popstate', onUrlChange);

// Initial injection
if (getVideoId()) {
  setTimeout(injectButton, 1500);
}
