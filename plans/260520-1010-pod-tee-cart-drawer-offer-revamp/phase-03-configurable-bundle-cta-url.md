---
phase: 3
title: "Configurable bundle CTA URL"
status: complete
priority: P1
effort: "15m"
dependencies: [1]
---

# Phase 3: Configurable bundle CTA URL

## Overview

Replace the 4 hardcoded `/pages/3-pack` href references in `dopamiles-bundle-cart-headline.liquid` with a configurable URL via section setting `cart_bundle_cta_url` on the cart-drawer section, passed as `cta_url` render arg to the snippet, with `/collections/all` fallback. Mirrors PDP's `bundle_cta_url` pattern (R2).

## Requirements

- Functional: new section setting `cart_bundle_cta_url` (type: url) appears in cart-drawer theme editor.
- Functional: snippet receives URL via `cta_url` render arg; falls back to `/collections/all` if blank.
- Functional: all 4 cart-headline CTAs (qty 1 "Build a 3-pack →", qty 2 "Add a 3rd →", qty 3 "Build a 5-pack →", qty 4 "Add a 5th →") use the configured URL.
- Functional: existing live drawers inherit `/collections/all` by default (no breaking change — old `/pages/3-pack` was a hardcode, replaced cleanly).
- Non-functional: setting type is `url` (Shopify URL picker supports collection/product/page/blog/external).

## Architecture

Schema setting (in cart-drawer section's settings array, after the Phase 1 toggles):

```json
{
  "type": "url",
  "id": "cart_bundle_cta_url",
  "label": "Bundle headline CTA link",
  "info": "Where the cart-drawer bundle headline CTAs (Build a 3-pack, Add a 3rd, etc.) send shoppers. Default: /collections/all."
}
```

Render call update (in cart-drawer section):

```liquid
{%- render 'dopamiles-bundle-cart-headline',
    show_bar: section.settings.show_stack_save_bar,
    cta_url: section.settings.cart_bundle_cta_url -%}
```

Snippet header update (in `dopamiles-bundle-cart-headline.liquid`, at the top of the liquid assign block):

```liquid
{%- assign cart_cta_url = cta_url | default: '/collections/all' -%}
```

Replace 4 `<a href="/pages/3-pack" class="dop-bundle-cart-cta">` with `<a href="{{ cart_cta_url }}" class="dop-bundle-cart-cta">`.

## Related Code Files

- Modify: `sections/dopamiles-cart-drawer.liquid` — add schema setting + pass `cta_url` render arg.
- Modify: `snippets/dopamiles-bundle-cart-headline.liquid` — accept `cta_url` arg, replace 4 hardcoded hrefs.

## Implementation Steps

1. Add `cart_bundle_cta_url` setting to cart-drawer schema (after Phase 1's two toggle settings, before any "Shipping protection" header from Phase 4).
2. Update bundle-headline render call to pass `cta_url: section.settings.cart_bundle_cta_url`.
3. Snippet header: add `assign cart_cta_url = cta_url | default: '/collections/all'`.
4. Snippet body: replace all 4 `href="/pages/3-pack"` with `href="{{ cart_cta_url }}"`.
5. Validate JSON schema parses.
6. Theme-editor live test: open cart drawer settings → pick a collection → save → trigger cart drawer → click a CTA → confirm redirect.

## Success Criteria

- [ ] `cart_bundle_cta_url` setting visible in theme editor with URL picker UI.
- [ ] Snippet defaults to `/collections/all` when setting unset.
- [ ] Snippet uses picked URL when setting set.
- [ ] All 4 CTAs (qty 1, 2, 3, 4 states) reflect the same URL.
- [ ] JSON schema parses; theme-check zero new offenses.

## Risk Assessment

- **Per-tier URL routing** — original Phase 0 idea was per-state URLs (qty 1-2 → 3-pack, qty 3-4 → 5-pack). Scope decision: single URL is enough since `/collections/all` lets shoppers add any product, and the headline copy already tells them what tier they're approaching. If conversion data shows per-state routing helps, follow-up plan.
- **Empty-string behavior** — Liquid `default:` triggers on blank; theme-editor URL picker returns blank when unset. Verified pattern (same as PDP R2).
- **Migration** — old hardcoded `/pages/3-pack` is replaced. If merchant relied on that destination, they explicitly pick `/pages/3-pack` in the URL picker. Most likely they want `/collections/all` which is the new default.
