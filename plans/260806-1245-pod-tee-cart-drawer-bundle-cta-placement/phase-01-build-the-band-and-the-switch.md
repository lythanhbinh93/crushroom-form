---
phase: 1
title: "Build the band and the switch"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Build the band and the switch

## Overview

Add the theme-global position setting, a band snippet that renders the offer
from the drawer section, and the wiring that lets the band fill the
recommendation strip's heading slot without the offer ever depending on the
strip rendering.

## Requirements

**Functional**
- `dop_cart_bundle_cta_position` — theme-global select, default `below_items`
- `below_items`: band below the line items, filling the strip's heading slot;
  top headline not rendered
- `top`: today's drawer, unchanged; band not rendered
- The band renders whenever the resolver has something to say, whether or not
  the recs strip renders

**Non-functional**
- The band never renders from inside `dopamiles-cart-recs.liquid`
- No new locale keys; no new arithmetic
- No `bnc-` string, no `*/` inside a ported comment
- `dop_cart_show_stack_save_bar` stays orthogonal and keeps gating the bar

## Architecture

Today the drawer renders the headline **above** `.dop-cart-lines`
(`cart-drawer.liquid:152`) and the recs strip **inside** it. The change:

```
below_items                            top (today)
─────────────────────────────────      ─────────────────────────────────
head                                   head
.dop-cart-lines                        .dop-cart-lines
  line items                             ┌ bundle-cart-headline  ← above
  ┌ BAND  ← section renders it           line items
  └ recs cards (heading suppressed)      recs strip (own heading)
foot                                   foot
```

**The band owns the heading slot; the strip does not own the band.** The
section renders the band, then passes `suppress_heading: true` into the recs
snippet. If the band did not render — no eligible items — the strip falls back
to its own muted heading. This is the coupling constraint from `plan.md`, and it
is the reason the band is a separate snippet rather than an edit to the recs
heading.

Rendering the band **outside** `.dop-cart-lines` was considered and rejected: it
would put it back into the fixed chrome the footer trim just spent a day
reducing. Inside the scroll area it costs nothing at short viewports.

## Related Code Files

- Create: `snippets/dopamiles-bundle-cart-band.liquid`
- Modify: `sections/dopamiles-cart-drawer.liquid`
- Modify: `snippets/dopamiles-cart-recs.liquid` (accept and honour `suppress_heading`)
- Modify: `config/settings_schema.json`
- Modify: `assets/dopamiles-bundle.css`
- **Do not modify**: `snippets/dopamiles-bundle-tier-resolve.liquid` — the band
  reads its output, never its logic

## Implementation Steps

### Step 0 — correct the stale claim in the sibling plan

`plans/260725-1940-.../plan.md` states live holds none of the new recs keys, so
the strip renders hidden and quick-view is not rendered — verified 2026-07-30.
Live now has `dop_cart_recs_source`, `_collection`, `_end_collection`,
`_per_view`, `_atc`, `_atc_color`. Correct it in place with the new date; do not
delete the original claim, mark it superseded.

This matters beyond tidiness: that claim is the stated reason the strip was safe
to ship, and anyone reading it today would draw the wrong conclusion about
production.

### Step 1 — the setting

`config/settings_schema.json`, in the existing **Cart drawer widgets** block
under the `UpCart` group (alongside `dop_cart_show_stack_save_bar`, which already
carries the paragraph explaining why these live theme-global):

```json
{
  "type": "select",
  "id": "dop_cart_bundle_cta_position",
  "label": "Bundle offer position",
  "default": "below_items",
  "options": [
    { "value": "below_items", "label": "Below the bag (heads the recommendations)" },
    { "value": "top", "label": "Above the bag (classic band)" }
  ],
  "info": "Below the bag states the offer once, as the heading of the recommendation strip. Above the bag is the original layout, where the offer also appears in the recommendation heading."
}
```

Theme-global, not section-level. What licenses that is the mutation matrix in
`plans/260725-1940-.../phase-04-qa-and-ship.md`, run 2026-07-30: merchant-saved
theme-global values survived two consecutive `?sections=` re-renders, while the
section-block picks they replaced did not. See § Validation Log in `plan.md`.

**Default carries a live consequence.** `below_items` means the layout changes
for every shopper the moment this reaches live. That was decision 2, taken
deliberately; it is not an accident to be discovered in Phase 03.

### Step 2 — the band snippet

`snippets/dopamiles-bundle-cart-band.liquid`. Same resolver contract as
`dopamiles-bundle-cart-headline.liquid` — read that file first; it documents the
field order and the counting rules, and this snippet must not restate them.

States, from decision 6 and matching the corrected headline in `a84c6a3`:

| Resolver state | Band |
|---|---|
| No eligible items | render **nothing** — no wrapper, no empty band |
| Nothing earned yet | `Add {needed} more tee(s) — save {next}` |
| Tier earned, another above | `✓ Saved {now}` · `Add {needed} more tee(s) — save {next}` |
| At/past top threshold | `✓ Saved {now}` · `{rate} off every extra tee` |

Markup, mirroring the headline's structure so the existing `.success` styling
applies (that selector was fixed in `a84c6a3` to match the descendant form):

```liquid
<div class="dop-bundle-cart-band">
  <span class="dop-bundle-cart-band-eyebrow">Bundle</span>
  <p class="dop-bundle-cart-msg">…</p>
</div>
```

Reusing `.dop-bundle-cart-msg` is deliberate: the green/accent split is defined
once and both surfaces inherit it. Do not fork the colour rules.

### Step 3 — wire the drawer section

`sections/dopamiles-cart-drawer.liquid`:

```liquid
{%- assign dop_cta_pos = settings.dop_cart_bundle_cta_position | default: 'below_items' -%}
```

Use `| default:` rather than trusting the schema default — the key is absent
from live's `settings_data.json` until the merchant saves, exactly as
`dop_cart_show_stack_save_bar` is today.

- At the current headline render (`:152`): wrap in `{%- if dop_cta_pos == 'top' -%}`
- After the line-item `{%- endfor -%}` and **before** the recs render: render
  `dopamiles-bundle-cart-band` when `dop_cta_pos == 'below_items'`
- Capture whether the band produced output, and pass that into the recs snippet
  as `suppress_heading`. Capture-and-test, not re-derive: asking the resolver
  twice invites the two answers to drift

```liquid
{%- capture dop_band -%}{%- render 'dopamiles-bundle-cart-band' -%}{%- endcapture -%}
{{ dop_band }}
{%- assign dop_band_shown = false -%}
{%- if dop_band | strip != blank -%}{%- assign dop_band_shown = true -%}{%- endif -%}
```

### Step 3b — leave the empty-cart branch alone

`dopamiles-cart-recs` is rendered **twice**: `context: 'items'` at `:278` and
`context: 'empty'` at `:423`. Only the items branch gets the band and
`suppress_heading`.

An empty cart has no bundle-eligible items, so the resolver returns nothing and
the band renders nothing (decision 3). The empty-state strip therefore keeps its
own heading, exactly as today. Put the band render inside the items branch only —
do not hoist it somewhere that reaches both.

`context` currently affects only a CSS modifier class (`cart-recs.liquid:77`,
`:317`), so `suppress_heading` is a new orthogonal argument rather than an
overload of an existing one.

### Step 4 — honour `suppress_heading` in the recs snippet

`snippets/dopamiles-cart-recs.liquid` around line 320. When `suppress_heading`
is true, skip the `dop_recs_heading_next_html` / `_saved_html` branches and the
muted default — render the cards with no heading, because the band above is the
heading.

**Do not touch the `picked_n > 0` gate or the enabled gate.** They stay exactly
as they are. The band's independence comes from being rendered by the section,
not from loosening the strip's conditions.

### Step 5 — CSS

`assets/dopamiles-bundle.css`. The band sits inside `.dop-cart-lines`, which has
18px horizontal padding, and reads as a full-bleed row:

```css
.dop-bundle-cart-band {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 9px 12px;
  margin: 4px -18px 9px;          /* full-bleed against the list's padding */
  background: var(--dop-page, #fafafa);
  border-top: 1px solid var(--dop-line, #e8e8e8);
  border-bottom: 1px solid var(--dop-line, #e8e8e8);
}
.dop-bundle-cart-band-eyebrow {
  font-family: var(--dop-code, 'JetBrains Mono', monospace);
  font-size: 9.5px;
  letter-spacing: .14em;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--dop-accent, #f26419);
  flex-shrink: 0;
}
```

The `-18px` side margin is coupled to `.dop-cart-lines`' padding, which the
footer trim changed from 22px to 18px today. Comment the dependency; a future
padding change silently breaks the bleed.

Longest string is ~39 characters and fits one line at 375px. Let it **wrap**, not
truncate — a truncated money figure is worse than a two-line band.

### Step 6 — sweep

```bash
grep -rn "bnc-\|--bnc-" assets/ sections/ snippets/     # must be empty
```

Check every added CSS comment for a literal `*/` inside the body — one makes the
CDN minifier parse zero rules from the file, silently, while passing theme-check.

Then `npm test` and `npx shopify theme check`. Both must be clean before Phase 02
adds coverage; a failure here is a build error, not a coverage gap.

## Success Criteria

- [ ] `260725-1940` corrected; the superseded claim marked, not deleted
- [ ] `dop_cart_bundle_cta_position` in the theme-global Cart drawer widgets block, default `below_items`
- [ ] `snippets/dopamiles-bundle-cart-band.liquid` exists and renders all four states
- [ ] No eligible items → band renders **nothing**, not an empty wrapper
- [ ] `top` renders today's drawer with no band
- [ ] The empty-cart branch (`context: 'empty'`) is untouched — no band, heading intact
- [ ] `below_items` renders the band below the items with the strip heading suppressed
- [ ] The band is rendered by the section — zero band markup inside `cart-recs.liquid`
- [ ] `picked_n > 0` and `dop_cart_recs_enabled` gates unchanged
- [ ] `.dop-bundle-cart-msg` reused; no forked colour rules
- [ ] Sweep clean; `npm test` 0 failures; `theme check` 0 offenses

## Results

| Check | Result |
|---|---|
| Commits | |
| `260725-1940` corrected | |
| `npm test` / `theme check` | |

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Someone "simplifies" the band into the recs heading | The coupling constraint is stated in `plan.md`, in this phase's Architecture, and in Step 4. It is the single defect this design exists to avoid |
| The band and the suppressed heading disagree about whether the band rendered | Step 3 captures the band's output and tests it, rather than re-deriving the condition from the resolver in two places |
| The full-bleed margin breaks when list padding changes | Step 5 requires a comment naming the dependency. The padding moved 22→18px today, so this is a live hazard, not a hypothetical |
| The default silently changes the live layout | Called out in Step 1 and in decision 2. Phase 03 pushes to preview first, and the switch itself is the rollback |
| Copy drifts from the headline's | Both surfaces render the same four states from the same resolver and share `.dop-bundle-cart-msg`. Phase 02 asserts them against each other |
