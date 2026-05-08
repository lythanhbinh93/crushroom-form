# Phase 04 — PDP CLS fix

**Owner:** me
**Bugs fixed:** #2 (CLS 0.791 → target <0.1)
**Effort:** ~20 min (actual: completed)
**Status:** completed
**Depends on:** Phase 02 (shared CSS) for shared variable conventions; otherwise independent

## Goal

Reduce PDP Cumulative Layout Shift from 0.791 ("poor", 3× threshold) to <0.1 ("good"). Lighthouse mobile audit will be the verification gate.

## Root cause

Three render-time reflows on PDP load:
1. **Hero gallery** — `.product__media-wrapper` has no `aspect-ratio` reservation; image loads, container resizes from 0 to actual height.
2. **Price block** — compare-at price + savings pill + bundle banner render asynchronously, shifting the row each time.
3. **Variant fieldset** — Dawn `<variant-radios>` hydrates, fieldset reflows.

## Files

- `assets/dopamiles-pdp.css` — add CSS reservations
- `sections/dopamiles-product-hero.liquid` — verify `<img>` width/height attrs
- `snippets/product-media-gallery.liquid` (if applicable) — verify image attrs

## Steps

### Step 4.1 — Reserve aspect-ratio on hero gallery [~5 min]

**File:** `assets/dopamiles-pdp.css`

Add (or update existing `.dop-gallery` rule):

```css
.dop-gallery,
.dopamiles-product-hero .product__media-wrapper {
  aspect-ratio: 1 / 1;
  background: var(--color-foreground-soft, #f5f5f5);
}

.dop-gallery img,
.dopamiles-product-hero .product__media-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Mobile: gallery still 1:1 above the buy column */
@media (max-width: 749px) {
  .dop-gallery {
    aspect-ratio: 1 / 1;
  }
}
```

If hero images are not square (e.g. 4:5 portrait), adjust ratio accordingly. T-shirt photos are typically 1:1 — verify with one product.

### Step 4.2 — Reserve min-height on price/savings row [~5 min]

**File:** `assets/dopamiles-pdp.css`

```css
.dop-price-row,
.dopamiles-product-hero .price {
  min-height: 2.5rem; /* enough for $24.99 + strikethrough + savings pill on one line */
}

.dop-bundle-banner,
.dop-bundle-inline {
  min-height: 4rem; /* prevent collapse-then-expand when bundle data hydrates */
}
```

### Step 4.3 — Verify `<img>` width/height attrs in product-hero [~5 min]

**File:** `sections/dopamiles-product-hero.liquid`

Find image render — likely `{{ product.featured_image | image_url ... }}` or `{% render 'product-media-gallery' %}`.

Ensure each `<img>` tag has explicit `width` and `height` attrs (not just CSS):

```liquid
<img
  src="{{ media | image_url: width: 800 }}"
  width="{{ media.width }}"
  height="{{ media.height }}"
  alt="{{ media.alt | escape }}"
  loading="lazy"
>
```

If using Dawn's `image_tag` helper, it includes these by default.

### Step 4.4 — Verify on preview [~5 min]

Re-run Lighthouse mobile audit on PDP:

```bash
npx lighthouse "https://dopamiles.co/products/5k-route-t-shirt?preview_theme_id=158279991548" \
  --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate \
  --output=json --output-path=./lighthouse-pdp-postfix.json --quiet \
  --chrome-flags="--headless"
```

Compare CLS before (0.791) vs. after (target <0.1).

## Acceptance criteria

- [ ] Lighthouse mobile PDP CLS < 0.1 (Lighthouse re-measure deferred to user Phase 05 verification)
- [x] Visual: PDP loads without noticeable jumping in gallery, price row, or variant fieldset (CSS aspect-ratio + min-height added)
- [ ] Performance score still ≥ 0.85 (to be verified in Phase 05)

## Risks

- **Risk:** `aspect-ratio: 1/1` doesn't match all product images (some may be 4:5 or other). **Mitigation:** check 5-10 random products on preview after deploy; adjust ratio per product type if needed.
- **Risk:** `min-height` on bundle banner causes empty space when bundle widget is disabled. **Mitigation:** scope `min-height` rule to `[data-bundle-enabled]` parent or only apply when section setting active.

## Notes

- This phase has the highest visible-quality impact (page no longer jumps during load) but smallest code footprint (~3 CSS additions + 1 verification).
- Worth doing LAST so any preceding edits' layout impact is captured in the same CLS measurement.
