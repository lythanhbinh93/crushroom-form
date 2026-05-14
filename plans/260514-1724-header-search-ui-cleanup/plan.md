---
title: "Header Search UI Cleanup"
description: "Surgical CSS pass to fix three visual defects on the dopamiles-header expandable search form: native blue × cancel, browser-default submit button, and redundant outer toggle while form is open."
status: pending
priority: P3
effort: ~30 min total
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: []
blocks: []
related:
  - brainstorm: plans/reports/brainstorm-260514-1724-header-search-ui-cleanup.md
tags: [shopify, theme, pod-tee, dopamiles, header, search, css]
created: 2026-05-14
---

# Header Search UI Cleanup

## Goal
One surgical CSS pass to fix three visible defects on the dopamiles-header expandable search form. CSS-only — no markup, no JS, no schema changes.

## Phases

| # | Phase | Effort | Gate |
|---|---|---|---|
| 01 | [Header search CSS cleanup](phase-01-css-cleanup.md) | ~30 min | No native ×; flat submit icon; outer toggle hidden when expanded; theme check 11/38 baseline |

## Definition of done
- No native blue × visible on the search input in any browser
- Submit magnifier renders flat (no border, no bg), darkens on hover
- Outer toggle (`#dop-search-toggle`) disappears when form is expanded; reappears on collapse
- `shopify theme check` shows 11 errors / 38 warnings (baseline preserved)
- Manual spot-check on preview 158279991548

## QA strategy
Manual visual check. Single CSS file edit, no functional logic — automated QA addition not justified.

Spot-check:
- [ ] Click search toggle → form opens, outer toggle hides
- [ ] Type "test" → no blue × appears
- [ ] Hover the magnifier → icon darkens (no bordered button)
- [ ] Press Esc → form closes, outer toggle reappears
- [ ] Press Enter on input → submits to /search?q=test

## Halt rule
1 iteration max. If the CSS edit breaks the form layout or the toggle JS state → snapshot + revert + report BLOCKED.

## Risk
See brainstorm report for full risk register. All risks rated Low; no Medium/High concerns.

## Security
None — visual-only change, no user input handling alterations.

## Next steps after ship
- None mandatory. If user-research later flags missing clear-button discoverability, revisit with a styled × button + JS show/hide.
