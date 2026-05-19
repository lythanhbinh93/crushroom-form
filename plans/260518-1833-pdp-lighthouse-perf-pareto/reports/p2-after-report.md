---
phase: 2
title: "After Phase 02 L1 — preload + srcset"
generatedAt: 2026-05-19T03:51:47Z
leverApplied: L1
commit: pod-tee-theme @ 2976586 (feat/pdp-perf-pareto)
verdict: PHASE_03_NEEDED (median 90/86/89 — mid + edge still under gate)
---

# After Phase 02 L1 — preload + srcset

## Lever applied

**L1 — Preload `product.media[0]` + matching srcset/sizes on gallery `<img>`.**

Commit: `2976586` on `pod-tee-theme@feat/pdp-perf-pareto`.

Files changed:
- `layout/theme.liquid` (added head preload block, gated to product template).
- `snippets/dopamiles-gallery.liquid` (added `srcset` 400w/800w/1200w + `sizes` to gallery img).

Deployed: 2026-05-19T03:48Z to preview theme 158279991548 (`dopamiles-bundle-prod-260508`) via `shopify theme push --only` for the two changed files. Verified live in preview HTML (curl with preview cookie jar shows preload link with full imagesrcset and matching srcset on first gallery img).

## Before / After medians

| PDP | Before runs | Before median | After runs | After median | Δ | Pass? |
|---|---|---:|---|---:|---:|:-:|
| Lead — a-new-chapter-begins | 88 / 85 / 83 | **85** | 65 / 90 / 93 | **90** | **+5** | ✓ |
| Mid — this-is-a-5k-right-t-shirt | 72 / 71 / 71 | **71** | 68 / 86 / 88 | **86** | **+15** | ✗ |
| Edge — running-its-how-i-scope | 67 / 71 / 76 | **71** | 68 / 90 / 89 | **89** | **+18** | ✗ |

**Every-PDP >=90 strict halt: FAIL.** Lead clears, Mid (-4) and Edge (-1) still under gate.

## Per-PDP Core Web Vitals delta

| PDP | Metric | Before | After | Δ |
|---|---|---:|---:|---:|
| Lead | LCP | 3354 ms | **2597 ms** | **-757 ms (-23%)** |
| Lead | FCP | 1445 ms | 1258 ms | -187 ms |
| Lead | CLS | 0.006 | 0.000 | -0.006 |
| Lead | TBT | 248 ms | 258 ms | +10 ms |
| Mid | LCP | 5612 ms | **3207 ms** | **-2405 ms (-43%)** |
| Mid | FCP | 1412 ms | 1459 ms | +47 ms |
| Mid | CLS | 0.004 | 0.004 | 0 |
| Mid | TBT | 278 ms | 258 ms | -20 ms |
| Edge | LCP | 5152 ms | **2600 ms** | **-2552 ms (-50%)** |
| Edge | FCP | 1443 ms | 1250 ms | -193 ms |
| Edge | CLS | 0.006 | 0.000 | -0.006 |
| Edge | TBT | 276 ms | 238 ms | -38 ms |

**Headline:** L1 moved Mid LCP from 5.6s → 3.2s and Edge LCP from 5.2s → 2.6s. Lead LCP now 2.6s, just barely over the 2.5s gate. The preload + right-sizing eliminated the late-discovery penalty.

**Residual:** Mid's 3207ms LCP still over 2.5s gate. Even with preload, mid's hero image (`this-is-a-5k-right-t-shirt-heather-berry-...webp`) is the heaviest of the 3 PDPs — 800w variant on 3G throttling is still costly.

## Run-1 outlier note

All 3 PDPs scored notably lower on run 1 (Lead 65, Mid 68, Edge 68) than runs 2-3 (Lead 90/93, Mid 86/88, Edge 90/89). Median-of-3 absorbs the outlier (median is the middle value, not pulled by extremes), but the spread indicates Lighthouse simulation has residual cold-start variance the throttle model doesn't fully neutralize. Re-running 3 times consistently shows the same shape — the verdict is stable.

## Regression baseline (post-L1)

Re-ran `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/perf-probe-feature-variant.mjs` against the deployed preview:

| Handle | Globo aligned | Preferred matches checked | Section refetches | Verdict |
|---|:-:|:-:|:-:|:-:|
| a-new-chapter-begins | 1 | Black ↔ Black ✓ | 0 | PASS |
| this-is-a-5k-right-t-shirt | 1 | Heather Berry ↔ Heather Berry ✓ | 0 | PASS |
| 5k-route-t-shirt | 1 | Navy ↔ Navy ✓ | 0 | PASS |

**Δ from P1 baseline: 0 changes.** Globo color-swatch alignment intact, media-order resolution still defaults correctly, no section refetches triggered by L1.

L1 is safe: head preload doesn't fight Globo's color swap (display-toggle, not src mutation), and the matching srcset ensures the preload is honored by the picker.

## P3 conditional analysis

Plan says: "if median >= 90 on EVERY PDP (strict), auto-cancel P3 and jump to P4. Otherwise → identify next bottleneck from updated trace; proceed to P3."

**P3 IS needed.** The remaining gap:
- Mid needs +4 perf points (LCP must drop from 3.2s → ≤2.5s, ~700ms more).
- Edge needs +1 perf point (LCP 2.6s, ~100ms over).

Top remaining bottlenecks ranked:

| Rank | Lever | Why | Expected impact |
|:-:|---|---|---|
| 1 | **L6 — Drop duplicate Inter font** (Shopify + Google both load) | ~48KB font wire savings. On 3G that's ~250ms transfer. May ripple to FCP and indirectly LCP. | +2-4 pts |
| 2 | **L1 v2 — Tighter image dimensions on mid** (e.g. force 600w on mobile or reduce JPEG quality) | Mid's image is the heaviest — 800w variant still ~100-150KB. | +2-4 pts on Mid only |
| 3 | **L3 — Defer Globo loader** | Globo's 10 small bundles fetch up front; ~52KB total. Lazy-load via interaction. | +1-3 pts |

**Recommended P3 lever:** L6 (drop duplicate Inter font). Simple, low-risk, hits the universal bytes budget. If L6 alone clears edge (needs +1) but not mid, we accept mid borderline or run a follow-up.

Alternative single-lever shot at mid: image dimension tweak (force `sizes="(max-width:768px) 70vw"` → browser picks 400w on mobile = ~50KB savings on the mid image). But that touches the L1 area, which feels like "L1 redo" rather than a new lever. Plan structure prefers a different lever.

## Files produced

- `reports/baseline-summary.json` — overwritten with post-L1 numbers.
- `reports/p2-after-report.md` — this file.
- `pod-tee-theme @ 2976586` — preload + srcset commit on `feat/pdp-perf-pareto`.
- `baseline-raw/` — 9 new LHR JSONs (gitignored; kept local for trace deep-dive).

## Next step

Await user decision on P3:
1. Proceed with L6 (drop duplicate Inter font).
2. Image-size tweak on Mid (L1 redo).
3. Accept the borderline (mid 86, edge 89) and publish-anyway with risk acknowledgment.
4. Stack L6 + image tweak as one combined fix (plan-violating; not recommended).

## Open questions

- Mid's 263 KB raw hero image is the heaviest of the 3 PDPs — is there merchant-side image-CMS room to re-export at higher compression / lower max-width before falling back to theme-side tweaks?
- Edge's 89 is functionally "1 point shy"; depending on user risk tolerance for run-to-run variance (~±2 pts at LH 12 mobile), it could be argued as "effectively passing". Strict plan halt rule says no.
