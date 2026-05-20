# SP Widget Disappears on Cart Mutation — RCA Report

_Date: 2026-05-20_

---

## 1. Verdict

**Hypothesis CONFIRMED — with a critical nuance.**

The Shopify Section Rendering API renders a section using its **filename as the ID**. When the section lives inside a section group (not statically rendered), the filename-based request returns **schema defaults**, not the merchant-saved settings. `shipping_protection_product` has no schema default → resolves to `blank` → widget condition fails → omitted from re-rendered HTML.

**However:** there is a second root cause — the merchant's `shipping_protection_product` pick is **not saved in `sections/header-group.json`** at all (confirmed by full theme pull). The setting is missing from the file entirely, yet the widget renders on initial page load. This means the initial render is working for a **different reason than assumed** (see §3 below).

---

## 2. Evidence

### 2a. Shopify Section Rendering API docs
- Official rule: _"If a requested section exists in a template, or is statically rendered, then the existing section settings apply. Otherwise, any default values are used."_ — [Section Rendering API](https://shopify.dev/docs/api/ajax/section-rendering)
- Dynamic section ID rule: _"If a section is included in a JSON template or a section group, then it's assigned a dynamic section ID."_ e.g. `sections--1234__header`. — [Section groups](https://shopify.dev/docs/storefronts/themes/architecture/section-groups)
- Community-confirmed behavior: _"If we use the filename as the sectionId, we will only request the markup corresponding to the default settings of that section, not the markup corresponding to the current settings. To request the markup of these dynamic sections, we need to use dynamic sectionId."_ — [Mastering Section Rendering APIs](https://www.leohuynh.dev/blog/shopify-section-rendering-apis-notes)
- Community moderator confirmed this is **by design, not a bug** — [Shopify Community Q&A](https://community.shopify.com/c/technical-q-a/shopify-section-rendering-api-not-using-section-settings/m-p/2247587)

### 2b. Code evidence — filename used as section ID

`assets/dopamiles-cart.js:31`:
```js
const SECTION_ID = 'dopamiles-cart-drawer'; // matches section file name
```
All cart mutation calls: `sections: [SECTION_ID, PAGE_SECTION_ID]` — filename, not dynamic ID.

### 2c. Schema has no default for SP product picker

`sections/dopamiles-cart-drawer.liquid` schema (lines 393–398):
```json
{
  "type": "product",
  "id": "shipping_protection_product",
  "label": "Shipping Protection product"
}
```
No `"default"` key. Product-type settings cannot have a Liquid default. On filename-based render → `section.settings.shipping_protection_product` = blank.

### 2d. Setting not in header-group.json after full theme pull

`sections/header-group.json` (pulled live from theme `158279991548`):
```json
"dopamiles-cart-drawer": {
  "type": "dopamiles-cart-drawer",
  "settings": {
    "free_shipping_threshold": 6000
  }
}
```
`shipping_protection_product` is **absent**. This means merchant's picker save never persisted here — likely an editor sync issue or the theme was not re-pushed after the setting was configured.

---

## 3. Where SP Picker Is Actually Stored

**It is not stored anywhere in the pulled theme files.** `config/settings_data.json` and `sections/header-group.json` contain no SP product reference. No GID found anywhere in the JSON corpus.

**Why does initial render show the widget?** Two likely explanations:
- (A) The screenshot showing "widget renders" is from a **different theme** than `158279991548` (e.g. the live published theme), which does have the setting saved in its `header-group.json`. The user configured it there, not on the draft theme. Section render API is always called against the **active preview theme**, but the initial page load shows whichever theme the storefront is serving.
- (B) The merchant saved the picker on a previously published theme; the draft `158279991548` was duplicated from it and the `sections/*.json` were not preserved in the duplication or pull.

Either way: the dynamic ID path would also fail unless `header-group.json` actually contains the value.

---

## 4. Recommended Fix: Option A — Move to Theme-Global Settings (`settings_schema.json`)

**Why A over others:**
- `settings_schema.json` is **not in `.shopifyignore`** → pushable via `shopify theme push`.
- Theme-global settings (`settings.sp_product`) are accessible via Liquid in **any context** — initial render, section-render-API, template render — because they come from `config/settings_data.json` (always loaded).
- No metafield definition step required (B is two-step per existing memory).
- No hard-coded handle (C breaks multi-store).
- Avoids JS-side reconstruction complexity (D).
- No extra round-trip (E).
- Trade-off: picker appears under "Theme settings → Cart" in the editor, not next to cart-drawer section settings. Acceptable — document it in the section header comment.

---

## 5. Implementation Diff

### Step 1 — Add SP settings to `config/settings_schema.json`

Add inside the existing `"Cart"` settings group, after the `cart_drawer_collection` entry (line 1445):

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
        "info": "Pick the hidden SP product (priced at $2.95). Required for the widget to render."
      },
      {
        "type": "checkbox",
        "id": "shipping_protection_default_checked",
        "label": "Default to checked",
        "default": true,
        "info": "SP auto-adds on first drawer open per session. Shoppers can opt out."
      },
```

### Step 2 — Update `sections/dopamiles-cart-drawer.liquid`

Replace all `section.settings.enable_shipping_protection`, `section.settings.shipping_protection_product`, and `section.settings.shipping_protection_default_checked` references with `settings.*` equivalents.

There are **5 occurrences** (lines 23–25, 44, 46, 281–285 in the current file):

```liquid
{%- comment -%} BEFORE {%- endcomment -%}
{%- if section.settings.shipping_protection_product != blank
    and section.settings.shipping_protection_product.variants.first != blank -%}
  {%- assign sp_variant_id = section.settings.shipping_protection_product.variants.first.id -%}
{%- endif -%}
```
→
```liquid
{%- if settings.shipping_protection_product != blank
    and settings.shipping_protection_product.variants.first != blank -%}
  {%- assign sp_variant_id = settings.shipping_protection_product.variants.first.id -%}
{%- endif -%}
```

```liquid
{%- comment -%} BEFORE (data-attrs on drawer div) {%- endcomment -%}
{%- if sp_variant_id and section.settings.enable_shipping_protection -%}
  data-sp-variant-id="{{ sp_variant_id }}"
  data-sp-default-checked="{% if section.settings.shipping_protection_default_checked %}true{% else %}false{% endif %}"
{%- endif -%}
```
→
```liquid
{%- if sp_variant_id and settings.enable_shipping_protection -%}
  data-sp-variant-id="{{ sp_variant_id }}"
  data-sp-default-checked="{% if settings.shipping_protection_default_checked %}true{% else %}false{% endif %}"
{%- endif -%}
```

```liquid
{%- comment -%} BEFORE (SP widget render in .dop-drawer-foot) {%- endcomment -%}
{%- if section.settings.enable_shipping_protection
    and section.settings.shipping_protection_product != blank -%}
  {%- render 'dopamiles-cart-shipping-protection',
      product: section.settings.shipping_protection_product,
      default_checked: section.settings.shipping_protection_default_checked -%}
{%- endif -%}
```
→
```liquid
{%- if settings.enable_shipping_protection
    and settings.shipping_protection_product != blank -%}
  {%- render 'dopamiles-cart-shipping-protection',
      product: settings.shipping_protection_product,
      default_checked: settings.shipping_protection_default_checked -%}
{%- endif -%}
```

### Step 3 — Remove duplicate settings from section schema

Delete the three SP-related entries from the `{% schema %}` block in `dopamiles-cart-drawer.liquid` (the header "Shipping Protection", `enable_shipping_protection`, `shipping_protection_product`, `shipping_protection_default_checked`). They are now owned by theme settings.

---

## 6. Verification Plan

### Deployment
1. Apply diffs above to `config/settings_schema.json` and `sections/dopamiles-cart-drawer.liquid`.
2. Push: `shopify theme push --theme=158279991548 --nodelete` — only liquid + schema files change; `.shopifyignore` blocks JSON templates and `settings_data.json`. ✓
3. In Theme Editor → "Theme settings" → "Cart" → scroll to "Shipping Protection" → pick the SP product → Save.
4. `config/settings_data.json` is now updated by the editor with the product GID. Pull is optional (it's ignored by push anyway).

### Verification behaviors
1. **Initial render**: Open PDP incognito → Add to cart → drawer opens → SP boxed-row present, checkbox checked, $2.95 shown in total.
2. **Uncheck SP**: Uncheck → drawer re-renders → SP boxed-row still visible but checkbox now unchecked → total drops $2.95 → bag count unchanged (SP line removed, other items intact).
3. **Re-check SP**: Check → drawer re-renders → checkbox checked → $2.95 re-added to total.
4. **Close + reopen**: Close drawer → reopen via bag icon → widget state reflects last server cart state (no ghost SP).
5. **Line-item filter**: SP line item must NOT appear in the main item list — `data-sp-variant-id` on the drawer div must be populated from `settings.*` (not blank) so the filter logic in `dopamiles-cart.js` skips it correctly.

---

## Unresolved Questions

1. Why did the initial page load show the widget if `shipping_protection_product` is absent from `header-group.json`? Strongly suspect the screenshot is from the published live theme, not draft `158279991548`. Confirm by adding `?preview_theme_id=158279991548` to the PDP URL before re-testing initial render.
2. After applying Fix A, the old section-level SP settings in `dopamiles-cart-drawer` schema are removed. If any other section or snippet references `section.settings.*` for SP, those must be updated too. (grep: `grep -rn "section\.settings\..*shipping_protection\|section\.settings\.enable_shipping" snippets/ sections/`)
