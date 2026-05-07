# Theme Integration Patches — Phase 03

Instructions for wiring the Phase 03 snippets into the live `pod-tee-theme` repo.
Work on branch `feat/bundle-function` (off `feat/dopamiles-pdp`).

---

## 1. PDP bundle banner — `sections/dopamiles-product-hero.liquid`

**Goal:** render bundle-banner above the ATC button.

**Locate** the product form block (~line 124):
```liquid
{%- form 'product', product,
    id: product_form_id,
    data-type: 'add-to-cart-form',
    data-dop-product-form: ''
-%}
```

**Insert immediately before that line:**
```liquid
{%- comment -%} Phase 03 — bundle upsell strip {%- endcomment -%}
{%- render 'bundle-banner' -%}
```

---

## 2. Cart drawer bundle-saving line — `sections/dopamiles-cart-drawer.liquid`

**Goal:** show "Bundle saving · -$X" row between discount-code row and drawer footer totals.

**Locate** the totals block (~line 248):
```liquid
{%- comment -%} ── Drawer footer ── {%- endcomment -%}
<div class="dop-drawer-foot" id="dop-cart-foot">
  <div class="dop-cart-totals" id="dop-cart-totals">
    <div class="dop-tot-row">
      <span>Subtotal
```

**Insert immediately before `<div class="dop-drawer-foot">`:**
```liquid
{%- comment -%} Phase 03 — bundle saving line {%- endcomment -%}
{%- render 'bundle-cart-discount-line' -%}
```

> Note: the existing `dopamiles-cart-drawer.liquid` already loops
> `cart.cart_level_discount_applications` in the totals block (lines ~254-258).
> The new snippet adds a visually distinct green row *above* the totals div —
> distinct from the grey discount rows rendered inside `.dop-cart-totals`.
> You may remove or keep the existing loop depending on whether you want
> both displays; the snippet is self-contained.

---

## 3. Free-shipping bar — `sections/dopamiles-cart-drawer.liquid`

**Goal:** replace the existing shipping-bar block with the new snippet that
(a) uses `cart.total_price` as the numerator and (b) emits state-aware copy.

**Locate** the existing ship-bar block (~lines 70-92):
```liquid
{%- comment -%} ── Shipping bar ── {%- endcomment -%}
<div class="dop-cart-ship-bar{% if ship_remaining <= 0 %} met{% endif %}" id="dop-ship-bar">
  ...
</div>
```

**Replace the entire `<div class="dop-cart-ship-bar ...">...</div>` block** with:
```liquid
{%- comment -%} Phase 03 — bundle-aware free-ship bar {%- endcomment -%}
{%- render 'bundle-free-ship-progress' -%}
```

Also **remove** the now-redundant `ship_threshold / cart_total / ship_remaining / ship_pct`
variable assignments at the top of the section (lines ~11-15) since the snippet
owns those calculations internally:
```liquid
{%- assign ship_threshold = section.settings.free_shipping_threshold | default: 7500 -%}
{%- assign cart_total = cart.total_price -%}
{%- assign ship_remaining = ship_threshold | minus: cart_total -%}
{%- assign ship_pct = cart_total | times: 100 | divided_by: ship_threshold -%}
{%- if ship_pct > 100 -%}{%- assign ship_pct = 100 -%}{%- endif -%}
```

> **Important:** `ship_remaining` is also referenced inside the upsell-row
> conditional at ~line 215: `{%- if ship_remaining > 0 -%}`.
> After removing the top assignments, either re-introduce a local variable
> before that block, or inline the check:
> ```liquid
> {%- assign _sr = 7500 | minus: cart.total_price -%}
> {%- if _sr > 0 -%}Add for free shipping &rarr;{%- else -%}You might also like &rarr;{%- endif -%}
> ```

---

## 4. Collection page placement — theme editor (no code change required)

The `bundle-tease-banner` section is a free-floating section that can be
added to any template via the theme editor:

1. Theme editor → Collections → Default collection template
2. Add section → "Bundle tease banner"
3. Drag above the product grid

For a code-driven placement on `sections/dopamiles-collection-grid.liquid`,
add at the top of the section body:
```liquid
{%- comment -%} Phase 03 — bundle tease strip {%- endcomment -%}
{%- render 'bundle-banner' -%}
```

---

## 5. Load bundle CSS — `layout/theme.liquid`

Add inside `<head>` after the existing dopamiles token/base CSS references:
```liquid
{{ 'dopamiles-bundle.css' | asset_url | stylesheet_tag }}
```

Locate the existing pattern (search for `dopamiles-tokens` or `base.css`):
```liquid
{%- render 'dopamiles-tokens' -%}
{{ 'base.css' | asset_url | stylesheet_tag }}
```

Insert the bundle stylesheet tag on the line after `base.css`.

> The banner snippet also emits a `<style>` block inline (scoped to the
> snippet render). The `dopamiles-bundle.css` asset is additive — it adds
> the cart-saving-line styles not covered by the inline block.

---

## 6. Settings schema — no additions required

The `bundle-free-ship-progress` snippet hard-codes the $75 threshold (7500 cents)
in v1 per the locked decision. If you later want a theme-editor knob:

Add to the `dopamiles-cart-drawer` section schema settings array:
```json
{
  "type": "number",
  "id": "bundle_ship_threshold",
  "label": "Bundle free-shipping threshold (cents)",
  "default": 7500,
  "info": "Post-discount total required for free shipping. Default $75 = 7500."
}
```

Then in `bundle-free-ship-progress.liquid` replace:
```liquid
assign ship_threshold = 7500
```
with a render-arg or pass via a section include. Since snippets cannot read
section settings of other sections, the cleanest approach is to pass it as
a variable from the drawer section before rendering:
```liquid
{%- assign bundle_ship_threshold = section.settings.bundle_ship_threshold | default: 7500 -%}
{%- render 'bundle-free-ship-progress', ship_threshold_override: bundle_ship_threshold -%}
```
And update the snippet to use `ship_threshold_override | default: 7500`.

---

## Files to edit (summary)

| File | Action | Approx lines |
|---|---|---|
| `sections/dopamiles-product-hero.liquid` | Insert `render 'bundle-banner'` above product form | ~124 |
| `sections/dopamiles-cart-drawer.liquid` | Insert `render 'bundle-cart-discount-line'` before `.dop-drawer-foot` | ~248 |
| `sections/dopamiles-cart-drawer.liquid` | Replace ship-bar block with `render 'bundle-free-ship-progress'` | ~70–92 |
| `sections/dopamiles-cart-drawer.liquid` | Remove/update redundant ship var assignments at top | ~11–15 |
| `layout/theme.liquid` | Add `dopamiles-bundle.css` stylesheet tag in `<head>` | after base.css |

## New files to copy in

| Scaffold path | Destination in `pod-tee-theme` |
|---|---|
| `scaffold/theme/snippets/bundle-banner.liquid` | `snippets/bundle-banner.liquid` |
| `scaffold/theme/snippets/bundle-cart-discount-line.liquid` | `snippets/bundle-cart-discount-line.liquid` |
| `scaffold/theme/snippets/bundle-free-ship-progress.liquid` | `snippets/bundle-free-ship-progress.liquid` |
| `scaffold/theme/sections/bundle-tease-banner.liquid` | `sections/bundle-tease-banner.liquid` |
| `scaffold/theme/assets/dopamiles-bundle.css` | `assets/dopamiles-bundle.css` |
