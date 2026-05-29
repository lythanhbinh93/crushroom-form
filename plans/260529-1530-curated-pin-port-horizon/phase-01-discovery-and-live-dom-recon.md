---
phase: 1
title: "Discovery and live-DOM recon"
status: complete
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 1: Discovery and live-DOM recon

## Overview
Verify the runtime DOM contract the JS will depend on, on a *live-rendered* BeachNapClub card (not just source Liquid). This de-risks the variant-swap (the riskiest 20%) before any code is written. No source edits in this phase.

## Why this phase exists
Liquid source shows the *intended* markup; the customized `#updateVariantImages()` + `is_show_color_label` mods mean runtime DOM may differ. Confirm exact selectors/attributes so Phase 2-3 code targets reality, per the standing rule: test against live DOM before writing/pushing CSS/JS.

## Requirements
- Functional: produce a verified selector/attribute map for grid, card, link, swatch inputs, slides.
- Non-functional: read-only; use preview theme, never edit live.

## Architecture / What to confirm
Render `…/collections/sale` (and a collection containing a multi-color product) on the **preview/dev theme** and inspect a real `<product-card>`:

1. **Grid + item**: confirm `ul[ref="grid"]` (a.k.a. `.product-grid`) and child `li.product-grid__item[data-product-id][data-page][ref="cards[]"]`.
2. **Handle source**: confirm the product handle is extractable from `.product-card__link` `href` (`/products/<handle>...`) and/or `a[ref="cardGalleryLink"]` href. Note locale prefix (e.g. `/en/products/`).
3. **Variant→image hooks** (critical):
   - Do swatch radio inputs carry `data-variant-id` AND `data-option-media-id`? (product-card.js:31, :266 read these.)
   - Does `<product-card>` expose `previewVariant(mediaId)` at runtime? Is `slideshow.select({id})` reachable?
   - Are variant images present as `slideshow-slide[variant-image][slide-id="<media.id>"]`, hidden until selected?
   - Map: ad `variant=<id>` → which DOM element selects its color? (full-variant id vs color-value representative id).
4. **`/products/<handle>.js` shape**: confirm `variants[].id`, `variants[].featured_image`/`featured_media`, `variants[].options` available for variant→color→media mapping.
5. **Pagination**: confirm whether `sale` uses infinite scroll vs paged (`show_pagination`), and how `paginated-list.js` re-inserts cards (`li[data-page]`, `grid.append`).
5b. **Custom collection tiles** (`gen-custom-collection`, main-collection.liquid:49,66): confirm whether they render on `/collections/sale` (may be frontpage-only), confirm they lack `ref="cards[]"` / a `.product-card__link` (so handle-matching won't pick them up), and confirm `grid.prepend` lands the pinned card before them. <!-- Updated: Validation Session 1 - pin absolute-first before custom tiles -->`
6. **Component readiness**: how to know `<product-card>` finished upgrading (customElements.whenDefined('product-card') + slideshow ref present).

## Related Code Files
- Read: `tytkwe-qe-theme/assets/product-card.js`, `snippets/card-gallery.liquid`, `snippets/product-card.liquid`, `sections/main-collection.liquid`, `assets/paginated-list.js`, `snippets/swatches.liquid` / `variant-swatches.liquid`.
- Create: none (recon only).

## Implementation Steps
1. `shopify theme dev --store tytkwe-qe.myshopify.com` (or push to an unpublished preview theme) to get a live URL with cookies.
2. Use `agent-browser` (carries cookies) to load a collection page; snapshot a `<product-card>` with color variants.
3. Run `getBoundingClientRect`/DOM queries to confirm each selector/attribute in the list above; record actual attribute names + a sample variant→media mapping.
4. Fetch `/products/<sample-handle>.js`; record JSON keys used for mapping.
5. Determine pagination mode on `sale`; note dedup trigger (page-append event or MutationObserver target).
6. Write findings to `reports/phase-01-dom-contract.md` (selector map + variant-swap mechanism decision: native swatch vs `previewVariant` vs slide fallback).

## Success Criteria
- [ ] Verified selector/attribute map committed to `reports/phase-01-dom-contract.md`.
- [ ] Confirmed concrete variant→image mechanism (which DOM hook the JS will use) + chosen fallback.
- [ ] Confirmed handle extraction source + locale handling.
- [ ] Confirmed `sale` pagination mode and the dedup hook point.
- [ ] Confirmed component-readiness signal.

## Risk Assessment
- If swatch inputs lack `data-variant-id`/`data-option-media-id` at runtime → variant-swap must use `/products/<handle>.js` mapping + slide-level `slide-id` reveal (fallback path). Decide here, not in code.
- If `sale` has zero multi-color products to test → use any collection with a color product for the variant-swap recon; pin logic is collection-agnostic.
