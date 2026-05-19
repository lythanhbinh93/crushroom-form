---
phase: 4
title: "Toggle Pattern × 5 Touchpoints"
status: pending
priority: P1
effort: "1-2h"
dependencies: [3]
---

# Phase 4: Toggle Pattern × 5 Touchpoints

## Overview

The dominant pattern across feedback: "conditional content, conditional spacing". 5 distinct touchpoints share the same root cause (wrapper / divider / margin renders even when content is empty). One canonical pattern applied 5 times.

## Requirements

- **Functional:**
  - 4 new section settings (`show_stock_availability`, `show_eyebrow`, `show_color_dots_on_cards`, plus any FB-5-specific toggle discovered).
  - All defaults `true` (preserve current behavior).
  - When any toggle is OFF: content + its visual wrapper + its spacing all disappear cleanly.
  - Sold-out state (FB-3): "Sold out" message stays visible regardless of `show_stock_availability`.
- **Non-functional:**
  - Liquid edits in 2 section files + 1 snippet.
  - 1 CSS file safety-net rule (`:empty { display: none }` scoped to known wrappers).
  - Schema JSON additions in both sections (append-only, no breaking changes to existing setups).

## Architecture

### Canonical pattern

**Liquid wrap:**
```liquid
{%- if section.settings.show_X != false -%}
  <div class="dop-X-wrapper">
    ... content ...
  </div>
{%- endif -%}
```

If `show_X` is unset (existing themes) or `true`, the block renders. If `false`, neither the content NOR the wrapper renders — sibling spacing flows via flex/grid `gap` on parent. No orphan margin.

**CSS safety net:**
```css
.dop-section:empty,
.dop-hero-side:empty,
.dop-buy > div:empty {
  display: none;
}
```
For any wrapper we miss in the Liquid audit. Scoped to specific parent classes to avoid hiding legitimate empty placeholders.

**Schema setting (append to section schema's `settings` array):**
```json
{
  "type": "checkbox",
  "id": "show_X",
  "label": "Show <thing>",
  "default": true
}
```

### Touchpoint mapping

#### 4a — FB-3 stock availability line

- File: `sections/dopamiles-product-hero.liquid:155-173`
- New setting: `show_stock_availability` (default true)
- Logic:
  ```liquid
  {%- if section.settings.show_stock_availability != false or current_variant.available == false -%}
    {%- comment -%} Always show sold-out message; only hide in-stock line via toggle {%- endcomment -%}
    <div class="dop-stock ...">
      {%- if current_variant.available -%}
        {%- if section.settings.show_stock_availability != false -%}
          <span class="dot"></span><span data-dop-stock-text>{{ ... }}</span>
        {%- endif -%}
      {%- else -%}
        <span class="dot"></span><span data-dop-stock-text>{{ 'products.product.sold_out' | t }}</span>
      {%- endif -%}
    </div>
  {%- endif -%}
  ```
  Simplification: when `current_variant.available == false` (sold out), render regardless of toggle. When `available == true` and toggle off, render nothing (no wrapper).

#### 4b — FB-5 orphan dividers

- Files: `sections/dopamiles-product-hero.liquid` (bundle area + bundle-addon blocks), `snippets/dopamiles-bundle-inline.liquid`
- Approach: audit + apply
  1. Grep for `border-top:`, `border-bottom:`, `<hr` in PDP-related Liquid and CSS to find hairline rules.
  2. For each: determine parent wrapper. If wrapper renders empty when bundle/addon disabled, wrap the divider rule in `:has(> *)` OR move the divider to a sibling-combinator selector `+ .dop-X` (only paints between two adjacent rendered siblings).
  3. CSS safety net: `:empty { display: none }` on known section wrappers.

This is the audit-driven sub-phase; the exact Liquid edits depend on what the audit finds.

#### 4c — FB-6b collection lede gap

- File: `sections/dopamiles-collection-grid.liquid:55-78` (right column wrapper)
- Lede already conditional (`{%- if section.settings.lede != blank -%}`).
- Problem: the right `<div>` wrapper renders even when lede empty AND meta-stats are all empty. On mobile single-stack, the empty `<div>` keeps its margin-top from the parent grid.
- Fix:
  ```liquid
  {%- assign has_right_content = false -%}
  {%- if section.settings.lede != blank -%}{%- assign has_right_content = true -%}{%- endif -%}
  {%- if section.settings.stat_1_value != blank -%}{%- assign has_right_content = true -%}{%- endif -%}
  ... (stat_2, stat_3) ...
  {%- if has_right_content -%}
    <div>... lede + meta-stats ...</div>
  {%- endif -%}
  ```
  Or simpler: use CSS `:has()`: `.doc-hero > div:not(:has(*)) { display: none; }`.

#### 4d — FB-8 collection eyebrow

- File: `sections/dopamiles-collection-grid.liquid:45-50`
- New setting: `show_eyebrow` (default true)
- Currently: `{{ section.settings.eyebrow | default: 'The catalog' }}` — the `default:` filter re-injects a value when merchant clears it.
- Fix: drop the `default:` filter AND wrap with `{%- if section.settings.show_eyebrow != false and section.settings.eyebrow != blank -%}`. The wrapping `<div class="doc-hero-eye">` also conditionally renders.

#### 4e — FB-9 card color swatches

- File: `sections/dopamiles-collection-grid.liquid:245-253` (snippet call site)
- New setting: `show_color_dots_on_cards` (default true)
- Snippet param: change `show_color_dots: true` (hardcoded) → `show_color_dots: section.settings.show_color_dots_on_cards`.
- Empty-state: when toggle off, the `.dop-color-dots` `<div>` doesn't render in `snippets/dopamiles-product-card.liquid:101` — card's existing flex/grid spacing collapses naturally (verify by visual smoke).

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (4a stock wrap + schema setting append; 4b bundle-area audit)
- **Modify:** `D:\github local\pod-tee-theme\sections\dopamiles-collection-grid.liquid` (4c lede wrap; 4d eyebrow conditional + schema; 4e swatch toggle pass-through + schema)
- **Modify (possibly):** `D:\github local\pod-tee-theme\snippets\dopamiles-bundle-inline.liquid` (if 4b audit finds orphan dividers here)
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css` (safety-net `:empty` rule scoped)
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-collection.css` (safety-net `:empty` rule scoped)
- **No-touch:**
  - `snippets/dopamiles-product-card.liquid` (already snippet-param-driven; just changes the caller)
  - Globo integration, variant-picker, media-order resolution
  - `dopamiles-pdp-variant-sync.js` (this round preserves stock-text JS update for visible state)

## Implementation Steps

1. **Audit step (4b)**: grep for `border-top`, `border-bottom`, `<hr`, and any divider rules in PDP-related files. Inspect deployed HTML on a preview PDP where the bundle is disabled — note actual orphan wrappers via DevTools.
2. **4a — stock line**: edit `dopamiles-product-hero.liquid:155-173` per spec above. Append schema setting at the bottom of the section schema.
3. **4c — lede gap**: edit `dopamiles-collection-grid.liquid:55-78`. Add `has_right_content` assign + conditional wrap OR add `:has()` CSS rule (pick simpler).
4. **4d — eyebrow**: edit `dopamiles-collection-grid.liquid:45-50`. Drop `default:` filter; add `show_eyebrow` schema setting.
5. **4e — swatches**: edit `dopamiles-collection-grid.liquid:245-253` snippet call. Add `show_color_dots_on_cards` schema setting.
6. **4b — orphan dividers**: apply audit findings. CSS safety net rules in `dopamiles-pdp.css` + `dopamiles-collection.css`.
7. Commit as 1-2 commits (4a-4e together OR 4a/4c/4d/4e together + 4b separate).
8. Push the 5-6 changed files to preview.
9. Verify schema-driven toggles in Theme Editor: each new toggle appears, defaults true, flipping it off hides the right thing cleanly.
10. Visual smoke: PDP with stock toggle off; collection with eyebrow off + swatches off; mobile lede-gap.

## Success Criteria

- [ ] 4 new section settings appear in Theme Editor (PDP section: `show_stock_availability`; collection section: `show_eyebrow`, `show_color_dots_on_cards`; plus any FB-5 setting).
- [ ] All defaults are `true` — existing themes deployed without changes look identical.
- [ ] Toggle OFF on each setting: corresponding content + wrapper + spacing all disappear; no orphan hairline / margin gap.
- [ ] Sold-out variant in FB-3: "Sold out" message visible regardless of `show_stock_availability` value.
- [ ] FB-5 orphan dividers no longer visible on a PDP with bundle disabled + accordions hidden.
- [ ] FB-6b: collection hero on mobile collapses cleanly when lede is blank.
- [ ] Regression suite GREEN (Globo + media-order + 0 section refetches).
- [ ] No new lint/Liquid-syntax errors (`shopify theme push` succeeds).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `:has()` CSS selector unsupported in older Safari (iOS <15.4) | Use feature-query `@supports selector(:has(*))` OR fall back to Liquid-side conditional wrap. Verify on iOS Safari 16+. |
| `:empty` rule unintentionally hides a legitimate wrapper with only whitespace child | Scope `:empty` to specific parent classes (`.dop-buy > div:empty`, not global) |
| Schema JSON syntax error breaks the section in Theme Editor | Validate JSON before push: `node -e "JSON.parse(require('fs').readFileSync('section.liquid', 'utf8').match(/{% schema %}([\\s\\S]*?){% endschema %}/)[1])"` |
| Existing merchant has `eyebrow` setting cleared (relying on `default:` filter) → blank eyebrow shows on next deploy | Schema migration would re-inject default; but per locked decision "show by default", we keep `default: "The catalog"` in schema so blank-cleared merchants get the default back |
| FB-4 ATC `.dop-btn-text` JS in Phase 3 didn't touch stock text — confirm `data-dop-stock-text` JS update still works after wrapper conditional | Test variant change with stock toggle off — wrapper missing means `[data-dop-stock-text]` query returns null; JS must null-guard (verify in `dopamiles-pdp-variant-sync.js`) |
