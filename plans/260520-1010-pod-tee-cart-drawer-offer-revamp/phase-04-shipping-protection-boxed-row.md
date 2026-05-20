---
phase: 4
title: "Shipping Protection boxed row"
status: complete
priority: P1
effort: "1-1.5h"
dependencies: [1]
---

# Phase 4: Shipping Protection boxed row

## Overview

Add a Shipping Protection offer to the cart drawer. Boxed row above the totals with checkbox + icon + label + price. JS auto-adds the protection product to cart once per session if the checkbox is on; respects manual opt-out (sessionStorage flag). Removes when toggled off; re-adds when toggled on (always — manual toggles are explicit user intent). Widget hides gracefully if the section setting `shipping_protection_product` is unset.

## Requirements

- Functional: new section settings:
  - `enable_shipping_protection` (checkbox, default `true`) — master toggle.
  - `shipping_protection_product` (product picker, no default) — points at the hidden $2.95 product in Shopify admin.
  - `shipping_protection_default_checked` (checkbox, default `true`) — controls initial checkbox state and auto-add behavior.
- Functional: when `enable_shipping_protection = true` AND `shipping_protection_product` is set:
  - Boxed row renders above `.dop-cart-totals`.
  - Checkbox reflects current cart state (is product variant present in cart?).
  - On first drawer open per session (when `default_checked = true` AND not already opted out), JS auto-adds the variant via `/cart/add.js`.
  - On checkbox toggle off → POST `/cart/change.js` (qty 0 by line key); set sessionStorage `dop_sp_opted_out = "1"`.
  - On checkbox toggle on → POST `/cart/add.js`; clear sessionStorage `dop_sp_opted_out`.
- Functional: SP product is filtered out of the regular line-items loop (matched by product ID or tag `shipping-protection`).
- Functional: SP price still flows through subtotal/total naturally (it IS a real cart line).
- Non-functional: a11y — checkbox is a real `<input type="checkbox">` with associated `<label for>`; keyboard tab order intact.
- Non-functional: widget hides gracefully if `shipping_protection_product` unset (no Liquid error, no console warning).

## Architecture

Schema additions (after Phase 3's CTA URL setting):

```json
{
  "type": "header",
  "content": "Shipping Protection"
},
{
  "type": "checkbox",
  "id": "enable_shipping_protection",
  "label": "Enable Shipping Protection offer",
  "default": true
},
{
  "type": "product",
  "id": "shipping_protection_product",
  "label": "Shipping Protection product",
  "info": "Pick a hidden Shopify product priced at $2.95 (or your preferred protection price). Required for the widget to render."
},
{
  "type": "checkbox",
  "id": "shipping_protection_default_checked",
  "label": "Default to checked",
  "default": true,
  "info": "When checked: SP auto-adds on first drawer open per session. Shoppers can opt out; opt-out persists for the session."
}
```

Snippet `snippets/dopamiles-cart-shipping-protection.liquid`:

```liquid
{%- comment -%}
  dopamiles-cart-shipping-protection.liquid
  Boxed row above cart totals with checkbox + label + price.
  JS auto-add behavior wired in assets/dopamiles-cart-helpers.js.

  Render args:
    product           — Shopify product object (required)
    default_checked   — boolean; initial checkbox state when SP not in cart
{%- endcomment -%}

{%- if product != blank and product.first_available_variant != blank -%}
  {%- liquid
    assign sp_variant = product.first_available_variant
    assign sp_in_cart = false
    for item in cart.items
      if item.variant_id == sp_variant.id
        assign sp_in_cart = true
      endif
    endfor
    assign sp_checked = sp_in_cart
    if sp_in_cart == false and default_checked
      assign sp_checked = true
    endif
  -%}
  <div
    class="dop-cart-shipping-protect"
    data-dop-shipping-protect
    data-sp-variant-id="{{ sp_variant.id }}"
    data-sp-default-checked="{{ default_checked }}"
  >
    <label class="dop-sp-row">
      <input
        type="checkbox"
        class="dop-sp-checkbox"
        data-dop-sp-toggle
        {% if sp_checked %}checked{% endif %}
      >
      <span class="dop-sp-icon" aria-hidden="true">
        {%- render 'dopamiles-icon', icon: 'shield', size: 18 -%}
      </span>
      <span class="dop-sp-text">
        <b>{{ product.title | escape | default: 'Shipping Protection' }}</b>
        <span class="dop-sp-sub">{{ product.metafields.custom.subtitle | default: 'Cover loss, damage, or theft in transit.' }}</span>
      </span>
      <span class="dop-sp-price">{{ sp_variant.price | money }}</span>
    </label>
  </div>
{%- endif -%}
```

Cart-drawer render call (insert above `.dop-cart-totals` in the drawer footer):

```liquid
{%- if section.settings.enable_shipping_protection and section.settings.shipping_protection_product != blank -%}
  {%- render 'dopamiles-cart-shipping-protection',
      product: section.settings.shipping_protection_product,
      default_checked: section.settings.shipping_protection_default_checked -%}
{%- endif -%}
```

Line-items filter (in the existing `{%- for item in cart.items -%}` loop in cart-drawer section, alongside the existing `is_child` check):

```liquid
{%- assign is_sp = false -%}
{%- if section.settings.shipping_protection_product != blank
    and item.variant_id == section.settings.shipping_protection_product.first_available_variant.id -%}
  {%- assign is_sp = true -%}
{%- endif -%}

{%- unless is_child or is_sp -%}
  ...existing render...
{%- endunless -%}
```

JS additions (in `assets/dopamiles-cart-helpers.js` or a new sibling — pick based on grep):

```js
// Shipping Protection: once-per-session auto-add + checkbox toggle
function wireShippingProtection() {
  var root = document.querySelector('[data-dop-shipping-protect]');
  if (!root) return;
  var checkbox = root.querySelector('[data-dop-sp-toggle]');
  var variantId = root.dataset.spVariantId;
  var defaultChecked = root.dataset.spDefaultChecked === 'true';
  if (!checkbox || !variantId) return;

  var OPT_OUT_KEY = 'dop_sp_opted_out';
  var AUTO_ADD_KEY = 'dop_sp_auto_added';
  var optedOut = sessionStorage.getItem(OPT_OUT_KEY) === '1';
  var autoAdded = sessionStorage.getItem(AUTO_ADD_KEY) === '1';

  // Once-per-session auto-add
  if (defaultChecked && !optedOut && !autoAdded && !checkbox.checked) {
    // Edge case: SP not yet in cart, and we haven't auto-added this session
    addSP(variantId).then(function () {
      sessionStorage.setItem(AUTO_ADD_KEY, '1');
    });
  } else if (defaultChecked && !optedOut && !autoAdded && checkbox.checked) {
    // Snippet rendered checkbox checked because SP is already in cart — mark auto-added
    sessionStorage.setItem(AUTO_ADD_KEY, '1');
  }

  checkbox.addEventListener('change', function () {
    if (checkbox.checked) {
      sessionStorage.removeItem(OPT_OUT_KEY);
      addSP(variantId);
    } else {
      sessionStorage.setItem(OPT_OUT_KEY, '1');
      removeSPByVariantId(variantId);
    }
  });
}

function addSP(variantId) {
  return fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ items: [{ id: parseInt(variantId, 10), quantity: 1 }] })
  })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function () { return refreshCartDrawer(); });
}

function removeSPByVariantId(variantId) {
  return fetch('/cart.js', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (cart) {
      var line = cart.items.findIndex(function (it) { return String(it.variant_id) === String(variantId); });
      if (line === -1) return null;
      return fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ line: line + 1, quantity: 0 })
      });
    })
    .then(function () { return refreshCartDrawer(); });
}
// refreshCartDrawer() — re-render section via /cart/update.js or existing helper
```

CSS additions (in cart-drawer CSS file, alongside Phase 2's bar styles):

```css
.dop-cart-shipping-protect {
  margin: 14px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--dop-line);
  border-radius: 12px;
  background: var(--dop-surface);
}
.dop-sp-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.dop-sp-checkbox { width: 18px; height: 18px; accent-color: var(--dop-accent); cursor: pointer; }
.dop-sp-icon { color: var(--dop-ink-2); display: grid; place-items: center; }
.dop-sp-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dop-sp-text b { font-size: 13px; color: var(--dop-ink); }
.dop-sp-sub { font-size: 11px; color: var(--dop-ink-3); line-height: 1.3; }
.dop-sp-price { font-size: 13px; font-weight: 600; color: var(--dop-ink); font-variant-numeric: tabular-nums; }
```

## Related Code Files

- Create: `snippets/dopamiles-cart-shipping-protection.liquid` — boxed row markup.
- Modify: `sections/dopamiles-cart-drawer.liquid` — 4 schema settings, render call above totals, line-items filter.
- Modify: `assets/dopamiles-cart-helpers.js` (or sibling) — `wireShippingProtection()` + helpers, call from init.
- Modify: cart drawer CSS file — new `.dop-cart-shipping-protect` + `.dop-sp-*` rules.

## Implementation Steps

1. Grep for `cart-helpers` / `cart-drawer` JS to find the right file to extend.
2. Verify a `shield` icon exists in `snippets/dopamiles-icon.liquid` (or pick an existing icon: `check`, `cart`, `truck`).
3. Create `snippets/dopamiles-cart-shipping-protection.liquid` per architecture spec.
4. Add 4 settings to cart-drawer schema (with header).
5. Insert filter logic in line-items loop (skip SP variant from rendering as a regular line).
6. Insert render call above `.dop-cart-totals` in the drawer footer.
7. Extend cart-helpers JS with `wireShippingProtection()` + helpers; call from init AND after each cart-section re-render.
8. Add CSS rules.
9. Validate JSON schema parses.
10. Manually create a `Shipping Protection` product in admin (price $2.95, hidden tag) and pick it in theme editor.
11. Live test (Phase 5 covers full matrix).

## Success Criteria

- [ ] Widget hides when `shipping_protection_product` unset (no error).
- [ ] Widget renders above `.dop-cart-totals` when enabled + product set.
- [ ] First drawer open (with non-SP items in cart, default_checked=true, no opt-out flag) auto-adds SP variant.
- [ ] Checkbox toggle off removes SP from cart; sets `dop_sp_opted_out` sessionStorage.
- [ ] Checkbox toggle on re-adds SP; clears opt-out flag.
- [ ] SP product does NOT render as a separate line item in `.dop-cart-lines`.
- [ ] Subtotal / total include SP price.
- [ ] Checkbox state reflects "is SP in cart" on re-render.
- [ ] Theme-check zero new offenses; JSON schema parses.
- [ ] No console errors.

## Risk Assessment

- **Re-rendered checkbox listener** — when Dawn re-renders the cart-drawer section after add/remove, the checkbox is a fresh DOM node — the old listener is orphaned. Mitigation: re-call `wireShippingProtection()` after each `PUB_SUB_EVENTS.cartUpdate` (or equivalent post-render hook in `dopamiles-cart-helpers.js`).
- **Race condition: rapid double-click on checkbox** — successive add/remove POSTs can race. Mitigation: disable the checkbox briefly during the fetch; re-enable in `.finally()`.
- **SP product variant changes** — if merchant edits the SP product variant (e.g., creates a $4.95 variant + deprecates $2.95), the cart-drawer's stored `data-sp-variant-id` may go stale. Mitigation: re-render gets the new `first_available_variant.id` each time; widget self-heals on next drawer open.
- **Filter performance** — line-items loop iterates all cart items; adding the SP check is O(1) per item. Negligible.
- **Auto-add fires on empty cart** — should NOT auto-add when cart has no items (otherwise SP becomes the only line item, weird). Mitigation: the entire cart-drawer content block is gated on `{%- if cart.item_count > 0 -%}` — SP widget only renders when cart has items. Plus the JS auto-add only fires when the widget exists. Safe.
- **Sold-out SP variant** — if merchant's SP product is sold out, `first_available_variant` could be nil. Mitigation: snippet's outer guard `{%- if product != blank and product.first_available_variant != blank -%}` handles this — widget hides.
- **Checkout: SP shows as a line item on checkout page** — intentional. Shopper sees `Shipping Protection · $2.95` on the order summary. Standard Route-style UX.
