---
title: "pod-tee UX Revisions Pre-Publish — 10 items / 5 patterns / 5 phases"
description: "UX/UI revisions on preview theme 158279991548 before publish swap. 10 feedback items → 5 root patterns → 5 phases ordered low→high cascade risk. Halt rule after each phase."
status: pending
priority: P1
effort: 3-4.5h
repo: D:\github local\pod-tee-theme
branch: feat/pdp-perf-pareto
blockedBy: []
blocks: [260514-1230-pod-tee-publish-and-js-fixes]
related:
  - brainstorm: plans/reports/brainstormer-260519-1410-pod-tee-ux-revisions-pre-publish.md
  - downstream: plans/260514-1230-pod-tee-publish-and-js-fixes (publish swap Phase 02 paused awaiting these revisions)
  - regression-guard: plans/260518-1300-pdp-feature-variant-default (Globo media-order alignment — must not break)
  - perf-floor: plans/260519-1215-pdp-perf-round-2 (5-run preview median 91/91/92 — must not regress)
tags: [shopify, theme, pod-tee, dopamiles, ux, ui, pre-publish]
created: 2026-05-19
---

# pod-tee UX Revisions Pre-Publish

## Overview

User paused the publish swap to fix 10 UX issues observed on preview theme 158279991548. Feedback collected iteratively; brainstorm consolidated 10 items → 5 root patterns. Each pattern = one phase. Phases ordered low→high cascade-risk; halt rule after each.

Locked decisions (from brainstorm):
- **Toggle scope**: theme-editor section settings only (global per section), no metafields.
- **Defaults**: show by default (preserve current behavior — safest for publish).
- **Removals method**: CSS-only `display: none` on wrappers (preserves a11y markup, reversible by one CSS line).
- **Removals viewport scope**: all viewports.
- **ATC redesign**: visual only — drop price-tail, center label, font 17→20px.
- **Sold-out state in FB-3**: stock toggle hides "In stock" line BUT keeps "Sold out" message.

## Goal

All 10 feedback items reflected on preview theme 158279991548. 4 new section settings (all default ON). Zero regression on Globo + media-order + section-refetch behavior. Lighthouse 5-run median doesn't regress below Round-2 final (91/91/92). Publish swap unblocked.

## Phases

| # | Name | Effort | Risk | Status |
|---|---|---|:-:|---|
| 1 | [Pure removals via CSS-only](./phase-01-pure-removals-css-only.md) | 10 min | near-zero | Pending |
| 2 | [Lede max-width fix](./phase-02-lede-max-width.md) | 10 min | low | Pending |
| 3 | [ATC redesign](./phase-03-atc-redesign.md) | 30-45 min | low-medium | Pending |
| 4 | [Toggle pattern × 5 touchpoints](./phase-04-toggle-pattern.md) | 1-2h | medium | Pending |
| 5 | [Toolbar Dawn migration](./phase-05-toolbar-dawn-migration.md) | 1h | medium-high | Pending |

## Halt rule per phase

After each phase deploy → visual smoke (user eyeball preview) + regression suite (`plans/260514-1230-pod-tee-publish-and-js-fixes/qa/perf-probe-feature-variant.mjs`). If any visible regression, **revert that phase only**; others remain shipped.

## Out of scope (deliberate)

- Footer 3-duplicate-menu side observation (admin-fix, not theme code)
- Per-product metafield overrides (rejected: section setting is enough for 170 products)
- ATC price-elsewhere repositioning (rejected: price block already exists above ATC)
- A11y rewrites for breadcrumbs (preserved via CSS-only hide)
- Perf optimization (this round is perf-neutral; Round 2 floor stays at 91/91/92)

## Success criteria (whole plan)

- All 10 feedback items visually reflected on preview 158279991548
- 4 new section settings added: `show_stock_availability` (PDP), `show_eyebrow` (collection), `show_color_dots_on_cards` (collection), plus any FB-5-specific toggles discovered in Phase 4 audit; all `default: true`
- Regression suite GREEN through all 5 phases
- Phase 5 visual diff: Playwright pixel-diff on collection page × 3 viewports passes tolerance
- No new lint/Liquid-syntax/CSS-parse errors (`shopify theme push` succeeds each phase)
- Lighthouse 5-run median ≥ Round 2 floor (lead 91 / mid 91 / edge 92)
- After Phase 5 closes → publish swap (`260514-1230-pod-tee-publish-and-js-fixes` Phase 02) becomes unblocked

## Open questions (resolved at phase runtime)

- Phase 2: lede `max-width: 60ch` (typography rule) or `max-width: none` on mobile only?
- Phase 4: FB-5 orphan dividers — exact wrapper selectors TBD by grep + DOM inspection
- Phase 5: count pill copy — keep "tees" (brand-specific) or generalize to "products"?
- Phase 5: sort-apply UX — immediate apply on change (current) or batch "Apply filters" button (Dawn convention)?
- Theme Access token: existing one valid, or need re-issue from user before phase deploys?
