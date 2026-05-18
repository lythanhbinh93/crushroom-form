// Phase 03 of 260518-1300-pdp-feature-variant-default plan.
// Assert: on PDP load, the Globo swatch matching `data-dop-preferred-color`
// has `<input checked>` AND `section.dataset.dopGloboAligned === '1'`.
//
// Globo's selected state lives on the <input type="radio" checked>; the <li>
// wrapper holds the color name in `data-value`. Verified in QA 2026-05-18.
import { chromium, webkit, devices } from 'playwright';

const PREVIEW_THEME = '158279991548';
// PRODUCTS may be overridden via CLI args: `node feature-variant-default.mjs handle1 handle2 ...`
const PRODUCTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['5k-route-t-shirt'];

function normalizeColor(s) {
  return String(s || '').toLowerCase().replace(/[\s_-]/g, '');
}

async function runOne(engine, deviceName, handle) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[deviceName] });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console-error: ' + m.text());
  });

  const url = `https://dopamiles.co/products/${handle}?_ab=0&_fd=0&_sc=1&preview_theme_id=${PREVIEW_THEME}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(7000); // Globo lazy-load + dop align observer settle

  const result = await page.evaluate(() => {
    const island = document.querySelector('[data-dop-variants-json]');
    const preferred = island ? island.getAttribute('data-dop-preferred-color') : null;
    const sectionEl = island ? island.closest('.shopify-section') : null;
    const aligned = sectionEl ? (sectionEl.dataset.dopGloboAligned || null) : null;

    // Find which Globo radio is checked
    const radios = Array.from(document.querySelectorAll(
      '.globo-swatch-product-detail input[type="radio"], ' +
      '[class*="globo-color-swatch"] input[type="radio"]'
    ));

    const checkedRadio = radios.find((r) => r.checked) || null;
    const checkedValue = checkedRadio ? checkedRadio.getAttribute('value') : null;

    return {
      preferred,
      aligned,
      radioCount: radios.length,
      checkedValue,
      allValues: radios.map((r) => r.getAttribute('value')),
    };
  });

  await browser.close();

  const target = normalizeColor(result.preferred);
  const actual = normalizeColor(result.checkedValue);
  const pass =
    !!result.radioCount &&
    !!target &&
    target === actual &&
    result.aligned === '1';

  return {
    engine: engine.name(),
    deviceName,
    handle,
    pass,
    reasons: {
      hasRadios: !!result.radioCount,
      preferredMatchesChecked: target === actual,
      dopAlignedFlag: result.aligned === '1',
    },
    target,
    actual,
    result,
    errors,
  };
}

const runs = [];
for (const handle of PRODUCTS) {
  runs.push(await runOne(chromium, 'iPhone 14', handle));
  runs.push(await runOne(webkit, 'iPhone 14', handle));
}

console.log(JSON.stringify(runs, null, 2));

const passCount = runs.filter((r) => r.pass).length;
console.log(`\n=== SUMMARY: ${passCount}/${runs.length} PASS ===`);
process.exit(passCount === runs.length ? 0 : 1);
