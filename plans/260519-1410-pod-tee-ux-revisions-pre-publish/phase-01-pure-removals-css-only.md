---
phase: 1
title: "Pure Removals via CSS-Only"
status: pending
priority: P1
effort: "10min"
dependencies: []
---

# Phase 1: Pure Removals via CSS-Only

## Overview

Hide 3 visual elements (PDP breadcrumb + PDP eyebrow + collection breadcrumb) via scoped CSS `display: none` rules. Markup preserved for screen readers; reversible by deleting the rules.

## Requirements

- **Functional:** All 3 wrappers visually hidden across all viewports (mobile + tablet + desktop). Underlying Liquid markup unchanged.
- **Non-functional:**
  - 2 CSS files touched (`dopamiles-pdp.css`, `dopamiles-collection.css`).
  - Zero new section settings, zero Liquid edits.
  - Push only the 2 changed CSS files to preview.

## Architecture

CSS-only hide. The semantic markup stays in the DOM for assistive tech (`<nav aria-label="Breadcrumb">` still announces "Breadcrumb" to screen readers via the `aria-label`). Sighted users see nothing.

```css
/* dopamiles-pdp.css — append at end */
.dopamiles-product-hero .dop-crumbs { display: none; }
.dopamiles-product-hero .dop-eyebrow { display: none; }
```

```css
/* dopamiles-collection.css — append at end */
.dopamiles-collection-grid .doc-crumbs { display: none; }
```

Selectors scoped to the section class to avoid bleeding into other pages that might re-use `.dop-crumbs` / `.dop-eyebrow` classes.

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css` (append 2 rules)
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-collection.css` (append 1 rule)
- **No-touch:**
  - `sections/dopamiles-product-hero.liquid` (markup preserved)
  - `sections/dopamiles-collection-grid.liquid` (markup preserved)

## Implementation Steps

1. Read end of `assets/dopamiles-pdp.css` to confirm append point.
2. Append 2-line comment + 2 rules to `dopamiles-pdp.css`.
3. Read end of `assets/dopamiles-collection.css` to confirm append point.
4. Append 1-line comment + 1 rule to `dopamiles-collection.css`.
5. Commit on `feat/pdp-perf-pareto`: `style(pdp,collection): hide breadcrumbs and PDP eyebrow`.
6. Push to preview theme 158279991548 via `shopify theme push --only=assets/dopamiles-pdp.css --only=assets/dopamiles-collection.css`.
7. Verify via curl + grep that deployed CSS contains the new rules.
8. User eyeball preview on 3 PDP URLs + 1 collection URL.

## Success Criteria

- [ ] `dopamiles-pdp.css` ends with the 2 new rules (scoped to `.dopamiles-product-hero`).
- [ ] `dopamiles-collection.css` ends with the 1 new rule (scoped to `.dopamiles-collection-grid`).
- [ ] Deployed CSS includes the rules (verified via curl).
- [ ] Preview PDP + collection page no longer shows breadcrumbs or "T-SHIRT" eyebrow visually.
- [ ] Markup still present (View Source contains `<nav aria-label="Breadcrumb">` etc.).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Class `.dop-crumbs` / `.dop-eyebrow` used elsewhere on the site → unintended hide | Scope selectors with `.dopamiles-product-hero` and `.dopamiles-collection-grid` parents |
| Screen-reader users miss the visual hierarchy cue | `aria-label="Breadcrumb"` on `<nav>` preserves semantic role; sighted-design choice is the user's call |
| Push fails authentication (token rotation pending) | If 401, re-issue Theme Access token before push |
