// X10Tube Background Service Worker
// Minimal - most logic is in popup.js

console.log('[X10Tube] Background service worker loaded');

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[X10Tube] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[X10Tube] Extension updated to version', chrome.runtime.getManifest().version);
  }
});
