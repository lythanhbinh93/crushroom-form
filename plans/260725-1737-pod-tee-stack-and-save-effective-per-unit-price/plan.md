---
title: "pod-tee Stack & Save — Effective Per-Unit Price on Tier Cards"
description: >-
  Show the true after-discount per-unit price on each Stack & Save tier card
  ("2 TEES / $27.99 ea / Save $2 each"), based on the selected variant. Blocked
  behind reconciling the theme's collection-based eligibility gate with the
  checkout Function's tag-based gate, so the advertised price is one checkout
  will actually honor.
status: pending
priority: P1
effort: "3-4h"
repo: D:\github local\pod-tee-theme
branch: fix/codebase-audit-batch-260613
blockedBy: []
blocks: []
related:
  - parent: plans/260519-1745-pod-tee-stack-save-port (v1 card shipped)
  - supersedes-decision: plans/260609-1508-pdp-stack-save-simplify (dropped the per-tier "From $X total" line; this adds a different per-tier line — after-discount per-unit, not total)
  - prior-art: plans/260519-2221-pod-tee-stack-save-r2-placement-from-price (phase-03 built the variantChange/unit-cents plumbing this plan finally consumes)
  - enforcement: dopamiles-bundle-app/extensions/bundle-discount (Rust Function; same tiers metafield)
tags: [shopify, theme, pod-tee, dopamiles, pdp, bundle, stack-save, pricing]
created: 2026-07-25
---

# pod-tee Stack & Save — Effective Per-Unit Price on Tier Cards

## Overview

Each Stack & Save tier card currently shows quantity and savings only
(`2` / `tees` / `Save $2 each`). Target adds the resulting per-unit price as the
card's hero number:

```
   2 TEES              3 TEES  [MOST PICKED]        5 TEES
   $27.99 ea             $26.99 ea                $24.99 ea
   Save $2 each          Save $3 each             Save $5 each
```

Formula is confirmed correct against the enforcement layer: the Function applies
`FixedAmount { amount: tier.amount, applies_to_each_item: true }`, so
**effective unit price = selected variant price − tier amount**.

The blocking problem is not the math. The theme decides eligibility by
**collection membership**; the Function decides by **product tag**. Those sets
differ by ~366 products, so a large share of PDPs would advertise an exact price
checkout refuses to honor. Phase 01 closes that gap before Phase 02 makes the
claim sharper.

## Evidence

Gathered 2026-07-25 against the live Dopamiles store (Admin API + storefront):

| Fact | Value | Source |
|---|---|---|
| Products total / active T-shirt category | 583 / 581 | `productsCount` |
| `bundle-eligible` smart collection | 579 products, rule `PRODUCT_CATEGORY_ID EQUALS aa-1-13-8` | `collections(query:"handle:bundle-eligible")` |
| Products carrying `bundle-eligible` **tag** | **213** | `productsCount(query:"tag:bundle-eligible")` |
| Tiers metafield (`bundles.tiers`) | `[{min:2,amount:2},{min:3,amount:3},{min:5,amount:5}]`, type `json` | `shop.metafield` |
| Variant price spread, one product | $27.99 (S) → $29.99 (M) → $30.99 (XL) → $31.99 (2XL) → $32.99 (3XL), 36 variants | `/products/merica-bear.js` |
| Theme gate | `product.collections | map:'handle' contains 'bundle-eligible'` | `snippets/dopamiles-stack-save.liquid:33` |
| Function gate | `hasTags(tags:["bundle-eligible"])` | `extensions/bundle-discount/src/cart_lines_discounts_generate_run.graphql` |

Named example of the gap: `slow-running-buddy` ("Slow Running Buddy") is in the
category, renders the card, and has no `bundle-eligible` tag.

The snippet header comment claims the predicate "mirrors the Function input".
It does not, and never did — the comment documents an intent the code skipped.

## Accepted Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Price basis | **Selected variant** (`current_variant.price`) | Card sits directly under the hero price, which already uses `current_variant.price`. Invariant: card price = hero price − tier amount. No "From" prefix. |
| Eligibility fix | **Bulk-tag all active T-shirts** | Makes the storewide Stack & Save promise true. Accepted margin impact: ~366 more products become genuinely discountable. |
| Palette | **Keep dopamiles ink/orange** | Reference screenshot's green is BeachNapClub's sage palette. Adopt content structure only. |
| Store scope | **dopamiles only** | BNC (`tytkwe-qe-theme`) keeps its current card. Port later if this converts. |

## Non-Goals

- Compare-at / strikethrough pricing inside the tier cards.
- Changing tier quantities, amounts, or the tiers metafield.
- Changing the Rust Function or redeploying the bundle app.
- Porting to BeachNapClub.
- Touching the footer summary, CTA, cart-drawer headline, or collection badge.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Advertised bundle eligibility matches what checkout enforces | P1 |
| 2 | Each tier card shows the after-discount per-unit price for the selected variant | P1 |
| 3 | Price updates live on size/variant change, matching the hero price minus the tier amount | P1 |
| 4 | SSR renders the correct price with JS disabled | P2 |
| 5 | No regression to tier selection, cart recount, footer summary, or CTA | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Reconcile bundle eligibility](./phase-01-reconcile-bundle-eligibility.md) | Pending |
| 2 | [Phase 2: Effective per-unit price render](./phase-02-effective-per-unit-price-render.md) | Pending |
| 3 | [Phase 3: QA and ship](./phase-03-qa-and-ship.md) | Pending |

Dependencies: Phase 02 may be built in parallel with Phase 01, but Phase 03
(ship) must not run until Phase 01 is verified — otherwise the storefront
advertises exact prices checkout will not honor.

## Success Criteria

- [ ] Tag set and smart-collection set agree; verification query returns 0 untagged active T-shirts
- [ ] Tier cards render `<qty> TEES` / `$X.XX ea` / `Save $N each`, dopamiles ink+orange palette
- [ ] Card price equals hero price minus tier amount for S, M, XL, 2XL, 3XL on a live PDP
- [ ] Prices update on variant change without a page reload; SSR is correct with JS off
- [ ] Non-eligible products still render nothing
- [ ] `shopify theme check` clean; `node --test` green
- [ ] Live push verified by pulled-source diff, not just the CLI success banner

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Ship Phase 02 before Phase 01 | Advertises exact prices checkout won't honor on ~366 PDPs | Hard gate in Phase 03; verification query is a ship blocker |
| Liquid `money` vs JS `formatMoney` disagree on trailing zeros | Price visibly changes format on first variant pick | Phase 02 adds an exact-cents JS formatter; parity is an explicit test |
| Bulk tagging touches 366 live products | Wrong filter could tag non-tees | Filter on category ID, dry-run the count first, tag operation is reversible |
| Tier amount ≥ unit price on a cheap product | Renders `$0.00 ea` or negative | Clamp at 0 and suppress the price line below a floor |
| 3 cards + longer price string overflow on small screens | Layout break at ~360px | Explicit mobile check in Phase 03 |

## Open Questions

None. Price basis, eligibility strategy, palette, and store scope are decided above.

<!-- slug: pod-tee-stack-and-save-effective-per-unit-price -->
