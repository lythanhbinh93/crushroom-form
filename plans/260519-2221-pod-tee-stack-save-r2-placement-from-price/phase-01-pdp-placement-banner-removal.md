---
phase: 1
title: "PDP Placement + Banner Removal"
status: complete
priority: P1
effort: "20m"
dependencies: []
---

# Phase 1: PDP Placement + Banner Removal

## Overview

Remove the slim bundle-banner render from PDP buy column and reposition the full Stack & Save card from below the trust trio to immediately after the ATC `</product-form>` close. Single bundle UI; commit-adjacent placement.

## Requirements

- Functional: slim `dopamiles-bundle-banner` no longer renders inside `dopamiles-product-hero.liquid` (kept on disk for other surfaces).
- Functional: Stack & Save card renders at the new slot (immediately below ATC, above variant-sync JSON island).
- Functional: `bundle_style = "kit"` fallback still works at the new slot.
- Functional: `bundle_enabled = false` still hides the bundle entirely.
- Non-functional: card on mobile (360px viewport) does not push variant-sync, return-line, or trust-trio out of the buy-column flow.

## Architecture

```
BEFORE                          AFTER
─────────────────────────────   ─────────────────────────────
variant pickers                 variant pickers
stock indicator                 stock indicator
[slim bundle-banner]            (removed)
price row                       price row
ATC button                      ATC button
variant-sync JSON               [Stack & Save card]   ← moved here
return line                     variant-sync JSON
trust trio                      return line
[Stack & Save card]             trust trio
accordions                      accordions
```

Block to move (currently at `sections/dopamiles-product-hero.liquid:303-312`):

```liquid
{%- comment -%}
  Bundle widget — rendered inline in buy column per design spec.
  ... (full comment block + branch render) ...
{%- endcomment -%}
{%- if section.settings.bundle_enabled -%}
  {%- if section.settings.bundle_style == 'kit' -%}
    {%- render 'dopamiles-bundle-inline', section: section -%}
  {%- else -%}
    {%- render 'dopamiles-stack-save', product: product, current_variant: current_variant -%}
  {%- endif -%}
{%- endif -%}
```

Target insertion point: immediately after `</product-form>` close (~L247).

## Related Code Files

- Modify: `sections/dopamiles-product-hero.liquid`
- No change: `snippets/dopamiles-bundle-banner.liquid` (still on disk)

## Implementation Steps

1. Delete the banner comment + render at `sections/dopamiles-product-hero.liquid:184-188`:
   ```
   {%- comment -%}
     Bundle banner — only renders for products tagged 'bundle-eligible'.
     Mirrors copy with Phase 01 Function via shop.metafields.bundles.tiers.
   {%- endcomment -%}
   {%- render 'dopamiles-bundle-banner', product: product -%}
   ```
2. Cut the bundle widget branch block (L297-312, including the `comment` block above it) and paste it immediately after the `</product-form>` close (~L247) and before the variant-sync `{%- capture variants_slim_json -%}` block.
3. Verify Liquid renders without error: `shopify theme check` should report zero new offenses in `dopamiles-product-hero.liquid`.
4. Verify on the dev preview (http://127.0.0.1:9292): slim banner is gone, full card appears below ATC, kit fallback still renders when `bundle_style = "kit"` set in theme editor.

## Success Criteria

- [ ] Banner render gone from `dopamiles-product-hero.liquid`.
- [ ] Stack & Save card renders directly under ATC button.
- [ ] Card is visible above-the-fold on 360px viewport (or at most 1 scroll below ATC).
- [ ] Theme-check reports zero new offenses on the section file.
- [ ] `bundle_style = "kit"` still renders legacy widget at the new slot.

## Risk Assessment

- **Block-move duplicates** — easy to leave an orphan render at the old position. Verify zero `dopamiles-stack-save` / `dopamiles-bundle-inline` references remain at the old L303 area after the cut.
- **Variant-sync depends on ordering** — the `data-dop-variants-json` JSON island must remain inside the buy column; the new card sits ABOVE it, not below. variantChange subscriber on the card will still fire because the data island position doesn't affect the subscription bus (pubsub is module-scoped).
- **Slim banner still referenced elsewhere** — `/pages/3-pack` template, cart-headline copy, or other snippets may render it. Search before deleting the snippet file (this phase keeps it on disk to be safe).
