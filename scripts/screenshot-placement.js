/**
 * Screenshot pages to review button placement
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function screenshot() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Add our button styles and injection logic
    const injectOurExtension = async () => {
      await page.evaluate(() => {
        // Add styles
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
          .x10tube-btn-wrapper {
            display: inline-block;
          }
          /* For old structure */
          ytd-thumbnail .x10tube-mini-btn:not(.x10tube-mini-btn-overlay) {
            position: absolute;
            top: 4px;
            right: 4px;
            z-index: 9999;
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

        // NEW structure (sidebar, home)
        document.querySelectorAll('yt-lockup-view-model, ytd-rich-item-renderer').forEach(item => {
          const link = item.querySelector('a[href*="/watch?v="]');
          if (!link) return;
          const videoId = new URL(link.href).searchParams.get('v');
          const thumbnailViewModel = item.querySelector('yt-thumbnail-view-model');
          if (thumbnailViewModel) {
            setupHoverObserver(thumbnailViewModel, videoId);
          }
        });

        // OLD structure (search)
        document.querySelectorAll('ytd-thumbnail').forEach(thumbnail => {
          if (thumbnail.querySelector('.x10tube-mini-btn')) return;
          const link = thumbnail.querySelector('a[href*="/watch?v="]');
          if (!link) return;
          const videoId = new URL(link.href).searchParams.get('v');
          const btn = createMiniButton(videoId);
          thumbnail.style.position = 'relative';
          thumbnail.appendChild(btn);
        });

        console.log('[X10Tube] Injection complete');
      });
    };

    // ==========================================
    // 1. HOME PAGE
    // ==========================================
    console.log('=== HOME PAGE ===');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await injectOurExtension();

    // Hover to trigger overlay
    const homeThumb = await page.evaluate(() => {
      const item = document.querySelector('ytd-rich-item-renderer yt-thumbnail-view-model');
      if (!item) return null;
      const rect = item.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });

    if (homeThumb) {
      await page.mouse.move(homeThumb.x, homeThumb.y);
      await new Promise(r => setTimeout(r, 1500));
    }

    await page.screenshot({ path: 'docs/placement-home.png', fullPage: false });
    console.log('Screenshot: docs/placement-home.png');

    // ==========================================
    // 2. SEARCH PAGE
    // ==========================================
    console.log('\n=== SEARCH PAGE ===');
    await page.goto('https://www.youtube.com/results?search_query=javascript', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await injectOurExtension();

    // Check what structure search uses
    const searchStructure = await page.evaluate(() => {
      return {
        ytdThumbnail: document.querySelectorAll('ytd-thumbnail').length,
        ytThumbnailViewModel: document.querySelectorAll('yt-thumbnail-view-model').length,
        ytLockupViewModel: document.querySelectorAll('yt-lockup-view-model').length,
        ytdVideoRenderer: document.querySelectorAll('ytd-video-renderer').length
      };
    });
    console.log('Search structure:', searchStructure);

    await page.screenshot({ path: 'docs/placement-search.png', fullPage: false });
    console.log('Screenshot: docs/placement-search.png');

    // ==========================================
    // 3. WATCH PAGE SIDEBAR
    // ==========================================
    console.log('\n=== WATCH PAGE SIDEBAR ===');
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    await injectOurExtension();

    // Hover to trigger overlay
    const sidebarThumb = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    if (sidebarThumb) {
      await page.mouse.move(sidebarThumb.x, sidebarThumb.y);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Take screenshot of just the sidebar area
    const sidebarRect = await page.evaluate(() => {
      const sidebar = document.querySelector('#secondary');
      if (!sidebar) return null;
      const rect = sidebar.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: Math.min(rect.height, 800) };
    });

    if (sidebarRect) {
      await page.screenshot({
        path: 'docs/placement-sidebar.png',
        clip: { x: sidebarRect.x, y: sidebarRect.y, width: sidebarRect.width, height: sidebarRect.height }
      });
      console.log('Screenshot: docs/placement-sidebar.png');
    }

    // Full page screenshot with hover
    await page.screenshot({ path: 'docs/placement-watch-full.png', fullPage: false });
    console.log('Screenshot: docs/placement-watch-full.png');

    console.log('\n=== Done! Check docs/placement-*.png ===');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

screenshot();
