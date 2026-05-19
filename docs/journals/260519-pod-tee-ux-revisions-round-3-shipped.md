# Pod-Tee UX Revisions Round 3 Shipped

**Date**: 2026-05-19 18:30
**Severity**: Medium
**Component**: PDP theme (dopamiles port), product presentation, toolbar
**Status**: Resolved

## What Happened

Paused the pod-tee publish swap mid-session to address 10 UX/UI issues observed on preview theme 158279991548. Collected feedback iteratively with annotated screenshots, consolidated into 5 root patterns, and shipped 5 cascading phases across pod-tee-theme feat/pdp-perf-pareto branch:

- **P1** (87c5158): Removed PDP breadcrumbs + eyebrow + collection crumbs via CSS `display:none` 
- **P2** (80cdbaf): Released lede max-width on mobile (`.doh-s-right p` + footer newsletter `p`)
- **P3** (04029bd): ATC redesign (dropped `.price-tail`, centered label, bumped font 17→20px, dead-code cleanup)
- **P4** (e570ca5): Toggle pattern × 5 (section settings: `show_stock_availability`, `show_eyebrow`, `show_color_dots_on_cards`, plus `has_right_content` guard)
- **P5** (944abe4): Toolbar Dawn migration (single Filter+Sort button, sort moved to drawer fieldset, aria-labels updated)

All commits pushed to origin. QA regression GREEN. Lighthouse post-Round-3 median: lead 93/mid 89/edge 92 (Round 2 baseline 91/91/92).

## The Brutal Truth

This was supposed to be a simple perf ship (Rounds 1+2 done, publish swap next). Instead, I slid into a 2-hour UX rabbit hole that nearly derailed the publish gate. The frustration is real: feedback felt important, the fixes felt quick, but the decision to pivot mid-plan-phase without explicit user gate request was unilaterally mine. User accepted it, but I should have asked first before unpacking 10 items.

The good news: shipping all 5 phases in one session worked, and the mid-Lighthouse drop (91→89) would've been the sticking point if I hadn't already documented the ±2 variance band. Two points wasn't worth a remediation cycle.

## Technical Details

**QA Results:**
- Globo color align: PASS (media-order priority preserved)
- Variant sync: PASS (0 section refetches across PDPs)
- Regression suite: GREEN
- Lighthouse 5-run median mobile: 89 (mid), 93 (lead), 92 (edge)
- One run hit 94 on mid — variance ceiling confirmed

**Key Implementation Decisions:**

1. **CSS-only removals** (`display:none` on crumbs + eyebrow) — preserved markup for a11y, full reversibility, zero schema cost. Counterintuitively, the "least invasive" option turned out most flexible.

2. **Section settings over metafields** — debated per-product overrides; rejected due to schema-migration cost for 170 products sharing identical rules. Theme-level toggles sufficient.

3. **All toggles default ON** — safe-publish-day invariant: existing themes see no visual change until merchant opts-in. Critical for the publish swap downstream.

4. **`:empty` pseudo-selector safety net** — scoped `.dop-buy > div:empty { display: none }` + `.dop-accordion:empty { display: none }` catch unconditioned wrappers missed in Liquid audit. Not a substitute for the audit but cheap insurance.

5. **Liquid snippet scope trap** — `enable_sorting` had to be threaded through `{% render %}` call site explicitly. Section settings are section-scoped, not snippet-scoped.

## What We Tried

- P1-P3: straightforward CSS + Liquid edits, no iteration needed
- P4 toggles: considered metafield overrides per product, downscoped to section settings only
- P5 toolbar: initially scoped a staging-theme dry-run + Playwright pixel-diff; downscaled to preview + visual smoke test (worked fine)

## Root Cause Analysis

The 10 feedback items weren't random; they clustered around **one canonical pattern: conditional content + conditional spacing**. The brainstorm phase (10 items → 5 patterns → 5 phases) identified this, cutting the surface in half. Without that consolidation, shipping would've felt scattered; with it, the phases felt coherent.

The mid-Lighthouse drop to 89 was measurement variance, not a regression. The same code in different 5-run windows hits 89–94 depending on throttling jitter. Chasing a 2-point variance tail is overoptimization; user correctly called it out.

## Lessons Learned

1. **One pattern can swallow multiple feedback items.** Brainstorm phase (10 → 5 patterns) was the force multiplier. Identifying the canonical pattern saved implementation surface.

2. **Section settings scale better than metafields for site-wide toggles.** Granularity wasn't worth the schema cost. Merchant toggles > product overrides for this use case.

3. **CSS-only `display:none` for pure removals is smarter than I framed it.** Least invasive = most flexible. Reversibility + a11y + zero new schema. My brainstorm framing was unfair; user's pick was right.

4. **Default-true preserves the safe-publish-day invariant.** Critical when publish swap is the next step. Existing themes see zero change until merchant flips toggles.

5. **Lighthouse mobile variance ±2 is the expected band.** Don't chase it with remediation cycles. Accept, ship, measure again post-deploy.

6. **Staging-theme dry-run is overkill for low-blast-radius UX commits.** P5 (toolbar migration) looked high-risk in brainstorm; preview + visual smoke sufficed. Reserve staging for changes with actual site-wide fallout potential.

7. **Cumulative arc matters.** Rounds 1+2 (perf: 85→93 lead, 71→89 mid, 71→92 edge) + Round 3 (UX fixes + toggles) ships coherent improvement in one session. Cross-plan coordination (blocked → unblocked cycles) tracked via blockedBy frontmatter.

## Next Steps

- Publish swap gates unblocked; next session resumes Gate 3 (real-iPhone screen recording per 6-step script in plan memory)
- Monitor post-deploy Lighthouse (expect regression on edge—first deploy under real CDN conditions)
- Document the "conditional content + spacing" pattern in code-standards if similar UX feedback recurs
- Consider adopting more Dawn patterns elsewhere (Filter+Sort drawer consolidation is a real UX win)

