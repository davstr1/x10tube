// StraightToYourAI API Client
// Single source of truth: the server (via /api/whoami)

import { config } from './config';
import type { X10Collection, AddContentPayload } from './types';
import { getTranscript, extractVideoId } from './innertube';
import { getMarkdown, isYouTubeUrl } from './jina';

interface GetMyX10sResult {
  x10s: X10Collection[];
  userCode: string | null;
  error?: string;
}

interface CreateX10Result {
  success: boolean;
  x10?: unknown;
  error?: string;
}

interface AddVideoResult {
  success: boolean;
  video?: unknown;
  error?: string;
}

interface CheckVideoResult {
  inX10s: string[];
  error?: string;
}

interface AddContentResult {
  success: boolean;
  itemId?: string;
  collectionId?: string;
  error?: string;
}

interface AddWithExtractionResult {
  success: boolean;
  itemId?: string;
  collectionId?: string;
  userCode?: string;
  error?: string;
}

export class StyaAPI {
  baseUrl: string;
  userCode: string | null;
  lastError: string | null;

  constructor() {
    this.baseUrl = config.baseUrl;
    this.userCode = null;
    this.lastError = null;
  }

  async init(): Promise<boolean> {
    // Get base URL from storage (user override)
    const data = await chrome.storage.local.get(['styaBackendUrl']);
    if (data.styaBackendUrl) {
      this.baseUrl = data.styaBackendUrl;
    }

    // Ask the SERVER who we are - server's cookie is the source of truth
    const connected = await this.syncFromServer();

    console.log('[STYA] Initialized with userCode:', this.userCode);
    return connected;
  }

  async syncFromServer(): Promise<boolean> {
    try {
      console.log('[STYA] Asking server /api/whoami at', this.baseUrl);
      const response = await fetch(`${this.baseUrl}/api/whoami`, {
        credentials: 'include' // This sends the httpOnly cookie!
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      console.log('[STYA] Server says userCode:', data.userCode);

      if (data.userCode) {
        this.userCode = data.userCode;
        // Cache locally (but server is always the source of truth)
        await chrome.storage.local.set({ styaUserCode: data.userCode });
      }
      this.lastError = null;
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.lastError = errorMessage;
      console.error('[STYA] Could not reach server:', errorMessage, error);
      // Fallback to cached value if server unreachable
      const cached = await chrome.storage.local.get(['styaUserCode']);
      if (cached.styaUserCode) {
        console.log('[STYA] Using cached userCode:', cached.styaUserCode);
        this.userCode = cached.styaUserCode;
        return true; // We have a cached userCode, so we can still work
      }
      return false;
    }
  }

  async setBaseUrl(url: string): Promise<void> {
    this.baseUrl = url;
    await chrome.storage.local.set({ styaBackendUrl: url });
  }

  // Get user's x10s list
  async getMyX10s(): Promise<GetMyX10sResult> {
    if (!this.userCode) {
      return { x10s: [], userCode: null };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/x10s/by-code/${this.userCode}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { x10s: data.x10s || [], userCode: this.userCode };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] getMyX10s error:', error);
      return { x10s: [], userCode: this.userCode, error: errorMessage };
    }
  }

  // Create a new x10 with a single video (legacy - server extracts content)
  async createX10(videoUrl: string, forceNew = false): Promise<CreateX10Result> {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: videoUrl,
          userCode: this.userCode || undefined,
          forceNew
        })
      });

      const data = await response.json();

      if (data.success) {
        // Server may return a new userCode if we didn't have one
        if (data.userCode) {
          this.userCode = data.userCode;
          await chrome.storage.local.set({ styaUserCode: data.userCode });
        }
        return { success: true, x10: data };
      } else {
        throw new Error(data.error || 'Failed to create x10');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] createX10 error:', error);
      return { success: false, error: errorMessage };
    }
  }

  // Add video to an existing x10 (legacy - server extracts content)
  async addVideoToX10(x10Id: string, videoUrl: string): Promise<AddVideoResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/${x10Id}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          url: videoUrl,
          userCode: this.userCode
        })
      });

      const data = await response.json();

      if (data.success || response.ok) {
        return { success: true, video: data.video };
      } else {
        throw new Error(data.error || 'Failed to add video');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] addVideoToX10 error:', error);
      return { success: false, error: errorMessage };
    }
  }

  // NEW: Add pre-extracted content (extension extracts, server stores)
  async addContent(payload: AddContentPayload): Promise<AddContentResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/add-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...payload,
          userCode: this.userCode || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // Server may return a new userCode if we didn't have one
      if (data.userCode) {
        this.userCode = data.userCode;
        await chrome.storage.local.set({ styaUserCode: data.userCode });
      }

      return {
        success: true,
        itemId: data.itemId,
        collectionId: data.collectionId
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] addContent error:', error);
      return { success: false, error: errorMessage };
    }
  }

  // NEW: Extract content locally and send to server
  // This is the main method for frontend extraction (Phase 4)
  async addWithExtraction(
    url: string,
    options: { collectionId?: string; forceNew?: boolean } = {}
  ): Promise<AddWithExtractionResult> {
    try {
      console.log('[STYA] addWithExtraction:', url);

      let payload: AddContentPayload;

      if (isYouTubeUrl(url)) {
        // YouTube video - extract transcript
        const videoId = extractVideoId(url);
        if (!videoId) {
          throw new Error('Invalid YouTube URL');
        }

        console.log('[STYA] Extracting YouTube transcript for:', videoId);
        const result = await getTranscript(videoId);

        payload = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: result.title,
          type: 'youtube',
          content: result.transcript,
          youtube_id: videoId,
          channel: result.channel,
          duration: result.duration,
          collectionId: options.collectionId,
          forceNew: options.forceNew
        };
      } else {
        // Web page - extract via Jina Reader
        console.log('[STYA] Extracting web page via Jina:', url);
        const result = await getMarkdown(url);

        payload = {
          url: result.url,
          title: result.title,
          type: 'webpage',
          content: result.content,
          channel: result.domain,
          collectionId: options.collectionId,
          forceNew: options.forceNew
        };
      }

      // Send pre-extracted content to server
      console.log('[STYA] Sending extracted content to server');
      const addResult = await this.addContent(payload);

      if (!addResult.success) {
        throw new Error(addResult.error || 'Failed to add content');
      }

      return {
        success: true,
        itemId: addResult.itemId,
        collectionId: addResult.collectionId,
        userCode: this.userCode || undefined
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] addWithExtraction error:', error);
      return { success: false, error: errorMessage };
    }
  }

  // Check if a video is in any of user's x10s
  async checkVideoInX10s(youtubeId: string): Promise<CheckVideoResult> {
    if (!this.userCode) {
      return { inX10s: [] };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/check-video?videoId=${youtubeId}&userCode=${this.userCode}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { inX10s: data.inX10s || [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[STYA] checkVideoInX10s error:', error);
      return { inX10s: [], error: errorMessage };
    }
  }

  getDashboardUrl(): string {
    return `${this.baseUrl}/collections`;
  }

  getSyncUrl(): string {
    return `${this.baseUrl}/sync`;
  }

  getX10Url(x10Id: string): string {
    return `${this.baseUrl}/s/${x10Id}`;
  }
}

// Export singleton instance for easy use
export const api = new StyaAPI();
