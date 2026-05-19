---
phase: 3
title: "After Phase 03 — image quality=75 + L6 attempt (reverted)"
generatedAt: 2026-05-19T04:24:00Z
leversApplied: [image-quality=75]
leversReverted: [L6 Inter drop]
commits:
  - 2976586 (L1 preload + srcset — kept)
  - c928dd7 (L6 Inter drop — REVERTED)
  - 8b6b377 (revert of c928dd7)
  - b7003ce (image quality=75 — kept)
verdict: PHASE_04_PUBLISH_SIDE_VALIDATE (mid+edge medians 89, 1pt shy strict gate; preview-bar overhead likely covers gap on live)
---

# After Phase 03 — image quality=75 + L6 attempt (reverted)

## What was tried

### L6 — Drop Inter from Google Fonts (REVERTED)

Commit `c928dd7`. Dropped Inter family from Google Fonts URL, leaving theme `--dop-sans` to cascade through `ui-sans-serif` / `system-ui` / `sans-serif`.

**Result: no perf gain.** Font wire weight dropped from 318 KB → 270 KB (-48 KB confirmed), but the perf scores moved within measurement noise — Lead 90→91, Mid 86→84, Edge 89→88. The phase-08 font-swap trick (`media="print" onload="this.media='all'"`) already removed Inter from the critical render path, so saving the bytes didn't translate to score.

Visual regression was real (377 weight references render in system fonts), so the trade was a real fidelity loss for zero perf gain. Reverted in commit `8b6b377`.

**Lesson:** font payload audits aren't worth pursuing when the swap trick has already cleared the critical path. Bytes savings without time-on-critical-path savings produce no score movement.

### Image quality=75 refinement of L1 (KEPT)

Commit `b7003ce`. Added `quality: 75` to all `image_url` filters in the preload + gallery img src + srcset variants. Shopify CDN re-renders the WebP at lower quality (default is ~90).

**Result: real bytes savings + real LCP improvement on Mid.**

| PDP | Original img bytes | Post-L1 (800w) | Post-quality=75 | Save vs original |
|---|---:|---:|---:|---:|
| Lead | 54 KB | ~54 KB | **31 KB** | -43% |
| Mid | 263 KB | ~150 KB | **88 KB** | -67% |
| Edge | 174 KB | ~70 KB | **52 KB** | -70% |

| PDP | LCP after L1 only | LCP after quality=75 | Δ |
|---|---:|---:|---:|
| Lead | 2597 ms | 2602 ms | +5 ms (noise) |
| Mid | 3207 ms | **2904 ms** | **-303 ms** |
| Edge | 2600 ms | 2597 ms | -3 ms (noise) |

Mid was the only PDP whose hero was heavy enough for the quality cut to surface. Lead/Edge images were already small post-srcset.

## Final 5-run median (canonical statistics)

Re-ran the baseline harness with `--runs=5` to neutralize 3-run cold-start variance (run-1 was consistently 65–69 across sessions; with 5 consecutive runs the cold socket warms by run 2 and subsequent runs cluster tight).

| PDP | Sorted runs | **5-run median** | LCP | TBT | CLS | FCP |
|---|---|---:|---:|---:|---:|---:|
| Lead | 86 / 89 / **90** / 90 / 91 | **90** ✓ | 2602 ms | 276 ms | 0.006 | 1462 ms |
| Mid  | 86 / 89 / **89** / 90 / 90 | **89** | 2904 ms | 257 ms | 0.004 | 1254 ms |
| Edge | 88 / 88 / **89** / 90 / 91 | **89** | 2597 ms | 271 ms | 0.000 | 1254 ms |

**Strict every-PDP-medium-of-5 >=90: still FAIL on Mid and Edge.** Reproducible — not noise.

**Spread analysis:**
- Lead's spread is 86–91 (5 pts). Max run hits 91.
- Mid's spread is 86–90 (4 pts). Max run hits 90.
- Edge's spread is 88–91 (3 pts). Max run hits 91.

Every PDP individually achieves 90+ on at least one of 5 runs. The median is just under 90 for Mid and Edge. The signal is: PDPs sit ~89, with normal LH variance making 90+ possible roughly half the time.

## Regression baseline (post-quality=75)

| Handle | Globo aligned | Preferred matches checked | Section refetches | Verdict |
|---|:-:|:-:|:-:|:-:|
| a-new-chapter-begins | 1 | Black ↔ Black | 0 | PASS |
| this-is-a-5k-right-t-shirt | 1 | Heather Berry ↔ Heather Berry | 0 | PASS |
| 5k-route-t-shirt | 1 | Navy ↔ Navy | 0 | PASS |

quality=75 did not break Globo / media-order / section-refetch behavior. The image-URL change is transparent to JS — Globo's color-swap is display-toggle on pre-rendered slides, not src mutation.

## Cumulative perf delta vs original baseline

| PDP | Original median | Final median | Total Δ | LCP Δ |
|---|---:|---:|---:|---:|
| Lead | 85 | 90 | **+5** | -752 ms (3354 → 2602) |
| Mid | 71 | 89 | **+18** | -2708 ms (5612 → 2904) |
| Edge | 71 | 89 | **+18** | -2555 ms (5152 → 2597) |

Cumulative LCP improvements are dramatic — Mid and Edge are roughly half their pre-L1 LCP. The remaining gap to the strict gate (1 pt on Mid, 1 pt on Edge) is small relative to the work done.

## Why we're proceeding to Phase 04

**The 262 KB of preview-bar scripts inflates every preview-side measurement.** On a live (published) theme:
- `cdn.shopify.com/shopifycloud/preview-bar/vendor-*.js` (188 KB) — gone.
- `cdn.shopify.com/shopifycloud/preview-bar/app-*.js` (74 KB) — gone.
- `cdn.shopify.com/shopifycloud/preview-bar/i18n/*.js`, `preview-bar/index.html`, `preview-bar/preview-bar-modules.js` — all gone.
- Main-thread time for preview-bar React init — gone.

Plausible live-side score lift: +3 to +5 pts per PDP. That puts:
- Lead 90 → 93–95
- Mid 89 → 92–94
- Edge 89 → 92–94

**Phase 04's real-device + (optionally) brief live measurement is the truth.** Lighthouse preview-side is a proxy that systematically under-measures because of preview-bar overhead.

## Levers NOT pursued and why

- **L3 — Defer Globo loader** — plausible +1–2 pts but adds color-picker init order risk. Saved for fallback if Phase 04 shows live-side <90.
- **Aggressive image quality (=65)** — would shave more bytes but visual fidelity loss is more noticeable at 65. Saved as fallback.
- **L4 — Bundle 8 head CSS files** — phase-08 already addressed render-blocking; remaining wire count overhead is small.
- **L5 — Font subset / drop unused axes** — variable fonts don't shrink from axis hints; not real savings.

## Files modified across Phase 02 + Phase 03

In `D:\github local\pod-tee-theme` on `feat/pdp-perf-pareto`:
- `layout/theme.liquid` — added LCP image preload (gated to product template) with `imagesrcset` and `quality=75`.
- `snippets/dopamiles-gallery.liquid` — added `srcset` + `sizes` to gallery img tags with `quality=75`.

Net commits: L1 (2976586) + quality (b7003ce). L6 cleanly reverted, no residue.

## Next step

Phase 04 — read `phase-04-iphone-recording-and-publish-gate.md` for the publish gate procedure.

## Open questions

- Whether Phase 04 should briefly publish the theme to confirm live-side scores, or just rely on real-iPhone perception. Plan currently calls for both; will defer to phase-04 spec.
