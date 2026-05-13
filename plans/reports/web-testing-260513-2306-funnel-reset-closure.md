# Funnel-reset Closure QA — 2026-05-13

**Type:** web-testing closure report
**Plan:** [`260511-1132-pod-tee-funnel-reset`](../260511-1132-pod-tee-funnel-reset/plan.md)
**Preview theme:** 158279991548 (`feat/bug-fix-sprint` HEAD `3a56d52`)
**Script:** [`visuals/web-testing-260513-2207-pod-tee-emulated-iphone-qa/qa-funnel-reset-closure.mjs`](visuals/web-testing-260513-2207-pod-tee-emulated-iphone-qa/qa-funnel-reset-closure.mjs)
**Viewport:** iPhone 14 Chromium (390×844)

## Verdict: ✅ PASS — funnel-reset is closed

**18/18 phase-specific assertions passed.** No new regressions. 2 pre-existing JS issues remain flagged (Phase 07 of successor plan fixes them).

## Phase-by-phase results

| Phase | Deliverable | Check | Verdict |
|---|---|---|---|
| 02 | Round-3c cleanup | `injectOptimisticAtcLine` purged from cart.js | ✅ |
| 02 | Round-3c cleanup | `optimisticLineUpdate` purged | ✅ |
| 03 | Bug C — collection card image | 5/5 cards have first-photo images | ✅ |
| 04 | Bug B — Globo CLS/MutationObserver | `retryUntilGloboMuted` removed | ✅ |
| 04 | Globo MutationObserver pattern | present in PDP JS | ✅ |
| 05 | dopamiles-cart.js strangler split | `dopamiles-cart-helpers.js` loaded | ✅ |
| 05 | Strangler split | `dopamiles-cart-mutations.js` loaded | ✅ |
| 05 | Strangler split | `dopamiles-cart.js` loaded | ✅ |
| 06 | product-hero JS extracted | `dopamiles-pdp-variant-sync.js` loaded externally | ✅ |
| 06 | Collection JS extracted | `dopamiles-collection.js` loaded externally | ✅ |
| 06 | Filter drawer snippet | drawer markup present in DOM | ✅ |
| 07 | Card consistency | 5/5 cards have product links | ✅ |
| 07 | a11y | 5/5 cards have `alt` on images | ✅ |
| 08 | Conditional CSS — perf pass | Zero PDP CSS leaked into collection page | ✅ |
| 09 | Locales / merchant-editable copy | "Free shipping unlocked." renders correctly | ✅ |
| 10 | dopamiles-icon snippet (today's work) | check icon path renders in cart drawer | ✅ |
| 10 | dawn-backup alt-templates removed | `?view=dawn-backup` falls back to default | ✅ |
| — | Console baseline | 0 NEW pageerrors (7 `amount is not defined` are pre-existing flagged) | ✅ |

## Pre-existing issues (carried forward to successor plan)

These are NOT funnel-reset regressions. They existed before today's session and are explicitly slated for Phase 07 of [`260513-2248-pod-tee-block-driven-theme-rebuild`](../260513-2248-pod-tee-block-driven-theme-rebuild/phase-07-publish-prep-and-ship.md):

1. `amount is not defined` pageerror × 7 — source `dopamiles-pdp-variant-sync.js:48` calls `Shopify.formatMoney` (likely overwritten by third-party app with `eval`-based variant). Fix shape: always use local switch, skip `Shopify.formatMoney`.
2. `[dop-cart] dopCartHelpers not loaded` warning — `cart-main.liquid:234` has duplicate `<script>` that executes before theme.liquid's helpers.js. Fix shape: delete duplicate tag.

## What this closure means

- **Funnel-reset plan transitions from `in-progress` → `completed`.**
- All 10 phases of funnel-reset are now verified shipped on preview theme 158279991548.
- The "publish to dopamiles.co" goal of funnel-reset is now owned by the successor plan ([`260513-2248-pod-tee-block-driven-theme-rebuild`](../260513-2248-pod-tee-block-driven-theme-rebuild/plan.md)) Phase 07.
- The successor plan's QA pipeline foundation (Phase 01 Part B) will formalize this kind of phase-specific testing into a reusable `qa/` library.

## Out of scope (intentional gaps)

- Desktop viewport not tested in this closure (will be added to successor plan's QA pipeline)
- WebKit-mobile not tested in this closure (Chromium-only; WebKit added in successor Phase 01)
- Lighthouse mobile score not benchmarked (will become regression baseline in successor Phase 01)

## Unresolved questions

None. Plan can be marked `completed`.

## Cross-plan dependency
This closure unblocks [`260513-2248-pod-tee-block-driven-theme-rebuild`](../260513-2248-pod-tee-block-driven-theme-rebuild/plan.md) Phase 01.
