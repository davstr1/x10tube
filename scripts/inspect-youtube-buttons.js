/**
 * Inspect YouTube's hover buttons (Watch Later, Add to Queue, Mute, etc.)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function inspect() {
  console.log('Launching browser (non-headless to see hover effects)...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--window-size=1920,1080']
  });

  const results = {};

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // ========================================
    // SEARCH PAGE
    // ========================================
    console.log('\n=== SEARCH PAGE ===');
    await page.goto('https://www.youtube.com/results?search_query=javascript', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 3000));

    // Hover over first thumbnail
    const searchThumb = await page.evaluate(() => {
      const thumb = document.querySelector('ytd-thumbnail');
      if (!thumb) return null;
      const rect = thumb.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });

    if (searchThumb) {
      await page.mouse.move(searchThumb.x, searchThumb.y);
      await new Promise(r => setTimeout(r, 1500));

      results.search = await page.evaluate(() => {
        const data = { buttons: [], overlayContainers: [] };

        // Find all buttons with aria-label containing "watch later" or "queue"
        document.querySelectorAll('[aria-label]').forEach(el => {
          const label = el.getAttribute('aria-label').toLowerCase();
          if (label.includes('watch later') || label.includes('queue') || label.includes('ajouter')) {
            let ancestors = [];
            let parent = el;
            for (let i = 0; i < 6 && parent; i++) {
              ancestors.push({
                tag: parent.tagName.toLowerCase(),
                id: parent.id || null,
                classes: Array.from(parent.classList).slice(0, 5).join(' ')
              });
              parent = parent.parentElement;
            }
            data.buttons.push({
              ariaLabel: el.getAttribute('aria-label'),
              tag: el.tagName.toLowerCase(),
              classes: Array.from(el.classList).join(' '),
              ancestors: ancestors
            });
          }
        });

        // Find hover-overlays content
        const hoverOverlay = document.querySelector('ytd-thumbnail:hover #hover-overlays, ytd-thumbnail #hover-overlays');
        if (hoverOverlay) {
          data.hoverOverlaysHTML = hoverOverlay.innerHTML.substring(0, 2000);
          data.hoverOverlaysChildren = Array.from(hoverOverlay.children).map(c => ({
            tag: c.tagName.toLowerCase(),
            classes: Array.from(c.classList).join(' ')
          }));
        }

        // Find #overlays content
        const overlays = document.querySelector('ytd-thumbnail #overlays');
        if (overlays) {
          data.overlaysChildren = Array.from(overlays.children).map(c => ({
            tag: c.tagName.toLowerCase(),
            classes: Array.from(c.classList).join(' ')
          }));
        }

        return data;
      });

      console.log('Search buttons found:', results.search.buttons.length);
      await page.screenshot({ path: 'docs/search-hover.png' });
    }

    // ========================================
    // WATCH PAGE (sidebar)
    // ========================================
    console.log('\n=== WATCH PAGE SIDEBAR ===');
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Hover over sidebar video
    const sidebarThumb = await page.evaluate(() => {
      const lockup = document.querySelector('#related .yt-lockup-view-model');
      if (!lockup) return null;
      const rect = lockup.getBoundingClientRect();
      return { x: rect.x + 50, y: rect.y + 30 };
    });

    if (sidebarThumb) {
      await page.mouse.move(sidebarThumb.x, sidebarThumb.y);
      await new Promise(r => setTimeout(r, 1500));

      results.watchSidebar = await page.evaluate(() => {
        const data = { buttons: [], structure: null };

        // Find buttons in sidebar
        document.querySelectorAll('#related [aria-label]').forEach(el => {
          const label = el.getAttribute('aria-label').toLowerCase();
          if (label.includes('watch later') || label.includes('queue') || label.includes('menu') || label.includes('ajouter')) {
            let ancestors = [];
            let parent = el;
            for (let i = 0; i < 6 && parent; i++) {
              ancestors.push({
                tag: parent.tagName.toLowerCase(),
                id: parent.id || null,
                classes: Array.from(parent.classList).slice(0, 5).join(' ')
              });
              parent = parent.parentElement;
            }
            data.buttons.push({
              ariaLabel: el.getAttribute('aria-label'),
              tag: el.tagName.toLowerCase(),
              classes: Array.from(el.classList).join(' '),
              ancestors: ancestors
            });
          }
        });

        // Get lockup structure
        const lockup = document.querySelector('#related .yt-lockup-view-model');
        if (lockup) {
          data.structure = {
            innerHTML: lockup.innerHTML.substring(0, 3000)
          };
        }

        return data;
      });

      console.log('Sidebar buttons found:', results.watchSidebar.buttons.length);
      await page.screenshot({ path: 'docs/sidebar-hover.png' });
    }

    // ========================================
    // HOME PAGE
    // ========================================
    console.log('\n=== HOME PAGE ===');
    await page.goto('https://www.youtube.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Hover over first video on home
    const homeThumb = await page.evaluate(() => {
      // Try to find a video thumbnail on home
      const thumb = document.querySelector('ytd-rich-item-renderer ytd-thumbnail, .yt-lockup-view-model');
      if (!thumb) return null;
      const rect = thumb.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });

    if (homeThumb) {
      await page.mouse.move(homeThumb.x, homeThumb.y);
      await new Promise(r => setTimeout(r, 2000));

      results.home = await page.evaluate(() => {
        const data = { buttons: [], richItemStructure: null };

        // Find all interactive buttons on hover
        document.querySelectorAll('[aria-label]').forEach(el => {
          const label = el.getAttribute('aria-label').toLowerCase();
          if (label.includes('mute') || label.includes('subtitle') || label.includes('son') ||
              label.includes('sous-titre') || label.includes('watch later') || label.includes('queue')) {
            const rect = el.getBoundingClientRect();
            // Only visible buttons
            if (rect.width > 0 && rect.height > 0) {
              let ancestors = [];
              let parent = el;
              for (let i = 0; i < 8 && parent; i++) {
                ancestors.push({
                  tag: parent.tagName.toLowerCase(),
                  id: parent.id || null,
                  classes: Array.from(parent.classList).slice(0, 5).join(' ')
                });
                parent = parent.parentElement;
              }
              data.buttons.push({
                ariaLabel: el.getAttribute('aria-label'),
                tag: el.tagName.toLowerCase(),
                classes: Array.from(el.classList).join(' '),
                rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
                ancestors: ancestors
              });
            }
          }
        });

        // Get rich item structure
        const richItem = document.querySelector('ytd-rich-item-renderer');
        if (richItem) {
          data.richItemStructure = richItem.innerHTML.substring(0, 3000);
        }

        return data;
      });

      console.log('Home buttons found:', results.home.buttons.length);
      await page.screenshot({ path: 'docs/home-hover.png' });
    }

    // Save results
    fs.writeFileSync('docs/youtube-buttons-inspection.json', JSON.stringify(results, null, 2));
    console.log('\n✅ Results saved to docs/youtube-buttons-inspection.json');

    console.log('\nClosing in 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

inspect();
