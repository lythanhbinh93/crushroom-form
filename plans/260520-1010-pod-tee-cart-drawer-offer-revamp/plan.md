---
title: "pod-tee Cart Drawer Offer Revamp — Stack-bar replaces shipping bar + configurable bundle CTA + Shipping Protection"
description: "Reshape the cart drawer offer stack: hide free-shipping bar (default off, toggleable), add a Save & Stack tier progress bar inside the bundle headline (mirrors PDP), make bundle headline CTAs configurable via section URL setting, add a Shipping Protection boxed row above totals with auto-add ($2.95, hidden Shopify product, once-per-session)."
status: in-progress
priority: P2
effort: "2-3h"
repo: D:\github local\pod-tee-theme
branch: "feat/pdp-perf-pareto"
blockedBy: []
blocks: []
related:
  - parent: plans/260519-2221-pod-tee-stack-save-r2-placement-from-price (PDP Stack & Save R2 — pattern source for configurable CTA + tier progress bar)
  - upstream-infra: dopamiles-bundle-cart-headline.liquid + Phase 01 Shopify Function (tier metafield + bundle-eligible tag)
  - touch-point: sections/dopamiles-cart-drawer.liquid (shared cart-drawer surface)
tags: [shopify, theme, pod-tee, dopamiles, cart-drawer, stack-save, shipping-protection]
created: 2026-05-20
---

# pod-tee Cart Drawer Offer Revamp

## Overview

Three independent changes to the cart drawer, all configurable via section settings so the merchant can A/B without code edits:

1. **Free-shipping bar → toggleable, default OFF.** Campaign focus shifts to Stack & Save tier discount; free shipping muted to avoid competing CTAs. Toggle preserved for future A/B.
2. **Bundle headline gains a tier progress bar** mirroring PDP's `dop-stack-bar` (markers at 2/3/5 with current-cart fill). Default ON. Replaces shipping bar visually.
3. **Bundle headline CTAs become configurable** via `cart_bundle_cta_url` section setting (mirrors PDP's `bundle_cta_url`). Replaces 4 hardcoded `/pages/3-pack` refs. Default `/collections/all`.
4. **Shipping Protection offer** ($2.95 boxed row above totals). Hidden Shopify product, JS auto-add once-per-session, default checked, removable via checkbox toggle. Section-setting picker for the product; if unset, widget hides gracefully.

## Goals

- Single offer focus (Stack & Save) — shipping bar muted by default.
- Visual tier-progress reinforcement in the cart drawer (mirrors PDP visual language).
- Merchant can pick where bundle CTAs route (theme editor URL picker).
- Shipping protection adds margin without harming checkout conversion (auto-add but easy to opt out; once-per-session = no annoying re-add loop).
- Zero regression to checkout / line-items / discount / upsell flows.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Shipping-bar + Stack-bar visibility toggles](./phase-01-shipping-bar-stack-bar-toggles.md) | Complete |
| 2 | [Tier progress bar in bundle headline](./phase-02-tier-progress-bar-in-bundle-headline.md) | Complete |
| 3 | [Configurable bundle CTA URL](./phase-03-configurable-bundle-cta-url.md) | Complete |
| 4 | [Shipping Protection boxed row](./phase-04-shipping-protection-boxed-row.md) | Complete |
| 5 | [QA + theme-editor walk-through](./phase-05-qa-theme-editor.md) | Pending (manual) |

## Touchpoints (master list)

**Modify**
- `sections/dopamiles-cart-drawer.liquid` — add 4 schema settings (`show_shipping_bar` default false, `show_stack_save_bar` default true, `cart_bundle_cta_url`, `enable_shipping_protection` + `shipping_protection_product` + `shipping_protection_default_checked`); wrap shipping bar in toggle; pass render args to headline snippet; render new `<dopamiles-cart-shipping-protection>` widget above totals; filter SP product out of line-items loop.
- `snippets/dopamiles-bundle-cart-headline.liquid` — accept `cta_url` + `show_bar` render args; replace 4 hardcoded `/pages/3-pack` with `cta_url | default: '/collections/all'`; conditionally render tier progress bar below copy.
- `assets/dopamiles-cart-helpers.js` (or sibling cart drawer JS) — extend with SP auto-add + checkbox-toggle logic; sessionStorage flag for once-per-session behavior.
- `assets/cart.css` (or relevant CSS asset for the cart drawer) — add `.dop-bundle-cart-bar` selectors (port PDP's stack-bar styling); add `.dop-cart-shipping-protect` boxed row styling.

**Create**
- `snippets/dopamiles-cart-shipping-protection.liquid` — renders the boxed row with checkbox + icon + label + price (requires `product` arg).

**No change**
- Phase 01 Shopify Function / tier metafield (untouched).
- Cart line-items rendering (only filter added).
- Discount code row, upsell row, footer totals (untouched).
- PDP `dopamiles-stack-save.{liquid,js,css}` (R2 ships intact).

## Locked Decisions (from brainstorm)

| # | Decision | Locked answer |
|---|----------|--------------|
| 1 | Free-shipping bar default | OFF (campaign focus = stack & save) |
| 2 | Setting structure for top widgets | Two independent checkboxes (`show_shipping_bar` + `show_stack_save_bar`) — allows both/either/neither during transition |
| 3 | Save & Stack bar level | Add progress bar BELOW headline copy (mirrors PDP's `dop-stack-bar` with 2/3/5 markers) |
| 4 | Bundle CTA URL default | `/collections/all` (mirrors PDP) |
| 5 | SP product source | Hidden Shopify product, picked via section setting; widget hides if product unset |
| 6 | SP placement | Above totals (boxed row, distinct from line items) |
| 7 | SP auto-add behavior | Once-per-session via sessionStorage flag; respects user opt-out |
| 8 | SP default checked | Yes (section setting `shipping_protection_default_checked` defaults true) |

## Cross-plan dependencies

None blocking. R2 (PDP Stack & Save) is shipped + soaked.

## Unresolved questions

None — all 8 decisions locked via brainstorm.

## Validation Log

Pending (will populate via `/ck:plan validate` after phase files drafted).
