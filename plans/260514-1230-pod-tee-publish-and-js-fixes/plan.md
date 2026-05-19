---
title: "pod-tee Publish Prep + 2 JS Bug Fixes"
description: "Fix 2 known JS bugs (amount-not-defined, cart-main script-order) then swap dopamiles.co live theme from BuildMyPOD to pod-tee. Extracted from the cancelled block-driven rebuild's Phase 07."
status: phase-01-done-phase-02-deferred
phase01: complete (2026-05-19 — auto-cleared, QA 30/30 PASS, 0 pageerrors; no code change needed; bugs resolved indirectly by bug-fix-sprint round 2 + recent perf rounds)
phase02: awaiting-user-publish (user picked: publish via admin manually, defer timing)
priority: P1
effort: 2-4h
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: [260519-1410-pod-tee-ux-revisions-pre-publish]
reblockedAt: 2026-05-19T14:15Z
reblockedReason: "user paused Phase 02 publish swap to iterate on UX/UI feedback before going live. 10 items / 5 patterns / 5 phases — see plans/260519-1410-pod-tee-ux-revisions-pre-publish. Publish unblocks after that plan ships to preview and visual smoke passes."
priorUnblockedAt: 2026-05-19T04:35Z
priorUnblockedReason: "260518-1833-pdp-lighthouse-perf-pareto Phase 04 iPhone gate green; 5-run preview-side median 90/89/89, real-device perception clean"
blocks: []
related:
  - predecessor: plans/260513-2248-pod-tee-block-driven-theme-rebuild (cancelled 2026-05-14; theme repo reverted to pre-Phase-01; phase-07 work extracted here)
  - qa-pipeline: plans/260514-1230-pod-tee-publish-and-js-fixes/qa/ (relocated from cancelled predecessor)
  - prereq-fix-shipped: plans/260518-1300-pdp-feature-variant-default (PDP wrong-color bug fixed 2026-05-18 — Globo swatch alignment; Playwright GREEN, iPhone real-device deferred to Gate 3)
  - blocker: plans/260518-1833-pdp-lighthouse-perf-pareto (Phase 02 publish swap waits on median-of-3 Lighthouse >=90 + iPhone gate)
tags: [shopify, theme, pod-tee, dopamiles, publish, bug-fix]
created: 2026-05-14
---

# pod-tee Publish Prep + 2 JS Bug Fixes

## Goal
Two deliverables:
1. **Fix 2 known JS bugs** that emit pageerrors on the live theme baseline (preserved across Phases 01-02 of the now-cancelled block-driven rebuild plan).
2. **Swap dopamiles.co live theme** from `BuildMyPOD - Spirituality v1.1.4` to `dopamiles-bundle-prod-260508` (pod-tee-theme, currently preview theme 158279991548). Retire BuildMyPOD.

## Context
The block-driven rebuild plan (260513-2248) was cancelled 2026-05-14 after Phase 02 revealed that generic Tier 2 block styling cannot match section-specific brand aesthetics. The pod-tee-theme is feature-complete and brand-correct in its current settings-driven state — it just needs the 2 JS bugs fixed before going live.

## Two JS bugs to fix

### Bug A — `amount is not defined` (×1 baseline pageerror)
- **Where:** Homepage JS (likely Shopify formatMoney polyfill or PDP variant price formatter)
- **Engine phrasings:**
  - V8 (Chromium): `"amount is not defined"`
  - JSC (WebKit/Safari): `"Can't find variable: amount"`
- **Hypothesis (from prior debugging):** `Shopify.formatMoney` evaluated without an `amount` variable in scope. Likely a `with`-block fallback or a price-formatter shim that doesn't define `amount` upfront.
- **Tracking:** Surfaced in Phase 01 QA baseline. Documented in `qa/lib/assertions.mjs` BASELINE_PAGEERROR_PATTERNS.

### Bug B — cart-main script-order duplicate
- **Where:** Cart drawer JS (Phase 05 work from funnel-reset; partially fixed but residual duplicate console warning)
- **Symptom:** Cart-main script tag rendered twice in some templates → "duplicate cart-main initialization" warning.
- **Hypothesis:** Script-tag inclusion in `dopamiles-cart-line-item.liquid` snippet (since deprecated) and `dopamiles-cart.js` both render. Or section-vs-snippet competing inclusion.

## Phases

| # | Phase | Effort | Gate |
|---|---|---|---|
| 01 | Bug A + Bug B fixes | 1-2h | **Complete 2026-05-19** — auto-cleared. QA 30/30 PASS, 0 pageerrors. No code change; bugs resolved indirectly. See `reports/phase-01-close-and-rollback-runbook.md`. |
| 02 | Publish swap: pod-tee → live | 1-2h | **Awaiting user.** Method: admin UI (user-chosen). Timing: deferred. Rollback runbook drafted. |

## Definition of done (publish gate)
- `node qa/phase-01.mjs` (from parent plan's qa pipeline) returns zero pageerrors across all 4 viewports
- Optional: Codex code review on uncommitted changes (per parent plan's risk-acceptance posture)
- dopamiles.co live theme is `dopamiles-bundle-prod-260508` (was 158279991548 on preview)
- BuildMyPOD theme archived (NOT deleted — kept for rollback)
- Rollback runbook documents 1-click theme swap back to BuildMyPOD
- Optional: 5-min real-iPhone spot-check on live before retiring BuildMyPOD (user discretion)

## QA pipeline
Reuses the now-relocated `qa/` infrastructure (moved here from the cancelled predecessor):
- `qa/phase-01.mjs` — homepage baseline (still authoritative for "current preview = correct theme")
- `qa/phase-02.mjs` — stale artifact from cancelled plan; can be deleted or repurposed
- `qa/lib/*` — Playwright + WebKit, dual-engine baselines, severity tiers
- Run: `cd plans/260514-1230-pod-tee-publish-and-js-fixes/qa && node phase-01.mjs`
- Expected post-revert baseline: 30/30 PASS (theme back to pre-Phase-01 state; pageerrors = 1 baseline)
- After JS bug fix: gate on **zero pageerrors** (baseline 1 → 0)

## Out of scope
- Block-driven theme rebuild (cancelled)
- Visual changes to dopamiles.co rendering (no styling work)
- Migration of merchant content (settings stay; only fixes 2 JS bugs and swaps live theme)
- A/B testing post-publish (separate concern)

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Live theme swap surfaces a bug only visible in production (not preview) | Medium | Keep BuildMyPOD as 1-click rollback; spot-check after swap |
| Fix introduces new pageerrors | Medium | Run qa/phase-01.mjs before AND after fix; gate on zero new |
| `Shopify.formatMoney` is used by 3rd-party app code (Globo, FB Pixel) | Medium | Don't remove the global — patch the `amount` scope issue only |
| Bug A is intermittent, fix unverifiable | Low | Multiple QA runs to establish steady state (lesson from CF cache variance investigation 2026-05-14) |
