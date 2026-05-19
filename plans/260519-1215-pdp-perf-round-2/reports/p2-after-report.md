---
phase: 2
title: "After Phase 02 — content-visibility on below-fold sections"
generatedAt: 2026-05-19T05:50Z
leversApplied: [P1-preconnect-kill, P2-content-visibility]
commits:
  - e9a2bac (P1 preconnect kill — pod-tee-theme feat/pdp-perf-pareto)
  - e4ea6d2 (P2 content-visibility — pod-tee-theme feat/pdp-perf-pareto)
verdict: HALT_GATE_CLEARED (5-run median 91/91/92 — Phase 3 auto-cancelled)
---

# After Phase 02 — content-visibility on below-fold sections

## Verdict

**STRICT EVERY-PDP >= 90 GATE CLEARED.** Phase 3 (CSS bundle) **auto-cancelled** per plan halt rule.

| PDP | Round 1 end | After P1+P2 | Δ | Pass? |
|---|---:|---:|---:|:-:|
| Lead | 90 | **91** | +1 | ✓ |
| Mid | 89 | **91** | +2 | ✓ |
| Edge | 89 | **92** | +3 | ✓ |

## Levers applied

### P1 — Kill unused `fonts.shopifycdn.com` preconnect
Commit: `e9a2bac` on `pod-tee-theme@feat/pdp-perf-pareto`.
- File: `layout/theme.liquid` (3 lines removed including the wrapper `{%- unless -%}`)
- Deployed: 2026-05-19 to preview theme 158279991548
- Verified: curl with cookie jar — `fonts.shopifycdn.com` no longer in head

### P2 — `content-visibility: auto` on 6 below-fold sections
Commit: `e4ea6d2` on `pod-tee-theme@feat/pdp-perf-pareto`.
- File: `assets/dopamiles-pdp.css` (appended 39 lines with per-section rules + comment block)
- Per-section `contain-intrinsic-size` values from real Playwright probe at 412×823 / DPR 1.75:

| Section | Probed height (median) | `contain-intrinsic-size` |
|---|---:|---:|
| dopamiles-fbt | 682 px | 700 px |
| dopamiles-niche-favorites | 403 px | 500 px |
| dopamiles-reasons | 1300 px | 1300 px |
| dopamiles-more-from-niche | 305 px | 400 px |
| dopamiles-reviews-placeholder | 1405 px | 1500 px |
| dopamiles-faqs | 823 px | 900 px |

- Section-height probe output: `reports/section-heights-probe.json` (heights were identical across all 3 PDPs — template-driven static content).
- `dopamiles-product-hero` (above-fold) and `dopamiles-mobile-sticky-atc` (fixed-position) deliberately excluded.

## 5-run median (canonical)

| PDP | Sorted runs | **Median** | LCP | TBT | CLS |
|---|---|---:|---:|---:|---:|
| Lead | 86 / 91 / **91** / 93 / 93 | **91** | 2599 ms | 261 ms | 0.000 |
| Mid  | 85 / 91 / **91** / 91 / 93 | **91** | 2908 ms | 162 ms | 0.004 |
| Edge | 86 / 88 / **92** / 93 / 93 | **92** | 2607 ms | 165 ms | 0.000 |

**Headline shifts vs Round 1 final:**
- TBT dramatically improved on Mid (257 → 162 ms) and Edge (271 → 165 ms) — content-visibility's main win. Below-fold style/layout work falls out of the initial paint window.
- Lead TBT effectively unchanged (276 → 261 ms) — Lead's image is smaller; less below-fold render budget to defer.
- LCP essentially unchanged (already at 2.6 s on Lead/Edge from Round 1). Mid's 2908 ms LCP is still over the 2.5 s target individually, but the 90-perf-score gate is cleared.
- CLS unchanged at 0/0.004/0. The probed `contain-intrinsic-size` values prevented scroll-in jumps.

## Regression baseline (post-P1+P2)

| Handle | Globo aligned | Preferred matches | Section refetches | Verdict |
|---|:-:|:-:|:-:|:-:|
| a-new-chapter-begins | 1 | Black ↔ Black | 0 | PASS |
| this-is-a-5k-right-t-shirt | 1 | Heather Berry ↔ Heather Berry | 0 | PASS |
| 5k-route-t-shirt | 1 | Navy ↔ Navy | 0 | PASS |

**Δ from Round 1 GREEN baseline: 0 changes.** Globo color-swatch alignment + media-order resolution + zero section-refetches all preserved through P1 + P2.

## Cumulative deltas vs original Round 1 baseline (pre-L1)

| PDP | Original | Final post-P2 | Total Δ |
|---|---:|---:|---:|
| Lead | 85 | 91 | **+6** |
| Mid | 71 | 91 | **+20** |
| Edge | 71 | 92 | **+21** |

LCP deltas vs Round 1 original baseline:
- Lead: 3354 → 2599 ms (-755 ms)
- Mid: 5612 → 2908 ms (**-2704 ms**, -48 %)
- Edge: 5152 → 2607 ms (**-2545 ms**, -49 %)

## Phase 3 auto-cancellation

Plan halt rule (round 2):
> After each phase → run 5-run baseline + regression suite. If every-PDP median ≥ 90 STRICT, stop and skip remaining phases.

Every-PDP median ≥ 90 STRICT is true (91 / 91 / 92). Regression GREEN. Phase 3 (CSS bundle + staging-theme dry-run + Playwright pixel-diff QA) — the medium-risk, highest-cascade-risk step — **does not run**.

Round 2 closes at end of Phase 2.

## Files modified

In `pod-tee-theme @ feat/pdp-perf-pareto`:
- `layout/theme.liquid` (P1) — 3 lines deleted
- `assets/dopamiles-pdp.css` (P2) — 39 lines appended

Cumulative theme branch commits since Round 1 start:
- `2976586` Round-1 L1 preload + srcset
- `8b6b377` Round-1 revert of L6
- `b7003ce` Round-1 image quality=75
- `e9a2bac` Round-2 P1 preconnect kill
- `e4ea6d2` Round-2 P2 content-visibility

## Open questions

- Optional live-side measurement: temporarily publish preview theme, re-run 5-run baseline against the (now no-preview-bar) URL. Plausible +3-5 pts per PDP on top of current 91/91/92 → 94-96 across the board. Not required for plan close; deferred to publish swap plan `260514-1230-pod-tee-publish-and-js-fixes` Phase 02.
