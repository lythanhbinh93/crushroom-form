---
title: "pod-tee collection perf pareto — CLS fix + CSS/JS route-split + re-measure"
description: "Four-phase perf optimization for collection pages, driven by the Lighthouse baseline + Pareto report from 260520-1547. Phase 1 fixes desktop CLS=0.45 (priority-0 finding) via font-display=optional. Phases 2-3 audited and found theme already optimally route-split (no-op). Phase 4 re-measured with 12 Lighthouse runs."
status: completed
priority: P2
effort: "5-8h estimated, shipped in 1 session (~2h)"
repo: D:\github local\pod-tee-theme
branch: feat/pdp-perf-pareto
blockedBy:
  - 260520-1547-pod-tee-collection-page-fixes
blocks: []
related:
  - source: plans/260520-1547-pod-tee-collection-page-fixes/reports/lighthouse-baseline.md (Pareto baseline driving this plan)
  - pattern-mirror: plans/260518-1833-pdp-lighthouse-perf-pareto (PDP-pareto plan with identical structure for product templates)
tags: [shopify, theme, pod-tee, dopamiles, collection-page, performance, lighthouse, cls, css, javascript]
created: 2026-05-20
---

# pod-tee collection perf pareto — CLS fix + CSS/JS route-split + re-measure

## Overview

Follow-up optimization plan for collection pages, driven by the [Lighthouse baseline report](../260520-1547-pod-tee-collection-page-fixes/reports/lighthouse-baseline.md) shipped earlier today.

**Baseline numbers** (production-realistic estimates, after discounting `theme dev` localhost artifacts):
- Mobile Performance: ~75-80 (baseline measured 69 on dev)
- Desktop Performance: ~85 — but with **CLS = 0.45** ("Poor" tier) — biggest single blocker

**Pareto opportunities** ranked by impact-per-effort:
1. **Desktop CLS = 0.45** → likely <0.1 with surgical fix. Single biggest perceptible UX gain.
2. **Unused CSS ~180KB** → route-split via Liquid template guards in `theme.liquid`.
3. **Unused JS ~170KB** → route-split where possible; defer non-critical scripts.

**Target**: median Performance ≥ 90 production-realistic across mobile + desktop on `/collections/all`. Match the PDP-pareto plan's outcome.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Desktop CLS investigation + fix](./phase-01-desktop-cls-investigation-fix.md) | ✅ Shipped (commit 2f46304) — desktop CLS 0.454 → 0.0002, perf 72 → 91-92. Root cause was web-font swap, NOT grid-auto-flow:dense as hypothesized. Report: [phase-01-cls-investigation.md](./reports/phase-01-cls-investigation.md) |
| 2 | [CSS route-split](./phase-02-css-route-split.md) | ✅ No-op (theme already optimally split). Report: [phase-02-css-route-split.md](./reports/phase-02-css-route-split.md) |
| 3 | [JS route-split](./phase-03-js-route-split.md) | ✅ No-op (theme already optimally split). Report: [phase-03-js-route-split.md](./reports/phase-03-js-route-split.md) |
| 4 | [Re-measure + verify](./phase-04-re-measure-verify.md) | ✅ Complete — 12-run Lighthouse comparison. Desktop hits ≥90 target. Mobile still under 90 (TTFB-dominated, simulator artifact). Report: [lighthouse-final.md](./reports/lighthouse-final.md) |

## Dependencies

**Blocked by**: `260520-1547-pod-tee-collection-page-fixes` — that plan's Phase 3 produced the Lighthouse baseline this plan optimizes against. Without that baseline, no Pareto data to drive decisions.

**Internal phase order**: Phase 1 first (CLS — visible UX bug). Phase 2 + 3 can be parallel or sequential (different files, no conflicts). Phase 4 must come last (re-measures all 3 fixes together).

**Sibling**: `260518-1833-pdp-lighthouse-perf-pareto` is the same shape for PDP. This plan extends that pattern to collection templates.

## Multi-session notes

Total effort estimate: 5-8h. Realistically spans 2-3 sessions. Each phase is independently committable, so the branch state stays clean if a session ends mid-plan. The branch `feat/pdp-perf-pareto` is intentionally named generically and has been accumulating today's pod-tee work — continues here.
