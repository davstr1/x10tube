import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = './youtube-html-scrapes';

async function scrapeYouTubePages() {
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  console.log('\n========================================');
  console.log('SCRAPING YOUTUBE PAGES');
  console.log('========================================\n');

  // Helper function to extract main content (body without header, footer, etc.)
  async function extractMainContent() {
    return await page.evaluate(() => {
      // Clone the body to avoid modifying the actual page
      const bodyClone = document.body.cloneNode(true);

      // Remove elements we don't want
      const selectorsToRemove = [
        'head',
        'script',
        'style',
        'noscript',
        'iframe[src*="accounts.google"]',
        '#masthead-container',  // YouTube header
        'ytd-masthead',         // YouTube header
        'tp-yt-app-drawer',     // Side drawer
        'ytd-mini-guide-renderer', // Mini sidebar
        'ytd-guide-renderer',   // Full sidebar
        '#guide-wrapper',       // Guide wrapper
        'ytd-popup-container',  // Popups
        'ytd-consent-bump-v2-lightbox', // Cookie consent
        'tp-yt-iron-overlay-backdrop',
        '#movie_player video',  // Remove actual video element (heavy)
        '.ytp-ad-module',       // Ads
        'ytd-mealbar-promo-renderer', // Promo bars
        'ytd-enforcement-message-view-model', // Messages
      ];

      selectorsToRemove.forEach(selector => {
        bodyClone.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Get the main content area
      const primaryContent = bodyClone.querySelector('ytd-app') ||
                            bodyClone.querySelector('#content') ||
                            bodyClone;

      return primaryContent.innerHTML;
    });
  }

  // Helper to accept cookies if needed
  async function acceptCookies() {
    try {
      await new Promise(r => setTimeout(r, 2000));
      const consentButton = await page.$('button[aria-label*="Accept"], button[aria-label*="Accepter"], button[aria-label*="accept"]');
      if (consentButton) {
        await consentButton.click();
        await new Promise(r => setTimeout(r, 2000));
        console.log('Cookies accepted');
      }
    } catch (e) {}
  }

  try {
    // 1. HOMEPAGE
    console.log('1. Scraping YouTube Homepage...');
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await acceptCookies();
    await new Promise(r => setTimeout(r, 3000)); // Wait for dynamic content

    // Scroll down a bit to load more content
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 2000));

    const homepageContent = await extractMainContent();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'homepage.html'), homepageContent, 'utf-8');
    console.log(`   Saved: ${OUTPUT_DIR}/homepage.html (${(homepageContent.length / 1024).toFixed(1)} KB)`);

    // 2. SEARCH PAGE
    console.log('\n2. Scraping YouTube Search Page...');
    await page.goto('https://www.youtube.com/results?search_query=javascript+tutorial', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Scroll to load more results
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 2000));

    const searchContent = await extractMainContent();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'search.html'), searchContent, 'utf-8');
    console.log(`   Saved: ${OUTPUT_DIR}/search.html (${(searchContent.length / 1024).toFixed(1)} KB)`);

    // 3. VIDEO PAGE
    console.log('\n3. Scraping YouTube Video Page...');
    // Find a video link from the search results and click it
    const videoLink = await page.$('ytd-video-renderer a#video-title, a#video-title');
    if (videoLink) {
      await videoLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    } else {
      // Fallback: go to a specific video
      await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { waitUntil: 'networkidle2', timeout: 60000 });
    }
    await new Promise(r => setTimeout(r, 4000)); // Wait for video page to fully load

    // Scroll to load comments and recommendations
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 2000));

    const videoContent = await extractMainContent();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'video.html'), videoContent, 'utf-8');
    console.log(`   Saved: ${OUTPUT_DIR}/video.html (${(videoContent.length / 1024).toFixed(1)} KB)`);

    console.log('\n========================================');
    console.log('SCRAPING COMPLETE!');
    console.log(`Files saved in: ${OUTPUT_DIR}/`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error during scraping:', error.message);
  }

  await browser.close();
  console.log('Browser closed.');
}

scrapeYouTubePages().catch(console.error);
