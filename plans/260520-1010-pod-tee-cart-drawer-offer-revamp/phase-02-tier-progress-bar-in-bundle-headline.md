---
phase: 2
title: "Tier progress bar in bundle headline"
status: complete
priority: P1
effort: "45m-1h"
dependencies: [1]
---

# Phase 2: Tier progress bar in bundle headline

## Overview

Port the PDP's `dop-stack-bar` visual (markers at 2/3/5, current cart fill) into `snippets/dopamiles-bundle-cart-headline.liquid`. SSR-only — Dawn's `/cart/update.js` returns rendered section HTML on every cart mutation, so no client-side JS is needed for the bar to stay in sync. Bar renders BELOW the headline copy + CTA, conditionally on the `show_bar` render arg from Phase 1.

## Requirements

- Functional: when `show_bar = true` AND `eligible_qty > 0`, the headline renders a tier progress bar with markers at 2/3/5 and a fill clamped to `min(100%, eligible_qty / 5 × 100)`.
- Functional: markers with `qty <= eligible_qty` get `.hit` class (visual: filled / accent color).
- Functional: marker labels show `{qty} · ${off} off` (e.g., `2 · $2 off`, `3 · $3 off`, `5 · $5 off`) using tier_amount values from metafield (with fallback).
- Functional: bar hidden when `show_bar = false` OR `eligible_qty == 0` (cart has no bundle-eligible items).
- Non-functional: no new JS; SSR-only — Dawn re-renders the cart-drawer section on every cart mutation.
- Non-functional: visual parity with PDP's `dop-stack-bar` (same bar height, same marker style, same colors). Reuse PDP class names where possible.

## Architecture

Liquid additions (in `dopamiles-bundle-cart-headline.liquid`, inside the `{%- if eligible_qty > 0 -%}` block, AFTER the state-driven copy/CTA, BEFORE the closing `</div>`):

```liquid
{%- if show_bar -%}
  {%- assign pct_raw = eligible_qty | times: 100 | divided_by: 5 -%}
  {%- if pct_raw > 100 -%}{%- assign pct = 100 -%}{%- else -%}{%- assign pct = pct_raw -%}{%- endif -%}
  {%- assign tier_2_pct = 40 -%}
  {%- assign tier_3_pct = 60 -%}
  {%- assign tier_5_pct = 100 -%}
  {%- assign t2_hit = false -%}{%- if eligible_qty >= 2 -%}{%- assign t2_hit = true -%}{%- endif -%}
  {%- assign t3_hit = false -%}{%- if eligible_qty >= 3 -%}{%- assign t3_hit = true -%}{%- endif -%}
  {%- assign t5_hit = false -%}{%- if eligible_qty >= 5 -%}{%- assign t5_hit = true -%}{%- endif -%}

  <div class="dop-bundle-cart-bar">
    <i class="dop-bundle-cart-bar-fill" style="width: {{ pct }}%"></i>
    <span class="marker{% if t2_hit %} hit{% endif %}" style="left: {{ tier_2_pct }}%"></span>
    <span class="marker-lbl{% if t2_hit %} hit{% endif %}" style="left: 0">2 · ${{ bundle_tier_2_amount }} off</span>
    <span class="marker{% if t3_hit %} hit{% endif %}" style="left: {{ tier_3_pct }}%"></span>
    <span class="marker-lbl{% if t3_hit %} hit{% endif %}" style="left: {{ tier_3_pct }}%; transform: translateX(-50%)">3 · ${{ bundle_tier_3_amount }} off</span>
    <span class="marker{% if t5_hit %} hit{% endif %}" style="left: {{ tier_5_pct }}%"></span>
    <span class="marker-lbl{% if t5_hit %} hit{% endif %}" style="right: 0">5 · ${{ bundle_tier_5_amount }} off</span>
  </div>
{%- endif -%}
```

CSS additions (in the cart drawer's CSS asset — TBD which file; likely `cart.css` or a new `dopamiles-cart-drawer.css`):

```css
/* Bundle cart-drawer tier progress bar (mirrors PDP .dop-stack-bar) */
.dop-bundle-cart-bar {
  position: relative;
  height: 6px;
  background: #E2E2E2;
  border-radius: 99px;
  margin: 14px 0 22px;
}
.dop-bundle-cart-bar .dop-bundle-cart-bar-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: var(--dop-accent);
  border-radius: 99px;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.dop-bundle-cart-bar .marker {
  position: absolute;
  top: -3px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--dop-line-2);
  transform: translateX(-50%);
  transition: border-color 0.2s, background 0.2s;
  z-index: 1;
}
.dop-bundle-cart-bar .marker.hit {
  background: var(--dop-accent);
  border-color: var(--dop-accent);
}
.dop-bundle-cart-bar .marker-lbl {
  position: absolute;
  top: 14px;
  font-family: var(--dop-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--dop-ink-3);
  white-space: nowrap;
  font-weight: 600;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.dop-bundle-cart-bar .marker-lbl.hit { color: var(--dop-accent); }
```

## Related Code Files

- Modify: `snippets/dopamiles-bundle-cart-headline.liquid` — accept `show_bar` arg, render tier progress bar conditionally.
- Modify: `assets/dop-cart.css` (or wherever cart-drawer styles live — confirm via Grep first) — add `.dop-bundle-cart-bar` selectors.
- No change: `assets/dopamiles-cart-helpers.js` — SSR-only, no JS needed.

## Implementation Steps

1. Grep the cart drawer CSS file location (`.dop-bundle-cart-headline` selector — find its host file).
2. Update `dopamiles-bundle-cart-headline.liquid` header comment to document the new `show_bar` render arg.
3. Add the tier progress bar markup conditionally inside the existing `{%- if eligible_qty > 0 -%}` block.
4. Add the CSS block to the cart-drawer styles file.
5. Verify via dev preview: cart with qty 1 → bar shows 20% fill, 0 markers hit, labels visible; qty 3 → 60% fill, 2 markers hit; qty 5+ → 100% fill, all 3 markers hit.
6. Verify cart-drawer section re-renders on cart mutation: add item → bar updates without page reload (Dawn handles).

## Success Criteria

- [ ] Bar renders below headline copy when `show_bar=true` AND `eligible_qty > 0`.
- [ ] Markers + labels at 2/3/5 with correct $-off amounts (from metafield with fallback).
- [ ] `.hit` class applied to markers ≤ `eligible_qty`.
- [ ] Fill width = `min(100%, qty/5 × 100)`.
- [ ] Bar updates on cart mutation without page reload.
- [ ] Theme-check zero new offenses.
- [ ] No new JS files; no new JS LOC.

## Risk Assessment

- **CSS variables** — uses `--dop-accent`, `--dop-line-2`, `--dop-ink-3`, `--dop-mono`. Verify these are defined in `snippets/dopamiles-tokens.liquid` (they are — used by PDP stack-save). If missing, fallback hex.
- **Marker label collision** — at narrow drawer widths (mobile), the three labels at 0% / 60% / 100% can overlap. Plan: accept on mobile if real; revisit with CSS clamp/font-size adjust if QA flags.
- **Fill transition on SSR re-render** — Dawn re-renders the section HTML on cart update; the new bar gets a fresh DOM each time, so the CSS `transition` doesn't smooth the change (it's a hard swap of HTML). Acceptable trade-off: no JS, simpler. If smoothness needed later, JS-driven width update on `PUB_SUB_EVENTS.cartUpdate` is the upgrade path.
- **Coupling with eligibility filter** — `eligible_qty == 0` short-circuit hides the entire headline (existing behavior). Bar inherits this. Correct.
