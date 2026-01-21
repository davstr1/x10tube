/**
 * Screenshot the hover overlay to see button placement
 */

const puppeteer = require('puppeteer');

async function screenshot() {
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

    // Inject our extension logic
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        .x10tube-mini-btn {
          width: 28px;
          height: 28px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 2px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `;
      document.head.appendChild(style);

      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.textContent = '+';
        btn.dataset.videoId = videoId;
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) return;
        const btn = createMiniButton(videoId);
        btn.classList.add('x10tube-mini-btn-overlay');
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

      // Setup for sidebar videos
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

    // Hover over first 3 sidebar videos to trigger overlays
    console.log('Hovering over sidebar videos...');

    for (let i = 0; i < 3; i++) {
      const thumbPos = await page.evaluate((index) => {
        const lockups = document.querySelectorAll('#related .yt-lockup-view-model');
        if (lockups[index]) {
          const rect = lockups[index].getBoundingClientRect();
          return { x: rect.x + 50, y: rect.y + 30 };
        }
        return null;
      }, i);

      if (thumbPos) {
        await page.mouse.move(thumbPos.x, thumbPos.y);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Go back to first one and hold hover
    const firstThumb = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    if (firstThumb) {
      await page.mouse.move(firstThumb.x, firstThumb.y);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Check what we have
    const result = await page.evaluate(() => {
      const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      const ourBtn = document.querySelector('.x10tube-mini-btn');
      return {
        overlayExists: !!overlay,
        ourBtnExists: !!ourBtn,
        overlayChildren: overlay ? Array.from(overlay.children).length : 0
      };
    });
    console.log('Result:', result);

    // Screenshot the sidebar
    const sidebarRect = await page.evaluate(() => {
      const sidebar = document.querySelector('#secondary');
      if (!sidebar) return null;
      const rect = sidebar.getBoundingClientRect();
      return { x: rect.x, y: 0, width: rect.width, height: 600 };
    });

    if (sidebarRect) {
      await page.screenshot({
        path: 'docs/placement-sidebar-hover.png',
        clip: sidebarRect
      });
      console.log('Screenshot: docs/placement-sidebar-hover.png');
    }

    // Full page
    await page.screenshot({ path: 'docs/placement-watch-hover.png' });
    console.log('Screenshot: docs/placement-watch-hover.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

screenshot();
