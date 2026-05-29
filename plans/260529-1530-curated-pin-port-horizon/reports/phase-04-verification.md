# Phase 4 — Live-DOM verification (theme dev preview)

**Date:** 2026-05-29 | **Method:** `shopify theme dev` local proxy `http://127.0.0.1:9292` (renders LOCAL files, no admin-cookie trap) + `agent-browser` v0.27.0.
**Preview theme:** `curated-pin-preview` #143112962132 | **Test product:** `seashell-america` (Color/Size, 7 colors), card #8 naturally on page 1.

## Result: ALL PASS — proceed to ship

| Case | URL (`…/collections/sale` + ) | Expected | Actual | ✓ |
|------|------|----------|--------|---|
| Pin + variant | `?first=seashell-america&variant=46900943028308` (Light Pink) | card #1, Light Pink image, link `?variant=` | firstHandle=seashell-america; visible slide=32245890613332 (Light Pink); link has variant; default Cornsilk hidden | ✓ |
| Pin + variant (2nd color) | `&variant=46900942930004` (Antique Sapphire) | teal image | visible slide=32245890154580 (Antique Sapphire) | ✓ |
| Pin, no variant | `?first=american-tide` | card #1, default image, no error | firstHandle=american-tide; pinnedCount=1; 1 visible slide; 0 errors | ✓ |
| Dormant | `` (no param) | grid identical; no module activity | firstHandle=liberty-sands-ver2 (natural); pinnedCount=0; 0 errors | ✓ |
| Bad handle | `?first=does-not-exist-xyz&variant=999` | no-op, no error | firstHandle unchanged; pinnedCount=0; 0 errors | ✓ |
| Pagination / dedup | classic numbered pagination on `sale` | no dup | `infiniteScroll=false` → dedup observer never attaches (by design); N/A | ✓ |
| Locale | n/a | — | store serves no locale prefix (`/collections/sale`); `localePrefix()`→'' | ✓ |

`agent-browser errors` returned empty on every case → **zero page errors**.
Screenshots: `reports/pin-variant-lightpink.png` (card #1 pink), `reports/pin-variant-mobile.png` (card #1 teal).

## Key runtime finding (drove a code fix)
Collection cards in this theme render **no inline swatch inputs** (`input[name$="-swatch"]` count = 0); swatches live only in the quick-add drawer. First implementation read `data-option-media-id` off card swatches → returned null → image never swapped (Phase-1 source assumption was swatch-present).
**Fix:** resolve the slide media id from `/products/<handle>.js` → `variant.featured_media.id`, which equals the gallery slide's `slide-id`. Verified across 3 colors. DOM-direct swatch path retained for layouts that do expose swatches.

## Resolved `[LIVE]` items from phase-01 report
1. `/products/.js` shape — `variants[].featured_media.id` present and equals slide `slide-id`. ✓ (replaces swatch-value matching)
2. `sale` pagination = classic numbered (infinite scroll off) → dedup not exercised. ✓
3. No locale prefix on this store. ✓
4. Deterministic slide reveal renders correct color image, no flash, holds (no competing `#updateVariantImages` since no variantPicker present). ✓

## Notes / limitations (unchanged from plan)
- Reorder-only: pins only products in the initial 20-per-page render; deeper products → graceful no-op. Merchant must sort advertised products into page 1.
- `product_per_page` on `sale` = 20 (not 24).

## Deploy (2026-05-29)
- **Decision change:** user chose to deploy to the existing unpublished **"Copy of BeachNapClub V1.0" #143112831060** (NOT direct-to-live #141574930516). Zero customer impact; merchant promotes it in admin when ready.
- Pushed `git` branch `feat/curated-pin-ad-landing` (commit `4249b59`) via `shopify theme push --theme 143112831060` with `.shopifyignore` (merchant JSON preserved; only `assets/curated-pin.js` + `sections/main-collection.liquid` changed).
- **Smoke test on deployed theme** (real `beachnapclub.com` share-preview, tokens `_ab=0&_fd=0&_sc=1`): pin+variant (Light Pink) ✓ card #1, correct image, link `?variant=`, 0 errors; dormant ✓ pinnedCount=0, natural first product, 0 errors.
- Preview themes live: `curated-pin-preview #143112962132` (theme-dev target) and the deployed `#143112831060`.

## Rollback
- Code is isolated on branch `feat/curated-pin-ad-landing`; `master` baseline = `9aedf43`.
- To revert the theme: re-push `master` (or `git revert` + push) to `#143112831060`; or in admin simply do not promote/publish the Copy.
- The live theme `#141574930516` was never touched.

## Round 2 — fetch+prepend for off-page products (commit `0fe0b29`)
**Defect found by user testing "other products":** the locked "reorder-only" approach only pins products in the **initial 20-card render**. `sale` = 190 products, classic pagination → ~170 advertised products (page 2+) silently no-op'd. seashell-america worked only because it's page 1, card #8.
**Root cause (verified):** `findCardByHandle` only sees rendered DOM; off-page products aren't there. Confirmed: `retired-sunse` (page 5) → `targetInDOM:false, pinned:false`.
**Fix (user-approved scope change, reverses brainstorm's no-fetch decision):** when not in the DOM, fetch the product's collection page via the Section Rendering API (`?section_id=<id>&page=N`, same call `paginated-list.js` uses), extract its real card `<li>`, prepend it, run the existing variant-swap. Page located via `/collections/<h>/products.json?limit=250` index ÷ perPage. Bounded to ≤4 same-origin fetches (1 products.json + ≤3 page probes with ±1 tolerance); **never a full-collection scan**; bad handle → 0 page fetches.
**Adversarial review (DONE_WITH_CONCERNS, no Critical):** applied H1 (clear fetched card's foreign `data-page` so it can't skew pagination math), M1 (trust DOM `perPage` only on page 1), M2 (doc products.json default-sort assumption). Security PASS (handle never in fetch URL; DOMParser/importNode don't execute scripts; same-origin creds).
**Verified on DEPLOYED Copy theme #143112831060** (real beachnapclub.com share-preview, 0 errors):
- Off-page `retired-sunse` (page 5) → card #1, 21 cards, variant image swapped, link `?variant=`. ✓
- Page-1 `seashell-america` → still **reorders** (20 cards, single instance, no fetch, no dup). ✓
- Dormant → pinnedCount 0. ✓ · Bad handle → no-op, 0 fetches. ✓
- Screenshot: `reports/offpage-pin-retired-sunse.png`.

## Known limitations (current)
- Products beyond products.json `limit=250` (collection >250) won't locate → no-op. `sale`=190, fine.
- Assumes default collection sort on the ad URL (no `?sort_by=`/filters); a mismatch degrades to graceful no-op.
- Still requires the code to be on the **theme the ad URL serves**. Public ad URLs hit the LIVE theme — so for real campaigns the feature must ship to live #141574930516 (user holding on that; currently on Copy #143112831060 only). Preview testing needs the share-preview session established first (the 301 drops `preview_theme_id`).
</content>
