---
title: "pod-tee Block-Driven Theme Rebuild — Customization + Publish"
description: "Retrofit 24 hardcoded dopamiles-* sections into block-driven schema with Tier 2 customization (size/spacing/alignment/token-color), via 10 reusable theme blocks. Phased by template. Publish to dopamiles.co at end."
status: pending
priority: P1
effort: 20-33h (across 7 phases)
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: [260511-1132-pod-tee-funnel-reset]
blocks: []
related:
  - brainstorm: plans/reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md
  - emulated-qa: plans/reports/web-testing-260513-2207-pod-tee-emulated-iphone-qa.md
  - predecessor: plans/260511-1132-pod-tee-funnel-reset (this plan absorbs its publish goal)
  - shopify-os2-blocks: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks
tags: [shopify, theme, pod-tee, dopamiles, blocks, theme-editor, customization, publish]
created: 2026-05-13
---

# pod-tee Block-Driven Theme Rebuild

## Goal
Convert hardcoded dopamiles-* sections to block-driven schemas so merchant can customize every page in the Shopify theme editor without touching code. Hybrid model: 10 reusable theme blocks under `blocks/dop-*.liquid` + existing section-specific blocks stay. Publish to dopamiles.co live when retrofit complete.

## Source of truth
- Brainstorm: [`plans/reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md`](../reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md)

## Customization tier (locked)
**Tier 2** — content + size selects + padding/margin sliders + alignment + token-bound color schemes. NO free font/color pickers. NO animations. ~10-15 settings per block.

## Phases

| # | Phase | Effort | Gate |
|---|---|---|---|
| 01 | [Theme-block foundation library (10 blocks/dop-*.liquid)](phase-01-theme-block-foundation-library.md) | 4-6h | Render-test in 1 sample section |
| 02 | [Homepage template (home-hero, manifesto, newsletter + accept @theme on already-blocked)](phase-02-homepage-template.md) | 4-6h | iPhone QA |
| 03 | [PDP template (product-hero, reasons, trust-trio, bundle, 3pack-picker)](phase-03-pdp-template.md) | 3-5h | iPhone QA |
| 04 | [Collection + cart templates](phase-04-collection-cart-templates.md) | 2-4h | iPhone QA |
| 05 | [Misc pages (contact, page, search, blog)](phase-05-misc-pages.md) | 3-5h | spot-check QA |
| 06 | [System pages — DEFERRABLE (404, password, gift-card, customer-*)](phase-06-system-pages-deferrable.md) | 2-3h | low priority |
| 07 | [Publish prep + ship (fix 2 JS bugs + theme swap)](phase-07-publish-prep-and-ship.md) | 2-4h | LIVE |

## Definition of done (publish gate)
- 10 theme blocks live + render correctly in editor
- All non-deferred sections accept theme blocks via @theme declaration
- Merchant can build homepage end-to-end in theme editor without code
- iPhone QA passes per phase
- Theme check: zero new errors vs baseline (11 errors / 38 warnings pre-existing)
- 2 flagged JS bugs fixed (`amount is not defined`, cart-main script-order)
- dopamiles.co live theme is pod-tee; BuildMyPOD retired
- Rollback runbook drafted

## Cross-plan dependency
This plan begins after [`260511-1132-pod-tee-funnel-reset`](../260511-1132-pod-tee-funnel-reset/plan.md) iPhone QA passes (its current sole blocker). Funnel-reset's "publish" goal is absorbed into this plan's Phase 07.

## Halt rule
1 iteration max per phase. Failed iPhone QA → snapshot + halt + scope next iteration. No inline retry.

## Out of scope
- Refactoring existing section blocks (FAQ Q&A, accordion, pillar, review) — they work
- Migrating to a different theme base (still Dawn 15.x)
- Removing or replacing app blocks (Globo, FB Pixel)
- Free font/color pickers, animations, per-breakpoint values (Tier 3 escalation rejected)
- A/B testing block layouts
