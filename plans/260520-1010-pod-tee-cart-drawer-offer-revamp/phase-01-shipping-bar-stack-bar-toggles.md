---
phase: 1
title: "Shipping-bar + Stack-bar visibility toggles"
status: complete
priority: P1
effort: "15m"
dependencies: []
---

# Phase 1: Shipping-bar + Stack-bar visibility toggles

## Overview

Add two independent section settings to `sections/dopamiles-cart-drawer.liquid` so the merchant can switch top-widget visibility from theme editor without code edit. Wrap the existing `.dop-cart-ship-bar` render in the new toggle. Defer bar markup creation to Phase 2; this phase only wires the visibility infrastructure.

## Requirements

- Functional: new setting `show_shipping_bar` (checkbox, default `false`) hides `.dop-cart-ship-bar` block when off.
- Functional: new setting `show_stack_save_bar` (checkbox, default `true`) controls the new tier progress bar (rendered in Phase 2 inside the bundle headline).
- Functional: existing live PDPs without the setting inherit the new default — shipping bar hidden out of the box (intentional campaign cut).
- Non-functional: zero Liquid errors; JSON schema parses; theme-check zero new offenses.

## Architecture

Schema additions (in cart-drawer section's `{% schema %}` settings array, after the existing `free_shipping_threshold`):

```json
{
  "type": "header",
  "content": "Top-of-cart widgets"
},
{
  "type": "checkbox",
  "id": "show_shipping_bar",
  "label": "Show free-shipping progress bar",
  "default": false,
  "info": "When checked, the $60 free-shipping progress bar renders above the bundle headline. Toggle off to focus the campaign on Stack & Save tier savings."
},
{
  "type": "checkbox",
  "id": "show_stack_save_bar",
  "label": "Show Stack & Save tier progress bar",
  "default": true,
  "info": "When checked, the bundle headline gets a tier progress bar (markers at 2/3/5 tees) below the copy."
}
```

Render-guard wrap (in cart-drawer body):

```liquid
{%- if section.settings.show_shipping_bar -%}
  <div class="dop-cart-ship-bar{% if ship_remaining <= 0 %} met{% endif %}" id="dop-ship-bar">
    ...existing markup...
  </div>
{%- endif -%}
```

Bundle headline render call adds `show_bar` arg (consumed in Phase 2):

```liquid
{%- render 'dopamiles-bundle-cart-headline', show_bar: section.settings.show_stack_save_bar -%}
```

## Related Code Files

- Modify: `sections/dopamiles-cart-drawer.liquid` — schema settings + ship-bar wrap + headline render arg.
- No change: `snippets/dopamiles-bundle-cart-headline.liquid` (consumed in Phase 2).

## Implementation Steps

1. Add the two new settings + section header to the schema settings array (after `free_shipping_threshold`).
2. Wrap the existing `<div class="dop-cart-ship-bar">...</div>` block (~L71-93) inside `{%- if section.settings.show_shipping_bar -%}...{%- endif -%}`.
3. Update the `dopamiles-bundle-cart-headline` render call (~L99) to pass `show_bar` arg.
4. Validate JSON schema parses (`node -e "..."`).
5. Live preview: open cart drawer, confirm ship bar hidden by default; flip setting on in theme editor, confirm ship bar reappears.

## Success Criteria

- [ ] `show_shipping_bar` setting visible in theme editor (default unchecked).
- [ ] `show_stack_save_bar` setting visible in theme editor (default checked).
- [ ] Ship bar hidden when setting off; rendered when setting on.
- [ ] JSON schema parses.
- [ ] Theme-check zero new offenses.

## Risk Assessment

- **Migration of live drawers** — setting `show_shipping_bar` defaults to false, hiding the bar on next page load. Intentional. If merchant prefers to keep current behavior, flip on in theme editor before deploy.
- **Translation key drift** — shipping bar uses `sections.cart.dop_free_shipping_unlocked` + `dop_from_free_shipping_html`. Still consumed when toggle is on; unchanged.
