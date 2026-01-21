// Background script for YouTube Captions Grabber
// Handles fetch requests from content script to bypass CORS/restrictions

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchCaptions') {
    (async () => {
      const result = {
        success: false,
        content: null,
        error: null,
        debug: {}
      };

      try {
        const url = request.url;
        console.log('[YT Captions BG] Fetching:', url);

        const response = await fetch(url);
        result.debug.status = response.status;
        result.debug.statusText = response.statusText;
        result.debug.headers = {};

        // Log some headers for debugging
        response.headers.forEach((value, key) => {
          result.debug.headers[key] = value;
        });

        if (!response.ok) {
          result.error = `HTTP ${response.status}: ${response.statusText}`;
          sendResponse(result);
          return;
        }

        const text = await response.text();
        result.debug.length = text.length;
        result.debug.preview = text.substring(0, 200);

        console.log('[YT Captions BG] Response length:', text.length);
        console.log('[YT Captions BG] Response preview:', text.substring(0, 300));

        if (!text || text.trim() === '') {
          result.error = 'Empty response from YouTube';
          sendResponse(result);
          return;
        }

        result.success = true;
        result.content = text;
        sendResponse(result);

      } catch (e) {
        console.error('[YT Captions BG] Error:', e);
        result.error = e.message;
        result.debug.exception = e.toString();
        sendResponse(result);
      }
    })();

    return true; // Keep message channel open for async response
  }
});
