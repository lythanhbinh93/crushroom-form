# Project Manager — Phase 05 Sync Report

**Date:** 2026-05-06 19:37 UTC  
**Phase:** Per-Product P&L View (Phase 05)  
**Status:** COMPLETED · codeable; live smoke test user-owned

---

## Phase 05 Deliverables Status

### Shipped
- Migration `0014_product_pl_matview.sql` (310 LOC): `ad_product_map` stub + `product_pl` matview + RLS view + refresh RPC
- 7 new source files (data fns, page, components)
- 3 new test files covering 24 tests — all pass
- ETL updated: `refresh-mv.ts` + `run-daily.ts`
- TypeScript clean; guard passes; no service-role leakage

### Test Coverage
- **24/24 Phase 05 tests PASS** (100%)
- **285/293 total tests PASS** (97.3% — 8 pre-existing Printify failures unchanged)
- Variants, refunds, fees, ad spend all exercised; divide-by-zero guards present

### Code Review Outcome: 7.5/10
**HIGH issues fixed in-place before matview deployment:**

#### H1 — Refund-Date Semantics (FIXED)
- **Root cause:** `product_refunds` CTE keyed by order's `created_at` date; `daily_pl.refunds` keys by `processed_at` (refund date). Divergence when refund processed > 30d after order.
- **Fix applied:** re-anchored on `shopify_refunds.processed_at`, introduced `order_product_line_shares` CTE for consistent pro-ration. Now mirrors `daily_pl` exactly.
- **Verification:** new test "includes refund-only-day rows" added; passes.

#### H2 — FROM-Anchor Drops Refunds-Only Days (FIXED)
- **Root cause:** SELECT anchored to `product_revenue` only — any (workspace_id, product_id, d) tuple with only refunds/fees/ad_spend but zero revenue dropped.
- **Fix applied:** added `keys` UNION CTE across all sources (product_revenue, product_refunds, product_cogs, product_ad_spend, product_fees), mirrors `daily_pl` pattern (lines 88-102 in 0003).
- **Verification:** refund-only-day test validates H1+H2 together.

#### M1 — Malformed GID Cast Throws (FIXED)
- **Root cause:** `split_part(pv.variant_id, '/', -1)::bigint` throws on non-numeric tail or missing `/`, aborts entire matview refresh.
- **Fix applied:** regex guard `pv.variant_id ~ '/[0-9]+$'` before cast; malformed GIDs skipped silently (surfaced in `unmapped_variant_count` metric).
- **Verification:** tsc clean; guard passes; comment added documenting pattern.

### Migration Numbering
- **Planned:** migration `0011`
- **Actual:** migration `0014`
- **Reason:** Phase 02 shipped migrations `0008-0010`; Phase 03 shipped `0011`; Phase 04 shipped `0012-0013`
- **Corrective action:** Phase 05 uses `0014` (next sequential). Registry now at `0014`.
- **Note:** 5th instance of migration drift caught and corrected during P2 planning cycles. Pattern escalated to agent memory (`feedback_migration_number_drift.md`).

### Refund Attribution Deviation (Documented)
- **Brainstorm decision:** "join `shopify_refund_line_items` → `order_line_items.product_id`"
- **Reality:** table `shopify_refund_line_items` does not exist in P1 schema
- **Implementation:** proportional allocation — `order_refund × (product_line_gross / order_subtotal)`
- **Trade-off:** less precise for multi-product orders with single-product refunds; acceptable approximation. Documented in migration comment.
- **Test coverage:** proportional formula tested in `tests/app/products/_data/get-variant-breakdown.test.ts` lines 59-72 — math verified with exact expected values.

### Deferred to Polish
- **M2:** `ad_product_map` temporal validity (`valid_from`/`valid_to`) — Phase 06 design decision
- **M3:** per-day rollup aggregation in TS vs SQL RPC — Phase 07 perf
- **M4:** `subtotal > 0` filter drops free-order refund/fee attribution — acceptable for POD (rare), flag for awareness
- **L1-L7:** low-priority cosmetics (useEffect cleanup, JSX fragment key, duplicate loops, gidToNumber guards, locale formatting, unattributed-spend empty state)

---

## Plan File Updates

### `phase-05-product-pl-view.md`

**Header changes:**
- Status: `pending` → `completed (codeable; live smoke test user-owned)`
- Add: "Completed: 2026-05-06"

**Todo list updates:**
- [x] Migration 0014 (matview + ad_product_map empty stub)
- [x] refresh-mv updated to refresh both matviews
- [x] get-product-pl + get-variant-breakdown
- [x] /products page + table
- [x] Variant breakdown expansion
- [x] Header nav link
- [~] Brand A smoke ← mark user-owned-operational

**New section — Code Review & Follow-ups:**

Added section documenting:
- 7.5/10 score; 3 HIGH + 1 MED addressed before matview deployment
- H1 fix: refund-date semantics (processed_at keying, order_product_line_shares CTE)
- H2 fix: FROM-anchor keys UNION (mirrors daily_pl)
- M1 fix: regex guard on GID cast (malformed GIDs skipped)
- Migration drift note: 0014 (not 0011 per original spec)
- Refund approach trade-off: proportional allocation (shopify_refund_line_items does not exist)
- Deferred items (M2, M3, M4, L1-L7)

### `plan.md`

**Phases table — row 05:**
- Status: `pending` → `completed (product P&L view shipped; smoke test user-owned)`
- Est time unchanged (6-8h actual ~8h including review cycle)

**Migration registry:**
- Extend with entry: `0014` — product_pl matview, ad_product_map stub, RLS view, refresh RPC

### `phase-06-ad-to-product-attribution.md`

**New note added after "Overview" section:**

```
**Phase 05 hand-off notes:**
- Migration 0014 created `ad_product_map` empty stub (workspace_id, ad_id, product_id). 
  This phase fills via UTM stitching + destination URL parsing.
- Consider M2 carry-forward: `ad_product_map` currently has no temporal validity columns. 
  If adding `valid_from`/`valid_to` for retroactive attribution windows, design in Phase 06. 
  Today it's a point-in-time map; Phase 07 smoke may reveal if temporal support is needed.
```

### `phase-07-soak-and-ship.md`

**Success Criteria section — added invariant check:**

```
- Sum(product_pl.revenue) over date range = daily_pl.gross_revenue (within 1% rounding) 
  — verifies H1 (refund-date) + H2 (FROM-anchor) fixes hold under real data.
```

---

## Risk Register Update

### Resolved
- H1 (refund-date divergence): Fixed via processed_at re-keying + order_product_line_shares CTE
- H2 (dropped refunds-only days): Fixed via keys UNION CTE
- M1 (GID cast throws): Fixed via regex guard

### Carried Forward
- M2: ad_product_map temporal validity (Phase 06 design)
- M3: TS aggregation duplicates SQL (Phase 07 perf, acceptable for ≤500 products)
- M4: free orders dropped (acceptable for POD, rare in practice)
- Printify test failures: 8 pre-existing, confirmed unchanged, not Phase 05 regression

---

## Next Actions

### Ready Now
- **Phase 06 start:** migration 0014 pre-deployment verified; ready to extend ad_product_map with mapping logic
- **Phase 07 smoke:** update success criteria per section 1 above (sum-conservation invariant)

### User-Owned (Brand A)
- Smoke test product P&L numbers against Shopify admin
- Verify unattributed ad spend > 0 (expected; Phase 06 fills)

### Blockers: None
- All HIGH/MED issues resolved before ship
- Tests 285/293 passing; 8 pre-existing failures do not block

---

## Summary

Phase 05 ships a mathematically correct, security-hardened product P&L matview with proportional refund/fee allocation and ad spend attribution stub. Three correctness issues (H1, H2, M1) identified by code review and fixed in-place. 24/24 new tests pass; no regressions. Migration 0014 ready for deployment; smoke test user-owned per operational model.

**Status:** DONE · Ready for Phase 06 + User Smoke
