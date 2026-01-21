/**
 * Debug why MutationObserver isn't catching the overlay
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

    // Enable console logging from page
    page.on('console', msg => console.log('PAGE:', msg.text()));

    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Setup observer on MULTIPLE levels
    console.log('=== Setting up observers at multiple levels ===');
    await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) {
        console.log('No lockup found');
        return;
      }

      const thumbViewModel = lockup.querySelector('yt-thumbnail-view-model');
      if (!thumbViewModel) {
        console.log('No yt-thumbnail-view-model found');
        return;
      }

      console.log('yt-thumbnail-view-model found, children before hover:', thumbViewModel.children.length);
      Array.from(thumbViewModel.children).forEach(c => {
        console.log('  - Child:', c.tagName);
      });

      // Observer on yt-thumbnail-view-model
      const observer1 = new MutationObserver((mutations) => {
        console.log('Observer1 (yt-thumbnail-view-model) triggered:', mutations.length, 'mutations');
        mutations.forEach((m, i) => {
          console.log(`  Mutation ${i}: type=${m.type}, addedNodes=${m.addedNodes.length}, removedNodes=${m.removedNodes.length}`);
          m.addedNodes.forEach(n => {
            console.log(`    Added: ${n.nodeName} (type ${n.nodeType})`);
          });
        });
      });
      observer1.observe(thumbViewModel, { childList: true, subtree: true });
      console.log('Observer1 attached to yt-thumbnail-view-model');

      // Observer on lockup
      const observer2 = new MutationObserver((mutations) => {
        console.log('Observer2 (yt-lockup-view-model) triggered:', mutations.length, 'mutations');
        mutations.forEach((m, i) => {
          if (m.addedNodes.length > 0) {
            console.log(`  Mutation ${i}: addedNodes=${m.addedNodes.length}`);
            m.addedNodes.forEach(n => {
              if (n.nodeType === Node.ELEMENT_NODE) {
                console.log(`    Added element: ${n.tagName}`);
              }
            });
          }
        });
      });
      observer2.observe(lockup, { childList: true, subtree: true });
      console.log('Observer2 attached to .yt-lockup-view-model');

      // Observer on #related
      const related = document.querySelector('#related');
      const observer3 = new MutationObserver((mutations) => {
        const overlayAdded = mutations.some(m =>
          Array.from(m.addedNodes).some(n =>
            n.nodeName?.toLowerCase() === 'yt-thumbnail-hover-overlay-toggle-actions-view-model'
          )
        );
        if (overlayAdded) {
          console.log('Observer3 (#related): OVERLAY DETECTED!');
        }
      });
      observer3.observe(related, { childList: true, subtree: true });
      console.log('Observer3 attached to #related');

      window.observers = [observer1, observer2, observer3];
    });

    // Hover
    console.log('\n=== Hovering ===');
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    await page.mouse.move(thumbPos.x, thumbPos.y);
    await new Promise(r => setTimeout(r, 3000));

    // Check final state
    console.log('\n=== Final state ===');
    const result = await page.evaluate(() => {
      const thumbViewModel = document.querySelector('#related yt-thumbnail-view-model');
      return {
        childrenAfterHover: thumbViewModel ? Array.from(thumbViewModel.children).map(c => c.tagName) : [],
        overlayExists: !!document.querySelector('yt-thumbnail-hover-overlay-toggle-actions-view-model')
      };
    });
    console.log('Result:', result);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
