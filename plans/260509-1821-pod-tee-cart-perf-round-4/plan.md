---
title: "pod-tee Cart Perf Round-4 — SLC Drawer-After-Fetch Reset"
description: "Reset after round-3c halt. Revert optimistic UI, apply SLC drawer-after-fetch inversion, fix CLS via min-height, profile actual latency, real-iPhone gate."
status: superseded
priority: P0
effort: 3-4h active + 1h user verification
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint
blockedBy: []
blocks: []
supersededBy: plans/260511-1132-pod-tee-funnel-reset/plan.md
progress: "SUPERSEDED 2026-05-11 by funnel-reset plan — scope widened to include Globo survival + collection card photo. Round-4's cart-perf phases absorbed into funnel-reset phase-02."
related:
  - parent-sprint: plans/260509-1057-pod-tee-bug-fix-round-2/plan.md
  - halted-phase: plans/260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md
  - halt-postmortem: docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md
  - slc-research: plans/reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md
tags: [shopify, theme, dopamiles, cart-performance, perception-reset, ship-blocker]
created: 2026-05-09
---

# pod-tee Cart Perf Round-4

## Goal

Real performance, not faked perception. Apply SLC's drawer-after-fetch ordering. Revert all optimistic UI. Fix R3-1 CLS via space reservation, not visibility tricks. Measure actual latency before optimizing further.

## Why round-4

Round-3a/b/c shipped optimistic UI; user rejected as "fake animation" 2026-05-09 18:03 ICT. SLC competitor research proves a 5-LOC ordering inversion (drawer opens AFTER /cart/add.js returns) gives the "real performance" feel without optimism. Round-4 is the reset.

## Strategy

1. **Phase 01 — Revert** the optimistic helpers + Globo-breaking `[data-dawn-vs]` wrapper. Keep build-tag, error overlay, JSON island (paid off in round-3c).
2. **Phase 02 — Invert** ATC + qty ordering: button-spinner → fetch → swap → open drawer. SLC pattern.
3. **Phase 03 — Reserve** vertical space via `min-height` so neither Dawn nor Globo paint causes reflow. No visibility/display on parents containing 3p-injected DOM.
4. **Phase 04 — Profile** actual cellular latency. Trim only what measurements justify. YAGNI.
5. **Phase 05 — Verify** on real iPhone. Build-tag + error overlay still in place. CLS<0.1, ATC<500ms, qty<500ms.

## Halt rule (carries from round-3c)

Single iteration max per phase. If round-4 verification fails: halt, reset, do not iterate inline. Round-3a/b/c proved fix-on-the-fly invites regression.

## Phases

| # | Phase | Owner | Concern | Effort |
|---|-------|-------|---------|--------|
| 01 | [Revert round-3c perception debt](phase-01-revert-round-3c-perception-debt.md) | code | Remove optimistic helpers + Globo wrapper. Keep observability tools. | ~30 min |
| 02 | [SLC pattern inversion (ATC + qty)](phase-02-slc-pattern-inversion-atc-and-qty.md) | code | Drawer-after-fetch in `bindAddToCartInterceptor`. Button-spinner in qty handler. | ~45 min |
| 03 | [CLS via min-height slot reservation](phase-03-cls-via-min-height-slot-reservation.md) | code | CSS-only space reservation in variant-picker container. Spot-test Globo ON+OFF. | ~45 min |
| 04 | [Latency profile + trim](phase-04-actual-latency-profile-and-trim.md) | code | Measure cellular ms. Trim sections= bundle if larger than SLC. Defer non-critical scripts only if measurements justify. | ~60 min |
| 05 | [Real iPhone verification + publish](phase-05-real-iphone-verification-and-publish.md) | user | Screen recording. Lighthouse mobile. No emulation. | ~60 min user-side |

## Dependencies

- Phase 01 blocks 02-04 (clean baseline before changes)
- Phase 02 + 03 file-disjoint, can run sequentially in either order; recommend 02 first (smaller, higher confidence)
- Phase 04 blocks on 02+03 complete (need clean baseline to measure)
- Phase 05 blocks on all 01-04 + preview deploy + build-tag fresh

## File ownership matrix

| Phase | Files |
|-------|-------|
| 01 | `assets/dopamiles-cart.js` (revert), `sections/dopamiles-product-hero.liquid` (remove `[data-dawn-vs]` wrapper + reveal timer), `assets/dopamiles-cart.css` (remove `.dop-li-optimistic`/`.dop-li-price-pending`/keyframes) |
| 02 | `assets/dopamiles-cart.js` (sole owner — ATC + qty inversion) |
| 03 | `sections/dopamiles-product-hero.liquid` (variant-picker container CSS class), `assets/dopamiles-pdp.css` (`min-height` rules) |
| 04 | `layout/theme.liquid` (script defer/preconnect; edits gated on measurements), `sections/dopamiles-cart-drawer.liquid` (read-only first; possible `sections=` bundle trim in JS) |
| 05 | (no code edits) |

No two phases edit the same file in overlapping passes. Phase 01 fully completes before Phase 02 touches `dopamiles-cart.js` again.

## Out of scope

| Item | Why |
|------|-----|
| Replacing `dopamiles-cart.js` with stock Dawn `cart.js`/`product-form.js`/`cart-drawer.js` | Larger refactor; flagged as Q1. Decide after phase 04 measurements. |
| Switching ATC surface to Dawn `cart-notification` | Q3 — possible follow-up if drawer-after-fetch still feels slow post-phase 04. |
| URL `?variant=` deep-linking | Carry-over out-of-scope from round-2. |

## Open questions (research items for phase 04)

1. **Why does pod-tee have a 599-line custom `dopamiles-cart.js`?** SLC trusts stock Dawn (3 files, ~14KB). What features actually require the custom override (sticky bag count, bundle handling, upsell, custom totals row, shipping bar)? Could we delete it entirely? Defer answer to phase 04 measurement.
2. **Does `/cart/add.js?sections=...` bundle more than 2 sections?** SLC = `[cart-drawer, cart-icon-bubble]`. Verify and trim.
3. **Is Dawn's `cart-notification` (small bubble) a viable ATC feedback surface?** Smaller render = faster swap. Possible follow-up.

## Success criteria

- ATC drawer-open: <500ms drawer-arrives-with-content (real iPhone over cellular)
- Cart qty +/-: <500ms button-spinner→swap (real iPhone over cellular)
- Lighthouse mobile PDP CLS <0.1 with Globo ENABLED AND DISABLED
- 0 optimistic UI helpers in code (`grep injectOptimisticAtcLine|optimisticLineUpdate|dop-li-optimistic|dop-li-price-pending` → 0 hits)
- 0 visibility/display tricks on parents containing Globo-injected DOM (`grep "data-dawn-vs"` → 0 hits)
- Build-tag visible top-right preview, value updated on each deploy
- 0 red error overlays during user screen recording
- Done = observable in user iPhone screen recording. Not "code merged."

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drawer-after-fetch reads as slow despite 5-LOC inversion (user expects sub-300ms) | Med | High | Phase 04 latency profile + targeted trim. If still slow, evaluate cart-notification surface (Q3). Halt rule applies. |
| `min-height` reservation mismatches Globo's actual rendered swatch height | Med | Med | Spot-test BOTH Globo ON (4-color row) and OFF (Dawn variant-selects). Measure each, set min-height to the LARGER. Risk: under-reserve→CLS persists; over-reserve→empty space gap. |
| Phase 04 measurements surface scope creep ("Klaviyo is the bottleneck → defer it → affects analytics → stakeholder convo") | Med | Med | Cap phase 04 effort at 60min. Document findings, don't ship Klaviyo defer in this round if it requires stakeholder ack. |
| Reverting `injectOptimisticAtcLine` regresses something else (e.g. analytics that hooked optimistic event) | Low | Low | Grep for callers before revert. If found, surface in phase 01 unresolved questions. |
| Phase 02 inversion exposes a previously-hidden race (e.g. `applyCartMutation` assumed drawer was open) | Low | Med | Read `applyCartMutation` lines 335-393 carefully in phase 02 step 2; verify it works when drawer is hidden too. |

## Rollback plan

Per-phase `git revert` (1 commit per phase). Phase 01 is itself a revert of round-3c — so rolling back phase 01 = restoring round-3c (which is the rejected state, not desirable). For phases 02-04, single-commit revert restores the post-phase-01 baseline cleanly.

## References

- Round-3c halt journal: [docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md](../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md)
- SLC competitor research: [plans/reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md](../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md)
- Halted round-3c phase plan: [plans/260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md](../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md)
- Parent sprint: [plans/260509-1057-pod-tee-bug-fix-round-2/plan.md](../260509-1057-pod-tee-bug-fix-round-2/plan.md)
