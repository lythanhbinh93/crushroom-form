---
title: "Phase 3: Move the strip counter below the cards"
status: completed
phase: 3
priority: P2
effort: "0.5h"
dependencies: []
---

# Phase 3: Move the strip counter below the cards

## Overview

When the offer band acts as the strip's heading, the row above the cards holds
only the slide counter and its chevrons. Move that row below the cards so the
artwork tucks under the band instead of being held off it by an empty row.

**Independent of phases 01 and 02.** Run it first: phase 02 asserts the strip's
rendered shape, and writing those assertions before this move means writing them
twice.

## Requirements

**Functional**
- With `suppress_heading` true, the counter row renders **after** the card row
- With a heading present, nothing changes — the row stays above the cards
- The single-slide case still renders no row at all
- The fetch-swap path behaves identically

**Non-functional**
- The row stays inside `.dop-cart-recs`. It must not move into the band
- One snippet, one stylesheet. No section change, no JS change
- No new locale key

## Architecture

`.dop-cart-recs-top` currently renders before `.dop-cart-recs-row` in every
case. Suppressed, it contains only `.dop-cart-recs-nav`, pushed right by
`--nohead`'s `justify-content: flex-end`. Between a full-bleed tinted band and
96px artwork, a row with one right-aligned control reads as a gap.

Below the cards it reads as a caption on the strip it describes, and the cards
land at the band's own 9px bottom margin.

**Why not merge it into the band, as the v2 design does.** Two independent
reasons:

1. Phase 01 puts the meter's step counter in the band's top-right. A merged nav
   fights it for the same corner.
2. `loadRelatedRecs` replaces only the strip — `strip.replaceWith(fresh)`,
   `assets/dopamiles-cart.js:453`. Chevrons living in the surviving band would
   keep addressing a scroller that no longer exists. Dead arrows after every
   refresh.

Keeping the row inside the strip means both swap paths carry it: the
`replaceWith` above, and the whole-content `dst.innerHTML = src.innerHTML` at
`assets/dopamiles-cart-mutations.js:50`.

The fetch target `sections/dopamiles-cart-recs-shopify.liquid` renders the same
snippet with the same suppression logic, so this is one change in one file.

## Related Code Files

- Modify: `snippets/dopamiles-cart-recs.liquid`
- Modify: `assets/dopamiles-cart.css`
- Modify: `tests/cart-recs.test.js`
- **Do not modify**: `sections/dopamiles-cart-drawer.liquid`,
  `sections/dopamiles-cart-recs-shopify.liquid`, `assets/dopamiles-cart.js`,
  `snippets/dopamiles-bundle-cart-band.liquid`

## Implementation Steps

### Step 1 — capture the row, emit it on the right side of the cards

Capture the existing `.dop-cart-recs-top` block instead of echoing it in place,
then emit it before the card row when a heading is present and after it when the
heading is suppressed. Capturing rather than duplicating keeps one copy of the
counter markup; two copies is how the two arms drift.

The existing gate stays exactly as it is — suppressed heading plus a
single-slide strip still renders no row:

```liquid
{%- unless recs_suppress_head and recs_show_nav == false -%}
```

### Step 2 — the margin flips

`.dop-cart-recs-top` carries `margin-bottom: 12px`, which separates it from the
cards below. Below the cards that margin points the wrong way.

Add a modifier alongside `--nohead` rather than overloading it: the heading can
be suppressed in a layout that does not move the row, and one class should not
mean two things.

```css
.dop-cart-recs-top--below { margin-bottom: 0; margin-top: 12px; }
```

### Step 3 — check the join is still keyed on adjacency

`.dop-bundle-cart-band + .dop-cart-recs` (`assets/dopamiles-cart.css:684`) keys
on the band and the strip being siblings. This change moves a child **inside**
the strip, so the selector is untouched. Confirm by reading it, and confirm
nothing new is emitted between the band and the strip.

### Step 4 — gates

```bash
npm test
npx shopify theme check
```

## Testing

`tests/cart-recs.test.js` already renders this snippet and already covers the
suppression flex traps. Extend it:

- suppressed: the counter's index in the rendered output is **after** the card
  row's. Assert on order, not on presence — presence passes in both layouts
- not suppressed: order unchanged, row still first
- suppressed and single-slide: still no row at all, no stray modifier class
- `--below` appears only together with `--nohead`

Order is the whole behaviour here, so a test that only asserts the class would
pass against markup that never moved.

## Todo

- [x] Capture the top row and emit it on the correct side
- [x] Add `--dop-cart-recs-top--below` margin flip
- [x] Confirm the adjacency join is untouched
- [x] Tests: order in both arms, single-slide, modifier pairing
- [x] Both gates clean

## Success Criteria

- [x] Suppressed: counter renders after the cards, cards sit 9px under the band
- [x] Not suppressed: heading and counter render above the cards, unchanged
- [x] Single-slide suppressed strip renders no row
- [x] `--below` never appears without `--nohead`
- [x] Band-to-strip adjacency selector unchanged and still matching
- [x] Fetch path renders identically to the section path
- [x] `npm test` 0 failures, `theme check` 0 offenses

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The counter is duplicated rather than moved | Step 1 captures once and emits once. A test asserts exactly one counter in the output |
| `--nohead` is overloaded to also mean "below" | Step 2 adds a separate modifier. Suppression and position are different facts |
| The test asserts presence, so it passes without the move | Testing section requires asserting index order of the counter against the card row |
| The fetch path diverges | It renders the same snippet with the same args; no section-level change is made. A test renders both scopes |
