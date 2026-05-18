---
phase: 1
title: "Debug Globo DOM"
status: pending
priority: P1
effort: "~15 min"
dependencies: []
---

# Phase 1: Debug Globo DOM

## Overview

Inspect Globo's live runtime DOM on preview theme 158279991548 to capture the exact selectors, attributes, and click behavior needed by Phase 02's alignment logic. Avoid guessing — assumptions about Globo's internals are the main risk for Phase 02.

## Requirements

- **Functional:** Capture Globo swatch markup snapshot, selected-state indicator, click-event responsiveness, and post-click DOM mutations.
- **Non-functional:** No code changes shipped from this phase — debug only.

## Architecture

Single-shot Node + Playwright script run from `pod-tee-theme/qa/` against preview URL. Reuses Playwright infra already present in `qa/phase-01.mjs`.

## Related Code Files

- **Create:** `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/debug-globo-default-color.mjs` (in crushroom-form — that's where the qa pipeline lives, relocated from the cancelled block-driven rebuild plan)
- **Read for context:** `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/debug-globo-state.mjs` (existing Globo debug script)
- **Output report:** `plans/260518-1300-pdp-feature-variant-default/reports/debug-globo-default-color-260518.md`
- **Read for context:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp-variant-sync.js:322-342` (existing Globo MutationObserver block)

## Implementation Steps

1. Read the existing `qa/debug-globo-state.mjs` to mirror its Playwright setup pattern (browser launch, preview-theme URL, page.goto).
2. Create `qa/debug-globo-default-color.mjs` that:
   - Navigates to a multi-option PDP on preview theme 158279991548 (e.g. `/products/5k-route-t-shirt?preview_theme_id=158279991548`)
   - Waits for `.globo-swatch-product-detail` to render visible (already covered by existing wait pattern)
   - Dumps for each Globo swatch element: tag, classes, `data-*` attributes, `aria-*` attributes, text content, computed `aria-pressed` / `aria-checked` state
   - Identifies the swatch currently marked "selected" by Globo on load
   - Reads `product.selected_or_first_available_variant.options[0]` (the expected color) by parsing `[data-dop-variants-json]` + DOM (or hardcode the expected value for the test product based on Shopify admin order)
   - Reports: does Globo's selected swatch match expected? If not, by what (name? index?)
   - Trigger a `.click()` on a non-selected Globo swatch programmatically, then poll for 500ms and report which DOM mutations Globo fires (class changes, attribute changes on selected swatch, change events on Dawn radios)
3. Run on 2 different PDPs to confirm the pattern is consistent.
4. Capture findings in `qa/reports/debug-globo-default-color-260518.md` (or inline in the script's console output, captured into the report). Include:
   - Exact selector for "selected" state (e.g. `.globo-swatch--active`, `[aria-pressed="true"]`, `[data-selected="true"]`)
   - Whether a programmatic `.click()` triggers Globo's full state update (visual + change event)
   - The attribute that holds the color name on each swatch (e.g. `data-value`, `title`, text content)
   - Any race condition observed (Globo swapping DOM after click)

## Todo List

- [ ] Read `qa/debug-globo-state.mjs` for setup pattern
- [ ] Write `qa/debug-globo-default-color.mjs`
- [ ] Run against 2 PDPs on preview theme 158279991548
- [ ] Capture findings in `qa/reports/debug-globo-default-color-260518.md`
- [ ] Confirm: selected-state selector, color-name attribute, click responsiveness, post-click mutations

## Success Criteria

- [ ] Globo selected-state selector identified and documented
- [ ] Color-name attribute identified and documented (with example values)
- [ ] Click behavior confirmed (does `.click()` fire full Globo state update?)
- [ ] Post-click DOM mutation pattern documented (to inform the `dopGloboAligned` guard timing)
- [ ] At least 2 PDPs verified showing the same pattern

## Risk Assessment

- **Globo behavior differs between products** → run on 2+ products to surface inconsistency.
- **Globo lazy-loads its swatches** → existing variant-sync.js already handles this with a 5s MutationObserver; reuse the same wait.
- **Preview theme has stale Globo config** → not a risk; preview reads live Globo app data.

## Notes

This phase ships nothing user-visible. Its output is debug findings that unblock Phase 02. Total cost ~15 min. Skip only if a previous debug script already captured the same data (check `qa/reports/` first).
