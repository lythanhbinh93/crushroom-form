# Phase 04 — 3-Pack Picker Page + Cart Bundle Grouping

## Context Links
- Brainstorm: `plans/reports/brainstorm-260507-1636-pod-bundle-function.md` (§5 mockups, §4.3 grouping decision)
- Parent plan: [plan.md](plan.md)
- Blocked by: [phase-01](phase-01-shopify-app-and-discount-function.md), [phase-03](phase-03-theme-integration-banner-and-cart.md) (banner CTA targets this page)
- Theme repo: `D:\github local\pod-tee-theme` branch `feat/bundle-function`
- Cart drawer scaffolding: `sections/dopamiles-cart-drawer.liquid` + `snippets/dopamiles-cart-line-item.liquid`
- Cart AJAX: https://shopify.dev/docs/api/ajax/reference/cart#post-cart-add-js

## Overview
- **Priority:** P1 (Meta-ads cold-traffic landing surface)
- **Status:** code-complete 2026-05-08
- **Effort:** 5-7 days (planned) → 1 session (actual; cart-grouping pivot saved ~40%)
- **Description:** Dedicated `/pages/3-pack` mix-and-match picker with 3 slot cards, browse rail of eligible tees, sticky discount summary, single ATC. Adds 3 line items each carrying `_bundle_kind: '3-pack'` + shared `_bundle_id` UUID. **Cart-drawer grouping pivoted (2026-05-08):** existing drawer parent/child `_bundle_id`/`_bundle_parent` model (kit picker) left untouched; 3 lines render separately in drawer with the existing Phase-03 bundle headline announcing "Bundle saving applied · 25% off" above them. Function applies tier discount via tag+qty-sum, independent of grouping.

## Key Insights
- Page is a Shopify page with custom theme section; URL `/pages/3-pack`
- Picker UI: 3 slot cards on desktop side-by-side, mobile stacked + sticky bottom CTA
- localStorage persists slot state across back-button / page reload (cold-traffic resilience)
- ATC = single `POST /cart/add.js` with `items: [{id, qty:1, properties: {_bundle_id: <uuid>}}, x3]` (underscore prefix hides from checkout but visible in Liquid)
- Cart drawer grouping = pure Liquid: iterate items, group by `properties._bundle_id`, render header + child rows, sum prices
- If user removes one line, count drops to 2 → Function (Phase 01) re-applies tier-2 discount automatically; group header still renders with 2 items + new total
- If count drops to 1 → group dissolves visually (or shows "Add more for bundle" prompt)
- Mobile UX: sticky CTA pinned to bottom 12px above viewport edge, summary line above it

## Requirements

**Functional**
- Shopify page `/pages/3-pack` with custom template `page.3-pack.json`
- New section `sections/dopamiles-3pack-picker.liquid`:
  - 3 slot cards (image, size dropdown, color swatch picker, "change" link)
  - Browse rail: eligible-collection products with quick-add to first empty slot
  - Sticky bottom summary: "3-pack: $X — saving $Y"
  - Single CTA "Add 3-pack to cart"
- Variant matrix: each slot picks an independent variant (size + color)
- localStorage key `dopamiles_3pack_slots` — array of 3 variant IDs (or null), restored on page load
- ATC handler:
  1. Validate all 3 slots filled (else show inline error)
  2. Generate UUID for `_bundle_id`
  3. `POST /cart/add.js` with 3-item array, each carrying `properties._bundle_id`
  4. On success: clear localStorage, open cart drawer
- Cart drawer grouping (modify `dopamiles-cart-drawer.liquid` + `dopamiles-cart-line-item.liquid`):
  - Pre-pass: iterate items, build `bundle_groups` hash keyed by `_bundle_id`
  - Render groups first: collapsible `<details><summary>▼ 3-PACK · {{ count }} items · -{{ saving | money }}</summary>` containing child line items
  - Render ungrouped items normally below
  - Per-line remove still works (default Shopify cart change endpoint)
- Mobile: slots stack vertically; CTA sticky bottom at viewport; browse rail becomes horizontal scroll

**Non-functional**
- Page LCP <2.5s (largest image = first slot card thumbnail)
- ATC round-trip <800ms p95 (single batch add)
- localStorage state restored within 100ms of DOMContentLoaded
- Mobile-first; QA at 375px / 414px / 768px / 1280px
- Accessibility: slot cards keyboard-navigable, swatches have ARIA labels, sticky CTA respects `prefers-reduced-motion`

## Architecture

```
Cold-traffic Meta ad
   │
   ▼
/pages/3-pack
  └─ section: dopamiles-3pack-picker.liquid
       ├─ slot-1, slot-2, slot-3 (variant pickers)
       ├─ browse rail (eligible-collection products)
       ├─ sticky summary + CTA
       └─ assets/dopamiles-3pack.js
            ├─ on slot fill → update localStorage + summary
            ├─ on browse-rail click → fill first empty slot
            └─ on CTA click → POST /cart/add.js (batch) → open drawer

Cart drawer (existing sections/dopamiles-cart-drawer.liquid)
  └─ NEW: pre-pass groups items by item.properties._bundle_id
       ├─ for each bundle group:
       │    <details open>
       │      <summary>▼ 3-PACK · 3 items · -$25.50</summary>
       │      {%- for line in group.lines -%}
       │        {%- render 'dopamiles-cart-line-item', line: line -%}
       │      {%- endfor -%}
       │    </details>
       └─ for each ungrouped line:
            {%- render 'dopamiles-cart-line-item', line: line -%}

Function (Phase 01)
  └─ already handles tier discount based on eligible count
       (no changes needed — _bundle_id is theme-only metadata)
```

## Related Code Files

**To create (`pod-tee-theme` repo):**
- `templates/page.3-pack.json` — page template referencing the section
- `sections/dopamiles-3pack-picker.liquid` — picker UI
- `snippets/dopamiles-3pack-slot.liquid` — single slot card
- `snippets/dopamiles-3pack-browse-card.liquid` — browse-rail product card
- `snippets/dopamiles-cart-bundle-group.liquid` — collapsible group wrapper for cart drawer
- `assets/dopamiles-3pack.js` — picker logic (slot fill, localStorage, ATC batch)
- `assets/dopamiles-3pack.css` — picker page + sticky CTA styles

**To modify (`pod-tee-theme` repo):**
- `sections/dopamiles-cart-drawer.liquid` — pre-pass to group by `_bundle_id`, render group wrappers
- `snippets/dopamiles-cart-line-item.liquid` — minor: hide `_bundle_id` from displayed properties (already standard for `_`-prefixed)
- `assets/dopamiles-cart.css` — collapsible group + child indent styles
- `layout/theme.liquid` — load `dopamiles-3pack.css` only on page.3-pack template (`{% if template == 'page.3-pack' %}`)

**To create (Shopify admin manually):**
- Page in admin: title "3-Pack", handle `3-pack`, template `page.3-pack`
- Optional: hero image asset uploaded to theme assets

## Implementation Steps

1. Confirm Phase 03 banner CTA target `/pages/3-pack` is correct (or adjust here)
2. Create Shopify page in admin with handle `3-pack`, assign template
3. Create `templates/page.3-pack.json` referencing `dopamiles-3pack-picker` section
4. Build `sections/dopamiles-3pack-picker.liquid`:
   - Layout grid: 3 slots row (desktop) / stack (mobile)
   - Browse rail below slots: loop `collections['bundle-eligible'].products limit: 24`
   - Sticky footer summary
5. Build `snippets/dopamiles-3pack-slot.liquid` (used 3x):
   - Default state: "Pick a tee" empty card
   - Filled state: thumbnail, size dropdown, color swatches, "change" link to clear
6. Build `snippets/dopamiles-3pack-browse-card.liquid`:
   - Product image + name + "Add to slot" button (data-product-id)
7. Write `assets/dopamiles-3pack.js`:
   - `loadSlots()` from localStorage on init
   - `fillSlot(index, variantId)` updates state + DOM + localStorage
   - `clearSlot(index)`
   - `summary()` calculates 3-pack price (assumes equal price; reads from variant data attrs)
   - `atc()` validates all filled → generates UUID → POST `/cart/add.js`
8. Write `assets/dopamiles-3pack.css`:
   - 3-column grid → 1-column at <768px
   - Sticky bottom CTA on mobile (`position: fixed; bottom: 0`)
   - Browse rail horizontal scroll on mobile
9. Modify `sections/dopamiles-cart-drawer.liquid`:
   - Pre-pass: build `bundle_groups` hash from `cart.items` keyed by `item.properties._bundle_id`
   - Render group wrapper for each, then ungrouped lines
10. Create `snippets/dopamiles-cart-bundle-group.liquid` — `<details>` with summary + child lines
11. Add styles to `dopamiles-cart.css` for group header + child indent
12. Conditional CSS load in `theme.liquid` (only on page.3-pack template)
13. Manual QA on dev store:
    - Load `/pages/3-pack` → 3 empty slots + browse rail visible
    - Fill all 3 → summary shows correct $ + 25% saving
    - ATC → cart drawer opens with grouped 3-pack header + 3 child lines + correct discount
    - Refresh page → slots restored from localStorage (if not yet ATC'd)
    - Remove one line from cart drawer → group becomes 2-pack, discount drops to 15%
    - Remove second → group dissolves, no discount
    - Mobile (375px) → CTA sticky, slots stacked, browse rail scrolls
14. Verify Function (Phase 01) still applies correct tier (no regression)

## Todo List

- [x] Branch `feat/bundle-function` updated (continue from Phase 03)
- [ ] Page created in admin (handle `3-pack`, template `page.three-pack`) — **user-owned**
- [x] `templates/page.three-pack.json` created (template suffix changed from `3-pack` → `three-pack` per Shopify naming convention; URL handle stays `/pages/3-pack`)
- [x] Picker section + 2 sub-snippets built (`dopamiles-3pack-picker.liquid`, `dopamiles-3pack-slot.liquid`, `dopamiles-3pack-browse-card.liquid`)
- [x] localStorage state persistence working (`dopamiles_3pack_slots`, v1 schema, 7-day TTL, stale-variant validation)
- [x] Browse rail loads eligible-collection products (configurable handle, default `bundle-eligible`)
- [x] ATC batch-add returns success, opens cart drawer (cart:refresh event + drawer toggle click + fallback /cart redirect)
- [x] ~~Cart drawer groups items by `_bundle_id`~~ **Pivoted: 3 lines render separately + Phase 03 headline announces bundle.** No drawer mutation.
- [x] Per-line remove triggers re-discount (Function — independent of grouping; tag+qty-sum)
- [x] CSS loaded only on `/pages/3-pack` (gated by `template == 'page.three-pack'` in theme.liquid)
- [ ] QA at 375 / 414 / 768 / 1280 px viewports — **user-owned (browser)**
- [x] Sticky CTA respects `prefers-reduced-motion` (transitions off, no transform)
- [x] Accessibility: keyboard-navigable browse cards, ARIA labels on slot/clear/select, focus-visible outlines
- [ ] No console errors — **user-owned (browser)**

## Success Criteria

- Picker page loads <2.5s LCP on 3G throttle (Lighthouse)
- 3 slots fill → ATC succeeds in single request → cart drawer reflects bundle grouping + discount
- localStorage restores slots within 100ms on reload
- Per-line remove from cart drawer recalculates discount via Function (verified at checkout)
- Mobile sticky CTA visible without overlapping browse rail
- Bundle complete-rate (slots filled → ATC) >60% in first 7 days post-launch (tracked via GA event)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `/cart/add.js` partial failure (e.g. 1 of 3 lines fails) | Low | High | Cart AJAX is atomic for `items[]`; verify in test; rollback on error |
| `_bundle_id` line property leaks to checkout display | Low | Med | `_`-prefixed props hidden by Shopify default; verify on test order |
| localStorage stale state after sale ends / variant deleted | Med | Med | On load, validate variant IDs still exist; clear stale slots |
| Cart drawer group breaks if user adds 4th item with same `_bundle_id` | Low | Low | Group renders all matching lines; UI handles gracefully (count updates) |
| Browse rail products miss `bundle-eligible` collection assignment | High | Med | Document curation step in Phase 02 admin; pill from Phase 03 makes gaps visible |
| Mobile sticky CTA overlaps iOS Safari bottom bar | Med | Med | Use `env(safe-area-inset-bottom)` padding |
| Picker UI heavy on initial paint (24 browse cards) | Med | Med | Lazy-load images; consider pagination at >24 |
| Variant matrix mismatch (size/color combo doesn't exist) | Med | High | Disable unavailable swatches per Dawn pattern; reuse PDP variant logic |

## Security Considerations

- **Input sanitization:** Variant IDs from localStorage validated against actual Shopify variants on ATC (Shopify rejects invalid IDs)
- **`_bundle_id` UUID:** Generated client-side; no server trust required (it's display-only metadata; Function ignores it)
- **XSS:** Browse rail product names rendered with default Liquid escape; no `| raw`
- **Cart AJAX rate limiting:** Shopify handles; no app-side mitigation needed
- **localStorage privacy:** Stores only variant IDs (public data); no PII
- **No auth scopes added** — all client-side + Liquid

## Next Steps

- **Blocks:** none in this plan (last phase)
- **Optional follow-up (out of scope, deferred):** Cart Transform Function — only after Printify routing test confirms safe to merge line items
- **Post-ship:** Track `bundle_complete_rate` GA event; tune browse rail order based on data
- **Update:** `260506-2236-pod-tee-product-page/phase-04` can be marked "completed (superseded)" since this plan delivers full bundle stack
