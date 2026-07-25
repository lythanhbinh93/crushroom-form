---
phase: 2
title: "Effective per-unit price render"
status: todo
priority: P1
effort: "2h"
dependencies: []
---

# Phase 2: Effective per-unit price render

## Overview

Add the after-discount per-unit price to each tier card, derived from the
selected variant, rendered correctly server-side and kept live on variant
change. Three files, one coherent change — they must land together or the card
renders inconsistently.

Target card content, dopamiles ink/orange palette retained:

```
  2 TEES                      <- eyebrow (qty + label, demoted from 26px hero)
  $27.99 ea                   <- new hero number
  Save $2 each                <- unchanged, accent orange
```

## Requirements

- Functional: each tier shows `selected variant price − tier amount`, formatted
  with cents.
- Functional: prices update on `PUB_SUB_EVENTS.variantChange` without reload.
- Functional: SSR output is already correct with JS disabled.
- Non-functional: no change to tier selection, cart recount, footer summary, CTA,
  or the eligibility gate.
- Non-functional: Liquid and JS money formatting must be byte-identical, so the
  first variant pick does not visibly reformat the number.

## Architecture

The plumbing already exists and is currently dead — this phase finally consumes
it. `data-unit-cents` is emitted in Liquid, parsed into `state.unitCents`
([dopamiles-stack-save.js:41](../../../pod-tee-theme/assets/dopamiles-stack-save.js#L41)),
and refreshed on `variantChange`
([:312](../../../pod-tee-theme/assets/dopamiles-stack-save.js#L312)) — but
`render()` never reads it. It was built for a "From $X total" line that plan
`260609-1508` deleted.

Two changes to that plumbing:

1. **Price basis switches from floor to selected variant.** Today
   `assign unit_cents = product.price_min` (line 60) deliberately picks the
   cheapest variant for an old "From $X" floor. Because the card now sits
   directly under the hero price — which uses `current_variant.price`
   ([dopamiles-product-hero.liquid:269](../../../pod-tee-theme/sections/dopamiles-product-hero.liquid#L269)) —
   the two numbers must share a basis. New invariant:

   ```
   tier card price  ==  hero price  −  tier amount
   ```

   `current_variant` is already a documented render arg. Keep
   `| default: product.price_min` as a defensive fallback for any caller that
   omits it.

2. **`data-has-picked-size` becomes vestigial.** It existed to drop a "From"
   prefix on first pick. With no prefix, nothing reads it. Leave the attribute
   (cheap, and the JS already maintains it) but do not add new logic on it.

Per-tier math, applied identically in Liquid and JS:

```
off_cents  = tier.amount * 100
eff_cents  = max(0, unit_cents - off_cents)
```

## Related Code Files

- Modify: `snippets/dopamiles-stack-save.liquid` — price basis, per-tier math, markup
- Modify: `assets/dopamiles-stack-save.js` — consume `unitCents` in `render()`, exact-cents formatter
- Modify: `assets/dopamiles-stack-save.css` — demote qty to eyebrow, style the price, mobile sizing
- Do not touch: `sections/dopamiles-product-hero.liquid` (anchors and block wiring unchanged)

## Implementation Steps

1. **Liquid — price basis.** Replace line 60:

   ```liquid
   assign unit_cents = current_variant.price | default: product.price_min
   ```

   Update the adjacent comment: it currently explains the "From $X" floor, which
   is no longer the behavior. Say instead that the basis mirrors the hero price
   so card and hero cannot disagree.

2. **Liquid — per-tier effective price.** Inside the tier loop, after `t_off` is
   assigned:

   ```liquid
   assign t_off_cents = t_off | times: 100
   assign t_eff_cents = unit_cents | minus: t_off_cents
   if t_eff_cents < 0
     assign t_eff_cents = 0
   endif
   ```

3. **Liquid — markup.** Between `-qty-lbl` and `-each`, insert the price. Wrap
   the number in its own element so JS replaces only the digits and never the
   "ea" suffix:

   ```liquid
   <span class="dop-stack-tier-price">
     <span data-dop-tier-price>{{ t_eff_cents | money }}</span><small>ea</small>
   </span>
   ```

   Use `money`, not `money_without_trailing_zeros` — the design shows two
   decimals and a round price must not collapse to `$28`.

   Keep `-qty` and `-qty-lbl` as separate spans; CSS restyles them into a single
   `2 TEES` eyebrow line. Avoids rewriting the qty markup the JS does not touch.

4. **JS — collect the price node.** In `collectTiers()`, add to the returned
   object:

   ```js
   priceEl: btn.querySelector('[data-dop-tier-price]')
   ```

5. **JS — exact-cents formatter.** `formatMoney()` strips `.00` in both its Intl
   and string fallbacks, which would disagree with Liquid's `money`. Add a
   sibling that never strips:

   ```js
   function formatMoneyExact(cents) {
     var fmt = getCartMoneyFormat();
     if (fmt && window.Shopify && typeof window.Shopify.formatMoney === 'function') {
       try { return window.Shopify.formatMoney(cents, fmt); } catch (e) { /* fall through */ }
     }
     try {
       return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
     } catch (e) {
       return '$' + (cents / 100).toFixed(2);
     }
   }
   ```

   Leave `formatMoney()` alone — the footer "Save $6" summary reads better
   without trailing zeros, and changing it is out of scope.

6. **JS — render the prices.** Inside the existing `tiers.forEach` in
   `render()`:

   ```js
   if (t.priceEl) {
     t.priceEl.textContent = formatMoneyExact(Math.max(0, state.unitCents - t.off * 100));
   }
   ```

   No new subscriber is needed: `variantChange` already sets `state.unitCents`
   and calls `render()`.

7. **CSS — restyle.** In `assets/dopamiles-stack-save.css`:
   - `.dop-stack-tier-qty` — drop from 26px serif hero to ~11px mono eyebrow,
     uppercase, letter-spaced, inline with the label.
   - `.dop-stack-tier-qty-lbl` — keep mono/uppercase; make it flow inline with
     the qty so they read as one `2 TEES` line.
   - `.dop-stack-tier-price` — new. Serif, ~22px, `var(--dop-ink)`,
     `font-variant-numeric: tabular-nums` so digits do not jitter on variant
     change. Nested `small` ("ea") at ~11px, `var(--dop-ink-3)`, non-italic.
   - Active state — extend the existing block at lines 71-73: price goes `#fff`,
     the `small` goes `rgba(255,255,255,0.7)`, `-each` stays `var(--dop-accent)`.
   - Mobile block at line 204 — the price is now the widest element in a 3-up
     grid. Reduce `.dop-stack-tier-price` and confirm no overflow at 360px.

8. **Sync the snippet header comment.** It documents render args and the tier
   source. Add the new invariant (card = hero − amount) and, separately, correct
   the false claim that the eligibility predicate mirrors the Function's tag
   input — Phase 01 makes the sets converge, but the predicates remain different
   mechanisms and the comment should say so.

## Success Criteria

- [x] SSR HTML contains a correct `$X.XX` per tier with JS disabled
- [x] Card price equals hero price minus tier amount on first paint
- [x] Changing size updates all three prices with no reformat flicker
- [x] Clicking a tier changes only active state, not the prices
- [x] Keyboard radiogroup state (`aria-checked` + roving `tabindex`) unchanged
- [ ] Cart recount unchanged — NOT verified; needs an add-to-cart run
- [ ] Non-eligible product renders nothing — NOT verifiable on this catalog:
      every active product is in the T-shirt category, so no non-eligible
      product exists to test against. The gate itself is untouched code.
- [x] Footer summary / CTA — not rendered at all on live
      (`bundle_show_footer: false`), so unaffected by definition
- [x] `shopify theme check` clean

## Risk Assessment

- **Format divergence.** The one subtle failure: SSR renders `$28.00`, JS
  re-renders `$28`. Step 5 is the fix; the check is picking a size and watching
  for the number to reformat.
- **`current_variant` omitted by a future caller.** The `| default:` fallback
  keeps SSR sane rather than rendering `$0.00`.
- **Cheap product clamp.** A $5 tee at tier 5 would compute `$0.00 ea`. Clamped
  to zero here; if such products exist, consider suppressing the price line
  instead — decide in Phase 03 QA against real catalog data.
- **Tabular numerals.** Without them the price width shifts per digit and the
  3-up grid visibly reflows on every variant change.
