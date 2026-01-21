/**
 * Test search page button injection
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

    await page.goto('https://www.youtube.com/results?search_query=javascript', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await new Promise(r => setTimeout(r, 3000));

    // Check structure
    const structure = await page.evaluate(() => {
      return {
        ytdThumbnail: document.querySelectorAll('ytd-thumbnail').length,
        ytThumbnailViewModel: document.querySelectorAll('yt-thumbnail-view-model').length,
        ytLockupViewModel: document.querySelectorAll('yt-lockup-view-model').length,
        ytdVideoRenderer: document.querySelectorAll('ytd-video-renderer').length,
        videoLinks: document.querySelectorAll('a[href*="/watch?v="]').length
      };
    });
    console.log('Search page structure:', structure);

    // Check if ytd-thumbnail has yt-thumbnail-view-model inside
    const thumbnailStructure = await page.evaluate(() => {
      const thumb = document.querySelector('ytd-thumbnail');
      if (!thumb) return null;
      return {
        hasYtThumbnailViewModel: !!thumb.querySelector('yt-thumbnail-view-model'),
        hasLink: !!thumb.querySelector('a[href*="/watch?v="]'),
        innerHTML: thumb.innerHTML.substring(0, 500)
      };
    });
    console.log('Thumbnail structure:', thumbnailStructure);

    // Inject our extension logic
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        .x10tube-mini-btn {
          width: 32px !important;
          height: 32px !important;
          background: #dc2626 !important;
          color: white !important;
          border: none !important;
          border-radius: 50% !important;
          font-size: 20px !important;
          font-weight: bold !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          position: absolute !important;
          top: 4px !important;
          right: 4px !important;
          z-index: 9999 !important;
        }
      `;
      document.head.appendChild(style);

      function createMiniButton(videoId) {
        const btn = document.createElement('button');
        btn.className = 'x10tube-mini-btn';
        btn.textContent = '+';
        return btn;
      }

      // For search page: ytd-thumbnail with a#thumbnail inside
      let count = 0;
      document.querySelectorAll('ytd-thumbnail').forEach(thumbnail => {
        if (thumbnail.querySelector('.x10tube-mini-btn')) return;

        const link = thumbnail.querySelector('a[href*="/watch?v="]');
        if (!link) return;

        const url = new URL(link.href);
        const videoId = url.searchParams.get('v');
        if (!videoId) return;

        const btn = createMiniButton(videoId);
        thumbnail.style.position = 'relative';
        thumbnail.appendChild(btn);
        count++;
      });

      console.log('[X10Tube] Search page buttons added:', count);
      return count;
    });

    // Check result
    const result = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.x10tube-mini-btn');
      return {
        buttonCount: buttons.length,
        firstButtonVisible: buttons[0] ? {
          display: getComputedStyle(buttons[0]).display,
          visibility: getComputedStyle(buttons[0]).visibility,
          position: getComputedStyle(buttons[0]).position
        } : null
      };
    });
    console.log('Result:', result);

    // Screenshot
    await page.screenshot({ path: 'docs/test-search-page.png' });
    console.log('Screenshot: docs/test-search-page.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
