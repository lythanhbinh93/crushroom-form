---
phase: 2
title: "Core pin reorder and enqueue"
status: complete
priority: P1
effort: "3-4h"
dependencies: [1]
---

# Phase 2: Core pin reorder and enqueue

## Overview
Implement the dormant-safe core: parse `?first=`, locate the grid, find the matching card by handle, reorder it to slot #1. No variant-image work yet (Phase 3). Enqueue the module from the collection section.

## Requirements
- Functional: with `?first=<handle>`, the matching card moves to position #1 of the grid. Without it, nothing runs.
- Non-functional: zero impact when dormant; no console errors on any state; ES-module style matching Horizon conventions.

## Architecture
New `assets/curated-pin.js` (ES module). Logic:
1. **Dormant guard** — read `new URL(location).searchParams.get('first')`; if absent → `return` immediately (no DOM touch, no fetch).
2. **Param parse** — accept bare handle, relative `/products/<handle>`, locale-prefixed `/en/products/<handle>`, and FB-encoded full-URL forms (port `handleFromPath` logic from source `dopamiles-curated-pin.js:144`). Also read optional `variant` (used in Phase 3).
3. **Readiness** — await `customElements.whenDefined('product-card')` + grid present (signal confirmed in Phase 1).
4. **Locate grid** — `document.querySelector('[ref="grid"]')` (fallback `.product-grid`). Bail if absent (not a collection page).
5. **Find card** — iterate `li[ref="cards[]"]` (fallback `.product-grid__item`); read each card's `.product-card__link` href, extract handle, compare. First match wins.
6. **Reorder** — `grid.prepend(li)` → **absolute first**, before the custom `gen-custom-collection` tiles (decision: ad product is the very first grid element). No-op if already first. <!-- Updated: Validation Session 1 - absolute-first prepend -->`
7. **Graceful exits** — handle not found / grid not found / parse fail → silent return.

Enqueue: add one line to `sections/main-collection.liquid` (top, alongside `results-list.js`):
`<script src="{{ 'curated-pin.js' | asset_url }}" type="module" fetchpriority="low"></script>`

## Related Code Files
- Create: `tytkwe-qe-theme/assets/curated-pin.js`
- Modify: `tytkwe-qe-theme/sections/main-collection.liquid` (1 line enqueue)
- Reference (port parser from): `pod-tee-theme/assets/dopamiles-curated-pin.js:14-52,144-160`

## Implementation Steps
1. Scaffold `curated-pin.js` as a module with the dormant guard first.
2. Port + adapt URL/handle parsing (drop the FB cases if Phase 1 shows ads only send bare handle — keep KISS).
3. Implement grid locate + card find by handle (use Phase 1's confirmed selectors + locale handling).
4. Implement reorder.
5. Add enqueue line to `main-collection.liquid`.
6. Local sanity: `shopify theme check`; load preview with `?first=<handle>` and confirm reorder, with no param confirm no-op (defer full verification to Phase 4).

## Success Criteria
- [ ] `?first=<handle>` reorders the matching card to #1 on preview.
- [ ] No `?first=` → no DOM mutation, no network, no console output.
- [ ] Bad/absent handle → silent no-op.
- [ ] `shopify theme check` passes; module loads without errors.

## Risk Assessment
- Locale prefix in handle extraction — covered by Phase 1 finding; test both `/products/` and `/en/products/`.
- Running before grid ready → guarded by readiness await.
- Keep the parser minimal (YAGNI): only support URL forms the ads actually emit.
