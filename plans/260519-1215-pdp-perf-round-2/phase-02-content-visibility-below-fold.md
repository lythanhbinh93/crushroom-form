---
phase: 2
title: "Content-Visibility on Below-Fold Sections"
status: completed
completedAt: 2026-05-19T05:50Z
priority: P1
effort: "30-40min"
actualEffortMin: 25
dependencies: [1]
themeCommit: e4ea6d2 (pod-tee-theme feat/pdp-perf-pareto)
output: reports/p2-after-report.md
probeOutput: reports/section-heights-probe.json
verdict: HALT_GATE_CLEARED (5-run median 91/91/92 — Phase 3 auto-cancelled)
---

# Phase 2: Content-Visibility on Below-Fold Sections

## Overview

Six below-fold PDP sections (fbt, niche-favorites, reasons, more-from-niche, reviews-placeholder, faqs) currently paint up-front. Applying `content-visibility: auto` opts those wrappers out of rendering until they scroll near the viewport, freeing TBT and paint time.

Targeted via Shopify section-ID prefix selectors on the OUTER `<div id="shopify-section-template--XXX__SECTION">` — additive on the Shopify wrapper, NO existing CSS targets that wrapper (verified via grep of `dopamiles-*.css`). Zero override risk.

## Requirements

- **Functional:**
  - Apply `content-visibility: auto` + `contain-intrinsic-size` to the 6 below-fold section wrappers in `assets/dopamiles-pdp.css`.
  - `contain-intrinsic-size` height MUST come from real measurements (Playwright probe), not guess.
  - Do NOT apply to `dopamiles-product-hero` (above the fold) or `dopamiles-mobile-sticky-atc` (fixed-position).
- **Non-functional:**
  - CSS-only change. No JS, no Liquid edits.
  - Push only `assets/dopamiles-pdp.css` to preview.
  - 5-run baseline + regression suite after deploy.
  - Halt rule: if every-PDP median ≥ 90, skip Phase 3.

## Architecture

### Targeting strategy

Shopify wraps each section in `<div id="shopify-section-template--XXXXXX__SECTION-TYPE" class="shopify-section ...">`. The `__SECTION-TYPE` suffix is stable per section type. Use attribute-substring selectors:

```css
[id*="__dopamiles-fbt"],
[id*="__dopamiles-niche-favorites"],
[id*="__dopamiles-reasons"],
[id*="__dopamiles-more-from-niche"],
[id*="__dopamiles-reviews-placeholder"],
[id*="__dopamiles-faqs"] {
  content-visibility: auto;
  contain-intrinsic-size: auto 800px;
}
```

`auto 800px` semantics: until the section is rendered for the first time, the browser reserves 800px placeholder height; after first render, the browser remembers the real height and uses that on subsequent layouts.

### Pre-deploy height probe

Required before locking the placeholder height. Use Playwright (already available in the qa pipeline) to navigate to each of the 3 PDPs on the preview theme, measure each section's `boundingBox().height` on a Moto G4 viewport emulation, and emit a JSON of per-section heights. If any section is meaningfully different from 800 px (>30 %), set per-section `contain-intrinsic-size` values instead of a single global value.

Output: `plans/260519-1215-pdp-perf-round-2/reports/section-heights-probe.json`.

### Halt rule

After deploy → run `qa/lighthouse-baseline.mjs --runs=5` (use Round 1's harness; already accepts `--runs` arg) → run `perf-probe-feature-variant.mjs` regression suite. If every-PDP median ≥ 90 STRICT and regression GREEN, halt and skip Phase 3.

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css` (append the content-visibility block at the END of the file; explicit comment block explaining the why)
- **Create:** `plans/260519-1215-pdp-perf-round-2/qa/probe-section-heights.mjs` (Playwright probe; emits JSON of per-section heights from a live PDP)
- **Create:** `plans/260519-1215-pdp-perf-round-2/reports/section-heights-probe.json` (probe output)
- **Create:** `plans/260519-1215-pdp-perf-round-2/reports/p2-after-report.md` (post-deploy 5-run median + delta table + halt verdict)
- **Re-use:** `plans/260518-1833-pdp-lighthouse-perf-pareto/qa/lighthouse-baseline.mjs` (Round 1's harness — no changes)
- **Re-use:** `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/perf-probe-feature-variant.mjs` (regression suite — no changes)

## Implementation Steps

1. Write `qa/probe-section-heights.mjs`: Playwright Moto G4 emulation, navigate each of 3 PDPs (`a-new-chapter-begins`, `this-is-a-5k-right-t-shirt`, `running-its-how-i-scope`) with preview cookie, measure `boundingBox().height` for each of 6 below-fold section wrappers (selected by `[id*="__dopamiles-{slot}"]`), emit JSON.
2. Run the probe. Inspect `section-heights-probe.json`. If all sections are within 30 % of 800 px, use single global `contain-intrinsic-size: auto 800px`. If any section is markedly different (e.g. reviews-placeholder is 2000 px), assign per-section values.
3. Append the content-visibility CSS rule (or rules, if per-section) to the END of `assets/dopamiles-pdp.css`. Wrap in a comment block explaining the why (below-fold paint deferral, Shopify wrapper selector, see commit X for measurement context).
4. Commit on `feat/pdp-perf-pareto`: `perf(pdp): content-visibility on below-fold sections`.
5. Push `assets/dopamiles-pdp.css` to preview theme 158279991548 via `shopify theme push --only`.
6. Verify CSS is live via curl + grep for the new rule.
7. Run `qa/lighthouse-baseline.mjs --runs=5`. Write `reports/p2-after-report.md` with before/after 5-run medians, LCP/TBT/FCP/CLS delta table, and halt verdict.
8. Run regression suite (`perf-probe-feature-variant.mjs`). Append to after-report.
9. Decision:
   - If every-PDP median ≥ 90 STRICT and regression GREEN → mark plan `status: completed`, skip Phase 3, notify user.
   - Else → Phase 3.

## Success Criteria

- [ ] `qa/probe-section-heights.mjs` runs against live preview, emits valid JSON for all 6 sections × 3 PDPs.
- [ ] Per-section heights drive `contain-intrinsic-size` values (single global OR per-section as data dictates).
- [ ] `assets/dopamiles-pdp.css` has the content-visibility rule appended with an explanatory comment.
- [ ] Push to preview theme 158279991548 succeeds.
- [ ] Curl verification confirms CSS is live.
- [ ] 5-run baseline runs cleanly; `reports/p2-after-report.md` written.
- [ ] Regression suite: Globo aligned + media-order resolution + 0 section refetches across all 3 PDPs.
- [ ] Halt verdict explicit: "halt — strict gate met, P3 cancelled" OR "P3 required — current medians {X/Y/Z}".

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `contain-intrinsic-size` placeholder wrong → scroll-in causes a CLS jump | Probe real heights first; set per-section values if needed |
| Browser doesn't support `content-visibility` (older Safari iOS <16) | Property gracefully degrades to ignored on unsupported browsers; no visual break, just no perf gain there |
| Targeting `[id*=...]` accidentally matches non-section elements with similar IDs | Verified: only Shopify section wrappers use the `__dopamiles-*` ID convention; pattern is safe |
| Below-fold sections rendered via custom JS that depends on initial paint | None of the 6 sections have JS-on-paint dependencies (verified via grep for `getBoundingClientRect` / `offsetHeight` references); content-visibility defers paint, not JS execution |
| Globo color-swatch behaviour depends on below-fold being painted | Globo lives in `dopamiles-product-hero` (above the fold) — NOT in any of the 6 below-fold sections. Unaffected. |

## Open questions

- None pre-execution. Probe + per-section value decision handled at runtime.
