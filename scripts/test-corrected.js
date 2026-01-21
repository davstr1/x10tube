/**
 * Test corrected observer logic
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
    page.on('console', msg => console.log('PAGE:', msg.text()));

    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Inject corrected solution
    await page.evaluate(() => {
      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.innerHTML = '+';
        btn.title = 'Add to X10Tube';
        btn.dataset.videoId = videoId;
        btn.style.cssText = 'width:28px;height:28px;background:#dc2626;color:white;border:none;border-radius:2px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
        return btn;
      }

      function injectButtonIntoHoverOverlay(overlayContainer, videoId) {
        if (overlayContainer.querySelector('.x10tube-mini-btn')) {
          console.log('[X10Tube] Button already exists for', videoId);
          return;
        }

        console.log('[X10Tube] Injecting button into overlay for', videoId);
        const btn = createMiniButton(videoId);
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-btn-wrapper';
        wrapper.appendChild(btn);
        overlayContainer.appendChild(wrapper);
        console.log('[X10Tube] Button injected successfully!');
      }

      function setupHoverObserver(thumbnailViewModel, videoId) {
        if (thumbnailViewModel.dataset.x10Observer) return;
        thumbnailViewModel.dataset.x10Observer = 'true';

        console.log('[X10Tube] Setting up observer for', videoId);

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              // Check if it's an element node
              if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                console.log('[X10Tube] Observer saw added element:', tagName);

                if (tagName === 'yt-thumbnail-hover-overlay-toggle-actions-view-model') {
                  console.log('[X10Tube] OVERLAY DETECTED! Injecting button...');
                  injectButtonIntoHoverOverlay(node, videoId);
                }
              }
            }
          }
        });

        observer.observe(thumbnailViewModel, { childList: true });
        console.log('[X10Tube] Observer attached');
      }

      // Setup for first sidebar video
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) {
        console.log('No lockup found');
        return;
      }

      const link = lockup.querySelector('a[href*="/watch?v="]');
      if (!link) {
        console.log('No link found');
        return;
      }

      const videoId = new URL(link.href).searchParams.get('v');
      console.log('Video ID:', videoId);

      const thumbnailViewModel = lockup.querySelector('yt-thumbnail-view-model');
      if (!thumbnailViewModel) {
        console.log('No yt-thumbnail-view-model found');
        return;
      }

      setupHoverObserver(thumbnailViewModel, videoId);
    });

    // Hover
    console.log('\n=== Hovering ===');
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    await page.mouse.move(thumbPos.x, thumbPos.y);
    await new Promise(r => setTimeout(r, 2000));

    // Check result
    const result = await page.evaluate(() => {
      const overlay = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      const btn = document.querySelector('.x10tube-mini-btn');
      return {
        overlayExists: !!overlay,
        buttonExists: !!btn,
        buttonInOverlay: overlay?.contains(btn) || false,
        overlayChildren: overlay ? Array.from(overlay.children).map(c => c.className.substring(0, 50)) : []
      };
    });

    console.log('\n=== Result ===');
    console.log(JSON.stringify(result, null, 2));

    if (result.buttonExists && result.buttonInOverlay) {
      console.log('\n✅ SUCCESS!');
    } else {
      console.log('\n❌ FAILED');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
