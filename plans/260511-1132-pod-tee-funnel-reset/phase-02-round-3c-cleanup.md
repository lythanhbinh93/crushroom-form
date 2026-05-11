# Phase 02 — Round-3c Rejection Cleanup

**Status:** pending
**Owner:** code
**Effort:** M (3-4h with verification)
**Depends on:** none (pre-requisite for all downstream phases)

## Goal
Rip out every artifact of the rejected round-3c optimistic-UI experiment. Delete dead helpers, dead CSS block, and the JSON island that fed them. Nothing else changes — pure subtraction.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 1 | P0 | assets/dopamiles-cart.js:105-114 | `showInjectError` red banner (preview-debug for rejected flow) | Delete fn + all callers |
| 2 | P0 | assets/dopamiles-cart.js:145-207 | `injectOptimisticAtcLine` rejected optimistic flow | Delete fn + line 678 caller |
| 3 | P0 | assets/dopamiles-cart.js:222-237 | `optimisticLineUpdate` rejected qty optimistic | Delete fn + line 411 caller; drop `rollback` plumbing in `handleQtyChange` (409-422) |
| 4 | P0 | assets/dopamiles-cart.css:710-754 | §12 round-3c CSS (`.dop-li-price-pending`, `.dop-li-optimistic`, `@keyframes dop-spin`, `@keyframes dop-li-enter`) | Delete §12 block |
| 5 | P0 | sections/dopamiles-product-hero.liquid:202-231 | `<script type="application/json" id="dop-product-data">` JSON island | Delete entire script island + surrounding comments |
| 43 | P2 | assets/dopamiles-cart.js:107-114 | `showInjectError` duplicate-citation safety | Confirmed deleted via #1 |

## Files
| Path | Change |
|---|---|
| assets/dopamiles-cart.js | edit — delete 4 fns + 3 call sites + escapeHtml if no other caller |
| assets/dopamiles-cart.css | edit — delete §12 block (lines 710-754) |
| sections/dopamiles-product-hero.liquid | edit — delete JSON island (lines 202-231) + line 196 comment |

## Steps
1. Grep `injectOptimisticAtcLine|optimisticLineUpdate|showInjectError|dop-li-optimistic|dop-li-price-pending|dop-product-data` to confirm zero external callers.
2. Delete `showInjectError` (cart.js:105-114) + its 2 call sites (lines 154, 159).
3. Delete `injectOptimisticAtcLine` (cart.js:145-207) + call site (line 678 inside `bindAddToCartInterceptor`).
4. Delete `optimisticLineUpdate` (cart.js:222-237) + call site (line 411 inside `handleQtyChange`). Remove `rollback` variable and any try/catch rollback plumbing tied to it.
5. Delete `escapeHtml` (cart.js:123) ONLY if no remaining callers after #2-4.
6. Delete §12 block in cart.css (710-754).
7. Delete JSON island in product-hero.liquid (202-231) + comment at line 196.
8. Bump build-tag version.

## Gate (real iPhone verification)
- PDP → ATC → drawer opens with REAL line item (no flash of "optimistic" line).
- Qty +/− works; no `.dop-li-price-pending` spinner appears (it's gone).
- No red error banner ever appears.
- `console.error` count = 0 on a happy-path session.
- Build-tag visible, bumped.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores pre-phase baseline (all deletions land in one commit).

## Risks
| Risk | Mitigation |
|---|---|
| `escapeHtml` still used by something | Grep before deletion; keep if any caller remains |
| `rollback` plumbing has subtle catch-block dependency | Run qty +/- 422-error path (over-stock) and verify error banner appears |
| Hidden listener on `#dop-product-data` JSON island in third-party app | Grep `dop-product-data` across all assets; confirm theme-internal only |
| Cart drawer fails to refresh after ATC because of removed rollback branch | Confirm `applyCartMutation` happy path still runs unchanged |
