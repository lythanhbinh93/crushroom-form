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
