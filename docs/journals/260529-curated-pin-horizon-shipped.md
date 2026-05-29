# Curated-pin ported to BeachNapClub (Horizon 3.0.0) — shipped

**Date:** 2026-05-29
**Repo:** `d:/github local/tytkwe-qe-theme` · **Plan:** `crushroom-form/plans/260529-1530-curated-pin-port-horizon/`
**Branch:** `feat/curated-pin-ad-landing` @ `4249b59` · **Deployed to:** theme `#143112831060` (Copy of BeachNapClub V1.0, unpublished)

## What shipped
JS-only "curated pin" for Meta-ad landing pages. Ad URL `…/collections/sale?first=<handle>&variant=<id>` → that product becomes collection card #1 showing the ad variant's color image, link carries `?variant=`. Dormant (zero DOM/network/console) without `?first=`.
- `assets/curated-pin.js` (new) + 1-line `<script type="module">` enqueue in `sections/main-collection.liquid`.
- `.shopifyignore` added (guards merchant JSON on push).

## Decisions / deviations from plan
1. **Variant→image without swatches.** Plan assumed card swatch inputs (`data-option-media-id`). Live recon showed Horizon collection cards render **0 inline swatches** (they live only in the quick-add drawer). Resolved instead via `/products/<handle>.js` → `variant.featured_media.id`, which equals the card gallery slide's `slide-id`. First impl returned null → no swap; one-line fix made it work across 3 colors.
2. **Deterministic slide reveal over native-swatch dispatch.** Driving the swatch natively routes through `variantChanged → fetchUpdatedSection() + morph()` (network + card re-render, risks disrupting the pin). Chose to mirror the theme's own `#updateVariantImages` finalize directly (reveal target `slide-id`, hide other `[variant-image]` slides, `slideshow.select({id})`). No network, no morph.
3. **Pin position.** Plan worried about `gen-custom-collection` tiles before the product loop — they're **commented out** in `main-collection.liquid`, so `grid.prepend` is genuinely first. Dead-insurance dedup-vs-tiles guard kept (cost ~0).
4. **Dedup is N/A.** `/collections/sale` uses classic numbered pagination (infinite scroll off); the dedup MutationObserver only attaches when `[ref="viewMoreNext|Previous"]` sentinels exist, so it stays dormant here.
5. **Deploy target.** User chose to push to the unpublished "Copy" theme `#143112831060` (promote in admin when ready) rather than direct-to-live `#141574930516` — live never touched.

## Verification
theme-dev local proxy (`127.0.0.1:9292`, renders local files — avoids the curl/preview-cookie trap) + agent-browser. All matrix cases pass with **0 page errors**: pin+variant (Light Pink, Antique Sapphire), pin-no-variant, dormant (`pinnedCount=0`), bad-handle. Re-smoke-tested on the deployed theme via real `beachnapclub.com` share-preview (`_ab=0&_fd=0&_sc=1`). Code review: no Critical/High.

## Known limitation
Reorder-only: pins only products in the initial page render (`product_per_page`=20 on `sale`). A product deeper in the collection isn't in the DOM → graceful no-op. Merchant must sort advertised products into page 1.

## Round 2 — fetch+prepend (commit `0fe0b29`, same day)
User tested "other products" → nothing pinned. Root cause: reorder-only only reaches the **initial 20-card render**; `sale` has 190 products with classic pagination, so ~170 advertised products (page 2+) silently no-op'd. seashell-america worked by luck (page 1).
Fix (user-approved; reverses the brainstorm's no-fetch decision — "in collection" ≠ "in rendered DOM"): when the product isn't in the DOM, fetch its collection page via the **Section Rendering API** (`?section_id=<id>&page=N`, the same call `paginated-list.js` uses), extract the real card `<li>`, prepend, then run the existing variant-swap. Page located via `/collections/<h>/products.json` index ÷ perPage; bounded to ≤4 same-origin fetches with ±1 tolerance, never a full scan. Adversarial review applied 3 hardening fixes (clear fetched card's foreign `data-page`; trust DOM perPage only on page 1; doc the default-sort assumption). Verified on deployed Copy theme: off-page product pins + swaps, page-1 still reorders (no dup), 0 errors.

## Round 3 — loading polish (commit `ce5f1b2`, same day)
User: "the loading looks weird." Agent observation on the deployed theme caught it: off-page products rendered the **normal grid first**, then the fetched card **popped in at the top ~1s later**, shoving everything down (visible reflow). Fix mirrors dopamiles' shimmer skeleton: reserve slot #1 with a sized skeleton immediately, then swap the fetched card in place → no jump; reordered (page-1) cards pin before paint. Debugging caught a self-inflicted regression first: an interim version dropped the `whenDefined` await and used `grid.replaceChild`, which threw when the grid re-rendered during hydration in the fetch window (pin silently failed). Fixed by restoring the await + a **resilient insert** (`replaceChild` if the skeleton survived, else `prepend`). Verified on real CDN: skeleton at load → card swap in place, page-1 reorder instant, 0 errors.

## Round 4 — loading perf via bare ?view=card (commit `4e83f80`)
User: "workflow is ok but loading time is long." A 3-lens review workflow (perf / single-card-render / correctness) unanimously found the off-page path fetched a **~534KB collection page + products.json** (3 serial round-trips) just to extract one card. Fix: port dopamiles' bare `?view=card` pattern to Horizon — `templates/product.card.json` (`"layout": false`) → `sections/curated-pin-card.liquid` rendering the `_product-card` block → fetch one **~20KB** card by handle. **~534KB/3 RTT → ~20KB/1 RTT.** Deleted `products.json` lookup, page-math, and the 534KB DOMParse.
Horizon gotchas hit while building it: (1) `_product-card`'s children (gallery/title/price) come from the **template JSON block tree**, not the block's self-render — a bare section renders an empty card shell; had to replicate `templates/collection.json`'s `product-card` block config into `product.card.json`. (2) JSON-template no-layout is `"layout": false` (boolean), NOT `"layout": "none"` (read as a missing layout filename → 500). (3) a `static: true` block must NOT appear in its section's `block_order`. (4) `.shopifyignore` ignores `templates/*.json` (merchant data) — added `!templates/product.card.json` so this code template deploys. Verified on deployed Copy theme: 20KB card, gallery+price+5 slides, off-page pins with skeleton, page-1 reorders, 0 errors.

## Round 5 — kill the late variant fetch (commit `f98eb0e`)
User: "it worked but still loads after the current product card a bit." Resource-timing trace on the deployed theme found the culprit: after the ~674ms `?view=card` fetch, `applyVariant` fired a **second ~1045ms `/products/<handle>.js` fetch** to resolve the variant→media id and re-reveal the slide — a beat *after* the card was already on screen. But the bare card is fetched **with `&variant=`**, so the server already renders the correct slide visible + the link with `?variant=` (verified: only the variant's slide is non-hidden on arrival). The whole `applyVariant` pass was redundant for fetched cards. Fix: skip `applyVariant` when the card came from `fetchCardView` (kept only for the page-1 reorder path, whose card was rendered with its default variant). Off-page now: one ~674ms fetch, correct image on arrival, no late swap. (Remaining optional polish: a `<head>` prefetch kicker to overlap that fetch with HTML parse → near-instant.)

## Reusable lessons
- Horizon collection cards expose images (`slideshow-slide[slide-id][variant-image]`) but **not** swatch pickers inline — map variants via product JSON `featured_media.id`, not card DOM swatch attrs.
- `slideshow.select({id})` matches by `slide-id`; reveal a hidden slide before selecting (it won't un-hide on its own).
- `paginated-list.js` derives prev/next page from `cards[0]`/`cards[last]` `data-page` — when prepending a pinned card, set its `data-page` to the first visible page (and clear a fetched card's foreign `data-page`) to avoid skewing pagination math.
- **"Product in collection" ≠ "product in the rendered DOM."** On a paginated collection only page 1 is in the DOM; a reorder-only pin silently fails for everything else. Use the Section Rendering API (`?section_id=&page=N`) to fetch any product's real card — the Horizon-native equivalent of dopamiles' `?view=card` fetch+prepend.
- A `?first=` ad landing only works on the theme the **public ad URL serves** = the LIVE theme. Preview themes need the share-preview session established first (the 301 to the primary domain drops `preview_theme_id`); pasting the ad URL cold serves live → no feature.
</content>
