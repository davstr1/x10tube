// X10Tube Content Script for x10tube.com
// Syncs user code from website to extension

(async function() {
  // Look for user code on the page
  const userCodeEl = document.querySelector('[data-x10-user-code]');

  if (userCodeEl) {
    const userCode = userCodeEl.getAttribute('data-x10-user-code');

    if (userCode && userCode.length > 0) {
      // Get current stored code
      const data = await chrome.storage.local.get(['x10UserCode']);

      // Only update if different
      if (data.x10UserCode !== userCode) {
        await chrome.storage.local.set({ x10UserCode: userCode });
        console.log('[X10Tube] User code synced from website');
      }
    }
  }
})();
