# Phase 08 — Perf Pass: Conditional CSS, Font Swap, 3pack Gating

**Status:** pending
**Owner:** code
**Effort:** L (4-6h)
**Depends on:** Phase 06 (asset-load locations stabilized)

## Goal
Cut initial-load CSS payload. Gate per-template assets. Non-blocking font load. Slim variant JSON payload. Move CSS-in-body to head.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 13 | P1 | layout/theme.liquid:80-85 | 6 Dawn JS files load site-wide with `defer` even on blog/account pages | Conditional `{% if template contains 'product' %}` for product-form/info; `details-disclosure` stays site-wide (footer accordions) |
| 14 | P1 | layout/theme.liquid:78 | Google Fonts `<link>` render-blocks | `media="print" onload` swap pattern |
| 15 | P1 | layout/theme.liquid:37-67 | 7 dopamiles CSS files loaded sync site-wide (~50KB+ unminified) | Bundle critical (tokens + shared + components + cart-drawer-ui) site-wide; lazy-load 3pack, journal via section-render-only |
| 16 | P1 | layout/theme.liquid:67 | `dopamiles-3pack.css` (660 LOC) site-wide | Move back into `sections/dopamiles-3pack-picker.liquid` via section `{% stylesheet %}` or asset_url inside section; remove head ref |
| 29 | P1 | sections/dopamiles-product-hero.liquid:239 | `{{ product.variants \| json }}` emits 50KB+ JSON with all metafields | Project slim JSON: `id, title, options, price, compare_at_price, available, inventory_quantity, inventory_management, featured_image, featured_media, sku` (~5KB) |
| 35 | P2 | sections/dopamiles-product-hero.liquid:582-586 | CSS+JS loaded inside section body (FOUC risk) | Move CSS to head via `{% stylesheet %}` block OR conditional head load (#13) |
| 60 | P2 | sections/dopamiles-niche-favorites.liquid:59 + more-from-niche:56 | `dopamiles-pdp.css` loaded on home page just for card styles | Move `.dop-pcard` rules to `dopamiles-shared.css` OR create `dopamiles-product-card.css` loaded with snippet |

## Files
| Path | Change |
|---|---|
| layout/theme.liquid | edit — conditional Dawn JS, `media="print" onload` Google Fonts, remove site-wide 3pack.css |
| sections/dopamiles-product-hero.liquid | edit — slim variants JSON via Liquid loop building manual object |
| sections/dopamiles-3pack-picker.liquid | edit — inline asset_url for 3pack.css inside section |
| sections/dopamiles-niche-favorites.liquid | edit — drop pdp.css ref |
| sections/dopamiles-more-from-niche.liquid | edit — drop pdp.css ref |
| assets/dopamiles-shared.css OR new dopamiles-product-card.css | edit/create — receive `.dop-pcard*` rules |

## Steps
1. Wrap Dawn product-form/product-info script tags in `{% if template contains 'product' %}`. Keep `details-disclosure-menu.js` site-wide.
2. Add Google Fonts `media="print" onload="this.media='all'"` + `<noscript>` fallback `<link>`.
3. Remove site-wide `dopamiles-3pack.css` head ref. Add to `sections/dopamiles-3pack-picker.liquid`:
   ```
   {% stylesheet %}
   /* … import via @import would be cleaner but { % stylesheet % } is preferred Shopify pattern */
   {% endstylesheet %}
   ```
   OR inline `{{ 'dopamiles-3pack.css' | asset_url | stylesheet_tag }}` inside the section.
4. Replace `{{ product.variants | json }}` with a Liquid `capture` loop that builds slim JSON (~5KB target).
5. Move `dopamiles-pdp.css` + `component-product-variant-picker.css` from product-hero body to layout head, gated by `{% if template contains 'product' %}`.
6. Extract `.dop-pcard*` CSS rules from `dopamiles-pdp.css` into `dopamiles-shared.css` (already site-wide) so home cards stop dragging pdp.css.
7. Remove `{{ 'dopamiles-pdp.css' | asset_url | stylesheet_tag }}` from niche-favorites + more-from-niche.
8. Bump build-tag.

## Gate (real iPhone verification)
- Lighthouse mobile perf > 80 on PDP.
- Initial-load CSS payload < 80KB (DevTools Network filter CSS).
- No FOUC on PDP, collection, home.
- 3pack page (`/pages/3-pack`) still styled correctly.
- Home cards still styled correctly (no pdp.css loaded; check DevTools).
- Variant JSON size in DevTools < 10KB for a typical product.
- Build-tag visible, bumped, 0 console errors.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores site-wide loads.

## Risks
| Risk | Mitigation |
|---|---|
| Slim variant JSON missing a field consumed downstream | Audit `dopamiles-pdp-variant-sync.js` for every field accessed; include ALL of them in slim projection |
| Conditional Dawn JS breaks search modal or product cards in non-product templates | Search uses its own JS; product-card snippet does NOT need product-form.js — verify |
| 3pack.css inlined per section reloads on every PDP card preview | 3pack-picker only renders on `/pages/3-pack`; non-issue |
| `media="print" onload` swap delays FCP-to-FCP gap visible as font flash | `font-display: swap` already set; flash is system-fallback → Fraunces, acceptable |
| Moving PDP CSS to head doubles request on Theme Editor section reload | Acceptable — editor is non-customer-facing |
