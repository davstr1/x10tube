// StraightToYourAI Background Service Worker
// Proxies API calls for the content script (avoids context invalidation)

try { importScripts('config.js'); } catch(e) {}
const DEFAULT_BASE_URL = (typeof STYA_CONFIG !== 'undefined') ? STYA_CONFIG.DEFAULT_BASE_URL : 'http://localhost:3000';

console.log('[STYA] Background service worker loaded');

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[STYA] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[STYA] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Get base URL from storage (cached in memory for perf)
let cachedBaseUrl = null;

async function getBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  try {
    const data = await chrome.storage.local.get(['styaBackendUrl']);
    cachedBaseUrl = data.styaBackendUrl || DEFAULT_BASE_URL;
  } catch {
    cachedBaseUrl = DEFAULT_BASE_URL;
  }
  return cachedBaseUrl;
}

// Invalidate cached URL when storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.styaBackendUrl) {
    cachedBaseUrl = changes.styaBackendUrl.newValue || DEFAULT_BASE_URL;
  }
});

// ============================================
// Message handler — proxy API calls
// ============================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'apiFetch') {
    handleApiFetch(msg)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ _error: true, message: error.message }));
    return true; // Keep channel open for async response
  }
});

async function handleApiFetch(msg) {
  const baseUrl = await getBaseUrl();
  const url = baseUrl + msg.endpoint;

  const options = {
    method: msg.method || 'GET',
    headers: msg.headers || {},
    credentials: 'include',
  };

  if (msg.body) {
    options.body = JSON.stringify(msg.body);
    if (!options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, options);

  if (msg.responseType === 'text') {
    const text = await response.text();
    return { _ok: response.ok, _status: response.status, data: text };
  }

  const data = await response.json();
  return { _ok: response.ok, _status: response.status, ...data };
}
