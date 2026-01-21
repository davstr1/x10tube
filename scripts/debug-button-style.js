/**
 * Debug why button is not visible
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

    // Inject with explicit inline styles
    await page.evaluate(() => {
      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.textContent = '+';
        btn.dataset.videoId = videoId;
        // Use inline styles to ensure visibility
        btn.style.cssText = `
          width: 28px !important;
          height: 28px !important;
          background: #dc2626 !important;
          color: white !important;
          border: none !important;
          border-radius: 2px !important;
          font-size: 18px !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 28px !important;
          min-height: 28px !important;
        `;
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) return;
        const btn = createMiniButton(videoId);
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-btn-wrapper';
        wrapper.style.cssText = 'display: inline-block !important;';
        wrapper.appendChild(btn);
        overlayContainer.appendChild(wrapper);
        console.log('[X10Tube] Button injected');
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

    // Debug computed styles
    const debug = await page.evaluate(() => {
      const btn = document.querySelector('.x10tube-mini-btn');
      const wrapper = document.querySelector('.x10tube-btn-wrapper');
      const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');

      if (!btn) return { error: 'Button not found' };

      const btnStyle = getComputedStyle(btn);
      const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;

      // Get all buttons in overlay
      const allBtnsInOverlay = overlay ? Array.from(overlay.querySelectorAll('button')).map(b => ({
        className: b.className.substring(0, 50),
        width: getComputedStyle(b).width,
        height: getComputedStyle(b).height,
        display: getComputedStyle(b).display,
        visibility: getComputedStyle(b).visibility,
        opacity: getComputedStyle(b).opacity
      })) : [];

      return {
        button: {
          width: btnStyle.width,
          height: btnStyle.height,
          display: btnStyle.display,
          visibility: btnStyle.visibility,
          opacity: btnStyle.opacity,
          background: btnStyle.background,
          position: btnStyle.position,
          zIndex: btnStyle.zIndex
        },
        wrapper: wrapperStyle ? {
          display: wrapperStyle.display,
          visibility: wrapperStyle.visibility,
          width: wrapperStyle.width,
          height: wrapperStyle.height
        } : null,
        overlay: overlayStyle ? {
          display: overlayStyle.display,
          visibility: overlayStyle.visibility,
          position: overlayStyle.position
        } : null,
        allButtonsInOverlay: allBtnsInOverlay,
        buttonBoundingRect: btn.getBoundingClientRect()
      };
    });

    console.log('Debug info:', JSON.stringify(debug, null, 2));

    // Screenshot
    await page.screenshot({ path: 'docs/debug-style.png' });
    console.log('Screenshot: docs/debug-style.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

debug();
