---
phase: 3
title: QA + Ship
status: completed
priority: P1
effort: ~30 min
dependencies:
  - 2
---

# Phase 3: QA + Ship

## Overview

Validate the fix across browsers, real iPhone, and Playwright automation. Commit to `feat/bug-fix-sprint`. Update parent sprint's Gate 3 recording script to include a feature-color assertion before publish.

## Requirements

- **Functional:** Verify the fix on Chromium + WebKit (Playwright) + real iPhone Safari (manual). No regression in cart, header search, mobile menu, or other sections that read variant state.
- **Non-functional:** Commit on `feat/bug-fix-sprint`. No merge to main yet — that happens at parent sprint's Gate 4.

## Architecture

```
Playwright assertion (qa/feature-variant-default.mjs)
  ├─ Navigate to preview theme PDP
  ├─ Wait for Globo swatch render
  ├─ Read section.dataset.dopPreferredColor
  ├─ Find Globo swatch with selected-state selector
  ├─ Assert: selected swatch color name (normalized) === preferred color (normalized)
  └─ Run across 3 PDPs (different admin orders)

Real iPhone (manual)
  └─ Existing Gate 3 6-step recording script extended: step 2 (PDP color tap)
     gets a new sub-assertion "feature color highlighted BEFORE tap"
```

## Related Code Files

- **Create:** `D:\github local\crushroom-form\plans\260514-1230-pod-tee-publish-and-js-fixes\qa\feature-variant-default.mjs` (Playwright assertion)
- **Modify (committed):** `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (Phase 02 change)
- **Modify (committed):** `D:\github local\pod-tee-theme\assets\dopamiles-pdp-variant-sync.js` (Phase 02 change)
- **Update:** This plan's `plan.md` status → `completed` when GREEN
- **Update:** `260509-1057-pod-tee-bug-fix-round-2/plan.md` progress note — round-5 micro-fix shipped

## Implementation Steps

1. **Playwright assertion**
   - Create `qa/feature-variant-default.mjs` mirroring the structure of `qa/phase-01.mjs`.
   - Loop over 3 PDPs (chosen to span different admin variant orders — pick from collection-grid product list).
   - For each: wait for Globo present, read `[data-dop-preferred-color]` from section, find selected Globo swatch using Phase 01 selectors, assert normalized match.
   - Run on Chromium + WebKit (iPhone 14 emulation) — both must PASS.
   - Output: PASS/FAIL summary per product per engine.

2. **Run Playwright assertion**
   - `cd D:\github local\pod-tee-theme && node qa/feature-variant-default.mjs`
   - All 6 assertions (3 products × 2 engines) must PASS.
   - If any FAIL: re-open Phase 02, do not proceed.

3. **Regression sweep — existing qa scripts**
   - Run `qa/phase-01.mjs` (the 30-assertion existing suite covering home + PDP + cart + checkout) and confirm 30/30 still PASS.
   - Watch for: any PDP-related assertion now affected by the new attribute or JS branch.

4. **Real iPhone manual check (piggyback on Gate 3 recording)**
   - This work belongs inside the parent sprint's Gate 3 iPhone screen recording session. Do not record a separate one.
   - During Gate 3 step 2 (PDP color tap), add an explicit pre-tap visual check: "feature color X is highlighted before I tap anything".
   - If GREEN on iPhone + Playwright: proceed to commit.
   - If RED on iPhone but GREEN on Playwright: investigate Safari-specific Globo behavior, re-open Phase 02.

5. **Commit**
   - On `feat/bug-fix-sprint` branch in `pod-tee-theme` repo.
   - Single commit covering Liquid + JS + new qa script.
   - Conventional message: `fix(pdp): align Globo swatch to server-resolved feature variant on init`
   - Include the brainstorm path in the commit body for traceability.

6. **Update plan statuses**
   - This plan: `ck plan check 1 && ck plan check 2 && ck plan check 3` (or directly via plan dir).
   - Plan-level status → `completed` (manual frontmatter edit on `plan.md`).
   - `260509-1057-pod-tee-bug-fix-round-2/plan.md` progress note: append "Round-5 micro-fix shipped 2026-05-18 — PDP feature variant default Globo alignment (commit hash)".
   - `260514-1230-pod-tee-publish-and-js-fixes/plan.md` `blockedBy` updated to remove this plan once GREEN.

## Todo List

- [ ] Write `qa/feature-variant-default.mjs`
- [ ] Run Playwright assertion — 6/6 PASS required
- [ ] Run existing `qa/phase-01.mjs` regression — 30/30 PASS required
- [ ] Verify on real iPhone during Gate 3 recording (pre-tap state check)
- [ ] Commit Liquid + JS + qa script to `feat/bug-fix-sprint`
- [ ] Update this plan's frontmatter status → `completed`
- [ ] Update parent sprint plan with shipped note
- [ ] Update publish plan to unblock

## Success Criteria

- [ ] Playwright `feature-variant-default.mjs` — 6/6 PASS (3 products × Chromium + WebKit)
- [ ] Existing `qa/phase-01.mjs` — 30/30 PASS (no regression)
- [ ] Real iPhone Gate 3 recording: feature color highlighted on PDP load BEFORE any tap, across 2+ products
- [ ] Single clean commit on `feat/bug-fix-sprint`
- [ ] This plan + parent sprint + publish plan statuses synced

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Playwright passes, iPhone Safari fails | Real-device gate is authoritative; if RED on iPhone, re-open Phase 02 with Safari-specific debugging |
| New JS introduces silent error in other sections | `qa/phase-01.mjs` 30-assertion regression catches this — must PASS |
| Globo updates its app version mid-test and breaks our selectors | Phase 01 selectors are runtime-discovered; if Globo updates, Phase 01 must be re-run before re-attempting Phase 02 |
| Commit on wrong branch | Verify `git branch --show-current` returns `feat/bug-fix-sprint` before commit |

## Security Considerations

- N/A — purely client-side UX fix, no auth/data surface affected.

## Notes

This phase blocks the parent sprint's Gate 4 (publish swap) — do NOT ship preview theme 158279991548 to live until this is GREEN. Once GREEN, the publish plan `260514-1230-pod-tee-publish-and-js-fixes` becomes unblocked.
