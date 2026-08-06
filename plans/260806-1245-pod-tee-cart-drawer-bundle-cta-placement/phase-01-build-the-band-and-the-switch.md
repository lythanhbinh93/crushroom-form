---
phase: 1
title: "Build the band and the switch"
status: completed
priority: P1
effort: "3.5h"
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
- `dop_cart_show_stack_save_bar` gates the tier progress bar in **both**
  layouts — under `below_items` the bar renders inside the band

**Non-functional**
- The band never renders from inside `dopamiles-cart-recs.liquid`
- No new locale keys; no new arithmetic
- No `bnc-` string, no `*/` inside a ported comment
- The bar's markup and marker arithmetic exist in exactly one place

## Architecture

Today the drawer renders the headline **above** `.dop-cart-lines`
(`cart-drawer.liquid:152`; the list opens at `:157`) and the recs strip
**inside** it (`:278`, immediately before the list's closing tag). The change:

```
below_items                            top (today)
─────────────────────────────────      ─────────────────────────────────
head                                   head
                                       bundle-cart-headline  ← fixed chrome
.dop-cart-lines  (scrolls)             .dop-cart-lines  (scrolls)
  line items                             line items
  ┌ BAND  ← section renders it           recs strip (own heading)
  └ recs cards (heading suppressed)
foot                                   foot
```

The headline is a sibling **above** the scroller, not a child of it. That is
what makes `below_items` a fixed-chrome reduction rather than a reshuffle, and
it is the basis of Phase 03's measurement expectation.

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
- Create: `snippets/dopamiles-bundle-cart-bar.liquid` — the tier progress bar,
  extracted so both the headline and the band render one copy
- Modify: `sections/dopamiles-cart-drawer.liquid`
- Modify: `snippets/dopamiles-cart-recs.liquid` (accept and honour `suppress_heading`)
- Modify: `snippets/dopamiles-bundle-cart-headline.liquid` (render the extracted
  bar instead of holding it inline — no behaviour change)
- Modify: `config/settings_schema.json`
- Modify: `assets/dopamiles-bundle.css`
- Modify: `assets/dopamiles-cart.css` (the `--nohead` recs-top modifier)
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
  {%- comment -%} bar, when show_bar {%- endcomment -%}
</div>
```

Reusing `.dop-bundle-cart-msg` is deliberate: the green/accent split is defined
once and both surfaces inherit it. Do not fork the colour rules.

**No CTA link in the band, and that is a decision.** All four headline states
carry `<a class="dop-bundle-cart-cta">`, because the headline sits above the
list with nothing actionable near it. The band sits directly on top of the
recommendation cards, which each link to a product — the action is already
there, twice over. A CTA in the band would be a third call inside ~60px. Phase
02 asserts the band has **no** `.dop-bundle-cart-cta`, so the omission is
locked rather than left to look like an oversight.

### Step 2b — extract the tier progress bar

`dop_cart_show_stack_save_bar` defaults to **true** and is live today. The bar
is rendered inside `dopamiles-bundle-cart-headline.liquid` (its `show_bar` arg),
so wrapping the headline in `{%- if dop_cta_pos == 'top' -%}` would delete the
bar from the default layout — a checked merchant setting silently doing nothing.
The two settings must stay orthogonal, so the band renders the bar too.

Move the bar block out of the headline into
`snippets/dopamiles-bundle-cart-bar.liquid`, taking the three values it needs as
render args:

```liquid
{%- render 'dopamiles-bundle-cart-bar',
    tier_basis: tier_basis, eligible_qty: eligible_qty, max_min: max_min -%}
```

Args, not a second resolver call: each surface already resolves once, and a
snippet that re-resolves would let the bar and the copy above it disagree.

The marker arithmetic moves **verbatim**, including its comments. This is an
extraction, not a rewrite — Phase 02 asserts the headline's bar output is
byte-identical to what it rendered before.

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

**`.dop-cart-recs-top` breaks two ways when the heading leaves.** It is
`display:flex; justify-content: space-between` with `margin-bottom: 12px`
(`dopamiles-cart.css:656`); the heading is `flex: 1 1 auto` and the `1 / 17`
nav is `flex: 0 0 auto`. Removing the heading alone therefore:

1. leaves the nav as the only child of a `space-between` row, which slides it
   to the **left** edge — it sits right today;
2. on a single-slide strip renders an **empty** flex row that still carries its
   12px bottom margin, as `recs_slides > 1` already suppresses the nav.

So: add a `.dop-cart-recs-top--nohead { justify-content: flex-end; }` modifier
for case 1, and skip the wrapper entirely when suppressed **and** `recs_slides
<= 1` for case 2. Neither is visible in Liquid — both are CSS consequences of
deleting one child from a flex row.

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
- [ ] The band carries **no** `.dop-bundle-cart-cta` — the cards below it are the action
- [ ] Bar extracted to one snippet; `dop_cart_show_stack_save_bar` still gates it in **both** layouts
- [ ] Headline's bar output unchanged by the extraction
- [ ] Suppressed heading does not strand the nav left or leave an empty 12px row
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
| Commits | 1, local only — branch `feat/cart-drawer-chrome-260806` has no upstream |
| `260725-1940` corrected | Yes — frontmatter already carried it; the **body** at `plan.md:165` did not, and that is the site people read. Superseded block added inline, original kept |
| `npm test` / `theme check` | 245 pass / 0 fail · 239 files / 0 offenses (237 before; the two new snippets) |
| `bnc-` and `*/` sweeps | Both empty |
| Liquid parse check | All 5 touched files parse. **Found the one real defect** — see below |

**The plan's own Step 3 snippet was invalid Liquid.** `{%- if dop_band | strip != blank -%}`
is a parse error: Liquid does not accept a filter inside an `if` condition.
`theme check` reported 0 offenses on it, because it does not evaluate Liquid.
Caught by parsing the file through liquidjs, not by either standard gate.
Shipped form assigns the filtered value first, then tests the variable.

**Bar extraction verified, not merely uncontradicted.** `tests/cart-headline.test.js`
already asserts marker labels, fill width, hit states, `show_bar: false`, and
out-of-order tier metafields. All of it passes through the extracted snippet
unchanged, so the extraction is proven output-identical by tests that predate it.

**Band states, rendered:**

| Eligible tees | Copy | Bar | CTA |
|---|---|---|---|
| 0 | *renders nothing* | — | — |
| 1 | `Add 1 more tee — save $4` | yes | none |
| 2 | `Saved $4 · Add 1 more tee — save $9` | yes | none |
| 3 | `Saved $9 · Add 2 more tees — save $25` | yes | none |
| 5 | `Saved $25 · $5 off every extra tee` | yes | none |
| 6 | `Saved $30 · $5 off every extra tee` | yes | none |

**`suppress_heading`, rendered:**

| Case | `-head` | `-top` row | `--nohead` | nav |
|---|---|---|---|---|
| multi-slide, shown | yes | yes | no | yes |
| multi-slide, suppressed | no | yes | **yes** | yes |
| single-slide, shown | yes | yes | no | no |
| single-slide, suppressed | no | **no** | — | no |
| arg omitted (`top` layout) | yes | yes | no | yes |

Last row is the regression check: with the argument absent the strip renders
exactly as before, so the `top` layout is untouched.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Someone "simplifies" the band into the recs heading | The coupling constraint is stated in `plan.md`, in this phase's Architecture, and in Step 4. It is the single defect this design exists to avoid |
| The band and the suppressed heading disagree about whether the band rendered | Step 3 captures the band's output and tests it, rather than re-deriving the condition from the resolver in two places |
| The full-bleed margin breaks when list padding changes | Step 5 requires a comment naming the dependency. The padding moved 22→18px today, so this is a live hazard, not a hypothetical |
| The default silently changes the live layout | Called out in Step 1 and in decision 2. Phase 03 pushes to preview first, and the switch itself is the rollback |
| Copy drifts from the headline's | Both surfaces render the same four states from the same resolver and share `.dop-bundle-cart-msg`. Phase 02 asserts them against each other |
| The extraction changes the bar's rendered output | The block moves verbatim, comments included, and takes as args the three values it read from enclosing scope. Phase 02 asserts the headline's bar output against the pre-extraction markup |
| A checked merchant setting silently does nothing | Found while scouting: the bar lives inside the headline, so hiding the headline would have deleted it from the default layout. The bar now renders in both. This is why `--advice` ran before the code |
