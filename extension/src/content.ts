// StraightToYourAI Content Script
// Universal overlay for YouTube and web pages

import { config } from './lib/config';

// ============================================
// Context Detection
// ============================================

const isYouTube = window.location.hostname.includes('youtube.com');
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

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!isExtensionContextValid()) return;

  // Open overlay (from background.ts via icon click, keyboard shortcut, or context menu)
  if (request.action === 'openOverlay') {
    showOverlay({
      centered: request.centered ?? true,
      context: request.context
    });
    sendResponse({ success: true });
    return true;
  }

  // Get video info (legacy - for compatibility)
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

  async getSettings(): Promise<{ youtube_power_mode: boolean } | null> {
    try {
      const data = await this._fetch('/api/settings');
      if (!data._ok) throw new Error(`HTTP ${data._status}`);
      return { youtube_power_mode: data.youtube_power_mode as boolean ?? true };
    } catch (error) {
      console.error('[STYA] getSettings error:', error);
      return null;
    }
  }

  // Extract transcript locally and send to server (frontend extraction)
  // Optimized: checks if item exists on server first to skip extraction
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

      // Check if item already exists on server (skip extraction if yes)
      const checkResult = await this._fetch(`/api/item/check?youtubeId=${videoId}`);

      let payload: AddContentPayload;

      if (checkResult.exists && !checkResult._error) {
        // Item exists - skip extraction!
        console.log('[STYA] Item already exists on server, skipping extraction');
        payload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: (checkResult.item as { title: string }).title || 'Untitled',
          type: 'youtube',
          content: '',  // Empty - server will reuse existing transcript
          youtube_id: videoId,
          channel: (checkResult.item as { channel: string }).channel,
          duration: undefined,
          forceNew,
          useExisting: true  // Signal to server
        };
      } else {
        // Item doesn't exist - extract transcript
        console.log('[STYA] Extracting transcript for:', videoId);
        const result = await getTranscript(videoId);
        console.log('[STYA] Got transcript, sending to server...');

        payload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: result.title,
          type: 'youtube',
          content: result.transcript,
          youtube_id: videoId,
          channel: result.channel,
          duration: result.duration,
          forceNew
        };
      }

      // Send to server
      const data = await this._fetch('/api/x10/add-content', {
        method: 'POST',
        body: { ...payload, userCode: this.userCode || undefined },
      });

      // Handle retryWithExtraction (item was deleted between check and add)
      if (data.retryWithExtraction) {
        console.log('[STYA] Item was deleted, retrying with extraction...');
        const result = await getTranscript(videoId);
        const retryPayload: AddContentPayload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: result.title,
          type: 'youtube',
          content: result.transcript,
          youtube_id: videoId,
          channel: result.channel,
          duration: result.duration,
          forceNew
        };
        const retryData = await this._fetch('/api/x10/add-content', {
          method: 'POST',
          body: { ...retryPayload, userCode: this.userCode || undefined },
        });
        if (retryData.success && retryData.userCode) {
          this.userCode = retryData.userCode as string;
          safeStorageSet({ styaUserCode: retryData.userCode });
        }
        return {
          success: !!retryData.success,
          x10Id: retryData.collectionId as string | undefined,
          userCode: retryData.userCode as string | undefined,
          error: retryData.error as string | undefined
        };
      }

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

  // Add video to existing collection with frontend extraction
  // Optimized: checks if item exists on server first to skip extraction
  async addVideoToX10WithExtraction(
    x10Id: string,
    videoUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const videoId = extractYoutubeId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Check if item already exists on server (skip extraction if yes)
      const checkResult = await this._fetch(`/api/item/check?youtubeId=${videoId}`);

      let payload: AddContentPayload;

      if (checkResult.exists && !checkResult._error) {
        // Item exists - skip extraction!
        console.log('[STYA] Item already exists on server, skipping extraction');
        payload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: (checkResult.item as { title: string }).title || 'Untitled',
          type: 'youtube',
          content: '',  // Empty - server will reuse existing transcript
          youtube_id: videoId,
          channel: (checkResult.item as { channel: string }).channel,
          duration: undefined,
          collectionId: x10Id,
          useExisting: true
        };
      } else {
        // Item doesn't exist - extract transcript
        console.log('[STYA] Extracting transcript for:', videoId);
        const result = await getTranscript(videoId);

        payload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: result.title,
          type: 'youtube',
          content: result.transcript,
          youtube_id: videoId,
          channel: result.channel,
          duration: result.duration,
          collectionId: x10Id
        };
      }

      const data = await this._fetch('/api/x10/add-content', {
        method: 'POST',
        body: { ...payload, userCode: this.userCode || undefined },
      });

      // Handle retryWithExtraction (item was deleted between check and add)
      if (data.retryWithExtraction) {
        console.log('[STYA] Item was deleted, retrying with extraction...');
        const result = await getTranscript(videoId);
        const retryPayload: AddContentPayload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: result.title,
          type: 'youtube',
          content: result.transcript,
          youtube_id: videoId,
          channel: result.channel,
          duration: result.duration,
          collectionId: x10Id
        };
        const retryData = await this._fetch('/api/x10/add-content', {
          method: 'POST',
          body: { ...retryPayload, userCode: this.userCode || undefined },
        });
        return {
          success: retryData._ok || !!retryData.success,
          error: retryData.error as string | undefined
        };
      }

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
// Types for Overlay
// ============================================

interface OverlayContext {
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
}

interface OverlayOptions {
  centered: boolean;
  anchorElement?: HTMLElement;
  videoId?: string;
  videoTitle?: string;
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

// ============================================
// State
// ============================================

let isDropdownOpen = false;
let currentX10s: X10Collection[] = [];
let overlayElement: HTMLDivElement | null = null;
let backdropElement: HTMLDivElement | null = null;
let currentPageInfo: PageInfo | null = null;
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

    /* Playlist video renderer - Watch Later, Liked Videos, Custom Playlists */
    ytd-playlist-video-renderer #meta h3:has(.stya-title-btn) {
      display: flex !important;
      align-items: flex-start !important;
      flex-direction: row !important;
    }
    ytd-playlist-video-renderer #meta h3:has(.stya-title-btn) > a#video-title {
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

    /* Dropdown */
    #stya-dropdown {
      position: fixed;
      width: 280px;
      background: #282828;
      border-radius: 12px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.4);
      z-index: 2147483647;
      overflow: hidden;
      overflow-y: auto;
      max-height: 90vh;
      overscroll-behavior: contain;
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
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      flex-shrink: 0;
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
      overscroll-behavior: contain;
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
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .x10-footer a {
      font-size: 13px;
      color: #aaa;
      text-decoration: none;
    }
    .x10-footer a:hover {
      color: #fff;
    }
    .x10-footer-sep {
      width: 1px;
      height: 14px;
      background: #3f3f3f;
      margin: 0 4px;
    }
    .x10-footer-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      position: relative;
    }
    .x10-footer-icon:hover {
      background: #3f3f3f;
    }
    .x10-footer-icon[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 6px;
      padding: 4px 8px;
      background: #1a1a1a;
      border: 1px solid #3f3f3f;
      border-radius: 4px;
      font-size: 11px;
      color: #f1f1f1;
      white-space: nowrap;
      z-index: 1000;
      pointer-events: none;
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

    /* Backdrop for centered overlay */
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

    /* Centered mode for overlay (horizontally centered, top aligned) */
    #stya-dropdown.stya-centered {
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      animation: stya-scale-in 0.15s ease-out;
    }

    @keyframes stya-scale-in {
      from {
        opacity: 0;
        transform: translateX(-50%) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) scale(1);
      }
    }

    /* Page icon (for web pages instead of video thumbnail) */
    .x10-page-icon {
      width: 48px;
      height: 48px;
      min-width: 48px;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      border-radius: 8px;
      background-color: #3f3f3f;
    }

    /* News banner */
    #stya-dropdown .x10-news-banner {
      display: none;
      align-items: center !important;
      background: #1e3a5f !important;
      padding: 12px 16px !important;
      gap: 10px !important;
      margin: 0 !important;
      border: none !important;
    }
    #stya-dropdown .x10-news-banner.visible {
      display: flex !important;
    }
    #stya-dropdown .x10-news-dot {
      width: 8px !important;
      height: 8px !important;
      min-width: 8px !important;
      background: #4a9eff !important;
      border-radius: 50% !important;
      flex-shrink: 0 !important;
    }
    #stya-dropdown .x10-news-text {
      flex: 1 !important;
      color: #fff !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    #stya-dropdown .x10-news-read {
      background: #3b82f6 !important;
      color: #fff !important;
      border: none !important;
      border-radius: 6px !important;
      padding: 6px 16px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      flex-shrink: 0 !important;
      margin: 0 !important;
    }
    #stya-dropdown .x10-news-read:hover {
      background: #2563eb !important;
    }
    #stya-dropdown .x10-news-close {
      background: none !important;
      border: none !important;
      color: rgba(255,255,255,0.5) !important;
      font-size: 20px !important;
      cursor: pointer !important;
      padding: 0 4px !important;
      line-height: 1 !important;
      margin-left: 4px !important;
    }
    #stya-dropdown .x10-news-close:hover {
      color: #fff !important;
    }
  `;
  document.head.appendChild(styles);
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

// ============================================
// Page Info Helpers
// ============================================

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

function getPageInfo(options: OverlayOptions): PageInfo {
  // Case 1: Explicit videoId (click on YouTube title button)
  if (options.videoId) {
    // Use passed title if available (from sidebar/recommendations)
    // Otherwise fall back to page title (for main video button)
    const title = options.videoTitle
      || getVideoTitleFromPage()
      || document.title.replace(' - YouTube', '');

    // Only get channel/duration if no videoTitle was passed (main video on page)
    const channel = options.videoTitle ? undefined : getChannelFromPage();
    const duration = options.videoTitle ? undefined : getDurationFromPage();

    return {
      type: 'youtube-video',
      title,
      url: `https://www.youtube.com/watch?v=${options.videoId}`,
      thumbnail: `https://img.youtube.com/vi/${options.videoId}/mqdefault.jpg`,
      videoId: options.videoId,
      channel,
      duration
    };
  }

  // Case 2: YouTube page with current video
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

  // Case 3: Link (right-click on a link)
  if (options.context?.linkUrl) {
    const linkUrl = options.context.linkUrl;
    // Detect if it's a YouTube link
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

  // Case 4: Standard web page
  return {
    type: 'webpage',
    title: document.title || window.location.hostname,
    url: window.location.href,
    favicon: getFavicon()
  };
}

// ============================================
// Unified Overlay
// ============================================

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeOverlay();
  }
}

function closeOverlay(): void {
  // Remove overlay
  if (overlayElement) {
    overlayElement.classList.remove('open', 'stya-centered');
    overlayElement.remove();
    overlayElement = null;
  }
  // Remove backdrop
  if (backdropElement) {
    backdropElement.remove();
    backdropElement = null;
  }
  // Restore page scroll
  document.body.style.overflow = '';
  // Remove escape key listener
  document.removeEventListener('keydown', handleEscapeKey);
  isDropdownOpen = false;
  currentPageInfo = null;
}

// Legacy alias for compatibility
function closeDropdown(): void {
  closeOverlay();
}

function positionNearAnchor(overlay: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const overlayWidth = 280;
  const overlayHeight = 300;

  let top = rect.bottom + 8;
  let left = rect.left;

  // Keep within viewport
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
  setTimeout(() => {
    const closeHandler = (e: MouseEvent) => {
      const target = e.target as Element;
      // Don't close if click inside overlay or on title button
      if (target.closest('#stya-dropdown') || target.closest('.stya-title-btn')) {
        return;
      }
      // Don't close if click on backdrop (handled separately)
      if (target.closest('#stya-backdrop')) {
        return;
      }
      closeOverlay();
      document.removeEventListener('click', closeHandler);
    };
    document.addEventListener('click', closeHandler);
  }, 100);
}

function createOverlayElement(pageInfo: PageInfo): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'stya-dropdown';
  overlay.dataset.currentUrl = pageInfo.url;
  if (pageInfo.videoId) {
    overlay.dataset.currentVideoId = pageInfo.videoId;
  }

  // Header
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

  // Info section (adaptive based on type)
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

  // News banner (hidden by default, shown if there's unread news)
  const newsBanner = `
    <div class="x10-news-banner" id="x10-news-banner">
      <span class="x10-news-dot"></span>
      <span class="x10-news-text" id="x10-news-text"></span>
      <button class="x10-news-read" id="x10-news-read">Read</button>
      <button class="x10-news-close" id="x10-news-close">&times;</button>
    </div>
  `;

  // Quick actions
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
      <a href="#" id="stya-dashboard" class="x10-footer-icon" data-tooltip="My collections">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </a>
      <span class="x10-footer-sep"></span>
      <a href="#" id="stya-settings" class="x10-footer-icon" data-tooltip="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </a>
      <a href="#" id="stya-help" class="x10-footer-icon" data-tooltip="Help">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </a>
      <a href="#" id="stya-sync" class="x10-footer-icon" data-tooltip="Sync">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      </a>
    </div>
  `;

  overlay.innerHTML = header + infoSection + newsBanner + quickActions + listAndFooter;

  // Setup event listeners
  setupOverlayEventListeners(overlay, pageInfo);

  // Check and show news banner
  checkAndShowNewsBanner(overlay);

  return overlay;
}

function setupOverlayEventListeners(overlay: HTMLDivElement, pageInfo: PageInfo): void {
  // Close button
  overlay.querySelector('.x10-dropdown-close')?.addEventListener('click', closeOverlay);

  // Dashboard and Sync links
  overlay.querySelector('#stya-dashboard')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(api.getDashboardUrl(), '_blank');
  });
  overlay.querySelector('#stya-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(`${api.baseUrl}/settings`, '_blank');
  });
  overlay.querySelector('#stya-help')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(`${api.baseUrl}/welcome`, '_blank');
  });
  overlay.querySelector('#stya-sync')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(`${api.baseUrl}/sync`, '_blank');
  });

  // Open in LLM (direct button)
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

  // Copy Link
  overlay.querySelector('#x10-copy-link')?.addEventListener('click', () => {
    handleCopyMDLink(pageInfo.url);
  });

  // Copy Content
  overlay.querySelector('#x10-copy-content')?.addEventListener('click', () => {
    handleCopyMDContent(pageInfo.url);
  });

  // Load LLM preference
  safeStorageGet(['styaLastLLM']).then(data => {
    if (data.styaLastLLM) {
      updateDirectButton(overlay, data.styaLastLLM as string);
    }
  });
}

async function checkAndShowNewsBanner(overlay: HTMLElement): Promise<void> {
  const banner = overlay.querySelector('#x10-news-banner') as HTMLElement | null;
  const textEl = overlay.querySelector('#x10-news-text') as HTMLElement | null;

  if (!banner || !textEl) return;

  try {
    // Fetch news.json directly
    const response = await fetch(`${api.baseUrl}/news.json`);
    if (!response.ok) return;

    const news = await response.json();

    // Validate news data
    const newsId = news?.id;
    const newsTitle = news?.title;
    const newsUrl = news?.url;

    if (typeof newsId !== 'string' || !newsId.trim()) return;
    if (typeof newsTitle !== 'string' || !newsTitle.trim()) return;

    // Check if already seen
    const data = await safeStorageGet(['lastSeenNewsId']);
    if (newsId === data.lastSeenNewsId) return;

    // Show banner
    textEl.textContent = newsTitle;
    banner.classList.add('visible');

    // Setup event handlers
    const markAsRead = async () => {
      await safeStorageSet({ lastSeenNewsId: newsId });
      banner.classList.remove('visible');
    };

    overlay.querySelector('#x10-news-read')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await markAsRead();
      if (newsUrl) {
        window.open(`${api.baseUrl}${newsUrl}`, '_blank');
      }
    });

    overlay.querySelector('#x10-news-close')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await markAsRead();
    });
  } catch (error) {
    // Silent fail - news is non-critical
  }
}

async function showOverlay(options: OverlayOptions): Promise<void> {
  // Close if already open
  closeOverlay();

  injectStyles();
  createToast();

  // Determine page/video info
  const pageInfo = getPageInfo(options);
  currentPageInfo = pageInfo;

  // Create backdrop (only in centered mode)
  if (options.centered) {
    backdropElement = document.createElement('div');
    backdropElement.id = 'stya-backdrop';
    backdropElement.addEventListener('click', closeOverlay);
    document.body.appendChild(backdropElement);
  }

  // Create overlay
  overlayElement = createOverlayElement(pageInfo);
  document.body.appendChild(overlayElement);

  // Position
  if (options.centered) {
    overlayElement.classList.add('stya-centered');
  } else if (options.anchorElement) {
    positionNearAnchor(overlayElement, options.anchorElement);
  }

  // Block page scroll
  document.body.style.overflow = 'hidden';

  // Show
  overlayElement.classList.add('open');
  isDropdownOpen = true;

  // Event listeners
  document.addEventListener('keydown', handleEscapeKey);
  setupOutsideClickHandler();

  // Load collections
  await loadCollectionsForOverlay(pageInfo);
}

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

    // Check if URL is already in collections (only for YouTube videos for now)
    let itemInX10s: string[] = [];
    if (pageInfo.videoId) {
      const checkResult = await api.checkVideoInX10s(pageInfo.videoId);
      itemInX10s = checkResult.inX10s || [];
    }

    renderCollectionList(pageInfo, itemInX10s);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    listEl.innerHTML = `<div class="x10-empty">Error: ${errorMessage}</div>`;
  }
}

function renderCollectionList(pageInfo: PageInfo, itemInX10s: string[]): void {
  const listEl = document.getElementById('stya-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  // "Create new collection" button
  const createItem = document.createElement('button');
  createItem.className = 'x10-item x10-item-create';
  createItem.innerHTML = `
    <span class="x10-item-check" style="font-weight: bold;">+</span>
    <span class="x10-item-name">A new collection</span>
    <span class="x10-item-count"></span>
  `;
  createItem.addEventListener('click', () => handleCreateWithUrl(pageInfo.url));
  listEl.appendChild(createItem);

  // Existing collections
  currentX10s.forEach(x10 => {
    const isIn = pageInfo.videoId ? itemInX10s.includes(x10.id) : false;
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

// Legacy function - now uses unified showOverlay
async function showDropdownForVideo(videoId: string, anchorElement: HTMLElement, videoTitle?: string): Promise<void> {
  await showOverlay({
    centered: false,
    anchorElement,
    videoId,
    videoTitle
  });
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

// Extract video info from DOM at click time (handles YouTube's DOM recycling)
function extractVideoInfoFromButton(btn: HTMLElement): { videoId: string | null; videoTitle: string | null } {
  // Find the video container by traversing up the DOM
  const container = btn.closest(
    'ytd-playlist-video-renderer, ' +
    'yt-lockup-metadata-view-model, ' +
    'ytd-video-renderer, ' +
    'ytd-rich-item-renderer, ' +
    'ytd-compact-video-renderer, ' +
    'ytd-watch-metadata'
  );

  if (!container) return { videoId: null, videoTitle: null };

  // For watch page main video, use page info
  if (container.tagName.toLowerCase() === 'ytd-watch-metadata') {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      videoId: urlParams.get('v'),
      videoTitle: null  // Will fall back to getVideoTitleFromPage()
    };
  }

  // Find the title link in the container
  const titleLink = container.querySelector(
    'a#video-title, ' +
    'a.yt-lockup-metadata-view-model__title, ' +
    'a#video-title-link'
  ) as HTMLAnchorElement | null;

  let videoId = titleLink?.href ? extractVideoIdFromUrl(titleLink.href) : null;
  const videoTitle = titleLink?.title || titleLink?.textContent?.trim() || null;

  // Fallback: try content-id-XXX class
  if (!videoId) {
    const lockup = container.closest('yt-lockup-view-model');
    const contentDiv = lockup?.querySelector('[class*="content-id-"]');
    if (contentDiv) {
      const contentClass = Array.from(contentDiv.classList).find(c => c.startsWith('content-id-'));
      videoId = contentClass?.replace('content-id-', '') || null;
    }
  }

  return { videoId, videoTitle };
}

function createTitleButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'stya-title-btn';
  btn.innerHTML = '<svg viewBox="0 0 100 100" style="width:14px;height:14px;"><path d="M35 50 L72 29 A37 37 0 1 0 72 71 Z" fill="#dc2626"/><circle cx="65" cy="50" r="6" fill="#fff"/><circle cx="82" cy="50" r="6" fill="#fff"/></svg>';
  btn.title = 'Add to StraightToYourAI';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Extract videoId and title AT CLICK TIME from DOM
    const { videoId, videoTitle } = extractVideoInfoFromButton(btn);

    if (!videoId) {
      showToast('Could not find video ID', 'error');
      return;
    }

    // If dropdown is already open, close it (toggle behavior)
    if (isDropdownOpen) {
      closeDropdown();
    }

    showDropdownForVideo(videoId, btn, videoTitle || undefined);
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

        const btn = createTitleButton();
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

        const btn = createTitleButton();
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

        const btn = createTitleButton();
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
            const btn = createTitleButton();
            titleContainer.insertBefore(btn, titleContainer.firstChild);
            count++;
          }
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.log('[STYA] Error injecting watch page button:', errorMessage);
      }
    }

    // Format 5: Playlist items (ytd-playlist-video-renderer) - Watch Later, Liked Videos, Custom Playlists
    const playlistItems = document.querySelectorAll('ytd-playlist-video-renderer:not([data-x10-processed]) a#video-title');

    playlistItems.forEach(titleLink => {
      try {
        const renderer = titleLink.closest('ytd-playlist-video-renderer');
        if (!renderer) return;

        renderer.setAttribute('data-x10-processed', 'true');

        const videoId = extractVideoIdFromUrl((titleLink as HTMLAnchorElement).href);
        if (!videoId) return;

        const h3 = titleLink.closest('h3');
        if (!h3 || h3.querySelector('.stya-title-btn')) return;

        const btn = createTitleButton();
        h3.insertBefore(btn, titleLink);
        count++;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.log('[STYA] Error injecting playlist button:', errorMessage);
      }
    });

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

async function init(): Promise<void> {
  console.log('[STYA] Initializing...', isYouTube ? '(YouTube)' : '(Web page)');

  injectStyles();
  createToast();

  // Add marker to indicate extension is installed (for website pages to detect)
  document.documentElement.setAttribute('data-stya-extension', 'installed');

  // YouTube-specific features
  if (isYouTube) {
    // Check if YouTube Power Mode is enabled
    await api.init();
    const settings = await api.getSettings();
    console.log('[STYA] YouTube Power Mode settings:', settings);
    const youtubePowerModeEnabled = settings?.youtube_power_mode === true;

    if (youtubePowerModeEnabled) {
      setTimeout(startTitleButtonInjection, 1000);
    }

    urlObserver.observe(document.body, { subtree: true, childList: true });
    window.addEventListener('popstate', onUrlChange);
  }

  console.log('[STYA] Initialized');
}

// Suppress unused variable warning
void stopTitleButtonInjection;

// Run initialization
init();
