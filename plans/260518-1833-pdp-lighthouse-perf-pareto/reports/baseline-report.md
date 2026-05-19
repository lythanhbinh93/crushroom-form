---
phase: 1
title: "PDP Lighthouse Baseline — preview theme 158279991548"
generatedAt: 2026-05-18T12:17Z
runner: qa/lighthouse-baseline.mjs
lighthouseVersion: 12.2.1
runsPerPdp: 3
host: dopamiles.co
verdict: PHASE_02_NEEDED
---

# PDP Lighthouse Baseline — preview theme 158279991548

## Verdict

**FAIL — Phase 02 (fix top bottleneck) is required.**

| PDP slot | Handle | Variants | Run scores | **Median** | Pass (>=90)? |
|---|---|---:|---|---:|:-:|
| Lead | `a-new-chapter-begins` | 36 | 88 / 85 / 83 | **85** | FAIL |
| Mid  | `this-is-a-5k-right-t-shirt` | 29 | 72 / 71 / 71 | **71** | FAIL |
| Edge | `running-its-how-i-scope` | 48 | 67 / 71 / 76 | **71** | FAIL |

Every PDP must individually clear 90 (strict). None do. No halt — proceed to P2.

Edge PDP auto-pick criterion: max `variants.count` from `/products.json` across 170 products. Winner: `running-its-how-i-scope` (48 variants, 2 options). Selection deterministic; documented in `baseline-summary.json`.

## Critical measurement caveat

**Preview-bar scripts inflate every measurement.** Two scripts only exist on preview, never on live theme:

| URL | Transfer | Will exist on live? |
|---|---:|:-:|
| `cdn.shopify.com/shopifycloud/preview-bar/vendor-*.js` | 188 KB | NO |
| `cdn.shopify.com/shopifycloud/preview-bar/app-*.js` | 74 KB | NO |
| **Subtotal** | **262 KB** | |

These add main-thread work AND transfer weight that disappears on publish. Real publish-target score is unknown but is HIGHER than the preview-measured median. We do not subtract synthetically — instead we'll re-measure post-publish (Phase 04) to confirm Gate 4 perception matches Lighthouse.

## Per-PDP key metrics (median run)

| PDP | Perf | LCP | FCP | CLS | TBT | TTI | Speed Index | Total bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Lead | 85 | 3354 ms | 1445 ms | 0.006 | 248 ms | 7967 ms | 3640 ms | 1.95 MB |
| Mid  | 71 | **5612 ms** | 1412 ms | 0.004 | 278 ms | 9181 ms | 4346 ms | 2.16 MB |
| Edge | 71 | **5152 ms** | 1443 ms | 0.006 | 276 ms | 8177 ms | 5179 ms | 2.09 MB |

**Gates:** LCP target < 2.5s ✗ (all three over), CLS < 0.1 ✓ (all clear), TBT acceptable ✓.

**LCP is the dominant bottleneck.** Mid + Edge LCPs are >2× the gate; even Lead is 34% over.

## Why LCP is bad on Mid + Edge

- Mid hero image: `this-is-a-5k-right-t-shirt-heather-berry-...webp` — **263 KB** transferred.
- Edge hero image: 174 KB transferred.
- Lead hero image: 54 KB transferred.
- All images are already WebP, sized correctly, modern format (Lighthouse passes `modern-image-formats`, `unsized-images`).
- **Root cause:** image discovery is late. No `<link rel=preload>` for the LCP image, no `fetchpriority="high"`. Browser parses HTML → renders critical CSS → discovers `<img>` mid-body → requests image → image arrives at 5+s on slow-4G. Phase-08 (260511) cleared render-blocking and head-loaded CSS but did NOT add LCP-image preload.

The Lighthouse `largest-contentful-paint-element` audit failed (RootCauses gatherer bug in LH 12.2.1, `errorMessage` present in raw LHR), so the audit's selector isn't extractable. The LCP candidate is identified above via network-requests + transfer-size correlation; will validate the exact selector in Phase 02 via DOM probe.

## CLS / TBT / render-blocking — already healthy

- **CLS 0.004–0.006** across all 3 PDPs. Phase-08 (no-layout-shift work) is preserved. No fix needed.
- **TBT 248–278 ms.** Borderline; long tasks attributed to Shopify Web Pixels Manager (`wpm/b7a919571*.js`, 65 KB, 150–183 ms tasks at 7–10s mark) and Shopify Trekkie analytics (`trekkie.storefront.min.js`, 28 KB, 93–97 ms tasks). Both are Shopify-platform scripts, not theme-owned — defer hooks limited.
- **Render-blocking-resources: 0 items.** Phase-08 head-gating is intact. No theme CSS or JS is blocking first paint.

## Resource summary (median run, Mid PDP)

| Type | Count | Bytes |
|---|---:|---:|
| script | 46 | 555 KB |
| third-party | 43 | 786 KB |
| font | 7 | 318 KB |
| stylesheet | 19 | 148 KB |
| image | 1 | 263 KB |
| document | 3 | 60 KB |
| other | 81 | 816 KB |
| **total** | **157** | **2.16 MB** |

## Third-party inventory

`third-party-summary` audit only attributes 3 entities — **Shopify (538 KB), Google Fonts (244 KB), shop.app (3 KB)** — because Judge.me + Globo are served via `cdn.shopify.com/extensions/*` and lumped under Shopify.

Direct network probe finds the real footprint:

| Vendor | Bundles | Total transfer | Notes |
|---|---:|---:|---|
| Judge.me | 1 (loader.js) | 3.8 KB | Loader-only on PDP; review widget lazy-loads on scroll. Low cost. |
| Globo Color Swatches | 10 bundles | ~52 KB total; main `globo.swatch.bundle.product.js` = 21 KB | Multiple small chunks loaded up front. Defer-candidate. |
| Shopify Web Pixels Manager | `wpm/b7a919571*.js` | 65 KB + 27 KB second chunk = 92 KB | Platform — limited control. |
| Shopify Trekkie | `trekkie.storefront.*.js` | 28 KB | Platform — limited control. |
| Shopify Perf Kit | `shopify-perf-kit-3.3.1.min.js` | 21 KB | Platform — limited control. |
| **Preview-bar** | 2 bundles | **262 KB** | **Preview-only; gone on live.** |

## Font inventory (median run, Mid PDP)

| Font | Source | Transfer |
|---|---|---:|
| Fraunces (display) | Google Fonts | 81 KB + 67 KB = **148 KB** (two cuts) |
| Inter Tight | Google Fonts | 45 KB |
| Inter | Google Fonts | 48 KB |
| Inter | Shopify CDN (`/static/fonts/inter/...InterVariable-latin-*.woff2`) | 49 KB |
| Assistant | Shopify CDN | 13 KB + 13 KB = 26 KB |

**Two Inter sources** (Google + Shopify) load in parallel — ~48 KB duplicate. `font-display` audit passes (swap is correct). Phase-08 swap-correctness preserved.

## Long tasks (median run, top 5 by duration)

| PDP | URL | Duration | Start |
|---|---|---:|---:|
| Lead | `wpm/b7a919571.js` | 162 ms | 7554 ms |
| Lead | document `a-new-chapter-begins` | 131 ms | 1803 ms |
| Mid | Unattributable | 210 ms | 864 ms |
| Mid | `wpm/b7a919571.js` | 150 ms | 9812 ms |
| Edge | `wpm/b7a919571.js` | 183 ms | 8302 ms |
| Edge | document `running-its-how-i-scope` | 139 ms | 1901 ms |

`Unattributable` 210ms on Mid at 864ms is the only theme-related blocker before FCP. Worth a trace dive in Phase 02 if L1 alone doesn't clear the gate.

## Bottleneck rank (drives P2 lever pick)

| Rank | Lever | Phase-of-impact | Plausible gain |
|:-:|---|---|:-:|
| 1 | **L1 — Preload + `fetchpriority="high"` on PDP hero image** | LCP image discovery | **+10–15 pts** |
| 2 | L6 — Drop duplicate Inter font source (keep Shopify OR Google, not both) | Font bytes / parallelism | +1–3 pts |
| 3 | L3 — Defer Globo loader until first interaction OR after `load` event | Main-thread / TBT | +2–4 pts |
| 4 | L4 — Audit 19 stylesheets for actual mobile-PDP usage | CSS payload (low — `unused-css-rules` already passes) | <2 pts |
| 5 | L2 — CLS optimization | **N/A — already 0.005, well under 0.1 gate** | 0 |

Phase 02 should target **L1 first** and re-measure. If a single L1 fix lands Lead+Mid+Edge ≥90, halt. If only Lead clears, Phase 03 conditional lever = L6 + L3 stack.

## Lighthouse audit anomalies (Phase 02 will not re-debug these)

- `largest-contentful-paint-element`: errored (`Required TraceElements gatherer encountered an error: Dependency "RootCauses" failed`). Known LH 12.2.1 issue. Network-requests + image bytes correlation gives a confident LCP candidate.
- `prioritize-lcp-image`: errored (same root cause). Recommendation is inferred from L1 lever, not LH suggestion.
- `lcp-lazy-loaded`: present but score `null`. No actionable signal.

## Regression baseline (must remain green after P2)

Reference scripts (in `plans/260514-1230-pod-tee-publish-and-js-fixes/qa/`):

| Test | Last validated | Status |
|---|---|:-:|
| `perf-probe-feature-variant.mjs` (Globo align, no section refetch) | 2026-05-18 (commit 267b2c3) | GREEN — see observation 704 |
| `feature-variant-default.mjs` (default color resolves via media[0]) | 2026-05-18 (commits 46755bf + 72c3d7e) | GREEN — see observation 698 |

After every Phase 02 / Phase 03 fix, re-run both before re-running Lighthouse baseline. If either flips red, revert the fix and try a non-conflicting approach.

## Reviews-app gate

Confirmed live on preview theme 2026-05-18: **Judge.me**. Loader (`judgeme-522/assets/loader.js`) detected in network trace on all 3 PDPs. Baseline measurement therefore includes the realistic post-publish reviews-app footprint (note: only the loader fires on initial render; review widget lazy-loads — current ~4 KB cost is the realistic on-PDP-load cost). No baseline invalidation.

## Files produced

- `qa/package.json` — Lighthouse 12.2.1 + chrome-launcher 1.1.2 deps.
- `qa/pick-edge-pdp.mjs` — edge auto-picker from `/products.json`.
- `qa/lighthouse-baseline.mjs` — main harness (3 PDPs × 3 runs).
- `qa/lib/lighthouse-runner.mjs` — programmatic LH mobile runner (Windows EPERM cleanup tolerated).
- `qa/lib/median.mjs` — median-of-N LHR selector.
- `qa/lib/analyze-lhr.mjs` — per-LHR bottleneck extractor.
- `qa/smoke.mjs` — single-run smoke for runner validation.
- `baseline-raw/{handle}-run-{1,2,3}.json` — 9 raw LHR JSONs preserved.
- `baseline-summary.json` — structured machine-readable summary.

## Next step

Phase 02 target lever: **L1 (preload + `fetchpriority="high"` on PDP hero image)**.

Halt rule reminder: after Phase 02 fix, re-run this harness. If median ≥90 on EVERY PDP, auto-cancel Phase 03 and jump to Phase 04 (iPhone recording + publish gate). If only some PDPs pass, Phase 03 conditional lever stack begins.

## Open questions

- Phase 02 should add `<link rel="preload" as="image" fetchpriority="high">` to the LCP image candidate. Need to identify the exact Liquid render path that emits the hero `<img>` — likely `sections/dopamiles-product-hero.liquid` or `snippets/dopamiles-gallery.liquid`. Phase 02 will trace this before writing the preload tag.
- Whether Mid PDP's "Unattributable" 210ms task at 864ms is theme-owned or platform — defer trace dive until P2 measures L1 fix impact.
