// Measure the perf impact of the new alignGloboToPreferredColor() flow on a
// real PDP. Specifically: did my JS call .click() (= work)? Did the click
// trigger a section refetch via Dawn's product-info.js (= network)?
//
// Usage:
//   node perf-probe-feature-variant.mjs <handle1> [<handle2> ...]
import { chromium, devices } from 'playwright';

const PREVIEW = '158279991548';
const HANDLES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['a-new-chapter-begins', 'this-is-a-5k-right-t-shirt', '5k-route-t-shirt'];

async function probe(handle) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await ctx.newPage();

  // Track network: count requests to the product's own URL (= Dawn section refetch)
  const sectionRefetches = [];
  page.on('request', (req) => {
    const u = req.url();
    if (/\/products\/[^/]+\?.*section_id=/.test(u)) {
      sectionRefetches.push({
        time: Date.now(),
        url: u.split('?')[0],
        section: new URL(u).searchParams.get('section_id'),
      });
    }
  });

  const t0 = Date.now();
  const url = `https://dopamiles.co/products/${handle}?_ab=0&_fd=0&_sc=1&preview_theme_id=${PREVIEW}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  const tNetIdle = Date.now() - t0;

  // Wait long enough for Globo + observer + any cascading refetch
  await page.waitForTimeout(7000);
  const tDone = Date.now() - t0;

  const state = await page.evaluate(() => {
    const island = document.querySelector('[data-dop-variants-json]');
    const preferred = island ? island.getAttribute('data-dop-preferred-color') : null;
    const sectionEl = island ? island.closest('.shopify-section') : null;
    const aligned = sectionEl ? sectionEl.dataset.dopGloboAligned || null : null;

    const radios = Array.from(document.querySelectorAll(
      '.globo-swatch-product-detail input[type="radio"]'
    ));
    const checkedRadio = radios.find((r) => r.checked);
    const checkedValue = checkedRadio ? checkedRadio.getAttribute('value') : null;

    // navigationTiming for context
    const nav = performance.getEntriesByType('navigation')[0];
    const navTiming = nav ? {
      domInteractive: Math.round(nav.domInteractive),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadEvent: Math.round(nav.loadEventEnd),
      // FCP / LCP from paint timing API if available
    } : null;

    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find((p) => p.name === 'first-contentful-paint');

    return {
      preferred,
      aligned,
      checkedValue,
      preferredMatchesChecked: preferred && checkedValue && preferred.toLowerCase() === checkedValue.toLowerCase(),
      navTiming,
      fcp: fcp ? Math.round(fcp.startTime) : null,
    };
  });

  await browser.close();
  return {
    handle,
    tNetIdle,
    tDone,
    state,
    sectionRefetches: sectionRefetches.length,
    sectionRefetchDetail: sectionRefetches.slice(0, 5),
  };
}

const results = [];
for (const h of HANDLES) {
  console.log(`--- ${h} ---`);
  const r = await probe(h);
  results.push(r);
  console.log(JSON.stringify(r, null, 2));
}

console.log('\n=== SUMMARY ===');
results.forEach((r) => {
  console.log(`${r.handle}: preferred="${r.state.preferred}" checked="${r.state.checkedValue}" match=${r.state.preferredMatchesChecked} sectionRefetches=${r.sectionRefetches} fcp=${r.state.fcp}ms DCL=${r.state.navTiming?.domContentLoaded}ms`);
});
