# Phase 01 — Compare-at price on sticky ATC

**Status:** shipped (preview 158279991548)
**Owner:** code
**Effort:** ~30 min
**Depends on:** none
**Gate:** Manual preview verification — compare-at renders + updates on variant change

## Goal
On the mobile sticky ATC bar (`dopamiles-mobile-sticky-atc`), render the variant's `compare_at_price` as a struck-through value next to the current price when it's higher than the current price. Keep it in sync with the main hero's variant picker via the existing `syncVariant()` JS pattern.

## Context
- Section file: `D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid` (56 LOC)
- JS sync lives in the main PDP section: `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (491 LOC) — inline `<script>` block exposes `syncVariant()` which already updates `[data-sticky-atc-price]` + `[data-sticky-atc-label]`.
- CSS: `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css`
- Brand pattern: orange accent (`#F26419`) for emphasis, mono (`JetBrains Mono`) for tiny metadata, serif (`Fraunces`) for prices.

## Key insights
- Shopify variant object exposes `compare_at_price` (in cents); use `money_without_trailing_zeros` filter for display consistency.
- `compare_at_price` is nil OR less-than-or-equal to `price` when not on sale → must guard the markup with `> price` check, not `!= blank`.
- `syncVariant()` already iterates known sync targets; adding a new `[data-sticky-atc-compare]` attribute follows the established pattern.
- On variant change to one WITHOUT compare-at, the JS must HIDE the element (or empty its text) — not leave a stale strike-through price.

## Requirements

### Functional
- When `current_variant.compare_at_price > current_variant.price`: render compare-at price before current price on sticky ATC
- When variant changes via picker: update compare-at value (or hide element if new variant lacks compare-at)
- No layout shift on variant change (CSS reserves no width when hidden — `display: none` not `visibility: hidden`)

### Non-functional
- No new JS files; extend the inline `syncVariant()` in `dopamiles-product-hero.liquid`
- CSS payload ≤ 15 lines added to `dopamiles-pdp.css`
- Compare-at display works on iPhone SE (375×667) without cramping

## Architecture

### Liquid (`dopamiles-mobile-sticky-atc.liquid`)
Add markup BEFORE existing `<span class="ms-price">`:

```liquid
{%- if current_variant.compare_at_price > current_variant.price -%}
  <span class="ms-compare" data-sticky-atc-compare>
    {{- current_variant.compare_at_price | money_without_trailing_zeros -}}
  </span>
{%- else -%}
  <span class="ms-compare" data-sticky-atc-compare hidden></span>
{%- endif -%}
```

Note: always render the element (server-side) so JS can find and update it later. Use the `hidden` HTML attribute when no compare-at on initial variant.

### CSS (`dopamiles-pdp.css`)
Add a `.ms-compare` rule:

```css
.dop-mobile-sticky .ms-compare {
  font-family: var(--dop-mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--dop-ink-3, #737373);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  margin-right: 6px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.dop-mobile-sticky .ms-compare[hidden] { display: none; }

@media (max-width: 380px) {
  /* Hide on very narrow viewports to prevent cramping */
  .dop-mobile-sticky .ms-compare { display: none; }
}
```

### JS sync (`dopamiles-product-hero.liquid` inline `syncVariant()`)
Find the existing block updating `[data-sticky-atc-price]` and add adjacent logic for compare-at. Pseudocode:

```js
const compareEl = document.querySelector('[data-sticky-atc-compare]');
if (compareEl) {
  if (variant.compare_at_price && variant.compare_at_price > variant.price) {
    compareEl.textContent = Shopify.formatMoney(variant.compare_at_price, '${{amount}}');
    compareEl.removeAttribute('hidden');
  } else {
    compareEl.setAttribute('hidden', '');
    compareEl.textContent = '';
  }
}
```

**Important:** match the money formatting that `syncVariant()` already uses for `[data-sticky-atc-price]` — don't introduce a different formatter.

## Related code files

### Edit
- `D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid` — add compare-at markup
- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` — extend `syncVariant()` JS
- `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css` — add `.ms-compare` styles

### Read for context
- `D:\github local\pod-tee-theme\assets\dopamiles-mobile-sticky-atc.js` — IntersectionObserver only; variant sync lives in product-hero
- Existing `data-sticky-atc-price` / `data-sticky-atc-label` hooks for pattern match

## Implementation steps
1. Read `dopamiles-mobile-sticky-atc.liquid` to confirm exact insertion point (before `.ms-price`)
2. Read `dopamiles-product-hero.liquid` to locate `syncVariant()` and its existing sticky-ATC updates
3. Read `dopamiles-pdp.css` `.ms-price` rule for visual consistency
4. Add Liquid markup with `data-sticky-atc-compare` + `hidden` initial state guard
5. Add CSS rules (.ms-compare + hidden + narrow-viewport hide)
6. Extend `syncVariant()` JS — match the money formatter used by sticky-ATC price update
7. `shopify theme check` — must show 11/38 baseline
8. Push to preview theme 158279991548
9. Manual verify on a product with compare-at set + multiple variants

## Todo
- [x] Read insertion-point context (Liquid + JS + CSS)
- [x] Add Liquid markup with data attribute + hidden guard
- [x] Add CSS rules (strike-through, color, hide-on-narrow)
- [x] Extend syncVariant() JS to update compare-at element
- [x] shopify theme check passes (baseline 11/38 preserved)
- [x] Push theme to preview 158279991548
- [ ] Manual verify: compare-at shows on on-sale variant
- [ ] Manual verify: hides on non-sale variant
- [ ] Manual verify: no layout shift on variant change
- [ ] Manual verify: no JS console errors

## Success criteria
- Compare-at price visible on sticky ATC for on-sale products
- Variant switch updates compare-at (visible/hidden + value) in same frame as the current price
- No DOM jitter, no JS errors
- Theme check 11/38 preserved

## Halt rule
1 iteration max. If JS sync fails to find or update `[data-sticky-atc-compare]` → snapshot + halt + report BLOCKED with the console error.

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `Shopify.formatMoney` not available in this theme's JS context | Medium | Phase 01 falls back to whatever formatter `syncVariant()` already uses — match it exactly |
| Compare-at price cramping current price on 320px viewports | Low | `@media (max-width: 380px) { .ms-compare { display: none } }` |
| Variant without compare-at shows stale strike-through | Medium | JS toggles `hidden` attribute explicitly, doesn't rely on CSS-only hide |
| Layout shift when compare-at appears/disappears | Low | Width is auto, transitions are instant, no animation |

## Security
No new user input. Compare-at value comes from variant object (server-trusted). No XSS surface.

## Next phase
Phase 02 — Accordion hide toggle.
