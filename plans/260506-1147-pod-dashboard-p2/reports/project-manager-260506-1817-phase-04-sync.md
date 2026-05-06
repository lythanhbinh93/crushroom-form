# Phase 04 Sync — POD Dashboard P2

**Date:** 2026-05-06 18:17 UTC
**Phase:** 04 — Product Catalog Pull + SKU-Match
**Status:** COMPLETE (codeable; live SKU-match validation user-owned)

---

## Summary

Phase 04 shipped: GraphQL bulk catalog pull, SKU-match mapping (metafield + variant SKU), and orphan prune activation. 54 new tests pass. Code review 7.8/10 — H1, H2, M3 fixes applied post-review. Migrations 0012 + 0013 (variants table + SKU column). Bulk operation failure isolation verified.

**Ready for Phase 05 (product P&L view).**

---

## Deliverables Completed

| Item | Status | Notes |
|------|--------|-------|
| Migration 0012 | ✓ | `shopify_product_variants` + `last_etl_run_id` tracking |
| Migration 0013 | ✓ | `printify_variant_costs.sku` column + index |
| Bulk product pull (3 modules) | ✓ | start, poll, parse — 419 LOC total |
| SKU-match mapping | ✓ | metafield override, SKU match, unmapped detection |
| Orphan prune activation | ✓ | `last_etl_run_id` stamped by Printify pull (not Shopify) |
| ETL integration | ✓ | `pull-shopify.ts` wired; failure isolated |
| Tests | ✓ | 54 new tests; 261/269 total (8 pre-existing unrelated failures) |
| TypeCheck | ✓ | 0 errors |
| Guard check | ✓ | No service-role leak |

---

## Code Review Fixes (Post-Ship)

**Score: 7.8/10.** Three correctness issues fixed:

1. **H1 — REST upsert overwrites bulk `printify_product_id`:** Fixed via `Omit<>` pattern in `pull-shopify.ts`. REST row type omits the field; `ON CONFLICT DO UPDATE` never touches it. Prevents daily NULL-ing of product mapping on cursor-skip days.

2. **H2 — Metafield false-positive on bad variant ID:** Fixed via catalog index lookup. When metafield references a Printify variant not in catalog, fall through to SKU match + warning instead of silent false-positive. Prevents missing COGS in P&L.

3. **M3 — Stamp-source mismatch (critical):** `last_etl_run_id` now stamped by Printify pull with Printify run ID at row level. Removed blanket-UPDATE stamp from Shopify bulk pull. Without fix: on second prune-after-Printify-run cycle, ALL `printify_variant_costs` rows deleted as stale (Shopify run IDs ≠ Printify run IDs). 

---

## Test Coverage

**Phase 04 Tests: 54 passing**
- `products-bulk-parse.test.ts` — 12 tests (ordered + interleaved JSONL, metafields, errors)
- `sku-match.test.ts` — 22 tests (all 4 resolution paths, null SKU handling, migration 0013 live catalog)
- `prune-old-snapshots.test.ts` — 20 tests (flag transitions, dry-run, orphan detection)

**Total suite: 261 passed, 8 failed** (pre-existing Printify orders connector, unrelated to Phase 04)

---

## Migration Drift Corrected

Plan specified migration `0010` for variants table. Actual: **0012 + 0013** (4th time drift caught and corrected by contributor).
- 0012: variants table + ETL tracking (schema + RLS + indexes)
- 0013: SKU column on Printify costs (idempotent, partial index on non-null SKUs)

SKU-match was DOA on first impl (null SKUs from printify_variant_costs). Migration 0013 + 2-line fixes in `pull-printify.ts` + `pull-shopify-products-bulk.ts` activated live mapping.

---

## Risk Closure

- ✓ Bulk operation failure isolated: try/catch in `pull-shopify.ts` prevents block of orders/transactions ETL
- ✓ JSONL parser handles arbitrary child-before-parent ordering (real Shopify output varies)
- ✓ SKU collision detection + warning (flags ambiguous mappings)
- ✓ Orphan prune predicate fixed (M3): won't mass-delete on second cycle

---

## Plan Updates

1. **phase-04-product-catalog-pull.md**
   - Status header: `pending` → `completed (catalog + SKU-match shipped; smoke tests user-owned)`
   - Todo checkboxes: Migration 0012/0013, bulk modules, SKU-match, parser tests all checked
   - Smoke tests marked `[~]` user-owned-operational
   - Added "Code Review & Follow-ups" section with 7.8/10 finding summary + deferred items

2. **plan.md**
   - Phase 04 row: `pending` → `completed (catalog + SKU-match shipped; smoke tests user-owned)`
   - Migration registry extended: Phase 04 entries 0012 + 0013

3. **phase-05-product-pl-view.md**
   - Requirements: added "Variants without `printify_variant_id` must be surfaced in missing-cogs alert; do not silently exclude"

4. **phase-07-soak-and-ship.md**
   - Risks: added "Catalog pull bulk operation must succeed ≥3 consecutive days per brand before ship-gate"

---

## Unresolved Questions

None. Phase 04 codeable; Phase 05 unblocked.

---

**Status:** ✓ PHASE 04 COMPLETE
**Action:** Phase 05 (product P&L view) ready to start. Phase 07 risk updated with bulk operation stability gate.
