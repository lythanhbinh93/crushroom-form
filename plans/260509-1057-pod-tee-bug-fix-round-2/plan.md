---
title: "pod-tee-theme Bug-Fix Sprint Round 2 — 10 issues + audit"
description: "Real-iPhone QA round 3 surfaced regressions + new issues. Variant-sync audit, cart perf refactor, mobile layouts, sweep regressions."
status: in-progress
priority: P0
effort: 9-10h active + 24h soak
repo: D:\github local\pod-tee-theme
branch: feat/bug-fix-sprint (continue from round 1)
blockedBy: []
blocks: [260508-2145-pod-tee-theme-bug-fix-sprint]
progress: "Phases 00-04 SHIPPED. Phase 05 Gates 0-2 PASSED. Phase 06 halted 2026-05-09 on Globo + optimistic-UI failures. Status refresh 2026-05-15: optimistic-UI code (dop-li-optimistic / optimisticLineUpdate / injectOptimisticAtcLine) was removed during post-halt iteration; Globo .globo-swatch-product-detail now renders visible (350x149px) on preview theme 158279991548 inside .dop-vs-slot (qa/debug-globo-state.mjs). [data-dawn-vs] wrapper kept but switched to display:none (no cascading visibility bug). Both halt failures effectively resolved. Round-5 micro-fix shipped 2026-05-18: PDP feature-variant default Globo swatch alignment (plans/260518-1300-pdp-feature-variant-default) — Playwright 2/2 + click-path test GREEN; iPhone manual deferred to Gate 3. Phase 05 ready to resume pending fresh real-iPhone QA recording."
related:
  - parent-round-1: plans/260508-2145-pod-tee-theme-bug-fix-sprint
  - bug-source: plans/reports/web-testing-260508-1904-pod-tee-theme-mobile.md
  - sweep-postfix: plans/reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json
  - research-variant-sync: plans/reports/researcher-260509-1104-shopify-variant-sync-patterns.md
  - research-cart-performance: plans/reports/researcher-260509-1104-shopify-cart-performance.md
  - red-team-review: plans/reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md
tags: [shopify, theme, dopamiles, bug-fix, ship-blocker, variant-sync, cart-performance, a11y, mobile]
created: 2026-05-09
---

# pod-tee-theme Bug-Fix Sprint Round 2

## Goal

Fix 10 issues + 1 audit task surfaced by real-iPhone QA after round-1 code-complete. Round-1 publish gated on this round shipping clean.

## Bug source

- 2 round-1 regressions (Bug #13 stars, Bug #14 eyebrow contrast — fixes ineffective)
- 8 new issues from iPhone walkthrough (mobile QA round 3): variant→image desync, ATC text duplication, cart full-reload, ATC perceived lag, mobile layouts (3), price block desync
- 1 audit task: full PDP variant-driven UI sweep per researcher 01

## Strategy

Group by file/concern, not severity. **Phase 00 (NEW)** verifies 8 load-bearing assumptions before edits start — kills round-1 pattern of fixes shipping at the wrong layer. Variant-sync overhaul (Phase 01) covers PDP audit + sticky-mobile-ATC + 3 issues in one pass. Cart perf (Phase 02) does Issues F+G + fixes round-1 Bug #3 broken pubsub. Mobile CSS (Phase 03) and sweep regressions (Phase 04) surgical. Phase 05 verifies AGAINST a deploy-confirmed preview.

**Round-3c retry (Phase 06):** round-3b's optimistic UI was reverted after 4 iterations failed to converge — likely cause was iOS Safari cache OR DOM-selector silent throws (no diagnostic surface). Phase 06 ships visible build-tag + error overlay (verification fixes) + JSON-island data source (root-cause fix) + CLS hide+reveal (R3-1 fix per Gate 2 reviewer). Single deploy, single screen-recording verification cycle. **Deployed 2026-05-09 ~17:30 ICT to preview theme 158279991548.** Preview URL: `https://rfeixb-dd.myshopify.com?preview_theme_id=158279991548`. All code-side items complete (Steps 1-8 checkboxes); awaiting user iPhone verification of build-tag visibility, no error overlays, optimistic line + spinner visible, and CLS < 0.1 with Globo enabled.

## Red-team findings integrated

The plan was reviewed and 4 critical false assumptions surfaced:
1. Phase 04 targeted wrong file — tokens live in `dopamiles-tokens.liquid`, not `dopamiles-shared.css`. Existing `--dop-low: #C84A2A` token already covers the use case.
2. Phase 02 `cart-icon-bubble` cannot be swapped via Section Render API — header inlines the icon as `<a id="cart-icon-bubble">`, no section reference. Manual count update from `cart.item_count` JSON.
3. Phase 02 cartUpdate pubsub never publishes today — `dopamiles-cart.js:323` intercepts every submit, bypassing Dawn's product-form.js. Round-1 Bug #3 fix is already broken. Must `publish(PUB_SUB_EVENTS.cartUpdate, cart)` manually in cart.js.
4. Phase 01 dismissed `dopamiles-mobile-sticky-atc` — it IS rendered (`templates/product.json:263-266`) and IS variant-dependent.

Plus medium issues: listener leaks in `bindDrawerEvents()`, `show(0)` fallback preservation, preview-deploy verification gate. All addressed in revised phases.

## Phases

| # | Phase | Owner | Issues fixed | Effort |
|---|-------|-------|--------------|--------|
| 00 | [Pre-flight verification](phase-00-pre-flight.md) | code | 8 assumption checks | ~20 min |
| 01 | [PDP variant-sync overhaul](phase-01-pdp-variant-sync-overhaul.md) | code | D, E, H + audit + sticky-ATC | ~120-150 min |
| 02 | [Cart performance refactor](phase-02-cart-performance-refactor.md) | code | F, G + Bug #3 pubsub fix | ~90 min |
| 03 | [Mobile layouts](phase-03-mobile-layouts.md) | code | A, B, C | ~30 min |
| 04 | [Sweep regressions](phase-04-sweep-regressions.md) | code | #13, #14 (audit + fix) | ~45 min |
| 05 | [Re-verification + publish](phase-05-reverify-and-publish.md) | code+user | 5-gate verification + funnel test + 24h soak | ~3-4h active + 24h soak |
| 06 | [Round-3c perception + CLS](phase-06-round-3c-perception-cls.md) | code+user | G + F retry, R3-1 fix | ~75 min |

**Total estimated:** 9-10h active sequential + 24h soak window. Round-1 estimate pattern (under by 2×) corrected. Phase 05 expanded per user request "verify carefully again, no rush, result is first priority" — added 5 explicit gates (deploy / code QA / reviewer / user real-device / publish+soak), 10 new sub-steps (multi-product matrix, slow-3G smoke, cart edges, in-app browser, console+network gate, memory leak, independent reviewer, rollback dry-run, funnel test, 24h soak with 1h/6h/24h checkpoints).

## Dependencies

- Phase 00 blocks all others — its verification outputs are inputs to 01-04.
- Phase 01-04: independent file ownership, no overlap.
- Phase 05 blocks on all 00-04 complete + round-1 Phase 01 admin done.
- Round-1 publish gated on this round-2 Phase 05 sign-off.

## File ownership matrix

| Phase | Files |
|-------|-------|
| 00 | (read-only) |
| 01 | `sections/dopamiles-product-hero.liquid`, `sections/dopamiles-mobile-sticky-atc.liquid`, `assets/dopamiles-pdp.js` |
| 02 | `assets/dopamiles-cart.js`, `assets/product-form.js` (read-only check) |
| 03 | `assets/dopamiles-collection.css`, `assets/dopamiles-footer.css` |
| 04 | `snippets/dopamiles-stars.liquid`, `snippets/dopamiles-tokens.liquid` (token alias only, optional), `assets/dopamiles-shared.css`, `assets/dopamiles-pdp.css`, `assets/dopamiles-collection.css`, `assets/dopamiles-journal.css`, `assets/dopamiles-utility.css`, `assets/dopamiles-home.css`, `assets/dopamiles-3pack.css`, `assets/dopamiles-account*.css`, `assets/dopamiles-components.css`, `assets/dopamiles-feedback.css`, `assets/dopamiles-journal-article.css`, `assets/dopamiles-pages-static.css` (per Phase 00 sweep table) |
| 06 | `layout/theme.liquid`, `sections/dopamiles-product-hero.liquid` (append-only — JSON island + CLS wrapper, does NOT touch existing inline syncVariant IIFE), `assets/dopamiles-cart.js`, `assets/dopamiles-cart.css` |

Phase 03 + Phase 04 both touch `dopamiles-collection.css` → run Phase 03 first (toolbar+grid), then Phase 04 (eyebrow color rule). No line overlap.

## Out of scope

| Item | Why |
|------|-----|
| URL `?variant=` deep-linking | Researcher 01 says defer (no analytics need yet) |
| Section Rendering API for variant sync | Manual JS patching is faster, all variant data already client-side |
| Footer Bug #1 (3 menus identical) | User admin task in round-1 Phase 01, not code |
| pdp.css de-dup | Carry-over from round 1 follow-up |
| Bundle widget per-variant pricing | Out of scope; flagged for follow-up |

## Success criteria

**Code:**
- All 10 issues + audit checklist verified on iPhone preview that **provably reflects branch HEAD**
- comprehensive-sweep.spec.mjs: <20 findings, 0 P0/P1, **across 3+ products** (multi-product matrix)
- Lighthouse mobile: CLS<0.1, a11y≥0.95, perf≥0.85 on home + PDP
- Cart-page qty change: <500ms (was 1500ms+) — measured on **real iPhone over cellular**
- ATC drawer-open: <500ms (was 750ms+) — measured on real iPhone over cellular
- Slow-3G full PDP→checkout-start path <8s
- PDP first-load: gallery + price + ATC text + sticky-ATC price all match selected variant on page load
- 0 axe-core violations on `.dop-stars` + eyebrow elements
- Round-1 Bug #3 toast cancellation fires (cartUpdate pubsub publishes from cart.js)
- Cart edge cases (empty/single/sold-out/qty→0/max-stock/bundle/multi-tab) all pass
- Build tag visible on preview + content changes per deploy (round-3c cache-bust verification)
- Optimistic ATC line item visible in drawer before /cart/add.js response (screen-recorded)
- Qty +/- price-cell shows spinner during fetch (screen-recorded)
- PDP CLS <0.1 (R3-1 resolved per Gate 2 reviewer recommendation)
- 0 instances of red error overlay during user screen recording (no silent throws in optimistic UI)

**Reviewer + User QA:**
- Independent code-reviewer agent: APPROVED or APPROVED_WITH_CONCERNS
- Real iPhone Safari smoke: all 10 issues + round-1 regression pass (NO emulation fallback)
- Instagram + Facebook in-app browser: same checklist passes
- Console + network errors during smoke: zero unexplained
- Memory leak check: listener count stable after 20× qty +/-

**Publish + soak:**
- Rollback dry-run completed <60s before relying on it
- Round-1 Phase 01 admin tasks confirmed done before publish
- Live smoke + Meta-ad funnel test pass post-publish (4 pixel events fire)
- 24h soak: clean at 1h, 6h, 24h checkpoints
- Verification report committed with all 19 mandatory sections incl. known limitations

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bundled `sections=` response shape differs in production | Med | Med | Defensive `.sections?.[name]` with fallback to separate fetch |
| `window.dopSyncVariant` race with Globo app re-renders | Low | Med | Idempotent — calling syncVariant repeatedly is safe |
| Mobile grid `auto-flow: dense` reorders product cards visually | Med | Low | Test at 320-414px, fall back to hide editorial card mobile if jarring |
| Eyebrow color fix breaks contrast on photo backgrounds | Low | Med | `.doh-split-photo-tag` handled separately (scrim or solid white) |
| Cart section swap re-bind leaks listeners | Med | Med | Surface-specific re-bind (only the swapped surface gets new handlers); use `data-bound` flag or clone-replace |
| `publish(PUB_SUB_EVENTS.cartUpdate)` missing → Bug #3 fallback fires every add | High | Med | Phase 02 explicitly publishes after every success; verify in smoke |
| Preview theme stale vs HEAD → round 3 ships against wrong code | High | High | Phase 00 Step 6 verifies deploy mechanism; Phase 05 Step 0 re-verifies before sweep |
| Sticky-mobile-ATC price not in syncVariant() | High (was guaranteed before fix) | Med | Phase 01 explicit step + smoke item |
| `.dop-btn-text` class addition breaks existing CSS targeting `.dop-btn-cta span` | Low | Low | Audit shared.css + pdp.css for `.dop-btn-cta span` selectors before adding class |
| 70+ text uses of `--dop-accent` in CSS — sweep misses some | Med | Med | Phase 00 Step 2 produces full table; Phase 04 walks every row; axe re-sweep catches strays |

## Rollback plan

Branch-level rollback: `git revert` each phase commit independently (they're isolated by file).

**Discipline:** 1 commit per phase. Message format `feat(theme): phase NN — <fix>`. If a phase needs multiple commits during dev, squash before merge.

Pre-publish, the round-1 backup theme `rollback-2026-05-08-pre-bugfix` already exists from round 1 plan.

## Halt-condition

If Phase 05 surfaces a round-3 candidate (P0/P1 not introduced by round 2 but re-flagged): **halt and pause for plan reset, don't iterate inline**. Round 1 + 2 already proved that fix-on-the-fly invites regression.

## References

- Round-1 plan: [plans/260508-2145-pod-tee-theme-bug-fix-sprint/plan.md](../260508-2145-pod-tee-theme-bug-fix-sprint/plan.md)
- Variant-sync research: [plans/reports/researcher-260509-1104-shopify-variant-sync-patterns.md](../reports/researcher-260509-1104-shopify-variant-sync-patterns.md)
- Cart-perf research: [plans/reports/researcher-260509-1104-shopify-cart-performance.md](../reports/researcher-260509-1104-shopify-cart-performance.md)
- Round-1 sweep findings: [plans/reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json](../reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json)
- Red-team review: [plans/reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md](../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md)
