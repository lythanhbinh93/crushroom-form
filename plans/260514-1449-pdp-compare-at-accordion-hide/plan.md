---
title: "PDP Enhancements — Compare-at Sticky ATC + Accordion Hide Toggle"
description: "Two small PDP wins surfaced in 2026-05-14 brainstorm: render compare-at price on the mobile sticky ATC bar with JS variant sync, and add a per-block `hidden` checkbox to accordion blocks so merchants can hide individual detail tabs without deleting them."
status: shipped
priority: P2
effort: ~45 min total
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: []
blocks: []
related:
  - brainstorm: plans/reports/brainstorm-260514-1449-pdp-features.md
  - parent-pdp: plans/260506-2236-pod-tee-product-page (PDP template — shipped)
  - qa-pipeline: plans/260514-1230-pod-tee-publish-and-js-fixes/qa
tags: [shopify, theme, pod-tee, dopamiles, pdp, conversion]
created: 2026-05-14
---

# PDP Enhancements — Compare-at Sticky ATC + Accordion Hide

## Goal
Two surgical PDP improvements. Both extend existing sections, no new files.

1. **Compare-at sticky ATC** — show struck-through compare-at price next to current price on `dopamiles-mobile-sticky-atc`. JS keeps it in sync as user picks variants. Conversion impact: mobile users see the savings at the moment of ATC decision.

2. **Accordion hide toggle** — add `hidden` checkbox to the `accordion` block schema in `dopamiles-product-hero`. Liquid render loop skips when `hidden == true`. Merchant ergonomics: hide tabs without losing their content (vs. deleting the block).

## Out of scope (from brainstorm)
- Story line dynamics by collection/tag — DEFERRED (optional; revisit when brand needs niche-specific PDP storytelling)
- Bundle 1/2-product UX — BLOCKED on wiring the actual bundle discount via Shopify Function

## Phases

| # | Phase | Effort | Gate |
|---|---|---|---|
| 01 | [Compare-at sticky ATC](phase-01-compare-at-sticky-atc.md) | ~30 min | ✅ Shipped to preview 158279991548 — awaiting manual spot-check |
| 02 | [Accordion hide toggle](phase-02-accordion-hide-toggle.md) | ~15 min | ✅ Shipped to preview 158279991548 — awaiting manual spot-check |

## Definition of done
- `dopamiles-mobile-sticky-atc.liquid` shows compare-at price when `variant.compare_at_price > variant.price`
- Variant change updates BOTH price and compare-at in the sticky bar (no flicker, no stale state)
- Accordion block schema includes `hidden` checkbox (default false)
- Setting `hidden: true` on any accordion block omits it from PDP render
- `shopify theme check` 11 errors / 38 warnings (zero new vs current baseline)
- Manual verification on preview theme 158279991548

## QA strategy
Manual spot-check is sufficient for this scope. The QA pipeline at `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/` doesn't have PDP assertions yet; building one for 30 min of work is overkill. If regressions accumulate later, extend the QA pipeline with `phase-pdp.mjs`.

Spot-check checklist (run on a PDP with `compare_at_price` set + 2+ variants):
- [ ] Compare-at visible on sticky ATC (strike-through, accent color)
- [ ] Variant change updates both prices (no JS errors in console)
- [ ] On variants WITHOUT compare-at: compare-at hidden gracefully
- [ ] Accordion `hidden: true` block: not rendered (DOM check via DevTools)
- [ ] Accordion `hidden: false` block: rendered as before

## Halt rule
1 iteration max per phase. P0 failure (theme check breaks, JS errors, render breaks) → snapshot + halt + report BLOCKED.

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Sticky ATC layout cramped on narrow viewports | Low | CSS media query `<380px` hides `.ms-compare` if needed |
| JS variant sync doesn't trigger compare-at update | Low | Match the existing `data-sticky-atc-price` pattern exactly; reuse `syncVariant()` |
| Accordion `hidden` setting collides with existing block IDs | Low | Setting `id: "hidden"` is new — no schema collision |
| Hidden accordion still loads its content into DOM (just visually hidden) | Low | Use Liquid `{% unless %}` to skip render entirely, not CSS `display:none` |

## Security
No user-input handling. All settings merchant-controlled via Admin. No new HTML attributes that could carry XSS.

## Next steps after ship
- Hand off to QA via manual preview check (no automated QA addition for this scope)
- Track conversion impact informally (sticky ATC compare-at is the conversion-relevant change)
- Revisit story-by-collection feature if brand requests it
- When bundle discount wiring lands, revisit bundle 1/2-state UX
