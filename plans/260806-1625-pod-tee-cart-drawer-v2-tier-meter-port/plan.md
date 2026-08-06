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
| 2 | What is ported | The segmented meter's visual language only: warm tint, green-on-met, segmented track, right-aligned step counter |
| 3 | Footer | **Unchanged.** No total-on-button, no protection switch, no trust line, no per-line was/now pricing |
| 4 | Segment count | One segment per unit up to the highest threshold (`max_min`, default 5), lit by eligible quantity. Not one per tier: three segments give a shopper at 1 tee no feedback at all |
| 5 | `top` layout | Keeps its existing marker bar. Two treatments, deliberately — the meter belongs to the layout that ships |
| 6 | Ship path | Folds into `260806-1245` Phase 03. This plan has no ship phase |

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

- [ ] Meter renders in the band with one segment per unit to the top threshold
- [ ] Segments fill by eligible quantity; the whole band turns green once a tier is earned
- [ ] Step counter states progress toward the next threshold
- [ ] Zero eligible items renders nothing at all — no empty tinted strip, no bare meter
- [ ] Fixed chrome is byte-for-byte unchanged; the meter lives in the scroll area
- [ ] `top` layout untouched, marker bar intact
- [ ] The band still carries no CTA and no eyebrow
- [ ] Adjacency to `.dop-cart-recs` preserved
- [ ] `npm test` 0 failures, `theme check` 0 offenses

## Open Questions

1. **Segment count at a non-default tier table.** Decision 4 uses `max_min`,
   which the resolver already returns. A merchant configuring 8 tiers would get
   8 segments at ~35px each on a 375px screen. Acceptable, or cap the count?
2. **Green-on-met threshold.** "Met" is read as *any* tier earned
   (`current_cents > 0`). The alternative is green only at the top threshold.
   The first rewards sooner; the second keeps green meaningful.
3. **Whether the `top` layout should eventually get the meter too.** Decision 5
   says no, on the grounds that it is the rollback path. If it stops being that,
   revisit.

<!-- slug: pod-tee-cart-drawer-v2-tier-meter-port -->
