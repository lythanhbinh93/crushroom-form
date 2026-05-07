# Phase 04 — Bundle Builder (Quantity Breaks)

## Context Links
- Parent: [plan.md](plan.md)
- Blockers: [phase-02](phase-02-product-template-hero-gallery.md)
- **Cross-plan:** Function code + theme integration shipped by `plans/260507-1636-pod-bundle-function/phase-03`; banner CTA target `/pages/3-pack` now exists (Phase 04 builds handler)
- Shopify Functions discount API: https://shopify.dev/docs/api/functions/reference/discount
- Cart AJAX `/cart/add.js`: https://shopify.dev/docs/api/ajax/reference/cart

## Overview
- **Priority**: P1 (AOV driver — primary business goal)
- **Status**: pending
- **Effort**: 4h
- **Description**: Bundle builder UI letting customer pick 1/2/3 of SAME product in different size/color combos with auto-applied qty-break discount (buy 2 save 10%, buy 3 save 20%).

## Key Insights
- **Two parts** — UI (theme section) and discount engine (Shopify Function). Theme section can ship FIRST with prices showing discount preview; Function ships when ready.
- **Recommendation: Shopify Function** over third-party app. Reasons: free, native, no monthly fee, full control. Cost: ~2h dev for first Function. App alternative ($15-30/mo) only if user wants merchant-friendly admin UI for tier editing — POD store with stable tier rules doesn't need it.
- **UI flow**: 3 "slots" rendered as cards; each slot has variant picker (color + size). Auto-add empty slot when previous filled. Show running total + discount preview.
- **Cart batch-add**: Single `POST /cart/add.js` with `items: [{id, qty}, ...]`. Shopify Function applies discount at cart calculation time (not via line-item properties — cleaner).
- **Discount allocation**: Shopify Function returns `Discount[]` with `targets: [{productVariant: {id}, quantity: N}]` and `value: {percentage: ...}`. Trigger condition: cart contains >=2 of same product (any variant).

## Requirements
**Functional**
- Bundle section with 3 slots; first always visible, slots 2+ unlock as previous filled
- Each slot: thumbnail + color swatches + size dropdown
- Live price total with discount preview ("You save $X")
- Single "Add bundle to cart" button → batch `/cart/add.js`
- Shopify Function applies discount automatically at cart/checkout

**Non-functional**
- Discount tiers configurable in section schema (2-tier and 3-tier % values)
- Function deploys via `shopify app generate extension` workflow
- Bundle UI works without Function deployed (preview only — checkout shows full price until Function active; document this gap clearly)

## Architecture
```
UI flow (theme section):
  pod-bundle-builder.liquid
    ├─ slot 1, 2, 3 (each: variant picker)
    ├─ running-total display
    └─ "Add bundle" button → pod-product.js handler

JS flow:
  on bundle button click:
    1. Collect filled slots → [{variant_id, qty: 1}, ...]
    2. POST /cart/add.js with items array
    3. On success → open cart drawer (Dawn native event)

Discount flow (Shopify Function):
  extensions/pod-qty-discount/
    ├─ src/index.js  (function logic)
    ├─ shopify.extension.toml
    └─ input.graphql

  Cart calc → Shopify runs Function →
    Function inspects cart, groups by product_id, applies tier % to qualifying lines

Tier config (Function metafield input):
  shop.metafields.pod.qty_break_tiers = { "2": 10, "3": 20 }
```

## Related Code Files
**To create**
- `D:\github local\pod-tee-theme\sections\pod-bundle-builder.liquid`
- `D:\github local\pod-tee-theme\snippets\pod-bundle-slot.liquid` (per-slot UI, keeps section <200 LOC)
- `D:\github local\pod-tee-theme\extensions\pod-qty-discount\` (Shopify Function — separate Shopify App, may live in different repo or as embedded extension; document path)
  - `extensions/pod-qty-discount/src/index.js`
  - `extensions/pod-qty-discount/shopify.extension.toml`
  - `extensions/pod-qty-discount/input.graphql`

**To modify**
- `D:\github local\pod-tee-theme\templates\product.pod-tee.json` (insert section)
- `D:\github local\pod-tee-theme\assets\pod-product.js` (append bundle handler)
- `D:\github local\pod-tee-theme\assets\pod-product.css` (append slot styles)

## Implementation Steps

### Part A — Theme Section UI (independent of Function)
1. Build `sections/pod-bundle-builder.liquid`:
   - Schema: heading, tier_2_pct (default 10), tier_3_pct (default 20), enabled toggle.
   - Render 3 slot containers using `pod-bundle-slot` snippet.
2. Build `snippets/pod-bundle-slot.liquid`:
   - Slot index, current product reference, color swatch list (from product options), size dropdown.
   - Hidden until slot N-1 filled (CSS via `data-slot-active`).
3. Append bundle JS to `pod-product.js`:
   - Maintain bundle state `{slot1: variantId, slot2: ..., slot3: ...}`.
   - On any slot change → recompute total, apply tier discount preview, show savings.
   - On "Add bundle" → `fetch('/cart/add.js', { method: 'POST', body: JSON.stringify({items: [...]}) })`.
   - On success → dispatch Dawn cart-update event so drawer opens.
4. Append slot styles to `pod-product.css`.
5. Insert section into `product.pod-tee.json`.

### Part B — Shopify Function (Discount Engine)
6. From `pod-tee-theme` parent dir or new `pod-tee-app` dir: `shopify app init pod-tee-app` (creates extension scaffold). NOTE: Function lives in App, not theme.
7. `shopify app generate extension --type=product_discounts` — creates `extensions/pod-qty-discount/`.
8. Implement `src/index.js`:
   - Read cart lines, group by `merchandise.product.id`.
   - For each group, compute total qty.
   - If qty >= 3 → apply tier_3_pct; elif qty >= 2 → apply tier_2_pct.
   - Return `Discount` targeting those line items.
9. Configure `shop.metafields.pod.qty_break_tiers` via admin or via app settings UI (deferred — start with hardcoded values, document upgrade path).
10. `shopify app deploy` to install Function on dev store.
11. Activate discount in Shopify admin: Discounts > Create > Automatic > select pod-qty-discount Function.

### Part C — Integration test
12. Add 2 of same product (different sizes) via bundle UI → verify cart shows 10% off in subtotal.
13. Add 3 → verify 20%.
14. Add 1 → verify NO discount.

## Todo List
- [ ] sections/pod-bundle-builder.liquid (with schema)
- [ ] snippets/pod-bundle-slot.liquid
- [ ] Append bundle JS to pod-product.js (state mgmt + batch add)
- [ ] Append bundle styles to pod-product.css
- [ ] Insert into product.pod-tee.json
- [ ] Initialize Shopify App for Function
- [ ] Generate product_discounts extension
- [ ] Implement Function logic (qty grouping + tier match)
- [ ] Deploy Function to dev store
- [ ] Activate auto discount in admin
- [ ] Integration test all 3 tiers

## Success Criteria
- Bundle UI shows live total + savings as slots fill
- Single click adds all slots to cart in one network request
- Cart subtotal reflects correct discount per tier (verified at /cart and /checkout)
- Function does NOT discount when only 1 unit of product
- Section can be hidden via theme editor without affecting other phases

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shopify Function rate limits / instructions limit (5M instructions) | Low | High (function fails silently) | Keep logic simple — group + match, no nested loops over variants |
| User wants tier % editable without redeploy | Medium | Low | Read tiers from `shop.metafields.pod.qty_break_tiers`; merchant edits in admin |
| Bundle JS race with main variant picker | Low | Medium | Namespace bundle state; use separate event channel |
| Customer adds bundle then removes 1 from cart → discount drops | Expected | Low (correct behavior) | Document; tier recomputes automatically by Function on each cart calc |
| Function not deployed when section ships | High in v1 | High (UI claims discount, checkout shows none) | Disable section in theme editor until Function confirmed active in admin |

## Security Considerations
- Function runs server-side — no PII exposure
- Cart AJAX is public API — no auth needed; rate-limit handled by Shopify
- Validate variant IDs in JS before sending (only allow IDs from `window.podProductData.variants`) to prevent malformed bundle requests

## Next Steps
- Independent of phases 03, 05; runs parallel.
- Phase 06 will fire `AddToCart` event for batch adds (single event, not per-item).

## Rollback
- Theme: remove section from `product.pod-tee.json` order array.
- Function: deactivate in Shopify admin Discounts page (instant, no redeploy).
- Both rollbacks reversible without data loss.

## Open Question (escalate to user)
- Confirm preference: **Shopify Function (recommended, free, ~2h extra dev)** vs third-party app ($15-30/mo, plug-and-play). Plan defaults to Function.
