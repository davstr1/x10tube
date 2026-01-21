// Content script for Claude.ai - auto-paste captions and send

(async () => {
  // Check if there's a pending message to send
  const data = await chrome.storage.local.get(['pendingClaudeMessage']);

  if (!data.pendingClaudeMessage) {
    return;
  }

  const message = data.pendingClaudeMessage;

  // Clear the pending message
  await chrome.storage.local.remove(['pendingClaudeMessage']);

  console.log('[YT Captions] Found pending message for Claude, waiting for page load...');

  // Wait for the page to be fully loaded and the input to be available
  const waitForElement = (selector, maxWait = 10000) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        if (Date.now() - startTime > maxWait) {
          reject(new Error('Element not found: ' + selector));
          return;
        }

        setTimeout(check, 200);
      };

      check();
    });
  };

  try {
    // Wait a bit for the page to stabilize
    await new Promise(r => setTimeout(r, 1500));

    // Try to find the input field (Claude.ai uses a contenteditable div or ProseMirror)
    const inputSelectors = [
      'div[contenteditable="true"]',
      '.ProseMirror',
      'div[data-placeholder]',
      'textarea'
    ];

    let inputEl = null;
    for (const selector of inputSelectors) {
      try {
        inputEl = await waitForElement(selector, 5000);
        if (inputEl) break;
      } catch (e) {
        continue;
      }
    }

    if (!inputEl) {
      console.error('[YT Captions] Could not find Claude input field');
      // Fallback: copy to clipboard and alert user
      await navigator.clipboard.writeText(message);
      alert('Le message a été copié dans le presse-papiers. Collez-le (Ctrl+V) dans la zone de texte.');
      return;
    }

    console.log('[YT Captions] Found input element:', inputEl.tagName);

    // Focus the input
    inputEl.focus();

    // Set the content
    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = message;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // For contenteditable / ProseMirror
      // Use execCommand for better compatibility
      document.execCommand('insertText', false, message);

      // Also try setting innerHTML as fallback
      if (!inputEl.textContent) {
        inputEl.textContent = message;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    console.log('[YT Captions] Message inserted, waiting before sending...');

    // Wait a moment for the UI to update
    await new Promise(r => setTimeout(r, 500));

    // Try to find and click the send button
    const sendButtonSelectors = [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[aria-label="Envoyer"]',
      'button[data-testid="send-button"]',
      'button[type="submit"]',
      'button:has(svg[data-icon="arrow-up"])',
      'button:has(svg[data-icon="send"])'
    ];

    let sendBtn = null;
    for (const selector of sendButtonSelectors) {
      try {
        sendBtn = document.querySelector(selector);
        if (sendBtn && !sendBtn.disabled) break;
      } catch (e) {
        continue;
      }
    }

    // Fallback: find button by looking for arrow/send icon
    if (!sendBtn) {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.querySelector('svg') && !btn.disabled) {
          const rect = btn.getBoundingClientRect();
          // Usually the send button is at the bottom right of the input area
          if (rect.width > 20 && rect.height > 20) {
            sendBtn = btn;
            break;
          }
        }
      }
    }

    if (sendBtn && !sendBtn.disabled) {
      console.log('[YT Captions] Clicking send button...');
      sendBtn.click();
    } else {
      console.log('[YT Captions] Send button not found or disabled, user needs to send manually');
      // Message is already in the input, user can send manually
    }

  } catch (error) {
    console.error('[YT Captions] Error:', error);
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(message);
      alert('Le message a été copié dans le presse-papiers. Collez-le (Ctrl+V) dans la zone de texte.');
    } catch (e) {
      console.error('[YT Captions] Clipboard fallback failed:', e);
    }
  }
})();
