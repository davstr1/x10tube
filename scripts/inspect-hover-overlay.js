/**
 * Script to inspect YouTube's hover overlay structure
 * Run with: node scripts/inspect-hover-overlay.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function inspectHoverOverlay() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: false, // Need to see the hover effect
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Go to search results (easier to test hover)
    console.log('\n=== Going to Search Results ===');
    await page.goto('https://www.youtube.com/results?search_query=music', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 3000));

    // Find first thumbnail and hover over it
    console.log('\n=== Hovering over first thumbnail ===');

    // Get the first thumbnail position
    const thumbnailInfo = await page.evaluate(() => {
      const thumbnail = document.querySelector('ytd-thumbnail');
      if (!thumbnail) return null;

      const rect = thumbnail.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        width: rect.width,
        height: rect.height
      };
    });

    if (thumbnailInfo) {
      console.log('Thumbnail position:', thumbnailInfo);

      // Move mouse to thumbnail center
      await page.mouse.move(thumbnailInfo.x, thumbnailInfo.y);
      await new Promise(r => setTimeout(r, 2000)); // Wait for hover effects

      // Now inspect the DOM with hover state
      const hoverData = await page.evaluate(() => {
        const data = {
          overlays: [],
          thumbnailStructure: null
        };

        // Find all overlay-related elements
        const overlaySelectors = [
          '#hover-overlays',
          '#overlays',
          '.ytd-thumbnail-overlay-toggle-button-renderer',
          '.ytd-thumbnail-overlay-time-status-renderer',
          '.ytd-thumbnail-overlay-now-playing-renderer',
          '.ytd-thumbnail-overlay-resume-playback-renderer',
          'ytd-thumbnail-overlay-button-renderer',
          '[class*="overlay"]',
          '[id*="overlay"]'
        ];

        overlaySelectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          if (elements.length > 0) {
            data.overlays.push({
              selector: sel,
              count: elements.length,
              firstElementHTML: elements[0].outerHTML.substring(0, 500)
            });
          }
        });

        // Get the hovered thumbnail structure
        const thumbnail = document.querySelector('ytd-thumbnail:hover') || document.querySelector('ytd-thumbnail');
        if (thumbnail) {
          data.thumbnailStructure = {
            innerHTML: thumbnail.innerHTML.substring(0, 3000),
            children: Array.from(thumbnail.children).map(child => ({
              tag: child.tagName.toLowerCase(),
              id: child.id || null,
              classes: Array.from(child.classList).slice(0, 10)
            }))
          };
        }

        // Look for Watch Later / Add to Queue buttons
        const watchLaterBtns = document.querySelectorAll('[aria-label*="Watch later"], [aria-label*="queue"], [title*="Watch later"]');
        data.watchLaterButtons = Array.from(watchLaterBtns).map(btn => ({
          tag: btn.tagName.toLowerCase(),
          ariaLabel: btn.getAttribute('aria-label'),
          title: btn.getAttribute('title'),
          classes: Array.from(btn.classList).slice(0, 5),
          parentClasses: btn.parentElement ? Array.from(btn.parentElement.classList).slice(0, 5) : []
        }));

        return data;
      });

      console.log('\n=== Overlay Elements Found ===');
      hoverData.overlays.forEach(o => {
        console.log(`${o.selector}: ${o.count} elements`);
      });

      console.log('\n=== Watch Later Buttons ===');
      console.log(JSON.stringify(hoverData.watchLaterButtons, null, 2));

      // Save full data
      fs.writeFileSync('docs/youtube-hover-overlay.json', JSON.stringify(hoverData, null, 2));
      console.log('\n✅ Data saved to docs/youtube-hover-overlay.json');

      // Take a screenshot
      await page.screenshot({ path: 'docs/youtube-hover-screenshot.png' });
      console.log('✅ Screenshot saved to docs/youtube-hover-screenshot.png');
    }

    // Also check on the watch page sidebar
    console.log('\n=== Checking Watch Page Sidebar ===');
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Find sidebar video and hover
    const sidebarInfo = await page.evaluate(() => {
      const lockup = document.querySelector('.yt-lockup-view-model');
      if (!lockup) return null;

      const rect = lockup.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
      };
    });

    if (sidebarInfo) {
      await page.mouse.move(sidebarInfo.x, sidebarInfo.y);
      await new Promise(r => setTimeout(r, 2000));

      const sidebarHoverData = await page.evaluate(() => {
        const lockup = document.querySelector('.yt-lockup-view-model');
        if (!lockup) return null;

        return {
          innerHTML: lockup.innerHTML.substring(0, 3000),
          children: Array.from(lockup.children).map(child => ({
            tag: child.tagName.toLowerCase(),
            classes: Array.from(child.classList).slice(0, 10)
          })),
          // Look for menu/action buttons
          actionButtons: Array.from(lockup.querySelectorAll('button, [role="button"]')).map(btn => ({
            tag: btn.tagName.toLowerCase(),
            ariaLabel: btn.getAttribute('aria-label'),
            classes: Array.from(btn.classList).slice(0, 5)
          }))
        };
      });

      if (sidebarHoverData) {
        fs.writeFileSync('docs/youtube-sidebar-hover.json', JSON.stringify(sidebarHoverData, null, 2));
        console.log('✅ Sidebar data saved to docs/youtube-sidebar-hover.json');
      }

      await page.screenshot({ path: 'docs/youtube-sidebar-screenshot.png' });
      console.log('✅ Sidebar screenshot saved');
    }

    console.log('\n=== Done! Check the docs folder for results ===');
    console.log('Closing browser in 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

inspectHoverOverlay();
