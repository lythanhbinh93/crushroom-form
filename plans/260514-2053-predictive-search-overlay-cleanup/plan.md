---
title: "Predictive Search Overlay Cleanup (Path D)"
description: "Re-wire custom dop-search predictive dropdown to the new full-width search overlay; suppress the Shopify Search & Discovery app's competing default UI. Debug-first to confirm root cause before implementing."
status: shipped-via-phase-01-only
priority: P2
effort: ~2h total
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: []
blocks: []
related:
  - prior-plan: plans/260514-1724-header-search-ui-cleanup/plan.md
  - brainstorm: plans/reports/brainstorm-260514-1912-predictive-search-ux.md
tags: [shopify, theme, pod-tee, dopamiles, header, search, predictive, overlay]
created: 2026-05-14
---

# Predictive Search Overlay Cleanup (Path D)

## Goal
Restore brand-consistent predictive search inside the new full-width search overlay. The custom `dopamiles-search.js` panel (recent searches + suggested queries + preview cards) should render below the overlay's input. The Shopify Search & Discovery app's competing native dropdown (spinning loaders, "Powered by Shopify" footer, query echo) must be suppressed.

## Context
The prior plan (`plans/260514-1724-header-search-ui-cleanup/`) refactored the header search from an inline pill to a Dawn-style full-width overlay. Visual + interaction tests passed. But on type, an off-brand Shopify-default predictive dropdown appeared, not the existing custom one.

Brainstorm finding (`plans/reports/brainstorm-260514-1912-predictive-search-ux.md`): the custom `dopamiles-search.js` has a 3-tier input lookup that *should* still find the overlay's input via tier-2 (`header input[type="search"]`). Most likely cause is the Shopify Search & Discovery app injecting its own dropdown that competes with or hides the custom panel. Debug-first to confirm before fixing.

## Phases

| # | Phase | Effort | Gate |
|---|---|---|---|
| 01 | [DOM debug — confirm what's rendering](phase-01-dom-debug.md) | 20 min | Console log shows whether `#dop-search-panel` exists; identifies the source of the visible default UI |
| 02 | [Re-wire trigger + suppress competing UI](phase-02-rewire-and-suppress.md) | ~1.5h | Custom dop-search panel renders under overlay input on type; no Shopify-default UI visible; mobile + desktop verified |

## Definition of done
- Typing in the overlay input shows the brand-styled custom panel (idle state with recent + suggested + preview cards; live results from `/search/suggest.json`)
- No off-brand UI visible (no spinning loaders, no "Powered by Shopify" keyboard-hints footer, no redundant query echo)
- Keyboard nav (↑ ↓ Enter Esc) works inside the panel
- × close, outside-click, and Esc still close the overlay (and the panel with it)
- `shopify theme check` baseline 11/38 preserved
- Visual verification on preview 158279991548 desktop AND mobile viewport

## Halt rule
2 iterations max for Phase 02 CSS suppression (Shopify app class names are unstable). If after 2 rounds the app UI still bleeds through → re-evaluate: pivot to Path E (disable predictive entirely) or escalate to Path C (Dawn `<predictive-search>` pattern).

## Risks
| Risk | Severity | Mitigation |
|---|---|---|
| Search & Discovery class names change after Shopify update | Med | Document the selectors used; add a CSS comment with date so future devs know it may need refresh |
| Custom panel z-index conflicts with overlay backdrop | Low | Set explicit z-index on panel above overlay backdrop layer |
| `data-dop-search-trigger` attribute alone doesn't fix init (script load order) | Low | Phase 01 debug confirms before implementing |
| Suppressing the app's UI also breaks merchandising rules the merchant set in Admin | Low | Predictive UI suppression doesn't affect search-results page or admin rules — those live server-side |

## Security
None — visual/behavioral change, no new user input handling.

## Next steps after ship
- If Search & Discovery features become a real requirement, revisit Path C (Dawn pattern) to get the native features with brand-controlled markup.
- Consider folding `dopamiles-search.js` keyboard nav into the overlay's Esc handler so they share one source of truth.
