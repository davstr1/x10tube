/**
 * Test the MutationObserver solution
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

    // Inject our solution
    console.log('=== Injecting MutationObserver solution ===');
    await page.evaluate(() => {
      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.innerHTML = '+';
        btn.title = 'Add to X10Tube';
        btn.dataset.videoId = videoId;
        btn.style.cssText = 'width:28px;height:28px;background:red;color:white;border:none;border-radius:2px;font-size:18px;cursor:pointer;';
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) return;

        const btn = createMiniButton(videoId);
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-btn-wrapper';
        wrapper.appendChild(btn);
        overlayContainer.appendChild(wrapper);
        console.log('[X10Tube] Button injected for:', videoId);
      }

      function setupHoverObserver(thumbnailViewModel, videoId) {
        if (thumbnailViewModel.dataset.x10Observer) return;
        thumbnailViewModel.dataset.x10Observer = 'true';

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName.toLowerCase() === 'yt-thumbnail-hover-overlay-toggle-actions-view-model') {
                  injectButtonIntoHoverOverlay(node, videoId);
                }
              }
            }
          }
        });

        observer.observe(thumbnailViewModel, { childList: true, subtree: true });
        console.log('[X10Tube] Observer setup for:', videoId);
      }

      // Setup observers for all sidebar videos
      const videoLinks = document.querySelectorAll('#related a[href*="/watch?v="]');
      let count = 0;
      videoLinks.forEach(link => {
        if (link.dataset.x10Processed) return;
        link.dataset.x10Processed = 'true';

        const videoId = new URL(link.href).searchParams.get('v');
        if (!videoId) return;

        const thumbnailViewModel = link.closest('yt-lockup-view-model')?.querySelector('yt-thumbnail-view-model');
        if (thumbnailViewModel) {
          setupHoverObserver(thumbnailViewModel, videoId);
          count++;
        }
      });

      console.log('[X10Tube] Observers setup:', count);
      window.x10tubeSetupCount = count;
    });

    const setupCount = await page.evaluate(() => window.x10tubeSetupCount);
    console.log('Observers setup:', setupCount);

    // Now hover over first sidebar video
    console.log('\n=== Hovering over sidebar video ===');
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    if (thumbPos) {
      await page.mouse.move(thumbPos.x, thumbPos.y);
      await new Promise(r => setTimeout(r, 2000));

      // Check if our button was injected
      const result = await page.evaluate(() => {
        const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
        const ourBtn = document.querySelector('.x10tube-mini-btn');

        return {
          overlayExists: !!overlay,
          overlayChildCount: overlay?.children.length || 0,
          ourButtonExists: !!ourBtn,
          ourButtonInOverlay: overlay?.contains(ourBtn) || false,
          allButtons: Array.from(overlay?.querySelectorAll('button') || []).map(b => ({
            ariaLabel: b.getAttribute('aria-label'),
            className: b.className.substring(0, 50)
          }))
        };
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      if (result.ourButtonExists && result.ourButtonInOverlay) {
        console.log('\n✅ SUCCESS! Button injected into YouTube overlay!');
      } else {
        console.log('\n❌ Button not found in overlay');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
