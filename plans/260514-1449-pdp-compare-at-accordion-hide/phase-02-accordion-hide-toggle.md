# Phase 02 — Accordion hide toggle

**Status:** shipped (preview 158279991548)
**Owner:** code
**Effort:** ~15 min
**Depends on:** none (independent of Phase 01)
**Gate:** Manual preview verification — `hidden: true` block omitted from DOM render

## Goal
Add a `hidden` checkbox setting to the `accordion` block schema in `dopamiles-product-hero`. When merchant sets `hidden: true` on a block, the Liquid render loop SKIPS that block entirely (not just CSS-hidden — the markup never enters the DOM).

## Context
- Section file: `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (491 LOC)
- Accordion blocks live as section blocks (type `accordion`) — see `templates/product.json` for the 3 default instances (sizing-fit, care, shipping-returns).
- Block render loop is around line 281-291 of `dopamiles-product-hero.liquid` (`{%- if block.type == 'accordion' -%}`)
- Block schema lives at line 322 (block definition with type `accordion`)

## Key insights
- "Hidden" must mean SKIP RENDER, not `display: none`. Skipping the render avoids loading content into the DOM (matters if merchant has long content + image-heavy text the user shouldn't be tempted to inspect).
- `checkbox` setting type is Shopify-standard, default false, no schema collision risk.
- The block stays in the section's `block_order` — merchant can untoggle to re-enable. This is a soft hide, not a delete.
- Theme Editor preview shows `hidden: true` blocks correctly (they disappear when toggled true) — Shopify re-renders on each setting change.

## Requirements

### Functional
- Each accordion block exposes a `hidden` checkbox in Theme Editor
- Default: `false` (block visible)
- When `true`: block markup is NOT rendered (DOM check via DevTools confirms absence)
- Other accordion blocks render normally regardless of one being hidden
- All other block types (bundle_addon, etc.) unaffected

### Non-functional
- ~5 LOC change total
- No CSS or JS changes — Liquid-only
- Theme check 11/38 baseline preserved

## Architecture

### Schema addition (block-level)
Find the `accordion` block schema in `dopamiles-product-hero.liquid` schema (around line 322). Add a `checkbox` setting:

```json
{
  "type": "accordion",
  "name": "Accordion (Details tab)",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Details" },
    { "type": "richtext", "id": "content", "label": "Content" },
    {
      "type": "checkbox",
      "id": "hidden",
      "label": "Hide this accordion tab",
      "default": false,
      "info": "When checked, this tab is omitted from the PDP. Content is preserved for later."
    }
  ]
}
```

(Exact schema differs slightly from above sketch — read the file to confirm existing setting IDs and order before editing.)

### Render-loop guard
Find the block render loop around line 281-291:

```liquid
{%- if block.type == 'accordion' -%}
  ... render accordion markup ...
{%- endif -%}
```

Change to:

```liquid
{%- if block.type == 'accordion' and block.settings.hidden != true -%}
  ... render accordion markup ...
{%- endif -%}
```

Equivalent alternative using `unless`:

```liquid
{%- if block.type == 'accordion' -%}
  {%- unless block.settings.hidden -%}
    ... render accordion markup ...
  {%- endunless -%}
{%- endif -%}
```

Pick whichever matches the file's existing style.

## Related code files

### Edit
- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` — accordion block schema + render-loop guard

### Read for context
- `D:\github local\pod-tee-theme\templates\product.json` — to confirm existing accordion blocks remain functional

## Implementation steps
1. Read `dopamiles-product-hero.liquid` around line 281-291 (render loop) and the accordion schema (around line 322)
2. Add `hidden` checkbox setting to the accordion block schema
3. Add `and block.settings.hidden != true` guard to the render-loop check
4. `shopify theme check` — 11/38 baseline preserved
5. Push to preview
6. Manual verify in Theme Editor:
   - Toggle `hidden: true` on Sizing & fit → reload PDP → confirm tab is gone
   - Toggle `hidden: false` → confirm tab is back
   - Other tabs unaffected throughout

## Todo
- [x] Read accordion schema + render loop context
- [x] Add `hidden` checkbox to block schema
- [x] Add `hidden != true` guard to render-loop conditional
- [x] shopify theme check passes (baseline 11/38 preserved)
- [x] Push theme to preview 158279991548
- [ ] Theme Editor verify: hidden=true omits tab from DOM
- [ ] Theme Editor verify: hidden=false restores tab
- [ ] DevTools verify: hidden block not present in DOM (not just visually hidden)

## Success criteria
- Each accordion block schema includes `hidden` checkbox setting
- `hidden: true` skips render (Liquid-level, not CSS)
- Theme Editor reflects toggle changes live
- Theme check 11/38 preserved
- No regression on default accordion display (sizing, care, shipping all show by default)

## Halt rule
1 iteration max. If schema breaks block instances OR render guard breaks existing accordion display → snapshot + halt + report BLOCKED.

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Existing accordion blocks lose merchant content on schema change | Low | New setting ID `hidden` doesn't collide; existing setting IDs (heading, content) unchanged → Shopify preserves all instances |
| Render guard pattern doesn't match file's existing style | Low | Read the file first; pick `if`-based or `unless`-based pattern that matches surrounding code |
| Theme Editor shows toggle but doesn't re-render preview | Low | Shopify auto-re-renders on setting change; tested across Dawn-based themes |
| Hidden block still loaded by JS that walks all blocks | Low | Only Liquid renders accordions; no JS-driven accordion lifecycle in current theme |

## Security
No new HTML output. Checkbox is merchant-controlled (Admin trust). Liquid `!= true` comparison is safe.

## Next phase
None. Plan complete after this phase ships.
