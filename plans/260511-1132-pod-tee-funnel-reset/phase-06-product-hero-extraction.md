# Phase 06 — Product Hero JS Extraction + Collection Filter Drawer

**Status:** pending
**Owner:** code
**Effort:** L (4-6h)
**Depends on:** Phase 04 (MutationObserver must land before extraction)

## Goal
Move ~290 LOC inline `<script>` out of `dopamiles-product-hero.liquid` to `dopamiles-pdp-variant-sync.js`. Move filter-drawer markup + open/close JS out of `dopamiles-collection-grid.liquid` to a snippet + collection JS. Fix money formatting and i18n strings.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 9 | P1 | sections/dopamiles-product-hero.liquid:241-534 | ~290 LOC inline `<script>` (variant sync, ATC toast, Globo mute, Dawn reveal) | Move to `assets/dopamiles-pdp-variant-sync.js`; pass per-section data via `data-` attrs OR small inline JSON island (kept) |
| 11 | P1 | sections/dopamiles-product-hero.liquid:241-244 | Inline `<script>` blocks parser ~5-10ms | Same as #9 (deferred external) |
| 17 | P1 | sections/dopamiles-collection-grid.liquid:391-541 | Filter drawer + inline open/close JS = 150 LOC | Extract to `snippets/dopamiles-collection-filter-drawer.liquid` + new `assets/dopamiles-collection.js` |
| 18 | P1 | sections/dopamiles-collection-grid.liquid:138 | Inline `onchange` regex hack stripping `sort_by` | Move to collection.js using `URLSearchParams` |
| 24 | P1 | sections/dopamiles-product-hero.liquid:256-258 | `fmtMoney()` hardcodes `$`; strips `.00`; breaks multi-currency | Use `Shopify.formatMoney(cents, format)` (global) OR pre-format on server into `data-dop-variants-json` |
| 32 | P2 | sections/dopamiles-product-hero.liquid:330,357,370 | "Add to cart"/"Sold out"/"Unavailable" string literals | Use existing `window.variantStrings.addToCart` etc. (already exposed at theme.liquid:387-392) |

## Files
| Path | Change |
|---|---|
| sections/dopamiles-product-hero.liquid | edit — delete inline `<script>`; keep `data-dop-variants-json` data island (load-bearing); reference new asset |
| assets/dopamiles-pdp-variant-sync.js | create — variant sync + ATC fallback toast + Globo MutationObserver from phase-04 (consolidate) |
| sections/dopamiles-collection-grid.liquid | edit — replace inline drawer markup with `{% render %}`; remove inline `onchange` |
| snippets/dopamiles-collection-filter-drawer.liquid | create — extracted drawer markup |
| assets/dopamiles-collection.js | create — drawer open/close, sort URLSearchParams, ESC handler |
| layout/theme.liquid | edit — register collection.js conditionally on collection template; register variant-sync on product template |

## Steps
1. Create `dopamiles-pdp-variant-sync.js`: copy lines 241-534 from product-hero. Read variants from `data-dop-variants-json` (already exists). Replace hardcoded strings with `window.variantStrings.*`. Replace `fmtMoney` with `Shopify.formatMoney` using `window.shopMoneyFormat` (verify exposed in theme.liquid; if not, expose).
2. Confirm phase-04 MutationObserver code merges cleanly here (since #7 lives in the same JS region).
3. In product-hero.liquid: delete the inline `<script>` (lines 241-534). Keep `data-dop-variants-json` markup + the section element attributes used by JS.
4. Register `dopamiles-pdp-variant-sync.js` via layout/theme.liquid conditional on `template contains 'product'`. Use `defer`.
5. Create `dopamiles-collection-filter-drawer.liquid` snippet: copy lines 391-541 from collection-grid. Pass needed context (collection, products_count, filters) via `{% render … with %}`.
6. Create `dopamiles-collection.js`: drawer open/close, ESC handler, sort change via `URLSearchParams` (replaces inline `onchange` regex).
7. In collection-grid.liquid: replace inline drawer with `{% render 'dopamiles-collection-filter-drawer' %}`. Remove inline `onchange` from sort `<select>`; add `data-dop-sort` attribute for JS hook.
8. Register `dopamiles-collection.js` conditional on `template contains 'collection'`. Use `defer`.
9. Bump build-tag.

## Gate (real iPhone verification)
- PDP: variant change updates price + media + ATC button text. Sold-out variant disables ATC.
- PDP: ATC error toast shows on simulated 422.
- PDP: Globo mute still works (phase-04 carry-over).
- Collection: open filter drawer → check 2 filters → submit → URL has facet params.
- Collection: sort dropdown change → URL has `sort_by=…` and existing facet params preserved.
- No file >450 LOC. Build-tag visible, bumped, 0 console errors.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores inline scripts.

## Risks
| Risk | Mitigation |
|---|---|
| `Shopify.formatMoney` global not always available | Fallback: keep `fmtMoney` with shop-money-format string injected; both paths tested |
| `window.variantStrings` not set when external script loads | Confirm theme.liquid renders variantStrings before pdp-variant-sync.js loads (defer keeps DOM order) |
| Section render API re-renders product-hero → new section needs new listener attach | New external JS must listen for `shopify:section:load` event (Theme Editor) AND boot on DOMContentLoaded |
| Collection filter drawer state lost on snippet swap | Drawer state lives in URL, not JS — re-render rehydrates from `request.params` |
| Phase-04 MutationObserver code conflicts with this phase's relocation | Plan phase-04 to land observer INSIDE the would-be-extracted block; phase-06 just moves the file |
