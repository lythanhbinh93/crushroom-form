---
title: "pod-tee-theme Bug-Fix Sprint — 19 Bugs Pre-Publish"
description: "Fix all P0/P1/P2 bugs found in mobile QA sweep. File-grouped + parallel admin to ship today/tomorrow."
status: in-progress
priority: P0
effort: 2-3h
repo: D:\github local\pod-tee-theme + Shopify Admin
branch: TBD (likely feat/bug-fix-sprint in pod-tee-theme)
blockedBy: []
blocks: []
related:
  - parent-port: plans/260507-1306-dopamiles-full-theme-port
  - bug-source: plans/reports/web-testing-260508-1904-pod-tee-theme-mobile.md
  - strategy: plans/reports/brainstorm-260508-2139-pod-tee-bug-fix-strategy.md
tags: [shopify, theme, dopamiles, bug-fix, ship-blocker, a11y, cls]
created: 2026-05-08
---

# pod-tee-theme Bug-Fix Sprint

## Goal

Fix 19 bugs (8 P0 + 6 P1 + 5 P2; 1 deferred) blocking pod-tee-theme launch. Ship within 24h.

## Bug source

Comprehensive mobile QA sweep (10 pages × 2 viewports + axe-core + Lighthouse + 6-product template audit). Full bug list with selectors + screenshots: [plans/reports/web-testing-260508-1904-pod-tee-theme-mobile.md](../reports/web-testing-260508-1904-pod-tee-theme-mobile.md).

## Strategy

File-grouped over severity-first — open each file once, fix all its bugs. Wave 1 (user, Shopify Admin) runs parallel with Wave 2 (me, code) to shave 30 min.

Strategy doc: [plans/reports/brainstorm-260508-2139-pod-tee-bug-fix-strategy.md](../reports/brainstorm-260508-2139-pod-tee-bug-fix-strategy.md).

## Phases

| # | Phase | Owner | Bugs fixed | Effort |
|---|-------|-------|-----------|--------|
| 01 | [Shopify Admin tasks](phase-01-shopify-admin-tasks.md) | user | #1, #5, #11, #19a | ~30 min |
| 02 | [Shared CSS extraction + 5 fixes](phase-02-shared-css-extraction.md) | me | #8, #9, #10, #12, #14 | ~45 min |
| 03 | [Liquid + JS surgery (variant, ATC, search, a11y)](phase-03-liquid-js-surgery.md) | me | #3, #4, #6, #7, #13, #15 | ~75 min |
| 04 | [PDP CLS fix](phase-04-pdp-cls-fix.md) | me | #2 | ~20 min |
| 05 | [Verification + publish](phase-05-verification-publish.md) | both | (regression check) | ~30 min |

**Total estimated:** 3-3.5h with parallel Wave 1.

## Dependencies between phases

- Phase 01 (admin) runs **parallel** with Phase 02-04. Must finish before Phase 05.
- Phase 02 (shared CSS) must finish before Phase 04 (PDP CLS edits same stylesheet area).
- Phase 03 sub-tasks can reorder freely; search modal is biggest sub-task (~30-45 min).
- Phase 05 unblocks publish only after all P0/P1 verified passing on preview.

## Out of scope

| Bug | Why deferred |
|-----|-------------|
| #18 blog has 0 posts | Editorial content task, not theme code |
| #16 `/account/login` meta-refresh | Shopify-side, can't fix in theme |
| #17 PDP scroll length / redundant sections | Editorial consolidation, multi-hour work; defer post-ship |
| #19 free-ship math $35.55 vs expected $35.01 | Verify against prod data; possibly intentional rounding |

## Success criteria

- ✅ Lighthouse mobile PDP: CLS < 0.1, a11y ≥ 0.95, perf ≥ 0.85
- ✅ Footer 3 columns show distinct content
- ✅ Search overlay opens as styled modal (not raw text in promo bar)
- ✅ Color/size click on PDP swaps gallery image
- ✅ ATC click → success toast (not stuck `…`)
- ✅ Italic accent renders orange across home + PDP `<em>` in headings
- ✅ Mobile nav drawer dims background
- ✅ All sampled products use `dopamiles-product-hero` (incl. Fastest Pace)
- ✅ axe-core scan: 0 critical/serious violations on home + PDP + cart + collection
- ✅ Real-iPhone smoke test passes via preview URL

## Risks

| Risk | Mitigation |
|------|-----------|
| Globo app tier doesn't allow option-level disable | CSS `.globo-options-fields { display: none }` fallback |
| Bulk product template assignment too many | Run GraphQL audit first; if >10, scripted; if ≤10, manual |
| Search modal CSS focus-trap edge cases | Mirror Dawn baseline `9ccdacf8` structure |
| Newsletter button contrast brand-shift | Decide inline: darken `--dop-accent` or use lighter background variant |

## Rollback plan

If post-publish issue surfaces: revert via Shopify theme version control (`Online Store → Themes → Older versions → Restore`). Pre-publish, save current `dopamiles-bundle-prod-260508` as a duplicate named `rollback-2026-05-08-pre-bugfix`.

## Status as of 2026-05-08 EOD

**Overall progress:** 8 of 19 bugs shipped. Phases 02–04 code-side complete on branch `feat/bug-fix-sprint`; Phase 01 admin tasks & Phase 05 verification pending user action.

**Phases shipped (code):**
- **Phase 02** (Shared CSS extraction + 5 fixes) → COMPLETED
  - Created `assets/dopamiles-shared.css` (155 lines, de-duped Globo block)
  - Added `<link>` for shared.css to `layout/theme.liquid`
  - Bugs fixed: #8 (italic accent via :where() selector), #9 (product card links), #10 (drawer dim), #12 (newsletter button contrast), #14 (eyebrow contrast), #7 (newsletter heading color)
  - Note: pdp.css de-dup intentionally deferred per risk mitigation strategy (both stylesheets load for first push)

- **Phase 03** (Liquid + JS surgery) → COMPLETED
  - Bug #3 (ATC stuck "…"): wrapped {%- form 'product' -%} in <product-form> element; added 4s fallback timer with PubSub cancellation for toast
  - Bug #4 (variant→media swap): added data-media-id to gallery slides + custom dop:variant-media-change event dispatcher in dopamiles-pdp.js
  - Bug #6 (search overlay raw text): discovered root cause was missing search.css global load; one-line fix in theme.liquid (NOT full Dawn rebuild)
  - Bug #13 (review stars): added role="img" to .doh-stars span
  - Bug #15 (progress bar): added aria-label + aria-progressbar attrs to .doc-progress

- **Phase 04** (PDP CLS fix) → COMPLETED
  - Added aspect-ratio: 1/1 to .dop-gallery and [data-dop-slide] in dopamiles-pdp.css
  - Added min-height: 2.5rem to .dop-price-row
  - Verified <img> width/height attrs already present in dopamiles-gallery.liquid

**Phases pending (user-owned):**
- **Phase 01** (Shopify Admin tasks) → PENDING — footer menus, three-pack page, product template assignment, Globo config
- **Phase 05** (Verification + publish) → PENDING — user smoke-tests on real iPhone, runs Lighthouse, publishes after Phase 01 completes

**Key discovery:** Search modal CSS issue was one-line theme.liquid fix, NOT the full Dawn <details-modal> rebuild originally scoped. Variant gallery wiring used custom event + data attributes (dopamiles-specific), diverging from original Dawn-modal plan due to Dopamiles using proprietary [data-dop-slide] divs instead of <media-gallery>.

**Code-reviewer sign-off:** Two passes; ship-blockers fixed (variant→image no-op, ATC toast race). Second pass clean.

**Follow-up item:** Deferred pdp.css de-dup to Phase 05 post-publish (per risk mitigation). Schedule for next sprint.

## References

- Bug list source: [plans/reports/web-testing-260508-1904-pod-tee-theme-mobile.md](../reports/web-testing-260508-1904-pod-tee-theme-mobile.md)
- Strategy doc: [plans/reports/brainstorm-260508-2139-pod-tee-bug-fix-strategy.md](../reports/brainstorm-260508-2139-pod-tee-bug-fix-strategy.md)
- Lighthouse JSON: [plans/reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/lighthouse-pdp.json](../reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/lighthouse-pdp.json)
- axe-core findings: [plans/reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json](../reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json)
- Parent theme port plan: [plans/260507-1306-dopamiles-full-theme-port/plan.md](../260507-1306-dopamiles-full-theme-port/plan.md)
