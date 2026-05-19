---
title: "PDP Perf Round 2 — Pareto Stack (preconnect + content-visibility + CSS bundle)"
description: "Round-2 polish on PDP Lighthouse perf. 3-step rollout low→high risk: kill unused preconnect, content-visibility on 6 below-fold sections, bundle 7 site-wide CSS files. Halt rule after each step."
status: completed
phasesCompleted: 2
phasesCancelled: 1
completedAt: 2026-05-19T05:50Z
priority: P2
effort: 1-3h
actualEffortMin: 29
repo: D:\github local\pod-tee-theme
branch: feat/pdp-perf-pareto
blockedBy: []
blocks: []
related:
  - brainstorm: plans/260518-1833-pdp-lighthouse-perf-pareto/reports/brainstormer-260519-round-2-pareto-stack.md
  - round-1: plans/260518-1833-pdp-lighthouse-perf-pareto (5-run preview-side median 90/89/89 — closed; this plan is incremental polish)
  - regression-guard: plans/260518-1300-pdp-feature-variant-default (Globo media-order alignment — must not break)
  - downstream: plans/260514-1230-pod-tee-publish-and-js-fixes (publish swap — NOT blocked by this plan; this plan is optional headroom)
tags: [shopify, theme, pod-tee, dopamiles, performance, lighthouse, pdp]
created: 2026-05-19
---

# PDP Perf Round 2 — Pareto Stack

## Overview

Round 1 closed with 5-run preview-side medians **90 / 89 / 89** (lead / mid / edge) and a GREEN real-iPhone gate. Mid + Edge sit 1 pt shy of strict every-PDP 90. User asked "can we improve more?" and shared Lighthouse Insights screenshots.

Brainstorm filtered out the noise (most alarming Lighthouse complaints in those screenshots trace to user's local Chrome extensions, not theme code). True theme-owned levers identified:

1. **Kill unused `fonts.shopifycdn.com` preconnect** — 1-line cut, zero risk.
2. **content-visibility on 6 below-fold sections** — CSS-only, low risk, +1-3 pts plausible.
3. **Bundle 7 site-wide head-loaded CSS files into 1** — +2-4 pts plausible, medium risk (cascade ordering).

Rollout ordered low→high risk. Halt rule after each step: if every-PDP 5-run median ≥ 90, stop.

## Goal

5-run mobile Lighthouse perf median ≥ 90 on **EVERY** PDP individually (strict — not median-of-medians, not average) on lead / mid / edge PDPs against preview theme 158279991548. Zero regression on Globo color-swatch alignment + media-order variant resolution + section-refetch count.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Kill Unused Preconnect](./phase-01-kill-unused-preconnect.md) | 5 min | **Completed 2026-05-19** — theme commit `e9a2bac`. 3-line cut. |
| 2 | [Content-Visibility on Below-Fold](./phase-02-content-visibility-below-fold.md) | 30-40 min | **Completed 2026-05-19** — theme commit `e4ea6d2`. 5-run median 91/91/92. **Halt gate cleared.** |
| 3 | [Bundle Site-wide CSS with Staging Dry-Run](./phase-03-bundle-site-wide-css.md) | 40-90 min | **Cancelled 2026-05-19** — halt rule triggered after P2; medium-risk insurance step not needed. |

## Dependencies

- **Blocks:** None. Publish plan `260514-1230-pod-tee-publish-and-js-fixes` is already unblocked by Round 1's GREEN iPhone gate and can ship independently.
- **Regression guard:** Commits `46755bf` (JS Globo align) + `72c3d7e` (Liquid media-order resolution) + `2976586` (Round-1 L1 preload + srcset) + `b7003ce` (Round-1 quality=75) — all must remain functionally intact.
- **Risk priority (user-set 2026-05-19):** brand visual regress / CSS cascade bugs. Step 3 has explicit safeguards (build script, staging-theme dry-run, Playwright pixel-diff QA on 5 templates × 3 viewports).

## Halt rule

After each phase → run 5-run baseline + regression suite. If every-PDP median ≥ 90 STRICT, stop and skip remaining phases. Don't chain to the next phase "while we're here" — the Pareto discipline from Round 1 holds.

## Out of scope (YAGNI)

- Lead image right-size (real save ~10 KiB on retina; Lead already passes 90 gate).
- Forced-reflow diving in `dopamiles-header.js` (3 ms cost).
- Inline product-hero JS extraction (race-condition risk with `syncVariant`).
- `dopamiles-pdp.css` + `component-product-variant-picker.css` separately gated to product templates — leave separate, smaller blast radius.
- Anything Lighthouse flagged with "Unattributable" / chrome-extension URLs.

## Success criteria (whole plan)

- 5-run mobile Lighthouse perf median **≥ 90 on EVERY PDP individually** (strict) for lead / mid / edge against preview theme 158279991548.
- Core Web Vitals all green (LCP < 2.5 s on mid, others already there; CLS < 0.1; TBT acceptable).
- Globo + media-order regression GREEN (0 changes from current `reports/regression-baseline.json` pattern).
- Step 3 deploy gated by Playwright pixel-diff QA passing on 5 templates × 3 viewports — zero diffs exceeding tolerance.
- All work continues on `pod-tee-theme @ feat/pdp-perf-pareto`.

## Plausible final state

| PDP | Round 1 final | After P1 | After P2 | After P3 |
|---|---:|---:|---:|---:|
| Lead | 90 | 90 | 91-92 | 92-94 |
| Mid | 89 | 89 | 90-91 | 91-93 |
| Edge | 89 | 89 | 90-91 | 91-93 |

Step 2 likely clears the strict gate; Step 3 is insurance + headroom.

## Open questions

- Step 3 staging-theme: CLI clone of 158279991548 via `shopify theme push --unpublished --new`, or manual duplicate via Shopify admin? Defer to phase-03 execution.
- Optional: after preview-side strict gate clears, do a live-side measurement (publish briefly, measure, decide)? Defer to phase-03 close or treat as separate followup.
