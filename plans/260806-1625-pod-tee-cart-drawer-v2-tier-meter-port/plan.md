---
title: "pod-tee cart drawer v2 tier meter port"
description: "Port the segmented tier meter from the UX team's Cart Drawer v2 into the existing below-items offer band, without adopting the layout reversal or the footer changes."
status: pending
priority: P2
effort: "4h"
tags: [pod-tee, cart-drawer, design-port]
created: 2026-08-06
related:
  design_source: "claude.ai/design project 019dfd16-2ca1-7911-a6ac-f13057bb1703, file `Dopamiles Cart Drawer v2.html`"
  sibling: ./../260806-1245-pod-tee-cart-drawer-bundle-cta-placement/plan.md
  ships_via: >-
    Verification and the live push ride 260806-1245 Phase 03. This plan
    deliberately has no ship phase of its own — two competing ship phases for
    one drawer is how a half-pushed file happens.
---

# pod-tee cart drawer v2 tier meter port

## Overview

The UX team delivered `Dopamiles Cart Drawer v2.html`, a full redesign of the
cart drawer. Most of it conflicts with work that shipped to preview earlier
today, and its JavaScript carries three defects the theme has already fixed.

One idea in it is genuinely good and worth taking: the tier offer as a
**segmented progress meter** that turns green when a tier unlocks, instead of
the current thin bar with absolutely-positioned threshold labels.

This plan ports that one idea into the band below the line items, where the
offer already lives. It adopts none of the layout reversal and none of the
footer changes.

## Contract

**Outcome.** The below-items offer band states the same copy it does now, with
a segmented meter beneath it that fills as eligible tees are added and turns
green once a tier is earned.

**Constraints.**
- No change to tier arithmetic, the resolver, or Shipping Protection counting.
- The meter renders inside `.dop-cart-lines`, the scroll area — never in fixed
  chrome. The 375x500 gate is the reason the offer moved below the bag.
- The band keeps being emitted by the drawer **section**, never from inside
  `dopamiles-cart-recs.liquid`.
- The adjacency contract holds: nothing may be emitted between the band and the
  recommendation strip, because `.dop-bundle-cart-band + .dop-cart-recs` is what
  joins them.

**Non-goals.**
- Not moving the offer back to the top. Not touching the footer. Not restyling
  line items, the head, or the recommendation cards.
- Not redesigning the `top` layout's marker bar. That layout is the rollback
  path behind `dop_cart_bundle_cta_position`; it does not need a new look.
- Not porting anything from the design's JavaScript.

**Acceptance criteria.**
- Meter renders in the band, segments fill by eligible quantity, green once a
  tier is earned.
- Zero eligible items still renders **nothing** at all.
- Fixed chrome unchanged: the meter costs scroll area, not the gate.
- `npm test` and `theme check` clean; both layouts still covered.

## Decisions

| # | Decision | Value |
|---|---|---|
| 1 | Offer position | **Unchanged.** Stays below the line items. The design's top-mounted tier bar is not adopted |
| 2 | What is ported | The segmented meter's visual language only: warm tint, green lit segments once a tier is earned, segmented track, right-aligned step counter |
| 3 | Footer | **Unchanged.** No total-on-button, no protection switch, no trust line, no per-line was/now pricing |
| 4 | Segment count | One segment per unit up to the highest threshold (`max_min`, default 5), **capped at 10**. Above the cap the meter scales proportionally instead of per-unit. Not one per tier: three segments give a shopper at 1 tee no feedback at all |
| 5 | `top` layout | Keeps its existing marker bar. Two treatments, deliberately — the meter belongs to the layout that ships |
| 6 | Ship path | Folds into `260806-1245` Phase 03. This plan has no ship phase |
| 7 | Green semantics | The **lit segments** turn green once a tier is earned; the band tint stays warm throughout. Green then means what it already means in the copy — money banked — and only one wash token is needed. The design flipped the whole panel; that would put the orange still-on-offer figure on a green ground |
| 8 | Wash token | `--dop-accent-wash`, computed in Liquid from `settings.dop_accent`, matching every other token in `dopamiles-tokens.liquid`. Not a static hex, which would be pinned to today's default accent rather than to the setting |
| 9 | Segment transition | **Dropped.** `swapSection` is `dst.innerHTML = src.innerHTML`, so every node is destroyed and rebuilt on each mutation and a `background` transition has no prior state to animate from. The `prefers-reduced-motion` guard goes with it |

## Why the design's layout was not adopted

**It costs ~127px of fixed chrome.** Drawn at 420x780 desktop; the binding
constraint is 375x500.

| | Current preview | Design v2 |
|---|---|---|
| Head | 43px | 59px |
| Tier bar | in the scroll area | **60px of fixed chrome** |
| Footer | ~193px | ~244px |
| **Fixed chrome** | **~236px** | **~363px** |
| Scroll area at 500px | 264px | **137px** |

A design line item is ~100px, so 375x500 would show 1.3 line items and push the
cross-sell rail entirely below the fold.

**And the design's own prototype reproduces the defect the current layout
exists to prevent.** `.tier` is CSS-only — there is no `.tier` element in the
HTML and the script never creates one, so the meter that callout 02 describes
was never actually built. What renders instead puts the only offer copy in
`railHead`, inside `.rail`, which the script hides with
`$("rail").style.display = picks.length ? "block" : "none"`. Put all six
catalogue products in the cart and the offer disappears — for the shopper
closest to the next tier. That is exactly the coupling failure documented in
`plans/reports/pod-tee-cart-drawer-bundle-cta-placement-260806-brainstorm.md`.

## Three defects in the design's JavaScript — do not port

Recorded so nobody reads the source later and reintroduces them.

| # | Defect | Status in the theme |
|---|---|---|
| 1 | `railHead` reads `off` before its `const off = discount()` initialiser. Temporal dead zone, so the prototype throws a `ReferenceError` at the top tier | N/A — the theme computes in Liquid |
| 2 | `"Max savings unlocked"` at the top tier | Fixed today in `a84c6a3`. The top tier is a **rate**, not a ceiling: at $5/unit, 6 tees save $30 and 7 save $35 |
| 3 | `nt.off * nt.qty` — savings as amount x *threshold* | Bug 1 in `260725-1940`, fixed to amount x *actual eligible quantity*. The two agree only at 2/3/5, which is why it looked correct |

The resolver `snippets/dopamiles-bundle-tier-resolve.liquid` is the money truth.
The design's HTML is a visual proposal; its JS is not a contract.

## What was in the design and is being left on the table

Not rejected on merit — out of the scope chosen for this plan. Worth revisiting
as their own change, with their own gate.

- Total on the checkout button (`Checkout · $58.93 →`). Costs no height and
  keeps the amount visible when totals scroll under a mobile keyboard.
- Shipping Protection as a 34x20 switch rather than a checkbox.
- Per-line was/now pricing. **Needs money-truth verification first**: Stack &
  Save runs as automatic discounts, and a per-line net price that checkout does
  not match is a trust break, not a styling choice.
- 148px recommendation cards with one-click Add. The theme ships 96px cards
  with `dop_cart_recs_atc` off by default.
- Line-item restyle: 64px imagery, serif titles, Remove as a text button.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Build the meter into the band](./phase-01-start.md) | Pending |
| 2 | [Cover the meter with tests](./phase-02-cover-the-meter-with-tests.md) | Pending |

Verification and the live push are `260806-1245` Phase 03, which is already
written, already gated on a browser, and already carries this drawer's other
outstanding checks.

## Success Criteria

- [ ] Meter renders in the band with one segment per unit to the top threshold, capped at 10
- [ ] Segments fill by eligible quantity and turn green once a tier is earned; the band tint stays warm
- [ ] Step counter states progress toward the next threshold
- [ ] Zero eligible items renders nothing at all — no empty tinted strip, no bare meter
- [ ] Fixed chrome is byte-for-byte unchanged; the meter lives in the scroll area
- [ ] `top` layout untouched, marker bar intact
- [ ] The band still carries no CTA and no eyebrow
- [ ] Adjacency to `.dop-cart-recs` preserved
- [ ] `npm test` 0 failures, `theme check` 0 offenses

## Open Questions

1. **Whether the `top` layout should eventually get the meter too.** Decision 5
   says no, on the grounds that it is the rollback path. If it stops being that,
   revisit.
2. **`color_mix` weight direction.** Shopify's filter takes a weight, and both
   argument orders appear in circulation. Phase 01 Step 1 requires confirming it
   with one render before trusting either — a reversed weight yields a wash that
   is 92% accent, which is loud rather than subtly wrong and will be obvious.

Resolved in validation session 1: segment count at a non-default tier table
(capped at 10, Decision 4) and green-on-met semantics (segments only,
Decision 7).

## Validation Log

### Session 1 — 2026-08-06

**Trigger:** `/ak:plan validate` immediately after plan creation, before any
implementation.
**Questions asked:** 4

### Verification Results

- **Tier:** Light (2 phases, Fact Checker)
- **Claims checked:** 12
- **Verified:** 11 | **Failed:** 0 | **Contradicted:** 1

| Claim | Result |
|---|---|
| All 9 cited paths exist on `feat/cart-drawer-chrome-260806` | VERIFIED |
| Resolver index `[9]` is `max_min` | VERIFIED — `dopamiles-bundle-tier-resolve.liquid:202` |
| Band currently reads `[3] [4] [6] [7] [8]` only | VERIFIED — `[1]` and `[9]` do have to come back |
| Default tier table `002:200\|003:300\|005:500` → 2/3/5, top threshold 5 | VERIFIED — `dopamiles-bundle-tier-table.liquid` |
| `margin: 10px -18px 9px` couples to `.dop-cart-lines` `padding: 0 18px` | VERIFIED — `dopamiles-bundle.css:176`, `dopamiles-cart.css:148` |
| `.dop-bundle-cart-band + .dop-cart-recs` join intact | VERIFIED — `dopamiles-cart.css:684` |
| `@media (prefers-reduced-motion: reduce)` is the theme convention | VERIFIED — 12 sites |
| Baseline suite | VERIFIED — `npm test` 303 pass, 0 fail |
| Wash tokens "derived from the accent and good hues" | **CONTRADICTED** — every colour in `dopamiles-tokens.liquid` reads from a merchant setting (`settings.dop_accent`, line 28). A static hex derives from today's default, not from the setting |
| Segment transition fires only on first paint | **CONTRADICTED** — `swapSection` is `dst.innerHTML = src.innerHTML` (`dopamiles-cart-mutations.js:50`), a full destructive replace. There is no path on which the transition fires at all |

#### Questions & Answers

1. **[Architecture]** The plan says the two wash tokens are "derived from the
   accent and good hues" — but every other token in `dopamiles-tokens.liquid`
   reads from a merchant setting. Static hex would be derived from today's
   default, not from the setting. How should they track?
   - Options: Compute in Liquid (Recommended) | Static hex, accept drift | CSS `color-mix()` with fallback
   - **Answer:** Compute in Liquid
   - **Rationale:** Matches the file's only idiom — merchant setting with a
     literal fallback — so the wash follows the accent instead of pinning to its
     current value. No new CSS feature, no iOS 16.2 floor. Costs one empirical
     check of the filter's weight direction.

2. **[Architecture]** The design turns the whole band green once a tier is met,
   which needs both wash tokens and couples the tint to the segment colour. What
   should green actually mean here?
   - Options: Segments only (Recommended) | Whole band, any tier | Whole band, top tier only
   - **Answer:** Segments only
   - **Rationale:** Green already means *banked* in the band's copy. Painting
     only the lit segments keeps that one meaning, drops `--dop-good-wash`
     entirely, and avoids putting the orange still-on-offer figure on a green
     ground from 2 tees onward.

3. **[Risks]** Segment count is one per unit up to `max_min`. The default table
   caps at 5, but the metafield is merchant-editable — a tier at `min: 50` emits
   50 segments across a 351px band, rebuilt on every cart mutation.
   - Options: Cap the loop at 10 (Recommended) | No cap | Cap at 10, continuous fill above
   - **Answer:** Cap the loop at 10
   - **Rationale:** One render path, bounded DOM, and arithmetically identical to
     per-unit at the default 2/3/5 table — Phase 02's ladder table holds
     unchanged. A second fill-bar path would double the tests for a state that
     does not exist today.

4. **[Assumptions]** Phase 01 adds a 320ms background transition plus a
   `prefers-reduced-motion` guard, and Phase 02 asserts the guard. `swapSection`
   destroys and rebuilds every node on each mutation, so the transition has no
   prior state to animate from.
   - Options: Drop both (Recommended) | Keep as written
   - **Answer:** Drop both
   - **Rationale:** Verified dead at `dopamiles-cart-mutations.js:50`. First
     paint, drawer open and section re-render all produce fresh nodes. Shipping a
     guard for an animation that cannot run makes the next reader believe the
     drawer animates.

#### Confirmed Decisions

- Wash token computed in Liquid from `settings.dop_accent` — follows the setting, not its default
- Green applies to lit segments only; band tint constant — one token, one meaning
- Segment loop capped at 10, proportional above — bounded DOM, ladder table unaffected
- Transition and reduced-motion guard dropped — provably unreachable

#### Impact on Phases

- **Phase 01:** one wash token instead of two, computed not literal; `seg_n` cap
  and ceiling-lit arithmetic added to Step 3; the `met` modifier now recolours
  segments only; Step 4 loses the transition and the guard.
- **Phase 02:** ladder table gains the cap rows; Step 2 asserts segment colour
  with the tint held constant; Step 5 swaps the reduced-motion assertion for a
  constant-tint assertion.

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-cover-the-meter-with-tests.md`
- Decision deltas checked: 4
- Reconciled stale references: 9 (`--dop-good-wash` removed from the token table
  and Todo; "whole band turns green" in three success-criteria lines; the
  transition in Phase 01 Step 4 and its Todo entry; the reduced-motion assertion
  in Phase 02 Steps 5 and 7 and its success criterion; open questions 1 and 2
  marked resolved)
- Unresolved contradictions: 0

<!-- slug: pod-tee-cart-drawer-v2-tier-meter-port -->
