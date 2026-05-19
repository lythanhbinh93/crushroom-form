---
phase: 2
title: "Fix Top Bottleneck"
status: completed
completedAt: 2026-05-19T03:52Z
priority: P1
effort: "1-4h"
actualEffortMin: 40
dependencies: [1]
leverApplied: L1 (preload + srcset/sizes)
themeCommit: 2976586 (pod-tee-theme feat/pdp-perf-pareto)
output: reports/p2-after-report.md
verdict: PHASE_03_NEEDED (median 90/86/89 — lead PASS, mid+edge under gate)
deltas: lead +5, mid +15, edge +18 perf pts; LCP -757/-2405/-2552 ms
regressionStillGreen: true
---

# Phase 2: Fix Top Bottleneck

## Overview

Apply ONE targeted fix to the highest-ranked bottleneck from P1's baseline report. Re-measure with the same median-of-3 harness. Halt if median >= 90 on EVERY PDP individually (strict).

**Skip this phase entirely** if P1 verdict was "already >=90 on EVERY PDP".

## Requirements

- **Functional:**
  - Apply exactly one tactical lever (see selection matrix below) mapped to P1's top bottleneck.
  - Re-run `qa/lighthouse-baseline.mjs` on same 3 PDPs.
  - Re-run Globo + media-order regression suite — must remain GREEN.
  - Append `p2-after-report.md` (or extend baseline-report.md) with after-fix medians.
- **Non-functional:**
  - One lever only. Resist combo fixes — they obscure cause-effect.
  - Theme-side only. No 3rd-party script removal without merchant sign-off.
  - All commits on `feat/pdp-perf-pareto`; one commit per lever for easy revert.

## Architecture

### Tactical lever selection matrix

P1's top bottleneck dictates which lever runs in P2. Strict 1:1 mapping — do not freelance.

| If top bottleneck is... | Apply lever | Touchpoint files |
|---|---|---|
| LCP image too late / wrong-sized | **L1: Preload media[0]** | `layout/theme.liquid` (head), `sections/dopamiles-product-hero.liquid` |
| CLS > 0.1 from layout shifts in hero / gallery | **L2: Lock aspect-ratio + font-fallback metrics** | `assets/dopamiles-pdp.css`, `snippets/dopamiles-gallery.liquid`, font `@font-face` blocks |
| TBT > 300ms / long tasks in below-fold sections | **L3: content-visibility on below-fold** | `assets/dopamiles-pdp.css` (6 below-fold sections) |
| Render-blocking CSS (10+ small files) dominates | **L4: Bundle critical PDP CSS** | `assets/dopamiles-critical.css` (new), `layout/theme.liquid` (head) |
| Font payload + axis range too wide | **L5: Font subset / drop unused axes** | `layout/theme.liquid:86-106` (Google Fonts URL is inline here; no `dopamiles-fonts.liquid` snippet exists — verified 2026-05-18) |
| `dopamiles-pdp-variant-sync.js` dead-code post-Globo | **L6: JS audit + dead-code removal** | `assets/dopamiles-pdp-variant-sync.js` |

### Lever specifications

#### L1 — Preload media[0]

```liquid
{%- comment -%} In layout/theme.liquid head, gated to product template {%- endcomment -%}
{%- if template contains 'product' and product.media.first -%}
  {%- assign lcp_image = product.media.first.preview_image -%}
  <link rel="preload" as="image"
    href="{{ lcp_image | image_url: width: 800 }}"
    imagesrcset="{{ lcp_image | image_url: width: 400 }} 400w,
                 {{ lcp_image | image_url: width: 800 }} 800w,
                 {{ lcp_image | image_url: width: 1200 }} 1200w"
    imagesizes="(max-width: 768px) 100vw, 50vw"
    fetchpriority="high">
{%- endif -%}
```

Guardrails:
- Preload **media[0] only** — matches media-order variant resolution (commit 72c3d7e). Don't preload variant-specific images.
- Set `fetchpriority="high"` on the LCP `<img>` tag too.
- Drop `srcset` from offscreen gallery thumbnails (they're sized small, no need for responsive set).
- After fix: verify Globo color switch still updates hero image — no preload conflict.

#### L2 — Lock aspect-ratio + font-fallback metrics

```css
/* In assets/dopamiles-pdp.css */
.dop-vs-slot,
.dopamiles-product-hero .media,
.dopamiles-gallery img {
  aspect-ratio: var(--product-image-ratio, 1 / 1);
}

@font-face {
  font-family: 'Fraunces Fallback';
  src: local('Georgia');
  size-adjust: 105%;
  ascent-override: 90%;
  descent-override: 25%;
  line-gap-override: 0%;
}
```

Guardrails:
- Measure actual ratios from media items before hardcoding — many products may not be 1:1.
- `size-adjust` values must come from font-fallback metric calculator (e.g. Malte Ubl's fallback tool) using real font metrics — don't guess.
- Verify hero, gallery thumbs, FBT product tiles all stable on slow 3G replay.

#### L3 — content-visibility on below-fold

```css
/* assets/dopamiles-pdp.css */
.dopamiles-fbt,
.dopamiles-niche-favorites,
.dopamiles-reasons,
.dopamiles-more-from-niche,
.dopamiles-reviews-placeholder,
.dopamiles-faqs {
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;
}
```

Guardrails:
- `contain-intrinsic-size` height MUST come from measured natural heights on a real PDP — not a guess. Wrong heights = CLS at scroll-in.
- Test scroll-in on slow 3G — verify no perceptible jank.
- Do NOT apply to `dopamiles-mobile-sticky-atc` (fixed-position) or `dopamiles-product-hero` (above the fold).

#### L4 — Bundle critical PDP CSS

- Hand-concat the **7 site-wide dopamiles head-CSS files** (`dopamiles-components`, `-feedback`, `-shared`, `-search`, `-cart`, `-cart-drawer-ui`, `-bundle`) plus the PDP-conditional **`dopamiles-pdp.css`** into one `assets/dopamiles-critical.css`.
- Preserve cascade order exactly (matches `layout/theme.liquid` order: lines 35-57 then 75).
- Single `{{ 'dopamiles-critical.css' | asset_url | stylesheet_tag }}` in `theme.liquid` head, gated to product template.
- Keep `dopamiles-tokens` snippet inline (line 32 — server-rendered, not a file fetch; no win from bundling).
- Keep Dawn `base.css`, body-tag cart-drawer CSS, and `component-product-variant-picker.css` separate (out of scope; risk of breaking site-wide).
- Verified file count 2026-05-18: 7 site-wide + 1 PDP-conditional dopamiles CSS = 8 fetches to collapse into 1.

#### L5 — Font subset / drop unused axes

- Audit usage: which Fraunces / Inter / Inter Tight / JetBrains Mono weights + axes actually render on PDP?
- Rebuild Google Fonts URL with only used axis ranges.
- If feasible, add `text=` parameter for hero copy that's stable (e.g. product page chrome strings) — not user-generated content.

#### L6 — JS audit + dead-code removal

- Diff `dopamiles-pdp-variant-sync.js` against post-Globo-alignment commits (46755bf onwards).
- Remove handlers / branches no longer reachable after Globo became source of truth.
- Verify variant sync still works on edge PDP (many variants).

### Re-measurement protocol

<!-- Updated: Validation Session 1 — strict every-PDP halt + auto-cancel P3 -->

After fix is committed:
1. Re-run `qa/lighthouse-baseline.mjs` (same 3 PDPs, same 3-run median).
2. Append after-medians to `baseline-report.md` (delta table: before / after / Δ).
3. Run Globo + media-order regression suite — record pass count, compare to P1.
4. Verdict: median perf >= 90 on **EVERY** of the 3 PDPs individually (strict — not average, not median-of-medians)?
   - **Yes** → halt; **auto-set P3 status to `cancelled`** (no user confirmation required per validation 2026-05-18); proceed to P4.
   - **No** → identify next bottleneck from updated trace; proceed to P3.

## Related Code Files

- **Modify (one of):** based on lever selected:
  - L1: `D:\github local\pod-tee-theme\layout\theme.liquid`, `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`
  - L2: `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css`, `D:\github local\pod-tee-theme\snippets\dopamiles-gallery.liquid`
  - L3: `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css`
  - L4: `D:\github local\pod-tee-theme\layout\theme.liquid` (replace lines 35-57 + 75 with one bundle tag); **Create:** `D:\github local\pod-tee-theme\assets\dopamiles-critical.css`
  - L5: `D:\github local\pod-tee-theme\layout\theme.liquid:86-106` (Google Fonts URL is inline; no separate snippet file)
  - L6: `D:\github local\pod-tee-theme\assets\dopamiles-pdp-variant-sync.js`
- **No-touch (regression-protected):**
  - Globo integration shims
  - Variant-picker JS
  - `featured_media`/media-order resolution Liquid in product-hero (commit 72c3d7e)

## Implementation Steps

1. Read P1's `baseline-report.md` → identify top bottleneck → select lever from matrix above. Do not freelance.
2. Branch hygiene: confirm on `feat/pdp-perf-pareto`. If P1 lives elsewhere, branch from there.
3. Implement the lever per spec. Stay within touchpoints listed; do not "while I'm here" extra fixes.
4. Commit with message `perf(pdp): {lever-id} — {short description}` referring to the lever id (L1-L6).
5. Deploy to preview theme.
6. Re-run baseline harness; append delta to `baseline-report.md`.
7. Run Globo + media-order regression suite. If any regression, revert commit and re-plan — do not press on.
8. Write `p2-after-report.md` with: lever applied, before/after medians, Δ per Core Web Vital, regression pass count, halt verdict.

## Success Criteria

- [ ] Exactly one tactical lever applied; commit message tags lever id.
- [ ] Globo color-swatch regression test passes (no Δ from P1 baseline pass count).
- [ ] media[0]-based variant resolution still defaults correctly on all 3 PDPs.
- [ ] Re-measured median perf score recorded per PDP with Δ vs P1 baseline.
- [ ] `p2-after-report.md` written with halt verdict (>=90 on EVERY PDP individually → auto-cancel P3; else → P3 target).
- [ ] If verdict halt, P3 status auto-set to `cancelled` (`ck plan check 3` + frontmatter edit) with reason; no user confirmation required.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| L1 preload conflicts with Globo's variant-image swap | Preload `media[0]` only (matches media-order default); test color switch post-fix |
| L2 wrong size-adjust values introduce shift instead of preventing it | Compute via Malte Ubl's fallback metric tool; don't guess |
| L3 `contain-intrinsic-size` wrong heights cause CLS at scroll-in | Measure natural heights first; verify scroll trace post-fix |
| L4 bundle breaks cascade order, regresses styling | Hand-concat preserves order; visual diff on preview before merging |
| L6 dead-code removal breaks an edge case | Test on edge PDP (many variants) + Globo color switch in three states |
| Median moves from 42 → 88 (within striking distance but not 90) | Don't stop short — proceed to P3 with the NEXT bottleneck, not a re-do of L1 |
| Single-run variance flatters the fix | Median-of-3 is mandatory — single-run improvement is NOT a halt signal |

## Open questions

- None pre-implementation; P1's report drives lever choice.
