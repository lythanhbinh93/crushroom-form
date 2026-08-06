---
title: "pod-tee Cart Recommendations and Tier Headline Fix"
description: >-
  Fix the cart-drawer tier headline to match what checkout actually charges
  (two live under-reporting bugs), then add a UpCart-style recommendation strip
  in both the items and empty cart states. Native theme work, no app. Cards link
  to PDP; no inline variant selection.
status: pending
priority: P1
effort: "1-1.5d"
repo: D:\github local\pod-tee-theme
plans_repo: D:\github local\crushroom-form
branch: TBD
store: dopamiles.co / rfeixb-dd.myshopify.com (live theme #158620516604)
blockedBy: [260806-0932-pod-tee-cart-drawer-footer-trim-and-bar-toggle-verify, 260806-1245-pod-tee-cart-drawer-bundle-cta-placement]
blocks: [260520-1010-pod-tee-cart-drawer-offer-revamp]
related:
  - advice: ./advice.md (confirmed requirements, verified evidence, locked decisions)
  - blocked-by-note-2: >-
      Added 2026-08-06. 260806-1245 edits BOTH files this plan owns —
      dopamiles-cart-recs.liquid (its heading gains a `suppress_heading` arg) and
      dopamiles-bundle-cart-headline.liquid (its top-tier arm was already
      rewritten in a84c6a3, see the correction below). Phase 04 steps 9-12 must
      re-run over the combined result.
  - CORRECTION-2026-08-06: >-
      This plan states that live's settings_data.json holds none of the new keys,
      so the recommendation strip renders hidden and the quick-view is not
      rendered at all — verified 2026-07-30. That is NO LONGER TRUE. Live now has
      dop_cart_recs_source, _collection, _end_collection, _per_view, _atc and
      _atc_color saved, and dop_cart_recs_enabled is absent with a schema default
      of true. The strip RENDERS ON LIVE. Anything in this plan that treats the
      strip as dormant on production is reasoning from a stale reading.
  - CORRECTION-2026-08-06-b: >-
      The tier headline's top-threshold arm read "Max savings" and rendered no
      CTA. The tier amount is per-unit, so the top tier is a rate, not a ceiling
      — 5 tees save $25, 6 save $30, 7 save $35. Fixed in a84c6a3 (pod-tee-theme,
      branch feat/cart-drawer-chrome-260806): the arm now states what is banked,
      quotes the rate, and keeps the CTA. Also fixed the .success selector, which
      only existed in compound form and so never matched the earned-tier states.
  - blocked-by-note: >-
      Re-pointed 2026-08-06. 260805-1848 was rolled back; its successor
      260806-0932 lands the chrome trim only, on its own branch
      (feat/cart-drawer-chrome-260806, based on sync/live-collection-header-260731).
      The mutation path is NO LONGER changing — the reconcile stayed parked — so
      only the footer changes affect this plan. Phase 04 is not blocked from
      starting; it is blocked from CLOSING, because steps 9-12 would otherwise
      sign off a drawer whose footer rows have since changed. Re-run them once
      both branches are integrated.
  - superseded-blocker: plans/260805-1848-pod-tee-cart-drawer-reconcile-and-chrome-trim (rolled back 2026-08-05; kept as the record of the reconcile investigation)
  - overlaps: plans/260520-1010-pod-tee-cart-drawer-offer-revamp (phases 01-04 complete; built the bar + Shipping Protection this plan corrects; phase 05 QA never ran)
  - overlaps: plans/260725-1737-pod-tee-stack-and-save-effective-per-unit-price (same tiers metafield, PDP-side)
  - not-live: dopamiles-bundle-app/extensions/bundle-discount (Rust Function, tag-gated, NOT deployed)
  - reference: https://docs.aftersell.com/upcart/upsells_module (feature model only; app not installed)
tags: [shopify, theme, pod-tee, dopamiles, cart-drawer, upsell, recommendations, bundle, stack-save]
created: 2026-07-25
---

# pod-tee Cart Recommendations and Tier Headline Fix

Full advisory context, verified evidence, and locked decisions: [advice.md](./advice.md).

## Overview

Two jobs, in strict order.

**First, fix what is already wrong.** The cart drawer's tier headline and progress
bar have been live since 2026-05-20 and under-report the discount on two
independent axes. Both are arithmetic, both are customer-visible, and both
under-promise — so no shopper has complained, but the store's strongest offer is
being hidden from the people most likely to take it.

**Then add the recommendation strip.** 2-3 cards below the line items and a
curated strip in the empty state, so the drawer stops being a dead end. Cards
link to their PDP; no inline variant selection.

The order matters. The strip's entire value is driving shoppers toward a tier
whose savings the headline currently states incorrectly. Shipping the strip first
would amplify a wrong number.

## The two live bugs

### Bug 1 — savings multiplied by the tier threshold, not the actual count

`snippets/dopamiles-bundle-cart-headline.liquid` computes
`bundle_tier_N_total = amount × N`, where `N` is the tier *threshold* (2/3/5).
The live discounts are `appliesOnEachItem: true`, so the true saving is
`amount × actual eligible quantity`.

| Eligible qty | Headline says | Checkout charges | Gap |
|---|---|---|---|
| 2 | Saved $4 | $4 | correct |
| 3 | Saved $9 | $9 | correct |
| **4** | **Saved $9** | **$12** | **−$3** |
| 5 | Saved $25 | $25 | correct |
| **6** | **Saved $25+** | **$30** | **−$5, hedged by "+"** |

Correct at tier boundaries, wrong between them.

### Bug 2 — tier selected by eligible count, but the discount counts all cart lines

The snippet selects the tier from `eligible_qty` (bundle-eligible items only,
Shipping Protection excluded). The live discounts use
`minimumRequirement.greaterThanOrEqualToQuantity` against **all** cart lines.

Shipping Protection auto-adds by default (`shipping_protection_default_checked`,
once per session — see the overlapping plan's Phase 04). **So the default cart
state has SP in it**, which means:

| Cart | Bar shows | Actually charged |
|---|---|---|
| 1 tee + SP | 20% fill, 0 markers hit, "Add 1 more · save $4" | **$2 already off** |
| 2 tees + SP | tier 2 hit, "Saved $4" | **$6** ($3 × 2) |
| 4 tees + SP | tier 3 hit, "Saved $9" | **$20** ($5 × 4) |

This is not an edge case. It is the default path for every shopper who does not
opt out of Shipping Protection.

> **RESOLVED 2026-07-30 — Bug 2 does not exist.** The gate below asked whether
> the counting semantic is order-wide. It is not: three discriminating carts,
> read against Shopify's own applied `total_discount`, all say
> **bundle-eligible items only**. A 1 tee + SP cart pays $0, not the $2 the
> table above predicts; 3 tees + 3 SP pays $9, not the 5-tier's $25. Shipping
> Protection never counts toward the tier, so the whole table above is wrong and
> the live drawer was right on this axis all along. Evidence in
> [phase-01](./phase-01-tier-counting-truth.md). **Bug 1 is real and is fixed.**
>
> *Original gate:* Bug 2 rests on the counting semantic being order-wide. The
> user confirmed this from observation; it is not empirically verified in this
> plan. Phase 01 Step 1 verifies it with a live test cart **before** any copy
> changes. If the semantic turns out to be eligible-items-only, Bug 2 does not
> exist, Bug 1 still does, and Phase 01 narrows accordingly.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Headline and bar state exactly what checkout charges, at every quantity, with and without Shipping Protection | P1 |
| 2 | Recommendation strip renders in both cart states, cards link to PDP | P1 |
| 3 | Merchant upsell picks survive a cart mutation (they currently do not) | P1 |
| 4 | Recommendation source swappable between curated collection and Shopify `related` | P2 |
| 5 | No regression to tier selection, cart recount, Shipping Protection, or the PDP Stack & Save CTA | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Tier counting truth](./phase-01-tier-counting-truth.md) | **Complete — Step 1 ANSWERED 2026-07-30: the basis is `eligible`.** Three discriminating carts read against Shopify’s applied discount. Bug 2 does not exist; the shipped default was already correct and must never be flipped to `total` on this store |
| 2 | [Recommendation strip](./phase-02-recommendation-strip.md) | Complete — B-arm source setting built 2026-07-29, no longer deferred |
| 3 | [Migrate manual pickers](./phase-03-migrate-manual-pickers.md) | Complete — 2026-07-29. Zero `upsell_product` blocks existed on live or preview, so the irreversible-loss risk was empty; blocks, render loop, 97 lines of CSS and the JS handler removed |
| 4 | [QA and ship](./phase-04-qa-and-ship.md) | Partial — steps 1-3, 6-8 done 2026-07-29; **step 5 mutation matrix run 2026-07-30, all rows pass**; step 4 money rows cross-checked against Shopify’s applied discount on 4 carts; 9-12 still blocked on the human gate |
| 5 | [Drawer redesign and money single-source](./phase-05-drawer-redesign-and-money-single-source.md) | Built, on preview. Doc written retroactively 2026-07-29 — money resolver + 24-case equality suite, carousel, cards-per-view, compact line items, related-products arm, end-card destination, mockup diff. **Supersedes** Phase 02's zero-JS and 3-card criteria and voids two Phase 04 arguments |
| 6 | Add-control on rec cards — **exploratory, no phase doc** | **Comparison closed 2026-07-30**: `icon` and `C` deleted (`e57f20f`) after a 390px render of the real snippet at 1/2/3 cards per view. `dop_cart_recs_atc` now ships `off` (default) / `b` / `a`. B behaves identically at every density; A survives only for the 1-up case. C could not fit a price and a button on a 92px card and silently rendered as B there. The control now opens a quick-view slide-over inside the drawer for size and colour rather than the PDP. Committed 2026-07-29 `d305f8e` + `842e28e` + `837a6f1` (quick-view) + `deb7adb` (product-page button identity) + `c92a99d` (`dop_cart_recs_atc_color`, accent or black, one lever for both buttons), preview only. Decisions and evidence in [advice](./reports/260729-advise-atc-button-placement.md) + [quick-view advice](./reports/260729-advise-quickview-atc-size-color.md); mockups in the same folder, plus the 390px comparison render. **B is the shipped design.** Also `14c4ba5` — an SP-only cart no longer offers to protect nothing |

**Committed, preview only.** All work sits in `pod-tee-theme` on branch
`feat/cart-recs-and-tier-truth-260729`, not pushed to any git remote. Theme
pushes have gone to the preview theme `#160174997756` only; live
`#158620516604` is untouched and stays that way until the Phase 04 human gate.

**Dependencies.** Phases 02 and 03 may run in parallel with 01; they touch
different files. Phase 03 depends on Phase 02's settings block existing.

**Phase 01 Step 1 is a settings gate, not a ship gate** (reclassified
2026-07-30). It was written as a hard gate on Phase 04 so the strip could not
ship on top of a wrong number. That rationale no longer reaches the push: live's
`settings_data.json` holds none of the new keys, so the strip renders hidden and
the quick-view is not rendered at all — verified by reading live's settings on
2026-07-30. What Step 1 now blocks is one theme-editor toggle, flipped after the
push and instantly revertible.

The headline number does ship visible. It ships on `eligible`, which
under-promises, which this plan's own risk table classes as the safe direction —
and live today carries Bug 1, a larger under-promise ($9 for $12, "$25+" for
$30). Holding the push to avoid under-promising keeps a worse one live. The
unsafe direction — promising money checkout will not pay — requires flipping to
`total`, which the settings gate still guards.

Step 1 is still owed and still needs a real checkout. Intended discharge is one
batched human session alongside the phone placement comparison and the device
check, before the push. This reclassification is insurance for the case where
that session slips, not permission to skip it.

## Locked decisions

Full rationale in [advice.md §5](./advice.md). Summary:

| Item | Decision |
|---|---|
| App vs native | Native — no UpCart, no monthly fee |
| Variant resolution | Cards link to PDP; no inline variant selectors, no inline add-to-cart |
| Rec source | Swappable: curated collection (default) + Shopify `intent=related` (optional B-arm) |
| Curated collection | `bundle-eligible` — 579 tees, already BEST_SELLING sorted |
| Copy | Next **tier boundary**, "save $N" totals phrasing |
| Strip layout | ~~One row, manual-first, hard cap 3 cards~~ → **superseded by Phase 05**: snap carousel, manual-first, 1/2/3 cards per view, hard cap 16 (user decision 2026-07-27) |
| Settings location | Theme-global `settings.*` only — never section schema |
| Free-shipping bar | Already exists, default OFF — leave off |
| Analytics | Out of scope (user decision) |
| PDP Stack & Save CTA | Untouched |

## Critical constraint — no section schema

`assets/dopamiles-cart.js:93-110` re-renders the drawer via
`/cart/change.js?sections=dopamiles-cart-drawer,dopamiles-cart-main`. The Section
Rendering API rebuilds sections with **schema defaults**, so any section-level
setting resets on every cart mutation. This is why
`settings.dop_cart_bundle_cta_url` exists as a theme-global. Every setting this
plan adds must be theme-global for the same reason.

## Success criteria

- [ ] Headline savings equal the applied checkout discount at eligible qty 1-6, both with and without Shipping Protection in cart
- [ ] Tier selection matches the verified counting semantic from Phase 01 Step 1 — required before flipping the setting to `total`, not before the push
- [ ] Qty-4 state shows $12 (not $9); qty-6 shows $30 (not "$25+")
- [ ] Recommendation strip renders in items state and empty state
- [ ] Strip renders nothing — not an orphan heading — when the source is unset or yields zero results
- [ ] Manual picks still present in DOM after a quantity change
- [ ] `upsell_product` block definitions removed from `sections/dopamiles-cart-drawer.liquid`
- [ ] CHECKOUT button above the fold at 360px with the strip rendered
- [ ] `shopify theme check` clean; `node --test` green
- [ ] Live push verified by `shopify theme pull` source diff, not the CLI banner
- [ ] PDP Stack & Save CTA unchanged

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Counting semantic assumed wrong | Headline promises money checkout won't pay — worse than the current under-promise | Step 1's test cart gates the `total` setting, not the push. Shipping on `eligible` can only under-promise, and the copy already shipped on that default |
| Over-promising after the fix | Under-promising is safe; over-promising is a trust and chargeback problem | Every state verified against a real checkout total, not arithmetic on paper |
| Section Rendering API eats a setting | Strip or picks silently vanish mid-session | Theme-global only; explicit mutation-survival test in Phase 04 |
| Strip pushes CHECKOUT below fold | Direct conversion loss on 65-75% of traffic | Phase 05 moved the strip inside the scroller, so the cap no longer bounds drawer height. Measured at 360px: CHECKOUT above fold with 49px headroom. Still a ship gate |
| `bundle-eligible` collection empty or repointed | Strip renders nothing | Guard on `products_count == 0`; render nothing rather than an orphan heading |
| Live pushes hit production | Customer-visible breakage | `--allow-live` + single `--only` per file; verify by pulled-source diff |
| Overlapping plan 260520-1010 Phase 05 QA still open | Two plans QA-ing the same drawer | Phase 04 covers the drawer states this plan touches; 260520-1010 Phase 05 remains separately owned |

## Open questions

1. **Counting semantic is asserted, not tested.** Resolved by Phase 01 Step 1.
   Everything downstream branches on the result.
2. **Whether the strip earns its space is unanswerable** under current scope —
   analytics excluded by decision. Revisit only if measurement is added.

<!-- slug: pod-tee-cart-recommendations-and-tier-headline-fix -->
