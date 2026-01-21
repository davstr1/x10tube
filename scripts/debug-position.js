/**
 * Debug button position in overlay
 */

const puppeteer = require('puppeteer');

async function debug() {
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

    // Inject
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
        `;
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) return;
        const btn = createMiniButton(videoId);
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-btn-wrapper';
        wrapper.appendChild(btn);
        overlayContainer.appendChild(wrapper);
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

    // Get positions
    const positions = await page.evaluate(() => {
      const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      const btn = document.querySelector('.x10tube-mini-btn');
      const thumbnail = document.querySelector('#related yt-thumbnail-view-model');

      const overlayRect = overlay?.getBoundingClientRect();
      const btnRect = btn?.getBoundingClientRect();
      const thumbRect = thumbnail?.getBoundingClientRect();

      // Get all children positions
      const children = overlay ? Array.from(overlay.children).map(c => {
        const r = c.getBoundingClientRect();
        return {
          className: c.className.substring(0, 40),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height
        };
      }) : [];

      // Get overlay CSS
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;

      return {
        overlay: overlayRect ? { x: overlayRect.x, y: overlayRect.y, width: overlayRect.width, height: overlayRect.height } : null,
        overlayCSS: overlayStyle ? {
          display: overlayStyle.display,
          flexDirection: overlayStyle.flexDirection,
          position: overlayStyle.position,
          top: overlayStyle.top,
          right: overlayStyle.right,
          gap: overlayStyle.gap
        } : null,
        button: btnRect ? { x: btnRect.x, y: btnRect.y, width: btnRect.width, height: btnRect.height } : null,
        thumbnail: thumbRect ? { x: thumbRect.x, y: thumbRect.y, width: thumbRect.width, height: thumbRect.height } : null,
        children: children
      };
    });

    console.log('Positions:', JSON.stringify(positions, null, 2));

    // Draw red border around button position for visualization
    await page.evaluate((pos) => {
      if (pos.button) {
        const marker = document.createElement('div');
        marker.style.cssText = `
          position: fixed;
          left: ${pos.button.x}px;
          top: ${pos.button.y}px;
          width: ${pos.button.width}px;
          height: ${pos.button.height}px;
          border: 3px solid lime;
          z-index: 999999;
          pointer-events: none;
        `;
        document.body.appendChild(marker);
      }
    }, positions);

    await page.screenshot({ path: 'docs/debug-position.png' });
    console.log('Screenshot: docs/debug-position.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debug();
