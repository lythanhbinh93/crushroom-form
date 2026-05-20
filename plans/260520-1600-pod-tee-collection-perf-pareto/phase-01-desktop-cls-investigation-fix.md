---
phase: 1
title: "Desktop CLS investigation + fix"
status: pending
priority: P1
effort: "1-2h"
dependencies: []
---

# Phase 1: Desktop CLS investigation + fix

## Overview

Identify the DOM element(s) causing desktop CLS = 0.449-0.453 on collection pages, then apply a minimum-blast fix (most likely an `aspect-ratio` reservation on an element that loads without a height contract). Mobile CLS is fine (0.002) — the bug is desktop-specific.

This is Priority 0 from the [Lighthouse baseline report](../260520-1547-pod-tee-collection-page-fixes/reports/lighthouse-baseline.md). Single biggest user-visible win in this plan.

## Requirements

**Functional**
- Desktop CLS on `/collections/all` drops below 0.1 (Core Web Vitals "Good").
- Mobile CLS stays at 0.002 (no regression).
- Visual UX: no perceivable "jump" of products / sections during page load on desktop.

**Non-functional**
- Surgical fix preferred — single CSS rule if possible.
- DO NOT blindly revert Phase 2 of the predecessor plan (`grid-auto-flow: dense`) because mobile has the same rule with CLS=0.002 — `dense` alone is unlikely to be the culprit.
- Identify root cause via instrumentation BEFORE applying any code change.

## Architecture

Investigation methodology (do this in order):

1. **DevTools Performance recording**:
   - Open `/collections/all` on desktop preview (theme editor or local `shopify theme dev`)
   - Open Chrome DevTools → Performance tab → Settings → check "Web Vitals" → record page load
   - Filter the trace to "Layout Shift" events
   - Click each shift → DevTools shows which DOM elements moved and by how much
   - Sum the score contributions until 0.45 is accounted for
2. **Identify culprits** — likely candidates given desktop-specific manifestation:
   - Editorial card `.doc-ad-card` (2-col span, may shift when content loads or position changes)
   - Niche bar / filter toolbar `.doc-niche-bar` / `.doc-toolbar`
   - Late-loading promo bar or sticky header
   - Web font swap causing text reflow (FOIT/FOUT)
   - Grid items shifting as images load if `aspect-ratio` is missing on a specific modifier
3. **Apply targeted fix** — most likely:
   - Add `aspect-ratio` to culprit element so it reserves height before content loads
   - OR add `min-height` if `aspect-ratio` doesn't fit
   - OR add `font-display: optional` to suppress FOUT swap
   - OR re-order elements in `theme.liquid` if the issue is render-blocking ordering

## Related Code Files

**Read (investigation)**
- `pod-tee-theme/sections/dopamiles-collection-grid.liquid` — editorial card markup, niche bar
- `pod-tee-theme/assets/dopamiles-collection.css` — all collection layout rules
- `pod-tee-theme/layout/theme.liquid` — element ordering, font loading
- `pod-tee-theme/snippets/dopamiles-tokens.liquid` — @font-face declarations

**Modify (fix — exact files TBD by investigation)**
- Likely 1-2 files. Could be a single CSS rule in `dopamiles-collection.css` or a Liquid edit.

## Implementation Steps

1. **Reproduce the CLS measurement**:
   - Start `shopify theme dev` in pod-tee-theme working dir
   - Run `npx lighthouse http://127.0.0.1:9292/collections/all --preset=desktop --output=json --output-path=./pre-fix.json --quiet`
   - Confirm CLS ≈ 0.45 (matches baseline). If significantly different, branch state drifted — investigate.

2. **DevTools Performance recording**:
   - Open `http://127.0.0.1:9292/collections/all` in Chrome
   - DevTools → Performance → Settings (gear) → check "Web Vitals" → record page load
   - Stop recording after page settles
   - In the Performance panel, find the "Experience" track → "Layout Shifts" — click each shift node
   - For each, note: shift score, affected element, what was the trigger event (image-load, font-load, DOM-insert)

3. **Hypothesis-test the editorial card first** — the `.doc-ad-card` (2-col span, only present on desktop in 4-col layout) is the prime suspect. Quick test: temporarily comment out the editorial card render in `dopamiles-collection-grid.liquid`, re-run Lighthouse, compare CLS. If CLS drops materially → editorial card is the cause.

4. **If editorial card IS the cause**: apply `aspect-ratio` or `min-height` to `.doc-ad-card` based on its rendered size. Add to `dopamiles-collection.css`.

5. **If editorial card is NOT the cause**: continue down the DevTools list — niche bar, toolbar, web fonts, image cells, etc.

6. **Apply the fix** in the smallest possible CSS/Liquid edit.

7. **Re-measure** to confirm CLS < 0.1.

8. **Manual visual check** on the preview theme — page should feel "stable" during load, no perceptible jumps.

9. **Stop dev server**.

## Success Criteria

- [ ] DevTools Performance trace captured; CLS shifting element(s) identified with file:line evidence.
- [ ] Root cause documented in this phase file (under "Investigation findings" section to add).
- [ ] Fix applied: minimum CSS/Liquid edit addressing the root cause.
- [ ] Lighthouse re-run shows desktop CLS < 0.1.
- [ ] Mobile CLS unchanged (still 0.002).
- [ ] Visual check: no perceptible layout shift during page load on desktop.
- [ ] No regression in mobile layout.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Root cause is multiple elements, not one — single-rule fix insufficient | Med | Phase extends to 2-3h | OK — find biggest contributor first, ship that, re-measure, decide if smaller shifts also need fixing |
| Fix too aggressive (e.g., `aspect-ratio` on a flex container that needs to grow) → breaks layout | Med | Visual regression | Visually verify after each rule addition; revert if breaks layout |
| Root cause is web font swap (FOUT) — fix requires font preload + swap-policy change | Low-Med | Touches `theme.liquid` (higher blast) | Standard pattern: `<link rel="preload" as="font" crossorigin>` + `font-display: optional` |
| Root cause is server-side ordering — needs Liquid section reorder | Low | Touches `theme.liquid` | Discuss with user before reorder; could affect other pages |
| DevTools Performance recording is non-deterministic on first run | Low | Need 2-3 recordings to confirm pattern | Acceptable; reproducibility check across recordings |
