# Phase 01 Part B — QA Pipeline Foundation
**Date:** 2026-05-14  
**Plan:** 260513-2248-pod-tee-block-driven-theme-rebuild  
**Branch:** claude/add-photo-upload-tool-p3dI0  
**Status:** DONE_WITH_CONCERNS

---

## Files Created

| File | LOC | Notes |
|---|---|---|
| `qa/package.json` | 10 | playwright 1.60.0, ESM module |
| `qa/.gitignore` | 4 | node_modules, package-lock.json, shots/, reports/*.md |
| `qa/lib/viewports.mjs` | 52 | 4 viewport configs (iPhone14 ×2, SE, Desktop) + exports |
| `qa/lib/preview.mjs` | 92 | launchBrowser, previewUrl, withPreviewCookie, getProductHandle, getVariantId |
| `qa/lib/assertions.mjs` | 120 | checkWhitespaceGap, verifyThemeServed, captureConsole, captureNetworkFailures |
| `qa/lib/report.mjs` | 108 | writeReport, printSummary, exitCode, datestamp |
| `qa/phase-01.mjs` | 182 | Phase 01 suite — all 4 viewports, P0/P1/P2 assertions |
| `qa/README.md` | 102 | How-to-run, severity tiers, baseline table, file map |

All lib files ≤200 LOC. All `.mjs` (ESM). No deps beyond playwright.

---

## node qa/phase-01.mjs — Final Run

**Exit code: 0**  
**Results: 29/29 passed | P0 failures: 0 | P1 flags: 0**  
**Report:** `qa/reports/phase-01-20260514-0957.md`

```
✓ [P0] preview-url-200            — all 4 viewports: HTTP 200
✓ [P0] server-timing-theme-id     — all 4: exact match theme;desc="158279991548"
✓ [P0] theme-served               — all 4: .dop-logo matched
✓ [P0] zero-new-pageerrors        — all 4: 0 new errors (baseline ignored)
✓ [P0] webkit-no-crash            — WebKit completed without crash
✓ [P1] console-baseline           — all 4: baseline numbers recorded (no threshold yet)
✓ [P2] screenshot-home            — 4 × shots/{viewport}/01-home.png saved
✓ [P2] network-failures           — informational log
✓ [P2] desktop-layout-note        — hero 1178×2133px recorded
```

---

## Baseline Numbers Captured

| Viewport | pageerrors (baseline) | console errors | warnings | net failures |
|---|---|---|---|---|
| iphone14-chromium | 3 (all baseline) | 3 | 1 | 8 (0 non-analytics) |
| iphone14-webkit | 2 (all baseline) | 3 | 0 | 0 |
| iphonese-chromium | 3 (all baseline) | 3 | 4 | 8 (0 non-analytics) |
| desktop-1280-chromium | 1 (all baseline) | 1 | 0 | 3 (1 non-analytics) |

---

## WebKit Install — Confirmed

WebKit 26.4 (playwright webkit v2287) installed successfully on Windows 11 via `npx playwright install webkit`.  
Download: `webkit-win64.zip` from Playwright CDN → `%LOCALAPPDATA%\ms-playwright\webkit-2287`.  
WebKit-mobile P0 assertion passed: navigated home + collection + PDP without crash.

---

## One Fix Required During Run (DONE_WITH_CONCERNS)

**Issue:** First run exited 1. WebKit's JavaScriptCore reports `"Can't find variable: amount"` for the same ReferenceError that V8/Chromium reports as `"amount is not defined"`. The baseline pattern only covered the V8 phrasing.

**Fix:** Added `"Can't find variable: amount"` to `BASELINE_PAGEERROR_PATTERNS` in `phase-01.mjs` with a comment explaining the engine difference. Second run: exit 0.

**Concern flag:** The baseline pattern is now engine-aware. Future baseline additions must be checked against both engine phrasings. Low risk but worth tracking.

---

## Patterns Ported From Funnel-Reset

- `previewUrl()` helper — matches `?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548` pattern from `qa-script.mjs`
- `verifyThemeServed()` — ported from `verifyTheme()` in `qa-script.mjs`, selectors `.dop-hero`, `.dop-logo`
- `captureConsole()` / `captureNetworkFailures()` — ported from inline event listeners in both existing scripts
- `checkWhitespaceGap()` — ported from `checkWhitespace()` in `qa-script.mjs`, parameterised with `minGapPx`
- Baseline pageerror logic — ported from `qa-funnel-reset-closure.mjs` `isBaselineError` pattern

---

## Unresolved Questions

None blocking. One concern noted above (engine-aware baseline patterns).
