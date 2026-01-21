/**
 * Script to inspect YouTube's DOM structure
 * Run with: node scripts/inspect-youtube.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function inspectYouTube() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    timestamp: new Date().toISOString(),
    pages: {}
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Accept cookies if dialog appears
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // ==========================================
    // 1. HOME PAGE
    // ==========================================
    console.log('\n=== Inspecting HOME PAGE ===');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000)); // Wait for dynamic content

    results.pages.home = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        elements: {}
      };

      // Count various elements
      const selectors = [
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-thumbnail',
        'yt-lockup-view-model',
        'ytd-rich-grid-renderer',
        'ytd-compact-video-renderer',
        'a[href*="/watch?v="]',
        'a[href*="/shorts/"]',
        '#contents',
        'ytd-rich-section-renderer'
      ];

      selectors.forEach(sel => {
        data.elements[sel] = document.querySelectorAll(sel).length;
      });

      // Get structure of first video item
      const firstVideoLink = document.querySelector('a[href*="/watch?v="]');
      if (firstVideoLink) {
        // Get ancestor chain
        let ancestors = [];
        let el = firstVideoLink;
        for (let i = 0; i < 10 && el && el !== document.body; i++) {
          ancestors.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.from(el.classList).slice(0, 5),
            href: el.href || null
          });
          el = el.parentElement;
        }
        data.firstVideoLink = {
          href: firstVideoLink.href,
          ancestors: ancestors
        };

        // Get HTML structure of the container
        const container = firstVideoLink.closest('ytd-rich-item-renderer')
          || firstVideoLink.closest('yt-lockup-view-model')
          || firstVideoLink.parentElement;

        if (container) {
          data.containerStructure = {
            tag: container.tagName.toLowerCase(),
            outerHTML: container.outerHTML.substring(0, 2000) // First 2000 chars
          };
        }
      }

      return data;
    });

    console.log('Home page elements:', results.pages.home.elements);

    // ==========================================
    // 2. SEARCH RESULTS
    // ==========================================
    console.log('\n=== Inspecting SEARCH RESULTS ===');
    await page.goto('https://www.youtube.com/results?search_query=javascript+tutorial', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    results.pages.search = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        elements: {}
      };

      const selectors = [
        'ytd-video-renderer',
        'ytd-thumbnail',
        'yt-lockup-view-model',
        'ytd-search',
        'a[href*="/watch?v="]',
        '#contents'
      ];

      selectors.forEach(sel => {
        data.elements[sel] = document.querySelectorAll(sel).length;
      });

      // Get first video structure
      const firstVideoLink = document.querySelector('ytd-video-renderer a[href*="/watch?v="]');
      if (firstVideoLink) {
        let ancestors = [];
        let el = firstVideoLink;
        for (let i = 0; i < 10 && el && el !== document.body; i++) {
          ancestors.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.from(el.classList).slice(0, 5)
          });
          el = el.parentElement;
        }
        data.firstVideoLink = { ancestors };

        const thumbnail = firstVideoLink.closest('ytd-thumbnail');
        if (thumbnail) {
          data.thumbnailStructure = {
            tag: thumbnail.tagName.toLowerCase(),
            outerHTML: thumbnail.outerHTML.substring(0, 1500)
          };
        }
      }

      return data;
    });

    console.log('Search page elements:', results.pages.search.elements);

    // ==========================================
    // 3. WATCH PAGE (sidebar recommendations)
    // ==========================================
    console.log('\n=== Inspecting WATCH PAGE ===');
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    results.pages.watch = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        elements: {}
      };

      const selectors = [
        'ytd-compact-video-renderer',
        'ytd-thumbnail',
        'yt-lockup-view-model',
        '#related',
        '#secondary',
        'a[href*="/watch?v="]',
        'ytd-watch-flexy',
        '#movie_player'
      ];

      selectors.forEach(sel => {
        data.elements[sel] = document.querySelectorAll(sel).length;
      });

      // Get sidebar video structure
      const sidebarLink = document.querySelector('#related a[href*="/watch?v="]');
      if (sidebarLink) {
        let ancestors = [];
        let el = sidebarLink;
        for (let i = 0; i < 10 && el && el !== document.body; i++) {
          ancestors.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.from(el.classList).slice(0, 5)
          });
          el = el.parentElement;
        }
        data.sidebarVideoLink = { ancestors };

        const thumbnail = sidebarLink.closest('ytd-thumbnail');
        if (thumbnail) {
          data.thumbnailStructure = {
            outerHTML: thumbnail.outerHTML.substring(0, 1500)
          };
        }
      }

      return data;
    });

    console.log('Watch page elements:', results.pages.watch.elements);

    // ==========================================
    // SAVE RESULTS
    // ==========================================
    const output = JSON.stringify(results, null, 2);
    fs.writeFileSync('docs/youtube-dom-inspection.json', output);
    console.log('\n✅ Results saved to docs/youtube-dom-inspection.json');

    // Generate markdown report
    let md = `# YouTube DOM Inspection Results

Generated: ${results.timestamp}

## Summary

| Page | Element | Count |
|------|---------|-------|
`;

    for (const [pageName, pageData] of Object.entries(results.pages)) {
      for (const [selector, count] of Object.entries(pageData.elements)) {
        md += `| ${pageName} | \`${selector}\` | ${count} |\n`;
      }
    }

    md += `
## Home Page Structure

First video link ancestors (from link to root):
`;
    if (results.pages.home.firstVideoLink) {
      results.pages.home.firstVideoLink.ancestors.forEach((a, i) => {
        md += `${i + 1}. \`<${a.tag}${a.id ? ' id="' + a.id + '"' : ''}>\` ${a.classes.length ? 'classes: ' + a.classes.join(', ') : ''}\n`;
      });
    }

    md += `
## Search Page Structure

First video link ancestors:
`;
    if (results.pages.search.firstVideoLink) {
      results.pages.search.firstVideoLink.ancestors.forEach((a, i) => {
        md += `${i + 1}. \`<${a.tag}${a.id ? ' id="' + a.id + '"' : ''}>\` ${a.classes.length ? 'classes: ' + a.classes.join(', ') : ''}\n`;
      });
    }

    md += `
## Watch Page Sidebar Structure

Sidebar video link ancestors:
`;
    if (results.pages.watch.sidebarVideoLink) {
      results.pages.watch.sidebarVideoLink.ancestors.forEach((a, i) => {
        md += `${i + 1}. \`<${a.tag}${a.id ? ' id="' + a.id + '"' : ''}>\` ${a.classes.length ? 'classes: ' + a.classes.join(', ') : ''}\n`;
      });
    }

    fs.writeFileSync('docs/youtube-dom-inspection.md', md);
    console.log('✅ Markdown report saved to docs/youtube-dom-inspection.md');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

inspectYouTube();
