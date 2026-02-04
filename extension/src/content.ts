// StraightToYourAI Content Script for YouTube
// Injects button next to video titles

import { config } from './lib/config';
import type { AddContentPayload } from './lib/types';
import { getTranscript, extractVideoId as extractYoutubeId } from './lib/innertube';

// ============================================
// Safe Storage Helpers (handle context invalidation gracefully)
// ============================================

function safeStorageSet(data: Record<string, unknown>): void {
  try {
    chrome.storage?.local?.set(data);
  } catch {
    // Context invalidated - not critical, just cache
  }
}

async function safeStorageGet(keys: string[]): Promise<Record<string, unknown>> {
  try {
    return await chrome.storage?.local?.get(keys) ?? {};
  } catch {
    return {};
  }
}

function safeStorageGetCallback(keys: string[], callback: (data: Record<string, unknown>) => void): void {
  try {
    chrome.storage?.local?.get(keys, callback);
  } catch {
    callback({});
  }
}

// ============================================
// Utility Functions
// ============================================

function extractVideoIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/\/shorts\/([^?&]+)/);
  return match ? match[1] : null;
}

function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
  return false;
});

// ============================================
// API Client (proxies through background script)
// ============================================

interface X10Collection {
  id: string;
  title: string;
  videoCount: number;
}

class X10API {
  baseUrl: string;
  userCode: string | null;

  constructor() {
    this.baseUrl = config.baseUrl;
    this.userCode = null;
  }

  // Direct fetch (no service worker proxy - avoids context invalidation)
  async _fetch(endpoint: string, options: {
    method?: string;
    body?: unknown;
  } = {}): Promise<Record<string, unknown> & { _ok: boolean; _status: number }> {
    const url = this.baseUrl + endpoint;

    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      credentials: 'include',
    };

    if (options.body) {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      return { ...data, _ok: response.ok, _status: response.status };
    } catch (error) {
      // Network error or JSON parse error
      return {
        _ok: false,
        _status: 0,
        _error: true,
        message: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async init(): Promise<boolean> {
    // Already initialized in memory
    if (this.userCode) return true;

    // Try cache first (safeStorageGet handles errors gracefully)
    const cached = await safeStorageGet(['styaUserCode', 'styaBackendUrl']);
    if (cached.styaBackendUrl) this.baseUrl = cached.styaBackendUrl as string;
    if (cached.styaUserCode) {
      this.userCode = cached.styaUserCode as string;
      console.log('[STYA] Init from cache:', this.userCode);
      // Sync in background (non-blocking)
      this.syncFromServer().catch(() => {});
      return true;
    }

    // No cache — must sync from server
    return this.syncFromServer();
  }

  async syncFromServer(): Promise<boolean> {
    try {
      console.log('[STYA] Syncing from server...');
      const data = await this._fetch('/api/whoami');

      if (!data._ok) {
        throw new Error(`HTTP ${data._status}`);
      }

      if (data.userCode) {
        this.userCode = data.userCode as string;
        safeStorageSet({ styaUserCode: data.userCode });
      }
      console.log('[STYA] Synced, userCode:', this.userCode);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] syncFromServer failed:', errorMessage);
      return false;
    }
  }

  async getMyX10s(): Promise<{ x10s: X10Collection[] }> {
    if (!this.userCode) return { x10s: [] };
    try {
      const data = await this._fetch(`/api/x10s/by-code/${this.userCode}`);
      if (!data._ok) throw new Error(`HTTP ${data._status}`);
      return { x10s: (data.x10s as X10Collection[]) || [] };
    } catch (error) {
      console.error('[STYA] getMyX10s error:', error);
      return { x10s: [] };
    }
  }

  async checkVideoInX10s(youtubeId: string): Promise<{ inX10s: string[] }> {
    if (!this.userCode) return { inX10s: [] };
    try {
      const data = await this._fetch(`/api/check-video?videoId=${youtubeId}&userCode=${this.userCode}`);
      if (!data._ok) throw new Error(`HTTP ${data._status}`);
      return { inX10s: (data.inX10s as string[]) || [] };
    } catch (error) {
      console.error('[STYA] checkVideoInX10s error:', error);
      return { inX10s: [] };
    }
  }

  // NEW: Extract transcript locally and send to server (frontend extraction)
  async createX10WithExtraction(
    videoUrl: string,
    forceNew = false
  ): Promise<{ success: boolean; x10Id?: string; userCode?: string; error?: string }> {
    try {
      // Extract video ID
      const videoId = extractYoutubeId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      console.log('[STYA] Extracting transcript for:', videoId);

      // Extract transcript locally (runs in user's browser = user's IP)
      const result = await getTranscript(videoId);

      console.log('[STYA] Got transcript, sending to server...');

      // Build payload
      const payload: AddContentPayload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: result.title,
        type: 'youtube',
        content: result.transcript,
        youtube_id: videoId,
        channel: result.channel,
        duration: result.duration,
        forceNew
      };

      // Send pre-extracted content to server
      const data = await this._fetch('/api/x10/add-content', {
        method: 'POST',
        body: { ...payload, userCode: this.userCode || undefined },
      });

      if (data.success && data.userCode) {
        this.userCode = data.userCode as string;
        safeStorageSet({ styaUserCode: data.userCode });
      }

      return {
        success: !!data.success,
        x10Id: data.collectionId as string | undefined,
        userCode: data.userCode as string | undefined,
        error: data.error as string | undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] createX10WithExtraction error:', error);
      return { success: false, error: errorMessage };
    }
  }

  // NEW: Add video to existing collection with frontend extraction
  async addVideoToX10WithExtraction(
    x10Id: string,
    videoUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const videoId = extractYoutubeId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      console.log('[STYA] Extracting transcript for:', videoId);
      const result = await getTranscript(videoId);

      const payload: AddContentPayload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: result.title,
        type: 'youtube',
        content: result.transcript,
        youtube_id: videoId,
        channel: result.channel,
        duration: result.duration,
        collectionId: x10Id
      };

      const data = await this._fetch('/api/x10/add-content', {
        method: 'POST',
        body: { ...payload, userCode: this.userCode || undefined },
      });

      return {
        success: data._ok || !!data.success,
        error: data.error as string | undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] addVideoToX10WithExtraction error:', error);
      return { success: false, error: errorMessage };
    }
  }

  getDashboardUrl(): string {
    return `${this.baseUrl}/collections`;
  }
}

const api = new X10API();

// ============================================
// State
// ============================================

let isDropdownOpen = false;
let currentX10s: X10Collection[] = [];
let videoInX10s: string[] = [];
let titleButtonsEnabled = true;
let titleButtonInterval: ReturnType<typeof setInterval> | null = null;

// ============================================
// Styles
// ============================================

function injectStyles(): void {
  if (document.getElementById('stya-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'stya-styles';
  styles.textContent = `
    /* Title button - next to video titles */
    .stya-title-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      min-width: 20px;
      min-height: 20px;
      margin-right: 8px;
      background: none;
      border: none;
      cursor: pointer;
      vertical-align: middle;
      flex-shrink: 0;
      transition: transform 0.15s, opacity 0.15s;
      line-height: 1;
      padding: 0;
      opacity: 0.8;
      outline: none;
      background: transparent;
    }

    /* Make h3 container flex for inline button alignment */
    h3.yt-lockup-metadata-view-model__heading-reset:has(.stya-title-btn) {
      display: flex !important;
      align-items: flex-start !important;
      flex-direction: row !important;
    }
    h3.yt-lockup-metadata-view-model__heading-reset:has(.stya-title-btn) > a {
      flex: 1;
    }
    .stya-title-btn:hover {
      opacity: 1;
      transform: scale(1.15);
    }
    .stya-title-btn.added svg path {
      fill: #22c55e;
    }
    .stya-title-btn.adding {
      opacity: 0.5;
      pointer-events: none;
    }

    /* Hide title buttons when disabled */
    body.stya-buttons-hidden .stya-title-btn {
      display: none !important;
    }

    /* Master toggle button */
    #stya-master-toggle {
      height: 36px;
      padding: 0 12px;
      background: #212121;
      border: none;
      border-radius: 18px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      transition: opacity 0.15s, transform 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Roboto', 'Arial', sans-serif;
      font-size: 14px;
      font-weight: 700;
    }
    #stya-master-toggle:hover {
      transform: scale(1.05);
    }
    #stya-master-toggle .logo-main {
      color: #f1f1f1;
    }
    #stya-master-toggle .logo-ai {
      color: #dc2626;
    }
    #stya-master-toggle.disabled {
      opacity: 0.5;
    }
    #stya-master-toggle.disabled .logo-main,
    #stya-master-toggle.disabled .logo-ai {
      color: #888;
    }

    /* Master toggle container with hover menu */
    #stya-toggle-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
    }
    #stya-toggle-menu {
      position: absolute;
      bottom: 100%;
      right: 0;
      margin-bottom: 8px;
      background: #282828;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      opacity: 0;
      visibility: hidden;
      transform: translateY(5px);
      transition: opacity 0.15s, visibility 0.15s, transform 0.15s;
      white-space: nowrap;
      overflow: hidden;
    }
    #stya-toggle-container:hover #stya-toggle-menu {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
    #stya-toggle-menu a {
      display: block;
      padding: 10px 16px;
      color: #f1f1f1;
      text-decoration: none;
      font-family: 'Roboto', 'Arial', sans-serif;
      font-size: 13px;
      transition: background 0.1s;
    }
    #stya-toggle-menu a:hover {
      background: #3a3a3a;
    }

    /* Dropdown */
    #stya-dropdown {
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
    #stya-dropdown.open {
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
    .x10-dropdown-header .x10-logo-main {
      color: #f1f1f1;
    }
    .x10-dropdown-header .x10-logo-ai {
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

    /* Video info in dropdown */
    .x10-video-info {
      padding: 12px 16px;
      border-bottom: 1px solid #3f3f3f;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .x10-video-thumb {
      width: 80px;
      height: 45px;
      background: #3f3f3f;
      border-radius: 4px;
      flex-shrink: 0;
      background-size: cover;
      background-position: center;
    }
    .x10-video-details {
      flex: 1;
      min-width: 0;
    }
    .x10-video-title {
      font-size: 13px;
      font-weight: 500;
      color: #f1f1f1;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.3;
    }
    .x10-video-meta {
      font-size: 12px;
      color: #aaa;
      margin-top: 2px;
    }

    /* Quick actions */
    .x10-quick-actions {
      border-bottom: 1px solid #3f3f3f;
      padding: 8px 0;
    }
    .x10-quick-item {
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
      color: #f1f1f1;
      position: relative;
    }
    .x10-quick-item:hover {
      background: #3f3f3f;
    }
    .x10-quick-icon {
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }

    /* Inline submenu (toggle via JS click) */
    .x10-submenu-inline {
      display: none;
      background: #1f1f1f;
      padding: 4px 0;
    }
    .x10-submenu-inline.open {
      display: block;
    }
    .x10-submenu-item {
      display: block;
      width: 100%;
      padding: 10px 16px 10px 42px;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      color: #f1f1f1;
      transition: background 0.15s;
    }
    .x10-submenu-item:hover {
      background: #3f3f3f;
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
    #stya-toast {
      position: fixed;
      top: 80px;
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
    #stya-toast.show {
      display: block;
    }
    #stya-toast.success {
      background: #16a34a;
    }
    #stya-toast.error {
      background: #dc2626;
    }
    @keyframes x10-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(styles);
}

// ============================================
// Dropdown
// ============================================

function createDropdown(): HTMLDivElement {
  const dropdown = document.createElement('div');
  dropdown.id = 'stya-dropdown';
  dropdown.innerHTML = `
    <div class="x10-dropdown-header">
      <span class="x10-logo"><svg viewBox="0 0 100 100" style="width:16px;height:16px;vertical-align:-2px;margin-right:4px;"><path d="M35 50 L72 29 A37 37 0 1 0 72 71 Z" fill="#dc2626"/><circle cx="65" cy="50" r="6" fill="#fff"/><circle cx="82" cy="50" r="6" fill="#fff"/></svg><span class="x10-logo-main">StraightToYour</span><span class="x10-logo-ai">AI</span></span>
      <button class="x10-dropdown-close">&times;</button>
    </div>
    <div class="x10-video-info" id="x10-video-info">
      <div class="x10-video-thumb" id="x10-video-thumb"></div>
      <div class="x10-video-details">
        <div class="x10-video-title" id="x10-video-title"></div>
        <div class="x10-video-meta" id="x10-video-meta"></div>
      </div>
    </div>
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
        <span>Copy MD Link</span>
      </button>
      <button class="x10-quick-item" id="x10-copy-content">
        <span class="x10-quick-icon">📋</span>
        <span>Copy MD Content</span>
      </button>
    </div>
    <div class="x10-section-label">Add to...</div>
    <div class="x10-list" id="stya-list"></div>
    <div class="x10-footer">
      <a href="#" id="stya-dashboard">My collections</a>
      <span style="color:#555;">·</span>
      <a href="#" id="stya-sync">Sync</a>
    </div>
  `;

  dropdown.querySelector('.x10-dropdown-close')?.addEventListener('click', closeDropdown);
  dropdown.querySelector('#stya-dashboard')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(api.getDashboardUrl(), '_blank');
  });
  dropdown.querySelector('#stya-sync')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(`${api.baseUrl}/sync`, '_blank');
  });

  // Direct open button
  dropdown.querySelector('#x10-open-direct')?.addEventListener('click', async () => {
    const videoId = dropdown.dataset.currentVideoId;
    if (!videoId) { showToast('Please select a video first', 'error'); return; }
    const data = await safeStorageGet(['styaLastLLM']);
    if (!data.styaLastLLM) return;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    handleOpenInLLM(url, data.styaLastLLM as string);
  });

  // Toggle "Open in..." submenu on click
  dropdown.querySelector('#x10-open-in')?.addEventListener('click', () => {
    const submenu = dropdown.querySelector('#x10-llm-submenu');
    submenu?.classList.toggle('open');
    const arrow = dropdown.querySelector('#x10-open-in .x10-quick-icon');
    if (arrow) arrow.textContent = submenu?.classList.contains('open') ? '▾' : '▸';
  });

  // Quick action handlers - use the videoId from dropdown state
  dropdown.querySelectorAll('.x10-submenu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const videoId = dropdown.dataset.currentVideoId;
      if (!videoId) {
        showToast('Please select a video first', 'error');
        return;
      }
      const llm = (item as HTMLElement).dataset.llm;
      if (!llm) return;
      // Save preference
      safeStorageSet({ styaLastLLM: llm });
      updateDirectButton(dropdown, llm);
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      handleOpenInLLM(url, llm);
    });
  });

  dropdown.querySelector('#x10-copy-link')?.addEventListener('click', () => {
    const videoId = dropdown.dataset.currentVideoId;
    if (!videoId) {
      showToast('Please select a video first', 'error');
      return;
    }
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    handleCopyMDLink(url);
  });

  dropdown.querySelector('#x10-copy-content')?.addEventListener('click', () => {
    const videoId = dropdown.dataset.currentVideoId;
    if (!videoId) {
      showToast('Please select a video first', 'error');
      return;
    }
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    handleCopyMDContent(url);
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  return dropdown;
}

const LLM_NAMES: Record<string, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  copilot: 'Copilot'
};

function updateDirectButton(dropdown: HTMLElement, llmKey: string): void {
  const btn = dropdown.querySelector('#x10-open-direct') as HTMLElement | null;
  const label = dropdown.querySelector('#x10-open-direct-label');
  if (btn && label && llmKey && LLM_NAMES[llmKey]) {
    label.textContent = `Open in ${LLM_NAMES[llmKey]}`;
    btn.style.display = '';
  }
}

function closeDropdown(): void {
  const dropdown = document.getElementById('stya-dropdown');
  if (dropdown) {
    dropdown.classList.remove('open');
    dropdown.style.display = 'none';
  }
  isDropdownOpen = false;
}

async function showDropdownForVideo(videoId: string, anchorElement: HTMLElement): Promise<void> {
  injectStyles();
  createToast();

  let dropdown = document.getElementById('stya-dropdown') as HTMLDivElement | null;
  if (!dropdown) {
    dropdown = createDropdown();
    document.body.appendChild(dropdown);
  }

  dropdown.dataset.currentVideoId = videoId;

  // Reset submenu state (close it)
  dropdown.querySelector('#x10-llm-submenu')?.classList.remove('open');
  const openInIcon = dropdown.querySelector('#x10-open-in .x10-quick-icon');
  if (openInIcon) openInIcon.textContent = '▸';

  // Populate video info
  const thumbEl = dropdown.querySelector('#x10-video-thumb') as HTMLElement | null;
  const titleEl = dropdown.querySelector('#x10-video-title');
  const metaEl = dropdown.querySelector('#x10-video-meta');
  if (thumbEl) thumbEl.style.backgroundImage = `url(https://img.youtube.com/vi/${videoId}/mqdefault.jpg)`;
  // Get title from the anchor element's context
  const titleText = anchorElement.closest('h3, #title')?.textContent?.trim()
    || document.title.replace(' - YouTube', '');
  if (titleEl) titleEl.textContent = titleText;
  if (metaEl) metaEl.textContent = 'YouTube video';

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

  // Load last LLM preference and show direct button if set
  const llmData = await safeStorageGet(['styaLastLLM']);
  if (llmData.styaLastLLM) {
    updateDirectButton(dropdown, llmData.styaLastLLM as string);
  }

  dropdown.classList.add('open');
  dropdown.style.display = 'block';
  isDropdownOpen = true;

  await loadX10sForDropdown(videoId);

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('#stya-dropdown') && !(e.target as Element).closest('.stya-title-btn')) {
        closeDropdown();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}

async function loadX10sForDropdown(videoId: string): Promise<void> {
  const listEl = document.getElementById('stya-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="x10-empty">Loading...</div>';

  try {
    let initOk = await api.init();
    if (!initOk) {
      // Retry once after 500ms (lets the service worker wake up)
      await new Promise(r => setTimeout(r, 500));
      initOk = await api.init();
    }
    if (!initOk) {
      console.error('[STYA] Init failed after retry');
      listEl.innerHTML = `<div class="x10-empty">Could not connect to server<br><small style="color:#888">${api.baseUrl}</small></div>`;
      return;
    }

    const result = await api.getMyX10s();
    currentX10s = result.x10s || [];

    if (videoId) {
      const checkResult = await api.checkVideoInX10s(videoId);
      videoInX10s = checkResult.inX10s || [];
    }

    renderX10List(videoId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] loadX10sForDropdown error:', error);
    listEl.innerHTML = `<div class="x10-empty">Error: ${errorMessage}</div>`;
  }
}

function renderX10List(videoId: string): void {
  const listEl = document.getElementById('stya-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  // Add "Create new X10" item at the top
  const createItem = document.createElement('button');
  createItem.className = 'x10-item x10-item-create';
  createItem.innerHTML = `
    <span class="x10-item-check" style="font-weight: bold;">+</span>
    <span class="x10-item-name">A new collection</span>
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

async function handleCreateWithVideo(videoId: string): Promise<void> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const createItem = document.querySelector('.x10-item-create');
  if (createItem) {
    createItem.classList.add('adding');
    const nameSpan = createItem.querySelector('.x10-item-name');
    if (nameSpan) nameSpan.textContent = 'Creating...';
  }

  const result = await api.createX10WithExtraction(videoUrl, true);

  if (result.success) {
    showToast('Video added to new collection!', 'success');
    closeDropdown();
    // Mark the button as added
    const btn = document.querySelector(`.stya-title-btn[data-video-id="${videoId}"]`);
    if (btn) {
      btn.classList.add('added');
    }
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (createItem) {
      createItem.classList.remove('adding');
      const nameSpan = createItem.querySelector('.x10-item-name');
      if (nameSpan) nameSpan.textContent = 'A new collection';
    }
  }
}

async function handleAddVideoToX10(x10Id: string, x10Title: string, videoId: string): Promise<void> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const item = document.querySelector(`[data-x10-id="${x10Id}"]`);
  if (item) item.classList.add('adding');

  const result = await api.addVideoToX10WithExtraction(x10Id, videoUrl);

  if (result.success) {
    showToast(`Added to ${x10Title || 'collection'}`, 'success');
    videoInX10s.push(x10Id);
    if (item) {
      item.classList.remove('adding');
      const check = item.querySelector('.x10-item-check');
      if (check) check.textContent = '✓';
      (item as HTMLElement).style.cursor = 'default';
    }
    closeDropdown();
    // Mark the button as added
    const btn = document.querySelector(`.stya-title-btn[data-video-id="${videoId}"]`);
    if (btn) {
      btn.classList.add('added');
    }
  } else {
    showToast(`Error: ${result.error}`, 'error');
    if (item) item.classList.remove('adding');
  }
}

// ============================================
// Toast
// ============================================

function createToast(): void {
  if (document.getElementById('stya-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'stya-toast';
  document.body.appendChild(toast);
}

function showToast(message: string, type = ''): void {
  const toast = document.getElementById('stya-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'show' + (type ? ` ${type}` : '');
  setTimeout(() => {
    toast.className = '';
  }, 3000);
}

// ============================================
// Quick Actions (One-Click LLM)
// ============================================

const LLM_URLS: Record<string, (prompt: string) => string> = {
  claude: (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
  chatgpt: (prompt) => `https://chat.openai.com/?q=${encodeURIComponent(prompt)}`,
  gemini: (prompt) => `https://www.google.com/search?udm=50&aep=11&q=${encodeURIComponent(prompt)}`,
  perplexity: (prompt) => `https://www.perplexity.ai/search/?q=${encodeURIComponent(prompt)}`,
  grok: (prompt) => `https://x.com/i/grok?text=${encodeURIComponent(prompt)}`,
  copilot: (prompt) => `https://copilot.microsoft.com/?q=${encodeURIComponent(prompt)}`
};

async function handleOpenInLLM(url: string, llmType: string): Promise<void> {
  showToast('Creating collection...', '');
  closeDropdown();

  try {
    const result = await api.createX10WithExtraction(url, true); // forceNew = true

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      return;
    }

    const mdUrl = `${api.baseUrl}/s/${result.x10Id}.md`;
    const prompt = `Fetch ${mdUrl}`;
    const llmUrl = LLM_URLS[llmType](prompt);

    window.open(llmUrl, '_blank');
    showToast(`Opened in ${llmType}`, 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] handleOpenInLLM error:', error);
    showToast(`Error: ${errorMessage}`, 'error');
  }
}

async function handleCopyMDLink(url: string): Promise<void> {
  showToast('Creating collection...', '');
  closeDropdown();

  try {
    const result = await api.createX10WithExtraction(url, true);

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      return;
    }

    const mdUrl = `${api.baseUrl}/s/${result.x10Id}.md`;
    await navigator.clipboard.writeText(mdUrl);
    showToast('MD link copied!', 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] handleCopyMDLink error:', error);
    showToast(`Error: ${errorMessage}`, 'error');
  }
}

async function handleCopyMDContent(url: string): Promise<void> {
  showToast('Creating collection...', '');
  closeDropdown();

  try {
    const result = await api.createX10WithExtraction(url, true);

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      return;
    }

    const mdUrl = `${api.baseUrl}/s/${result.x10Id}.md`;
    showToast('Fetching content...', '');

    const response = await fetch(mdUrl);
    const mdContent = await response.text();

    await navigator.clipboard.writeText(mdContent);
    showToast('MD content copied!', 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] handleCopyMDContent error:', error);
    showToast(`Error: ${errorMessage}`, 'error');
  }
}

// ============================================
// Title Button Injection
// ============================================

function createTitleButton(videoId: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'stya-title-btn';
  btn.innerHTML = '<svg viewBox="0 0 100 100" style="width:14px;height:14px;"><path d="M35 50 L72 29 A37 37 0 1 0 72 71 Z" fill="#dc2626"/><circle cx="65" cy="50" r="6" fill="#fff"/><circle cx="82" cy="50" r="6" fill="#fff"/></svg>';
  btn.title = 'Add to StraightToYourAI';
  btn.dataset.videoId = videoId;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // If dropdown is already open for this button, close it
    if (isDropdownOpen) {
      closeDropdown();
      return;
    }
    const vid = btn.dataset.videoId;
    if (vid) {
      showDropdownForVideo(vid, btn);
    }
  });

  return btn;
}

function injectTitleButtons(): void {
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

        const videoId = extractVideoIdFromUrl((titleLink as HTMLAnchorElement).href);
        if (!videoId) return;

        const h3 = titleLink.closest('h3');
        if (!h3 || h3.querySelector('.stya-title-btn')) return;

        const btn = createTitleButton(videoId);
        h3.insertBefore(btn, h3.firstChild);
        count++;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.log('[STYA] Error injecting classic button:', errorMessage);
      }
    });

    // Format 2: New format (yt-lockup-metadata-view-model) - Homepage, Sidebar 2024+
    const newFormatHeadings = document.querySelectorAll('yt-lockup-metadata-view-model:not([data-x10-processed]) h3.yt-lockup-metadata-view-model__heading-reset');

    newFormatHeadings.forEach(h3 => {
      try {
        const metadata = h3.closest('yt-lockup-metadata-view-model');
        if (!metadata) return;

        metadata.setAttribute('data-x10-processed', 'true');

        const titleLink = h3.querySelector('a.yt-lockup-metadata-view-model__title') as HTMLAnchorElement | null;
        if (!titleLink) return;

        let videoId = extractVideoIdFromUrl(titleLink.href);

        if (!videoId) {
          const lockup = metadata.closest('yt-lockup-view-model');
          if (lockup) {
            const container = lockup.querySelector('[class*="content-id-"]');
            if (container) {
              const contentClass = Array.from(container.classList).find(c => c.startsWith('content-id-'));
              videoId = contentClass?.replace('content-id-', '') || null;
            }
          }
        }

        if (!videoId) return;
        if (h3.querySelector('.stya-title-btn')) return;

        const btn = createTitleButton(videoId);
        h3.insertBefore(btn, h3.firstChild);
        count++;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.log('[STYA] Error injecting new format button:', errorMessage);
      }
    });

    // Format 3: Rich grid items (ytd-rich-item-renderer) - Homepage alternative
    const richItems = document.querySelectorAll('ytd-rich-item-renderer:not([data-x10-processed]) a#video-title-link');

    richItems.forEach(titleLink => {
      try {
        const renderer = titleLink.closest('ytd-rich-item-renderer');
        if (!renderer) return;

        renderer.setAttribute('data-x10-processed', 'true');

        const videoId = extractVideoIdFromUrl((titleLink as HTMLAnchorElement).href);
        if (!videoId) return;

        const titleContainer = titleLink.closest('#details, #meta');
        if (!titleContainer || titleContainer.querySelector('.stya-title-btn')) return;

        const btn = createTitleButton(videoId);
        titleContainer.insertBefore(btn, titleContainer.firstChild);
        count++;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.log('[STYA] Error injecting rich item button:', errorMessage);
      }
    });

    // Format 4: Main video on watch page (ytd-watch-metadata)
    const watchPage = document.querySelector('ytd-watch-metadata:not([data-x10-processed])');
    if (watchPage) {
      try {
        watchPage.setAttribute('data-x10-processed', 'true');

        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');

        if (videoId) {
          const titleContainer = watchPage.querySelector('#title h1, h1.ytd-watch-metadata');
          if (titleContainer && !titleContainer.querySelector('.stya-title-btn')) {
            const btn = createTitleButton(videoId);
            titleContainer.insertBefore(btn, titleContainer.firstChild);
            count++;
          }
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.log('[STYA] Error injecting watch page button:', errorMessage);
      }
    }

  } catch (e) {
    console.error('[STYA] Error in injectTitleButtons:', e);
  }

  if (count > 0) {
    console.log('[STYA] Title buttons injected:', count);
  }
}

function startTitleButtonInjection(): void {
  injectTitleButtons();
  if (!titleButtonInterval) {
    titleButtonInterval = setInterval(injectTitleButtons, 2000);
  }
}

function stopTitleButtonInjection(): void {
  if (titleButtonInterval) {
    clearInterval(titleButtonInterval);
    titleButtonInterval = null;
  }
}

// ============================================
// Master Toggle Button
// ============================================

function createMasterToggle(): void {
  if (document.getElementById('stya-toggle-container')) return;

  const container = document.createElement('div');
  container.id = 'stya-toggle-container';

  const menu = document.createElement('div');
  menu.id = 'stya-toggle-menu';
  const myX10sLink = document.createElement('a');
  myX10sLink.href = api.getDashboardUrl();
  myX10sLink.target = '_blank';
  myX10sLink.textContent = 'My collections';
  menu.appendChild(myX10sLink);

  const toggle = document.createElement('button');
  toggle.id = 'stya-master-toggle';
  toggle.innerHTML = '<svg viewBox="0 0 100 100" style="width:16px;height:16px;vertical-align:-2px;margin-right:4px;"><path d="M35 50 L72 29 A37 37 0 1 0 72 71 Z" fill="#dc2626"/><circle cx="65" cy="50" r="6" fill="#fff"/><circle cx="82" cy="50" r="6" fill="#fff"/></svg><span class="logo-main">StraightToYour</span><span class="logo-ai">AI</span>';
  toggle.title = 'Toggle StraightToYourAI buttons';

  // Load saved state
  safeStorageGetCallback(['styaTitleButtonsEnabled'], (data) => {
    if (data.styaTitleButtonsEnabled === false) {
      titleButtonsEnabled = false;
      toggle.classList.add('disabled');
      document.body.classList.add('stya-buttons-hidden');
    }
  });

  toggle.addEventListener('click', () => {
    titleButtonsEnabled = !titleButtonsEnabled;

    if (titleButtonsEnabled) {
      toggle.classList.remove('disabled');
      document.body.classList.remove('stya-buttons-hidden');
      injectTitleButtons();
    } else {
      toggle.classList.add('disabled');
      document.body.classList.add('stya-buttons-hidden');
    }

    safeStorageSet({ styaTitleButtonsEnabled: titleButtonsEnabled });
    showToast(titleButtonsEnabled ? 'Buttons enabled' : 'Buttons hidden', 'success');
  });

  container.appendChild(menu);
  container.appendChild(toggle);
  document.body.appendChild(container);
}

// ============================================
// SPA Navigation Handling
// ============================================

let lastUrl = location.href;

function onUrlChange(): void {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;

  lastUrl = newUrl;
  console.log('[STYA] URL changed:', newUrl);

  closeDropdown();
  videoInX10s = [];

  document.querySelectorAll('.stya-title-btn').forEach(btn => btn.remove());

  const dropdown = document.getElementById('stya-dropdown');
  if (dropdown) {
    delete dropdown.dataset.currentVideoId;
  }

  document.querySelectorAll('[data-x10-processed]').forEach(el => {
    el.removeAttribute('data-x10-processed');
  });

  setTimeout(injectTitleButtons, 500);
}

const urlObserver = new MutationObserver(() => {
  onUrlChange();
});

// ============================================
// Initialization
// ============================================

function init(): void {
  console.log('[STYA] Initializing...');

  injectStyles();
  createToast();
  createMasterToggle();

  setTimeout(startTitleButtonInjection, 1000);

  urlObserver.observe(document.body, { subtree: true, childList: true });
  window.addEventListener('popstate', onUrlChange);

  console.log('[STYA] Initialized');
}

// Suppress unused variable warning
void stopTitleButtonInjection;

// Run initialization
init();
