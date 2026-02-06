// StraightToYourAI Content Script
// Universal overlay for YouTube and web pages

import { config } from './lib/config';

// ============================================
// Context Detection
// ============================================

const isYouTube = window.location.hostname.includes('youtube.com');
import type { AddContentPayload } from './lib/types';
import { getTranscript, extractVideoId as extractYoutubeId } from './lib/innertube';
import { getMarkdown, isYouTubeUrl } from './lib/jina';

// ============================================
// Safe Storage Helpers (handle context invalidation gracefully)
// ============================================

async function safeStorageSet(data: Record<string, unknown>): Promise<boolean> {
  try {
    if (!chrome.storage?.local) return false;
    await chrome.storage.local.set(data);
    return true;
  } catch {
    // Context invalidated - not critical, just cache
    return false;
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
  thumbnail?: string;
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

  // Extract content locally and send to server (frontend extraction)
  // Supports both YouTube videos (via InnerTube) and web pages (via Jina)
  // Optimized: checks if YouTube item exists on server first to skip extraction
  async createX10WithExtraction(
    url: string,
    forceNew = false
  ): Promise<{ success: boolean; x10Id?: string; userCode?: string; error?: string }> {
    try {
      let payload: AddContentPayload;

      if (isYouTubeUrl(url)) {
        // YouTube video - extract transcript via InnerTube
        const videoId = extractYoutubeId(url);
        if (!videoId) {
          throw new Error('Invalid YouTube URL');
        }

        // Check if item already exists on server (skip extraction if yes)
        const checkResult = await this._fetch(`/api/item/check?youtubeId=${videoId}`);

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
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
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
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            forceNew
          };
        }
      } else {
        // Web page - extract content via Jina Reader
        console.log('[STYA] Extracting web page via Jina:', url);
        const result = await getMarkdown(url);
        console.log('[STYA] Got web content, sending to server...');

        payload = {
          url: result.url,
          title: result.title,
          type: 'webpage',
          content: result.content,
          channel: result.domain,
          thumbnail: `https://www.google.com/s2/favicons?domain=${result.domain}&sz=64`,
          forceNew
        };
      }

      // Send to server
      const data = await this._fetch('/api/x10/add-content', {
        method: 'POST',
        body: { ...payload, userCode: this.userCode || undefined },
      });

      // Handle retryWithExtraction (item was deleted between check and add) - YouTube only
      if (data.retryWithExtraction && isYouTubeUrl(url)) {
        const videoId = extractYoutubeId(url);
        if (videoId) {
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

  // Add content to existing collection with frontend extraction
  // Supports both YouTube videos (via InnerTube) and web pages (via Jina)
  // Optimized: checks if YouTube item exists on server first to skip extraction
  async addVideoToX10WithExtraction(
    x10Id: string,
    url: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let payload: AddContentPayload;

      if (isYouTubeUrl(url)) {
        // YouTube video - extract transcript via InnerTube
        const videoId = extractYoutubeId(url);
        if (!videoId) {
          throw new Error('Invalid YouTube URL');
        }

        // Check if item already exists on server (skip extraction if yes)
        const checkResult = await this._fetch(`/api/item/check?youtubeId=${videoId}`);

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
      } else {
        // Web page - extract content via Jina Reader
        console.log('[STYA] Extracting web page via Jina:', url);
        const result = await getMarkdown(url);

        payload = {
          url: result.url,
          title: result.title,
          type: 'webpage',
          content: result.content,
          channel: result.domain,
          collectionId: x10Id
        };
      }

      const data = await this._fetch('/api/x10/add-content', {
        method: 'POST',
        body: { ...payload, userCode: this.userCode || undefined },
      });

      // Handle retryWithExtraction (item was deleted between check and add) - YouTube only
      if (data.retryWithExtraction && isYouTubeUrl(url)) {
        const videoId = extractYoutubeId(url);
        if (videoId) {
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
      width: 320px;
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
      width: 18px;
      height: 18px;
      text-align: center;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .x10-quick-icon svg {
      width: 100%;
      height: 100%;
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
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 16px;
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
    .x10-llm-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .x10-llm-icon svg {
      width: 100%;
      height: 100%;
    }
    .x10-llm-name {
      flex: 1;
    }
    .x10-llm-asterisk {
      color: #9CA3AF;
      margin-left: 2px;
    }
    .x10-llm-note {
      padding: 8px 16px;
      font-size: 11px;
      color: #9CA3AF;
      border-top: 1px solid #333;
      margin-top: 4px;
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
    .x10-item-thumb {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      overflow: hidden;
      flex-shrink: 0;
      background: #3f3f3f;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .x10-item-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .x10-item-thumb svg {
      width: 16px;
      height: 16px;
      opacity: 0.5;
    }
    .x10-item-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .x10-item-info .x10-item-name {
      font-size: 13px;
    }
    .x10-item-info .x10-item-count {
      font-size: 11px;
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

    /* Review prompt banner */
    #stya-dropdown .x10-review-banner {
      display: none;
      flex-direction: column !important;
      background: transparent !important;
      padding: 12px 16px !important;
      gap: 6px !important;
      margin: 0 !important;
      border: none !important;
      position: relative !important;
    }
    #stya-dropdown .x10-review-banner.visible {
      display: flex !important;
    }
    #stya-dropdown .x10-review-row {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }
    #stya-dropdown .x10-review-row a {
      color: #E8C547 !important;
      text-decoration: none !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    #stya-dropdown .x10-review-row a:hover {
      color: #F5D76E !important;
      text-decoration: underline !important;
    }
    #stya-dropdown .x10-review-row svg {
      width: 14px !important;
      height: 14px !important;
      flex-shrink: 0 !important;
    }
    #stya-dropdown .x10-review-star {
      color: #D4A017 !important;
      fill: #D4A017 !important;
    }
    #stya-dropdown .x10-review-message {
      color: #9CA3AF !important;
      stroke: #9CA3AF !important;
    }
    #stya-dropdown .x10-review-close {
      position: absolute !important;
      top: 8px !important;
      right: 8px !important;
      background: none !important;
      border: none !important;
      color: rgba(255,255,255,0.5) !important;
      font-size: 18px !important;
      cursor: pointer !important;
      padding: 0 4px !important;
      line-height: 1 !important;
    }
    #stya-dropdown .x10-review-close:hover {
      color: #fff !important;
    }

    /* Clipboard warning modal (separate overlay) */
    #x10-clipboard-modal {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      z-index: 999999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: 'Roboto', 'Arial', sans-serif !important;
    }
    #x10-clipboard-modal .x10-modal-backdrop {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background: rgba(0, 0, 0, 0.6) !important;
    }
    #x10-clipboard-modal .x10-modal-content {
      position: relative !important;
      background: #1e1e1e !important;
      border: 1px solid #3f3f3f !important;
      border-radius: 16px !important;
      padding: 24px !important;
      width: 90% !important;
      max-width: 400px !important;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5) !important;
      animation: x10-modal-in 0.2s ease-out !important;
    }
    @keyframes x10-modal-in {
      from { opacity: 0; transform: scale(0.95) translateY(-10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    #x10-clipboard-modal .x10-modal-header {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      margin-bottom: 16px !important;
      color: #9CA3AF !important;
      font-size: 14px !important;
      font-weight: 600 !important;
    }
    #x10-clipboard-modal .x10-modal-body {
      color: #e0e0e0 !important;
      font-size: 14px !important;
      line-height: 1.6 !important;
      margin-bottom: 20px !important;
    }
    #x10-clipboard-modal .x10-modal-body p {
      margin: 0 0 12px 0 !important;
    }
    #x10-clipboard-modal .x10-modal-body p:last-child {
      margin-bottom: 0 !important;
    }
    #x10-clipboard-modal .x10-modal-body strong {
      color: #fff !important;
    }
    #x10-clipboard-modal .x10-modal-actions {
      display: flex !important;
      gap: 12px !important;
      margin-bottom: 16px !important;
    }
    #x10-clipboard-modal .x10-modal-btn-primary {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      background: #4a4a4a !important;
      color: #fff !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 12px 20px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      flex: 1 !important;
    }
    #x10-clipboard-modal .x10-modal-btn-primary:hover {
      background: #5a5a5a !important;
    }
    #x10-clipboard-modal .x10-modal-btn-secondary {
      background: transparent !important;
      color: #9CA3AF !important;
      border: 1px solid #3f3f3f !important;
      border-radius: 8px !important;
      padding: 12px 20px !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
    }
    #x10-clipboard-modal .x10-modal-btn-secondary:hover {
      background: #2a2a2a !important;
      color: #fff !important;
    }
    #x10-clipboard-modal .x10-modal-dismiss {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      color: #9CA3AF !important;
      font-size: 12px !important;
      cursor: pointer !important;
      justify-content: flex-end !important;
    }
    #x10-clipboard-modal .x10-modal-dismiss input[type="checkbox"] {
      width: 14px !important;
      height: 14px !important;
      accent-color: #3b82f6 !important;
      cursor: pointer !important;
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

// LLM Icons - Color versions (brand colors)
const LLM_ICONS_COLOR: Record<string, string> = {
  claude: `<svg viewBox="0 0 16 16" fill="#D97706"><path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/></svg>`,
  chatgpt: `<svg viewBox="0 0 16 16" fill="#10A37F"><path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z"/></svg>`,
  gemini: `<svg viewBox="0 0 16 16"><defs><linearGradient id="gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#4285F4"/><stop offset="50%" style="stop-color:#9B72CB"/><stop offset="100%" style="stop-color:#D96570"/></linearGradient></defs><path fill="url(#gemini-grad)" d="M15.545 6.558a9.4 9.4 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.7 7.7 0 0 1 5.352 2.082l-2.284 2.284A4.35 4.35 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.8 4.8 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.7 3.7 0 0 0 1.599-2.431H8v-3.08z"/></svg>`,
  perplexity: `<svg viewBox="0 0 16 16" fill="#20B2AA"><path d="M8 .188a.5.5 0 0 1 .503.5V4.03l3.022-2.92.059-.048a.51.51 0 0 1 .49-.054.5.5 0 0 1 .306.46v3.247h1.117l.1.01a.5.5 0 0 1 .403.49v5.558a.5.5 0 0 1-.503.5H12.38v3.258a.5.5 0 0 1-.312.462.51.51 0 0 1-.55-.11l-3.016-3.018v3.448c0 .275-.225.5-.503.5a.5.5 0 0 1-.503-.5v-3.448l-3.018 3.019a.51.51 0 0 1-.548.11.5.5 0 0 1-.312-.463v-3.258H2.503a.5.5 0 0 1-.503-.5V5.215l.01-.1c.047-.229.25-.4.493-.4H3.62V1.469l.006-.074a.5.5 0 0 1 .302-.387.51.51 0 0 1 .547.102l3.023 2.92V.687c0-.276.225-.5.503-.5M4.626 9.333v3.984l2.87-2.872v-4.01zm3.877 1.113 2.871 2.871V9.333l-2.87-2.897zm3.733-1.668a.5.5 0 0 1 .145.35v1.145h.612V5.715H9.201zm-9.23 1.495h.613V9.13c0-.131.052-.257.145-.35l3.033-3.064h-3.79zm1.62-5.558H6.76L4.626 2.652zm4.613 0h2.134V2.652z"/></svg>`,
  grok: `<svg viewBox="0 0 16 16" fill="#FFFFFF"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/></svg>`,
  copilot: `<svg viewBox="0 0 16 16"><defs><linearGradient id="copilot-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0078D4"/><stop offset="100%" style="stop-color:#00BCF2"/></linearGradient></defs><path fill="url(#copilot-grad)" d="M7.462 0H0v7.19h7.462zM16 0H8.538v7.19H16zM7.462 8.211H0V16h7.462zm8.538 0H8.538V16H16z"/></svg>`
};

// LLM Icons - Monochrome versions (white)
const LLM_ICONS_MONO: Record<string, string> = {
  claude: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/></svg>`,
  chatgpt: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z"/></svg>`,
  gemini: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M15.545 6.558a9.4 9.4 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.7 7.7 0 0 1 5.352 2.082l-2.284 2.284A4.35 4.35 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.8 4.8 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.7 3.7 0 0 0 1.599-2.431H8v-3.08z"/></svg>`,
  perplexity: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 .188a.5.5 0 0 1 .503.5V4.03l3.022-2.92.059-.048a.51.51 0 0 1 .49-.054.5.5 0 0 1 .306.46v3.247h1.117l.1.01a.5.5 0 0 1 .403.49v5.558a.5.5 0 0 1-.503.5H12.38v3.258a.5.5 0 0 1-.312.462.51.51 0 0 1-.55-.11l-3.016-3.018v3.448c0 .275-.225.5-.503.5a.5.5 0 0 1-.503-.5v-3.448l-3.018 3.019a.51.51 0 0 1-.548.11.5.5 0 0 1-.312-.463v-3.258H2.503a.5.5 0 0 1-.503-.5V5.215l.01-.1c.047-.229.25-.4.493-.4H3.62V1.469l.006-.074a.5.5 0 0 1 .302-.387.51.51 0 0 1 .547.102l3.023 2.92V.687c0-.276.225-.5.503-.5M4.626 9.333v3.984l2.87-2.872v-4.01zm3.877 1.113 2.871 2.871V9.333l-2.87-2.897zm3.733-1.668a.5.5 0 0 1 .145.35v1.145h.612V5.715H9.201zm-9.23 1.495h.613V9.13c0-.131.052-.257.145-.35l3.033-3.064h-3.79zm1.62-5.558H6.76L4.626 2.652zm4.613 0h2.134V2.652z"/></svg>`,
  grok: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/></svg>`,
  copilot: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.462 0H0v7.19h7.462zM16 0H8.538v7.19H16zM7.462 8.211H0V16h7.462zm8.538 0H8.538V16H16z"/></svg>`
};

function updateDirectButton(dropdown: HTMLElement, llmKey: string): void {
  const btn = dropdown.querySelector('#x10-open-direct') as HTMLElement | null;
  const icon = dropdown.querySelector('#x10-open-direct .x10-quick-icon');
  const label = dropdown.querySelector('#x10-open-direct-label');
  if (btn && icon && label && llmKey && LLM_NAMES[llmKey]) {
    icon.innerHTML = LLM_ICONS_COLOR[llmKey] || '';
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

  // Review prompt banner (hidden by default, shown after N actions if no news)
  const reviewBanner = `
    <div class="x10-review-banner" id="x10-review-banner">
      <div class="x10-review-row">
        <a href="${__CHROME_EXTENSION_URL__}/reviews" target="_blank" id="x10-review-link">
          <svg class="x10-review-star" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;min-width:14px;flex-shrink:0;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          <span>Like it? Leave a review</span>
        </a>
      </div>
      <div class="x10-review-row">
        <a href="mailto:toyourai@plstry.me?subject=StraightToYourAI Feedback" target="_blank" id="x10-feedback-link">
          <svg class="x10-review-message" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;min-width:14px;flex-shrink:0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Got issues? Tell me</span>
        </a>
      </div>
      <button class="x10-review-close" id="x10-review-close">&times;</button>
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
        <button class="x10-submenu-item" data-llm="claude"><span class="x10-llm-icon">${LLM_ICONS_COLOR.claude}</span><span class="x10-llm-name">Claude</span></button>
        <button class="x10-submenu-item" data-llm="chatgpt"><span class="x10-llm-icon">${LLM_ICONS_COLOR.chatgpt}</span><span class="x10-llm-name">ChatGPT</span></button>
        <button class="x10-submenu-item" data-llm="gemini"><span class="x10-llm-icon">${LLM_ICONS_COLOR.gemini}</span><span class="x10-llm-name">Gemini<span class="x10-llm-asterisk">*</span></span></button>
        <button class="x10-submenu-item" data-llm="perplexity"><span class="x10-llm-icon">${LLM_ICONS_COLOR.perplexity}</span><span class="x10-llm-name">Perplexity<span class="x10-llm-asterisk">*</span></span></button>
        <button class="x10-submenu-item" data-llm="grok"><span class="x10-llm-icon">${LLM_ICONS_COLOR.grok}</span><span class="x10-llm-name">Grok</span></button>
        <button class="x10-submenu-item" data-llm="copilot"><span class="x10-llm-icon">${LLM_ICONS_COLOR.copilot}</span><span class="x10-llm-name">Copilot</span></button>
        <div class="x10-llm-note">* Clipboard mode — paste manually</div>
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

  overlay.innerHTML = header + newsBanner + reviewBanner + infoSection + quickActions + listAndFooter;

  // Setup event listeners
  setupOverlayEventListeners(overlay, pageInfo);

  // Check and show news or review banner
  checkAndShowBanners(overlay);

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
    const llm = data.styaLastLLM as string;
    if (!llm) return;

    // Check if this LLM requires clipboard mode
    if (CLIPBOARD_ONLY_LLMS.includes(llm)) {
      const storageKey = `${llm}WarningDismissed`;
      const dismissData = await safeStorageGet([storageKey]);
      if (dismissData[storageKey]) {
        // Warning already dismissed - go directly to clipboard mode
        handleClipboardOnlyLLM(pageInfo.url, llm);
      } else {
        // Show warning popover
        showClipboardWarningPopover(llm, pageInfo.url, overlay);
      }
    } else {
      handleOpenInLLM(pageInfo.url, llm);
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
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const llm = (item as HTMLElement).dataset.llm;
      if (!llm) return;
      await safeStorageSet({ styaLastLLM: llm });
      updateDirectButton(overlay, llm);

      // Check if this LLM requires clipboard mode
      if (CLIPBOARD_ONLY_LLMS.includes(llm)) {
        const storageKey = `${llm}WarningDismissed`;
        const data = await safeStorageGet([storageKey]);
        if (data[storageKey]) {
          // Warning already dismissed - go directly to clipboard mode
          handleClipboardOnlyLLM(pageInfo.url, llm);
        } else {
          // Show warning popover
          showClipboardWarningPopover(llm, pageInfo.url, overlay);
        }
      } else {
        handleOpenInLLM(pageInfo.url, llm);
      }
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

async function incrementPopupOpenCount(): Promise<number> {
  try {
    const data = await safeStorageGet(['popupOpenCount']);
    const count = (typeof data.popupOpenCount === 'number' ? data.popupOpenCount : 0) + 1;
    await safeStorageSet({ popupOpenCount: count });
    return count;
  } catch (error) {
    return 0;
  }
}

async function checkAndShowBanners(overlay: HTMLElement): Promise<void> {
  // Increment popup open count
  const openCount = await incrementPopupOpenCount();

  // Try to show news banner first
  const newsShown = await checkAndShowNewsBanner(overlay);

  // If no news, try to show review banner
  if (!newsShown) {
    await checkAndShowReviewBanner(overlay, openCount);
  }
}

async function checkAndShowNewsBanner(overlay: HTMLElement): Promise<boolean> {
  const banner = overlay.querySelector('#x10-news-banner') as HTMLElement | null;
  const textEl = overlay.querySelector('#x10-news-text') as HTMLElement | null;

  if (!banner || !textEl) return false;

  try {
    // Fetch news.json directly
    const response = await fetch(`${api.baseUrl}/news.json`);
    if (!response.ok) return false;

    const news = await response.json();

    // Validate news data
    const newsId = news?.id;
    const newsTitle = news?.title;
    const newsUrl = news?.url;

    if (typeof newsId !== 'string' || !newsId.trim()) return false;
    if (typeof newsTitle !== 'string' || !newsTitle.trim()) return false;

    // Check if already seen
    const data = await safeStorageGet(['lastSeenNewsId']);
    if (newsId === data.lastSeenNewsId) return false;

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

    return true;
  } catch (error) {
    return false;
  }
}

async function checkAndShowReviewBanner(overlay: HTMLElement, openCount: number): Promise<void> {
  const banner = overlay.querySelector('#x10-review-banner') as HTMLElement | null;
  if (!banner) return;

  try {
    const data = await safeStorageGet(['reviewDismissCount', 'reviewDismissedAtCount']);
    const dismissCount = typeof data.reviewDismissCount === 'number' ? data.reviewDismissCount : 0;
    const dismissedAt = typeof data.reviewDismissedAtCount === 'number' ? data.reviewDismissedAtCount : 0;

    // Never show again after 2 dismissals
    if (dismissCount >= 2) return;

    // First time: show after REVIEW_PROMPT_FIRST opens
    if (dismissCount === 0 && openCount < __REVIEW_PROMPT_FIRST__) return;

    // Second time: show REVIEW_PROMPT_SECOND opens after first dismissal
    if (dismissCount === 1 && openCount < dismissedAt + __REVIEW_PROMPT_SECOND__) return;

    // Show banner
    banner.classList.add('visible');

    // Setup dismiss handler
    overlay.querySelector('#x10-review-close')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await safeStorageSet({
        reviewDismissCount: dismissCount + 1,
        reviewDismissedAtCount: openCount
      });
      banner.classList.remove('visible');
    });
  } catch (error) {
    // Silent fail
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

  // Plus icon for create button
  const plusIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;

  // "Create new collection" button
  const createItem = document.createElement('button');
  createItem.className = 'x10-item x10-item-create';
  createItem.innerHTML = `
    <span class="x10-item-thumb" style="background: #4a4a4a;">${plusIcon}</span>
    <span class="x10-item-info">
      <span class="x10-item-name">New collection</span>
    </span>
  `;
  createItem.addEventListener('click', () => handleCreateWithUrl(pageInfo.url));
  listEl.appendChild(createItem);

  // Fallback folder icon for collections without thumbnail
  const folderIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;

  // Existing collections
  currentX10s.forEach(x10 => {
    const isIn = pageInfo.videoId ? itemInX10s.includes(x10.id) : false;
    const item = document.createElement('button');
    item.className = 'x10-item';
    item.dataset.x10Id = x10.id;
    const thumbContent = x10.thumbnail
      ? `<img src="${escapeHtml(x10.thumbnail)}" alt="" onerror="this.parentElement.innerHTML='${folderIcon}'">`
      : folderIcon;
    item.innerHTML = `
      <span class="x10-item-thumb">${thumbContent}</span>
      <span class="x10-item-info">
        <span class="x10-item-name">${escapeHtml(x10.title || 'Untitled')}</span>
        <span class="x10-item-count">${x10.videoCount} item${x10.videoCount !== 1 ? 's' : ''}</span>
      </span>
      <span class="x10-item-check">${isIn ? '✓' : ''}</span>
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

// LLMs that don't support URL fetching - use clipboard mode instead
const CLIPBOARD_ONLY_LLMS = ['gemini', 'perplexity'];

// Base URLs for clipboard-only LLMs (no prompt parameter)
const LLM_CLIPBOARD_URLS: Record<string, string> = {
  gemini: 'https://gemini.google.com/app',
  perplexity: 'https://www.perplexity.ai/'
};

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

    const txtUrl = `${api.baseUrl}/s/${result.x10Id}.txt`;
    const prompt = `Fetch ${txtUrl}`;
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

    const txtUrl = `${api.baseUrl}/s/${result.x10Id}.txt`;
    await navigator.clipboard.writeText(txtUrl);
    showToast('Link copied!', 'success');
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

    const txtUrl = `${api.baseUrl}/s/${result.x10Id}.txt`;
    showToast('Fetching content...', '');

    const response = await fetch(txtUrl);
    const txtContent = await response.text();

    await navigator.clipboard.writeText(txtContent);
    showToast('MD content copied!', 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] handleCopyMDContent error:', error);
    showToast(`Error: ${errorMessage}`, 'error');
  }
}

// Clipboard icon SVG for toast
const CLIPBOARD_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

// Handle clipboard-only LLMs (Gemini, Perplexity)
async function handleClipboardOnlyLLM(url: string, llmType: string): Promise<void> {
  showToast('Creating collection...', '');
  closeDropdown();

  try {
    const result = await api.createX10WithExtraction(url, true);

    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      return;
    }

    const txtUrl = `${api.baseUrl}/s/${result.x10Id}.txt`;
    showToast('Fetching content...', '');

    const response = await fetch(txtUrl);
    const txtContent = await response.text();

    await navigator.clipboard.writeText(txtContent);

    // Open LLM and show toast
    const llmUrl = LLM_CLIPBOARD_URLS[llmType];
    window.open(llmUrl, '_blank');
    showToastWithIcon(`${CLIPBOARD_ICON}Content copied — paste it!`, 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] handleClipboardOnlyLLM error:', error);
    showToast(`Error: ${errorMessage}`, 'error');
  }
}

// Show toast with HTML icon
function showToastWithIcon(html: string, type = ''): void {
  const toast = document.getElementById('stya-toast');
  if (!toast) return;
  toast.innerHTML = html;
  toast.className = 'show' + (type ? ` ${type}` : '');
  setTimeout(() => {
    toast.className = '';
  }, 3000);
}

// Show clipboard warning modal for LLMs that don't support URL fetching
function showClipboardWarningPopover(llmType: string, pageUrl: string, _overlay: HTMLElement): void {
  const llmName = LLM_NAMES[llmType] || llmType;

  // Remove any existing modal
  const existingModal = document.getElementById('x10-clipboard-modal');
  if (existingModal) existingModal.remove();

  // Create modal backdrop + content as a separate overlay
  const modal = document.createElement('div');
  modal.id = 'x10-clipboard-modal';
  modal.innerHTML = `
    <div class="x10-modal-backdrop"></div>
    <div class="x10-modal-content">
      <div class="x10-modal-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>Clipboard Mode</span>
      </div>
      <div class="x10-modal-body">
        <p><strong>${llmName}</strong> doesn't currently support fetching external links. This is a limitation on their side, not ours.</p>
        <p>Instead, we'll copy your content to the clipboard. Just paste it (Ctrl+V) once ${llmName} opens.</p>
      </div>
      <div class="x10-modal-actions">
        <button class="x10-modal-btn-primary" id="x10-modal-confirm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy & Open ${llmName}
        </button>
        <button class="x10-modal-btn-secondary" id="x10-modal-cancel">Cancel</button>
      </div>
      <label class="x10-modal-dismiss">
        <input type="checkbox" id="x10-modal-dismiss-checkbox">
        <span>Got it, don't show again</span>
      </label>
    </div>
  `;

  document.body.appendChild(modal);

  // Close dropdown
  closeDropdown();

  // Handle confirm button
  modal.querySelector('#x10-modal-confirm')?.addEventListener('click', async () => {
    const dismissCheckbox = modal.querySelector('#x10-modal-dismiss-checkbox') as HTMLInputElement;
    if (dismissCheckbox?.checked) {
      const storageKey = `${llmType}WarningDismissed`;
      await safeStorageSet({ [storageKey]: true });
    }
    modal.remove();
    handleClipboardOnlyLLM(pageUrl, llmType);
  });

  // Handle cancel button
  modal.querySelector('#x10-modal-cancel')?.addEventListener('click', () => {
    modal.remove();
  });

  // Close on backdrop click
  modal.querySelector('.x10-modal-backdrop')?.addEventListener('click', () => {
    modal.remove();
  });

  // Close on Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// ============================================
// Direct LLM Open (for website integration)
// ============================================
// These functions are used when clicking "Open in..." on toyourai.plstry.me
// The content is already extracted, so we just need to open the LLM

// Open directly in a regular LLM (Claude, ChatGPT, Grok, Copilot)
function openDirectInLLM(mdUrl: string, llmType: string): void {
  const prompt = `Fetch ${mdUrl}`;
  const llmUrl = LLM_URLS[llmType](prompt);
  window.open(llmUrl, '_blank');
}

// Open directly in clipboard-only LLM (Gemini, Perplexity)
async function openDirectClipboardLLM(mdUrl: string, llmType: string): Promise<void> {
  try {
    showToast('Copying content...', '');
    const response = await fetch(mdUrl);
    const content = await response.text();
    await navigator.clipboard.writeText(content);

    const llmUrl = LLM_CLIPBOARD_URLS[llmType];
    window.open(llmUrl, '_blank');
    showToastWithIcon(`${CLIPBOARD_ICON}Content copied — paste it!`, 'success');
  } catch (error) {
    console.error('[STYA] openDirectClipboardLLM error:', error);
    showToast('Error copying content', 'error');
  }
}

// Show clipboard warning modal for direct website integration
function showDirectClipboardWarning(llmType: string, mdUrl: string): void {
  const llmName = LLM_NAMES[llmType] || llmType;

  const existingModal = document.getElementById('x10-clipboard-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'x10-clipboard-modal';
  modal.innerHTML = `
    <div class="x10-modal-backdrop"></div>
    <div class="x10-modal-content">
      <div class="x10-modal-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>Clipboard Mode</span>
      </div>
      <div class="x10-modal-body">
        <p><strong>${llmName}</strong> doesn't currently support fetching external links. This is a limitation on their side, not ours.</p>
        <p>Instead, we'll copy your content to the clipboard. Just paste it (Ctrl+V) once ${llmName} opens.</p>
      </div>
      <div class="x10-modal-actions">
        <button class="x10-modal-btn-primary" id="x10-modal-confirm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy & Open ${llmName}
        </button>
        <button class="x10-modal-btn-secondary" id="x10-modal-cancel">Cancel</button>
      </div>
      <label class="x10-modal-dismiss">
        <input type="checkbox" id="x10-modal-dismiss-checkbox">
        <span>Got it, don't show again</span>
      </label>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#x10-modal-confirm')?.addEventListener('click', async () => {
    const dismissCheckbox = modal.querySelector('#x10-modal-dismiss-checkbox') as HTMLInputElement;
    if (dismissCheckbox?.checked) {
      const storageKey = `${llmType}WarningDismissed`;
      await safeStorageSet({ [storageKey]: true });
    }
    modal.remove();
    openDirectClipboardLLM(mdUrl, llmType);
  });

  modal.querySelector('#x10-modal-cancel')?.addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('.x10-modal-backdrop')?.addEventListener('click', () => {
    modal.remove();
  });

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// Handle clicks on [data-stya-open-in] buttons on the website
function initWebsiteIntegration(): void {
  // Only run on toyourai.plstry.me or localhost
  if (!window.location.hostname.includes('toyourai.plstry.me') &&
      !window.location.hostname.includes('localhost')) {
    return;
  }

  // Create toast element if not exists
  createToast();

  // Listen for clicks on Open In buttons
  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-stya-open-in]') as HTMLElement | null;
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const llmType = btn.dataset.styaOpenIn;
    const mdUrl = btn.dataset.styaMdUrl;

    if (!llmType || !mdUrl) return;

    if (CLIPBOARD_ONLY_LLMS.includes(llmType)) {
      // Check if warning was dismissed
      const storageKey = `${llmType}WarningDismissed`;
      const data = await safeStorageGet([storageKey]);
      if (data[storageKey]) {
        openDirectClipboardLLM(mdUrl, llmType);
      } else {
        showDirectClipboardWarning(llmType, mdUrl);
      }
    } else {
      openDirectInLLM(mdUrl, llmType);
    }
  });
}

// Initialize website integration
initWebsiteIntegration();

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
