---
phase: 3
title: "Bundle Site-wide CSS with Staging Dry-Run"
status: pending
priority: P2
effort: "40-90min"
dependencies: [2]
---

# Phase 3: Bundle Site-wide CSS with Staging Dry-Run

## Overview

Concatenate the 7 site-wide head-loaded `dopamiles-*.css` files into a single `dopamiles-critical.css` to collapse 7 HTTP round-trips into 1. Estimated +200-400 ms LCP/FCP, +2-4 pts/PDP. Medium risk: CSS cascade order MUST be preserved exactly.

Skipped only if Phase 2's halt rule triggered (strict every-PDP gate cleared without this step).

## Requirements

- **Functional:**
  - Concatenate 7 CSS files via a build script in EXACT theme.liquid order.
  - Output: `assets/dopamiles-critical.css` (site-wide).
  - Replace the 7 head `<link>` tags in `layout/theme.liquid` with a single `<link>` for the bundle.
  - Keep `dopamiles-pdp.css` and `component-product-variant-picker.css` separately gated to product templates (not in the bundle).
  - Bundle commit replaces the 7 tags atomically — easy revert.
- **Non-functional:**
  - Build script committed to repo. Reproducible. Idempotent.
  - Staging-theme dry-run BEFORE deploying to preview theme 158279991548.
  - Playwright pixel-diff QA on 5 templates × 3 viewports BEFORE promoting to preview.
  - One-commit rollback path.
  - 5-run baseline + regression suite after promotion to preview.

## Architecture

### File concat order (MATCHES `layout/theme.liquid` lines 35-57)

1. `dopamiles-components.css` (line 35)
2. `dopamiles-feedback.css` (line 38)
3. `dopamiles-shared.css` (line 41)
4. `dopamiles-search.css` (line 49)
5. `dopamiles-cart.css` (line 52)
6. `dopamiles-cart-drawer-ui.css` (line 54)
7. `dopamiles-bundle.css` (line 57)

→ Output: `assets/dopamiles-critical.css`.

Site-wide gate retained — bundle replaces tags 1-7 only. Tags 8-9 (`dopamiles-pdp.css` + `component-product-variant-picker.css`) stay separately gated inside `{%- if template contains 'product' -%}`.

### Build script

`plans/260519-1215-pdp-perf-round-2/qa/build-critical-css.mjs`:
- Reads a manifest file `qa/critical-css-manifest.json` defining the 7 source paths in order.
- Concatenates contents with a separator comment between each (`/* === SOURCE: filename === */`).
- Writes to `D:\github local\pod-tee-theme\assets\dopamiles-critical.css`.
- Idempotent — re-running produces identical output (no timestamps in output).

### Staging-theme dry-run

Before pushing to preview theme 158279991548:
1. Clone preview theme to a NEW unpublished theme via Shopify admin (manual) OR via `shopify theme push --unpublished --new --json` if Theme Access permits.
2. Push the bundle commit to the staging clone.
3. Run Playwright pixel-diff QA (next subsection).
4. If all green → promote to preview theme 158279991548.
5. If any diff exceeds tolerance → abort and analyze. Do not touch preview theme.

### Playwright pixel-diff QA

`plans/260519-1215-pdp-perf-round-2/qa/visual-diff-bundle.mjs`:
- Capture screenshots of 5 templates × 3 viewports on:
  - **Baseline** = current preview theme 158279991548 (without bundle).
  - **Candidate** = staging-theme-clone (with bundle).
- Templates: home, PDP (`a-new-chapter-begins`), collection (any), cart (with 1 item), blog (any article).
- Viewports: 412×823 (Moto G4 mobile), 768×1024 (tablet), 1366×768 (desktop).
- Use `pixelmatch` or Playwright's built-in screenshot diff with a tolerance threshold (e.g. 0.5 % pixel-difference per image).
- Output: `reports/visual-diff-bundle.json` + per-image diff PNGs in `reports/visual-diff-bundle/`.
- Fail if any template×viewport exceeds tolerance.

### Halt rule

After preview-theme promotion → run `qa/lighthouse-baseline.mjs --runs=5` + regression suite. Write `reports/p3-after-report.md`. Verdict matrix:
- Every-PDP median ≥ 90 STRICT + regression GREEN → mark plan complete.
- Mid+Edge cleared 90 but Lead regressed → revert bundle commit, return to Phase 2 success state.
- Visual diff caught a regression after promotion (unlikely if QA was clean) → revert immediately.

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\layout\theme.liquid` (replace 7 `<link>` tags with 1)
- **Create:** `D:\github local\pod-tee-theme\assets\dopamiles-critical.css` (output of build script)
- **Create:** `plans/260519-1215-pdp-perf-round-2/qa/critical-css-manifest.json` (source-of-truth manifest)
- **Create:** `plans/260519-1215-pdp-perf-round-2/qa/build-critical-css.mjs` (deterministic concat script)
- **Create:** `plans/260519-1215-pdp-perf-round-2/qa/visual-diff-bundle.mjs` (Playwright pixel-diff QA harness)
- **Create:** `plans/260519-1215-pdp-perf-round-2/reports/visual-diff-bundle.json` (QA verdict + per-image scores)
- **Create:** `plans/260519-1215-pdp-perf-round-2/reports/visual-diff-bundle/` (per-template/viewport PNG triples: baseline, candidate, diff)
- **Create:** `plans/260519-1215-pdp-perf-round-2/reports/p3-after-report.md` (5-run medians + halt verdict)
- **No-touch (regression-protected):**
  - `dopamiles-pdp.css` (stays separately gated to product templates)
  - `component-product-variant-picker.css` (same)
  - All other theme files
  - Globo integration shims, variant-picker JS, media-order resolution Liquid

## Implementation Steps

1. Write `qa/critical-css-manifest.json` listing the 7 source paths in exact theme.liquid order.
2. Write `qa/build-critical-css.mjs`. Idempotent concat with `/* === SOURCE: file === */` separator comments. Output to `D:\github local\pod-tee-theme\assets\dopamiles-critical.css`.
3. Run the build script. Verify output byte-count matches sum of 7 source byte-counts + comment overhead.
4. Edit `layout/theme.liquid`: replace lines 35-57 (the 7 site-wide CSS tags) with a single `<link>` tag for the bundle. Preserve comments referencing why these styles load site-wide. Preserve the `{%- if template contains 'product' -%}` block for the still-gated 2 PDP CSS files at lines 74-77.
5. Commit on `feat/pdp-perf-pareto`: `perf(theme): bundle 7 site-wide css files into one critical css`.
6. **DO NOT push to preview theme 158279991548 yet.**
7. Clone preview theme 158279991548 to a NEW unpublished staging theme. Capture the new theme ID.
8. Push the bundle commit to the staging clone via `shopify theme push --theme={staging-id} --only=layout/theme.liquid --only=assets/dopamiles-critical.css`.
9. Write `qa/visual-diff-bundle.mjs`. Run it. Inspect `reports/visual-diff-bundle.json`.
10. Decision:
    - All diffs within tolerance → continue to step 11.
    - Any diff exceeds tolerance → abort. Diagnose (file order? quoting issue? missing CSS in bundle?). Revert commit. Re-plan.
11. Promote bundle to preview theme 158279991548 via the same `shopify theme push --only` command (now targeting `--theme=158279991548`).
12. Verify deploy: curl with cookie jar to confirm `dopamiles-critical.css` is the single tag and the 7 individual tags are gone.
13. Run `qa/lighthouse-baseline.mjs --runs=5`. Run regression suite. Write `reports/p3-after-report.md`.
14. If every-PDP median ≥ 90 STRICT + regression GREEN: mark plan `status: completed`, notify user.
15. If gate not cleared: surface to user. Possible next moves: accept current state (mid/edge might be 89-90, very close), or run additional probes for L3 Globo defer (NOT in this plan's scope — would be Round 3).

## Success Criteria

- [ ] `qa/critical-css-manifest.json` lists 7 source files in exact theme.liquid order.
- [ ] `qa/build-critical-css.mjs` is idempotent (running twice produces identical output).
- [ ] `assets/dopamiles-critical.css` byte-count = sum of 7 source byte-counts + separator comment overhead (verified).
- [ ] `layout/theme.liquid` has 7 site-wide CSS tags replaced with 1 bundle tag; PDP-gated tags preserved.
- [ ] Staging clone created; bundle deployed there first.
- [ ] Playwright pixel-diff QA: 5 templates × 3 viewports = 15 image pairs; all within tolerance.
- [ ] Bundle promoted to preview theme 158279991548 only after QA green.
- [ ] Curl verification: deployed HTML has single `dopamiles-critical.css` tag.
- [ ] 5-run Lighthouse baseline run; `reports/p3-after-report.md` written.
- [ ] Regression suite: Globo + media-order + section-refetch all GREEN.
- [ ] Plan `status: completed` if gate cleared.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Concat order drift → cascade order changes → visual regress | Build via manifest-driven script (reproducible); QA via pixel-diff before preview promote |
| Bundle CSS contains relative `url(...)` references that resolve differently | Audit all 7 source files for `url(...)` paths first; if any are relative-to-source, rewrite to absolute Shopify asset paths in the bundle |
| New bundle file isn't found by Shopify if asset upload didn't include it | `shopify theme push --only=assets/dopamiles-critical.css` explicitly uploads the bundle file; verify via curl that the asset 200s |
| Some templates aren't covered by the 5-template QA (home/PDP/collection/cart/blog) | Pixel-diff list covers the highest-traffic templates; if account/checkout/policy pages regress, it's caught later in QA — accept this tradeoff for plan scope |
| Concurrent edits between staging clone snapshot and preview promote → drift | Snapshot the preview theme just before cloning; no other commits land on `feat/pdp-perf-pareto` between staging dry-run and preview promote |
| Theme Access token expired since Round 1 | User to re-issue if needed; pass via `SHOPIFY_CLI_THEME_TOKEN` env var |
| Bundle gets too large (> 256 KB threshold for Shopify asset) | Sum of 7 sources is ~115 KB total (from Round 1 baseline data); well under the threshold |

## Open questions

- Cloning the preview theme: CLI (`shopify theme push --unpublished --new`) or manual via admin? Defer to runtime. CLI is faster if Theme Access permits.
- Optional live-side measurement after preview-side strict gate clears (briefly publish, measure, decide): treat as separate followup, NOT in this plan.
