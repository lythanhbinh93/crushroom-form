// Prove the CLICK path of alignGloboToPreferredColor() works.
// Strategy: load page, wait for Globo, then override the preferred-color
// attribute to a NON-default value, reset the dopGloboAligned flag, and
// trigger a re-init. Assert the click switches the checked radio.
import { chromium, devices } from 'playwright';

const URL = 'https://dopamiles.co/products/5k-route-t-shirt?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548';

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

const result = await page.evaluate(() => {
  // Before state
  const radiosBefore = Array.from(document.querySelectorAll('.globo-swatch-product-detail input[type="radio"]'));
  const checkedBefore = radiosBefore.find((r) => r.checked)?.getAttribute('value') || null;

  // Override preferred color to a DIFFERENT value (Royal)
  const island = document.querySelector('[data-dop-variants-json]');
  if (!island) return { error: 'no island' };
  island.setAttribute('data-dop-preferred-color', 'Royal');

  // Reset alignment flag so the function will re-run
  const sectionEl = island.closest('.shopify-section');
  if (sectionEl) sectionEl.dataset.dopGloboAligned = '';

  // Manually call alignment logic — but our code's alignGloboToPreferredColor
  // is closure-scoped inside initSection. To trigger re-run, dispatch the
  // shopify:section:load event which calls bootAll(e.target).
  // However bootAll → initSection bails on `dopVariantSyncInit === '1'`.
  // We also need to reset that.
  if (sectionEl) sectionEl.dataset.dopVariantSyncInit = '';

  const event = new CustomEvent('shopify:section:load', { bubbles: true });
  Object.defineProperty(event, 'target', { value: sectionEl, writable: false });
  document.dispatchEvent(event);

  return { checkedBefore, override: 'Royal' };
});

await page.waitForTimeout(2000);

const after = await page.evaluate(() => {
  const radios = Array.from(document.querySelectorAll('.globo-swatch-product-detail input[type="radio"]'));
  const checked = radios.find((r) => r.checked)?.getAttribute('value') || null;
  const island = document.querySelector('[data-dop-variants-json]');
  const sectionEl = island?.closest('.shopify-section');
  const aligned = sectionEl?.dataset.dopGloboAligned || null;
  return { checkedAfter: checked, aligned };
});

console.log('Before:', result);
console.log('After:', after);

const pass = after.checkedAfter === 'Royal' && after.aligned === '1';
console.log('\n=== ' + (pass ? 'CLICK PATH PASS' : 'CLICK PATH FAIL') + ' ===');
console.log('Expected: Royal checked + aligned=1');
console.log('Got: ' + after.checkedAfter + ' checked + aligned=' + after.aligned);
if (errors.length) {
  console.log('\nErrors:');
  errors.slice(0, 5).forEach((e) => console.log('  ' + e));
}

await browser.close();
process.exit(pass ? 0 : 1);
