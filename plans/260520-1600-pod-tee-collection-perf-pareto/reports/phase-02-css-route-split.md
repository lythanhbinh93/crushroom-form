---
title: Phase 2 — CSS route-split audit
created: 2026-05-20
branch: feat/pdp-perf-pareto
status: no-op (theme already optimally split)
---

# Phase 2 — CSS route-split audit

## TL;DR

**No code changes ship in this phase.** The theme is already optimally route-split. The Pareto report's projected 180KB unused-CSS savings is not addressable via template gating — the "unused" selectors flagged by Lighthouse are inside globally-needed files (cart drawer, predictive-search, product cards) and cannot be gated without breaking site-wide UI behavior.

## CSS-to-template matrix

| File | KB | Loaded site-wide? | Why | Action |
|---|---|---|---|---|
| `dopamiles-components.css` | 15.8 | Yes (theme.liquid:31) | Buttons / breadcrumb / nav used on 15+ section templates | Stay |
| `dopamiles-feedback.css` | 15.8 | Yes (theme.liquid:34) | `.dop-li` (line items) renders inside cart drawer on every page | Stay |
| `dopamiles-shared.css` | 6.7 | Yes (theme.liquid:37) | `.dop-pcard*` (product cards) renders on home/search/collection/PDP-recs | Stay |
| `dopamiles-search.css` | 18.0 | Yes (theme.liquid:45) | Predictive-search panel injected into DOM on every page by `dopamiles-search.js` | Stay |
| `dopamiles-cart.css` | 18.5 | Yes (theme.liquid:48) | Cart drawer renders on every page | Stay |
| `dopamiles-cart-drawer-ui.css` | 6.0 | Yes (theme.liquid:50) | Drawer footer + empty state | Stay |
| `dopamiles-bundle.css` | 4.9 | Yes (theme.liquid:53) | `.dop-bundle-cart-headline` in drawer + `.dop-bundle-pill` on every product card | Stay |
| `dopamiles-pdp.css` | 29.3 | No — product only (line 70-73) | Already gated | Stay (no change) |
| `dopamiles-stack-save.css` | 8.4 | No — product only | Already gated | Stay (no change) |
| `dopamiles-collection.css` | 26.3 | No — loaded inside `dopamiles-collection-grid.liquid` section | Section-gated already | Stay |
| `dopamiles-home.css` | 18.8 | No — loaded inside home sections | Section-gated | Stay |
| `dopamiles-page-story.css` | 19.6 | No — loaded inside page section | Section-gated | Stay |
| `dopamiles-journal.css` + `-article.css` | 36.5 | No — blog sections only | Section-gated | Stay |
| `dopamiles-3pack.css` | 16.2 | No — bundle-eligible only | Section-gated | Stay |
| `dopamiles-account*.css` | 24 | No — customer templates | Section-gated | Stay |
| `dopamiles-gift-card.css` | 15.2 | No — layout-bypass template | Inline in template | Stay |
| `dopamiles-pages-static.css` | 12 | No — static pages | Section-gated | Stay |
| `dopamiles-utility.css` | 21 | No — 404 + password only | Section-gated | Stay |
| `dopamiles-header.css` | 11.9 | No — loaded inside `dopamiles-header.liquid` section | Section-gated (renders site-wide via header section) | Stay |
| `dopamiles-footer.css` | 4.8 | No — loaded inside footer section | Section-gated | Stay |
| `dopamiles-cart-page.css` | 4.4 | No — cart template only | Section-gated | Stay |

## Why the Pareto estimate doesn't translate to wins

Baseline Lighthouse "Reduce unused CSS" audit estimated ~180KB savings on `/collections/all`. Mechanism of the over-estimate:

1. **Selector-level dead code, not file-level**: Lighthouse counts each unused selector inside a loaded file. `dopamiles-components.css` has 85 button/nav variants. Collection page uses ~15 of them. Lighthouse flags the other 70 as "unused" even though the file is legitimately loaded for shared component code.
2. **Cart-drawer DOM lives on every page**: drawer markup + line item placeholders render at every page load. Drawer-targeted selectors look "unused" on `/collections/all` because the drawer isn't open, but they would be unstyled the moment a user clicks the cart icon.
3. **Predictive-search panel same pattern**: panel DOM is injected by JS even before the user clicks search; CSS must be available before injection.
4. **Dawn baseline CSS**: pre-existing Dawn stylesheets account for some of the unused-CSS audit and aren't in the dopamiles-* prefix scope this plan tries to optimize.

## Surgical opportunities considered + rejected

- **Gate `dopamiles-bundle.css` to product/cart/collection**: rejected. Bundle pill renders on product cards (home / search / collection / PDP recs); bundle cart headline renders inside drawer (every page). Net excluded templates would be only the layout-bypass ones (gift_card, password) which already skip theme.liquid entirely. Zero practical savings.
- **Split `dopamiles-cart.css` into drawer-only + page-only**: rejected without measurement. Drawer ↔ cart-page styles likely share too many selectors; risk of refactor regression exceeds projected savings.
- **Defer `dopamiles-feedback.css` (badges/modals/skeleton) via media=print trick**: out of scope for this plan; would be a Phase 5+ effort and overlaps with the existing font deferral pattern in theme.liquid:111-122.

## Recommendation for next-iteration plan

If perf score regression-watch warrants further CSS work in a future plan, the real opportunity is **deferring non-critical CSS** (the same `media="print" onload="this.media='all'"` pattern used for Google Fonts) on files that are render-blocking but visually below-the-fold (e.g., cart-drawer-ui.css, feedback.css's modal/toast/skeleton). Saves render-blocking time without changing what's loaded.

## Open questions

- Worth running Lighthouse with the route-split *as-is* + Phase 1 fix to confirm the "unused CSS" line item drops because Lighthouse's score-weight already deprioritizes it relative to LCP/CLS? Yes — Phase 4 will surface this.
