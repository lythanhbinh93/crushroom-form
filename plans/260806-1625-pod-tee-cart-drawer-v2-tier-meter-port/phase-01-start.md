---
title: "Phase 1: Build the meter into the band"
status: todo
phase: 1
priority: P2
effort: "2.5h"
dependencies: []
---

# Phase 1: Build the meter into the band

## Overview

Add a segmented progress meter to the below-items offer band, using the visual
language of `.tier` in the UX team's Cart Drawer v2. The band's copy, position,
and coupling all stay exactly as they are.

## Requirements

**Functional**
- The band renders its existing message, plus a right-aligned step counter and a
  segmented track beneath it
- One segment per unit up to the highest threshold; segments fill by eligible
  quantity
- The band turns green once any tier is earned; warm tint before that
- Zero eligible items renders **nothing** — no wrapper, no bare meter

**Non-functional**
- No new resolver field, no new arithmetic, no new locale key
- Fixed chrome unchanged: everything here is inside `.dop-cart-lines`
- The band stays emitted by the section, carries no CTA, carries no eyebrow
- Nothing is emitted between the band and `.dop-cart-recs`

## Architecture

The design's `.tier` block, which was never rendered in the prototype and
therefore exists only as a CSS spec:

```css
.tier{padding:13px 22px;background:#fff8f4;border-bottom:1px solid var(--line);
      display:flex;flex-direction:column;gap:9px}
.tier.met{background:#eaf5ee}
.tier .top{display:flex;justify-content:space-between;align-items:baseline;
           font-size:13px;color:var(--ink-2)}
.tier .top .steps{font-family:var(--code);font-size:11px;color:var(--ink-3)}
.tier .track{height:5px;background:var(--line);border-radius:99px;
             display:flex;gap:3px;overflow:hidden}
.tier .seg{flex:1;background:var(--line);border-radius:99px;
           transition:background 320ms var(--ease)}
.tier .seg.on{background:var(--accent)}
.tier.met .seg.on{background:var(--good)}
```

Ported, the band becomes a column rather than a row:

```
.dop-bundle-cart-band            (column, gap 9px, full-bleed, tinted)
  .dop-bundle-cart-band-top      (row: message left, step counter right)
    p.dop-bundle-cart-msg
    span.dop-bundle-cart-steps
  .dop-bundle-cart-track
    span.dop-bundle-cart-seg  x N
```

**This costs height in the scroll area and none in fixed chrome.** That is the
whole reason the offer sits below the bag; the same meter mounted under the
header would cost ~60px at every viewport. Do not move it up.

`--dop-page` gives way to the design's two tints. Both need theme tokens rather
than raw hex, and neither exists yet:

| State | Design hex | Token to add |
|---|---|---|
| Not yet earned | `#fff8f4` | `--dop-accent-wash` |
| Tier earned | `#eaf5ee` | `--dop-good-wash` |

Add them in `snippets/dopamiles-tokens.liquid` beside `--dop-accent` and
`--dop-good`. They are code-only, not merchant-facing — the brand group already
exposes the two base colours and a merchant changing the accent should not have
to find a second wash setting.

## Related Code Files

- Modify: `snippets/dopamiles-bundle-cart-band.liquid`
- Modify: `assets/dopamiles-bundle.css`
- Modify: `snippets/dopamiles-tokens.liquid` (two wash tokens)
- **Do not modify**: `snippets/dopamiles-bundle-tier-resolve.liquid`,
  `snippets/dopamiles-bundle-cart-bar.liquid` (the `top` layout's marker bar),
  `sections/dopamiles-cart-drawer.liquid`, anything in the footer

## Implementation Steps

### Step 1 — the two wash tokens

`snippets/dopamiles-tokens.liquid`, in the brand colour block. Derived from the
accent and good hues, not invented: they are the same colours at very low
chroma, which is what makes the band read as a tinted state of the brand rather
than as a new colour.

### Step 2 — the resolver fields the meter needs

All already returned; no resolver change. From
`dopamiles-bundle-tier-resolve.liquid`, by index:

| Index | Meaning | Used for |
|---|---|---|
| `[1]` | eligible quantity | segments lit |
| `[3]` | current per-unit amount in cents | "met" test |
| `[4]` | next threshold | step counter |
| `[6]` | units still needed | step counter |
| `[9]` | highest threshold | segment count |

The band already reads `[3]`, `[4]` and `[6]`. Phase 01 of the sibling plan
removed `[1]` and `[9]` as unused when the bar left the band; they come back.

### Step 3 — markup

Wrap the existing `<p class="dop-bundle-cart-msg">` in a row with the counter,
then the track. Do **not** restructure the message itself — the copy, the
green/accent split and the verb agreement are all locked by tests.

Step counter copy, mono, right-aligned:
- next tier exists: `{{ eligible_qty }} / {{ next_min }}`
- at or past the top: `{{ eligible_qty }} tees`

Segments: loop `(1..max_min)`, marking `on` where the index is `<= eligible_qty`.
Guard `max_min` — a zero or absent tier table must fall back rather than emit a
`(1..0)` range.

The `met` modifier goes on the wrapper when `current_cents > 0`, so the tint and
the segment colour flip together from one condition.

### Step 4 — CSS

`assets/dopamiles-bundle.css`. The band changes from a wrap row to a column:
`flex-direction: column; align-items: stretch; gap: 9px`. Keep `padding: 9px
12px`, keep `margin: 10px -18px 9px` — the full-bleed maths and the join to the
strip are both coupled to those numbers and are documented in place.

`transition: background 320ms` on the segments is worth keeping: the meter is
re-rendered by the Section Rendering API after a quantity change, so the
transition only fires on first paint. Harmless, and it costs nothing.

Add a `prefers-reduced-motion` guard anyway — the theme has one convention for
this and a new transition should follow it.

### Step 5 — sweep

`grep -rn "bnc-\|--bnc-" assets/ sections/ snippets/` must be empty. Check every
added CSS comment for a literal `*/` in the body: one makes the CDN minifier
parse zero rules from the file, silently, while passing theme-check.

Then `npm test` and `npx shopify theme check`, both clean before Phase 02.

## Todo

- [ ] Add `--dop-accent-wash` and `--dop-good-wash`
- [ ] Band markup: top row, step counter, segmented track
- [ ] `met` modifier driven by `current_cents > 0`
- [ ] Guard an absent or zero `max_min`
- [ ] CSS: column layout, track, segments, reduced-motion guard
- [ ] Sweeps and both gates clean

## Success Criteria

- [ ] Meter renders below the message inside the band
- [ ] Segment count equals the highest threshold; lit count equals eligible quantity
- [ ] Band and segments turn green together once a tier is earned
- [ ] Step counter correct at 1, 2, 3, 4, 5 and 6 eligible tees
- [ ] Zero eligible items renders nothing at all
- [ ] An absent tier table renders nothing rather than an empty track
- [ ] Fixed chrome unchanged — head and footer untouched
- [ ] `top` layout renders exactly as before, marker bar intact
- [ ] Band still has no CTA, no eyebrow, no rules, and stays adjacent to the strip
- [ ] `npm test` 0 failures, `theme check` 0 offenses

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The meter drifts upward into fixed chrome | Stated in Architecture and in the plan's constraints. The band renders after the line-item loop inside `.dop-cart-lines`; moving it is a different change with a different gate |
| A wide tier table makes segments unreadable | Open question 1. The default table is three tiers over a top threshold of 5, giving 5 segments at ~60px on a 375px screen |
| `max_min` of 0 emits a `(1..0)` range | Step 3 requires the guard, Phase 02 asserts it. An absent or unparseable tier table is already a real state the resolver returns zeros for |
| The band's copy gets edited while restructuring | The copy, the accent/green split, the verb agreement and the em-dash ban are all locked by existing tests in `tests/cart-bundle-band.test.js`. They must stay green without being edited |
| The join to the strip breaks | `.dop-bundle-cart-band + .dop-cart-recs` keys on adjacency, and a test asserts nothing is emitted between them. The band's own bottom margin is unchanged |
