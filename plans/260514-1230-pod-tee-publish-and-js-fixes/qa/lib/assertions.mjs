/**
 * qa/lib/assertions.mjs
 * Shared assertion helpers for pod-tee block-rebuild QA pipeline.
 *
 * Ported from:
 *   plans/reports/visuals/web-testing-260513-2207-pod-tee-emulated-iphone-qa/qa-script.mjs
 *   plans/reports/visuals/web-testing-260513-2207-pod-tee-emulated-iphone-qa/qa-funnel-reset-closure.mjs
 */

/**
 * @typedef {Object} AssertionResult
 * @property {string} step  - assertion identifier
 * @property {boolean} ok   - pass/fail
 * @property {string} detail - human-readable detail
 * @property {string} [severity] - P0|P1|P2 (set by caller, defaults to P0)
 */

/**
 * Check that an SVG-icon + adjacent-text element has a rendered gap >= minGapPx.
 * Used to verify {% render %} whitespace fix (liquid whitespace strip removes
 * the space between SVG and inline text when {%- -%} is used).
 *
 * @param {import('playwright').Page} page
 * @param {string} selector - CSS selector for the container with svg + text
 * @param {string|null} expectedText - substring the textContent must contain, or null to skip
 * @param {number} [minGapPx=2] - minimum gap in pixels between svg.right and nextElement.left
 * @returns {Promise<AssertionResult>}
 */
export async function checkWhitespaceGap(page, selector, expectedText, minGapPx = 2) {
  try {
    const handle = await page.$(selector);
    if (!handle) {
      return {
        step: `whitespace-gap@${selector}`,
        ok: false,
        detail: `selector not found: ${selector}`,
      };
    }

    const text = await handle.evaluate((el) =>
      el.textContent.trim().replace(/\s+/g, " ")
    );

    const layout = await handle.evaluate((el) => {
      const svg = el.querySelector("svg");
      if (!svg) return { hasIcon: false };
      const r1 = svg.getBoundingClientRect();
      const nextEl = svg.nextElementSibling;
      const r2 = nextEl?.getBoundingClientRect();
      return {
        hasIcon: true,
        svgRight: Math.round(r1.right),
        nextLeft: r2 ? Math.round(r2.left) : null,
        gap: r2 ? Math.round(r2.left - r1.right) : null,
        textPreview: el.textContent.trim().slice(0, 80),
      };
    });

    const textOk = expectedText ? text.includes(expectedText) : true;
    const gapOk = layout.hasIcon && (layout.gap ?? 0) >= minGapPx;

    return {
      step: `whitespace-gap@${selector}`,
      ok: textOk && gapOk,
      detail: `text="${text.slice(0, 80)}" | gap=${layout.gap}px (min=${minGapPx}) | hasIcon=${layout.hasIcon}`,
    };
  } catch (e) {
    return {
      step: `whitespace-gap@${selector}`,
      ok: false,
      detail: `error: ${e.message}`,
    };
  }
}

/**
 * Verify the pod-tee theme is being served (not BuildMyPOD or another theme).
 * Checks for presence of known pod-tee selectors in the DOM.
 *
 * @param {import('playwright').Page} page
 * @param {string[]} [expectedSelectors] - override default pod-tee selector list
 * @returns {Promise<AssertionResult>}
 */
export async function verifyThemeServed(page, expectedSelectors) {
  const selectors = expectedSelectors ?? [
    ".dop-hero",
    ".dop-logo",
    '[id*="dopamiles-header"]',
    '[id*="dopamiles-footer"]',
  ];

  try {
    const matched = await page.evaluate((sels) => {
      return sels.filter((s) => !!document.querySelector(s));
    }, selectors);

    const ok = matched.length > 0;
    return {
      step: "theme-served",
      ok,
      detail: ok
        ? `pod-tee confirmed — matched: ${matched.join(", ")}`
        : `WRONG THEME — none of [${selectors.join(", ")}] found`,
    };
  } catch (e) {
    return {
      step: "theme-served",
      ok: false,
      detail: `error: ${e.message}`,
    };
  }
}

/**
 * Attach console error/warning/pageerror collectors to a page.
 * Call before navigating. Returns the live arrays — they accumulate across
 * all navigations within that page's lifetime.
 *
 * @param {import('playwright').Page} page
 * @returns {{ consoleMessages: Array, pageErrors: Array }}
 */
export function captureConsole(page) {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push({
      type: "pageerror",
      text: err.message,
      stack: err.stack,
    });
  });

  return { consoleMessages, pageErrors };
}

/**
 * Attach request-failure collector to a page.
 * Returns the live array — accumulates across navigations.
 *
 * @param {import('playwright').Page} page
 * @returns {Array<{url: string, failure: string|undefined}>}
 */
export function captureNetworkFailures(page) {
  const networkFailures = [];

  page.on("requestfailed", (req) => {
    networkFailures.push({
      url: req.url(),
      failure: req.failure()?.errorText,
    });
  });

  return networkFailures;
}

/**
 * Check that at least one selector from each section bucket is visible in the DOM.
 * Returns a per-section pass/fail map AND an overall AssertionResult.
 *
 * Usage:
 *   const sectionMap = {
 *     "home-hero": [".dop-hero", ".doh-hero"],
 *     "home-manifesto": [".dop-manifesto"],
 *   };
 *   const result = await checkSectionsPresent(page, sectionMap);
 *
 * @param {import('playwright').Page} page
 * @param {Record<string, string[]>} sectionMap - { sectionName: [selector, ...] }
 * @returns {Promise<{ result: AssertionResult, perSection: Record<string, boolean> }>}
 */
export async function checkSectionsPresent(page, sectionMap) {
  try {
    const perSection = await page.evaluate((map) => {
      const out = {};
      for (const [name, selectors] of Object.entries(map)) {
        out[name] = selectors.some((s) => !!document.querySelector(s));
      }
      return out;
    }, sectionMap);

    const missing = Object.entries(perSection)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    const allPresent = missing.length === 0;
    const sectionCount = Object.keys(sectionMap).length;
    const foundCount = sectionCount - missing.length;

    return {
      result: {
        step: "all-home-sections-present",
        ok: allPresent,
        detail: allPresent
          ? `all ${sectionCount} sections present`
          : `${foundCount}/${sectionCount} sections found — MISSING: ${missing.join(", ")}`,
      },
      perSection,
    };
  } catch (e) {
    return {
      result: {
        step: "all-home-sections-present",
        ok: false,
        detail: `error: ${e.message}`,
      },
      perSection: {},
    };
  }
}

/**
 * Measure LCP (Largest Contentful Paint) via PerformanceObserver.
 * Best-effort: navigates to the URL, waits up to maxWaitMs for LCP to fire,
 * then reads the last observed LCP entry. Returns null if unsupported or timed out.
 *
 * NOTE: This is a P1 informational metric — treat result as best-effort.
 * LCP PerformanceObserver fires after the largest element is painted.
 * On Chromium it is reliable; on WebKit it may fire late or not at all.
 *
 * @param {import('playwright').Page} page - must already be on the target URL
 * @param {number} [maxWaitMs=5000]
 * @returns {Promise<number|null>} LCP in milliseconds or null
 */
export async function measureLcp(page, maxWaitMs = 5000) {
  try {
    const lcp = await page.evaluate((waitMs) => {
      return new Promise((resolve) => {
        // If already have navigation entries, check paint timing
        const entries = performance.getEntriesByType("largest-contentful-paint");
        if (entries.length > 0) {
          resolve(entries[entries.length - 1].startTime);
          return;
        }
        // Wait for LCP observer to fire
        let resolved = false;
        const observer = new PerformanceObserver((list) => {
          const e = list.getEntries();
          if (e.length > 0 && !resolved) {
            resolved = true;
            observer.disconnect();
            resolve(e[e.length - 1].startTime);
          }
        });
        try {
          observer.observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          resolve(null);
          return;
        }
        setTimeout(() => {
          if (!resolved) {
            observer.disconnect();
            resolve(null);
          }
        }, waitMs);
      });
    }, maxWaitMs);
    return typeof lcp === "number" ? Math.round(lcp) : null;
  } catch {
    return null;
  }
}

/**
 * Measure CLS (Cumulative Layout Shift) via PerformanceObserver.
 * Reads buffered layout-shift entries already recorded during navigation.
 * Returns 0 if API unsupported.
 *
 * @param {import('playwright').Page} page - must already be on the target URL
 * @returns {Promise<number>} CLS score (sum of layout-shift values)
 */
export async function measureCls(page) {
  try {
    const cls = await page.evaluate(() => {
      const entries = performance.getEntriesByType("layout-shift");
      if (!entries.length) return 0;
      return entries.reduce((sum, e) => sum + (e.value ?? 0), 0);
    });
    return typeof cls === "number" ? Math.round(cls * 1000) / 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Check that a hero element has a minimum rendered height.
 * Used to confirm the hero rendered (not collapsed / display:none).
 *
 * @param {import('playwright').Page} page
 * @param {string} selector - CSS selector for the hero element
 * @param {number} [minHeightPx=100]
 * @returns {Promise<AssertionResult>}
 */
export async function checkHeroHeight(page, selector, minHeightPx = 100) {
  try {
    const height = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().height : -1;
    }, selector);

    if (height === -1) {
      return {
        step: `hero-height@${selector}`,
        ok: false,
        detail: `selector not found: ${selector}`,
      };
    }

    return {
      step: `hero-height@${selector}`,
      ok: height >= minHeightPx,
      detail: `height=${Math.round(height)}px (min=${minHeightPx}px)`,
    };
  } catch (e) {
    return {
      step: `hero-height@${selector}`,
      ok: false,
      detail: `error: ${e.message}`,
    };
  }
}
