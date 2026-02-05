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
});

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
