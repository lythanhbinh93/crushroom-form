---
phase: 5
title: "Toolbar Dawn Migration — Combined Filter + Sort"
status: pending
priority: P2
effort: "1h"
dependencies: [4]
---

# Phase 5: Toolbar Dawn Migration

## Overview

Collection page toolbar currently has two separate controls: "Filter" button (left) and "Sort: Featured" select (right) + product-count pill. Migrate to Dawn's pattern: single "Filter and sort" button that opens a drawer; sort options live inside the drawer as a fieldset at top; product count stays visible.

Highest cascade risk of the 5 phases — Liquid markup restructure, CSS layout change, JS event re-attachment. Mitigated via Playwright pixel-diff QA on collection page × 3 viewports BEFORE promoting beyond preview.

## Requirements

- **Functional:**
  - Single button labelled "Filter and sort" (Dawn-canonical copy) replaces the existing `.doc-filter-btn`.
  - Sort `<select>` moves from `.doc-toolbar-right` INTO the filter drawer body as a `<fieldset>` at the top of the drawer.
  - Product count pill stays in `.doc-toolbar-right` (copy: keep "tees" or generalize to "products" — decided at runtime).
  - Sort change behavior unchanged: applies immediately on `<select>` change, persists via URL `?sort_by=` param.
- **Non-functional:**
  - Liquid edits in 1 section file + 1 filter drawer snippet.
  - CSS layout shift in `dopamiles-collection.css`.
  - JS handler `data-dop-sort` re-attaches inside drawer markup.
  - Playwright pixel-diff QA passes on collection page × 3 viewports.

## Architecture

### Current state

`sections/dopamiles-collection-grid.liquid:115-152`:
```liquid
<div class="doc-toolbar">
  <div class="doc-toolbar-left">
    <button class="doc-filter-btn" id="doc-open-filters" aria-controls="doc-drawer">
      <svg .../>Filter<chevron/>
    </button>
  </div>
  <div class="doc-toolbar-right">
    <span class="doc-count-pill"><b>{{ collection.products_count }}</b> tees</span>
    <select id="doc-sort-select" data-dop-sort ...>...</select>
  </div>
</div>
```

### Target state (Dawn pattern)

```liquid
<div class="doc-toolbar">
  <div class="doc-toolbar-left">
    <button class="doc-filter-btn" id="doc-open-filters" aria-controls="doc-drawer">
      <svg .../>Filter and sort<chevron/>
    </button>
  </div>
  <div class="doc-toolbar-right">
    <span class="doc-count-pill"><b>{{ collection.products_count }}</b> {{ count_label }}</span>
  </div>
</div>

<!-- Inside filter drawer body, FIRST fieldset (before filter facets) -->
<fieldset class="doc-drawer-fieldset doc-drawer-sort">
  <legend>Sort by</legend>
  <select id="doc-sort-select" data-dop-sort data-dop-collection-url="{{ collection.url }}">
    <!-- same option markup -->
  </select>
</fieldset>
```

`count_label` decided at runtime: keep `tees` (brand-specific) or `products` (generic). Default to keep `tees` unless user signals otherwise during phase execution.

### Layout shift

```css
/* dopamiles-collection.css */
.doc-toolbar {
  /* current: flex 2 columns left/right */
  /* new: same layout, but right column only has count-pill */
}
.doc-toolbar-right {
  justify-content: flex-end;  /* count-pill sits flush-right */
}
.doc-drawer-sort {
  /* new fieldset styles matching existing facet groups in the drawer */
}
```

### JS event re-attachment

`data-dop-sort` handler attaches via either:
- (likely) `document.querySelector('[data-dop-sort]').addEventListener('change', ...)` at top-level on `DOMContentLoaded`
- OR delegation on a parent

If top-level lookup runs once at load, the `<select>` MUST exist in the DOM by then. Filter drawer markup is typically rendered server-side and hidden via CSS (not lazy-injected), so the select will be findable on DOMContentLoaded. Confirm by reading the drawer snippet + the relevant JS.

### Cascade-risk safeguards (matches Round 2 Phase 3 spec)

1. **Build the markup change** but DON'T push to preview yet.
2. **Playwright pixel-diff QA** before promoting: capture screenshots of `/collections/all` × 3 viewports (412 mobile, 768 tablet, 1366 desktop), baseline (current preview) vs candidate (post-edit local theme). Compare with `pixelmatch` or Playwright's built-in diff with a tolerance threshold.
3. Inspect the visual diff. If any tolerance-exceeding diff outside the toolbar/drawer region, abort.
4. Only push to preview after the diff is clean.
5. Post-push: run perf-probe-feature-variant regression suite + manually open filter drawer + apply sort + confirm URL param persists.

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\sections\dopamiles-collection-grid.liquid:115-152` (toolbar markup restructure)
- **Modify (find first):** the filter drawer snippet — likely `snippets/dopamiles-collection-filter-drawer.liquid` or inlined further down in the section file. Add sort `<fieldset>` at top of drawer body.
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-collection.css` (layout adjustment for `.doc-toolbar-right`; new `.doc-drawer-sort` fieldset styles)
- **Verify (likely no change):** `dopamiles-collection.js` or wherever `data-dop-sort` handler lives — confirm attachment strategy survives drawer relocation
- **Create:** `D:\github local\crushroom-form\plans\260519-1410-pod-tee-ux-revisions-pre-publish\qa\visual-diff-toolbar.mjs` (Playwright pixel-diff harness, scoped to collection page × 3 viewports)
- **Create:** `D:\github local\crushroom-form\plans\260519-1410-pod-tee-ux-revisions-pre-publish\reports\visual-diff-toolbar.json` (QA verdict)
- **Create:** `D:\github local\crushroom-form\plans\260519-1410-pod-tee-ux-revisions-pre-publish\reports\visual-diff-toolbar/` (per-viewport PNG triples: baseline, candidate, diff)
- **No-touch:** filter facet rendering inside drawer; pagination; product card grid

## Implementation Steps

1. Read `sections/dopamiles-collection-grid.liquid` filter drawer markup (likely below line 152) to find drawer body insertion point.
2. Read the JS handler for `data-dop-sort` (grep `data-dop-sort`).
3. Write `qa/visual-diff-toolbar.mjs` — Playwright harness, captures baseline (current preview deployed state).
4. Run baseline capture against preview theme 158279991548. Save `baseline-mobile.png`, `baseline-tablet.png`, `baseline-desktop.png`.
5. Make local Liquid + CSS edits per architecture spec:
   - Toolbar markup: change button label to "Filter and sort"; remove `<select>` from `.doc-toolbar-right`.
   - Drawer body: prepend sort `<fieldset>` before facets.
   - CSS: adjust `.doc-toolbar-right` justify; add `.doc-drawer-sort` styles matching facet groups.
6. Commit locally on `feat/pdp-perf-pareto`: `feat(collection): combine filter+sort into Dawn-pattern drawer`.
7. **DO NOT push yet.** Push to a staging clone OR push to preview AND immediately revert if diff fails (riskier).
8. **Preferred:** clone preview theme to new staging theme via `shopify theme push --unpublished --new`. Capture new theme ID.
9. Push commit to staging clone via `shopify theme push --theme={staging-id} --only=...`.
10. Run `qa/visual-diff-toolbar.mjs` candidate capture against staging clone. Compare to baseline.
11. Inspect `reports/visual-diff-toolbar.json` + diff PNGs. Pass = no diffs outside toolbar/drawer region.
12. If pass → push commit to preview theme 158279991548. If fail → abort, diagnose, revert local commit.
13. Verify behaviors on preview: open filter drawer, change sort, confirm URL param + product reorder works.
14. Run perf-probe-feature-variant.mjs regression suite (collection page is in scope indirectly through navigation).
15. Write `reports/p5-after-report.md` with verdict + diff results.

## Success Criteria

- [ ] Toolbar shows single "Filter and sort" button (left) + count pill (right). Sort select is no longer in the toolbar.
- [ ] Opening the filter drawer reveals a "Sort by" fieldset at the top with the same options as before.
- [ ] Changing sort applies immediately + persists in URL `?sort_by=` param.
- [ ] Playwright pixel-diff QA: all 3 viewport diffs within tolerance OR diffs limited to the toolbar/drawer region (expected change).
- [ ] Filter facets still work (Globo color filter, size filter, etc.).
- [ ] A11y: button `aria-expanded` toggles on drawer open/close, ESC key closes drawer.
- [ ] Regression suite GREEN.
- [ ] `reports/p5-after-report.md` written with verdict.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Sort `<select>` move breaks JS handler that ran on DOMContentLoaded | Verify `data-dop-sort` is queryable in drawer markup at load time; staging-theme dry-run catches this |
| Drawer's existing focus management (e.g. focus-trap) doesn't account for the new `<select>` | Test tab order in drawer: button → sort select → filter facets → "Apply" |
| Brand-voice "tees" vs "products" copy decision left for runtime → arbitrary choice | Default to keep "tees" (brand-specific, current copy). User can override at runtime if they want generic. |
| Staging theme clone uses paid theme slot | Verify slot availability; if full, delete an old unpublished theme first |
| Pixel-diff tolerance too tight → false fails on font anti-aliasing | Use 0.5-1% per-image threshold OR mask known anti-aliasing regions |
| Theme Access token rotation since previous deploys | Verify token at start of phase; re-issue if needed |
