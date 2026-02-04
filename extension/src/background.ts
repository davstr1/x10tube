// StraightToYourAI Background Service Worker
// Minimal - API calls are now made directly from content scripts

console.log('[STYA] Background service worker loaded');

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[STYA] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[STYA] Extension updated to version', chrome.runtime.getManifest().version);
  }
});
