---
phase: 3
title: "Fix Second Bottleneck (Conditional)"
status: pending
priority: P2
effort: "1-4h"
dependencies: [2]
---

# Phase 3: Fix Second Bottleneck (Conditional)

## Overview

<!-- Updated: Validation Session 1 — strict every-PDP halt + auto-cancel by P2 -->

**Conditional phase.** Only runs if P2's after-report says median < 90 on AT LEAST ONE PDP (strict every-PDP rule). Apply ONE more tactical lever to the next-ranked bottleneck from updated traces. Re-measure. Halt when median >= 90 on EVERY PDP individually.

If P2 halted: this phase is **auto-set to `cancelled` by P2** (no user confirmation per validation 2026-05-18) and skipped.

## Requirements

- **Functional:**
  - Apply one additional lever (different from P2) to the next-ranked bottleneck per P2 after-report.
  - Re-run median-of-3 baseline harness.
  - Re-run Globo + media-order regression suite.
  - Produce `p3-after-report.md` with halt verdict.
- **Non-functional:**
  - Same constraints as P2: one lever, theme-side, regression-clean.
  - If after P3 still < 90 on any PDP: reopen scope discussion with user before adding a P3b. **No silent escalation.**

## Architecture

### Lever selection

Read P2's `p2-after-report.md` to identify next bottleneck. Map to lever per P2's selection matrix (L1-L6). Lever chosen here MUST differ from P2's lever (otherwise the same code path is being re-fixed without diagnosis).

If P2's after-report indicates the next bottleneck is one of:
- 3rd-party scripts (Klaviyo, FB Pixel, Globo) → out of theme scope; document, escalate to merchant; do NOT apply a lever. Phase status → `blocked` with reason.
- Already covered by P2's lever (e.g. P2 fixed LCP image, next biggest is still LCP-adjacent) → re-diagnose; if no clear new lever, halt and reopen with user.

### Re-measurement protocol

Identical to P2:
1. Re-run `qa/lighthouse-baseline.mjs` (same 3 PDPs, 3-run median).
2. Append to `baseline-report.md` (delta table now has baseline / post-P2 / post-P3 columns).
3. Run Globo + media-order regression suite.
4. Verdict (strict — every PDP must clear):
   - Median >= 90 on EVERY of the 3 PDPs individually → halt; proceed to P4.
   - Still < 90 on any PDP → stop; do not auto-spawn P3b; surface to user with: which PDP, current score, next bottleneck candidate, recommended scope decision (apply another lever / accept score / pivot strategy).

## Related Code Files

- **Modify (one of, different from P2's choice):** Same touchpoint list as P2 lever matrix.
- **No-touch:** Same regression-protected files as P2.
- **Update:** `baseline-report.md` with post-P3 delta column.

## Implementation Steps

1. If P2 status = `completed` AND P2 verdict = halt: this phase was already auto-cancelled by P2 (no user confirmation required per validation 2026-05-18). Confirm `cancelled` status in frontmatter and exit. Done.
2. Read P2's `p2-after-report.md`. Confirm next bottleneck is a theme-owned lever (not 3rd-party). If 3rd-party: halt + escalate to merchant; mark phase `blocked` with note.
3. Select lever from L1-L6 matrix (must differ from P2's). Read its spec in `phase-02-fix-top-bottleneck.md`.
4. Branch hygiene: confirm on `feat/pdp-perf-pareto`.
5. Implement lever per spec. One lever; resist combo fixes.
6. Commit `perf(pdp): {lever-id} — {short description}`.
7. Deploy to preview theme.
8. Re-run baseline harness; append delta to `baseline-report.md`.
9. Run Globo + media-order regression. Revert + replan on regression.
10. Write `p3-after-report.md` with: lever applied, before/after medians, halt verdict.
11. If verdict = halt: proceed to P4. If not: STOP. Surface to user, do not auto-spawn P3b.

## Success Criteria

- [ ] Either: phase skipped (status `cancelled`) because P2 halted, OR phase completed with one new lever applied.
- [ ] If completed: Globo + media-order regression still GREEN.
- [ ] If completed: `p3-after-report.md` written with halt verdict.
- [ ] If halt = no: user-facing escalation written, no silent P3b started.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Two fixes deployed in quick succession mask each other's effect | P2 deploys + measures BEFORE P3 plans; serial only |
| Next bottleneck is 3rd-party — fix is out of scope | Explicit escalation step; do NOT apply theme-side workaround that hides merchant problem |
| Both fixes ship, score still < 90 on edge PDP | Reopen scope: edge PDP may need its own product-side merchandising fix (fewer variants, smaller images) — escalate, don't keep adding levers |
| Reverting P3 breaks P2 (entangled commits) | One commit per lever; revert is atomic |

## Open questions

- None pre-implementation; P2's report drives decisions.
