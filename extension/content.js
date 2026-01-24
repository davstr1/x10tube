// X10Tube Content Script for YouTube
// Injects button next to video titles

const DEFAULT_BASE_URL = 'http://localhost:3000';

// ============================================
// Utility Functions
// ============================================

function extractVideoIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/\/shorts\/([^?&]+)/);
  return match ? match[1] : null;
}

function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isExtensionContextValid()) return;

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
});

// ============================================
// API Client
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
      const data = await chrome.storage.local.get(['x10BackendUrl']);
      if (data.x10BackendUrl) this.baseUrl = data.x10BackendUrl;

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
      const response = await fetch(`${this.baseUrl}/api/whoami`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.userCode) {
        this.userCode = data.userCode;
        if (isExtensionContextValid()) {
          await chrome.storage.local.set({ x10UserCode: data.userCode });
        }
      }
    } catch (error) {
      console.log('[X10Tube] Could not reach server:', error.message);
      if (isExtensionContextValid()) {
        const cached = await chrome.storage.local.get(['x10UserCode']);
        if (cached.x10UserCode) {
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

  async createX10(videoUrl, forceNew = false) {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: videoUrl, userCode: this.userCode || undefined, forceNew })
      });
      const data = await response.json();
      if (data.success && data.userCode) {
        this.userCode = data.userCode;
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
}

const api = new X10API();

// ============================================
// State
// ============================================

let isDropdownOpen = false;
let currentX10s = [];
let videoInX10s = [];
let titleButtonsEnabled = true;
let titleButtonInterval = null;

// ============================================
// Styles
// ============================================

function injectStyles() {
  if (document.getElementById('x10tube-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'x10tube-styles';
  styles.textContent = `
    /* Title button - next to video titles */
    .x10tube-title-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      min-width: 20px;
      min-height: 20px;
      margin-right: 8px;
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      vertical-align: middle;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.15s;
      line-height: 1;
    }

    /* Make h3 container flex for inline button alignment */
    h3.yt-lockup-metadata-view-model__heading-reset:has(.x10tube-title-btn) {
      display: flex !important;
      align-items: flex-start !important;
      flex-direction: row !important;
    }
    h3.yt-lockup-metadata-view-model__heading-reset:has(.x10tube-title-btn) > a {
      flex: 1;
    }
    .x10tube-title-btn:hover {
      background: #b91c1c;
      transform: scale(1.1);
    }
    .x10tube-title-btn.added {
      background: #22c55e;
    }
    .x10tube-title-btn.adding {
      opacity: 0.5;
      pointer-events: none;
    }

    /* Hide title buttons when disabled */
    body.x10tube-buttons-hidden .x10tube-title-btn {
      display: none !important;
    }

    /* Master toggle button */
    #x10tube-master-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      height: 36px;
      padding: 0 12px;
      background: #212121;
      border: none;
      border-radius: 18px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      transition: opacity 0.15s, transform 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Roboto', 'Arial', sans-serif;
      font-size: 14px;
      font-weight: 700;
    }
    #x10tube-master-toggle:hover {
      transform: scale(1.05);
    }
    #x10tube-master-toggle .logo-x10 {
      color: #f1f1f1;
    }
    #x10tube-master-toggle .logo-tube {
      color: #dc2626;
    }
    #x10tube-master-toggle.disabled {
      opacity: 0.5;
    }
    #x10tube-master-toggle.disabled .logo-x10,
    #x10tube-master-toggle.disabled .logo-tube {
      color: #888;
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
      font-family: 'Roboto', 'Arial', sans-serif;
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
      font-size: 14px;
      flex-shrink: 0;
      color: #f1f1f1;
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

    /* Create item styling */
    .x10-item-create {
      border-bottom: 1px solid #3f3f3f;
    }

    /* Empty state */
    .x10-empty {
      padding: 16px;
      text-align: center;
      color: #888;
      font-size: 13px;
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
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #323232;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-family: 'Roboto', 'Arial', sans-serif;
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

// ============================================
// Dropdown
// ============================================

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
    <div class="x10-footer">
      <a href="#" id="x10tube-dashboard">My x10s</a>
    </div>
  `;

  dropdown.querySelector('.x10-dropdown-close').addEventListener('click', closeDropdown);
  dropdown.querySelector('#x10tube-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    window.open(api.getDashboardUrl(), '_blank');
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  return dropdown;
}

function closeDropdown() {
  const dropdown = document.getElementById('x10tube-dropdown');
  if (dropdown) {
    dropdown.classList.remove('open');
    dropdown.style.display = 'none';
  }
  isDropdownOpen = false;
}

async function showDropdownForVideo(videoId, anchorElement) {
  injectStyles();
  createToast();

  let dropdown = document.getElementById('x10tube-dropdown');
  if (!dropdown) {
    dropdown = createDropdown();
    document.body.appendChild(dropdown);
  }

  dropdown.dataset.currentVideoId = videoId;

  // Position near the button
  const rect = anchorElement.getBoundingClientRect();
  const dropdownWidth = 280;
  const dropdownHeight = 300;

  let top = rect.bottom + 8;
  let left = rect.left;

  // Keep within viewport
  if (left + dropdownWidth > window.innerWidth) {
    left = window.innerWidth - dropdownWidth - 10;
  }
  if (top + dropdownHeight > window.innerHeight) {
    top = rect.top - dropdownHeight - 8;
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  dropdown.style.top = top + 'px';
  dropdown.style.left = left + 'px';

  dropdown.classList.add('open');
  dropdown.style.display = 'block';
  isDropdownOpen = true;

  await loadX10sForDropdown(videoId);

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!e.target.closest('#x10tube-dropdown') && !e.target.closest('.x10tube-title-btn')) {
        closeDropdown();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}

async function loadX10sForDropdown(videoId) {
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

  if (videoId) {
    const checkResult = await api.checkVideoInX10s(videoId);
    videoInX10s = checkResult.inX10s || [];
  }

  renderX10List(videoId);
}

function renderX10List(videoId) {
  const listEl = document.getElementById('x10tube-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  // Add "Create new X10" item at the top
  const createItem = document.createElement('button');
  createItem.className = 'x10-item x10-item-create';
  createItem.innerHTML = `
    <span class="x10-item-check" style="font-weight: bold;">+</span>
    <span class="x10-item-name">Create a new X10</span>
    <span class="x10-item-count"></span>
  `;
  createItem.addEventListener('click', () => handleCreateWithVideo(videoId));
  listEl.appendChild(createItem);

  // Then add existing x10s
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
      item.addEventListener('click', () => handleAddVideoToX10(x10.id, x10.title, videoId));
    } else {
      item.style.cursor = 'default';
    }
    listEl.appendChild(item);
  });
}

async function handleCreateWithVideo(videoId) {
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const createItem = document.querySelector('.x10-item-create');
  if (createItem) {
    createItem.classList.add('adding');
    const nameSpan = createItem.querySelector('.x10-item-name');
    if (nameSpan) nameSpan.textContent = 'Creating...';
  }

  const result = await api.createX10(videoUrl, true);

  if (result.success) {
    showToast('Video added to new X10!', 'success');
    closeDropdown();
    // Mark the button as added
    const btn = document.querySelector(`.x10tube-title-btn[data-video-id="${videoId}"]`);
    if (btn) {
      btn.classList.add('added');
      btn.textContent = '✓';
    }
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (createItem) {
      createItem.classList.remove('adding');
      const nameSpan = createItem.querySelector('.x10-item-name');
      if (nameSpan) nameSpan.textContent = 'Create a new X10';
    }
  }
}

async function handleAddVideoToX10(x10Id, x10Title, videoId) {
  if (!isExtensionContextValid()) {
    showToast('Please reload the page', 'error');
    return;
  }

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
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
    closeDropdown();
    // Mark the button as added
    const btn = document.querySelector(`.x10tube-title-btn[data-video-id="${videoId}"]`);
    if (btn) {
      btn.classList.add('added');
      btn.textContent = '✓';
    }
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (item) item.classList.remove('adding');
  }
}

// ============================================
// Toast
// ============================================

function createToast() {
  if (document.getElementById('x10tube-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'x10tube-toast';
  document.body.appendChild(toast);
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

// ============================================
// Title Button Injection
// ============================================

function createTitleButton(videoId) {
  const btn = document.createElement('button');
  btn.className = 'x10tube-title-btn';
  btn.textContent = '+';
  btn.title = 'Add to X10Tube';
  btn.dataset.videoId = videoId;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showDropdownForVideo(videoId, btn);
  });

  return btn;
}

function injectTitleButtons() {
  if (!titleButtonsEnabled) return;

  let count = 0;

  try {
    // Format 1: Classic format (ytd-video-renderer) - Search, Sidebar
    const classicTitles = document.querySelectorAll('ytd-video-renderer:not([data-x10-processed]) a#video-title');

    classicTitles.forEach(titleLink => {
      try {
        const renderer = titleLink.closest('ytd-video-renderer');
        if (!renderer) return;

        renderer.setAttribute('data-x10-processed', 'true');

        const videoId = extractVideoIdFromUrl(titleLink.href);
        if (!videoId) return;

        const h3 = titleLink.closest('h3');
        if (!h3 || h3.querySelector('.x10tube-title-btn')) return;

        const btn = createTitleButton(videoId);
        h3.insertBefore(btn, h3.firstChild);
        count++;
      } catch (e) {
        console.log('[X10Tube] Error injecting classic button:', e.message);
      }
    });

    // Format 2: New format (yt-lockup-metadata-view-model) - Homepage, Sidebar 2024+
    // Target the h3 directly to insert the button before the title link
    const newFormatHeadings = document.querySelectorAll('yt-lockup-metadata-view-model:not([data-x10-processed]) h3.yt-lockup-metadata-view-model__heading-reset');

    newFormatHeadings.forEach(h3 => {
      try {
        const metadata = h3.closest('yt-lockup-metadata-view-model');
        if (!metadata) return;

        metadata.setAttribute('data-x10-processed', 'true');

        // Find the title link inside the h3
        const titleLink = h3.querySelector('a.yt-lockup-metadata-view-model__title');
        if (!titleLink) return;

        let videoId = extractVideoIdFromUrl(titleLink.href);

        if (!videoId) {
          // Try to get from content-id class on a parent container
          const lockup = metadata.closest('yt-lockup-view-model');
          if (lockup) {
            const container = lockup.querySelector('[class*="content-id-"]');
            if (container) {
              const contentClass = [...container.classList].find(c => c.startsWith('content-id-'));
              videoId = contentClass?.replace('content-id-', '');
            }
          }
        }

        if (!videoId) return;

        // Check if already has button
        if (h3.querySelector('.x10tube-title-btn')) return;

        const btn = createTitleButton(videoId);
        h3.insertBefore(btn, h3.firstChild);
        count++;
      } catch (e) {
        console.log('[X10Tube] Error injecting new format button:', e.message);
      }
    });

    // Format 3: Rich grid items (ytd-rich-item-renderer) - Homepage alternative
    const richItems = document.querySelectorAll('ytd-rich-item-renderer:not([data-x10-processed]) a#video-title-link');

    richItems.forEach(titleLink => {
      try {
        const renderer = titleLink.closest('ytd-rich-item-renderer');
        if (!renderer) return;

        renderer.setAttribute('data-x10-processed', 'true');

        const videoId = extractVideoIdFromUrl(titleLink.href);
        if (!videoId) return;

        const titleContainer = titleLink.closest('#details, #meta');
        if (!titleContainer || titleContainer.querySelector('.x10tube-title-btn')) return;

        const btn = createTitleButton(videoId);
        titleContainer.insertBefore(btn, titleContainer.firstChild);
        count++;
      } catch (e) {
        console.log('[X10Tube] Error injecting rich item button:', e.message);
      }
    });
    // Format 4: Main video on watch page (ytd-watch-metadata)
    const watchPage = document.querySelector('ytd-watch-metadata:not([data-x10-processed])');
    if (watchPage) {
      try {
        watchPage.setAttribute('data-x10-processed', 'true');

        // Get videoId from URL
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');

        if (videoId) {
          // Find the title container (h1 with the video title)
          const titleContainer = watchPage.querySelector('#title h1, h1.ytd-watch-metadata');
          if (titleContainer && !titleContainer.querySelector('.x10tube-title-btn')) {
            const btn = createTitleButton(videoId);
            titleContainer.insertBefore(btn, titleContainer.firstChild);
            count++;
          }
        }
      } catch (e) {
        console.log('[X10Tube] Error injecting watch page button:', e.message);
      }
    }

  } catch (e) {
    console.error('[X10Tube] Error in injectTitleButtons:', e);
  }

  if (count > 0) {
    console.log('[X10Tube] Title buttons injected:', count);
  }
}

function startTitleButtonInjection() {
  injectTitleButtons();
  if (!titleButtonInterval) {
    // Check every 2 seconds for new videos (YouTube loads dynamically)
    titleButtonInterval = setInterval(injectTitleButtons, 2000);
  }
}

function stopTitleButtonInjection() {
  if (titleButtonInterval) {
    clearInterval(titleButtonInterval);
    titleButtonInterval = null;
  }
}

// ============================================
// Master Toggle Button
// ============================================

function createMasterToggle() {
  if (document.getElementById('x10tube-master-toggle')) return;

  const toggle = document.createElement('button');
  toggle.id = 'x10tube-master-toggle';
  toggle.innerHTML = '<span class="logo-x10">X10</span><span class="logo-tube">Tube</span>';
  toggle.title = 'Toggle X10Tube buttons';

  // Load saved state
  chrome.storage.local.get(['x10TitleButtonsEnabled'], (data) => {
    if (data.x10TitleButtonsEnabled === false) {
      titleButtonsEnabled = false;
      toggle.classList.add('disabled');
      document.body.classList.add('x10tube-buttons-hidden');
    }
  });

  toggle.addEventListener('click', () => {
    titleButtonsEnabled = !titleButtonsEnabled;

    if (titleButtonsEnabled) {
      toggle.classList.remove('disabled');
      document.body.classList.remove('x10tube-buttons-hidden');
      injectTitleButtons();
    } else {
      toggle.classList.add('disabled');
      document.body.classList.add('x10tube-buttons-hidden');
    }

    // Save state
    chrome.storage.local.set({ x10TitleButtonsEnabled: titleButtonsEnabled });

    showToast(titleButtonsEnabled ? 'X10Tube buttons enabled' : 'X10Tube buttons hidden', 'success');
  });

  document.body.appendChild(toggle);
}

// ============================================
// SPA Navigation Handling
// ============================================

let lastUrl = location.href;

function onUrlChange() {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;

  lastUrl = newUrl;
  console.log('[X10Tube] URL changed:', newUrl);

  closeDropdown();
  videoInX10s = [];

  // Reset processed markers and re-inject
  document.querySelectorAll('[data-x10-processed]').forEach(el => {
    el.removeAttribute('data-x10-processed');
  });

  // Re-inject after a short delay to let YouTube render
  setTimeout(injectTitleButtons, 500);
}

const urlObserver = new MutationObserver(() => {
  onUrlChange();
});

// ============================================
// Initialization
// ============================================

function init() {
  console.log('[X10Tube] Initializing...');

  injectStyles();
  createToast();
  createMasterToggle();

  // Start title button injection
  setTimeout(startTitleButtonInjection, 1000);

  // Watch for URL changes (SPA navigation)
  urlObserver.observe(document.body, { subtree: true, childList: true });
  window.addEventListener('popstate', onUrlChange);

  console.log('[X10Tube] Initialized');
}

// Run initialization
init();
