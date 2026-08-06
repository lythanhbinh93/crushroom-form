---
title: "pod-tee Cart Drawer Bundle CTA Placement"
description: >-
  Move the cart drawer's bundle offer below the line items, merged into the
  recommendation strip's heading row so it is stated once instead of twice, on a
  theme-global switch that keeps today's top-band layout available. Preview
  first, live once verified.
status: pending
priority: P1
effort: "7h"
repo: D:\github local\pod-tee-theme
plans_repo: D:\github local\crushroom-form
branch: feat/cart-drawer-chrome-260806
store: dopamiles.co / rfeixb-dd.myshopify.com
themes: "preview #160174997756 · live #158620516604"
blockedBy: []
blocks: [260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix]
related:
  - brainstorm: ../reports/pod-tee-cart-drawer-bundle-cta-placement-260806-brainstorm.md (contract, 6 decisions, evidence)
  - mockup: https://claude.ai/code/artifact/72e0b763-a587-4096-a83a-bcd544e8ea4a
  - predecessor: plans/260806-0932-pod-tee-cart-drawer-footer-trim-and-bar-toggle-verify (same branch; its Phase 04 browser checks are still open and Phase 01 here closes them)
  - overlaps: plans/260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix (owns both files this plan edits)
tags: [shopify, theme, pod-tee, dopamiles, cart-drawer, bundle, upsell, copy]
created: 2026-08-06
---

# pod-tee Cart Drawer Bundle CTA Placement

Accepted contract, six decisions and the evidence behind them:
[brainstorm report](../reports/pod-tee-cart-drawer-bundle-cta-placement-260806-brainstorm.md).
Interactive design review: [mockup](https://claude.ai/code/artifact/72e0b763-a587-4096-a83a-bcd544e8ea4a).

## Overview

The drawer states the same bundle offer twice, ~200px apart, and both strings
come from the same resolver:

| Source | String | Position |
|---|---|---|
| `dopamiles-bundle-cart-headline.liquid` | *"Add {N} more · save {$X}"* + CTA | above `.dop-cart-lines` |
| `dopamiles-cart-recs.liquid:322` | *"Pick {N} more to save {$X}"* | inside the scroll area |

**This is visible on production.** Live's `settings_data.json` holds
`dop_cart_recs_source`, `_collection`, `_per_view` and `_atc`, and
`dop_cart_recs_enabled` is absent with a schema default of `true` — so the strip
renders and the duplication is what shoppers see today.

The fix moves the offer into the recommendation strip's **heading row**, below
the line items: one row, stated once. It renders from the drawer section rather
than from inside the recs snippet, so it survives when the strip does not.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | The bundle offer appears exactly once, in every tier state | P1 |
| 2 | It sits below the line items, merged into the strip's heading row | P1 |
| 3 | A theme-global switch keeps today's top-band layout available | P1 |
| 4 | The offer still renders when the recommendation strip renders nothing | P1 |
| 5 | The switch survives a `±` cart mutation | P1 |
| 6 | Both layouts hold at 375×500 with ≥1 line item visible | P2 |

## Non-goals

- **Not deleting the top-band layout.** It stays behind the switch.
- **Not touching** recs product selection, the mutation path, or the parked
  reconcile work from `plans/260805-1848-...`.
- **No new tier arithmetic.** The band reuses resolver output verbatim.
- **No new locale keys.** These strings are hardcoded English in the existing
  snippets; this plan follows that, it does not start a migration.
- **No change to SP counting.** dopamiles *includes* Shipping Protection in the
  bundle count; BNC *excludes* it. Never cross-apply.

## Decisions

Carried from the brainstorm. Numbers match that report.

| # | Decision | Value |
|---|---|---|
| 1 | Structure | Band occupies the recs-strip heading slot; top headline not rendered in this mode |
| 2 | Default | **`below_items`** — the new layout is what ships |
| 3 | Edge states | No eligible items renders **nothing**. ~~Top tier shows "Max savings", no CTA~~ — superseded, that was a defect, fixed in `a84c6a3` |
| 4 | Coupling | **Decoupled.** The band renders from the drawer section, never from inside the recs snippet |
| 5 | Merge | The band **fills the heading slot** — one row, not two. Visual merge only |
| 6 | Copy | `✓ Saved $X · Add N more tees — save $Y`; banked green, on-the-table accent. At/past the top threshold: `✓ Saved $X · $Y off every extra tee` |
| 7 | Mutation risk | **Phase 01 blocking gate**, not end-of-plan verification |
| 8 | Ship gate | Preview, then live once verified |
| 9 | Branch | Continue on `feat/cart-drawer-chrome-260806` — it already carries the live-shipped footer trim and the unpushed copy fix |

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Settle the mutation question](./phase-01-start.md) | Pending — **blocking gate** | 1h |
| 2 | [Build the band and the switch](./phase-02-build-the-band-and-the-switch.md) | Pending | 2.5h |
| 3 | [Cover both layouts with tests](./phase-03-cover-both-layouts-with-tests.md) | Pending | 1.5h |
| 4 | [Verify on preview and ship](./phase-04-verify-on-preview-and-ship.md) | Pending | 2h |

Phase 01 is a gate, not a formality: its answer decides decision 2. If a
theme-global setting does not survive a `?sections=` re-render, the default must
become `top` and the switch mechanism needs rethinking — and that is far cheaper
to learn before Phase 02 than after Phase 04.

## Starting state

Branch `feat/cart-drawer-chrome-260806`, 5 commits:

| Commit | What | Where it is |
|---|---|---|
| `f186f2b` | line endings → LF | — |
| `3e40da0` `8a5d67c` | footer trim | **live** + preview |
| `68ce666` | footer tests + 2 cross-check fixes | **live** + preview |
| `a84c6a3` | tier copy: top tier is a rate, not a ceiling | **preview only** — held for verification per decision 8 |

- `npm test` 245 pass, 0 fail. `theme check` 237 files, 0 offenses.
- The branch is on **0 remotes**. Live is serving code whose only copy is one machine.
- Working tree carries unrelated uncommitted `new-arrival` WIP in two section
  files. **Every push must use `--only`**; a full push ships it.

## Verified evidence

| Claim | Evidence | Status |
|---|---|---|
| The duplication is live-visible | Live `settings_data.json` has 5 `dop_cart_recs_*` keys; `dop_cart_recs_enabled` absent, schema default `true` | ✅ |
| Both strings derive from one resolver | `dopamiles-bundle-tier-resolve` feeds both snippets | ✅ |
| The recs strip can render nothing, heading included | `cart-recs.liquid:75` and `:220`; 4 passing tests in `tests/cart-recs.test.js` name the cases | ✅ |
| The reference design is not shipped anywhere | All 5 `tytkwe-qe-theme` branches searched: no `BUNDLE` eyebrow, no "Add 1 more tee" | ✅ new work, not a port |
| Precedent for a position setting | PDP `stack_save` anchors `below_accordions` / `above_atc` | ✅ |
| The top tier is a rate, not a ceiling | `tier-resolve.liquid:68` — `savings_now = current_cents × eligible_qty` | ✅ fixed in `a84c6a3` |
| Theme-global survives `?sections=` | Reasoned from how `settings.*` resolves — **never measured** | ❌ **Phase 01** |
| ≥1 line visible at 375×500 | Outstanding from the footer trim, shipped live unmeasured | ❌ **Phase 01 / 04** |

## The coupling constraint

The single most important structural rule in this plan, and the one most likely
to be "simplified" away by someone who has not read this section.

`snippets/dopamiles-cart-recs.liquid` gates **the whole strip, heading
included**, on `{%- if picked_n > 0 -%}` (line 220), inside
`{%- if settings.dop_cart_recs_enabled -%}` (line 75). If the offer text lived in
that heading it would vanish whenever:

| Condition | Consequence |
|---|---|
| `dop_cart_recs_enabled` unchecked | Offer gone store-wide, from one checkbox |
| Recs collection unset or empty | Gone store-wide, silently |
| **Pool fully deduped** — everything recommendable already in the cart | Gone **for the shopper closest to the next tier** |

Live's recs collection is `"new"`. A shopper holding several of a small
collection hits the last row, and that is the largest cart in the store.

**Therefore:** the band is emitted by `sections/dopamiles-cart-drawer.liquid`.
The recs snippet is *told* a band exists and suppresses its own heading. It is
never the other way round.

## Success criteria

- [ ] Phase 01 answers whether a theme-global setting survives a `±` tap, with evidence
- [ ] `dop_cart_bundle_cta_position` exists, theme-global, default `below_items`
- [ ] `below_items`: band renders below the line items and fills the strip's heading slot
- [ ] `top`: byte-identical drawer to today, band absent
- [ ] The offer string appears **once** in every tier state, in both layouts
- [ ] Band renders when the recs strip renders nothing (all four conditions)
- [ ] Band absent when there are no bundle-eligible items
- [ ] Copy matches decision 6 in all states, including at and past the top threshold
- [ ] `npm test` exits 0; `theme check` clean
- [ ] Preview verified at 375×500 with ≥1 line visible, and the switch survives a `±` tap
- [ ] Live pushed with `--only`; the uncommitted `new-arrival` WIP verified absent afterwards

## Cross-plan relationships

**This plan `blocks` `260725-1940`.** That plan owns
`dopamiles-cart-recs.liquid` and `dopamiles-bundle-cart-headline.liquid`, and
this plan edits both. Its Phase 04 steps 9-12 remain on a human checkout gate;
once this lands, that gate covers a changed heading and a changed headline and
must re-run over the combined result.

**Correction owed to `260725-1940`.** Its plan.md states that live's
`settings_data.json` holds none of the new keys, so the strip renders hidden and
the quick-view is not rendered — verified 2026-07-30. That is **no longer true**:
five `dop_cart_recs_*` keys are now saved on live. Phase 02 Step 0 updates it.

## Open questions

1. **Does a theme-global setting survive `/cart/change.js?sections=`?** Phase 01.
   It gates decision 2 and also affects the already-shipped
   `dop_cart_show_stack_save_bar`.
2. **Should `a84c6a3` go live?** Held on preview per decision 8. Phase 01 verifies
   it in a browser; the live push decision is the user's, in Phase 04.
3. **Should the branch be pushed to origin?** Production is currently served from
   code that exists on one machine. Outside this plan's scope but overdue.
