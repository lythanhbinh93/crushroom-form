---
phase: 2
title: "Configurable Bundle CTA URL Setting"
status: complete
priority: P2
effort: "20m"
dependencies: [1]
---

# Phase 2: Configurable Bundle CTA URL Setting

## Overview

Add a theme-editor URL picker for the Stack & Save CTA so the merchant can route the "Shop N more tees →" link to any collection / page / product / external URL. Default `/collections/all` for the current "all-eligible" phase.

## Requirements

- Functional: new section setting `bundle_cta_url` with `type: "url"` (Shopify URL picker) appears in theme editor adjacent to `bundle_style`.
- Functional: snippet receives the URL via render arg `cta_url`; falls back to `/collections/all` when blank.
- Functional: SSR `<a class="cta">` href reflects the chosen URL.
- Functional: JS `state.collectionUrl` (used by `syncCta`) reflects the chosen URL on tier swap / state change.
- Non-functional: Liquid blank-fallback chain is `cta_url | default: '/collections/all'`; no Liquid errors when setting is unset.

## Architecture

Schema setting (insert adjacent to `bundle_style` in `sections/dopamiles-product-hero.liquid` schema block):

```json
{
  "type": "url",
  "id": "bundle_cta_url",
  "label": "Bundle CTA link",
  "info": "Where the Stack & Save 'Shop N more tees →' CTA sends shoppers. Default: /collections/all. Use a smart collection or specific tee collection for your phase."
}
```

Render call (in the branch block from Phase 1):

```liquid
{%- render 'dopamiles-stack-save',
    product: product,
    current_variant: current_variant,
    cta_url: section.settings.bundle_cta_url -%}
```

Snippet header — accept arg + fallback:

```liquid
{%- assign collection_url = cta_url | default: '/collections/all' -%}
```

(Replaces existing hardcoded `assign collection_url = '/pages/3-pack'` in `dopamiles-stack-save.liquid`.)

Root data attribute (already in snippet):

```liquid
data-collection-url="{{ collection_url }}"
```

JS reads it in `wireOne(root)` — no JS change needed; existing `state.collectionUrl = root.dataset.collectionUrl || '/pages/3-pack'` becomes effectively `state.collectionUrl = root.dataset.collectionUrl || '/collections/all'` (update the JS fallback too).

## Related Code Files

- Modify: `sections/dopamiles-product-hero.liquid` — add schema setting + pass `cta_url` render arg.
- Modify: `snippets/dopamiles-stack-save.liquid` — accept `cta_url` arg, change default.
- Modify: `assets/dopamiles-stack-save.js` — change JS fallback default from `/pages/3-pack` to `/collections/all` (cosmetic; data attribute is always set by SSR).

## Implementation Steps

1. **Add schema setting** in the `{% schema %}` block of `sections/dopamiles-product-hero.liquid`. Place immediately after the existing `bundle_style` select (which is right after the `bundle_enabled` checkbox).
2. **Update render call** in the Phase 1-relocated bundle widget branch block — add `cta_url: section.settings.bundle_cta_url` as a render arg.
3. **Update snippet header** — at the top of the existing `liquid` assign block in `snippets/dopamiles-stack-save.liquid`, replace the hardcoded `assign collection_url = '/pages/3-pack'` line with `assign collection_url = cta_url | default: '/collections/all'`.
4. **Update JS fallback default** — in `assets/dopamiles-stack-save.js` `wireOne(root)`, change `root.dataset.collectionUrl || '/pages/3-pack'` to `root.dataset.collectionUrl || '/collections/all'`. (Defensive; SSR always sets the attribute.)
5. **Validate JSON schema parses** — run the same `node -e "..."` check from v1 Phase 5 to confirm `bundle_cta_url` entry is present.
6. **Theme-editor verification** — open `https://crushroom.myshopify.com/admin/themes/158541545724/editor?hr=9292`, navigate to Product page → Bundle widget settings, confirm the new "Bundle CTA link" picker shows; select a different collection; save; reload preview; CTA `href` reflects the change.

## Success Criteria

- [ ] `bundle_cta_url` setting visible in theme editor with URL picker UI.
- [ ] Snippet defaults to `/collections/all` when setting unset.
- [ ] Snippet uses the picked URL when setting set.
- [ ] JS `syncCta` writes the chosen URL on tier swap (verify via DevTools: select tier 2 with the picked URL set; inspect `.cta` href).
- [ ] Section JSON schema parses (no JSON syntax errors).
- [ ] Theme-check reports zero new offenses on the section file.

## Risk Assessment

- **`type: "url"` validation** — Shopify's URL setting type accepts internal links (collection/product/page/blog) and external URLs. Document in `info` field. No additional validation needed.
- **Empty-string vs blank** — `section.settings.bundle_cta_url` returns blank string when unset; `| default: '/collections/all'` handles this. Edge case: if user clears the picker, falls back correctly.
- **Migration of existing PDPs** — the section setting has a default; existing live PDPs without explicit setting inherit `/collections/all`. No breaking change.
- **Naming conflict** — `bundle_cta_url` is a new id; no clash with existing `bundle_*` settings (`bundle_enabled`, `bundle_style`, `bundle_heading`, `bundle_discount_pct`). Within Shopify's 25-char-id limit (16 chars).
