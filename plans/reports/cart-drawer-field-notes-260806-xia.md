# Cart drawer — extraction writeup (xia, compare-only)

**Date:** 2026-08-06
**Mode:** writeup only. No code handover, no port plan, no implementation.
**Audience:** an external developer deciding whether to build something similar.
**Artifact:** https://claude.ai/code/artifact/7cee0723-77b8-4a09-be41-b10a3739bfd0

## Direction note

`/ak:xia` extracts a feature *from* a source repo *into* this project. The request
was the inverse — take this drawer *out* for someone else — so no source argument
was given, and the dependency matrix (source → local equivalents) is not
applicable without a target project. The recon and anatomy phases were run
against this repo as the source; the deliverable is the compare-mode report.

## Source manifest

- Repo: `pod-tee-theme`, branch `feat/cart-drawer-chrome-260806`, HEAD `166c6e4`
- Scope: cart drawer and its transitive render graph
- 20 theme files, ~6,100 lines; 4 test suites, ~2,200 lines

## Anatomy

| Layer | Lines |
|---|---|
| Sections (drawer, recs-shopify) | 641 |
| Snippets (11) | 1,472 |
| JS (cart, helpers, mutations) | 1,550 |
| CSS (cart, drawer-ui, bundle) | 2,246 |
| Tests (4 suites + harness) | 2,219 |

Render graph bottoms out at `dopamiles-bundle-tier-resolve`. Three surfaces read
money from it; none compute.

Dawn coupling is one touchpoint: `PUB_SUB_EVENTS` / `publish()` in
`dopamiles-cart-helpers.js`. Note `layout/theme.liquid:443` still renders Dawn's
own `cart-drawer` snippet, hidden by CSS — a port should drop it, not inherit it.

## Portability tiers

**Copies cleanly** — drawer shell, line items, recs strip (dedup + slide
counter), quickview, tier meter, design layer.

**Must be recreated in the target store** — `shop.metafields.bundles.tiers`
(definition *and* value), the hardcoded `bundle-eligible` collection handle, a
`shipping_protection_product` picker, 18 `settings.dop_*` schema entries.

**Cannot be copied** — the three native automatic discounts. Admin records, not
code. Without them the drawer advertises savings checkout never applies.

## Do not transmit

`config/settings_data.json` (merchant state, clobbers their editor), any Theme
Access token, anything under a dotenv.

## Timing caveat

HEAD is not the right handover point. 16 local-only commits; the tier meter
reached preview on 2026-08-06 and the 375x500 layout has never been measured on
a device. Live runs the older `top` layout, which has production miles.

## What the writeup contains

Eight traps, each verified against a running store: display-vs-enforcement drift
and the order-level/product-level distinction; Section Rendering API schema
defaults; the offer-inside-the-strip coupling; the 375x500 fixed-chrome budget;
top-tier-is-a-rate; Theme Check not evaluating Liquid; mutation-testing the
tests; and not treating your own mockup as evidence.

Plus what we would do differently, and three unresolved items — chiefly that
nothing keeps the tier metafield and the discount records in sync.

## Unresolved questions

1. No drift detector between the tier metafield and the live discount records.
2. The short-viewport budget is still derived from source, never measured on a
   device.
3. No instrumentation on the tier meter, so its effect on conversion is unknown.
