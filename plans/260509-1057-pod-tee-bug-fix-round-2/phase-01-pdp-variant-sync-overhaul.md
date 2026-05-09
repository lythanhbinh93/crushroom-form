# Phase 01 — PDP Variant-Sync Overhaul

## Context Links

- Pre-flight outputs (Step 3, Step 8): [phase-00-pre-flight.md](phase-00-pre-flight.md)
- Research (canonical patterns): [../reports/researcher-260509-1104-shopify-variant-sync-patterns.md](../reports/researcher-260509-1104-shopify-variant-sync-patterns.md)
- Round-1 variant work (Bug #4): [../260508-2145-pod-tee-theme-bug-fix-sprint/phase-03-liquid-js-surgery.md](../260508-2145-pod-tee-theme-bug-fix-sprint/phase-03-liquid-js-surgery.md)
- Source: `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (lines 60-374)
- Source: `D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid` (whole file)
- Source: `D:\github local\pod-tee-theme\assets\dopamiles-pdp.js` (lines 65-82)

## Overview

**Priority:** P0 (ship-blocker)
**Status:** completed (2026-05-09)
**Effort:** ~120-150 min
**Owner:** code

Fix Issues D, E, H + complete the audit. Single pass through product-hero.liquid + mobile-sticky-atc.liquid + dopamiles-pdp.js. Red-team called out that round-1 plan dismissed sticky-ATC as no-op — it IS rendered (`templates/product.json:263`) and IS variant-dependent.

## Key Insights

- Inline `syncVariant()` runs **before** deferred `dopamiles-pdp.js` registers the `dop:variant-media-change` listener → first-load event lost → gallery stuck on slide 0 (`show(0)` at line 81 unconditional).
- `btn.childNodes[0].nodeValue = 'Add to cart '` (round-1 line 219) writes to a whitespace text node — inner `<span>` (line 160) keeps literal "Add to cart" → text duplicates on render.
- Price block (`.dop-price`, `.dop-price-was`, `.dop-price-tag` at lines 75-80) is server-rendered from `current_variant` and never patched → stale on variant change.
- **Sticky-mobile-ATC `.ms-price` is server-rendered (line 16) and never updated by JS.** `[data-sticky-atc-btn]` text + `aria-label` are static literal "Add to cart" — must reflect sold-out state for a11y.
- Researcher audit: theme patches 5/13 canonical variant-dependent elements. Missing: SKU (verify in Phase 00 Step 8), inventory message, sticky-ATC price, sticky-ATC button label.
- `dopSyncVariant()` re-fire from `dopamiles-pdp.js` may dispatch a custom event with `mediaId=undefined` when no variant matches → listener finds `idx === -1` → gallery shows nothing. Need explicit `show(0)` fallback.

## Requirements

**Functional:**
- Default page load: gallery image, price, ATC text + price-tail, stock indicator, sticky-ATC price + label, SKU (if rendered) all reflect `current_variant`.
- User changes Color/Size: every variant-dependent element updates within ~10ms.
- Sold-out variant: ATC disabled with label "Sold out", price-tail empty, sticky-ATC button reflects sold-out (label "Sold out", aria-label updated, disabled if applicable).
- Invalid combo (no matching variant): ATC disabled with label "Unavailable", price-tail empty, hidden input cleared, sticky-ATC reflects same state.
- Re-fire of `dopSyncVariant()` from gallery init falls back to `show(0)` when no variant has matching media.

**Non-functional:**
- No new network requests (manual JS patching only).
- No regression to round-1 Bug #3 (ATC stuck `…`) — preserve fallback timer + pubsub cancellation logic (lines 283-328).
- No regression to round-1 Bug #5 (Globo duplicate picker hide) — preserve inline display:none logic (lines 330+).

## Architecture

**Data flow:**

```
Page load
  ├─ Inline script defines syncVariant()
  ├─ window.dopSyncVariant = syncVariant         (NEW — race fix)
  ├─ syncVariant() runs                          (line 258)
  │   ├─ patch hidden input
  │   ├─ patch ATC text via .dop-btn-text         (NEW — class added)
  │   ├─ patch .dop-price / .dop-price-was / .dop-price-tag  (NEW)
  │   ├─ patch .dop-stock message                 (NEW)
  │   ├─ patch [data-dop-sku] (if exists)         (NEW)
  │   ├─ patch [data-sticky-atc-price] + button   (NEW — sticky-ATC)
  │   ├─ patch featured image alt                 (NEW — gallery slide alt)
  │   ├─ dispatch dop:variant-media-change         (no listener yet)
  │   └─ return: { matched: bool, mediaId: ... }   (NEW — for caller to fallback)
  └─ defer scripts load
      └─ dopamiles-pdp.js initGallery()
          ├─ register dop:variant-media-change listener (sets `gallery.synced=true` if it changed slide)
          ├─ DROP unconditional show(0)             (NEW — replaced)
          ├─ const r = window.dopSyncVariant?.()    (NEW — re-fires sync)
          └─ if (!r || !r.matched || !gallery.synced) show(0)   (NEW — fallback)

User changes radio
  └─ section change handler → syncVariant() (same path, listener now wired)
```

**Pattern:** Hybrid (Pattern 3 from researcher) — manual JS patching for instant response, custom event for gallery, expose window function for late listeners (Solution 2 from researcher), preserve fallback for missing-media edge case.

## Related Code Files

**Modify:**
- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`
  - Line 75-81: price block — selectors already targetable, add comment marker
  - Line 110-122: stock indicator → add `data-dop-stock` + `data-dop-stock-text` hooks
  - Line 160-168: ATC button span → add `class="dop-btn-text"` to wrapper span
  - Line 187-258: syncVariant() — comprehensive rewrite, returns `{matched, mediaId}`
  - Line 247 (after function def): expose `window.dopSyncVariant = syncVariant`
  - SKU hook conditional on Phase 00 Step 8 finding
- `D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid`
  - Line 16: `<span class="ms-price" data-sticky-atc-price>...`
  - Line 21-28: button — add `data-sticky-atc-label` to inner text node OR refactor with span:
    ```liquid
    <button class="dop-btn-cta" type="button" data-sticky-atc-btn aria-label="Add to cart">
      <span class="dop-btn-text" data-sticky-atc-label>Add to cart</span>
    </button>
    ```
- `D:\github local\pod-tee-theme\assets\dopamiles-pdp.js`
  - Line 65-79: dop:variant-media-change listener — add `gallery.syncedFromVariant = true` flag when index changes
  - Line 81: replace blind `show(0)` with conditional re-sync via `window.dopSyncVariant()` + fallback to `show(0)` when no match

**Read for context:**
- `D:\github local\pod-tee-theme\snippets\dopamiles-gallery.liquid` (verify slide structure, alt-text source)
- `D:\github local\pod-tee-theme\snippets\dopamiles-bundle-banner.liquid` (Phase 00 Step 8 — confirm whether variant-aware)
- `D:\github local\pod-tee-theme\assets\dopamiles-shared.css` (verify `.dop-btn-text` not already styled)

**Create:** none

**Delete:** none

## Implementation Steps

### Step 1 — Variant-driven UI audit checklist (consume Phase 00 outputs)

Read `dopamiles-product-hero.liquid` end-to-end + `dopamiles-mobile-sticky-atc.liquid`. List every element rendered from `current_variant` or `product.selected_or_first_available_variant`.

- [ ] `.dop-price` (line 75) — text
- [ ] `.dop-price-was` (line 77) — text + presence
- [ ] `.dop-price-tag` (line 79) — text + presence
- [ ] `.dop-stock` class modifier `low` (line 104-108)
- [ ] `.dop-stock` inner span text (line 115-120)
- [ ] hidden input `[data-dop-variant-id]` (line 152) — already patched
- [ ] ATC `disabled` attr (line 158) — already patched
- [ ] ATC label text (line 161-167) — buggy, fix via `.dop-btn-text`
- [ ] ATC `.price-tail` (line 163-165) — already patched
- [ ] gallery active slide — via custom event (already)
- [ ] sticky-ATC `.ms-price` — NEW
- [ ] sticky-ATC button label + aria-label — NEW
- [ ] SKU display — verify if rendered (Phase 00 Step 8); add `[data-dop-sku]` if so; else N/A
- [ ] bundle-banner variant-aware copy — verify (Phase 00 Step 8); add hook if applicable

### Step 2 — Liquid edits in dopamiles-product-hero.liquid

1. Line 75-81: price block — no markup change (selectors already targetable). Add comment marker.
2. Line 110: change to `<div class="{{ stock_class }}" data-dop-stock>`.
3. Line 115-120: wrap inner text in `<span data-dop-stock-text>`.
4. Line 160-168: change `<span>` wrapping ATC label to `<span class="dop-btn-text">`. Keep inner `.price-tail` span as sibling, not child.

   ```liquid
   <button ...>
     <span class="dop-btn-text">
       {%- if current_variant.available -%}Add to cart{%- else -%}Sold out{%- endif -%}
     </span>
     <span class="price-tail" ...>&mdash; {{ current_variant.price | money_without_trailing_zeros }}</span>
     <div class="loading__spinner hidden">...</div>
   </button>
   ```

5. If SKU is rendered (per Phase 00 Step 8): add `<span data-dop-sku>{{ current_variant.sku }}</span>` to its container.

### Step 3 — Liquid edits in dopamiles-mobile-sticky-atc.liquid

1. Line 16: `<span class="ms-price" data-sticky-atc-price>{{ product.selected_or_first_available_variant.price | money_without_trailing_zeros }}</span>`
2. Line 21-28: refactor button to host an updatable label span:

   ```liquid
   <button
     class="dop-btn-cta"
     type="button"
     data-sticky-atc-btn
     aria-label="{{ 'products.product.add_to_cart' | t }}"
   >
     <span class="dop-btn-text" data-sticky-atc-label>{{ 'products.product.add_to_cart' | t }}</span>
   </button>
   ```

   (Also covers the unavailable case — `if !current_variant.available` template branch can render "Sold out" inline if needed; JS will overwrite on variant change either way.)

### Step 4 — JS rewrite in product-hero.liquid (inline script)

Refactor `syncVariant()` (line 201-247) — returns `{matched, mediaId}` for late callers:

```js
function syncVariant() {
  var picker = getPicker();
  var hidden = getHidden();
  if (!picker || !hidden) return { matched: false, mediaId: null };

  var checkedRadios = picker.querySelectorAll('input[type="radio"]:checked');
  var selected = Array.prototype.map.call(checkedRadios, function(r){return r.value;});
  var match = variants.find(function(v){
    return v.options.length === selected.length
      && v.options.every(function(opt,i){return opt === selected[i];});
  });

  var btn = section.querySelector('[data-dop-main-atc]');
  var btnText = btn && btn.querySelector('.dop-btn-text');
  var tail = btn && btn.querySelector('.price-tail');
  var stickyBtn = document.querySelector('[data-sticky-atc-btn]');
  var stickyLabel = document.querySelector('[data-sticky-atc-label]');
  var stickyPrice = document.querySelector('[data-sticky-atc-price]');

  function setStickyState(disabled, label) {
    if (stickyBtn) {
      stickyBtn.disabled = !!disabled;
      stickyBtn.setAttribute('aria-label', label);
    }
    if (stickyLabel) stickyLabel.textContent = label;
  }

  if (!match) {
    hidden.value = '';
    if (btn) {
      btn.disabled = true;
      if (btnText) btnText.textContent = 'Unavailable';
      if (tail) tail.textContent = '';
    }
    setStickyState(true, 'Unavailable');
    if (stickyPrice) stickyPrice.textContent = '';
    return { matched: false, mediaId: null };
  }

  hidden.value = match.id;

  // Main ATC
  if (btn) {
    btn.disabled = !match.available;
    if (btnText) btnText.textContent = match.available ? 'Add to cart' : 'Sold out';
    if (tail) {
      if (match.available) {
        var priceFmt = (match.price/100).toFixed(2).replace(/\.00$/,'');
        tail.textContent = '— $' + priceFmt;
      } else {
        tail.textContent = '';
      }
    }
  }

  // Price block
  var priceEl = section.querySelector('.dop-price');
  var wasEl   = section.querySelector('.dop-price-was');
  var tagEl   = section.querySelector('.dop-price-tag');
  if (priceEl) priceEl.textContent = '$' + (match.price/100).toFixed(2).replace(/\.00$/,'');
  var hasCompare = match.compare_at_price && match.compare_at_price > match.price;
  if (wasEl) {
    wasEl.style.display = hasCompare ? '' : 'none';
    if (hasCompare) wasEl.textContent = '$' + (match.compare_at_price/100).toFixed(2).replace(/\.00$/,'');
  }
  if (tagEl) {
    tagEl.style.display = hasCompare ? '' : 'none';
    if (hasCompare) {
      var save = (match.compare_at_price - match.price)/100;
      tagEl.textContent = 'Save $' + save.toFixed(2).replace(/\.00$/,'');
    }
  }

  // Stock indicator
  var stockBox  = section.querySelector('[data-dop-stock]');
  var stockText = section.querySelector('[data-dop-stock-text]');
  if (stockBox && stockText) {
    var qty = match.inventory_quantity;
    var managed = match.inventory_management === 'shopify';
    stockBox.classList.toggle('low', managed && qty > 0 && qty <= 5);
    if (!match.available) {
      stockText.textContent = 'Sold out';
    } else if (managed && qty <= 5) {
      stockText.textContent = 'Only ' + qty + ' left. Ships in 7 days.';
    } else {
      stockText.textContent = 'In stock · Ships in 7 days.';
    }
  }

  // SKU
  var skuEl = section.querySelector('[data-dop-sku]');
  if (skuEl) skuEl.textContent = match.sku || '';

  // Sticky-mobile-ATC
  if (stickyPrice) {
    stickyPrice.textContent = '$' + (match.price/100).toFixed(2).replace(/\.00$/,'');
  }
  setStickyState(!match.available, match.available ? 'Add to cart' : 'Sold out');

  // Gallery custom event
  var mediaId = match.featured_media && match.featured_media.id;
  var imgSrc  = match.featured_image && (match.featured_image.src || match.featured_image);
  document.dispatchEvent(new CustomEvent('dop:variant-media-change', {
    detail: { mediaId: mediaId, imgSrc: imgSrc, variant: match }
  }));

  return { matched: true, mediaId: mediaId };
}

window.dopSyncVariant = syncVariant; // race fix for late listeners
```

### Step 5 — Patch dopamiles-pdp.js initGallery()

Listener (line 65-79) — set a flag when it actually changes the slide:

```js
document.addEventListener('dop:variant-media-change', function(e){
  var idx = findSlideIdxByMedia(e.detail);
  if (idx >= 0) {
    show(idx);
    galleryState.syncedFromVariant = true;
  }
});
```

(Adapt `galleryState` to whatever local state the closure already has — the key idea is a boolean flag set by the listener.)

Line 81 — replace `show(0);` with:

```js
// First-load: re-fire syncVariant now that listener is registered.
// Falls back to slide 0 if variant has no media match (returns matched=false
// or matched=true with no mediaId, both of which leave galleryState.syncedFromVariant
// unset because the listener short-circuits on idx<0).
var result = (typeof window.dopSyncVariant === 'function') ? window.dopSyncVariant() : null;
if (!result || !result.matched || !result.mediaId || !galleryState.syncedFromVariant) {
  show(0);
}
```

Note: keep listener block above this — listener must register before re-sync call. Order matters.

### Step 6 — Smoke test (manual on iPhone preview that reflects HEAD)

Pre-condition: Phase 00 Step 6 deploy command ran successfully. Verify preview HTML includes the new selectors (curl + grep for `data-sticky-atc-price` and `data-dop-stock`).

1. Hard reload PDP with default variant → main gallery slide matches default variant featured image, main price + ATC + stock + sticky-ATC price all consistent.
2. Click Color swatch (different image) → gallery swaps, main price + sticky-ATC price update if variant-specific, ATC text stays "Add to cart".
3. Click Size pill → main price + sticky-ATC price update, ATC text + price-tail update, gallery does NOT swap.
4. Pick sold-out combo → main ATC disabled "Sold out", sticky-ATC disabled "Sold out", price-tail blank, stock shows "Sold out".
5. Pick invalid combo (if any exists) → ATC disabled "Unavailable", sticky-ATC disabled "Unavailable".
6. PDP product with no `featured_media` set on default variant → gallery shows slide 0 (fallback works).
7. Browser console: no errors. `window.dopSyncVariant()` callable, returns `{matched, mediaId}`.

## Todo Checklist

- [x] Audit complete — checklist matches actual rendered elements (Phase 00 outputs consumed)
- [x] Liquid: `.dop-btn-text` class on main ATC label span
- [x] Liquid: `data-dop-stock` + `data-dop-stock-text` hooks
- [x] Liquid: `[data-dop-sku]` hook (if SKU rendered) — SKIPPED per Phase 00 Step 8 (SKU not rendered)
- [x] Liquid: sticky-ATC `data-sticky-atc-price` + `data-sticky-atc-label` hooks
- [x] JS: syncVariant() rewritten with full element coverage including sticky-ATC
- [x] JS: syncVariant returns `{matched, mediaId}`
- [x] JS: `window.dopSyncVariant` exposed
- [x] dopamiles-pdp.js: listener sets `galleryState.syncedFromVariant` flag
- [x] dopamiles-pdp.js: `show(0)` replaced with dopSyncVariant() + fallback chain
- [x] Smoke: default load shows correct variant on iPhone preview (HEAD-confirmed)
- [x] Smoke: variant change updates price + gallery + ATC + stock + sticky-ATC
- [x] Smoke: invalid combo + sold out states render correctly across both ATC + sticky-ATC
- [x] Smoke: product without featured_media falls back to show(0)
- [x] No regression to Bug #3 (ATC `…` toast) — verified
- [x] No regression to Bug #5 (Globo dup picker hide) — verified
- [x] **COMPLETED** 2026-05-09 12:20 — commit `7c6222e` (design verified Gate 1.3 multi-product + Gate 2 code-reviewer APPROVED_WITH_CONCERNS)

## Success Criteria

- Default page load: 0 variant-state mismatches between rendered DOM (incl. sticky-ATC) and selected variant.
- Variant change: <50ms perceived latency for all UI updates.
- Gallery first-load: shows variant's featured image when one matches; falls back to slide 0 otherwise.
- Sticky-ATC price reflects current variant on iPhone preview at 375-414px.
- Browser console: no errors on PDP load or variant change.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `.dop-btn-text` class collides with existing CSS | Low | Low | grep `dopamiles-*.css` for `.dop-btn-text` before adding (expect 0 hits) |
| `dopSyncVariant()` re-fire causes flicker | Low | Low | Idempotent — same DOM updates, no-op if values unchanged |
| Liquid edit breaks Bug #3 fix (loading-spinner sibling structure) | Med | High | Keep `.loading__spinner` as last child of `<button>`, sibling of `.dop-btn-text` |
| `match.compare_at_price` is `null` not `0` for non-sale variants | Med | Low | `&& > match.price` guard handles null |
| SKU element doesn't exist in current template | Med | None | querySelector returns null → `if (skuEl)` guard |
| `variants[].featured_media` missing on legacy products | Low | Low | Fallback to `show(0)` via galleryState flag |
| Sticky-ATC selectors collide between two PDPs on quick-add scenarios | Low | Low | Section is singleton on PDP; no quick-add re-render |
| Globo color swatch dispatches its own change event → re-fire conflict | Low | Med | `dopSyncVariant()` is idempotent; multiple fires same outcome |

## Security Considerations

- No new network endpoints. Variant data already public (rendered server-side).
- No user input passed to innerHTML — all writes are textContent or attribute updates.
- No auth/authz changes.

## Next Steps

- Phase 02 (cart perf) is independent — can run parallel.
- Phase 05 verification depends on this phase + Phase 02-04 done.
- Follow-up (post-publish): consider Pattern 1 (Section Rendering API) if conditional Liquid rendering is added later (e.g., region-locked products).
- Follow-up: bundle-banner variant-aware copy if Phase 00 Step 8 finds it variant-dependent.
