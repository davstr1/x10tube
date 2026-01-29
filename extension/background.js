// StraightToYourAI Background Service Worker
// Minimal - cookie sync now handled via /api/whoami

console.log('[STYA] Background service worker loaded');

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[STYA] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[STYA] Extension updated to version', chrome.runtime.getManifest().version);
    // Clear old storage on update to ensure clean state
    await chrome.storage.local.clear();
    console.log('[STYA] Storage cleared on update');
  }
});
