// StraightToYourAI Background Service Worker
// Handles: context menu, keyboard shortcut, extension icon click

console.log('[STYA] Background service worker loaded');

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface OverlayContext {
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
}

// ─────────────────────────────────────────────────────────────
// Installation : create context menu
// ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[STYA] Extension', details.reason);

  // Create context menu
  chrome.contextMenus.create({
    id: 'stya-send-to-ai',
    title: 'Send to my AI',
    contexts: ['page', 'link', 'video', 'image']
  });

  // Open welcome page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: `${__STYA_BASE_URL__}/welcome` });
  }

  // Fetch latest news
  fetchLatestNews();
});

// Also fetch news on browser startup
chrome.runtime.onStartup.addListener(() => {
  fetchLatestNews();
});

// ─────────────────────────────────────────────────────────────
// News fetching (cached for 24h)
// ─────────────────────────────────────────────────────────────

const NEWS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function fetchLatestNews(): Promise<void> {
  try {
    // Check if we fetched recently
    const data = await chrome.storage.local.get(['newsFetchedAt']);
    const now = Date.now();

    if (data.newsFetchedAt && (now - data.newsFetchedAt) < NEWS_CACHE_TTL) {
      console.log('[STYA] News cache still valid');
      return;
    }

    console.log('[STYA] Fetching latest news...');
    const response = await fetch(`${__STYA_BASE_URL__}/news.json`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const news = await response.json();
    await chrome.storage.local.set({
      cachedNews: news,
      newsFetchedAt: now
    });

    console.log('[STYA] News cached:', news.id);
  } catch (error) {
    console.error('[STYA] Failed to fetch news:', error);
    // Non-critical, silently fail
  }
}

// ─────────────────────────────────────────────────────────────
// Context menu click handler
// ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'stya-send-to-ai' && tab?.id) {
    await triggerOverlay(tab, {
      linkUrl: info.linkUrl,
      srcUrl: info.srcUrl,
      pageUrl: info.pageUrl
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Extension icon click handler
// ─────────────────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await triggerOverlay(tab);
});

// ─────────────────────────────────────────────────────────────
// Keyboard shortcut handler (Alt+Shift+A)
// ─────────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-overlay') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await triggerOverlay(tab);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Common function: trigger overlay in a tab
// ─────────────────────────────────────────────────────────────

async function triggerOverlay(tab: chrome.tabs.Tab, context?: OverlayContext): Promise<void> {
  if (!tab.id || !tab.url) return;

  // Pages where content scripts cannot be injected
  if (isRestrictedUrl(tab.url)) {
    console.log('[STYA] Restricted page:', tab.url);
    // Visual feedback on icon
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
    return;
  }

  const message = {
    action: 'openOverlay',
    centered: true,
    context: context || { pageUrl: tab.url }
  };

  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    // Content script not loaded yet → inject it dynamically
    console.log('[STYA] Injecting content script...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Wait a bit then retry
      await new Promise(r => setTimeout(r, 100));
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (injectErr) {
      console.error('[STYA] Failed to inject content script:', injectErr);
      // Show error badge
      chrome.action.setBadgeText({ text: '!', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
    }
  }
}

function isRestrictedUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url.includes('chromewebstore.google.com') ||
    url.startsWith('file://')
  );
}
