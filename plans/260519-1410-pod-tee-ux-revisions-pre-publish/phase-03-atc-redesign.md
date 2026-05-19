---
phase: 3
title: "ATC Redesign — Drop Price-Tail, Center Label, Larger Font"
status: pending
priority: P1
effort: "30-45min"
dependencies: [2]
---

# Phase 3: ATC Redesign

## Overview

Primary "Add to cart" button: remove the price-tail span (`— $24.99`), center the label, bump font 17→20px. Apply consistently to both PDP main ATC and mobile sticky-ATC. Clean up dead JS path that patched `.price-tail` on variant change.

## Requirements

- **Functional:**
  - PDP main ATC button: shows "Add to cart" centered, no price suffix, 20px font.
  - Mobile sticky-ATC button: same treatment for visual consistency.
  - Sold-out state: button label becomes "Sold out" (existing), still centered, same font size.
  - Variant change still updates the button label correctly (existing JS path on `.dop-btn-text`).
- **Non-functional:**
  - 2 Liquid files + 1 CSS file + 1 JS file touched.
  - Push only the changed files to preview.
  - Verify on PDP + spot-check that variant switch (Globo color swap) doesn't trigger price-tail update errors.

## Architecture

### Current state

`sections/dopamiles-product-hero.liquid:221-248`:
```liquid
<button class="dop-btn-cta product-form__submit" data-dop-main-atc ...>
  <span class="dop-btn-text">Add to cart</span>
  <span class="price-tail">&mdash; $24.99</span>  <!-- DROP -->
  <div class="loading__spinner hidden">...</div>
</button>
```

Mobile sticky-ATC has a similar structure in `sections/dopamiles-mobile-sticky-atc.liquid`. Need to verify exact selector parity.

CSS at `assets/dopamiles-pdp.css` (Phase 10 comment mentions `.price-tail` rule):
- `.dop-btn-cta` currently uses flex with `justify-content: space-between` (label + price-tail at two ends).
- Font size likely 17-18px (default button scale).

JS at `assets/dopamiles-pdp-variant-sync.js`:
- Patches `.price-tail` text on variant change (`Patches: hidden input, ATC label/disabled/price-tail, price block`).
- Becomes dead code after removal.

### Target state

```liquid
<button class="dop-btn-cta product-form__submit" data-dop-main-atc ...>
  <span class="dop-btn-text">Add to cart</span>
  <div class="loading__spinner hidden">...</div>
</button>
```

```css
.dop-btn-cta {
  justify-content: center;  /* was: space-between (or default) */
  font-size: 20px;          /* was: ~17-18px */
}
.dop-btn-cta .price-tail {  /* DELETE entire rule */ }
```

```js
// Remove the variant-sync patch for .price-tail; keep .dop-btn-text patch
```

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (delete `.price-tail` spans at lines 236-242 — both available and sold-out branches)
- **Modify:** `D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid` (delete equivalent `.price-tail` markup)
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css` (update `.dop-btn-cta` rule; delete `.price-tail` rules)
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp-variant-sync.js` (delete dead `.price-tail` patch path)
- **No-touch:**
  - `.dop-btn-text` patch logic in JS (still needed for "Add to cart" ↔ "Sold out" label swap on variant change)
  - Loading spinner markup
  - `data-dop-main-atc` attribute and form-submit behavior

## Implementation Steps

1. Read `sections/dopamiles-mobile-sticky-atc.liquid` to confirm price-tail location + selector parity with PDP.
2. Read `assets/dopamiles-pdp.css` around `.dop-btn-cta` rule for current font-size + justify-content values.
3. Read `assets/dopamiles-pdp-variant-sync.js` around the price-tail patch logic.
4. Edit `sections/dopamiles-product-hero.liquid`: delete the available + sold-out `<span class="price-tail">` (lines 236-242).
5. Edit `sections/dopamiles-mobile-sticky-atc.liquid`: delete equivalent.
6. Edit `assets/dopamiles-pdp.css`: set `.dop-btn-cta { justify-content: center; font-size: 20px; }`; delete `.price-tail` rules.
7. Edit `assets/dopamiles-pdp-variant-sync.js`: delete the patch function / call for `.price-tail`. Leave `.dop-btn-text` patch intact.
8. Commit: `feat(pdp): center ATC label, drop price-tail, bump font to 20px`.
9. Push only the 4 changed files to preview.
10. Verify visually: PDP button centered + 20px; sticky-ATC matches; sold-out state still shows "Sold out" centered.
11. Test variant switch (Globo color swap) — confirm `.dop-btn-text` updates and no console errors from missing `.price-tail`.

## Success Criteria

- [ ] PDP main ATC: label centered, 20px, no `— $price` suffix.
- [ ] Mobile sticky-ATC: matching style.
- [ ] Sold-out variant: button shows "Sold out" centered (not "Add to cart").
- [ ] Globo color switch: button label updates correctly, no JS errors in console.
- [ ] Regression suite `qa/perf-probe-feature-variant.mjs` still GREEN (Globo align + media-order + 0 section refetches).
- [ ] No new `pageerror` introduced (run `qa/phase-01.mjs` once to confirm).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| 20px font breaks button height on long product names ("A New Stride Begins Retired" etc.) | Verify on edge PDP with the longest product name; test wrap behavior |
| `.price-tail` removed from JS but referenced from somewhere else (memorial code) | Grep for `.price-tail` across all `assets/*.js` files; clean any remaining refs |
| Sticky-ATC has slightly different markup that breaks with the same selector approach | Read sticky-ATC liquid file first; apply matching edit pattern |
| CSS specificity: existing `.product-form__submit` (Dawn parent class) may override `.dop-btn-cta { font-size }` | Use `.dop-btn-cta` selector specificity matching existing rule; verify computed style in DevTools post-deploy |
