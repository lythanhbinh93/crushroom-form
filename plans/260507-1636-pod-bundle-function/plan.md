---
title: "POD Bundle Function (Dopamiles)"
description: "Quantity-tier bundle discount via Shopify Function + custom Polaris admin + theme integration + 3-pack picker."
status: in_progress
priority: P1
effort: 12-18d (P01 + P03 shipped 2026-05-07 same day)
branch: TBD (new app repo + feat/bundle-function in pod-tee-theme)
blockedBy: []
blocks: []
related:
  - plans/260506-2236-pod-tee-product-page/plan.md (delivers Function code that PDP phase-04 awaits)
  - plans/260507-1306-dopamiles-full-theme-port/plan.md (theme scaffolding consumed by Phase 03-04)
tags: [shopify, shopify-functions, pod, dopamiles, discount, polaris, aov]
created: 2026-05-07
---

# POD Bundle Function — Dopamiles

Bundle mechanic to raise AOV on Dopamiles POD-tee store. Quantity tiers (2→15%, 3→25%) on a curated `bundle-eligible` collection, enforced server-side via Shopify Product Discount Function. Theme surfaces (PDP banner, cart drawer line, free-shipping bar) plus Meta-ads landing `/pages/3-pack` picker.

**Brainstorm:** `plans/reports/brainstorm-260507-1636-pod-bundle-function.md` (decisions locked).

## Repos
- **App (new):** `D:\github local\dopamiles-bundle-app` (fresh `shopify app init` Remix template; Function in Rust)
- **Theme:** `D:\github local\pod-tee-theme` on new branch `feat/bundle-function` (off `feat/dopamiles-pdp`)

## Phases

| # | Phase | Status | Effort | Owns |
|---|-------|--------|--------|------|
| 01 | [Shopify app + Product Discount Function + metafields](phase-01-shopify-app-and-discount-function.md) | **shipped 2026-05-07** | 3-5d | dopamiles-bundle-app repo (commit `a418411`) |
| 02 | [Custom Polaris admin page](phase-02-admin-polaris-page.md) | deferred (YAGNI) | 2-3d | new app repo (`app/routes/app.bundle-config.tsx`) |
| 03 | [Theme integration — PDP banner + cart drawer + free-ship bar](phase-03-theme-integration-banner-and-cart.md) | **code-complete 2026-05-07** (review 9.0/10) | 2-3d | `pod-tee-theme` (snippets/sections that read metafield + cart) |
| 04 | [3-pack picker page + cart bundle grouping](phase-04-3pack-picker-and-cart-grouping.md) | **code-complete 2026-05-08** (cart-grouping pivoted: 3 lines + headline; existing parent/child drawer untouched) | 5-7d | `pod-tee-theme` (`/pages/3-pack` section, picker JS, no drawer mutation) |

Total: ~12-18 days. Phase 1 ships value standalone.

## Locked Decisions (from brainstorm §10)

- Tier breakpoints: **2→15%, 3→25%** (configurable via metafield, defaults shipped)
- Eligibility: products tagged `bundle-eligible` (tag hardcoded in `input.graphql` v1; Smart Collection of same name gives admin/storefront a clean view). **Pivoted from collection-ID metafield** because Shopify Functions GraphQL can't accept runtime collection IDs — `hasTags` works at query time. UX equivalent.
- Free-shipping: **$75 post-discount** (intentional gap — 2-pack misses, 3-pack clears)
- POD provider: **Printify** (SKU routing — keep separate line items)
- App scaffold: fresh Remix template
- Function language: **Rust** (Shopify default, faster cold start). Flag if user prefers JS.
- Discount class: **non-combinable** with codes (margin protection)
- Visual grouping: `_bundle_id` line property + Liquid (no Cart Transform v1)
- Admin UI: custom Polaris page (Phase 02)

## Out of Scope

- **Cart Transform Function** (true parent/child line item) — needs Printify routing test before re-scoping
- Welcome-code stacking with bundle discount
- Mixed product-type bundles (tees only v1)
- Subscription bundle / "tee of the month"
- Multi-currency bundle pricing

## Cross-Plan Impact

- `260506-2236-pod-tee-product-page` Phase 04 (Bundle Builder, in_progress) — its Function code dependency is delivered by this plan's Phase 01. UI section scaffolding from PDP plan can stay; this plan supersedes the discount-engine half.
- `260507-1306-dopamiles-full-theme-port` (completed) — its "Next Session Actions #1 (Shopify Function Bundle Discount)" is satisfied by Phase 01-02 here. Theme cart drawer & PDP scaffolding shipped in that plan are inputs for Phase 03-04.

## Success Criteria (rolls up from phases)

- AOV +20% within 30 days of Phase 03 ship (primary)
- Bundle attach rate (carts with ≥2 eligible tees) >40%
- 3-pack page Meta CVR ≥ standard PDP CVR; complete-rate (slots filled → ATC) >60%
- Gross margin per order drops ≤8pp vs pre-bundle baseline
- Function fail-safe: malformed metafield → no discount applied (no checkout breakage)

## Unresolved Questions

1. **Function language confirmation** — Rust recommended for cold-start; user may prefer JS for team familiarity. Lock before Phase 01 starts.
2. **App distribution model** — Custom app for single store (Dopamiles only) vs unlisted/public app on Partner dashboard? Affects auth scopes + Polaris embed setup.
3. **Printify routing test for deferred Cart Transform** — needs sandbox order through Printify with hypothetical merged line item to confirm SKU break before Phase 5 ever scoped.
4. **`bundle-eligible` collection seeding** — manual list at launch, or auto-tag products with `pod-tee` tag? Defaults to manual; revisit when catalog >50 SKUs.
5. **Admin write auth** — confirm `write_products` + `write_discounts` scopes sufficient for metafield writes; may need `write_publications` if collection picker changes visibility.
6. **Welcome-code stacking** — non-combinable v1 locked, but flagged for Phase 5 review if email capture campaign launches.
