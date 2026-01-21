/**
 * Test if our injected button survives YouTube's dynamic DOM updates
 */

const puppeteer = require('puppeteer');

async function test() {
  console.log('Launching headless browser...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Go to watch page (has sidebar with new structure)
    console.log('\n=== Testing on Watch Page Sidebar ===');
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Check structure before injection
    const beforeInjection = await page.evaluate(() => {
      const overlayContainer = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      return {
        overlayContainerExists: !!overlayContainer,
        overlayContainerChildCount: overlayContainer?.children.length || 0,
        overlayContainerHTML: overlayContainer?.innerHTML.substring(0, 500) || 'N/A'
      };
    });
    console.log('Before injection:', beforeInjection);

    // Inject a test button
    console.log('\nInjecting test button...');
    await page.evaluate(() => {
      const overlayContainer = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      if (overlayContainer) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton x10tube-test-wrapper';
        wrapper.id = 'x10tube-test-btn-wrapper';

        const btn = document.createElement('button');
        btn.className = 'x10tube-test-btn';
        btn.id = 'x10tube-test-btn';
        btn.textContent = '+';
        btn.style.cssText = 'width:28px;height:28px;background:red;color:white;border:none;';

        wrapper.appendChild(btn);
        overlayContainer.appendChild(wrapper);

        console.log('Button injected into overlay container');
        return true;
      }
      console.log('Overlay container not found');
      return false;
    });

    // Check immediately after injection
    const afterInjection = await page.evaluate(() => {
      const btn = document.getElementById('x10tube-test-btn');
      const wrapper = document.getElementById('x10tube-test-btn-wrapper');
      const overlayContainer = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');

      return {
        buttonExists: !!btn,
        wrapperExists: !!wrapper,
        overlayContainerChildCount: overlayContainer?.children.length || 0,
        buttonInDOM: document.body.contains(btn),
        buttonComputedStyle: btn ? {
          display: getComputedStyle(btn).display,
          visibility: getComputedStyle(btn).visibility,
          opacity: getComputedStyle(btn).opacity,
          width: getComputedStyle(btn).width,
          height: getComputedStyle(btn).height
        } : null
      };
    });
    console.log('Immediately after injection:', afterInjection);

    // Hover over the thumbnail to trigger YouTube's hover effects
    console.log('\nHovering over sidebar thumbnail...');
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    if (thumbPos) {
      await page.mouse.move(thumbPos.x, thumbPos.y);
      await new Promise(r => setTimeout(r, 2000));

      // Check after hover
      const afterHover = await page.evaluate(() => {
        const btn = document.getElementById('x10tube-test-btn');
        const wrapper = document.getElementById('x10tube-test-btn-wrapper');
        const overlayContainer = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');

        return {
          buttonExists: !!btn,
          wrapperExists: !!wrapper,
          overlayContainerChildCount: overlayContainer?.children.length || 0,
          buttonInDOM: btn ? document.body.contains(btn) : false,
          buttonComputedStyle: btn ? {
            display: getComputedStyle(btn).display,
            visibility: getComputedStyle(btn).visibility,
            opacity: getComputedStyle(btn).opacity
          } : null,
          // Check if YouTube's buttons are visible
          youtubeButtonsVisible: Array.from(document.querySelectorAll('yt-thumbnail-hover-overlay-toggle-actions-view-model button')).map(b => ({
            ariaLabel: b.getAttribute('aria-label'),
            visible: getComputedStyle(b).visibility,
            opacity: getComputedStyle(b).opacity
          }))
        };
      });
      console.log('After hover:', JSON.stringify(afterHover, null, 2));
    }

    // Move mouse away and check again
    console.log('\nMoving mouse away...');
    await page.mouse.move(100, 100);
    await new Promise(r => setTimeout(r, 1000));

    const afterMouseLeave = await page.evaluate(() => {
      const btn = document.getElementById('x10tube-test-btn');
      return {
        buttonExists: !!btn,
        buttonInDOM: btn ? document.body.contains(btn) : false
      };
    });
    console.log('After mouse leave:', afterMouseLeave);

    // Try injecting with MutationObserver protection
    console.log('\n=== Testing with MutationObserver ===');
    await page.evaluate(() => {
      // Re-inject button
      let overlayContainer = document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model');
      if (!overlayContainer) return;

      // Remove old test button if exists
      document.getElementById('x10tube-test-btn-wrapper')?.remove();

      const wrapper = document.createElement('div');
      wrapper.className = 'ytThumbnailHoverOverlayToggleActionsViewModelButton';
      wrapper.id = 'x10tube-protected-wrapper';

      const btn = document.createElement('button');
      btn.id = 'x10tube-protected-btn';
      btn.textContent = '+';
      btn.style.cssText = 'width:28px;height:28px;background:blue;color:white;border:none;';

      wrapper.appendChild(btn);
      overlayContainer.appendChild(wrapper);

      // Set up observer to re-inject if removed
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.removedNodes.forEach((node) => {
            if (node.id === 'x10tube-protected-wrapper' || node.id === 'x10tube-protected-btn') {
              console.log('Button was removed! Re-injecting...');
              window.x10tubeRemoved = true;
            }
          });
        });
      });

      observer.observe(overlayContainer, { childList: true, subtree: true });
      window.x10tubeObserver = observer;
    });

    // Hover again
    if (thumbPos) {
      await page.mouse.move(thumbPos.x, thumbPos.y);
      await new Promise(r => setTimeout(r, 2000));

      const protectedResult = await page.evaluate(() => {
        return {
          buttonExists: !!document.getElementById('x10tube-protected-btn'),
          wasRemoved: window.x10tubeRemoved || false
        };
      });
      console.log('Protected button result:', protectedResult);
    }

    console.log('\n=== Done ===');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
