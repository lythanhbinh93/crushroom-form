---
title: Phase 1 — Desktop CLS root cause + fix
created: 2026-05-20
branch: feat/pdp-perf-pareto
status: shipped (uncommitted at time of writing)
---

# Phase 1 — Desktop CLS root cause + fix

## TL;DR

**Root cause was NOT what the baseline report hypothesized.** Baseline guessed `grid-auto-flow: dense` was the culprit. Real cause: **web-font swap reflow** — Fraunces + Inter + Inter Tight loading via the `media="print"` defer trick caused all three to swap-in late, reflowing `div.dop-container` (the whole content area) and producing CLS = 0.45 under Lighthouse's `--throttling-method=simulate`.

**Fix**: single-character change in `layout/theme.liquid:112` — Google Fonts URL param `&display=swap` → `&display=optional`. Eliminates the FOUT swap; browser sticks with fallback for the session if the font misses the 100ms block window.

**Result**: desktop perf **72 → 91-92**, CLS **0.454 → 0.0002** (effectively zero, 99.95% drop). Hits the ≥90 target on desktop. Mobile mostly unchanged (LCP varies ±800ms run-to-run; CLS stays near 0).

## Investigation methodology

1. **Two-tool cross-validation**: Lighthouse simulate-throttling (baseline measurement tool) + Puppeteer real-time `PerformanceObserver({type: "layout-shift", buffered: true})`. The gap between the two pinpointed the cause.
2. **Lighthouse layout-shifts audit details** explicitly attributed the 0.45 score to 3 font URLs (`fraunces`, `inter`, `intertight` on `fonts.gstatic.com`). Subitems labelled `cause: "Web font loaded"`.
3. Puppeteer's raw observer (no throttling) measured CLS = 0.032 — much lower because real desktop fonts arrive in <100ms. The 14× gap between simulate (0.45) and real (0.03) is the simulator stretching the font-load window to model slow connections.

## Top 5 shifting elements (Puppeteer)

| Selector | Shift score | Cause |
|---|---|---|
| `main > div.shopify-section > div.dop-container` | 0.032 | Parent reflow from below |
| `header.doc-hero > div` | 0.032 | Hero `h1` height change |
| `h1 > em` | 0.032 | Fraunces serif metrics ≠ system fallback |
| `header.doc-hero > div.doc-hero-meta` | 0.032 | Reflowed down by hero h1 |
| `nav.doc-niche-tabs > a.doc-niche-tab` | 0.032 | Inter Tight on tab labels reflowed |

All 5 shift at startTime ≈ 1790ms — a single coordinated reflow event when Fraunces finishes loading.

## Fix details

**File**: `layout/theme.liquid:112` + `:122` (noscript fallback)

**Change**:
```diff
-https://fonts.googleapis.com/css2?family=...&display=swap
+https://fonts.googleapis.com/css2?family=...&display=optional
```

`font-display: optional` semantics:
- **Block period**: ~100ms FOIT (invisible text). If font arrives within window, use it.
- **Swap period**: zero — never swap mid-session. If font misses the 100ms window, fallback for entire session.
- **Result**: zero FOUT swap reflow.

Trade-off documented in code comment: slow connections (3G) may see system fonts permanently for that session. Acceptable for a Meta-ads-driven store where CWV affects ad costs.

## Measurements

| URL × viewport | Run | Pre Perf | Post Perf | Pre CLS | Post CLS | Pre LCP | Post LCP |
|---|---|---|---|---|---|---|---|
| /collections/all desktop | 1 | 72 | **91** | 0.454 | **0.0002** | 1518 | 1528 |
| /collections/all desktop | 2 | — | **92** | — | **0.0002** | — | 1396 |
| /collections/all mobile | 1 | 70 (baseline)¹ | 66 | 0.002 | 0.0000 | 5538 | 6397 |
| /collections/all mobile | 2 | — | 67 | — | 0.0004 | — | 5621 |

¹ Baseline mobile from `260520-1547/reports/lighthouse-baseline.md`; pre-fix run not repeated in this session.

**Net assessment**:
- Desktop: +19-20 perf points, CLS ≈ zero. Production-realistic ≥85 after ~5pt dev-server discount.
- Mobile: -3 perf points (66-67 vs baseline 69-70). LCP variance is within typical run-to-run noise (±800ms across runs). CLS marginally improved (0.002 → ~0).
- Trade-off accepted: the desktop gain dominates aggregate CrUX since desktop CLS in the "Poor" tier (>0.25) materially worsens the field score.

## Hypotheses that turned out to be wrong

The baseline report's Pareto #1 recommendation listed three options:
- Option A: revert `grid-auto-flow: dense`
- Option B: keep dense + add `aspect-ratio` constraints to `.dop-pcard-img`
- Option C: realign editorial card position to grid-multiples

**All three were red herrings.** Product cards already had `aspect-ratio: 1` (set in `dopamiles-shared.css:52`) AND `width="300" height="300"` image attributes — slot heights were already contracted. The grid-dense / editorial card interaction was visually plausible but not the actual shift trigger.

This is a good reminder that **DevTools `layout-shifts` audit's subitems with explicit `cause` attribution is the authoritative source** — beats hand-rolled hypotheses, even from informed code review.

## Files changed

- `layout/theme.liquid` (lines 104-122) — comment refresh + `display=swap` → `display=optional` in both `<link>` and `<noscript>` fallback.

## Open questions

- Does production CDN (Shopify) deliver fonts within the 100ms `optional` window for most users? Need real-user CrUX data after deploy.
- Is the mobile -3pt regression worth chasing? Options: preload critical font woff2 files directly to give them headstart; switch to `display=fallback` (3s swap window) as middle-ground; accept loss given desktop dominance in this store's traffic profile.
- Phase 2/3 (CSS/JS route-split) — likely incremental gains given how much is already gated. Worth still doing but expected ROI smaller than this 1-char Phase 1 fix.
