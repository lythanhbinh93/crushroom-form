# Phase 1 — DOM / variant-swap contract (source-verified)

**Date:** 2026-05-29 | **Theme:** BeachNapClub V1.0 (Horizon 3.0.0, customized) | **Repo:** `d:/github local/tytkwe-qe-theme`
**Method:** source read (high confidence). Live-DOM points flagged `[LIVE]` confirmed at Phase 4 preview gate.

## Grid + item
- Grid: `ul.product-grid[ref="grid"][data-last-page][data-product-card-size]` — `snippets/product-grid.liquid:122-131`. Hosted inside `<results-list section-id=…>` (the `PaginatedList` element).
- Item: `li.product-grid__item[ref="cards[]"][data-page][data-product-id][id="{section.id}-{product.id}"]` — `sections/main-collection.liquid:81-91`.
- **Custom `gen-custom-collection` tiles are COMMENTED OUT** (`main-collection.liquid:46-79` wrapped in `{% comment %}`; schema drops `collection_1/2`). → No tiles render on the collection grid. "Absolute first" = plain `grid.prepend`; dedup-vs-tiles guard is dead-insurance here (kept, costs ~0). Corrects plan FINDING 2.

## Handle source
- `a.product-card__link[ref="productCardLink"]` href = `{{ variant_to_link.url }}` (= `/products/<handle>?variant=<id>`) — `snippets/product-card.liquid:112-119`.
- Also `a[ref="cardGalleryLink"]` (card-gallery.liquid:198-201) and `a[ref="productTitleLink"]` (media-less). Match handle via regex `/\/products\/([^/?#]+)/` on either link's href.
- Custom tiles have **no** product link → naturally skipped by handle match.
- `[LIVE]` locale prefix: derive `/xx` before `/collections|/products` from `location.pathname`.

## Variant → image hooks (critical)
Swatch input (`snippets/variant-swatches.liquid:98-118`), one per color option value:
- `input[type=radio][name="<Option>-<productId>-swatch"]`
- `data-option-media-id="<media.id>"` ← the color's slide id (KEY hook)
- `data-variant-id="<option_value.variant.id>"` ← **representative** variant for that color (NOT the ad's full color+size variant, unless single-option product)
- `data-option-value-id`, `data-option-available`, `value="<option value title>"`
Slides (`card-gallery.liquid:174-188` → `slideshow-slide.liquid`): `slideshow-slide[slide-id="<media.id>"][variant-image][hidden]`; generic (non-variant) media have no `variant-image` and stay visible.
Card API (`assets/product-card.js`): public `previewVariant(mediaId)` → `slideshow.select({id})` (`:362`); private `#updateVariantImages()` reveals `slide-id==optionMediaId`, hides other `[variant-image]` slides (`:260-328`). `slideshow.select({id},_,{animate:false})` matches by `slide-id` (`slideshow.js:160,179`). `productCard.refs.slideshow.refs.slides` = slide array.

### Chosen variant-swap mechanism (deviation from plan's "native-swatch primary" — justified)
**Primary = deterministic slide reveal** (replicates the theme's own `#updateVariantImages` finalize): reveal `slide[slide-id=mediaId]`, hide sibling `[variant-image]` slides, `slideshow.select({id:mediaId})`. **Rationale:** driving the swatch natively (`input.checked` + dispatch) routes through `SwatchesVariantPickerComponent.variantChanged` → `fetchUpdatedSection()` (a section-render network fetch) + `morph()` of the card (`product-card.js:537-585`) — heavy, async, and risks re-rendering/disrupting the just-pinned card. The deterministic reveal reaches the identical visible end-state with no network and no morph. Native-swatch dispatch retained as documented fallback if reveal proves insufficient `[LIVE]`.
Variant→mediaId mapping: (1) DOM-direct `input[data-variant-id==V]` → its `data-option-media-id` (single-option products); (2) else `fetch('/products/<handle>.js',{credentials:'same-origin'})` → `variants.find(id==V).options[]` → match swatch `input[value==optionTitle]` → its `data-option-media-id`. No match → leave default image (size-only variant), still set link. `[LIVE]` confirm `/products/<handle>.js` variant `.options` strings equal swatch `input.value`.

## Link `?variant=` passthrough
Native `#handleCardVariantUrlUpdate` (product-card.js:524-531) only fires on the heavy swatch path and uses the *representative* variant id, not the ad's exact V. → **Set `?variant=V` manually** on `a.product-card__link` / `cardGalleryLink` / `productTitleLink` after pin (works for both default-image and swapped-image cases).

## Pagination + dedup
- Infinite scroll is active **only when `show_pagination=false`** (`product-grid.liquid:115,133` render `[ref="viewMorePrevious|Next"]` sentinels). Default `show_pagination=true` → classic numbered pagination, no JS append → **no dedup needed**.
- `[LIVE]` confirm `/collections/sale` setting. If infinite: `paginated-list.js` `grid.append(...)`/`grid.prepend(...)` new `li[ref="cards[]"][data-page]` (`:190,229`), next/prev page derived from `cards[last]`/`cards[0]` `data-page` (`:254-275`).
- Dedup = MutationObserver on grid `childList`, active only when a pin is set; remove any later `li` whose product-link handle == pinned handle (≠ pinned node). Custom tiles excluded (no product link).
- **Pagination-math guard:** set pinned `li.dataset.page` = first visible page so `cards[0].dataset.page` stays correct after `prepend`.

## Component readiness
- Reorder: module is `type=module` (deferred) → grid present at run; `await customElements.whenDefined('product-card')` before touching refs.
- Variant swap: poll `productCard.refs.slideshow.refs.slides.length` (rAF, ~3s cap) before reveal.

## Known limitation (surface to user)
Reorder-only pins only products present in the **initial page** (`product_per_page`=24). Product deeper in collection → not in DOM → graceful no-op. Consistent with locked "reorder, no fetch" + "product absent → no-op". Merchant must sort advertised products into page 1 (or raise products-per-page).

## Residual `[LIVE]` checks for Phase 4 gate
1. `/products/<handle>.js` `.options` strings == swatch `input.value`.
2. `/collections/sale` pagination mode (dedup exercised or not) + a multi-color test product present.
3. Locale prefix active?
4. Deterministic reveal renders correct color image with no flash/disruption; if not → native-swatch fallback.
</content>
</invoke>
