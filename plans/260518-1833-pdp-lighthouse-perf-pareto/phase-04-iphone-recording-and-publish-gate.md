---
phase: 4
title: "iPhone Recording and Publish Gate"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 4: iPhone Recording and Publish Gate

## Overview

Real-iPhone screen recording on preview theme to validate that synthetic Lighthouse >= 90 matches perceived speed. Unblocks Phase 02 of `260514-1230-pod-tee-publish-and-js-fixes` (publish swap from BuildMyPOD to pod-tee).

## Requirements

- **Functional:**
  - Record 6-step iPhone flow on preview theme for all 3 PDPs from P1.
  - Confirm no perceived regression vs pre-publish baseline (compare against memory note "real-iPhone screen recording (6-step script)" from pod-tee Gate 3 prep).
  - Confirm Globo color-swatch, ATC, cart drawer, accordions, sticky ATC, variant sync all work.
- **Non-functional:**
  - Real iPhone, not simulator. Cellular or throttled wifi if possible (matches Lighthouse mobile profile in spirit).
  - Recording stored alongside plan as artifact reference.

## Architecture

### 6-step iPhone script

(Lifted from pod-tee Gate 3 prep memory; adjust if user has updated.)

1. Cold-load PDP (clear safari cache first) — observe LCP / first paint.
2. Tap a color swatch (Globo) — observe variant image swap latency.
3. Tap "Add to cart" — observe cart drawer open animation + ATC button state.
4. Open cart drawer, scroll line items — observe cart render perf.
5. Open FAQ accordion below the fold — observe scroll + reveal jank.
6. Switch back to PDP, tap sticky-ATC at bottom — observe sticky-ATC behavior.

### Skip list (intentionally out-of-scope to record)

- Checkout flow (Shopify-hosted, theme cannot influence beyond initial submit).
- Account / login pages.
- 3rd-party app interactions (Klaviyo modal, FB Pixel — not theme-owned).

### Gate decision

After recording on all 3 PDPs:

| Outcome | Action |
|---|---|
| All 6 steps smooth on all 3 PDPs, Lighthouse median >= 90 on EVERY PDP | Mark plan `completed`; unblock `260514-1230-pod-tee-publish-and-js-fixes/phase-02-publish-swap`; notify user gate is green |
| Lighthouse strict-gate green but iPhone feels perceptibly slow on a step | Reopen: which step, capture trace; this is NOT a halt — perception is non-negotiable |
| Lighthouse strict-gate not actually green (any PDP < 90) | Should have been caught in P2/P3 halt check — bug in measurement protocol; reopen |

## Related Code Files

- **Create:** `plans/260518-1833-pdp-lighthouse-perf-pareto/gate-iphone-recording.md` (script + observations + per-step verdict + recording filename pointer).
- **No code modify.**
- **Cross-plan write:** Update `plans/260514-1230-pod-tee-publish-and-js-fixes/plan.md` frontmatter `blockedBy: []` (remove this plan from its blockers) once gate is green.

## Implementation Steps

1. Confirm preview theme reflects all P2/P3 commits — re-run `qa/lighthouse-baseline.mjs` once more for safety; medians match P2/P3 final.
2. On real iPhone, open Safari → load each of 3 PDP URLs in turn.
3. Screen-record (iOS Screen Recording) per the 6-step script.
4. After each PDP recording, write per-step pass/fail/note in `gate-iphone-recording.md`.
5. If any step fails perception: STOP. Surface to user with: which PDP, which step, what failed; do not proceed to publish.
6. If all green:
   - Mark this plan's frontmatter `status: completed`.
   - Edit `plans/260514-1230-pod-tee-publish-and-js-fixes/plan.md` to clear this plan from its `blockedBy`.
   - Notify user: "PDP perf gate green; publish plan is unblocked. Run `/ck:cook plans/260514-1230-pod-tee-publish-and-js-fixes` when ready."

## Success Criteria

- [ ] Recording captured on all 3 PDPs (lead / mid / edge), real iPhone, Safari.
- [ ] `gate-iphone-recording.md` written with per-step verdict for each PDP.
- [ ] All 6 steps green on all 3 PDPs OR explicit user-surfaced failure (no auto-pass).
- [ ] Globo color switch verified working on iPhone (not just Lighthouse).
- [ ] If green: downstream publish plan's `blockedBy` cleared; user notified.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Lighthouse green, iPhone slow → publish blocked late in cycle | Gate 4 is the LAST defense — accept the late catch; it's why this gate exists |
| iPhone unavailable / device variance | Use the same physical device used for prior pod-tee Gate 3 prep for comparability |
| Safari caches preview theme aggressively across runs | Cold-load each PDP: settings → Safari → clear history & data before each run |
| Tester is also reviewer (single-dev) — perception bias | Compare against BuildMyPOD-on-prod feel (pre-publish baseline); if pod-tee feels worse, that's a fail regardless of synthetic |

## Open questions

- Confirm the 6-step script vs whatever the user last recorded for Gate 3 prep — if they updated it, use the updated version.
