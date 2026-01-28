import puppeteer from 'puppeteer';

async function analyzeMenuStyling() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  console.log('\n========================================');
  console.log('ANALYSE DU STYLING DES MENUS YOUTUBE');
  console.log('========================================\n');

  // Aller sur YouTube homepage
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });

  // Accepter cookies si nécessaire
  try {
    await new Promise(r => setTimeout(r, 2000));
    const consentButton = await page.$('button[aria-label*="Accept"], button[aria-label*="Accepter"]');
    if (consentButton) {
      await consentButton.click();
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {}

  await new Promise(r => setTimeout(r, 5000));

  // 1. ANALYSER LE NOUVEAU FORMAT (yt-list-view-model)
  console.log('### FORMAT NOUVEAU (Homepage - yt-list-view-model) ###\n');

  try {
    // Hover sur une vidéo et cliquer sur le menu
    const videoElement = await page.$('ytd-rich-item-renderer, yt-lockup-view-model');
    if (videoElement) {
      await videoElement.hover();
      await new Promise(r => setTimeout(r, 1000));

      // Chercher le bouton menu
      const menuButton = await page.$('button[aria-label="More actions"], ytd-menu-renderer yt-icon-button#button');
      if (menuButton) {
        await menuButton.click();
        await new Promise(r => setTimeout(r, 1000));

        // Analyser le menu ouvert
        const menuAnalysis = await page.evaluate(() => {
          // Chercher le nouveau format d'abord
          const ironDropdown = document.querySelector('tp-yt-iron-dropdown:not([aria-hidden="true"])');
          if (ironDropdown) {
            const listItem = ironDropdown.querySelector('yt-list-item-view-model');
            if (listItem) {
              const computed = window.getComputedStyle(listItem);
              const innerDiv = listItem.querySelector('div');
              const innerComputed = innerDiv ? window.getComputedStyle(innerDiv) : null;

              // Trouver l'icône
              const icon = listItem.querySelector('yt-icon, svg');
              const iconComputed = icon ? window.getComputedStyle(icon) : null;

              // Trouver le texte
              const textSpan = listItem.querySelector('span');
              const textComputed = textSpan ? window.getComputedStyle(textSpan) : null;

              return {
                format: 'NEW (yt-list-item-view-model)',
                html: listItem.outerHTML.substring(0, 2000),
                container: {
                  display: computed.display,
                  padding: computed.padding,
                  minHeight: computed.minHeight,
                  alignItems: computed.alignItems,
                  cursor: computed.cursor,
                },
                innerDiv: innerComputed ? {
                  display: innerComputed.display,
                  padding: innerComputed.padding,
                  gap: innerComputed.gap,
                  alignItems: innerComputed.alignItems,
                } : null,
                icon: iconComputed ? {
                  width: iconComputed.width,
                  height: iconComputed.height,
                  marginRight: iconComputed.marginRight,
                  color: iconComputed.color,
                } : null,
                text: textComputed ? {
                  fontSize: textComputed.fontSize,
                  fontFamily: textComputed.fontFamily,
                  fontWeight: textComputed.fontWeight,
                  color: textComputed.color,
                  lineHeight: textComputed.lineHeight,
                } : null,
              };
            }
          }

          // Fallback: format classique
          const classicPopup = document.querySelector('ytd-menu-popup-renderer');
          if (classicPopup) {
            const menuItem = classicPopup.querySelector('ytd-menu-service-item-renderer');
            if (menuItem) {
              const paperItem = menuItem.querySelector('tp-yt-paper-item');
              const computed = paperItem ? window.getComputedStyle(paperItem) : null;

              const icon = menuItem.querySelector('yt-icon');
              const iconComputed = icon ? window.getComputedStyle(icon) : null;

              const text = menuItem.querySelector('yt-formatted-string');
              const textComputed = text ? window.getComputedStyle(text) : null;

              return {
                format: 'CLASSIC (ytd-menu-service-item-renderer)',
                html: menuItem.outerHTML.substring(0, 2000),
                container: computed ? {
                  display: computed.display,
                  padding: computed.padding,
                  minHeight: computed.minHeight,
                  alignItems: computed.alignItems,
                } : null,
                icon: iconComputed ? {
                  width: iconComputed.width,
                  height: iconComputed.height,
                  marginRight: iconComputed.marginRight,
                  color: iconComputed.color,
                } : null,
                text: textComputed ? {
                  fontSize: textComputed.fontSize,
                  fontFamily: textComputed.fontFamily,
                  fontWeight: textComputed.fontWeight,
                  color: textComputed.color,
                } : null,
              };
            }
          }

          return { error: 'No menu found' };
        });

        console.log('Analyse du menu:');
        console.log(JSON.stringify(menuAnalysis, null, 2));

        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (e) {
    console.log('Erreur:', e.message);
  }

  // 2. ALLER SUR UNE PAGE DE RECHERCHE POUR LE FORMAT CLASSIQUE
  console.log('\n\n### FORMAT CLASSIQUE (Search - ytd-menu-popup-renderer) ###\n');

  await page.goto('https://www.youtube.com/results?search_query=music', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));

  try {
    const videoRenderer = await page.$('ytd-video-renderer');
    if (videoRenderer) {
      await videoRenderer.hover();
      await new Promise(r => setTimeout(r, 1000));

      const menuBtn = await page.$('ytd-video-renderer ytd-menu-renderer yt-icon-button#button');
      if (menuBtn) {
        await menuBtn.click();
        await new Promise(r => setTimeout(r, 1000));

        const classicAnalysis = await page.evaluate(() => {
          const popup = document.querySelector('ytd-menu-popup-renderer');
          if (!popup) return { error: 'No popup found' };

          const menuItem = popup.querySelector('ytd-menu-service-item-renderer');
          if (!menuItem) return { error: 'No menu item found' };

          const paperItem = menuItem.querySelector('tp-yt-paper-item');
          const paperComputed = paperItem ? window.getComputedStyle(paperItem) : null;

          const icon = menuItem.querySelector('yt-icon');
          const iconComputed = icon ? window.getComputedStyle(icon) : null;
          const iconRect = icon ? icon.getBoundingClientRect() : null;

          const text = menuItem.querySelector('yt-formatted-string');
          const textComputed = text ? window.getComputedStyle(text) : null;

          // Récupérer aussi les classes
          return {
            format: 'CLASSIC',
            menuItemClasses: menuItem.className,
            paperItemClasses: paperItem?.className,
            html: menuItem.outerHTML.substring(0, 2500),
            paperItem: paperComputed ? {
              display: paperComputed.display,
              flexDirection: paperComputed.flexDirection,
              alignItems: paperComputed.alignItems,
              padding: paperComputed.padding,
              paddingLeft: paperComputed.paddingLeft,
              paddingRight: paperComputed.paddingRight,
              minHeight: paperComputed.minHeight,
              height: paperComputed.height,
              cursor: paperComputed.cursor,
              backgroundColor: paperComputed.backgroundColor,
            } : null,
            icon: iconComputed ? {
              width: iconComputed.width,
              height: iconComputed.height,
              marginRight: iconComputed.marginRight,
              marginLeft: iconComputed.marginLeft,
              color: iconComputed.color,
              fill: iconComputed.fill,
              actualWidth: iconRect?.width,
              actualHeight: iconRect?.height,
            } : null,
            text: textComputed ? {
              fontSize: textComputed.fontSize,
              fontFamily: textComputed.fontFamily,
              fontWeight: textComputed.fontWeight,
              color: textComputed.color,
              lineHeight: textComputed.lineHeight,
              letterSpacing: textComputed.letterSpacing,
            } : null,
          };
        });

        console.log('Analyse format classique:');
        console.log(JSON.stringify(classicAnalysis, null, 2));

        // Analyser le hover
        const hoverAnalysis = await page.evaluate(() => {
          const items = document.querySelectorAll('ytd-menu-popup-renderer tp-yt-paper-item');
          if (items.length > 0) {
            const item = items[0];
            // Simuler hover
            const hoverBg = window.getComputedStyle(item, ':hover').backgroundColor;
            return {
              note: 'Hover styles from CSS',
              hoverSelector: 'tp-yt-paper-item:hover',
              expectedHoverBg: 'var(--yt-spec-10-percent-layer) ou rgba(255,255,255,0.1)'
            };
          }
          return null;
        });

        console.log('\nHover info:', hoverAnalysis);

        await page.keyboard.press('Escape');
      }
    }
  } catch (e) {
    console.log('Erreur:', e.message);
  }

  // 3. RÉSUMÉ
  console.log('\n\n========================================');
  console.log('RÉSUMÉ DES STYLES À APPLIQUER');
  console.log('========================================\n');

  const summary = await page.evaluate(() => {
    return {
      cssVariables: {
        textPrimary: 'var(--yt-spec-text-primary)',
        textSecondary: 'var(--yt-spec-text-secondary)',
        hoverLayer: 'var(--yt-spec-10-percent-layer)',
        menuBackground: 'var(--yt-spec-menu-background)',
      },
      typography: {
        fontFamily: '"Roboto", "Arial", sans-serif',
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '20px',
      },
      icon: {
        size: '24px',
        marginRight: '16px',
      },
      container: {
        paddingLeft: '16px',
        paddingRight: '16px', // ou 36px selon le contexte
        minHeight: '36px',
        display: 'flex',
        alignItems: 'center',
      }
    };
  });

  console.log(JSON.stringify(summary, null, 2));

  console.log('\n\nFermeture dans 10 secondes...');
  await new Promise(r => setTimeout(r, 10000));

  await browser.close();
  console.log('Analyse terminée!');
}

analyzeMenuStyling().catch(console.error);
