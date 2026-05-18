---
title: PDP Feature Variant Default — Globo Swatch Alignment
description: >-
  PDP lands on wrong color on every multi-option product because Globo Color
  Swatches overrides Shopify's `selected_or_first_available_variant`. Add a
  theme-side intercept that selects the Globo swatch matching the
  server-resolved feature color on init.
status: completed
completed: 2026-05-18
priority: P1
effort: ~75 min
repo: 'D:\github local\pod-tee-theme'
branch: feat/bug-fix-sprint
blockedBy: []
blocks:
  - 260514-1230-pod-tee-publish-and-js-fixes
related:
  - brainstorm: plans/reports/brainstorm-260518-1230-pdp-feature-variant-default.md
  - parent-sprint: plans/260509-1057-pod-tee-bug-fix-round-2/plan.md
  - publish-gate: plans/260514-1230-pod-tee-publish-and-js-fixes/plan.md
  - hero-section: 'D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid'
  - variant-sync-js: 'D:\github local\pod-tee-theme\assets\dopamiles-pdp-variant-sync.js'
tags:
  - shopify
  - theme
  - pod-tee
  - dopamiles
  - pdp
  - variant-sync
  - globo
  - bug-fix
created: 2026-05-18T00:00:00.000Z
---

# PDP Feature Variant Default — Globo Swatch Alignment

## Goal

On every PDP, the Globo color swatch highlighted on initial load must match `product.selected_or_first_available_variant` (the server-resolved feature variant). Drag-and-drop variant reorder in Shopify admin becomes the merchant's single source of truth for the default color on PDP.

## Root cause (from brainstorm)

Dawn's native `<variant-selects>` is hidden via CSS; Globo's swatches are the visible picker. Globo's default-selection logic ignores Shopify variant order, so even when Liquid resolves the correct feature variant, Globo highlights (and may programmatically select) a different color.

## Approach (locked in brainstorm)

Theme-side JS intercept inside the existing Globo `MutationObserver` block. Server emits the feature color name in a `data-dop-preferred-color` attribute; JS finds the matching Globo swatch and selects it once per init.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Debug Globo DOM](./phase-01-debug-globo-dom.md) | Skipped (user chose to proceed with reasonable defaults; selectors discovered ad-hoc during Phase 03 testing) | ~15 min |
| 2 | [Implement Alignment](./phase-02-implement-alignment.md) | Completed | ~30 min |
| 3 | [QA + Ship](./phase-03-qa-ship.md) | Completed (Playwright; iPhone manual deferred to parent-sprint Gate 3) | ~30 min |

## Dependencies

- **Blocks** `260514-1230-pod-tee-publish-and-js-fixes` — live theme swap must not happen until this is GREEN, otherwise the wrong color ships on every PDP.
- **Parent sprint** `260509-1057-pod-tee-bug-fix-round-2` — this is the round-5 micro-fix the parent sprint anticipated on the `feat/bug-fix-sprint` branch.

## Success criteria (plan-level)

- [ ] On every multi-option PDP, Globo swatch highlighted on load matches `selected_or_first_available_variant.options[0]`
- [ ] Price block, gallery hero image, and ATC button state all reflect the feature variant on initial load
- [ ] User-initiated swatch taps still update variant + price + image + ATC normally (no regression)
- [ ] iPhone Safari real-device pass: feature color highlighted on PDP load before any user interaction
- [ ] Zero new console errors / pageerrors
- [ ] Existing Globo coexistence logic (lines 322-342 of variant-sync.js) unchanged in behavior

## Out of scope

- Dropping Globo entirely (deferred — see brainstorm Approach B)
- Metafield-driven per-product variant overrides (rejected — see brainstorm Approach C)
- Other 14 files using `selected_or_first_available_variant` (cart, FBT, cards) — PDP scope only
- Defaulting a specific size (only color is in scope)

## Unresolved questions

- Globo's "selected swatch" selector + click API surface — answered by Phase 01 debug step.
- Whether Globo dispatches its own change event after our click — observe in Phase 01.
