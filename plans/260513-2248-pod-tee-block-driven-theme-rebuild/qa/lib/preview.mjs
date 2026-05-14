/**
 * qa/lib/preview.mjs
 * Browser launch + Shopify preview-theme helpers.
 *
 * Preview theme: 158279991548 (pod-tee on dopamiles.co)
 * Preview cookie is persisted by Shopify on first hit of the preview URL.
 * Subsequent navigation uses the session cookie — no need to keep the
 * preview_theme_id param on every URL, but we add it defensively.
 */

import { chromium, webkit, devices } from "playwright";

export const PREVIEW_THEME_ID = "158279991548";
export const STORE_ORIGIN = "https://dopamiles.co";

/**
 * Build a full preview URL for a given store path.
 * Includes Shopify preview params (_ab=0 disables A/B, _fd=0 disables redirect,
 * _sc=1 enables cookie, preview_theme_id pins the preview theme).
 * @param {string} path - store path e.g. "/" or "/products/5k-route-t-shirt"
 */
export function previewUrl(path = "/") {
  const base = `${STORE_ORIGIN}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${sep}_ab=0&_fd=0&_sc=1&preview_theme_id=${PREVIEW_THEME_ID}`;
}

/**
 * Launch a Playwright browser for the given viewport config.
 * @param {import('./viewports.mjs').ViewportConfig} viewport
 * @returns {{ browser: import('playwright').Browser, context: import('playwright').BrowserContext }}
 */
export async function launchBrowser(viewport) {
  const isWebKit = viewport.engine === "webkit";
  const launcher = isWebKit ? webkit : chromium;

  const browser = await launcher.launch({ headless: true });

  // Build context options: device emulation or raw viewport
  let contextOptions = { locale: "en-US" };

  if (viewport.playwrightDevice) {
    // Use Playwright device descriptors (sets UA, viewport, deviceScaleFactor, touch)
    const deviceDescriptor = devices[viewport.playwrightDevice];
    if (!deviceDescriptor) {
      throw new Error(
        `Unknown Playwright device: "${viewport.playwrightDevice}". ` +
          `Check https://playwright.dev/docs/emulation#devices`
      );
    }
    contextOptions = { ...contextOptions, ...deviceDescriptor };
  } else if (viewport.viewport) {
    // Desktop — raw viewport, no device emulation
    contextOptions = { ...contextOptions, viewport: viewport.viewport };
  }

  const context = await browser.newContext(contextOptions);
  return { browser, context };
}

/**
 * Navigate to the preview URL to establish the Shopify preview session cookie.
 * The cookie is scoped to .dopamiles.co and persists across page navigations
 * within the same browser context.
 * @param {import('playwright').Page} page
 * @returns {Promise<number>} HTTP status of the preview URL hit
 */
export async function withPreviewCookie(page) {
  const url = previewUrl("/");
  const response = await page.goto(url, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  return response?.status() ?? 0;
}

/**
 * Get the handle (path) of the first product linked on the current page.
 * Looks for the first <a href="/products/..."> anchor.
 * @param {import('playwright').Page} page
 * @returns {Promise<string|null>} e.g. "/products/5k-route-t-shirt" or null
 */
export async function getProductHandle(page) {
  return page.evaluate(() => {
    const a = document.querySelector('a[href^="/products/"]');
    return a ? a.getAttribute("href").split("?")[0] : null;
  });
}

/**
 * Fetch a product's first available variant ID from its .json endpoint.
 * Shopify exposes /products/{handle}.json without auth (public storefront).
 * @param {import('playwright').Page} page
 * @param {string} productJsonUrl - e.g. "https://dopamiles.co/products/5k-route-t-shirt.json"
 * @returns {Promise<number|null>} variant id or null
 */
export async function getVariantId(page, productJsonUrl) {
  try {
    const data = await page.evaluate(async (url) => {
      const r = await fetch(url);
      if (!r.ok) return null;
      return r.json();
    }, productJsonUrl);
    return data?.product?.variants?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
