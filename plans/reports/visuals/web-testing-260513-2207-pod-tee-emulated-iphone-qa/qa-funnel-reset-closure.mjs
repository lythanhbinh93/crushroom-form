// Funnel-reset closure QA — phase-specific assertions for phases 02-10
// Validates that the funnel-reset deliverables actually shipped to preview theme 158279991548
//
// Use case: closure gate for marking 260511-1132-pod-tee-funnel-reset as `completed`.
// Run after qa-script.mjs (which covers general theme integrity + whitespace fix).

import { chromium, devices } from "playwright";
import { writeFile, mkdir } from "fs/promises";

const PREVIEW = (path = "/") =>
  `https://dopamiles.co${path}?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548`;

await mkdir("./shots-closure", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["iPhone 14"], locale: "en-US" });
const page = await context.newPage();

const errors = [];
const findings = [];

page.on("pageerror", (e) => errors.push({ type: "pageerror", text: e.message }));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    errors.push({ type: m.type(), text: m.text() });
  }
});

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

// ── Establish preview session cookie ────────────────────────────────────────
log("→ home (set preview cookie)");
await page.goto(PREVIEW("/"), { waitUntil: "networkidle", timeout: 30000 });

const check = (step, ok, detail) => {
  findings.push({ step, ok, detail });
  log(`${ok ? "✓" : "✗"} ${step}: ${String(detail).slice(0, 120)}`);
};

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 02 — Round-3c rejection cleanup (verify dead JS code purged)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 02 — Round-3c cleanup ===");
  const cartJsContent = await page.evaluate(async () => {
    const scripts = Array.from(document.querySelectorAll('script[src*="dopamiles-cart"]'));
    if (!scripts.length) return null;
    const src = scripts[0].src;
    const r = await fetch(src);
    return await r.text();
  });
  check(
    "p02-no-injectOptimisticAtcLine",
    cartJsContent && !cartJsContent.includes("injectOptimisticAtcLine"),
    cartJsContent ? "dead optimistic ATC code purged" : "could not fetch cart.js"
  );
  check(
    "p02-no-optimisticLineUpdate",
    cartJsContent && !cartJsContent.includes("optimisticLineUpdate"),
    "dead optimistic line update purged"
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 03 — Collection card first-photo fix (Bug C)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 03 — Collection card image ===");
  await page.goto(PREVIEW("/collections/all"), { waitUntil: "networkidle" });
  const cardImages = await page.evaluate(() => {
    const cards = document.querySelectorAll(".dop-pcard, article[class*='pcard']");
    return Array.from(cards).slice(0, 5).map((c) => {
      const img = c.querySelector("img");
      return {
        hasImg: !!img,
        src: img?.src?.split("?")[0] || null,
        lazyLoading: img?.getAttribute("loading") === "lazy",
      };
    });
  });
  check(
    "p03-collection-cards-have-images",
    cardImages.length > 0 && cardImages.every((c) => c.hasImg),
    `${cardImages.filter((c) => c.hasImg).length}/${cardImages.length} cards have images`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 04 — Globo CLS via MutationObserver (verify no extracted retry loop)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 04 — Globo CLS / MutationObserver ===");
  const productHandle = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/products/"]');
    return a ? a.getAttribute("href").split("?")[0] : null;
  });

  if (productHandle) {
    await page.goto(PREVIEW(productHandle), { waitUntil: "networkidle" });
    const pdpJsContent = await page.evaluate(async () => {
      const scripts = Array.from(document.querySelectorAll('script[src*="dopamiles-pdp"]'));
      const results = {};
      for (const s of scripts) {
        const r = await fetch(s.src);
        results[s.src.split("/").pop().split("?")[0]] = await r.text();
      }
      return results;
    });

    // retryUntilGloboMuted was the round-3c approach; should be replaced by MutationObserver
    const allPdpJs = Object.values(pdpJsContent).join("\n");
    check(
      "p04-no-retryUntilGloboMuted",
      !allPdpJs.includes("retryUntilGloboMuted"),
      "old retry loop removed"
    );
    check(
      "p04-has-MutationObserver",
      allPdpJs.includes("MutationObserver"),
      "MutationObserver pattern present"
    );
  } else {
    check("p04-skipped", false, "no product handle to test PDP");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 05 — dopamiles-cart.js strangler split (3 files exist + load order)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 05 — Cart strangler split ===");
  const cartScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src*="dopamiles-cart"]'))
      .map((s) => ({ src: s.src.split("/").pop().split("?")[0], defer: s.defer }));
  });
  const expectedScripts = [
    "dopamiles-cart-helpers.js",
    "dopamiles-cart-mutations.js",
    "dopamiles-cart.js",
  ];
  for (const expected of expectedScripts) {
    const found = cartScripts.some((s) => s.src === expected);
    check(`p05-script-${expected}`, found, found ? "loaded" : "MISSING");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 06 — product-hero JS extraction + collection filter drawer snippet
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 06 — JS extraction ===");
  const variantSyncLoaded = await page.evaluate(() => {
    return !!document.querySelector('script[src*="dopamiles-pdp-variant-sync"]');
  });
  check(
    "p06-variant-sync-extracted",
    variantSyncLoaded,
    variantSyncLoaded ? "dopamiles-pdp-variant-sync.js loaded externally" : "still inline?"
  );

  await page.goto(PREVIEW("/collections/all"), { waitUntil: "networkidle" });
  const collectionJsLoaded = await page.evaluate(() => {
    return !!document.querySelector('script[src*="dopamiles-collection"]');
  });
  check(
    "p06-collection-js-extracted",
    collectionJsLoaded,
    collectionJsLoaded ? "dopamiles-collection.js loaded externally" : "still inline?"
  );

  const drawerSnippetExists = await page.evaluate(() => {
    return !!document.querySelector("#doc-drawer, .doc-filter-drawer");
  });
  check(
    "p06-filter-drawer-snippet",
    drawerSnippetExists,
    "filter drawer markup present"
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 07 — Card consistency + a11y (single product-card snippet)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 07 — Card consistency + a11y ===");
  const cardA11y = await page.evaluate(() => {
    const cards = document.querySelectorAll(".dop-pcard, article[class*='pcard']");
    return Array.from(cards).slice(0, 5).map((c) => ({
      hasLink: !!c.querySelector("a"),
      linkHasAriaLabel:
        !!c.querySelector("a[aria-label]") || !!c.querySelector("a [class*='title']"),
      imgHasAlt: Array.from(c.querySelectorAll("img")).every((i) => i.hasAttribute("alt")),
    }));
  });
  check(
    "p07-cards-have-links",
    cardA11y.every((c) => c.hasLink),
    `${cardA11y.filter((c) => c.hasLink).length}/${cardA11y.length} cards have links`
  );
  check(
    "p07-images-have-alt",
    cardA11y.every((c) => c.imgHasAlt),
    `${cardA11y.filter((c) => c.imgHasAlt).length}/${cardA11y.length} cards have alt`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 08 — Conditional CSS loading (perf pass)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 08 — Conditional CSS ===");
  const cssLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((l) => l.href.split("/").pop().split("?")[0])
      .filter((h) => h.startsWith("dopamiles") || h.includes("component-product"));
  });
  log(`  Collection page CSS: ${cssLinks.join(", ")}`);
  // On collection page, PDP-specific CSS should NOT load
  const hasPdpCss = cssLinks.some((c) => c.includes("dopamiles-pdp.css") || c.includes("product-variant-picker"));
  check(
    "p08-no-pdp-css-on-collection",
    !hasPdpCss,
    hasPdpCss ? `LEAKED: ${cssLinks.filter((c) => c.includes("pdp") || c.includes("variant")).join(", ")}` : "clean — no PDP CSS on collection page"
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 09 — Locales / merchant-editable copy
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 09 — Locales / copy ===");
  // Cart drawer "Free shipping unlocked" string should be locale-bound
  await page.goto(PREVIEW("/"), { waitUntil: "networkidle" });
  // Add items to populate cart
  await page.evaluate(async () => {
    await fetch("/cart/clear.js", { method: "POST" });
    await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 48947477348604, quantity: 3 }),
    });
  });
  await page.goto(PREVIEW("/cart"), { waitUntil: "networkidle" });
  const cartCopy = await page.evaluate(() => {
    const span = document.querySelector("#dop-page-summary .dop-cart-ship-bar .top span");
    return span?.textContent?.trim() || "";
  });
  check(
    "p09-free-shipping-copy-localized",
    cartCopy.toLowerCase().includes("free shipping"),
    `cart copy = "${cartCopy}"`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 10 — Tail cleanup (today's commits verified separately)
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Phase 10 — Tail cleanup + 2026-05-13 deferred burndown ===");
  // dopamiles-icon snippet exists (today's work)
  const iconSnippetUsed = await page.evaluate(() => {
    // The check icon path 'm5 12 5 5L20 7' should appear in cart drawer / shipbar
    const svgs = Array.from(document.querySelectorAll("svg path"));
    return svgs.some((p) => p.getAttribute("d") === "m5 12 5 5L20 7");
  });
  check(
    "p10-icon-snippet-rendering",
    iconSnippetUsed,
    "dopamiles-icon snippet check path detected"
  );

  // dawn-backup templates should NOT be reachable
  await page.goto(PREVIEW("/?view=dawn-backup"), { waitUntil: "domcontentloaded" });
  const dawnBackupAccessible = await page.evaluate(() => {
    // If it's the dawn-backup theme, it won't have .dop-hero or .dop-logo
    return !!document.querySelector(".dop-hero, .dop-logo, .dop-container");
  });
  check(
    "p10-dawn-backup-alt-template-removed",
    dawnBackupAccessible,
    dawnBackupAccessible
      ? "?view=dawn-backup falls back to default (alt-templates removed)"
      : "ALT-TEMPLATE STILL ACTIVE — Shopify served dawn-backup theme"
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Console error baseline
  // ═══════════════════════════════════════════════════════════════════════════
  log("\n=== Console / network baseline ===");
  const pageerrors = errors.filter((e) => e.type === "pageerror");
  const amountErrors = pageerrors.filter((e) => e.text.includes("amount is not defined")).length;
  const otherPageerrors = pageerrors.filter((e) => !e.text.includes("amount is not defined"));
  check(
    "console-no-NEW-pageerrors",
    otherPageerrors.length === 0,
    `${otherPageerrors.length} non-baseline pageerrors (${amountErrors} amount-not-defined are pre-existing/flagged)`
  );
} catch (e) {
  log(`FATAL: ${e.message}`);
  findings.push({ step: "fatal", ok: false, detail: e.stack });
} finally {
  await writeFile(
    "./shots-closure/findings.json",
    JSON.stringify({ findings, errors }, null, 2)
  );
  await browser.close();
}

// ── Summary ────────────────────────────────────────────────────────────────
const passed = findings.filter((f) => f.ok).length;
const total = findings.length;
console.log(`\n═══ FUNNEL-RESET CLOSURE QA ═══`);
console.log(`${passed}/${total} checks passed`);
console.log(`Pageerrors: ${errors.filter((e) => e.type === "pageerror").length}`);
process.exit(passed === total ? 0 : 1);
