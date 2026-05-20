---
title: Phase 3 — JS route-split audit
created: 2026-05-20
branch: feat/pdp-perf-pareto
status: no-op (theme already optimally split)
---

# Phase 3 — JS route-split audit

## TL;DR

**No code changes ship in this phase.** JS loading is already optimally gated. Dopamiles-specific scripts are either route-gated in `theme.liquid` or loaded inside their consuming section. Dawn baseline scripts are all small (<10KB each, except `global.js` at 45KB which is foundation) and all already deferred. Further gating risks breaking Web Component definitions across templates.

## JS-to-template matrix

| File | KB | Loaded from | Gating | Action |
|---|---|---|---|---|
| `dopamiles-cart-helpers.js` | small | theme.liquid:483 | site-wide (defer) | Stay — drawer triggers everywhere |
| `dopamiles-cart-mutations.js` | small | theme.liquid:484 | site-wide (defer) | Stay |
| `dopamiles-cart.js` | small | theme.liquid:485 | site-wide (defer) | Stay |
| `dopamiles-pdp-variant-sync.js` | small | theme.liquid:493 | product only | Already gated |
| `dopamiles-collection.js` | small | theme.liquid:501 | collection only | Already gated |
| `dopamiles-mobile-sticky-atc.js` | small | section inline (defer) | PDP via section | Already route-correct |
| `dopamiles-header.js` | small | section inline (defer) | site-wide via header section | Stay |
| `dopamiles-search.js` | small | section inline (defer) | site-wide via header section + search section | Stay |
| `dopamiles-pdp.js` | small | section inline (defer) | PDP via product-hero + fbt + faqs + bundle sections | Already route-correct |
| `dopamiles-stack-save.js` | small | snippet inline (defer) | PDP only via snippet usage | Already route-correct |
| `dopamiles-3pack.js` | small | section inline (defer) | bundle-eligible via 3pack-picker section | Already route-correct |
| `constants.js`, `pubsub.js` | <1 KB total | theme.liquid:124-125 | site-wide (defer) | Stay — referenced by every Dawn-derived custom element |
| `global.js` | 45 KB | theme.liquid:126 (defer) | site-wide | Stay — foundation utils (focus, SectionId, etc.) used everywhere |
| `details-disclosure.js`, `details-modal.js`, `search-form.js` | <2 KB each | theme.liquid:127-129 (defer) | site-wide | Stay — Web Components defined site-wide; gating breaks usage on any page that triggers them |
| `animations.js` | 3.7 KB | theme.liquid:132 (defer) | gated on `settings.animations_reveal_on_scroll` | Already conditional |
| `localization-form.js` | 8 KB | theme.liquid:375 (defer) | gated on path | Already gated |
| `predictive-search.js` | 9 KB | theme.liquid:474 (defer) | gated on `settings.predictive_search_enabled` | Already gated |
| `cart-drawer.js` | 4.4 KB | theme.liquid:478 (defer) | gated on `settings.cart_type == 'drawer'` | Already gated |

## Why "Reduce unused JavaScript" can't shrink much further via gating

1. **Web Components are defined site-wide by design**. Dawn defines `<details-modal>`, `<predictive-search>`, `<cart-drawer>` etc. via `customElements.define()` calls that have to run on EVERY page where the element could appear. Page-template-gating would break the modal/drawer/search elements that the header section renders on every page.
2. **`global.js` (45 KB)** is the biggest single offender on the unused-JS audit. It contains `SectionId`, `getFocusableElements`, slider/quantity/menu utility classes — each is "unused" on `/collections/all` because the collection page doesn't render the corresponding markup. But the file is unsplittable without a build step refactoring Dawn.
3. **Vendor / Shopify-injected scripts**: Hotjar, Klaviyo, GA4 etc. show up in the unused-JS audit but are theme-uncontrollable (added through admin script tags or storefront analytics settings).
4. **All theme scripts already use `defer`**: zero render-blocking JS in the theme.

## Surgical opportunities considered + rejected

- **Gate `predictive-search.js` to search/header only**: rejected. Header section renders on every page and triggers the panel; gating would break header search icon → predictive panel flow.
- **Gate `cart-drawer.js` to non-cart-page templates**: rejected. Drawer is the primary cart UI on every page including cart page (where the drawer can still open). Risk of breaking drawer-open mid-checkout.
- **Tree-shake `global.js`**: requires build pipeline (esbuild / Rollup). Out of scope for this plan.

## Recommendation for next-iteration plan

If future perf work targets unused-JS, the real opportunities are:
1. **Add a build step** (esbuild or similar) to tree-shake unused exports from `global.js` and the dopamiles bundle. Probably a 1-2 day project for a meaningful (~20-30 KB) saving.
2. **Move heavy customer-only modules to section-inline loading** if any are currently in `theme.liquid` for legacy reasons — needs an audit of the Dawn baseline.
3. **Audit Shopify-injected scripts** (analytics, marketing pixels) via the admin to drop any abandoned integrations.

## Open questions

- Should `predictive-search.js` be deferred further with `module` type and async-import inside `dopamiles-header.js` only when the search icon is clicked? Trade-off: first-interaction latency vs always-loaded cost. Worth measuring in a future plan.
