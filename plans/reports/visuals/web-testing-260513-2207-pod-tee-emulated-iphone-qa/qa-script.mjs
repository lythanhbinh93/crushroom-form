// Pod-tee emulated iPhone QA — 2026-05-13
// Verifies: phase 06-10 ship + whitespace fix (commit 3a56d52) on preview theme 158279991548
//
// Run via:  npx playwright@latest install chromium  (one-time)
//           node qa-script.mjs

import { chromium, devices } from "playwright";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const PREVIEW_URL =
  "https://dopamiles.co/?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548";
const OUT_DIR = "./shots";

const log = (msg) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 14"],
  locale: "en-US",
  // share-preview persistence relies on cookies set on first hit
});

// Capture console errors + warnings + network failures across whole session
const consoleMessages = [];
const networkFailures = [];
const findings = []; // {step, ok, detail}

const page = await context.newPage();
page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  }
});
page.on("pageerror", (err) =>
  consoleMessages.push({ type: "pageerror", text: err.message })
);
page.on("requestfailed", (req) =>
  networkFailures.push({
    url: req.url(),
    failure: req.failure()?.errorText,
  })
);

const visit = async (url, label) => {
  log(`→ ${label}: ${url}`);
  const response = await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  return { status: response?.status(), url: page.url() };
};

const verifyTheme = async (label) => {
  // Pod-tee theme has sections prefixed `shopify-section-...dopamiles-`
  const hasPodTee = await page.evaluate(
    () =>
      !!document.querySelector(
        '[id*="dopamiles-header"], [id*="dopamiles-footer"], .dop-logo, .dop-hero, .doc-toolbar'
      )
  );
  findings.push({
    step: `theme-check@${label}`,
    ok: hasPodTee,
    detail: hasPodTee ? "pod-tee theme served" : "WRONG THEME — likely BuildMyPOD live",
  });
  return hasPodTee;
};

const shoot = async (name, opts = {}) => {
  await page.screenshot({
    path: `${OUT_DIR}/${name}.png`,
    fullPage: opts.full ?? false,
  });
};

const checkWhitespace = async (label, selector, expectedTextContains) => {
  try {
    const handle = await page.$(selector);
    if (!handle) {
      findings.push({
        step: `ws@${label}`,
        ok: false,
        detail: `selector not found: ${selector}`,
      });
      return;
    }
    // Get rendered innerHTML for inspection
    const html = await handle.evaluate((el) => el.innerHTML.slice(0, 300));
    // Get rendered textContent — collapses whitespace per HTML rules
    const text = (await handle.evaluate((el) => el.textContent.trim())).replace(
      /\s+/g,
      " "
    );
    // Get the actual rendered widths/positions of icon + adjacent text node
    const layout = await handle.evaluate((el) => {
      const svg = el.querySelector("svg");
      const next = svg?.nextSibling;
      if (!svg) return { hasIcon: false };
      const r1 = svg.getBoundingClientRect();
      // First inline sibling (text node or element)
      let nextEl = svg.nextElementSibling;
      const r2 = nextEl?.getBoundingClientRect();
      return {
        hasIcon: true,
        svgRight: Math.round(r1.right),
        nextLeft: r2 ? Math.round(r2.left) : null,
        gap: r2 ? Math.round(r2.left - r1.right) : null,
        textPreview: el.textContent.trim().slice(0, 80),
      };
    });
    const containsExpected = expectedTextContains
      ? text.includes(expectedTextContains)
      : true;
    findings.push({
      step: `ws@${label}`,
      ok: containsExpected && layout.hasIcon && (layout.gap ?? 0) >= 2,
      detail: `text="${text.slice(0, 80)}" | gap=${layout.gap}px | html(300)=${html
        .replace(/\s+/g, " ")
        .slice(0, 180)}`,
    });
  } catch (e) {
    findings.push({
      step: `ws@${label}`,
      ok: false,
      detail: `error: ${e.message}`,
    });
  }
};

try {
  // ── 1. HOME ─────────────────────────────────────────────────────────────
  const home = await visit(PREVIEW_URL, "home");
  findings.push({
    step: "home-status",
    ok: home.status === 200,
    detail: `status=${home.status}`,
  });
  await verifyTheme("home");
  await shoot("01-home", { full: false });
  await shoot("01-home-full", { full: true });

  // ── 2. COLLECTION ───────────────────────────────────────────────────────
  // Try /collections/all (Shopify default)
  const col = await visit(
    "https://dopamiles.co/collections/all?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548",
    "collection"
  );
  findings.push({
    step: "collection-status",
    ok: col.status === 200,
    detail: `status=${col.status}`,
  });
  await verifyTheme("collection");
  await shoot("02-collection", { full: false });
  await shoot("02-collection-full", { full: true });

  // ── WHITESPACE FIX #1: collection filter button "Filter ▼" ─────────────
  await checkWhitespace("filter-btn", "#doc-open-filters", "Filter");

  // Pick first product link for PDP test
  const productHandle = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/products/"]');
    return a ? a.getAttribute("href").split("?")[0] : null;
  });
  log(`  picked product: ${productHandle}`);

  // ── 3. PDP ──────────────────────────────────────────────────────────────
  if (productHandle) {
    const pdp = await visit(
      `https://dopamiles.co${productHandle}?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548`,
      "PDP"
    );
    findings.push({
      step: "pdp-status",
      ok: pdp.status === 200,
      detail: `status=${pdp.status}`,
    });
    await verifyTheme("pdp");
    await shoot("03-pdp", { full: false });
    await shoot("03-pdp-full", { full: true });

    // Accordion chevron — kept as `{%- render -%}` (CSS-positioned, safe site)
    const accordionExists = await page.$$eval(
      ".dop-acc summary svg",
      (els) => els.length
    );
    findings.push({
      step: "pdp-accordion-chevron",
      ok: accordionExists >= 1,
      detail: `found ${accordionExists} accordion chevrons`,
    });

    // ── ATC test → triggers cart drawer ───────────────────────────────────
    const atcBtn = await page.$('.dop-btn-cta[name="add"], [data-type="add-to-cart-form"] button[type="submit"]');
    if (atcBtn) {
      log("  clicking ATC...");
      await atcBtn.click();
      await page.waitForTimeout(3000); // give cart drawer time to open
      await shoot("04-cart-drawer-after-atc", { full: false });

      // ── WHITESPACE FIX #2: cart drawer free-shipping row ─────────────────
      // If qty pushed over free-ship threshold, the success row renders
      // The row is inside .dop-cart-ship-bar.met .top span > svg + b
      await checkWhitespace(
        "cart-drawer-shipbar",
        ".dop-cart-ship-bar .top span",
        null
      );
    } else {
      findings.push({
        step: "atc-button",
        ok: false,
        detail: "ATC button not found on PDP",
      });
    }
  } else {
    findings.push({
      step: "pdp-skipped",
      ok: false,
      detail: "no product link on collection page",
    });
  }

  // ── 4. CART PAGE ────────────────────────────────────────────────────────
  const cart = await visit(
    "https://dopamiles.co/cart?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548",
    "cart-page"
  );
  findings.push({
    step: "cart-page-status",
    ok: cart.status === 200,
    detail: `status=${cart.status}`,
  });
  await verifyTheme("cart");
  await shoot("05-cart-page", { full: false });
  await shoot("05-cart-page-full", { full: true });

  // ── WHITESPACE FIX #3: cart-main summary free-ship row ────────────────
  await checkWhitespace(
    "cart-main-shipbar",
    "#dop-page-summary .dop-cart-ship-bar .top span",
    null
  );

  // ── 5. CONSOLE ERRORS SUMMARY ───────────────────────────────────────────
  findings.push({
    step: "console-errors",
    ok: consoleMessages.filter((m) => m.type === "error" || m.type === "pageerror")
      .length === 0,
    detail: `${
      consoleMessages.filter((m) => m.type === "error" || m.type === "pageerror")
        .length
    } errors, ${
      consoleMessages.filter((m) => m.type === "warning").length
    } warnings`,
  });
  findings.push({
    step: "network-failures",
    ok: networkFailures.length === 0,
    detail: `${networkFailures.length} request failures`,
  });
} catch (e) {
  findings.push({ step: "fatal", ok: false, detail: e.stack });
  log(`FATAL: ${e.message}`);
}

await writeFile(
  `${OUT_DIR}/findings.json`,
  JSON.stringify({ findings, consoleMessages, networkFailures }, null, 2)
);

await browser.close();

// ── Print summary ──────────────────────────────────────────────────────────
console.log("\n=== QA RESULTS ===");
for (const f of findings) {
  console.log(`${f.ok ? "✓" : "✗"} ${f.step}: ${f.detail}`);
}
const passed = findings.filter((f) => f.ok).length;
const total = findings.length;
console.log(`\n${passed}/${total} checks passed`);
console.log(
  `Console: ${consoleMessages.length} msgs | Network failures: ${networkFailures.length}`
);
process.exit(passed === total ? 0 : 1);
