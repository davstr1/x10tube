/**
 * Test with button as first child
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

    // Inject with button as FIRST child
    await page.evaluate(() => {
      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.textContent = '+';
        btn.style.cssText = `
          width: 28px !important;
          height: 28px !important;
          background: #dc2626 !important;
          color: white !important;
          border: none !important;
          border-radius: 2px !important;
          font-size: 18px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        `;
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) return;
        const btn = createMiniButton(videoId);
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-btn-wrapper';
        wrapper.appendChild(btn);
        // Insert as FIRST child
        overlayContainer.insertBefore(wrapper, overlayContainer.firstChild);
        console.log('[X10Tube] Button injected as first child');
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
    });

    // Hover
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    await page.mouse.move(thumbPos.x, thumbPos.y);
    await new Promise(r => setTimeout(r, 2000));

    // Check positions
    const positions = await page.evaluate(() => {
      const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      const btn = document.querySelector('.x10tube-mini-btn');
      const thumbnail = document.querySelector('#related yt-thumbnail-view-model');

      const btnRect = btn?.getBoundingClientRect();
      const thumbRect = thumbnail?.getBoundingClientRect();

      const isOurButtonFirst = overlay?.firstElementChild?.classList.contains('x10tube-btn-wrapper');

      return {
        isOurButtonFirst,
        button: btnRect ? { x: Math.round(btnRect.x), y: Math.round(btnRect.y), width: btnRect.width, height: btnRect.height } : null,
        thumbnail: thumbRect ? { y: Math.round(thumbRect.y), bottom: Math.round(thumbRect.y + thumbRect.height) } : null,
        buttonWithinThumbnail: btnRect && thumbRect ? (btnRect.y >= thumbRect.y && btnRect.y + btnRect.height <= thumbRect.y + thumbRect.height) : false
      };
    });

    console.log('Positions:', JSON.stringify(positions, null, 2));

    // Take screenshot of sidebar area
    const sidebarRect = await page.evaluate(() => {
      const sidebar = document.querySelector('#secondary');
      const rect = sidebar.getBoundingClientRect();
      return { x: rect.x, y: 50, width: rect.width, height: 300 };
    });

    await page.screenshot({
      path: 'docs/test-first-position.png',
      clip: sidebarRect
    });
    console.log('Screenshot: docs/test-first-position.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
