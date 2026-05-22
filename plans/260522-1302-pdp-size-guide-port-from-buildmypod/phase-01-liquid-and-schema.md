---
phase: 1
title: "Liquid and schema"
status: complete
priority: P2
effort: "~1h"
dependencies: []
---

# Phase 01: Liquid and schema

## Overview

Create the size-guide modal snippet, add `size_guide_image` section block to `dopamiles-product-hero`, render the modal once at section bottom, and wire the trigger link inside the variant picker.

## Requirements

- Functional:
  - New snippet `snippets/dopamiles-size-guide-modal.liquid` wraps Dawn `<details-modal>`, loops `section.blocks`, renders matching image.
  - New section block type `size_guide_image` accepting `product_type` (text), `image` (image_picker), `alt` (text).
  - Trigger link rendered inside `snippets/product-variant-picker.liquid` ONLY when `product_option.name == 'Size'` AND at least one configured block matches `product.type | handleize`.
  - Modal rendered once at the bottom of `sections/dopamiles-product-hero.liquid`.
- Non-functional:
  - Zero new JS (reuse Dawn `<details-modal>`).
  - Schema must pass `shopify theme validate` (block name ≤25 chars).
  - No Liquid syntax that breaks Section Rendering API re-renders.

## Architecture

```
sections/dopamiles-product-hero.liquid
├─ {% render 'product-variant-picker' %}  ──► loops options
│                                            └─ if option.name == 'Size': trigger
└─ {% render 'dopamiles-size-guide-modal' %}  ──► modal (one per section instance)
                                              └─ loops section.blocks where type=size_guide_image
                                                 AND product_type | handleize == product.type | handleize
                                                 AND image != blank
```

Block render rule: `product_type` is matched via `handleize` on both sides ("T-shirt" and "t-shirt" both normalize to `t-shirt`).

Modal id: `SizeGuide-{{ section.id }}` (section-scoped; allows multiple PDP sections without collision).

## Related Code Files

- Create: `snippets/dopamiles-size-guide-modal.liquid` (~70 LOC)
- Modify: `sections/dopamiles-product-hero.liquid` — add block schema + modal render call (~40 LOC added)
- Modify: `snippets/product-variant-picker.liquid` — add trigger inside Size option loop (~15 LOC added)

## Implementation Steps

1. **Create `snippets/dopamiles-size-guide-modal.liquid`:**
   - Accept `section` as render arg.
   - Output Dawn `<details-modal>` shell with id `SizeGuide-{{ section.id }}`.
   - Inside: `<details>` + `<summary hidden>` + `<div role="dialog" aria-modal="true" aria-labelledby>`.
   - Heading: `<h2>Size guide</h2>` with stable id.
   - Close button: `<button type="button" class="dop-size-guide-modal__close" aria-label="Close">{% render 'icon-close' %}</button>`.
   - Loop `section.blocks`, render first matching `size_guide_image` block via `{% render 'image' with image: block.settings.image, alt: block.settings.alt %}`.

2. **Add `size_guide_image` block to `sections/dopamiles-product-hero.liquid` schema:**
   ```jsonc
   {
     "type": "size_guide_image",
     "name": "Size guide image",
     "settings": [
       {
         "type": "text",
         "id": "product_type",
         "label": "Product type",
         "info": "Must exactly match Shopify product type (Products > [Product] > Product organization > Type). Case-insensitive but exact word match. E.g. 'T-shirt', 'Polo', 'Sweater'."
       },
       { "type": "image_picker", "id": "image", "label": "Sizing chart image" },
       { "type": "text", "id": "alt", "label": "Image alt text", "default": "Sizing chart" }
     ]
   }
   ```

3. **Add modal render to `sections/dopamiles-product-hero.liquid`** at section bottom (after accordions, before closing tag):
   ```liquid
   {%- comment -%} Size guide modal — rendered once per section, opens via trigger in variant picker {%- endcomment -%}
   {%- render 'dopamiles-size-guide-modal', section: section, product: product -%}
   ```

4. **Modify `snippets/product-variant-picker.liquid`** to insert trigger inside the `<legend>` (after the "Size:" label, before picker controls), gated by `option.name == 'Size'`:

   <!-- Updated: Validation Session 1 - F3 (option.name not product_option.name), F4 (sg_block to avoid shadowing snippet's `block` render arg), D1 (legend placement) -->

   ```liquid
   {% if option.name == 'Size' %}
     {%- assign has_chart = false -%}
     {%- for sg_block in block.blocks -%}
       {%- if sg_block.type == 'size_guide_image'
           and sg_block.settings.image != blank
           and sg_block.settings.product_type != blank
           and sg_block.settings.product_type | handleize == product.type | handleize -%}
         {%- assign has_chart = true -%}
         {%- break -%}
       {%- endif -%}
     {%- endfor -%}
     {%- if has_chart -%}
       <modal-opener data-modal="#SizeGuide-{{ section.id }}" class="dop-size-guide-opener">
         <button type="button" class="dop-size-guide-link" aria-haspopup="dialog">
           {% render 'icon-info' %}<span>Size guide</span>
         </button>
       </modal-opener>
     {%- endif -%}
   {% endif %}
   ```

   **Notes on Liquid scoping (per validation):**
   - `option` (not `product_option`) — snippet iterates `for option in product.options_with_values` at line 33.
   - `sg_block` (not `block`) — inside this snippet, `block` is the SECTION (rendered from hero L126 with `block: section`), so `block.blocks` is the section blocks. Looping with `for block in ...` would shadow the render arg.
   - Insert location: inside the `<legend>` element, immediately after the existing "Size:" label markup, BEFORE the picker controls open (so trigger sits inline with "Size: M" on one line).

5. **Run `shopify theme validate`** to confirm schema + Liquid compile cleanly.

6. **Smoke test in dev**: `shopify theme dev` → load tee PDP → check trigger renders, modal opens (with no image yet shows empty modal; OK for this phase, fixed by Phase 04 config).

## Success Criteria

- [ ] `snippets/dopamiles-size-guide-modal.liquid` created and passes `shopify theme validate`
- [ ] `size_guide_image` block visible in Theme Editor under `dopamiles-product-hero` section
- [ ] Trigger link absent from PDP when no block configured (has_chart guard works)
- [ ] No new JS files added
- [ ] No Liquid errors in dev console

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Schema block name >25 chars rejected | "Size guide image" = 16 chars; safe |
| `<modal-opener>` element not loaded on PDP | Verify Dawn loads it via `details-modal.js` — already used in header/cards on pod-tee |
| `product.type` empty string → handleize returns "" → matches block with empty product_type | Add explicit `!= blank` guard on product_type in loop |
| `section.blocks` empty in Section Rendering API context | Modal only renders when block exists; SRA preserves blocks (not section settings) |
| Trigger renders inside Globo color-swatch subtree and gets hidden by `[data-dawn-vs]` CSS | Trigger is on a Size option, not color — Globo doesn't touch size options |

## Notes

- Brainstorm reference: [brainstorm-summary.md](./brainstorm-summary.md) "Trigger render sketch" and "Modal render sketch" sections.
- BuildMyPOD source reference: `d:/github local/_temp-buildmypod-inspect/snippets/variant-main-picker.liquid:228-254`.
