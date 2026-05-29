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

## Reusable lessons
- Horizon collection cards expose images (`slideshow-slide[slide-id][variant-image]`) but **not** swatch pickers inline — map variants via product JSON `featured_media.id`, not card DOM swatch attrs.
- `slideshow.select({id})` matches by `slide-id`; reveal a hidden slide before selecting (it won't un-hide on its own).
- `paginated-list.js` derives prev/next page from `cards[0]`/`cards[last]` `data-page` — when prepending a pinned card, set its `data-page` to the first visible page (and clear a fetched card's foreign `data-page`) to avoid skewing pagination math.
- **"Product in collection" ≠ "product in the rendered DOM."** On a paginated collection only page 1 is in the DOM; a reorder-only pin silently fails for everything else. Use the Section Rendering API (`?section_id=&page=N`) to fetch any product's real card — the Horizon-native equivalent of dopamiles' `?view=card` fetch+prepend.
- A `?first=` ad landing only works on the theme the **public ad URL serves** = the LIVE theme. Preview themes need the share-preview session established first (the 301 to the primary domain drops `preview_theme_id`); pasting the ad URL cold serves live → no feature.
</content>
