---
phase: 1
title: "Baseline and Diagnosis"
status: completed
completedAt: 2026-05-18T12:25Z
priority: P1
effort: "2-3h"
actualEffortMin: 60
dependencies: []
output: reports/baseline-report.md
verdict: PHASE_02_NEEDED (median 85/71/71 — all below 90 gate)
nextLever: L1 (preload + fetchpriority=high on PDP hero image)
---

# Phase 1: Baseline and Diagnosis

## Overview

<!-- Updated: Validation Session 1 — reviews-app blocker + auto-pick edge PDP -->

Establish median-of-3 mobile Lighthouse baseline on 3 representative PDPs against the current preview theme. Capture Chrome trace for top-3 longest tasks. Produce a ranked bottleneck list that drives P2 fix selection. **No code changes in this phase.**

**Hard prerequisite (validation-locked 2026-05-18):** Real reviews app (Judge.me / Loox / Yotpo) MUST be installed and active on the preview theme before P1 runs. Measuring against `dopamiles-reviews-placeholder` invalidates the baseline since reviews-app scripts will materially change the trace.

## Requirements

- **Functional:**
  - Run mobile Lighthouse 3 times per PDP; emit median scores + per-category metrics (perf, LCP, CLS, TBT, FCP, TTI, Speed Index).
  - Capture Chrome trace per PDP for the longest tasks (top 3) and longest network requests (top 5).
  - Identify LCP element, CLS sources, render-blocking resources on each PDP.
  - Output `baseline-report.md` with ranked bottleneck list.
- **Non-functional:**
  - Preview theme only — no live theme touched.
  - Throttling: Lighthouse mobile preset (3G, 4× CPU). No "desktop" runs.
  - 3 PDPs reflect realistic merchandising: lead, mid, edge (many variants).

## Architecture

### Tool extension

Extend `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/perf-probe-feature-variant.mjs`. New script: `qa/lighthouse-baseline.mjs` in this plan dir's `qa/` subfolder.

Stack:
- `lighthouse` npm package — programmatic mobile run.
- `puppeteer` (already a transitive dep via Playwright in qa pipeline) for trace capture and consistent Chromium launch.
- Reuse existing preview-theme URL pattern from `perf-probe-feature-variant.mjs` (`?preview_theme_id=...`).

### Measurement protocol

For each of 3 PDPs:
1. Cold launch headless Chromium with Lighthouse mobile config.
2. Navigate, wait for Lighthouse to finish, record JSON report.
3. Repeat 3×, take median of `categories.performance.score`.
4. From the median run, extract:
   - LCP element selector + size + url
   - CLS top contributors (`layoutShifts`)
   - Top-3 longest tasks (>= 50ms) from trace
   - Top-5 render-blocking resources
   - Total bytes (CSS, JS, fonts, images) per resource type
5. Emit one JSON per PDP + one consolidated `baseline-report.md`.

### PDP selection

| Slot | Handle (proposed) | Why |
|---|---|---|
| Lead | `a-new-chapter-begins` | Hero designs, default merchandising |
| Mid | `this-is-a-5k-right-t-shirt` | Multi-color, media-order resolution path |
| Edge | Auto-picked at P1 runtime — product with max `variants.count` in store | Stress test for color picker + variant JSON size |

Edge PDP selection (validation-locked 2026-05-18): script queries Shopify admin for the product with max `variants.count` and uses it. Document the chosen handle + selection criteria in `baseline-report.md`. No upfront user pick required.

## Related Code Files

- **Create:** `plans/260518-1833-pdp-lighthouse-perf-pareto/qa/lighthouse-baseline.mjs`
- **Create:** `plans/260518-1833-pdp-lighthouse-perf-pareto/qa/lib/lighthouse-runner.mjs` (Lighthouse + Puppeteer wrapper)
- **Create:** `plans/260518-1833-pdp-lighthouse-perf-pareto/qa/lib/median.mjs` (median selection across N runs)
- **Create:** `plans/260518-1833-pdp-lighthouse-perf-pareto/baseline-report.md`
- **Create:** `plans/260518-1833-pdp-lighthouse-perf-pareto/baseline-raw/{pdp-handle}-run-{1,2,3}.json` (per-run artifacts)
- **Read for context:** `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/perf-probe-feature-variant.mjs` (preview URL pattern + Chromium launch flags)
- **Read for context:** `D:\github local\pod-tee-theme\templates\product.json` (8 sections that render on PDP)
- **No modify:** No theme files modified in P1.

## Implementation Steps

0. **Gate:** Confirm reviews app is installed + active on preview theme. If not: STOP. Plan stays blocked. Notify user.
1. Auto-pick edge PDP: query Shopify admin for product with max `variants.count`. Record handle + count in baseline report.
2. Confirm Globo + media-order regression suite location and that it currently passes — record baseline pass count to compare against after P2/P3.
3. Install `lighthouse` npm package in the qa pipeline `package.json` (verify version compat with bundled Chromium).
4. Implement `lib/lighthouse-runner.mjs`:
   - Function `runLighthouseMobile(url, opts)` returns full LHR JSON.
   - Mobile config: `formFactor: 'mobile'`, default screen emulation, 3G throttling.
   - Skip `pwa` category (irrelevant), focus on `performance`.
5. Implement `lib/median.mjs`:
   - Take array of LHR JSONs, return the run whose perf score is the median.
6. Implement `lighthouse-baseline.mjs`:
   - Iterate 3 PDPs × 3 runs.
   - Persist raw JSON per run to `baseline-raw/`.
   - Compute median per PDP.
   - Extract LCP element, CLS shifts, longest tasks, render-blocking resources from each median run.
   - Aggregate bytes per resource type (`script`, `stylesheet`, `image`, `font`, `other`).
7. Generate `baseline-report.md` with:
   - **Per-PDP table:** median perf score + LCP / CLS / TBT / FCP / SI / TTI.
   - **LCP analysis:** element selector, image URL (if any), measured size, network timing.
   - **CLS analysis:** top contributors + element selectors.
   - **Bottleneck rank:** ordered list of the highest-impact fix candidates, each tagged with which "tactical lever" from brainstorm §6 maps to it.
   - **Verdict:** "already >=90" OR "P2 target: {lever-name}".
8. If verdict is "already >=90 on EVERY PDP individually" (strict), record this in baseline report and propose jumping straight to Phase 04.

## Success Criteria

- [ ] Reviews-app gate confirmed: real reviews app live on preview theme before any measurement.
- [ ] Edge PDP auto-picked + handle recorded in baseline-report.md with selection criteria.
- [ ] `qa/lighthouse-baseline.mjs` runs 3 PDPs × 3 runs end-to-end without manual intervention.
- [ ] Per-PDP median perf score recorded (one median per PDP, NOT median-of-medians).
- [ ] `baseline-report.md` written with LCP element, CLS sources, top tasks, top render-blocking resources per PDP.
- [ ] Ranked bottleneck list with mapping to brainstorm tactical levers (LCP / CLS / main-thread / CSS bundle / font subset / JS audit).
- [ ] Halt verdict explicit: "already >=90 on EVERY PDP" (auto-cancel P2/P3, jump to P4) OR "P2 target: {specific lever}".
- [ ] Regression baseline recorded for Globo + media-order tests so post-fix runs can diff.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Lighthouse single-run variance reads as "fixed" or "broken" | Mandatory median-of-3; reject single-run claims |
| `lighthouse` npm package version mismatch with bundled Chromium | Pin to a Lighthouse version matching Puppeteer's Chromium; document version in baseline report |
| 3rd-party scripts (Klaviyo, FB Pixel, Globo) dominate trace | P1 acknowledges; bottleneck list separates "theme-owned" vs "merchant-installed" with merchant items flagged for escalation, not fix |
| Edge PDP selection wrong (no variant-heavy product exists) | Document choice rationale; user can override in step 1 |
| Network noise during run (3G throttling is simulated but DNS / TLS handshake differs cold vs warm) | Take 3 runs; median absorbs warm-up artifact |

## Open questions

- ~~Edge PDP handle — confirm with user before run.~~ **Resolved 2026-05-18:** auto-pick at runtime by max `variants.count`.
- ~~`dopamiles-reviews-placeholder` replacement timing.~~ **Resolved 2026-05-18:** reviews app installs BEFORE publish; this plan blocks on reviews-app install (see plan.md `blockedBy: [reviews-app-install]`).
