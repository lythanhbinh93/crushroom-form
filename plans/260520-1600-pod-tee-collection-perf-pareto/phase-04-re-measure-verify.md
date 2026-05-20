---
phase: 4
title: "Re-measure + verify"
status: pending
priority: P2
effort: "30-60min"
dependencies: [1, 2, 3]
---

# Phase 4: Re-measure + verify

## Overview

Re-run Lighthouse using the same methodology as the [Phase 3 baseline](../260520-1547-pod-tee-collection-page-fixes/reports/lighthouse-baseline.md). Compare per-metric pre vs post for each URL × viewport. Verify median Performance ≥ 90 production-realistic OR document why the target wasn't met and what's left to do.

## Requirements

**Functional**
- Same 2-3 URLs as baseline (`/collections/all`, `/collections/bundle-eligible`, optionally a third)
- Same 2 viewports (mobile 412×823, desktop 1366×768)
- Same tooling: `shopify theme dev` + `npx lighthouse@13.3.0` + `--throttling-method=simulate`
- 3 runs per URL × viewport (not 1) for better median accuracy now that we have something to verify

**Non-functional**
- Report file at `plans/260520-1600-pod-tee-collection-perf-pareto/reports/lighthouse-final.md`
- Comparison table: each metric pre vs post for each URL × viewport
- Acceptance gate: median Performance ≥ 90 production-realistic (subtract ~5pts for dev-server unminified artifacts → real-world target ≥85 measured on `theme dev`)
- If target met: report concludes "ship to live theme"
- If target not met: report documents remaining bottlenecks + recommends next-iteration plan

## Architecture

Re-uses the exact methodology from baseline:
1. Start `shopify theme dev` against post-fix working tree
2. 3 Lighthouse runs per URL × viewport via `npx lighthouse`
3. Compute medians
4. Compare to baseline numbers (per-metric delta)
5. Generate Pareto comparison: which fixes delivered what gains
6. Write final report

## Related Code Files

**Create**
- `plans/260520-1600-pod-tee-collection-perf-pareto/reports/lighthouse-final.md` — comparison report
- `plans/260520-1600-pod-tee-collection-perf-pareto/reports/raw/` — raw Lighthouse JSON (post-fix)

**Modify**
- None.

**Read for context (no edit)**
- `plans/260520-1547-pod-tee-collection-page-fixes/reports/lighthouse-baseline.md` — baseline numbers
- `plans/260520-1547-pod-tee-collection-page-fixes/reports/raw/*.json` — raw baseline data

## Implementation Steps

1. **Confirm Phases 1-3 are merged into the working tree.** Check git log on `feat/pdp-perf-pareto`.

2. **Start `shopify theme dev`** in pod-tee-theme working dir.

3. **Wait for dev server ready** (poll `http://127.0.0.1:9292/`).

4. **For each URL × viewport (mobile/desktop), run Lighthouse 3 times**:
   ```bash
   cd plans/260520-1600-pod-tee-collection-perf-pareto/reports/raw
   for i in 1 2 3; do
     npx lighthouse "http://127.0.0.1:9292/collections/all" \
       --emulated-form-factor=mobile \
       --throttling-method=simulate \
       --output=json \
       --output-path=./final-all-mobile-$i.json \
       --quiet \
       --chrome-flags="--headless --disable-gpu --no-sandbox" \
       --only-categories=performance
   done
   # Repeat for desktop with --preset=desktop
   # Repeat for /collections/bundle-eligible
   ```

5. **Compute medians** (and IQR / variance if useful) across the 3 runs per URL × viewport.

6. **Write `lighthouse-final.md`** with:
   - **Setup**: date, branch (with commit SHA), URLs, methodology
   - **Comparison table**: pre (baseline) vs post (final) for Performance / LCP / TBT / CLS / SI / FCP / Total KB. Show absolute deltas + % change
   - **Per-phase contribution analysis**: which phase delivered which gains (rough attribution based on Pareto report's prediction)
   - **Pass/fail vs ≥90 target**: clear yes/no per URL × viewport, with caveat about dev-vs-prod artifact
   - **Recommendations**: if target met → "ship and monitor"; if not met → "next-iteration plan focuses on [specific bottleneck]"

7. **Stop dev server**.

8. **(Optional)** Post a summary to the parent plan's overview linking to this report.

## Success Criteria

- [ ] `reports/lighthouse-final.md` exists.
- [ ] 2 URLs × 2 viewports × 3 runs measured (12 total runs).
- [ ] Comparison table populated with pre / post / delta / % for every metric.
- [ ] Pass/fail clearly stated per URL × viewport against the ≥90 target.
- [ ] If pass: report recommends "ship to live theme".
- [ ] If fail: report identifies remaining bottlenecks + recommends next-iteration plan (specific, not vague).
- [ ] NO code changes in this phase.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| One of Phases 1-3 introduced a regression visible only in re-measurement | Med | Phase 4 fails; loop back to debug | Per-phase Lighthouse run during cook would have caught it; isolate which phase regressed |
| 3-run median still has noise > 5pts on Performance score | Low-Med | Pass/fail near boundary is ambiguous | Extend to 5 runs if variance > 5pts; or run on multiple days |
| Target ≥90 not achievable due to Shopify-CDN-injected scripts (Hotjar, Klaviyo) outside theme control | Med | Plan "fails" target by no fault of theme work | Document clearly; recommend live-theme RUM as the real-world score |
| Phase 1 fixed CLS but introduced a Performance score regression (e.g., aspect-ratio reservation increased CSS payload) | Low | Net Performance moves backward | Per-phase Lighthouse check would catch; iterate |
| Dev server instability (port conflict, slow start) blocks re-measurement | Low | Phase delayed | Standard tooling; restart if needed |

## Out of scope

- Re-running PDP Lighthouse (separate scope — already done in 260518-1833 plan)
- Production CDN measurement (`theme dev` numbers are sufficient for relative-improvement verification)
- Cross-browser perf (Lighthouse uses Chromium only)
