---
title: pod-tee mobile section rhythm — reduce 128px gap between PDP sections
description: >-
  Two-phase mobile-only fix for vertical whitespace between PDP sections. Phase
  1 adds a single CSS media query halving section padding on mobile. Phase 2
  audits 3 related-product sections for empty-shell rendering and gates the
  render when content sources are empty.
status: completed
priority: P3
effort: 45-60min
repo: 'D:\github local\pod-tee-theme'
branch: feat/pdp-perf-pareto
blockedBy: []
blocks: []
related:
  - sibling: >-
      plans/260520-1431-pod-tee-sticky-atc-hide-on-drawer-open (sticky-ATC fix —
      also touches dopamiles-pdp.css but different line range, no conflict)
  - source: >-
      plans/260520-1503-pod-tee-mobile-section-rhythm/brainstorm-summary.md
      (design rationale, methods evaluated, scout findings, audit attempt)
  - upstream: >-
      plans/260518-1833-pdp-lighthouse-perf-pareto (content-visibility
      placeholders on same sections — out of scope here, mentioned as red
      herring)
tags:
  - shopify
  - theme
  - pod-tee
  - dopamiles
  - mobile
  - pdp
  - spacing
  - css
  - liquid
created: 2026-05-20T00:00:00.000Z
---

# pod-tee mobile section rhythm — reduce 128px gap between PDP sections

## Overview

Mobile PDP shows cavernous vertical gaps between sections (user screenshot shows ~30% viewport gap between in-hero accordion and next section's eyebrow). Root cause: `.dop-section { padding: 64px 0 }` stacks to 128px between visible content with no mobile breakpoint override. Possibly compounded by empty-shell rendering of related-product sections (`dopamiles-fbt`, `dopamiles-more-from-niche`, `dopamiles-reviews-placeholder`) on PDPs without related products.

Method chosen in [brainstorm-summary.md](./brainstorm-summary.md): single mobile media query (Phase 1) + conditional render gates on empty sections (Phase 2). Desktop unchanged.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Mobile .dop-section padding rule](./phase-01-mobile-dop-section-padding-rule.md) | Completed |
| 2 | [Empty-section render gates](./phase-02-empty-section-render-gates.md) | Completed |

## Dependencies

None. Touches `pod-tee-theme/assets/dopamiles-pdp.css` (Phase 1) and 1-3 files in `pod-tee-theme/sections/` (Phase 2). No conflict with concurrent sticky-ATC plan (260520-1431) which touches the same CSS file at line ~761 (this plan touches ~line 523).

Branch `feat/pdp-perf-pareto` continues from sticky-ATC and bundle-banner-revert commits earlier today.
