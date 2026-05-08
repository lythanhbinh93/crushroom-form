# 3-Pack Picker — Code-Complete Report

**Date:** 2026-05-08 11:15
**Phase:** [phase-04-3pack-picker-and-cart-grouping.md](../260507-1636-pod-bundle-function/phase-04-3pack-picker-and-cart-grouping.md)
**Repo:** `D:\github local\pod-tee-theme` (branch `feat/bundle-function`)
**Status:** DONE_WITH_CONCERNS

## Files Created (6)

| File | LOC | Role |
|---|---|---|
| `templates/page.three-pack.json` | 21 | Template suffix `three-pack` (URL handle stays `3-pack`) |
| `sections/dopamiles-3pack-picker.liquid` | 174 | Section orchestration + JSON product data |
| `snippets/dopamiles-3pack-slot.liquid` | 49 | Single slot (empty + filled state markup) |
| `snippets/dopamiles-3pack-browse-card.liquid` | 41 | Browse-rail card |
| `assets/dopamiles-3pack.js` | 360 | Slot fill, localStorage, batch ATC |
| `assets/dopamiles-3pack.css` | 354 | 3-col → 1-col responsive, sticky CTA |

## Files Modified (1)

- `layout/theme.liquid` — gated `dopamiles-3pack.css` load on `template == 'page.three-pack'`

## Architecture Pivot (User-Approved)

Plan called for cart-drawer grouping by `_bundle_id`. Inspection of existing drawer revealed parent/child grouping (`_bundle_id` parent + `_bundle_parent` children) already in use by the kit picker. Adding a second shared-id grouping path would have:
- Doubled drawer Liquid complexity
- Risked the kind of scope bug code-reviewer caught in Phase 03

**Pivot:** 3 ATC lines carry informational `_bundle_kind: '3-pack'` + shared `_bundle_id` UUID; existing Phase 03 cart-headline (`shop.metafields.bundles.tiers`-driven) already announces "Bundle saving applied · 25% off" above the 3 lines. Function applies discount via tag+qty-sum regardless of grouping.

Saved ~30% LOC and zero drawer regressions.

## Function/Theme Contract Verified

- ✅ Tag: `bundle-eligible` (graphql `hasTags`)
- ✅ Metafield: `shop.metafields.bundles.tiers` (JSON `[{min,pct}]`)
- ✅ Quantity rule: qty-sum (Function `saturating_add(line.quantity)`) — resolves yesterday's Q2
- ✅ Theme snippets all read `shop.metafields.bundles.tiers` (banner/headline/pill/picker consistent)

## Validation

- ✅ Function compiles: `cargo check --target=wasm32-unknown-unknown --release`
- ✅ JS syntax: `node --check dopamiles-3pack.js`
- ✅ Theme check: zero issues on new files (54 pre-existing offenses in unrelated files)
- ⏳ Browser QA: user-owned (after Path A deploys Function + seeds metafield)

## Path A Runbook Delivered

`plans/260507-1636-pod-bundle-function/path-a-runbook.md` — step-by-step deploy + seed + tag + QA + checkout for user execution.

## Concerns

1. **Browse card supports min-price only** — `product.price_min` displayed; if a tee has variant-level pricing differences (e.g., 3XL priced higher), browse rail shows base price. Acceptable for v1 (POD tees are usually flat-priced) but worth flagging.
2. **Slot total assumes equal-priced variants in tier-3 pct calc** — JS `totalCents()` sums actual variant prices; `effectivePct()` returns flat 25%. So saving math `Math.round(subtotal * pct3 / 100)` is correct for the picker UI even with mixed prices. No bug, but Function's actual discount on checkout will match because Function computes per-line.
3. **All-slots-full edge:** if user re-clicks browse rail after filling all 3, slot 3 gets replaced (not a new slot opens). Documented in JS comment; alternate UX would surface a toast "Slot 3 replaced." Decision deferred to QA feedback.
4. **localStorage TTL 7 days** chosen heuristically — no data on session length yet. Adjustable in `STORAGE_TTL_MS` constant.

## Unresolved Questions

1. **Page creation in admin** — user must create page with handle `3-pack` and assign template `three-pack` before the URL works. Captured in Path A runbook step but separate from Path B code.
2. **Browse rail ordering** — currently uses `collections['bundle-eligible'].products` default order (Shopify admin setting). May want manual sort or hot-products-first; defer until usage data.
3. ~~**Drawer-open after ATC** — selector mismatch~~ **Resolved:** wired to `window.dopCart.open()` (exposed by `assets/dopamiles-cart.js:404`); falls back to `cart:open` event dispatch and finally `/cart` redirect.

**Status:** DONE_WITH_CONCERNS
**Summary:** 3-pack picker code-complete (6 new files + 1 edit); cart-grouping pivoted to YAGNI path (no drawer mutation); browser QA pending Path A deploy.
