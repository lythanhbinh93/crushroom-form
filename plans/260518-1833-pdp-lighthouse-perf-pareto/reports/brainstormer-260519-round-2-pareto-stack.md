---
title: "PDP Perf Round 2 — Pareto Stack (CSS bundle + content-visibility + preconnect)"
generatedAt: 2026-05-19
trigger: "user shared Lighthouse Insights screenshots and asked 'can we improve performance more?'"
upstream: plans/260518-1833-pdp-lighthouse-perf-pareto (Phases 1-4 closed; 5-run preview median 90/89/89)
risk_priority: brand-visual-regress-css-cascade-bugs
recommended_next: /ck:plan
---

# PDP Perf Round 2 — Pareto Stack (CSS bundle + content-visibility + preconnect)

## Problem statement

Round 1 (`260518-1833`) closed with 5-run preview-side medians **90 / 89 / 89** (lead / mid / edge) and a GREEN real-iPhone gate. Mid and edge sit 1 pt shy of the strict every-PDP 90 gate.

User shared Lighthouse Insights from a dev-browser run and asked "can we improve more?". Brutal honesty needed: most of the alarming red numbers in those screenshots come from local Chrome extensions, not theme code.

## Lighthouse Insights — true 1st-party vs. extension noise

| Insight | Lighthouse claim | Real theme cost |
|---|---|---|
| Reduce unused JavaScript | **847 KiB** | **26 KiB** (Shopify WPM only — platform, can't remove) |
| Minify JavaScript | **237 KiB** | **0 KiB** (every line traces to Chrome extensions) |
| Reduce JS execution time | **2.1 s** | **~1.5 s** real (HTML parse + WPM + perf-kit + trekkie); rest is Bubble + Similarweb + logHelper extensions |
| Page prevented bfcache | 4 reasons | **0 actionable**: preview-bar unload (gone on live), Shopify `cache-control: no-store` default, `window.open` from Etsy extension |
| Forced reflow | 21 ms across sources | 3 ms in `dopamiles-header.js` (theme) — too small to chase |
| Improve image delivery | 23 KiB save on lead | ~8-12 KiB real on retina; lead already passes 90 |
| Network dependency tree | Critical path 2,502 ms; >4 preconnects flagged | Actionable: 1 unused preconnect to `fonts.shopifycdn.com` |

## True theme-owned levers (ranked by plausible gain × low risk)

1. **L4 — Bundle 7 site-wide CSS files into one** (200-400 ms LCP/FCP, +2-4 pts/PDP, **medium cascade risk**)
2. **content-visibility on 6 below-fold sections** (+1-3 pts on TBT, **low risk**, CSS-only)
3. **Remove unused preconnect** to `fonts.shopifycdn.com` (frees a connection slot, **zero risk**)

## Levers explicitly skipped (with reason)

- **Lead image right-size**: 23 KiB Lighthouse claim assumes 1× DPR; real save on retina is ~10 KiB; lead already passes 90 gate
- **Forced-reflow in `dopamiles-header.js`**: 3 ms cost; not worth the dive
- **Inline product-hero JS extraction**: race-condition risk with `syncVariant()` / variants JSON island; already slim per memory observation 707
- **`cache-control: no-store` removal**: Shopify default for PDPs; not in theme's control
- **Anything "Unattributable" with chrome-extension URLs in the breakdown**

## Approach decision matrix

User chose: **"Pareto stack — L4 + content-visibility + preconnect kill"** with risk priority = "brand visual regress / CSS cascade bugs".

Tension acknowledged: chosen path includes the highest-cascade-risk lever (CSS bundle) AND user's top-priority avoid-mode is cascade bugs. Resolution: rollout ordered low→high risk with cascade-bug safeguards on step 3.

## Recommended solution — 3-step rollout

### Step 1 — Kill unused `fonts.shopifycdn.com` preconnect

- File: `layout/theme.liquid:15` (the `{%- unless settings.type_header_font.system? and settings.type_body_font.system? -%}` block)
- Effort: 5 min
- Risk: zero
- Measurement: none required (trivial)

### Step 2 — `content-visibility: auto` on 6 below-fold sections

- Append CSS to `assets/dopamiles-pdp.css`:
  ```css
  [id*="__dopamiles-fbt"],
  [id*="__dopamiles-niche-favorites"],
  [id*="__dopamiles-reasons"],
  [id*="__dopamiles-more-from-niche"],
  [id*="__dopamiles-reviews-placeholder"],
  [id*="__dopamiles-faqs"] {
    content-visibility: auto;
    contain-intrinsic-size: auto 800px;
  }
  ```
- Targets Shopify section ID prefixes (`<div id="shopify-section-template--XXX__dopamiles-fbt">`) — verified zero existing CSS targets that wrapper
- **Pre-deploy probe:** measure real section heights from a live PDP via Playwright; if any section is meaningfully different from 800px (>30%), set per-section `contain-intrinsic-size` values
- Deploy → 5-run baseline → regression suite (Globo align + media-order + 0 section refetches)
- Halt if every-PDP median ≥ 90; else continue to Step 3
- Effort: 30-40 min
- Risk: low (additive on Shopify wrapper; no existing selector to override)

### Step 3 — Bundle 7 site-wide CSS files

Concat in EXACT `theme.liquid` order:
1. `dopamiles-components.css`
2. `dopamiles-feedback.css`
3. `dopamiles-shared.css`
4. `dopamiles-search.css`
5. `dopamiles-cart.css`
6. `dopamiles-cart-drawer-ui.css`
7. `dopamiles-bundle.css`

Output: `assets/dopamiles-critical.css` (site-wide).
**Leave `dopamiles-pdp.css` + `component-product-variant-picker.css` separately gated to product templates** — smaller blast radius.

**Cascade-bug safeguards** (matches user's top risk priority):
- **Concat via a build script** committed to repo, reading a manifest file. Reproducible, diffable. Re-runs idempotently.
- **Staging-theme dry-run**: clone preview theme 158279991548 to a new unpublished theme; push bundle there first.
- **Visual regression QA**: Playwright screenshots of 5 templates (home, PDP, collection, cart, blog) × 3 viewports (mobile / tablet / desktop), pre/post diff. Pixel-diff threshold. If any diff exceeds tolerance, **abort and analyze before promoting to 158279991548**.
- **One-commit rollback**: bundle commit replaces 7 `<link>` tags atomically; revert restores them.
- Only ship to 158279991548 after staging-theme diff is clean.
- Effort: 40-90 min
- Risk: medium (cascade order, file order, encoding)

### Halt rule

After Steps 2 and 3 → 5-run baseline + regression suite. If every-PDP median ≥ 90 STRICT, stop. Don't pile on the next step.

## Plausible final state

| PDP | Current | After Step 1 | After Step 2 | After Step 3 |
|---|---:|---:|---:|---:|
| Lead | 90 | 90 | 91-92 | 92-94 |
| Mid | 89 | 89 | 90-91 | 91-93 |
| Edge | 89 | 89 | 90-91 | 91-93 |

Step 2 likely clears the strict gate; Step 3 is insurance + headroom.

## Implementation considerations

- All work continues on `pod-tee-theme @ feat/pdp-perf-pareto` branch (already exists)
- Theme Access token rotation still pending; will need a fresh token for Step 3 deploy if user rotated after Round 1
- Regression suite (`plans/260514-1230-pod-tee-publish-and-js-fixes/qa/perf-probe-feature-variant.mjs`) re-runs unchanged
- Baseline harness (`plans/260518-1833-pdp-lighthouse-perf-pareto/qa/lighthouse-baseline.mjs`) re-runs unchanged

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| CSS bundle changes cascade order subtly → visual bug on home/collection | Build via script, exact-order concat, Playwright pixel-diff QA on 5 templates × 3 viewports BEFORE promoting bundle to preview theme |
| `contain-intrinsic-size 800px` is wrong for some sections → scroll-in CLS | Measure real heights from live PDP first; set per-section values if needed |
| Step 3 ships and tanks live perf | Staging-theme dry-run isolates the test; one-commit rollback recovers in <2 min |
| Iterations exceed budget on diminishing returns | Halt rule after each step; do NOT chain to Step 3 if Step 2 clears gate |

## Success criteria

- 5-run mobile Lighthouse median ≥ 90 on EVERY PDP individually (strict)
- Globo + media-order regression: 0 changes from current GREEN state
- Visual diff between staging-bundle theme and current preview: zero pixel-diff exceeding tolerance across 5 templates × 3 viewports
- Real-iPhone perception still acceptable on a 1-minute spot-check (full 6-step gate not required again — already GREEN in Round 1)

## Next step

Hand off to `/ck:plan` for phased plan scaffolding. Plan dir naming will be a Round-2 sibling of `260518-1833-pdp-lighthouse-perf-pareto`.

## Open questions

- Does Step 3's "staging-theme dry-run" use a CLI clone of theme 158279991548, or a manual duplicate via Shopify admin? CLI clone is faster but requires Theme Access token to be active. Defer to plan phase.
- Does the user want Round 2 to also produce a live-side measurement after publish (as an optional confirmation), or stop at preview-side strict gate? Defer to plan phase.
