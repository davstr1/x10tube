/**
 * Find which parent element exists before hover
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

    // Check structure BEFORE hover
    console.log('=== BEFORE HOVER ===');
    const before = await page.evaluate(() => {
      const results = {};

      // Check various elements in sidebar
      results['yt-lockup-view-model'] = document.querySelectorAll('#related yt-lockup-view-model').length;
      results['.yt-lockup-view-model'] = document.querySelectorAll('#related .yt-lockup-view-model').length;
      results['yt-thumbnail-view-model'] = document.querySelectorAll('#related yt-thumbnail-view-model').length;
      results['yt-thumbnail-hover-overlay'] = document.querySelectorAll('#related yt-thumbnail-hover-overlay-toggle-actions-view-model').length;
      results['a.yt-lockup-view-model__content-image'] = document.querySelectorAll('#related a.yt-lockup-view-model__content-image').length;

      // Get structure of first lockup
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (lockup) {
        results.lockupChildren = Array.from(lockup.children).map(c => c.tagName.toLowerCase());
        results.lockupInnerHTML = lockup.innerHTML.substring(0, 1000);
      }

      // Get structure of yt-thumbnail-view-model
      const thumbModel = document.querySelector('#related yt-thumbnail-view-model');
      if (thumbModel) {
        results.thumbModelChildren = Array.from(thumbModel.children).map(c => ({
          tag: c.tagName.toLowerCase(),
          classes: Array.from(c.classList).slice(0, 3).join(' ')
        }));
      }

      return results;
    });

    console.log('Element counts before hover:');
    for (const [key, value] of Object.entries(before)) {
      if (typeof value === 'number') {
        console.log(`  ${key}: ${value}`);
      }
    }
    console.log('\nyt-thumbnail-view-model children:', before.thumbModelChildren);

    // Now hover
    console.log('\n=== AFTER HOVER ===');
    const thumbPos = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    if (thumbPos) {
      await page.mouse.move(thumbPos.x, thumbPos.y);
      await new Promise(r => setTimeout(r, 1500));

      const after = await page.evaluate(() => {
        const results = {};
        results['yt-thumbnail-hover-overlay'] = document.querySelectorAll('#related yt-thumbnail-hover-overlay-toggle-actions-view-model').length;

        const thumbModel = document.querySelector('#related yt-thumbnail-view-model');
        if (thumbModel) {
          results.thumbModelChildren = Array.from(thumbModel.children).map(c => ({
            tag: c.tagName.toLowerCase(),
            classes: Array.from(c.classList).slice(0, 3).join(' ')
          }));
        }

        return results;
      });

      console.log('yt-thumbnail-hover-overlay count:', after['yt-thumbnail-hover-overlay']);
      console.log('yt-thumbnail-view-model children after hover:', after.thumbModelChildren);
    }

    console.log('\n=== SOLUTION ===');
    console.log('Inject into yt-thumbnail-view-model (always exists)');
    console.log('Use MutationObserver to detect when hover overlay appears');
    console.log('Move our button INTO the overlay when it appears');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
