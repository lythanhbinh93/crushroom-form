/**
 * qa/lib/viewports.mjs
 * Viewport definitions for pod-tee block-rebuild QA pipeline.
 *
 * Priority:
 *   P0 — blocks phase merge if any P0 assertion fails
 *   P1 — flagged but phase can proceed after user confirmation
 *
 * WebKit is used for iPhone 14 to close ~80% of Safari-only rendering gap.
 */

// iPhone 14 — Playwright built-in device emulation for "iPhone 14"
// 390×844, deviceScaleFactor=3, Safari mobile UA, touch
export const IPHONE_14_CHROMIUM = {
  id: "iphone14-chromium",
  label: "iPhone 14 — Chromium",
  priority: "P0",
  engine: "chromium",
  playwrightDevice: "iPhone 14",
};

export const IPHONE_14_WEBKIT = {
  id: "iphone14-webkit",
  label: "iPhone 14 — WebKit",
  priority: "P0",
  engine: "webkit",
  playwrightDevice: "iPhone 14",
};

// iPhone SE — smaller viewport (375×667), older form factor
export const IPHONE_SE_CHROMIUM = {
  id: "iphonese-chromium",
  label: "iPhone SE — Chromium",
  priority: "P1",
  engine: "chromium",
  playwrightDevice: "iPhone SE",
};

// Desktop — 1280×800, Chromium, standard desktop UA
export const DESKTOP_1280_CHROMIUM = {
  id: "desktop-1280-chromium",
  label: "Desktop 1280 — Chromium",
  priority: "P1",
  engine: "chromium",
  playwrightDevice: null, // no device emulation — raw viewport
  viewport: { width: 1280, height: 800 },
  userAgent: null, // use browser default
};

/** All viewports ordered by priority (P0 first, then P1) */
export const ALL_VIEWPORTS = [
  IPHONE_14_CHROMIUM,
  IPHONE_14_WEBKIT,
  IPHONE_SE_CHROMIUM,
  DESKTOP_1280_CHROMIUM,
];

/** P0 viewports only (mobile — block phase gate) */
export const P0_VIEWPORTS = ALL_VIEWPORTS.filter((v) => v.priority === "P0");

/** P1 viewports only (flag but do not fail) */
export const P1_VIEWPORTS = ALL_VIEWPORTS.filter((v) => v.priority === "P1");
