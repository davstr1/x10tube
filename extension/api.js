// X10Tube API Client

const DEFAULT_BASE_URL = 'http://localhost:3000';

class X10TubeAPI {
  constructor() {
    this.baseUrl = DEFAULT_BASE_URL;
    this.userCode = null;
  }

  async init() {
    const data = await chrome.storage.local.get(['x10BackendUrl', 'x10UserCode']);
    if (data.x10BackendUrl) {
      this.baseUrl = data.x10BackendUrl;
    }
    if (data.x10UserCode) {
      this.userCode = data.x10UserCode;
    } else {
      // Try to read from website cookie
      await this.syncFromCookie();
    }
  }

  async syncFromCookie() {
    try {
      // Try localhost first (dev), then production domain
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
    this.userCode = code;
    await chrome.storage.local.set({ x10UserCode: code });
  }

  async setBaseUrl(url) {
    this.baseUrl = url;
    await chrome.storage.local.set({ x10BackendUrl: url });
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
      console.error('[X10Tube API] getMyX10s error:', error);
      return { x10s: [], userCode: this.userCode, error: error.message };
    }
  }

  // Create a new x10 with a single video
  async createX10(videoUrl) {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          userCode: this.userCode || undefined
        })
      });

      const data = await response.json();

      if (data.success) {
        // Save the user code if we got one back
        if (data.userCode && !this.userCode) {
          await this.setUserCode(data.userCode);
        }
        return { success: true, x10: data };
      } else {
        throw new Error(data.error || 'Failed to create x10');
      }
    } catch (error) {
      console.error('[X10Tube API] createX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  // Add video to an existing x10
  async addVideoToX10(x10Id, videoUrl) {
    try {
      const response = await fetch(`${this.baseUrl}/api/x10/${x10Id}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      console.error('[X10Tube API] addVideoToX10 error:', error);
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
      console.error('[X10Tube API] checkVideoInX10s error:', error);
      return { inX10s: [], error: error.message };
    }
  }

  getDashboardUrl() {
    return `${this.baseUrl}/dashboard`;
  }

  getSyncUrl() {
    return `${this.baseUrl}/sync`;
  }

  getX10Url(x10Id) {
    return `${this.baseUrl}/s/${x10Id}`;
  }
}

// Export singleton instance
const api = new X10TubeAPI();
