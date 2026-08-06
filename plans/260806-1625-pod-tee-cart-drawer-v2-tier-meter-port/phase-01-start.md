---
title: "Phase 1: Build the meter into the band"
status: completed
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
- One segment per unit up to the highest threshold, capped at 10; segments fill
  by eligible quantity
- The lit segments turn green once any tier is earned; the band tint is warm
  throughout and does not change
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
.tier.met{background:#eaf5ee}                       /* NOT ported — Decision 7 */
.tier .top{display:flex;justify-content:space-between;align-items:baseline;
           font-size:13px;color:var(--ink-2)}
.tier .top .steps{font-family:var(--code);font-size:11px;color:var(--ink-3)}
.tier .track{height:5px;background:var(--line);border-radius:99px;
             display:flex;gap:3px;overflow:hidden}
.tier .seg{flex:1;background:var(--line);border-radius:99px;
           transition:background 320ms var(--ease)}  /* NOT ported — Decision 9 */
.tier .seg.on{background:var(--accent)}
.tier.met .seg.on{background:var(--good)}
```

Two lines are deliberately not ported.

`.tier.met` background: green means *banked* everywhere else in this band — the
copy already paints "Saved $9" green at tier 1. Flipping the whole panel would
also put the orange still-on-offer figure on a green ground from 2 tees onward.
Only the lit segments turn green, which is the one thing green is claiming.

The transition: `swapSection` is `dst.innerHTML = src.innerHTML`
(`assets/dopamiles-cart-mutations.js:50`), so every node inside
`#dop-cart-drawer-content` is destroyed and rebuilt on each cart mutation. New
elements paint at their final computed style — there is no prior state to
animate from, on any path. First paint, drawer open and section re-render all
behave the same way. The transition is unreachable, and so is the
`prefers-reduced-motion` guard it would need.

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

`--dop-page` gives way to the design's warm tint. One token, not two — with the
tint constant, the green state needs no wash of its own and reads `--dop-good`
directly on the lit segments.

| State | Design hex | Source |
|---|---|---|
| Band tint, always | `#fff8f4` | `--dop-accent-wash`, new |
| Lit segment, no tier yet | — | `--dop-accent`, exists |
| Lit segment, tier earned | `#eaf5ee`-adjacent | `--dop-good`, exists |

The new token goes in `snippets/dopamiles-tokens.liquid` beside `--dop-accent`.
It is code-only, not merchant-facing: the brand group already exposes the base
colour, and a merchant changing the accent should not have to find a second
wash setting.

**It must be computed, not literal.** Every colour in that file is
`settings.dop_X` with a literal fallback (`dopamiles-tokens.liquid:19-32`). A
hard-coded `#fff8f4` is derived from today's *default* accent `#F26419`, not
from the setting — change the accent to anything outside the orange family and
the band keeps a warm-orange tint under it. Deriving it from
`settings.dop_accent` is what makes the band read as a tinted state of the brand
rather than as a second, unrelated colour.

## Related Code Files

- Modify: `snippets/dopamiles-bundle-cart-band.liquid`
- Modify: `assets/dopamiles-bundle.css`
- Modify: `snippets/dopamiles-tokens.liquid` (one wash token)
- **Do not modify**: `snippets/dopamiles-bundle-tier-resolve.liquid`,
  `snippets/dopamiles-bundle-cart-bar.liquid` (the `top` layout's marker bar),
  `sections/dopamiles-cart-drawer.liquid`, anything in the footer

## Implementation Steps

### Step 1 — the wash token

`snippets/dopamiles-tokens.liquid`, in the brand colour block, following the
shape every line there already uses — setting first, literal only as fallback:

```liquid
--dop-accent-wash: {%- if settings.dop_accent != blank -%}
  {{ settings.dop_accent | color_modify: 'lightness', 98 }}
{%- else -%}#FFF8F4{%- endif -%};
```

**Not `color_mix` toward white.** Resolved against shopify.dev on 2026-08-06.
`color_mix`'s weight is the percentage of the piped-in colour, but no blend of
`#F26419` with white can reach `#FFF8F4` at all: that hex has R=255, and mixing
toward white from an R=242 accent only lowers R. The design's wash is a
hue-preserving tint — same hue, near-full saturation, 98% lightness.

`color_modify: 'lightness', 98` yields `#FEF8F4` from the default accent. One
unit of red off the design, and it carries hue *and* saturation, so a merchant
who moves the accent to another hue gets a wash in that hue rather than a
lightness-only approximation. `lightness` takes an integer 0–100; only `alpha`
turns hex output into `rgba()`, so the value stays a hex.

The fallback literal is the design's own `#FFF8F4`, so a store that has never
touched the setting renders the design's exact value.

No `--dop-good-wash`. With the tint constant (Decision 7) the green state lives
on the segments, and `--dop-good` already exists.

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

Step counter copy, right-aligned:
- next tier exists: `{{ eligible_qty }} / {{ max_min }}`
- at or past the top: `{{ eligible_qty }} tees`

<!-- Updated during implementation: denominator is max_min, not next_min -->
**The counter labels the track, so it counts to the track's denominator.**
Written against `next_min` it produced "2 / 3" beside a track two segments of
five full — two denominators six pixels apart, with nothing telling the reader
which one the bar was drawing. The next threshold is not lost: the sentence
directly above states it in money, which is the form that matters.

<!-- Updated during implementation: not monospace -->
**Not monospace, despite the design's `var(--code)`.** All four font tokens in
this theme resolve to General Sans first, so `--dop-code` is
`'General Sans', ui-monospace, monospace` and the first family wins.
`font-variant-numeric: tabular-nums` does the job the mono was there for — the
counter changes on every quantity step and must not reflow the row.

Segments: loop `(1..seg_n)`, marking `on` where the index is `<= lit`.

`seg_n` and `lit` are not `max_min` and `eligible_qty` directly, because the
tier table is a merchant metafield and nothing bounds it. A tier at `min: 50`
would emit 50 segments across a ~351px band, rebuilt on every cart mutation.
Cap the loop and scale into it:

```liquid
assign seg_n = max_min
if seg_n > 10
  assign seg_n = 10
endif
assign lit = eligible_qty | times: seg_n | plus: max_min | minus: 1 | divided_by: max_min
if lit > seg_n
  assign lit = seg_n
endif
```

Three properties worth stating, because the tests in Phase 02 assert them:

- **At `max_min <= 10` this is exactly per-unit.** `seg_n == max_min`, so the
  expression reduces to `eligible_qty` under Liquid's integer division. At the
  default 2/3/5 table nothing about the meter changes.
- **It rounds up, not down.** A shopper with 1 eligible tee against a 50-unit
  table lights one segment rather than none. Truncation would show an empty
  meter to someone who has already started.
- **The loop bound is the clamp.** `eligible_qty` legitimately exceeds `max_min` — 6 tees against
  a top threshold of 5 — and the ceiling would otherwise produce a 6th segment
  in a 5-segment track.

Guard `max_min` before any of this: zero or absent means `divided_by: 0` and a
`(1..0)` range. That state already renders nothing overall, but the guard must
be explicit so the track element is never emitted empty — an empty track still
paints a 5px grey rule across the band.

The `met` modifier goes on the wrapper when `current_cents > 0`. It recolours
the lit segments only; the band's tint does not change with it. One condition,
one visual consequence.

### Step 4 — CSS

`assets/dopamiles-bundle.css`. The band changes from a wrap row to a column:
`flex-direction: column; align-items: stretch; gap: 9px`. Keep `padding: 9px
12px`, keep `margin: 10px -18px 9px` — the full-bleed maths and the join to the
strip are both coupled to those numbers and are documented in place.

Background moves from `var(--dop-page, #fafafa)` to
`var(--dop-accent-wash, #fff8f4)` and stays there in every state.

Segment colours:

```css
.dop-bundle-cart-seg           { background: var(--dop-line, #e6e6e6); }
.dop-bundle-cart-seg.on        { background: var(--dop-accent, #f26419); }
.met .dop-bundle-cart-seg.on   { background: var(--dop-good, #2d7a4f); }
```

**No transition, and therefore no `prefers-reduced-motion` guard.** Both were in
the design and both are unreachable here — see Architecture. Adding a
reduced-motion block for an animation that cannot run tells the next reader the
drawer animates, and they will go looking for where.

Check the theme's actual hairline token name before writing `--dop-line`; the
fallback chain must degrade to a visible grey either way.

### Step 5 — sweep

`grep -rn "bnc-\|--bnc-" assets/ sections/ snippets/` must be empty. Check every
added CSS comment for a literal `*/` in the body: one makes the CDN minifier
parse zero rules from the file, silently, while passing theme-check.

Then `npm test` and `npx shopify theme check`, both clean before Phase 02.

## Todo

- [x] Add `--dop-accent-wash`, computed from `settings.dop_accent`
- [x] Wash uses `color_modify: 'lightness', 98`, not a literal and not `color_mix`
- [x] Band markup: top row, step counter, segmented track
- [x] `seg_n` cap at 10 and ceiling-scaled `lit`, bounded by the loop
- [x] `met` modifier driven by `current_cents > 0`, recolouring segments only
- [x] Guard an absent or zero `max_min` before the division and the range
- [x] CSS: column layout, constant wash, track, segment colours
- [x] Sweeps and both gates clean

## Success Criteria

- [x] Meter renders below the message inside the band
- [x] At the default table: segment count equals the top threshold, lit count equals eligible quantity
- [x] Above a top threshold of 10: exactly 10 segments, lit scaled and rounded up, never zero for a non-empty cart
- [x] Lit segments turn green once a tier is earned; the band tint is identical in both states
- [x] The wash resolves from `settings.dop_accent`, and equals `#FFF8F4` at the default accent
- [x] Step counter correct at 1, 2, 3, 4, 5 and 6 eligible tees
- [x] Zero eligible items renders nothing at all
- [x] A tier table with no usable entries renders nothing rather than an empty track
- [x] No transition and no `prefers-reduced-motion` block added
- [x] Fixed chrome unchanged — head and footer untouched
- [x] `top` layout renders exactly as before, marker bar intact
- [x] Band still has no CTA, no eyebrow, no rules, and stays adjacent to the strip
- [x] `npm test` 0 failures, `theme check` 0 offenses

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The meter drifts upward into fixed chrome | Stated in Architecture and in the plan's constraints. The band renders after the line-item loop inside `.dop-cart-lines`; moving it is a different change with a different gate |
| A wide tier table makes segments unreadable, or emits an unbounded loop | Resolved: `seg_n` caps at 10 and `lit` scales into it (Decision 4). The default table is three tiers over a top threshold of 5, giving 5 segments at ~60px on a 375px screen |
| `max_min` of 0 emits a `(1..0)` range **and a `divided_by: 0`** | Step 3 requires the guard before both, Phase 02 asserts it. An absent or unparseable tier table is already a real state the resolver returns zeros for |
| The wash filter is wrong and nobody notices | Resolved before implementation: `color_modify: 'lightness', 98`, verified against shopify.dev including the value range and the hex-vs-rgba output rule. `color_mix` toward white is arithmetically incapable of producing the design's hex and was rejected on that basis, not on preference |
| The wash is "simplified" back to a literal hex later | Phase 02 Step 5 asserts the token reads `settings.dop_accent`. The literal fallback is the correct value at the default accent, so the drift is invisible on this store until the setting changes — which is exactly why a test, not a comment, guards it |

<!-- Updated: Validation Session 1 - one computed wash token, segments-only green, 10-segment cap, transition dropped -->
| The band's copy gets edited while restructuring | The copy, the accent/green split, the verb agreement and the em-dash ban are all locked by existing tests in `tests/cart-bundle-band.test.js`. They must stay green without being edited |
| The join to the strip breaks | `.dop-bundle-cart-band + .dop-cart-recs` keys on adjacency, and a test asserts nothing is emitted between them. The band's own bottom margin is unchanged |
