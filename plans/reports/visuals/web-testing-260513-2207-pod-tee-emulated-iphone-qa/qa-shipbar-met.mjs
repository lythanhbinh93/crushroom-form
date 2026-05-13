// Second-pass QA: force cart over free-ship threshold, screenshot MET shipbar
// to verify whitespace fix on the cart-drawer + cart-main success rows.
//
// Adds 5 of the first available variant via /cart/add.js then reloads cart.

import { chromium, devices } from "playwright";
import { writeFile, mkdir } from "fs/promises";

const PREVIEW = (path = "/") =>
  `https://dopamiles.co${path}?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548`;

await mkdir("./shots-met", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 14"], locale: "en-US" });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push({ type: "pageerror", text: e.message }));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    errors.push({ type: m.type(), text: m.text() });
  }
});

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const results = [];

try {
  log("→ home (set preview cookie)");
  await page.goto(PREVIEW("/"), { waitUntil: "networkidle", timeout: 30000 });

  log("→ collection");
  await page.goto(PREVIEW("/collections/all"), { waitUntil: "networkidle" });

  const productHandle = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/products/"]');
    return a ? a.getAttribute("href").split("?")[0] : null;
  });
  log(`  product: ${productHandle}`);

  log(`→ PDP ${productHandle}`);
  await page.goto(PREVIEW(productHandle), { waitUntil: "networkidle" });

  // Hardcoded variant_id from product.json — 5k-route-t-shirt Navy/S @ $24.99
  // 3 × $24.99 = $74.97 → over typical $60 free-shipping threshold
  const variantId = 48947477348604;
  log(`  variantId: ${variantId}`);

  if (variantId) {
    log("  POST /cart/add.js × 3 quantity");
    const addResult = await page.evaluate(async (vid) => {
      // Clear cart first to ensure clean state
      await fetch("/cart/clear.js", { method: "POST" });
      const r = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: vid, quantity: 3 }),
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, ok: r.ok, qty: body.quantity, total: body.line_price };
    }, variantId);
    log(`  add.js → ${JSON.stringify(addResult)}`);
    results.push({ step: "cart-add", ok: addResult.ok, detail: JSON.stringify(addResult) });
  }

  // ── Open cart drawer via click on bag icon, OR reload PDP with cart populated
  log("→ reload PDP to refresh cart drawer with loaded items");
  await page.goto(PREVIEW(productHandle), { waitUntil: "networkidle" });

  // Try clicking the bag icon to open drawer
  log("  click bag/cart icon");
  await page.click(".dop-bag, #dop-bag-trigger, [data-cart-trigger], a[href='/cart']", {
    timeout: 5000,
  }).catch(() => log("  bag click failed — trying ATC trigger"));

  await page.waitForTimeout(2500);
  await page.screenshot({ path: "./shots-met/01-pdp-cart-drawer.png", fullPage: false });

  // Check ship-bar MET state
  const shipBarDrawer = await page.evaluate(() => {
    const bar = document.querySelector("#dop-ship-bar, .dop-cart-ship-bar");
    if (!bar) return { found: false };
    const isMet = bar.classList.contains("met");
    const span = bar.querySelector(".top > span:first-child");
    const svg = span?.querySelector("svg");
    const b = span?.querySelector("b");
    const r1 = svg?.getBoundingClientRect();
    const r2 = b?.getBoundingClientRect();
    return {
      found: true,
      met: isMet,
      classList: bar.className,
      hasSvg: !!svg,
      hasB: !!b,
      text: span?.textContent?.trim() || "",
      gap: r1 && r2 ? Math.round(r2.left - r1.right) : null,
      svgRight: r1 ? Math.round(r1.right) : null,
      bLeft: r2 ? Math.round(r2.left) : null,
    };
  });
  log(`  drawer-shipbar: ${JSON.stringify(shipBarDrawer)}`);
  results.push({
    step: "cart-drawer-shipbar-met",
    ok:
      shipBarDrawer.found &&
      shipBarDrawer.met &&
      shipBarDrawer.hasSvg &&
      shipBarDrawer.hasB &&
      (shipBarDrawer.gap ?? 0) >= 2,
    detail: JSON.stringify(shipBarDrawer),
  });

  // ── Navigate to /cart page ─────────────────────────────────────────────
  log("→ /cart page");
  await page.goto(PREVIEW("/cart"), { waitUntil: "networkidle" });
  await page.screenshot({ path: "./shots-met/02-cart-page.png", fullPage: false });

  const shipBarMain = await page.evaluate(() => {
    const bar = document.querySelector("#dop-page-summary .dop-cart-ship-bar");
    if (!bar) return { found: false };
    const isMet = bar.classList.contains("met");
    const span = bar.querySelector(".top > span:first-child");
    const svg = span?.querySelector("svg");
    const b = span?.querySelector("b");
    const r1 = svg?.getBoundingClientRect();
    const r2 = b?.getBoundingClientRect();
    return {
      found: true,
      met: isMet,
      hasSvg: !!svg,
      hasB: !!b,
      text: span?.textContent?.trim() || "",
      gap: r1 && r2 ? Math.round(r2.left - r1.right) : null,
    };
  });
  log(`  cart-main-shipbar: ${JSON.stringify(shipBarMain)}`);
  results.push({
    step: "cart-main-shipbar-met",
    ok:
      shipBarMain.found &&
      shipBarMain.met &&
      shipBarMain.hasSvg &&
      shipBarMain.hasB &&
      (shipBarMain.gap ?? 0) >= 2,
    detail: JSON.stringify(shipBarMain),
  });
} catch (e) {
  log(`FATAL: ${e.message}`);
  results.push({ step: "fatal", ok: false, detail: e.stack });
} finally {
  await writeFile("./shots-met/findings.json", JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}

console.log("\n=== SHIPBAR-MET QA ===");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.step}: ${r.detail}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
