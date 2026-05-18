// Phase 01 of 260518-1300-pdp-feature-variant-default plan.
// Probe Globo's runtime DOM to capture:
//   1. The "selected" state selector for a Globo color swatch
//   2. The attribute that holds the color name on each swatch
//   3. Click responsiveness (does a programmatic .click() trigger Globo's state update?)
//   4. Post-click DOM mutation pattern (informs the dopGloboAligned guard timing)
//
// Run against 3 PDPs to confirm pattern consistency.
// Output: structured JSON to stdout; consumer should redirect to reports/ for archival.
import { chromium, devices } from 'playwright';

const PREVIEW_THEME = '158279991548';
const PRODUCTS = [
  '5k-route-t-shirt',
  'good-vibes-only-tee',     // pick a 2nd product with Color option
  'mountain-energy-tee',     // pick a 3rd product with Color option
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

const results = [];

for (const handle of PRODUCTS) {
  const url = `https://dopamiles.co/products/${handle}?_ab=0&_fd=0&_sc=1&preview_theme_id=${PREVIEW_THEME}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(6000); // Globo lazy-loads

    const diag = await page.evaluate(() => {
      // Find all Globo swatch candidates
      const globoSwatches = Array.from(document.querySelectorAll(
        '.globo-swatch-product-detail [class*="swatch"], ' +
        '.globo-swatch-product-detail button, ' +
        '.globo-swatch-product-detail [role="button"], ' +
        '.globo-swatch-product-detail a, ' +
        '[class*="globo-color-swatch"]'
      ));

      // Dump full attributes for each candidate
      const swatchData = globoSwatches.slice(0, 20).map((el) => {
        const attrs = {};
        for (const a of el.attributes) attrs[a.name] = a.value;
        return {
          tag: el.tagName,
          cls: el.className.toString().slice(0, 200),
          text: el.textContent.trim().slice(0, 60),
          attrs,
          ariaPressed: el.getAttribute('aria-pressed'),
          ariaChecked: el.getAttribute('aria-checked'),
          ariaSelected: el.getAttribute('aria-selected'),
          dataSelected: el.getAttribute('data-selected'),
          // Common selected-state class patterns
          hasActiveClass: /(?:^|\s)(active|selected|current|checked)(?:\s|$|--)/.test(el.className),
          // What attribute looks like color name
          probableColorAttrs: {
            'data-value': el.getAttribute('data-value'),
            'data-color': el.getAttribute('data-color'),
            'data-option-value': el.getAttribute('data-option-value'),
            'title': el.getAttribute('title'),
            'aria-label': el.getAttribute('aria-label'),
            'data-globo-value': el.getAttribute('data-globo-value'),
          },
          visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        };
      });

      // What does Shopify's selected_or_first_available_variant resolve to?
      // Read from JSON island
      const variantsIsland = document.querySelector('[data-dop-variants-json]');
      let serverPreferredColor = null;
      if (variantsIsland) {
        try {
          const variants = JSON.parse(variantsIsland.textContent);
          // First variant in the array = product.variants.first (admin order)
          // But Shopify may skip OOS — best to read the Dawn radio checked state
          const checkedRadio = document.querySelector('[data-dawn-vs] input[type="radio"]:checked');
          if (checkedRadio) {
            // The radio's name is "options[Color]" or similar
            serverPreferredColor = {
              source: 'dawn-radio-checked',
              name: checkedRadio.name,
              value: checkedRadio.value,
            };
          } else {
            serverPreferredColor = {
              source: 'variants-json-first',
              firstVariantOptions: variants[0]?.options || null,
            };
          }
        } catch (e) {
          serverPreferredColor = { error: e.message };
        }
      }

      return {
        swatchCount: globoSwatches.length,
        swatchData,
        serverPreferredColor,
        productHandle: location.pathname.split('/').pop(),
      };
    });

    // Now test click responsiveness: pick a NON-selected swatch and click it
    const clickTest = await page.evaluate(() => {
      const swatches = Array.from(document.querySelectorAll(
        '.globo-swatch-product-detail [class*="swatch"], ' +
        '.globo-swatch-product-detail button, ' +
        '.globo-swatch-product-detail [role="button"]'
      ));
      if (swatches.length < 2) return { skipped: 'fewer than 2 swatches' };

      // Find one that doesn't appear selected
      const target = swatches.find((el) =>
        !el.getAttribute('aria-pressed') === 'true' &&
        !/(?:^|\s)(active|selected|current|checked)(?:\s|$|--)/.test(el.className)
      ) || swatches[1];

      const before = {
        cls: target.className,
        ariaPressed: target.getAttribute('aria-pressed'),
      };

      // Track mutations on Globo container for 1.5s after click
      const container = document.querySelector('.globo-swatch-product-detail');
      const mutations = [];
      const obs = new MutationObserver((muts) => {
        muts.forEach((m) => {
          mutations.push({
            type: m.type,
            target: m.target.tagName + '.' + (m.target.className?.toString().slice(0, 40) || ''),
            attr: m.attributeName,
          });
        });
      });
      if (container) obs.observe(container, { attributes: true, childList: true, subtree: true, attributeOldValue: true });

      // Also listen for Dawn change events
      const changeEvents = [];
      const dawnVS = document.querySelector('[data-dawn-vs]');
      if (dawnVS) {
        dawnVS.addEventListener('change', (e) => {
          changeEvents.push({ target: e.target.name, value: e.target.value });
        }, { once: false });
      }

      target.click();

      return new Promise((resolve) => {
        setTimeout(() => {
          obs.disconnect();
          const after = {
            cls: target.className,
            ariaPressed: target.getAttribute('aria-pressed'),
          };
          resolve({
            before, after,
            mutationCount: mutations.length,
            mutationsSample: mutations.slice(0, 10),
            dawnChangeFired: changeEvents.length > 0,
            changeEvents,
          });
        }, 1500);
      });
    });

    results.push({ handle, diag, clickTest, errors: [...errors] });
    errors.length = 0;
  } catch (e) {
    results.push({ handle, error: e.message });
  }
}

console.log(JSON.stringify(results, null, 2));

await browser.close();
