/**
 * Keep hover active and take multiple screenshots
 */

const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Inject with explicit red styling
    await page.evaluate(() => {
      // Add CSS
      const style = document.createElement('style');
      style.textContent = `
        .x10tube-mini-btn {
          width: 32px !important;
          height: 32px !important;
          min-width: 32px !important;
          min-height: 32px !important;
          background: #dc2626 !important;
          color: white !important;
          border: none !important;
          border-radius: 50% !important;
          font-size: 20px !important;
          font-weight: bold !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
        }
      `;
      document.head.appendChild(style);

      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.textContent = '+';
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) return;
        const btn = createMiniButton(videoId);
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton';
        wrapper.appendChild(btn);
        overlayContainer.insertBefore(wrapper, overlayContainer.firstChild);
      }

      function setupHoverObserver(thumbnailViewModel, videoId) {
        if (thumbnailViewModel.dataset.x10Observer) return;
        thumbnailViewModel.dataset.x10Observer = 'true';

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE &&
                  node.tagName.toLowerCase() === 'yt-thumbnail-hover-overlay-toggle-actions-view-model') {
                injectButtonIntoHoverOverlay(node, videoId);
              }
            }
          }
        });
        observer.observe(thumbnailViewModel, { childList: true });
      }

      document.querySelectorAll('#related .yt-lockup-view-model').forEach(lockup => {
        const link = lockup.querySelector('a[href*="/watch?v="]');
        if (!link) return;
        const videoId = new URL(link.href).searchParams.get('v');
        const thumbnailViewModel = lockup.querySelector('yt-thumbnail-view-model');
        if (thumbnailViewModel) {
          setupHoverObserver(thumbnailViewModel, videoId);
        }
      });

      window.x10Ready = true;
    });

    // Get first thumbnail position
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + 50 };
    });

    console.log('Hovering at:', thumbPos);

    // Start hover
    await page.mouse.move(thumbPos.x, thumbPos.y);

    // Wait and take screenshots while hovering
    for (let i = 1; i <= 3; i++) {
      await new Promise(r => setTimeout(r, 1000));

      const state = await page.evaluate(() => {
        const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
        const btn = document.querySelector('.x10tube-mini-btn');
        return {
          overlayExists: !!overlay,
          overlayVisible: overlay ? getComputedStyle(overlay).visibility : null,
          btnExists: !!btn,
          btnRect: btn ? btn.getBoundingClientRect() : null
        };
      });

      console.log(`State ${i}:`, state);

      // Move mouse slightly to keep hover active
      await page.mouse.move(thumbPos.x + i, thumbPos.y);
    }

    // Screenshot with mouse still hovering
    const clip = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      const rect = lockup.getBoundingClientRect();
      return {
        x: rect.x - 10,
        y: rect.y - 10,
        width: rect.width + 20,
        height: rect.height + 20
      };
    });

    await page.screenshot({
      path: 'docs/test-hover-closeup.png',
      clip: clip
    });
    console.log('Screenshot: docs/test-hover-closeup.png');

    // Also full sidebar
    await page.screenshot({ path: 'docs/test-hover-full.png' });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
