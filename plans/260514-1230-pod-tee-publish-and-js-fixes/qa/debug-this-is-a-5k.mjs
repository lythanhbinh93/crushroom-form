// Root-cause probe for "This Is A 5K" PDP defaulting to Sport Grey
// when user expects Heather Berry. Dumps:
//   1. Server-resolved preferred color (from [data-dop-variants-json data-dop-preferred-color])
//   2. Full Shopify variants list with admin-order, stock, color values
//   3. Globo radios + checked state + color names
//   4. Whether "Heather Berry" appears at all
import { chromium, devices } from 'playwright';

const URL = 'https://dopamiles.co/products/this-is-a-5k-right-t-shirt?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console-error: ' + m.text());
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(7000);

const r = await page.evaluate(() => {
  const island = document.querySelector('[data-dop-variants-json]');
  const preferred = island ? island.getAttribute('data-dop-preferred-color') : null;
  const sectionEl = island ? island.closest('.shopify-section') : null;
  const aligned = sectionEl ? (sectionEl.dataset.dopGloboAligned || null) : null;

  // Shopify variants array (from data island)
  let variants = [];
  if (island) {
    try { variants = JSON.parse(island.textContent || '[]'); } catch (e) {}
  }

  // Pull unique color values in admin order
  const seenColors = new Set();
  const colorsInOrder = [];
  variants.forEach((v) => {
    const c = v.options?.[0];
    if (c && !seenColors.has(c)) {
      seenColors.add(c);
      colorsInOrder.push({
        color: c,
        firstVariantId: v.id,
        firstVariantAvailable: v.available,
        firstVariantInventoryQuantity: v.inventory_quantity,
      });
    }
  });

  // Globo radios
  const radios = Array.from(document.querySelectorAll(
    '.globo-swatch-product-detail input[type="radio"]'
  )).map((r) => ({
    value: r.getAttribute('value'),
    name: r.getAttribute('name'),
    checked: r.checked,
  }));

  // Dawn's hidden picker (server-rendered "selected_value" reflects current_variant)
  const dawnLegend = document.querySelector('[data-dawn-vs] legend');
  const dawnSelectedLabel = dawnLegend ? dawnLegend.textContent.trim() : null;
  const dawnCheckedRadio = document.querySelector('[data-dawn-vs] input[type="radio"]:checked');
  const dawnCheckedValue = dawnCheckedRadio ? dawnCheckedRadio.getAttribute('value') : null;

  // Does "Heather Berry" appear anywhere?
  const html = document.documentElement.outerHTML;
  const heatherBerryInHTML = /heather\s*berry/i.test(html);

  return {
    preferred,
    aligned,
    totalVariants: variants.length,
    uniqueColorsInOrder: colorsInOrder,
    firstShopifyVariant: variants[0] ? {
      id: variants[0].id,
      options: variants[0].options,
      available: variants[0].available,
      inventory_quantity: variants[0].inventory_quantity,
      inventory_management: variants[0].inventory_management,
    } : null,
    firstAvailableShopifyVariant: variants.find((v) => v.available) ? {
      id: variants.find((v) => v.available).id,
      options: variants.find((v) => v.available).options,
    } : null,
    globoRadios: radios,
    globoCheckedValue: radios.find((r) => r.checked)?.value || null,
    globoColorRadios: radios.filter((r) => /globo-option-0|color/i.test(r.name || '')).map((r) => r.value),
    dawnSelectedLabel,
    dawnCheckedValue,
    heatherBerryInHTML,
  };
});

console.log(JSON.stringify(r, null, 2));
if (errors.length) {
  console.log('\n--- ERRORS ---');
  errors.slice(0, 5).forEach((e) => console.log(e));
}
await browser.close();
