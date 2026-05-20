---
phase: 2
title: "CSS route-split"
status: pending
priority: P2
effort: "1-2h"
dependencies: []
---

# Phase 2: CSS route-split

## Overview

Reduce ~180KB of unused CSS per page by loading dopamiles CSS files only on the templates that need them. Currently `theme.liquid` loads every `dopamiles-*.css` site-wide. Collection page doesn't need PDP-only styles; PDP doesn't need collection-only styles; cart drawer (loaded everywhere) is the only legitimate site-wide CSS.

## Requirements

**Functional**
- Each route loads only the CSS files its rendered sections actually use.
- Lighthouse "Reduce unused CSS" audit savings drops by ≥80% on `/collections/all`.
- Zero visual regression on any template (PDP, collection, home, search, cart, customer).

**Non-functional**
- Use Liquid `{% if template == 'X' %}` guards in `theme.liquid` for unambiguous route-CSS mapping.
- Where a CSS file is used by multiple but not all templates, OR-chain the guards: `{% if template == 'product' or template == 'collection' %}`.
- KEEP `dopamiles-shared.css` site-wide (it contains product card + footer + nav styles used everywhere).

## Architecture

Inventory step (mandatory before edits):

1. List every `dopamiles-*.css` file in `assets/`.
2. For each, identify which selectors are used by which sections.
3. Map sections → templates via `templates/*.json`.
4. Build a CSS-to-templates matrix.
5. Define guard conditions for each.

Likely outcome:
- `dopamiles-shared.css` → site-wide (no guard change)
- `dopamiles-pdp.css` → `{% if template == 'product' %}`
- `dopamiles-collection.css` → `{% if template contains 'collection' %}` (covers /collections/all and per-collection routes)
- `dopamiles-cart.css` → `{% if template contains 'cart' %}` BUT cart drawer is everywhere — needs split into cart-drawer-only (site-wide) + cart-page-only (template-gated). MAY require a separate phase.
- `dopamiles-home-*.css` (if exists) → `{% if template == 'index' %}`
- Other section-specific CSS → already loaded by their section's Liquid file (no change needed)

## Related Code Files

**Modify**
- `pod-tee-theme/layout/theme.liquid` — wrap each stylesheet tag in template guards. Likely 5-10 edits.

**Read (inventory)**
- `pod-tee-theme/assets/dopamiles-*.css` (all files) — determine selector usage
- `pod-tee-theme/sections/dopamiles-*.liquid` — which sections render on which templates
- `pod-tee-theme/templates/*.json` — section-to-template mapping

**No change**
- `dopamiles-shared.css` (stays site-wide)
- Per-section stylesheets that are loaded inside the section's own Liquid file (already route-correct via the section's render gating)

## Implementation Steps

1. **Build the CSS-to-templates inventory** in comments or a scratch file:
   ```
   dopamiles-shared.css        → ALL templates (no guard)
   dopamiles-pdp.css           → product template only
   dopamiles-collection.css    → collection templates only
   dopamiles-cart.css          → audit: drawer site-wide vs page collection-only
   dopamiles-home-*.css        → index template only
   ```

2. **Read `layout/theme.liquid`** and find every `{{ 'dopamiles-*.css' | asset_url | stylesheet_tag }}` reference. Note line numbers.

3. **For each CSS reference**, wrap in the appropriate guard:
   ```liquid
   {% if template == 'product' %}
     {{ 'dopamiles-pdp.css' | asset_url | stylesheet_tag }}
   {% endif %}
   ```

4. **Edge case — cart drawer**: drawer is loaded from `theme.liquid` site-wide AND uses `dopamiles-cart.css`. Cart page uses the same CSS for its layout. If the file is small, leave it site-wide. If it's the chunky one driving the unused-CSS audit, split into:
   - `dopamiles-cart-drawer.css` (site-wide) — drawer styles only
   - `dopamiles-cart-page.css` (cart template only) — line items, totals, page layout
   This is a separate sub-task if needed; defer if `dopamiles-cart.css` isn't the dominant offender.

5. **QA pass on each template type**:
   - PDP: load a product page, scroll all sections, verify nothing styled wrong
   - Collection: load `/collections/all`, scroll, verify product cards + niche bar + grid + pagination
   - Home: load `/`, verify hero + grids + sections
   - Cart drawer: open from any page, verify drawer styling
   - Cart page: load `/cart`, verify line items + totals
   - Search: load `/search?q=test`, verify results grid
   - 404: load `/nonexistent`, verify 404 styling
   - Customer pages: load `/account/login`, verify forms

6. **Run Lighthouse on `/collections/all` mobile + desktop** — confirm unused-CSS savings drop ≥80%.

7. **Optional refinement**: if some templates show new unused-CSS findings, iterate guards.

## Success Criteria

- [ ] CSS-to-templates inventory documented in this phase or a sub-file.
- [ ] `theme.liquid` updated with template guards around route-specific CSS.
- [ ] Lighthouse "unused-css-rules" savings on `/collections/all` drops by ≥80%.
- [ ] Visual QA pass on PDP / collection / home / search / cart drawer / cart page / 404 / customer pages — zero regression.
- [ ] No JS changes in this phase (purely CSS load gating).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Missing a guard breaks a template's styling | Med-High | Visible UX bug | Comprehensive QA pass; git-bisect-style isolation per CSS file if a regression appears |
| Cart drawer CSS mixed with cart-page CSS in `dopamiles-cart.css` — splitting requires file restructure | Med | Phase 2 grows | Defer to sub-task if needed; accept partial split if cart.css isn't a dominant offender |
| Sections load CSS inline via `{{ 'X.css' | asset_url | stylesheet_tag }}` inside the section file — already route-correct but get counted toward "unused" if section renders empty | Low | Lighthouse savings number misleading | Note in re-measure phase; raw audit numbers vs production realism |
| Page-specific selectors in `dopamiles-shared.css` get false-positive "unused" flag | Low | None | `shared.css` stays site-wide regardless |
