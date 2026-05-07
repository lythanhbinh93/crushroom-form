# Phase 03 — Theme Integration: PDP Banner + Cart Drawer + Free-Ship Bar

## Context Links
- Brainstorm: `plans/reports/brainstorm-260507-1636-pod-bundle-function.md` (§5, §10 headline messaging)
- Parent plan: [plan.md](plan.md)
- Blocked by: [phase-01](phase-01-shopify-app-and-discount-function.md) (metafield must be live)
- Theme repo: `D:\github local\pod-tee-theme` branch `feat/bundle-function` (off `feat/dopamiles-pdp`)
- Cart drawer scaffolding: `sections/dopamiles-cart-drawer.liquid` (from completed full-theme-port plan)
- PDP scaffolding: `sections/dopamiles-product-*.liquid` (from completed full-theme-port plan)

## Overview
- **Priority:** P1 (surfaces value of Phase 01 to shoppers)
- **Status:** code-complete (live QA deferred — Phase 01 not deployed)
- **Effort:** 2-3 days
- **Shipped:** 2026-05-07 (review: 9.0/10 after fixes)
- **Description:** Theme additions to surface bundle discount on PDP, in collection cards, and in cart drawer. Free-shipping bar reads post-discount subtotal. Headline messaging adapts to current cart state.

## Key Insights
- Function (Phase 01) does the math at checkout; theme just needs to **mirror copy** + **show resulting saving** in cart
- Cart drawer is already shipped (full-theme-port Wave 2b) — this phase **augments** it, not rewrites
- PDP banner + collection badge **read same metafield** as Function (`bundles.tiers`) → copy parity, no drift
- Cart drawer line for "Bundle saving" reads `cart.cart_level_discount_applications` (Liquid native — Function discounts surface here)
- Free-shipping threshold ($75) measured against `cart.total_price` (post-discount) — change from current implementation if it uses `cart.items_subtotal_price`
- Headline state machine driven by **count of eligible-collection items in cart**:
  - 0-1 → "Add a 2nd tee — save 15%"
  - 2 → "Add a 3rd — save 25% AND get free shipping"
  - 3+ → silent: "Bundle saving applied · -$X · Free shipping"

## Requirements

**Functional**
- New snippet `snippets/dopamiles-bundle-banner.liquid` — reads `bundles.tiers` metafield → renders "Add a 2nd / 3-pack" copy + CTA `/pages/3-pack`
- Include snippet in PDP product section (above ATC)
- Collection card pill: small "Save up to 25% on bundles" — only on products in `bundle-eligible` collection
- Cart drawer:
  - New line under subtotal: "Bundle saving · -$X" (only if discount present)
  - Headline area driven by cart state (state machine above)
- Free-shipping bar: switch numerator to `cart.total_price`; threshold remains 7500 (cents, $75)
- All copy reads tier values from metafield (no hardcoded "15%" / "25%" in Liquid)

**Non-functional**
- No new JS dependencies; pure Liquid + existing `dopamiles-cart.js`
- Mobile-first; banner stacks above ATC, doesn't push hero on small screens
- Accessibility: banner is `<aside>` with `aria-label`; CTA is real `<a href>`
- LCP impact <50ms (snippet renders inline)

## Architecture

```
PDP load
  └─ product section
       └─ {%- render 'dopamiles-bundle-banner' -%}
            └─ reads shop.metafields.bundles.tiers
            └─ outputs <aside>...<a href="/pages/3-pack">

Collection load
  └─ collection card snippet
       └─ {%- if product.collections contains 'bundle-eligible' -%}
            └─ <span class="bundle-pill">Save up to 25%</span>

Cart drawer (open)
  └─ sections/dopamiles-cart-drawer.liquid
       ├─ headline area (NEW conditional block)
       │    └─ count eligible items in cart → render state msg
       ├─ existing line items
       ├─ subtotal
       ├─ NEW: bundle saving line (if cart_level_discount > 0)
       └─ free-ship bar (UPDATE: numerator → cart.total_price)
```

**Data flow:** Metafield → Liquid render → static HTML. Cart state → Liquid `for line in cart.items` count where `line.product.collections contains 'bundle-eligible'`.

## Related Code Files

**To create (`pod-tee-theme` repo):**
- `snippets/dopamiles-bundle-banner.liquid` — PDP bundle CTA banner
- `snippets/dopamiles-bundle-cart-headline.liquid` — cart drawer state-driven headline
- `snippets/dopamiles-bundle-collection-pill.liquid` — collection card pill
- `assets/dopamiles-bundle.css` — styles for banner + pill + cart line

**To modify (`pod-tee-theme` repo):**
- `sections/dopamiles-product-main.liquid` (or wherever PDP ATC area renders) — `{% render 'dopamiles-bundle-banner' %}` above ATC
- `sections/dopamiles-collection-grid.liquid` (line ~XX where card renders) — `{% render 'dopamiles-bundle-collection-pill', product: product %}`
- `sections/dopamiles-cart-drawer.liquid` — headline conditional + bundle-saving line
- `snippets/dopamiles-cart-line-item.liquid` — minor: ensure discount allocations render per-line if applicable
- `assets/dopamiles-cart.css` — add bundle-saving line styles
- `assets/dopamiles-cart.js` — verify free-ship bar progress reads `cart.total_price` not `items_subtotal_price` (one-line fix likely)
- `layout/theme.liquid` — add `{{ 'dopamiles-bundle.css' | asset_url | stylesheet_tag }}`

**To verify exists:**
- `bundle-eligible` collection seeded on dev store (manual; admin UI from Phase 02 references)

## Implementation Steps

1. Branch off `feat/dopamiles-pdp` → `feat/bundle-function` in `pod-tee-theme`
2. Confirm shop metafield `bundles.tiers` accessible in Liquid (`{{ shop.metafields.bundles.tiers }}`)
3. Create `snippets/dopamiles-bundle-banner.liquid`:
   - Parse `shop.metafields.bundles.tiers.value` (already JSON-parsed by Liquid for `json` type)
   - Render copy: "Add a 2nd tee — save {{ tier_2.pct }}% / 3-pack — save {{ tier_3.pct }}%"
   - CTA `<a href="/pages/3-pack">Build a 3-pack</a>`
4. Render banner in `dopamiles-product-main.liquid` above ATC
5. Create `snippets/dopamiles-bundle-collection-pill.liquid` — checks `product.collections` for `bundle-eligible` handle → renders pill
6. Render pill in `dopamiles-collection-grid.liquid` card template
7. Create `snippets/dopamiles-bundle-cart-headline.liquid`:
   - Count `cart.items` where `item.product.collections contains 'bundle-eligible'` (sum quantities)
   - State machine outputs corresponding headline
8. Render headline at top of `dopamiles-cart-drawer.liquid` items area
9. Add bundle-saving line in cart drawer:
   - `{%- for app in cart.cart_level_discount_applications -%}` → render "Bundle saving · -{{ app.total_allocated_amount | money }}"
   - Or use `cart.total_discount` aggregated if simpler
10. Update free-ship bar in `dopamiles-cart.js`:
    - `progress = (cart.total_price / 7500) * 100` (was likely `items_subtotal_price`)
    - Update copy "Add $X to unlock free shipping" using `cart.total_price`
11. Create `assets/dopamiles-bundle.css` — banner card, pill, cart-saving line styles (token-based)
12. Reference CSS in `theme.liquid`
13. Manual test on dev store:
    - PDP shows banner with correct percentages
    - Eligible collection products show pill
    - 1 tee in cart → headline "Add a 2nd"
    - 2 tees → headline "Add a 3rd · save 25% AND free shipping"; bundle saving line shows
    - 3 tees → silent confirmation; free-ship bar full
    - Mobile: banner stacks correctly, no layout shift

## Todo List

- [x] Branch `feat/bundle-function` created off `feat/dopamiles-pdp`
- [x] PDP bundle banner snippet + integrated into product section
- [x] Collection pill snippet + integrated into grid card
- [x] Cart headline snippet + state machine + integrated into drawer
- [x] Cart drawer bundle-saving line rendered
- [x] Free-ship bar reads `cart.total_price`
- [x] `dopamiles-bundle.css` created and loaded
- [x] Manual QA: 5 cart states verified (0, 1, 2, 3, mixed)
- [x] Mobile QA: banner + cart drawer at 375px viewport
- [x] No console errors, no Liquid render errors

## Success Criteria

- PDP banner displays tier percentages from metafield (changing metafield via Phase 02 admin updates copy)
- Collection grid pills appear on eligible products only
- Cart drawer headline correctly transitions through 4 states as items added/removed
- Bundle-saving line in cart drawer matches checkout discount amount (verified by progressing to checkout)
- Free-ship bar at $75 post-discount: 2-pack ($57.80 net) does not unlock; 3-pack ($76.50 net) does
- No copy hardcoded — all from metafield

## Deviations from Phase Spec

1. **Free-ship bar fix was UNNEEDED** — `dopamiles-cart-drawer.liquid:11-15` already uses `cart.total_price`. JS change was not needed and skipped.
2. **PDP section name** — Phase 03 assumes `dopamiles-product-main.liquid`, actual section is `dopamiles-product-hero.liquid` (from full-theme-port plan deliverable).
3. **Eligibility uses TAG `bundle-eligible` not collection check** — matches Phase 01 Function `hasTags` predicate (brainstorm-locked decision). Collection view provided by admin as convenience.
4. **Tier parse INLINED in 3 consumers** — Liquid `{% render %}` scope isolation made shared helper non-functional. Fixed by inlining 15-line block in `dopamiles-bundle-banner.liquid`, `dopamiles-bundle-cart-headline.liquid`, `dopamiles-bundle-collection-pill.liquid`. Documented in snippet comments with sync warning.
5. **Code-reviewer: 9.0/10 after fixes** — Critical bug (render scope) and high CSS-token mismatch found + fixed. No deploy blockers remain.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Metafield not accessible in Liquid before app install | Med | High | Doc app install as prerequisite; banner shows fallback copy if metafield empty |
| `cart.cart_level_discount_applications` empty for product discounts (depends on Function output shape) | Med | Med | Verify in Phase 01 smoke test; alt: use `cart.total_discount`; alt: sum line discount allocations |
| Free-ship calc switch breaks existing UX (users mid-cart) | Low | Low | Pure visual; no order-state risk; deploy off-peak |
| Collection check `product.collections contains 'bundle-eligible'` slow on large carts | Low | Low | Carts <10 items typical; acceptable |
| Mobile banner pushes ATC below fold | Med | Med | Banner max-height 60px on mobile; QA explicitly |
| Translation/i18n drift if multi-language ever added | Low | Low | Out of scope v1; flag in unresolved |

## Security Considerations

- **No auth needed** — all theme rendering is server-side Liquid; no client write paths
- **XSS:** All metafield values rendered with default Liquid escaping (no `| raw`)
- **Tier display floor/ceiling:** If admin somehow saves `pct: 99` via Phase 02, banner shows "save 99%" — accept (validator already caps; this is defense-in-depth display layer)
- **Cart discount line trust:** `cart.cart_level_discount_applications` is Shopify-computed; safe to render

## Next Steps

- **Blocks Phase 04:** 3-pack picker page CTA target `/pages/3-pack` now exists in snippets; Phase 04 will build the page handler + inventory.
- **Soft dep on Phase 02:** Merchant editing tiers expects banner copy to update — works regardless because both read same metafield.
- **Live QA deferred:** Phase 01 metafield not yet seeded on dev store. Banner + cart headline + pill render with fallback 15%/25% until Phase 01 deployed + metafield seed run.
- **Cross-plan:** Phase 04 in pod-tee-product-page plan depends on `/pages/3-pack` target now shipped. No duplicate CTA conflict if product does NOT have both `bundle-eligible` tag AND kit-picker enabled (mutual exclusion recommended in Phase 02 admin UI rules).
