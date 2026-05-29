---
phase: 3
title: "Variant-image swap and pagination dedup"
status: complete
priority: P1
effort: "4-6h"
dependencies: [2]
---

# Phase 3: Variant-image swap and pagination dedup

## Overview
Add the two hardest pieces on top of the core: (a) make the pinned card show the ad **variant's** color image by driving the card's native machinery, and (b) prevent the pinned card from duplicating when its natural page loads via infinite scroll / pagination.

## Requirements
- Functional: with `?variant=<id>`, the pinned card displays variant V's image and its link carries `?variant=V`. Pagination never yields two copies of the pinned product.
- Non-functional: prefer reusing native components over re-implementing; degrade gracefully if variant has no distinct image (size-only variant) or swap fails.

## Architecture

### Variant-image swap (mechanism chosen in Phase 1)
Primary path — drive the card's own logic so image + link update consistently:
1. Resolve mapping ad `variant=<id>` → its color option value + featured `media.id`. Use the in-DOM hooks if present (swatch `input[data-variant-id]` / `data-option-media-id`), else one cached `fetch('/products/<handle>.js', {credentials:'same-origin'})` (preview cookies) → `variants.find(id)` → option value + `featured_media.id`.
2. Trigger native swap, in order of preference (confirmed in Phase 1):
   - **a.** Find the matching swatch `input` in the card, set `checked`, dispatch the event Horizon's `SwatchesVariantPickerComponent.variantChanged` listens for → native image swap + auto link rewrite (`#handleCardVariantUrlUpdate`).
   - **b.** Else call `productCardEl.previewVariant(mediaId)` (public method, product-card.js:362) → `slideshow.select({id: mediaId})`.
   - **c.** Fallback: directly un-hide `slideshow-slide[slide-id="<mediaId>"]`, hide sibling `[variant-image]` slides, call `slideshow.select({id})`; manually set the card link `?variant=`.
3. If no media maps (size-only variant) → leave default image, still set link `?variant=` (acceptable per design).

### Pagination dedup
- Determine trigger from Phase 1: `paginated-list.js` appends pages (`grid.append(...)`) and items carry `li[data-page]`.
- After any page append, scan for `li` whose card handle == pinned handle and which is **not** the pinned node; remove the duplicate. Implement via a `MutationObserver` on the grid (childList) scoped to run only while a pin is active, or hook the same readiness used for reorder. Keep the originally-pinned node at #1.
- **Do NOT treat custom `gen-custom-collection` tiles as product duplicates** — match only by product handle from `.product-card__link`; tiles have no such link so they're naturally excluded. <!-- Updated: Validation Session 1 - tiles not dupes -->`
- Guard against fighting `paginated-list.js` scroll-restoration: only remove exact-duplicate `<li>`s, never reorder others.

## Related Code Files
- Modify: `tytkwe-qe-theme/assets/curated-pin.js` (add variant-swap + dedup)
- Reference: `tytkwe-qe-theme/assets/product-card.js:260,362,524`, `assets/paginated-list.js`
- Reference (source variant intent): `pod-tee-theme/templates/product.card.liquid`, `snippets/dopamiles-product-card.liquid:55-64`

## Implementation Steps
1. Implement variant→media/color mapping (DOM-first, `/products/<handle>.js` fallback).
2. Implement native-swap path (a) with try/catch; wire (b) and (c) fallbacks.
3. Verify link carries `?variant=` after swap (native does it for path a; set manually for b/c).
4. Implement dedup observer; activate only when a pin is set; disconnect after first stable settle if pagination not infinite.
5. Preview test: pin a product whose ad variant differs by color; confirm correct color image + link; scroll to trigger pagination; confirm no duplicate.

## Success Criteria
- [ ] Pinned card shows the ad variant's color image (or default if variant shares image).
- [ ] Pinned card link includes `?variant=<id>`.
- [ ] Scrolling/paginating never produces a duplicate of the pinned product.
- [ ] All three swap paths fail safe (no thrown errors; worst case = default image).

## Risk Assessment
- **Highest-risk item in the plan.** Native swatch drive depends on customized `#updateVariantImages()`; if flaky, fallback (c) gives deterministic control. Decide primary vs fallback empirically in Phase 4, do not over-engineer all three if (a) works.
- Dedup observer must not loop with `paginated-list.js` re-inserts → only delete exact duplicates, never mutate non-pinned order; debounce.
