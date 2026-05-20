---
phase: 3
title: "JS route-split"
status: pending
priority: P3
effort: "2-3h"
dependencies: []
---

# Phase 3: JS route-split

## Overview

Reduce ~170KB of unused JavaScript per collection-page load by route-gating JS files in `theme.liquid` (mirroring Phase 2's CSS approach) and deferring non-critical scripts via `async` / `defer` where route-split isn't feasible.

Trickier than Phase 2 because JS modules often have implicit cross-route dependencies (e.g., a cart-drawer script may be triggered from any "Add to cart" button anywhere on the site).

## Requirements

**Functional**
- Each route loads only the JS files its functionality actually needs.
- Lighthouse "Reduce unused JavaScript" audit savings on `/collections/all` drops by ≥50% (lower bar than CSS because some JS truly is needed everywhere).
- All interactive features still work: ATC, cart drawer, sticky ATC, search, predictive search, FBT, accordions, filters, sort, pagination, color swatches, etc.

**Non-functional**
- Use Liquid `{% if template == 'X' %}` guards for unambiguous JS.
- For JS used by multiple templates: load globally if savings < 30KB; route-gate only when savings significant.
- For JS with implicit cross-template triggers (cart drawer): keep global but add `defer` if not already.

## Architecture

Two-tier strategy:

**Tier 1: Hard route-gate** — JS unambiguously single-template:
- PDP-only: variant picker, sticky ATC, FBT calculator, accordion enhancements
- Collection-only: filter drawer, sort, pagination
- Cart-page-only (NOT cart drawer): cart line item updates, cart page total recalc
- Home-only: marquee, hero animations

**Tier 2: Defer or async** — JS triggering from any page but not critical-path:
- Cart drawer JS: stays site-wide BUT `defer`. Drawer opens after user clicks ATC anywhere
- Analytics / tracking scripts: `defer`
- Web fonts loader: `async` if separate from CSS link

## Related Code Files

**Modify**
- `pod-tee-theme/layout/theme.liquid` — add template guards + `defer` attrs where missing.

**Possibly modify**
- Individual section files that load their own JS via `<script src="X.js" defer></script>` — review if already route-correct (likely yes; sections only render on their template).

**Read (inventory)**
- `pod-tee-theme/assets/dopamiles-*.js` — purpose of each file
- `pod-tee-theme/layout/theme.liquid` — current script loading order
- `pod-tee-theme/sections/dopamiles-*.liquid` — which sections load which JS inline

**No change**
- Cart drawer JS (functional everywhere) — only adds `defer`
- Vendor scripts (Shopify, Klaviyo, etc.) — out of theme control

## Implementation Steps

1. **Build the JS-to-templates inventory**:
   ```
   dopamiles-product-form.js     → product only
   dopamiles-mobile-sticky-atc.js → product only (already loaded inside section file)
   dopamiles-pdp.js              → product only (FBT, etc.)
   dopamiles-collection.js       → collection only (filter, sort)
   dopamiles-cart.js             → site-wide (drawer triggers everywhere) + defer
   dopamiles-cart-helpers.js     → site-wide (drawer) + defer
   dopamiles-search.js           → search + (predictive search trigger from header) — needs site-wide for predictive search
   dopamiles-header.js           → site-wide (header on every page)
   ...
   ```

2. **Read `layout/theme.liquid`** and find every `<script src="{{ 'X.js' | asset_url }}">` reference.

3. **Categorize** each: Tier 1 (route-gate), Tier 2 (defer), or Keep-as-is (already correct).

4. **Apply guards / defers**. Pattern for route-gate:
   ```liquid
   {% if template == 'product' %}
     <script src="{{ 'dopamiles-pdp.js' | asset_url }}" defer></script>
   {% endif %}
   ```

5. **CRITICAL QA pass — every interactive feature**:
   - ATC on PDP (regular + sticky mobile)
   - Cart drawer open from header / sticky ATC / quick-add buttons
   - Cart drawer close / outside-click / ESC
   - FBT "Add 3 to cart"
   - Discount code apply in drawer
   - Shipping protection toggle in drawer
   - Cart page line item +/- and remove
   - Search submit
   - Predictive search dropdown (from header search icon click)
   - Collection filter drawer open + apply
   - Collection sort change
   - Pagination next/prev
   - Color swatch change on product card
   - Variant picker change on PDP
   - Mobile sticky ATC show/hide on scroll

6. **Run Lighthouse** on `/collections/all` — confirm unused-JS savings drop ≥50%.

7. **Run Lighthouse on PDP** — confirm no regression (don't fix collection at PDP's expense).

## Success Criteria

- [ ] JS-to-templates inventory documented.
- [ ] `theme.liquid` updated with template guards + `defer` attributes.
- [ ] Lighthouse "unused-javascript" savings on `/collections/all` drops by ≥50%.
- [ ] PDP Lighthouse score unchanged (no regression).
- [ ] All interactive features pass QA pass (list in step 5).
- [ ] No CSS or Liquid section-rendering changes (only `<script>` tag gating).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A JS file has a cross-route trigger we miss (e.g., header search icon triggers predictive-search JS that we route-gated to search template) → broken feature | HIGH | Broken interactive feature | Conservative: keep questionable JS site-wide with `defer` rather than route-gate. Add to "Keep-as-is" tier on uncertainty |
| `defer` attribute changes script execution order → race condition | Med | Subtle bug, hard to reproduce | Test thoroughly per QA list in step 5 |
| QA pass misses an edge case | Med | Bug ships to user | Spend more time on QA than on the edits themselves |
| Cart drawer JS is core dependency for ATC click handlers — route-gating breaks ATC everywhere | High if attempted | Total ATC breakage | Cart drawer stays site-wide |
| `dopamiles-header.js` includes predictive search init — gating it to search-template only breaks predictive search from any page's header | High if attempted | Predictive search broken | Header JS stays site-wide |
| Lighthouse "unused JS" includes Shopify-injected scripts (Klaviyo, Hotjar) — actionable savings is less than audit suggests | Med | Phase delivers less than projected | Acceptable; document in re-measure phase |

## Out of scope

- Refactoring JS modules to split into smaller per-route bundles (requires a build step)
- Code-splitting via dynamic `import()` (requires ES modules support audit)
- Removing dead code from JS files (separate cleanup pass)
- Vendor script optimization (Shopify, Klaviyo) — not theme-controlled
