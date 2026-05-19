---
phase: 3
title: "Variant-Aware From-X Pricing"
status: complete
priority: P1
effort: "1-1.5h"
dependencies: [1]
---

# Phase 3: Variant-Aware From-X Pricing

## Overview

Catalog is adding size upcharges (e.g. S/M/L at base price, 2XL/3XL +$3–$5). The Stack & Save card must show the price floor with a "From $X" prefix on first paint (no size picked), then drop the prefix and snap to the exact picked-size price on `PUB_SUB_EVENTS.variantChange`. Per-tier `$N off each` copy is unaffected (Function `tier.amount` is flat $-off-per-unit, independent of variant price).

## Requirements

- Functional: SSR initial `unit_cents = product.price_min` (lowest variant price), regardless of which variant is the "current" default.
- Functional: SSR initial total + savings prefixed with literal word `From` (e.g. `From $87`, `You save from $9`).
- Functional: Per-tier card `${N} total` line prefixed with `From` on SSR.
- Functional: On first `PUB_SUB_EVENTS.variantChange` event, set `state.hasPickedSize = true`; render() drops `From` prefix and uses `variant.price` for math.
- Functional: Footer `From X tees` framing — only the total + savings get the prefix; `{qty} tees` line stays un-prefixed (qty is exact, not a floor).
- Non-functional: A11y — screen readers read "From eighty-seven dollars" naturally; no awkward "From dollar-sign-eighty-seven".

## Architecture

State machine:

```
hasPickedSize = false (SSR initial, no variantChange seen)
  ├─ totals show "From $X"
  ├─ savings show "You save from $Y"
  ├─ per-tier total shows "From $Z total"
  └─ unit_cents = product.price_min

hasPickedSize = true (after first variantChange)
  ├─ totals show "$X"
  ├─ savings show "You save $Y"
  ├─ per-tier total shows "$Z total"
  └─ unit_cents = variant.price
```

Liquid changes (in `snippets/dopamiles-stack-save.liquid`):

```liquid
{%- liquid
  assign unit_cents = product.price_min
  ...
-%}

<div
  class="dop-stack"
  data-dop-stack
  data-default-picked="{{ default_picked }}"
  data-unit-cents="{{ unit_cents }}"
  data-has-picked-size="false"
  data-in-cart="{{ in_cart_qty }}"
  ...
>
```

Footer summary (SSR with prefix):

```liquid
<div class="summary" data-dop-stack-summary>
  <span data-dop-stack-summary-qty>{{ target_qty }}</span> tees ·
  <s data-dop-stack-summary-subtotal>From {{ subtotal_cents | money_without_trailing_zeros }}</s><b data-dop-stack-summary-total>From {{ target_total_cents | money_without_trailing_zeros }}</b>
  <span class="save" data-dop-stack-summary-save>You save from {{ savings_cents | money_without_trailing_zeros }}</span>
</div>
```

Per-tier total (SSR with prefix):

```liquid
<span class="total">From {{ t_total_cents | money_without_trailing_zeros }} total</span>
```

JS changes (in `assets/dopamiles-stack-save.js`):

```js
// readInitialState — add:
state.hasPickedSize = root.dataset.hasPickedSize === 'true';

// render() — gate the prefix:
var prefix = state.hasPickedSize ? '' : 'From ';
els.summarySubtotal.textContent = prefix + formatMoney(subtotalCents);
els.summaryTotal.textContent    = prefix + formatMoney(totalCents);
els.summarySave.textContent     = 'You save ' + (state.hasPickedSize ? '' : 'from ') + formatMoney(savingsCents);

// Per-tier total in render() loop — same prefix logic:
var totalEl = t.btn.querySelector('.dop-stack-tier-save .total');
if (totalEl) totalEl.textContent = prefix + formatMoney(targetTotalForTier) + ' total';

// variantChange subscriber:
subscribe(PUB_SUB_EVENTS.variantChange, function (payload) {
  var variant = payload && payload.data && payload.data.variant;
  if (!variant || typeof variant.price !== 'number') return;
  state.unitCents = variant.price;
  state.hasPickedSize = true;          // flip the flag
  root.dataset.hasPickedSize = 'true';  // keep DOM in sync for inspectors
  render(state, tiers, els);
});
```

## Related Code Files

- Modify: `snippets/dopamiles-stack-save.liquid` — `unit_cents = product.price_min`; `data-has-picked-size="false"`; prefix `From` on SSR totals/savings/per-tier totals.
- Modify: `assets/dopamiles-stack-save.js` — read `hasPickedSize` from data attr; gate `From` prefix in render(); flip flag on variantChange; also re-render per-tier totals in the existing tier loop (currently only the active tier's footer reflects state; per-tier totals are SSR-only — extend render() to mutate them).
- No change: `assets/dopamiles-stack-save.css` (prefix is plain text inline, no new selectors).

## Implementation Steps

1. **Liquid: switch unit source** — change `assign unit_cents = current_variant.price | default: product.price` to `assign unit_cents = product.price_min`. (`product.price_min` is always defined; no `default` needed.)
2. **Liquid: emit data flag** — add `data-has-picked-size="false"` to the `.dop-stack` root element.
3. **Liquid: SSR prefixes** — wrap money outputs:
   - Footer `<s>` subtotal → `From {money}`
   - Footer `<b>` total → `From {money}`
   - Footer save span → `You save from {money}`
   - Per-tier `.total` span → `From {money} total`
4. **JS: read flag** — in `wireOne()`, add `state.hasPickedSize = root.dataset.hasPickedSize === 'true';`.
5. **JS: gate prefixes in render()** — introduce `var prefix = state.hasPickedSize ? '' : 'From ';` and `var saveJoin = state.hasPickedSize ? '' : 'from ';`. Apply to: `summarySubtotal`, `summaryTotal`, `summarySave`, plus per-tier `.total` inside the tier loop.
6. **JS: variantChange flips flag** — in the existing `bindVariantChange` subscriber, set `state.hasPickedSize = true` and `root.dataset.hasPickedSize = 'true'` BEFORE calling `render()`. Pass `root` into the subscriber closure (it's already available via `wireOne`'s outer scope).
7. **JS: per-tier total mutation** — extend the `tiers.forEach` block in render() to also mutate `t.btn.querySelector('.dop-stack-tier-save .total')`. Pre-compute `tTotalCents = t.qty * state.unitCents - t.qty * t.off * 100` per tier.
8. **Edge case: when `product.price_min === product.price_max`** (no upcharges yet) — `From $X` reads slightly oddly. Accept this for now; once upcharges are added the wording is correct. Alternative: gate the prefix on `product.price_min !== product.price_max` in Liquid; the JS would need the same flag. **Recommended: keep `From` always on SSR for forward compat; one extra word during the no-upcharge week is acceptable.**

## Success Criteria

- [ ] SSR shows `From $X` on totals/savings/per-tier totals before any variant is picked.
- [ ] First variant size click drops the `From` prefix and snaps to exact picked-size totals (within one event-loop tick, no flicker).
- [ ] Variant-change → subsequent tier swaps maintain exact pricing (no regression to floor).
- [ ] Savings `$N off each` per-tier copy unchanged (flat $-off, not size-dependent).
- [ ] No console errors. JS file still under 320 lines.
- [ ] Theme-check reports zero new offenses on the snippet.
- [ ] Screen reader announces "from eighty-seven dollars" naturally.

## Risk Assessment

- **`product.price_min` vs Shopify variant-sync default** — variant sync may default to `?variant=` URL param or `media[0]`'s variant, neither of which is necessarily the lowest-priced. The card SSR uses `product.price_min` (always lowest), which is intentionally different from the price-row display (uses `current_variant.price`). This creates a deliberate visual cue: the card says "from $32" while the price row says "$35" (picked variant) — clear signal that bundle savings scale with the picked size.
- **`From` prefix doubling** — if JS render() runs on initial DOMContentLoaded (idempotency), it must NOT prepend a second `From` to text that already has it. Mitigation: render() rebuilds textContent from scratch from money values, not from existing DOM text. Verified pattern.
- **State desync between SSR + JS** — both must agree that `hasPickedSize = false` initially. Mitigation: Liquid emits `data-has-picked-size="false"` literal, JS reads it on init. Both default to false.
- **Plural / singular grammar** — "You save from $9" is grammatically odd. Acceptable trade-off for clarity; alternative wording ("Save up to $9" / "Save $9 or more") was considered but loses the floor semantics. Lock to "You save from $X" for now; revisit if QA flags.
- **Function math under upcharges** — Function `tier.amount` is a flat $-off-per-unit (e.g. $3 off each at qty 3, regardless of variant price). So `savings_cents = qty × off × 100` doesn't depend on `unit_cents`. The `From` prefix on savings is therefore aesthetic, not mathematical — but kept for visual consistency with subtotal/total.
