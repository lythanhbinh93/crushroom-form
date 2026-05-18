// Dump children of .globo-swatch-product-detail to confirm what selectors work.
import { chromium, devices } from 'playwright';

const URL = 'https://dopamiles.co/products/5k-route-t-shirt?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(7000);

const r = await page.evaluate(() => {
  const container = document.querySelector('.globo-swatch-product-detail');
  if (!container) return { error: 'no container' };

  // Walk the whole subtree and dump every element
  const all = Array.from(container.querySelectorAll('*')).slice(0, 50);
  const dump = all.map((el) => {
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value.slice(0, 80);
    return {
      tag: el.tagName,
      cls: el.className.toString().slice(0, 120),
      text: el.textContent.trim().slice(0, 50),
      hasChildren: el.children.length,
      attrs,
    };
  });

  return {
    containerHTML: container.outerHTML.slice(0, 2000),
    totalChildren: container.querySelectorAll('*').length,
    elements: dump,
    sectionAligned: container.closest('.shopify-section')?.dataset.dopGloboAligned,
    preferredAttr: document.querySelector('[data-dop-variants-json]')?.getAttribute('data-dop-preferred-color'),
  };
});

console.log(JSON.stringify(r, null, 2));
await browser.close();
