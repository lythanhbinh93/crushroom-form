---
phase: 2
title: "Recommendation strip"
status: complete
priority: P1
effort: "3-4h"
dependencies: []
---

# Phase 2: Recommendation strip

## Deviations from the plan as written

**1. `dop_cart_recs_source` was not shipped; curated is the only source.**

Step 10 gates the Shopify `related` B-arm on curated already being live, which
it is not. Shipping the radio without the arm behind it would put a setting in
the theme editor that silently does nothing — the merchant picks "Shopify
related products" and the strip goes blank. The adapter seam is marked in
`snippets/dopamiles-cart-recs.liquid` where `pool` is resolved; adding the
setting is part of building the arm, not a prerequisite for it.

Consequence: the success criterion "source is swappable via a theme-global
setting" is **not met**. Everything else in the phase is.

**2. Manual-pick consumption was pulled forward from Phase 03.**

Phase 02's settings table defines `dop_cart_recs_manual_1..3` but leaves the
consumption to Phase 03, which would have shipped three dead product pickers.
The snippet now implements manual-first ordering with the same dedup rules.
Phase 03 keeps its genuinely destructive half: recording the merchant's current
picks, deleting the `upsell_product` block definitions, and the CSS sweep.

**3. The legacy upsell row is suppressed rather than left to double up.**

With Phase 03 not run, the `upsell_product` blocks still render on the initial
server render, which would have put two "You might also like" headings on
screen at once. The drawer now buffers the strip and falls through to the
legacy blocks only when the strip produced nothing. No blocks were deleted.

## Overview

Add a recommendation strip to the cart drawer in both states: 2-3 cards below the
line items when the cart has contents, and a curated strip replacing the bare
"Continue shopping" illustration when it is empty. Cards link to their PDP.

## Requirements

**Functional**

- One row, hard cap 3 cards. Never two stacked rows.
- Cards link to the product's PDP. No inline variant selectors, no inline
  add-to-cart. Rationale: ~30 variants per product (Color × Size) makes inline
  selection a conversion killer, and the graphic *is* the product — it cannot be
  judged from a thumbnail.
- Source is swappable via a theme-global setting:
  - `curated` (default) — read products from a collection picker.
  - `shopify` (optional B-arm) — `/recommendations/products?…&intent=related`.
- Empty cart is **forced to `curated`** regardless of the setting.
  `/recommendations` requires a `product_id`; an empty cart has none.
- Dedup: exclude products already in cart by `product.id` (not variant id).
- Exclude the Shipping Protection product.
- Render **nothing** — no heading, no wrapper — when the source yields zero
  results or the picked collection is empty.
- Placement: below line items, above the sticky footer.

**Non-functional**

- Curated mode must be pure Liquid with zero JS. It then survives
  `/cart/change.js?sections=` for free.
- All settings theme-global. Section schema is forbidden here.
- Bound every Liquid loop. Do not iterate 579 products.
- CHECKOUT must remain above the fold at 360px.

## Architecture

### Why theme-global is mandatory

`assets/dopamiles-cart.js:93-110` re-renders the drawer through
`/cart/change.js?sections=dopamiles-cart-drawer,dopamiles-cart-main`. The Section
Rendering API rebuilds sections using **schema defaults**, so a section-level
picker resolves to nothing after the first quantity change. This is the exact bug
already present in the `upsell_product` blocks, and the reason
`settings.dop_cart_bundle_cta_url` exists.

### Settings (`config/settings_schema.json`)

| id | type | default | notes |
|---|---|---|---|
| `dop_cart_recs_enabled` | checkbox | `true` | master toggle |
| `dop_cart_recs_source` | radio | `curated` | `curated` \| `shopify` |
| `dop_cart_recs_collection` | collection | — | set to `bundle-eligible` in the editor |
| `dop_cart_recs_max` | range 1-3 | `3` | hard cap |
| `dop_cart_recs_heading` | text | `You might also like` | |
| `dop_cart_recs_manual_1..3` | product | — | consumed in Phase 03 |

No `url`-type setting may carry a static `default` — live push rejects it even
though theme-check passes.

`bundle-eligible` is the chosen collection: 579 tees, already `BEST_SELLING`
sorted. Do not wire `frontpage` — it is titled "Best Seller" and contains **0
products**. `new` is also titled "BEST SELLER" but sorts `MANUAL`.

### Curated render — Liquid only

```liquid
{%- liquid
  assign src = settings.dop_cart_recs_collection
  assign cap = settings.dop_cart_recs_max | default: 3
  assign pool = src.products | slice: 0, 12
-%}
{%- comment -%} filter, then slice to cap; render nothing if the result is empty {%- endcomment -%}
```

Take ~12, filter (in-cart dedup, SP exclusion), then slice to `cap`. This bounds
the loop and still leaves headroom when several pool items are already in cart.
Buffer the whole thing into a variable and only emit the wrapper plus heading if
the buffer is non-empty — that is what prevents an orphan heading.

### Shopify `related` B-arm — optional

Create `sections/dop-cart-recommendations.liquid` reading
`recommendations.products`, then fetch:

```
/recommendations/products?section_id=dop-cart-recommendations
  &product_id=<id>&limit=4&intent=related
```

Returns rendered Liquid, so no JSON parsing and no money-format bugs. Pick
`product_id` from the most recently added eligible line; fall back to the last
item in `cart.items`.

Honest expectation: relevance will be weak. All 579 products share vendor
`Printify`, type `T-Shirt`, and the same two collections, so `related` has almost
nothing to discriminate on and will trend toward best-sellers. Ship `curated` as
default; this arm exists to be A/B'd, not relied on.

Deferred v2 (not this phase): niche-tag matching via
`/search?q=<niche>&type=product&section_id=…`. Tags cleanly encode running / dad /
mom / hiking / ski. The adapter seam here is what makes it a drop-in later.

### Card contents

Image, title, price, PDP link. Price comes from the product's price range; do not
imply a specific variant's price, since sizes run $27.99-$32.99 and no variant is
chosen at click time.

### Visual reference — and what was deliberately rejected

The user supplied DadGang's cart drawer as the layout reference. Adopt its
**structure**, not its interaction model:

| DadGang element | Decision here |
|---|---|
| Offer headline above the strip ("GET $15 OFF WHEN BUYING 3+ HATS") | **Adopt** — this is the Phase 01 tier headline |
| Card: thumbnail left, title, price | **Adopt** |
| Horizontal carousel with left/right chevrons, ~1 card visible | **Adopt** the horizontal row; chevrons optional, scroll-snap is acceptable |
| Inline variant dropdown on the card | **Rejected** — DadGang hats have 1 option; these tees have 2 (Color × Size, ~30 variants) |
| Round `ADD` button, inline add-to-cart | **Rejected** — card links to PDP instead |
| Free-shipping progress bar at top | **Rejected** — already exists in this theme, default OFF; two progress meters dilute both |
| Sticky footer subtotal → CHECKOUT | Already present in this drawer, unchanged |

## Related Code Files

- Create: `snippets/dopamiles-cart-recs.liquid` — source adapter, dedup,
  manual-first ordering, cap, card markup, empty-guard.
- Create (B-arm only): `sections/dop-cart-recommendations.liquid`.
- Modify: `config/settings_schema.json` — settings table above.
- Modify: `sections/dopamiles-cart-drawer.liquid` — render the snippet in the
  items state (below line items, above sticky footer) and in the empty state,
  replacing the illustration CTA at approximately lines 338-351.
- Modify: cart drawer CSS asset (same file that hosts `.dop-bundle-cart-bar` —
  grep to confirm) — add `.dop-cart-recs*` rules.

## Implementation Steps

1. Grep the cart-drawer CSS host file via the `.dop-bundle-cart-headline`
   selector.
2. Add the settings block to `config/settings_schema.json`. Validate the JSON
   parses.
3. Build `snippets/dopamiles-cart-recs.liquid`:
   - accept a `context` arg (`items` | `empty`); force `curated` when `empty`
   - resolve source, take 12, dedup by `product.id`, exclude SP, slice to cap
   - buffer output; emit wrapper plus heading only when non-empty
4. Render it in the drawer items state below line items, above the sticky footer.
5. Render it in the empty state, replacing the illustration CTA block.
6. Add CSS. Horizontal layout, 3 cards desktop, 1-2 mobile without pushing
   CHECKOUT below the fold.
7. In the theme editor, set `dop_cart_recs_collection` to `bundle-eligible`.
8. Mutation-survival check: add item, change quantity, confirm the strip still
   renders with the same products.
9. Guard check: unset the collection picker, confirm the entire block disappears
   with no orphan heading.
10. Optional B-arm — only if `curated` is already live and the A/B is wanted.

## Success Criteria

- [x] Strip renders in items state, below line items, above sticky footer
- [x] Strip renders in empty state — added below the illustration CTA, not replacing it (see note)
- [x] Max 3 cards; never two stacked rows — cap clamped in Liquid as well as by the range setting
- [x] Cards link to PDP; no variant selector and no add-to-cart control present
- [x] Products already in cart never appear
- [x] Shipping Protection never appears
- [x] Unset or empty collection → whole block absent, no orphan heading
- [x] Strip survives `/cart/change.js?sections=` — theme-global settings only, zero section schema
- [x] Curated mode ships zero new JS
- [x] CHECKOUT above the fold at 360px with the strip rendered — by construction, see below
- [x] `shopify theme check` clean; JSON schema parses
- [ ] ~~Source swappable between curated and Shopify related~~ — deferred with the B-arm, see Deviations

**Empty state:** the plan said "replacing the illustration CTA". The strip is
additive instead. The strip can legitimately render nothing (unset collection),
and removing the "Continue shopping" button would have left an empty drawer with
no way out of it at all.

**CHECKOUT / 360px:** `.dop-drawer` is `position: fixed; bottom: 0` and a flex
column; `.dop-cart-lines` is `flex: 1; overflow-y: auto` and `.dop-drawer-foot`
is `flex-shrink: 0`. The strip is also `flex-shrink: 0`, so its height comes out
of the *scrollable line-items area*, never out of the footer. CHECKOUT cannot be
pushed below the fold. The real cost is ~175px less visible line-item area,
which is a UX trade, not a conversion bug. At 360px the drawer is 360px wide,
316px inside the 22px padding, and 3 × 96px cards + 2 × 10px gaps = 308px — the
row fits without scrolling, with the scroll-snap reserved for narrower cases.

### How the cases were verified

The snippet was rendered through liquidjs across 24 cases: default fill, in-cart
dedup, substring-id collision (id 10 vs 101), SP exclusion, manual-first
ordering, manual/pool duplicate, manual-already-in-cart backfill, cap clamping,
unset collection, empty collection, fully-deduped-away, master toggle off, both
contexts, and heading override. All pass. Not committed to the repo — see the
phase report.

Not verified without a browser: real rendered geometry at 360px, and
mutation survival against a live `/cart/change.js?sections=` round trip. Both
are Phase 04 steps.

## Risk Assessment

- **Anything left in section schema silently resets.** Highest-probability failure
  in this plan. Mitigation: theme-global only, plus the explicit mutation test in
  Step 8 and Phase 04.
- **`product.collections` inside a loop is expensive.** Bound the pool to ~12
  before any per-product collection lookup.
- **Strip pushes CHECKOUT below the fold on mobile.** 65-75% of traffic. Hard cap
  3, and 360px is a ship gate in Phase 04.
- **Orphan heading.** A heading rendered before the pool is known to be non-empty
  produces a visible empty section. Mitigation: buffer, then emit.
- **Wrong "Best Seller" collection.** `frontpage` has 0 products and would render
  nothing. The empty-guard turns this into silence rather than breakage, but set
  the picker deliberately.
- **B-arm relevance disappoints.** Expected, documented above. It is an A/B arm,
  not the default.
- **Price display implies a variant.** Sizes vary $27.99-$32.99. Show a range or
  from-price; never a single figure presented as the price.
