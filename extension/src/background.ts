// StraightToYourAI Background Service Worker
// Proxies API calls for the content script (avoids context invalidation)

import { config } from './lib/config';
import type { ApiFetchMessage, ApiFetchResponse } from './lib/types';

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
let cachedBaseUrl: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  try {
    const data = await chrome.storage.local.get(['styaBackendUrl']);
    cachedBaseUrl = data.styaBackendUrl || config.baseUrl;
  } catch {
    cachedBaseUrl = config.baseUrl;
  }
  return cachedBaseUrl!;
}

// Invalidate cached URL when storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.styaBackendUrl) {
    cachedBaseUrl = changes.styaBackendUrl.newValue || config.baseUrl;
  }
});

// ============================================
// Message handler — proxy API calls
// ============================================

chrome.runtime.onMessage.addListener((msg: ApiFetchMessage, _sender, sendResponse: (response: ApiFetchResponse) => void) => {
  if (msg.action === 'apiFetch') {
    handleApiFetch(msg)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        _ok: false,
        _status: 0,
        _error: true,
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    return true; // Keep channel open for async response
  }
  return false;
});

async function handleApiFetch(msg: ApiFetchMessage): Promise<ApiFetchResponse> {
  const baseUrl = await getBaseUrl();
  const url = baseUrl + msg.endpoint;

  const options: RequestInit = {
    method: msg.method || 'GET',
    headers: msg.headers || {},
    credentials: 'include',
  };

  if (msg.body) {
    options.body = JSON.stringify(msg.body);
    if (!(options.headers as Record<string, string>)['Content-Type']) {
      (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
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
