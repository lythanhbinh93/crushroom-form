---
title: "PDP Lighthouse Performance — Pareto Waterfall to >=90 Mobile"
description: "Diagnose-then-fix PDP mobile perf via median-of-3 Lighthouse runs. Halt at >=90. Blocks pod-tee publish swap."
status: in-progress
phasesCompleted: 3
phasesActive: [4]
priority: P1
effort: 6-12h
repo: D:\github local\pod-tee-theme
branch: feat/pdp-perf-pareto
blockedBy: []
unblockedAt: 2026-05-18T12:11Z
unblockedReason: "reviews-app (Judge.me) confirmed live on preview theme 158279991548"
blocks: [260514-1230-pod-tee-publish-and-js-fixes]
related:
  - brainstorm: plans/reports/brainstormer-260518-1755-pdp-lighthouse-perf.md
  - predecessor-perf: plans/260511-1132-pod-tee-funnel-reset/phase-08-perf-pass.md (shipped 2026-05-11; no re-measurement after)
  - downstream: plans/260514-1230-pod-tee-publish-and-js-fixes (Phase 02 publish swap waits on >=90 gate)
  - regression-guard: plans/260518-1300-pdp-feature-variant-default (Globo media-order alignment — must not break)
  - upstream-blocker: "real reviews app (Judge.me / Loox / Yotpo) install — decided 2026-05-18 validation; reviews app ships BEFORE publish; measuring with dopamiles-reviews-placeholder would be wasted work since reviews-app scripts dominate the trace"
tags: [shopify, theme, pod-tee, dopamiles, performance, lighthouse, pdp]
created: 2026-05-18
---

# PDP Lighthouse Performance — Pareto Waterfall to >=90 Mobile

## Overview

Pareto waterfall: measure first, fix one bottleneck, re-measure, halt at median-of-3 Lighthouse mobile perf >= 90 on 3 representative PDPs. Phase-08 (260511) shipped slim variant JSON / font swap / conditional CSS / head-gated PDP CSS but never re-measured — current score is unknown. Cheapest plausible outcome: phase-08 already cleared 90 and only P1 runs.

## Goal

Mobile Lighthouse perf category **>= 90 on EVERY PDP individually** (strict — not median-of-medians, not average) for 3 PDPs (lead / mid / edge-variant-count), validated by:
1. Median-of-3 Lighthouse runs per PDP on preview theme.
2. Real-iPhone screen recording at Gate 4 (publish gate).
3. Globo color-swatch alignment + media-order variant resolution regression-clean.

## Sequencing constraint (validation-locked)

**Do not start P1 until the real reviews app (Judge.me / Loox / Yotpo) is installed and live on the preview theme.** Validation session 2026-05-18 confirmed reviews app ships BEFORE publish. Reviews-app scripts will dominate the trace; baselining against `dopamiles-reviews-placeholder` would invalidate every subsequent measurement.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Baseline and Diagnosis](./phase-01-baseline-and-diagnosis.md) | 2-3h | **Completed 2026-05-18** — median 85/71/71, P2 needed, lever L1 |
| 2 | [Fix Top Bottleneck](./phase-02-fix-top-bottleneck.md) | 1-4h | **Completed 2026-05-19** — L1 (preload+srcset, commit 2976586). Δ +5/+15/+18 → median 90/86/89. Lead passes, mid+edge under gate. P3 needed. |
| 3 | [Fix Second Bottleneck (Conditional)](./phase-03-fix-second-bottleneck-conditional.md) | 1-4h | **Completed 2026-05-19** — L6 attempted+reverted (no perf gain, real visual regress); image-quality=75 kept (b7003ce). 5-run median 90/89/89. Mid+edge 1pt shy. |
| 4 | [iPhone Recording and Publish Gate](./phase-04-iphone-recording-and-publish-gate.md) | 1h | **Active** — proceeding despite preview-side mid+edge=89, because 262 KB preview-bar removes on live (plausible +3-5 pt lift). Awaiting user iPhone recording. |

## Dependencies

- **Blocks:** `260514-1230-pod-tee-publish-and-js-fixes` Phase 02 (publish swap) — must not swap to live until median Lighthouse >= 90.
- **Regression guard:** Commits `46755bf` (JS Globo align) + `72c3d7e` (Liquid media-order resolution) — every fix MUST preserve PDP variant default = `media[0]`'s variant.
- **Inherits:** Phase-08 perf work (slim variant JSON, font swap, head-gated PDP CSS) is already shipped — do not undo.

## Out of scope (YAGNI)

- Site-wide perf outside PDP (home, cart, collection).
- Bundler / PostCSS pipeline.
- Lighthouse CI in GH Actions.
- Refactoring Globo, variant-picker, or media-order variant resolution.
- "Shopify perf checklist" blanket application — only what diagnosis justifies.

## Success criteria (whole plan)

- Median-of-3 mobile Lighthouse perf **>= 90 on EVERY PDP individually** (lead / mid / edge). Strict — averaging or median-of-medians is NOT a pass.
- Core Web Vitals all green: LCP < 2.5s, CLS < 0.1, TBT acceptable.
- Globo Color Swatches still aligns to media-order default — 260518 regression test GREEN.
- Real iPhone screen recording shows no perceived regression vs pre-publish baseline.
- ATC, cart drawer, accordions, sticky ATC, variant sync all functional post-fix.
- Baseline + all fix measurements taken AFTER reviews app install (no `dopamiles-reviews-placeholder` measurements count toward gate).

## Halt rule

After every fix phase, run P1 measurement harness. **If median >= 90 on EVERY of the 3 PDPs (strict), auto-cancel remaining fix phases and jump to Phase 04.** No user confirmation required for the halt — P2's after-report is enough. Cheapest possible: phase-08 already cleared it → only P1 runs → auto-cancel P2/P3 → publish gate.

## Validation Log

### Session 1 — 2026-05-18
**Trigger:** `/ck:plan validate` after plan creation
**Questions asked:** 4
**Verification tier:** Standard (4 phases — Fact Checker + Contract Verifier, ~12 claims)

#### Verification Results
- **Tier:** Standard
- **Claims checked:** 12
- **Verified:** 11 | **Failed:** 1 | **Unverified:** 0 (after corrections)

##### Failures (corrected inline)
1. [Fact Checker] Phase-02 L5 cited `snippets/dopamiles-fonts.liquid` — **does not exist**. Actual font URL location: `layout/theme.liquid:86-106` (inline `<link>` with `media="print" onload` swap). **Fix applied:** Phase-02 L5 touchpoint corrected to `layout/theme.liquid:86-106`.
2. [Fact Checker] Phase-02 L4 cited "10 small head-loaded CSS files" — **actual count is 7 site-wide dopamiles CSS + 1 PDP-conditional + 1 inline-rendered tokens snippet (not bundleable)**. **Fix applied:** Phase-02 L4 spec corrected with exact file list and line numbers from `layout/theme.liquid`.

##### Verified (sample)
- `qa/perf-probe-feature-variant.mjs` exists at expected path
- `layout/theme.liquid`, `assets/dopamiles-pdp.css`, `assets/dopamiles-pdp-variant-sync.js`, `snippets/dopamiles-gallery.liquid`, `sections/dopamiles-product-hero.liquid` all present
- `templates/product.json` confirms exactly 8 sections in expected order
- Commits `46755bf` (Globo align) + `72c3d7e` (media-order resolution) present in pod-tee-theme repo

#### Questions & Answers

1. **[Scope]** P1 needs 3 representative PDPs (lead / mid / edge-variants). Pick the edge PDP.
   - Options: Auto-pick highest-variant product in P1 | I will specify the handle now | Skip — only run lead + mid
   - **Answer:** Auto-pick highest-variant product in P1
   - **Rationale:** Lowest manual coordination; P1 script handles selection + documents criteria; user retains ability to override in baseline-report.md if pick is wrong.

2. **[Architecture]** Halt threshold: "median Lighthouse perf >= 90" measured how across the 3 PDPs?
   - Options: EVERY PDP's median >= 90 | MEDIAN of 3 PDP medians >= 90 | AVERAGE of 3 PDP medians >= 90
   - **Answer:** EVERY PDP's median >= 90 (strict)
   - **Rationale:** Strict gate prevents edge-PDP from masquerading as passing via averaging; matches success-criteria intent that publish ships with all PDPs healthy.

3. **[Assumption / Sequencing]** Is `dopamiles-reviews-placeholder` being replaced by a real reviews app before publish?
   - Options: No — placeholder stays | Yes — real app BEFORE publish | Yes — real app AFTER publish
   - **Answer:** Yes — real app comes BEFORE publish
   - **Rationale:** Materially changes plan ordering. Reviews-app scripts will dominate the trace; baselining against placeholder = wasted work. Plan now `blockedBy: [reviews-app-install]`; P1 gate-checks reviews-app live state before measuring.

4. **[Risk / Workflow]** When P2 halts, should P3 auto-cancel or require user confirmation?
   - Options: Auto-cancel + jump to P4 | Surface to user — confirm before skipping
   - **Answer:** Auto-cancel P3 + jump to P4
   - **Rationale:** Pareto intent honored without per-phase user gate; user still sees outcome at P4 publish gate.

#### Confirmed Decisions
- Edge PDP: auto-pick at P1 runtime by max `variants.count`
- Halt: strict, every PDP individually >= 90 — no averaging
- Plan blocks on reviews-app install (new upstream blocker)
- P3 auto-cancels when P2 halts; no user confirmation

#### Impact on Phases
- **Phase 01:** Added reviews-app gate as Step 0; edge-PDP auto-pick as Step 1; success criteria expanded; open questions resolved.
- **Phase 02:** L4 spec corrected (file list); L5 path corrected; re-measurement protocol clarifies strict every-PDP halt + auto-cancel P3.
- **Phase 03:** Overview + Step 1 + Verdict updated to reflect strict halt + auto-cancel by P2.
- **Phase 04:** Unchanged (already correct).

#### Action Items
- [ ] None remaining — all corrections applied inline.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-baseline-and-diagnosis.md, phase-02-fix-top-bottleneck.md, phase-03-fix-second-bottleneck-conditional.md, phase-04-iphone-recording-and-publish-gate.md
- Decision deltas checked: 4 (reviews-app blocker, strict halt, auto-cancel P3, edge auto-pick)
- Reconciled stale references: 5 (Phase-01 overview, Phase-01 PDP table, Phase-01 implementation steps, Phase-01 success criteria, Phase-02/03 halt phrasing)
- Path corrections applied: 2 (L5 font snippet → theme.liquid:86-106; L4 file count → 7 + 1 with line numbers)
- Unresolved contradictions: 0
