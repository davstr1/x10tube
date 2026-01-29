// StraightToYourAI API Client
// Single source of truth: the server (via /api/whoami)

const DEFAULT_BASE_URL = 'http://localhost:3000';

class StyaAPI {
  constructor() {
    this.baseUrl = DEFAULT_BASE_URL;
    this.userCode = null;
  }

  async init() {
    // Get base URL from storage
    const data = await chrome.storage.local.get(['styaBackendUrl']);
    if (data.styaBackendUrl) {
      this.baseUrl = data.styaBackendUrl;
    }

    // Ask the SERVER who we are - server's cookie is the source of truth
    const connected = await this.syncFromServer();

    console.log('[STYA] Initialized with userCode:', this.userCode);
    return connected;
  }

  async syncFromServer() {
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
      this.lastError = error.message;
      console.error('[STYA] Could not reach server:', error.message, error);
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

  async setBaseUrl(url) {
    this.baseUrl = url;
    await chrome.storage.local.set({ styaBackendUrl: url });
  }

  // Get user's x10s list
  async getMyX10s() {
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
      console.error('[STYA] getMyX10s error:', error);
      return { x10s: [], userCode: this.userCode, error: error.message };
    }
  }

  // Create a new x10 with a single video
  async createX10(videoUrl, forceNew = false) {
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
      console.error('[STYA] createX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  // Add video to an existing x10
  async addVideoToX10(x10Id, videoUrl) {
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
      console.error('[STYA] addVideoToX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  // Check if a video is in any of user's x10s
  async checkVideoInX10s(youtubeId) {
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
      console.error('[STYA] checkVideoInX10s error:', error);
      return { inX10s: [], error: error.message };
    }
  }

  getDashboardUrl() {
    return `${this.baseUrl}/collections`;
  }

  getSyncUrl() {
    return `${this.baseUrl}/sync`;
  }

  getX10Url(x10Id) {
    return `${this.baseUrl}/s/${x10Id}`;
  }
}

// Export for popup
if (typeof window !== 'undefined') {
  window.StyaAPI = StyaAPI;
}
