# Phase 05 — dopamiles-cart.js Strangler Split

**Status:** pending
**Owner:** code
**Effort:** L (4-6h)
**Depends on:** Phase 02 (dead code removed first)

## Goal
Strangle `dopamiles-cart.js` (754 LOC → ~410 LOC main + 2 sibling files). Add dedupe guards, surface refresh failures, surface 422 inventory errors. No behavior change; pure structural refactor + 3 small bug fixes.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 8 | P0 | assets/dopamiles-cart.js (entire) | 754 LOC mixing 5+ concerns | Strangler: extract `dopamiles-cart-helpers.js` + `dopamiles-cart-mutations.js`. No file >450 LOC |
| 27 | P1 | assets/dopamiles-cart.js:582-608 | `bindDrawerSurface`/`bindPageSurface` re-attach without dedupe — stacked listeners on partial swaps | Add `if (btn.dataset.bound) return; btn.dataset.bound = '1';` OR event delegation on `.dop-cart-lines` |
| 28 | P1 | assets/dopamiles-cart.js:316-342 | `refreshDrawer` swallows fetch errors silently | Surface via existing `#dop-cart-err-banner` element |
| 50 | P2 | assets/dopamiles-cart.js:32-40 | `DOMParser.parseFromString` called twice per response (lines 496 + 512) | Parse once per response, pass parsed doc to helper |
| 65 | P2 | assets/dopamiles-cart.js:262-274 | `changeCartItem` 422 (over-stock) only logged | Surface via `#dop-cart-err-banner` |

## Files
| Path | Change |
|---|---|
| assets/dopamiles-cart.js | edit — keep load-bearing fns, drop `bindDrawerEvents` alias, add dedupe + error-surfacing |
| assets/dopamiles-cart-helpers.js | create — `escapeHtml`, `updateBubbleCount`, `publishCartUpdate`, `parseSectionDoc` (~80 LOC) |
| assets/dopamiles-cart-mutations.js | create — `swapSection`, `applyCartMutation`, bundled section parsing (~150 LOC) |
| layout/theme.liquid | edit — register two new asset_url tags after dopamiles-cart.js |

## Steps
1. Create `dopamiles-cart-helpers.js`: move `escapeHtml`, `updateBubbleCount`, `publishCartUpdate`, add `parseSectionDoc(html)` returning DOMParser doc (fixes #50). Export to `window.dopCartHelpers`.
2. Create `dopamiles-cart-mutations.js`: move `swapSection`, `applyCartMutation` + bundled section parsing logic. Consume `dopCartHelpers.parseSectionDoc`. Export to `window.dopCartMutations`.
3. In `dopamiles-cart.js`: remove extracted fns; reference via `window.dopCartHelpers` + `window.dopCartMutations`.
4. Add dedupe in `bindDrawerSurface`/`bindPageSurface` (#27): `if (btn.dataset.bound) return; btn.dataset.bound = '1';` on each `addEventListener`.
5. In `refreshDrawer` catch + non-ok branches: render error into `#dop-cart-err-banner` (#28).
6. In `changeCartItem`/`handleQtyChange` catch: parse Shopify 422 response body, surface message into `#dop-cart-err-banner` (#65).
7. Delete unused `bindDrawerEvents` alias (cart.js:623).
8. Register 2 new asset files in `layout/theme.liquid` head, in order: helpers → mutations → cart.js.
9. Bump build-tag.

## Gate (real iPhone verification)
- ATC works (drawer opens with real line, bubble +1).
- Qty +/− works.
- Qty stepper +1 past stock → red error banner appears with Shopify's "out of stock" message.
- Remove works.
- Upsell add works.
- Discount apply works.
- Open + close drawer 3× → DevTools listener count does not grow.
- No file in repo >450 LOC for these three. Build-tag visible, bumped.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores 754-LOC monolith.

## Risks
| Risk | Mitigation |
|---|---|
| Load order breaks `window.dopCart*` references | Register helpers → mutations → cart.js explicitly in theme.liquid head; add console warn if undefined |
| `dataset.bound` flag survives DOM replacement | Section Render swap REPLACES DOM nodes; new nodes start without flag — exactly desired behavior |
| 422 body shape varies (Shopify Plus + apps inject) | Defensive parse with fallback message: try `body.message \|\| body.description \|\| 'Unable to update cart'` |
| Bundled section parsing edge case missed during extraction | Re-test all 3 mutation paths (ATC, qty, remove) before merging |
| `parseSectionDoc` now shared — bug propagates to both callers | Acceptable; one place to fix vs two |
