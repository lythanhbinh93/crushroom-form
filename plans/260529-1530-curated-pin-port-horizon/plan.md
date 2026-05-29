---
title: "Curated Pin port to BeachNapClub Horizon theme"
description: "JS-only port of the ?first=<handle>&variant=<id> ad-landing pin (reorder + native variant-image swap) into the customized Horizon collection grid"
status: complete
priority: P2
created: 2026-05-29
completed: 2026-05-29
---

# Curated Pin port to BeachNapClub Horizon theme

## Overview

Meta ads open `…/collections/sale?first=<handle>&variant=<id>`; the ad-clicked product must render as collection card **#1** showing the **ad variant's color image**, while organic browsing stays byte-for-byte unchanged (ship-dormant).

Chosen approach (approved brainstorm): **Reorder + native variant-swap, JS-only.** New `assets/curated-pin.js` (ES module) + one `<script type="module">` enqueue line in `sections/main-collection.liquid`. Reorder the already-rendered `<li>` to slot #1, then drive the card's **own** `<product-card>` machinery to swap to the ad variant's image. No bare card template, no Liquid card edits, no merchant-setting risk.

**Context:** approved design + decisions + rejected alternatives in [brainstorm-summary.md](./brainstorm-summary.md).
**Code repo (work context):** `d:/github local/tytkwe-qe-theme` (Shopify Horizon 3.0.0, customized).
**Store:** `tytkwe-qe.myshopify.com` / beachnapclub.com. Live theme = BeachNapClub V1.0 (`#141574930516`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Discovery and live-DOM recon](./phase-01-discovery-and-live-dom-recon.md) | Complete ([report](./reports/phase-01-dom-contract.md)) |
| 2 | [Core pin reorder and enqueue](./phase-02-core-pin-reorder-and-enqueue.md) | Complete |
| 3 | [Variant-image swap and pagination dedup](./phase-03-variant-image-swap-and-pagination-dedup.md) | Complete |
| 4 | [Live-DOM test gate and ship](./phase-04-live-dom-test-gate-and-ship.md) | Complete ([report](./reports/phase-04-verification.md)) |

## Outcome (2026-05-29)
Shipped `assets/curated-pin.js` + 1-line enqueue in `sections/main-collection.liquid` to theme **#143112831060** ("Copy of BeachNapClub V1.0", unpublished — user chose this over direct-to-live; live #141574930516 untouched). Branch `feat/curated-pin-ad-landing` @ `4249b59`. All success criteria verified live (theme-dev + deployed-theme smoke test), 0 page errors.

**Two implementation deviations from plan (both verified, see reports):**
1. Collection cards render **no inline swatches** → variant→image resolved via `/products/<handle>.js` `variant.featured_media.id` (== slide `slide-id`), not swatch `data-option-media-id`.
2. Variant-swap primary = **deterministic slide reveal** (mirrors theme's `#updateVariantImages` finalize) instead of native-swatch dispatch, to avoid a section-refetch+morph that could disrupt the pin.

Dedup: N/A — `sale` uses classic pagination (infinite scroll off); observer stays dormant by design.

## Key Decisions (locked)
- Product **always in landing collection** → reorder only, no fetch/prepend.
- Pinned card **must show ad-variant image** → drive native swatch / `previewVariant(mediaId)`; slide-level fallback.
- Scope = visual pin core + variant-image (link `?variant=` passthrough comes free via native swatch select). OUT: analytics, UTM/fbclid, swatch suppression, skeleton/prefetch/cache.
- URL contract: `?first=<handle>&variant=<id>` (same as source, so existing Meta ad URLs port across stores).
- **[Validation] Pin position = ABSOLUTE first** — prepend before the custom `gen-custom-collection` tiles (grid.prepend), ad product is the very first grid element.
- **[Validation] `.shopifyignore` is a pre-push prerequisite** — create it (guarding `config/settings_data.json`, `sections/*.json`, `templates/*.json`) before any live push; theme currently lacks it.
- **[Validation] Variant-swap is non-blocking** — if unreliable at the test gate, ship **reorder-only v1** (correct product #1 + `?variant=` link, default image); variant-image is a fast-follow.
- **[Validation] Deploy = direct to live** theme `#141574930516` (safe: dormant without `?first=`).

## Global Risks
1. Driving customized `#updateVariantImages()` (non-stock; leftover console.logs) — ~70% first-try; slide-level fallback de-risks. **Live-DOM test mandatory before push.**
2. `paginated-list.js` tracks pages via `li[data-page]`; reorder can duplicate the pinned card when its natural page loads → dedup required.
3. Run timing: must execute after `<product-card>` upgrades + slideshow ready.
4. Modified Horizon → verify empirically, don't trust stock docs.

## Success Criteria (whole plan)
- `…/collections/sale?first=H&variant=V` → H is card #1, shows V's color image, link carries `?variant=V`.
- No `?first=` → grid identical to baseline (dormant).
- Product absent / bad handle → graceful no-op, no console error.
- Pagination/infinite-scroll does not duplicate the pinned card.

## Dependencies

None. Independent of existing pod-tee/dopamiles/crushroom plans (different store + theme).

## Validation Log

### Session 1 — 2026-05-29

**Verification Results (Standard tier — 4 phases)**
- Claims checked: 10 | Verified: 8 | Failed: 0 | Findings: 2
- VERIFIED: enqueue pattern (`results-list.js` `<script type="module">`), `previewVariant`(product-card.js:362), `#updateVariantImages`(:260), `optionMediaId`(:266), `input[data-variant-id]`(:32,335), `swatches-variant-picker-component`(:343), `slide-id: media.id`+`variant-image`(card-gallery.liquid:175,188), grid `[ref="grid"]`/`li[ref="cards[]"][data-page]`(main-collection.liquid:83-86). `curated-pin.js` absent (safe).
- FINDING 1: `.shopifyignore` missing → live push would overwrite merchant JSON. → see decision below.
- FINDING 2: custom `gen-custom-collection` tiles render before product loop (main-collection.liquid:49,66) → "slot #1" ambiguous. → see decision below.

**Decisions confirmed (4 questions)**
1. Pin position → **Absolute first** (before custom tiles). Affects Phase 2 (prepend logic), Phase 1 (recon tiles), Phase 3 (dedup must not treat tiles as product dupes).
2. `.shopifyignore` → **Add before pushing**. New Phase 4 pre-push step.
3. Variant-swap reliability → **Ship reorder-only v1 if it fails the gate**; variant-image fast-follow. Phase 3/4.
4. Deploy → **Direct to live** `#141574930516`. Phase 4 unchanged.

### Whole-Plan Consistency Sweep
- Re-read plan.md + all 4 phase files. No stale terms; decisions propagated to Phases 1-4 (markers added). "Reorder only / always in collection" remains consistent with Absolute-first prepend (prepend is reorder of an existing card). No embedded-contract duplication. **Zero unresolved contradictions.**
