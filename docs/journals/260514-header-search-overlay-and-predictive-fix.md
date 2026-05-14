# Header Search Overlay & Predictive Dropdown Bug Hunt

**Date**: 2026-05-14 20:53
**Severity**: High
**Component**: pod-tee-theme header-search UX + predictive-search integration
**Status**: Shipped

## What Happened

A "P3 surgical CSS pass" plan aimed to fix three micro-defects on the header search toggle (WebKit ×, browser submit button, redundant magnifiers). Became a complete refactor of search UX spanning two plan directories, 8+ debugger agents, 1 brainstormer, 5 files, and 4 latent bugs in months-old code.

## The Brutal Truth

This is what happens when a "small CSS fix" plan meets real user feedback: the original scope was dead wrong. The user didn't want pixel tweaks—they wanted a full-width overlay pattern. And buried under the "working" implementation were multiple critical bugs that only surfaced when the UI actually got used. The iteration count (~8) far exceeded the "1 pass max" halt rule. Spent energy ≠ wasted, but the planning was divorced from actual requirements.

## Technical Details

1. **JS race bug** (pre-existing): Outside-click handler used `e.target !== searchToggle` equality. Clicks on inner SVG made `e.target` the SVG element, not button. Toggle opened search; document handler closed it immediately (visible as open-flash). Fixed with `.contains()` check.

2. **Selector shadowing bug**: `injectPanel()` used `.shopify-section-group-header-group` to anchor predictive dropdown. In DOM, this class matched the promo-bar section *first*, anchoring panel to wrong parent. One-line fix: add `:not(.promo)` pseudo-selector.

3. **`formatMoney()` division error**: Vendor API `/search/suggest.json` returns dollars; function divided by 100 (assumed cents input). Rendered prices as $0.25 for $25 products. Parameter name was misleading—invite for this kind of bug.

4. **Vendor data leak**: Printify products were leaking into search results due to unfiltered product source in predictive-search component.

## What We Tried

- Path A: Suppress CSS visibility (rejected—didn't address UX)
- Brainstormed 5 paths for predictive redesign; Path D (debug-first, then Dawn pattern) was recommended
- Debug revealed selector shadowing was root cause, not CSS
- Iterated through: hidden toggle → visible toggle + pill + overlay → full-width overlay
- 6 polish passes for padding, dividers, labels, empty states, touch behavior, pill styling

## Root Cause Analysis

The original plan scope was misaligned. "CSS defects" framing missed that the user wanted a fundamentally different UX pattern. The bugs (race condition, selector shadowing, formatMoney division) lived in "shipped" code because they required *actual usage* to surface—local testing and smoke checks didn't trigger the click paths or search.json paths that exposed them.

Misleading parameter names (`formatMoney(cents)` when API returns dollars) are timebombs. The original dev either made an assumption that drifted from reality or the API changed without code update.

## Lessons Learned

- When a "micro-fix" plan needs 8 iterations, re-plan. The shape is wrong.
- Brainstormer's "premise check" before listing solutions is high-leverage—avoided 2h of CSS suppression work.
- Shopify selector-as-JS-selector pitfall: theme CSS class names are tempting hooks but fragile in DOM order.
- Test against real product data. Mock permissiveness hides correctness bugs (vendor leak, formatMoney division).
- "Shipped" code is not "tested code"—ship requires user interaction paths, not just compile + baseline checks.

## Next Steps

- Backfill unit test for `formatMoney()` with dollars input
- Audit other selector-based DOM queries in header.js for similar shadowing risks
- Document `formatMoney()` parameter expectation (dollars, not cents)
- Monitor vendor product filtering in search after live deployment

---

**Files touched**: pod-tee-theme (`dopamiles-header.{liquid,css,js}`, `dopamiles-search.{js,css}`); crushroom-form plans + reports.
**Commits**: pod-tee-theme 7dbbc58; crushroom-form a218ed2.

**Status**: DONE
