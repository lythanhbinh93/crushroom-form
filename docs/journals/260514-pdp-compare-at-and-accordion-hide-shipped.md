# 2026-05-14 — PDP compare-at sticky ATC + accordion hide toggle shipped

## Shipped
Two surgical PDP wins from this afternoon's brainstorm, both surfaced into a 2-phase plan and executed back-to-back. Total wall time ~40 min including commit.

**Phase 01 — Compare-at on mobile sticky ATC.** When `variant.compare_at_price > variant.price`, the sticky bar now shows the struck-through compare-at alongside the current price. `syncVariant()` toggles `[data-sticky-atc-compare]`'s `hidden` attribute on every variant change so non-sale variants don't leave stale strike-through. CSS hides the compare value on viewports <380px to keep the bar uncramped on iPhone SE.

**Phase 02 — Accordion hide toggle.** Per-block `hidden` checkbox setting in `dopamiles-product-hero`'s accordion block schema; render loop guards on `block.settings.hidden != true` so hidden tabs skip render entirely (DOM-absent, not CSS-hidden). Merchant can hide a tab without losing its content — soft hide, not delete.

## What worked
- Plan-first paid off again: brainstorm → 2-phase plan → execute. Zero discovery during code (the phase docs flagged that `syncVariant()` actually lives in `dopamiles-pdp-variant-sync.js` post-Phase-06 extraction, not inline as the brainstorm had written down).
- Server-render the compare-at element with conditional `hidden` attribute means JS finds it on first paint and toggles cheaply — no `if (!stickyCompare) compareEl = build(...)` insertion paths to maintain.
- Theme check baseline (11/38) preserved on first commit; no validation surprises.

## Watch on next iteration
- Variants with `compare_at_price < price` (rare, but Shopify won't stop a merchant from setting it backwards) — the `> price` guard handles it correctly (compare hides), but worth a thought if PDP price-tag rendering ever changes.
- 320px viewport (iPhone 5/SE 1st-gen) — `.ms-compare` hides via `@media (max-width: 380px)`. If we ever expand the sticky bar's other content, that breakpoint may need revisiting.

## Next
Manual spot-check on preview 158279991548:
- PDP with `compare_at_price` set + 2+ variants → confirm compare-at visible, updates on variant flip, hides for non-sale variants
- Toggle accordion `hidden: true` in Theme Editor → confirm tab vanishes from DOM (DevTools check)
- No JS console errors during variant switches

Plan complete. No follow-up phases — deferred items (story-by-collection, bundle 1/2-state UX) remain parked per brainstorm rationale.
