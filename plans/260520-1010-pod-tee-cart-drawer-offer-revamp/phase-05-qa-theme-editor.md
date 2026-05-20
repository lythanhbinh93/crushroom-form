---
phase: 5
title: "QA + theme-editor walk-through"
status: pending
priority: P1
effort: "45m"
dependencies: [1, 2, 3, 4]
---

# Phase 5: QA + theme-editor walk-through

## Overview

Live walkthrough on the Shopify dev preview + theme editor to verify all 4 phases end-to-end + regression-check the unchanged surfaces (line items, discount input, upsell row, footer totals, checkout flow).

## Requirements

- Every Success Criterion from Phases 1–4 verified.
- Cart-drawer Lighthouse mobile score ≥ baseline (no perf floor formally set; informal check ≥85).
- A11y: keyboard tab through drawer reaches SP checkbox; screen reader announces "Shipping Protection $2.95 checkbox".

## Test Matrix

### Toggle visibility (Phase 1)

| # | Scenario | Pass criterion |
|---|---|---|
| 1.1 | `show_shipping_bar` unchecked (default) | Ship bar hidden in drawer. |
| 1.2 | `show_shipping_bar` checked | Ship bar renders; progress + free-shipping copy intact. |
| 1.3 | `show_stack_save_bar` unchecked | Tier bar in headline NOT rendered. |
| 1.4 | Both off | Drawer top has bundle headline copy + CTA only (no bars). |

### Tier progress bar (Phase 2)

| # | Scenario | Pass criterion |
|---|---|---|
| 2.1 | Empty cart | Bar not rendered (headline + bar gated by `eligible_qty > 0`). |
| 2.2 | Qty 1 eligible | Bar shows 20% fill, 0 hit markers, all 3 labels visible. |
| 2.3 | Qty 3 eligible | Bar shows 60% fill, 2 hit markers (2 + 3), correct $-off labels. |
| 2.4 | Qty 5+ eligible | Bar shows 100% fill, all 3 hit markers, max-savings copy. |
| 2.5 | Add bundle-eligible item via PDP | Bar updates without page reload (Dawn section re-render). |

### Configurable CTA URL (Phase 3)

| # | Scenario | Pass criterion |
|---|---|---|
| 3.1 | `cart_bundle_cta_url` unset | All 4 CTAs link to `/collections/all`. |
| 3.2 | Pick `/collections/bundle-eligible` | All 4 CTAs link to that collection. |
| 3.3 | Pick external URL | CTAs link out cleanly. |
| 3.4 | Add 2 eligible products | CTA still uses the configured URL (no qty-based override). |

### Shipping Protection (Phase 4)

| # | Scenario | Pass criterion |
|---|---|---|
| 4.1 | `shipping_protection_product` unset | Widget not rendered (graceful hide). |
| 4.2 | Product set, `default_checked = true`, fresh session, cart has 1 item | Drawer opens → SP auto-adds → checkbox shows checked → totals reflect +$2.95. sessionStorage `dop_sp_auto_added=1`. |
| 4.3 | Toggle off SP checkbox | SP removed from cart, totals drop -$2.95, sessionStorage `dop_sp_opted_out=1`. |
| 4.4 | Close + reopen drawer (same session) | SP stays out (opt-out respected); checkbox unchecked. |
| 4.5 | Toggle on SP checkbox | SP re-adds, opt-out flag cleared. |
| 4.6 | Close + reopen drawer | SP stays in (since cart has it). |
| 4.7 | New incognito session, fresh cart, add an item | Auto-add fires once. |
| 4.8 | Empty cart | Drawer shows empty state; SP widget NOT rendered (empty-state branch). |
| 4.9 | SP variant + bundle-eligible items + bundle in cart | SP renders above totals; cart line items show ONLY non-SP items; SP price flows into subtotal. |
| 4.10 | Click checkout with SP checked | Order summary on checkout page includes "Shipping Protection · $2.95". |
| 4.11 | A11y: tab through drawer | Tab reaches SP checkbox; Space toggles it. |
| 4.12 | Screen reader on SP row | Announces label + price clearly. |

### Cross-phase regression

| # | Scenario | Pass criterion |
|---|---|---|
| 5.1 | Regular line items render normally | Bundle parents + regular items + bundle children intact. |
| 5.2 | Discount code input still works | Apply + error states unchanged. |
| 5.3 | Upsell row still renders when blocks configured | Upsell cards visible; +Add still works. |
| 5.4 | Footer totals math | Subtotal + discounts + shipping + total all correct with SP in cart. |
| 5.5 | `shopify theme check` | Zero new offenses on modified files. |
| 5.6 | DevTools Lighthouse mobile (cart drawer open) | Performance ≥85, no major regressions. |

## Related Code Files

- Read: `sections/dopamiles-cart-drawer.liquid`, `snippets/dopamiles-bundle-cart-headline.liquid`, `snippets/dopamiles-cart-shipping-protection.liquid`, `assets/dopamiles-cart-helpers.js` (or sibling).
- Tools: Shopify CLI `theme check`, Chrome DevTools Lighthouse + a11y inspector, NVDA / VoiceOver.

## Implementation Steps

1. Hard-reload dev preview after each phase merges.
2. Theme-editor session: open `https://crushroom.myshopify.com/admin/themes/{id}/editor?hr=9292` → cart-drawer section settings.
3. Run Test Matrix 1.x through 5.x in order; check off Success Criteria.
4. SP-specific: create Shipping Protection product in admin (handle: `shipping-protection`, variant price $2.95, no inventory tracking, status: active but no collection assignment so it's only reachable via picker).
5. Conventional commit on green: `feat(cart): drawer offer revamp — stack-bar replaces shipping bar, configurable bundle cta, shipping protection`.

## Success Criteria

- [ ] All 24+ test-matrix items pass.
- [ ] Theme-check clean on 4 modified files.
- [ ] Lighthouse mobile ≥85 with drawer open.
- [ ] No regressions to line items, discount, upsell, footer, checkout.
- [ ] Clean conventional commit, no AI references.

## Risk Assessment

- **SP product setup** — merchant must create the hidden product before the widget shows. Plan covers graceful hide if unset.
- **Race with Dawn section re-render** — JS handlers may need re-binding after each cart mutation. Verified mitigation in Phase 4 (rebind on `cartUpdate`).
- **sessionStorage availability** — fails silently in some Safari Private modes. Fallback: behave as if no flag exists each time. Acceptable trade-off.
- **Tier bar visual conflict on narrow drawers** — mobile <360px may overlap marker labels. If so, follow-up CSS tweak (font-size clamp).

## Unresolved questions

- **Where does cart-drawer JS live?** — Plan assumes `assets/dopamiles-cart-helpers.js` exists. To be verified in Phase 4 step 1 grep.
- **Does a `shield` icon exist in `dopamiles-icon.liquid`?** — Phase 4 step 2 verifies; falls back to a generic icon (truck / check) if not.
