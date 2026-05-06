# Phase 04 — Product Catalog Pull (Shopify products + variants)

**Status:** completed (catalog + SKU-match shipped; smoke tests user-owned) · **Est:** 6-8h · **BlockedBy:** 02 · **Blocks:** 05, 06 · **Completed:** 2026-05-06

## Context Links
- Plan: [plan.md](plan.md)
- Existing: `pod-dashboard/etl/pull-shopify.ts`, `lib/connectors/shopify/transactions.ts`
- P1 carry-over: phase-04 noted "metafields aren't returned inline by REST /products.json" → P2 fixes via GraphQL bulk

## Overview
P1 pulled `shopify_products` lightly (id, handle, title, printify_product_id) via REST. P2 pulls full product catalog including variants (size, color, sku, price, inventory) via GraphQL bulk operations — needed for the per-variant P&L view in phase-05.

## Key Insights
- Shopify GraphQL bulk operations: 5 concurrent ops/shop in 2026-01+, queries are NOT rate-limited (the result download is). One bulk query returns all products + variants + metafields in a single JSONL file.
- REST `/products.json` does NOT return metafields inline — that was the P1 blocker on per-product attribution. GraphQL bulk does (with `metafields(first: 10)` selector).
- Bulk operation is async: poll `currentBulkOperation` until status `COMPLETED`, then download URL.
- A 1000-product store completes bulk in ~30-60s. Cheaper + more complete than REST pagination.

## Requirements

### Functional
- New `lib/connectors/shopify/products-bulk.ts`: starts bulk op, polls, downloads JSONL, returns iterator over `Product` rows (each with nested variants + metafields).
- New table `shopify_product_variants` (workspace_id, product_id, variant_id, sku, title, option1/2/3, price, inventory_qty, printify_variant_id).
- `pull-shopify.ts` extended to call bulk products pull during daily ETL (cached for 24h via `etl_cursors` to avoid re-running every day; daily orders pull stays unchanged).
- Existing `shopify_products.printify_product_id` finally populated (was null in P1 due to REST limitation).

### Non-functional
- Bulk pull adds ≤2 min to daily ETL wall time per workspace.
- Idempotent: re-running same day no-ops via cursor `last_bulk_at < 24h ago`.
- Failure isolated: bulk op timeout doesn't block orders/transactions/refunds pulls.

## Architecture

```
pull-shopify.ts
  ├─ pullOrders()           ← unchanged
  ├─ pullTransactions()     ← unchanged
  ├─ pullRefunds()          ← unchanged
  └─ pullProductsBulk()     ← NEW
        ├─ check etl_cursors.shopify.products.last_bulk_at >24h?
        ├─ if yes: shopifyAdminGraphQL(MUTATION_START_BULK)
        ├─ poll(currentBulkOperation) every 5s, max 5 min
        ├─ on COMPLETED: fetch JSONL URL, stream-parse
        ├─ upsert shopify_products + shopify_product_variants
        └─ update etl_cursors

GraphQL query (start bulk):
  products {
    id, title, handle, productType, vendor, status, updatedAt
    metafields(first: 10) { namespace, key, value }     ← printify_product_id lives here
    variants {
      id, sku, title, price, inventoryQuantity
      selectedOptions { name, value }                    ← size, color
      metafields(first: 5) { namespace, key, value }    ← printify_variant_id
    }
  }
```

## Related Code Files

**Create:**
- `lib/connectors/shopify/products-bulk.ts` — start, poll, download, parse JSONL
- `supabase/migrations/0010_shopify_product_variants.sql`
- `tests/connectors/shopify-products-bulk.test.ts`

**Edit:**
- `etl/pull-shopify.ts` — add `pullProductsBulk()` step
- `etl/types.ts` — add `ShopifyProductVariantRow`

**Delete:** none (REST products call kept as fallback for non-bulk-capable shops, which is none on 2026-01 API)

## Implementation Steps
1. Migration 0010: `shopify_product_variants` table + indexes (workspace_id, product_id), RLS policies.
2. `lib/connectors/shopify/products-bulk.ts`:
   - `startBulkProductsQuery(client)` → returns op id
   - `pollBulkOperation(client, opId, timeoutMs=300000)` → returns download URL on COMPLETED, throws on FAILED
   - `parseBulkJsonl(url)` → async generator yielding rows (parent: Product, child: ProductVariant)
3. `pull-shopify.ts` add `pullProductsBulk()` callable from `pullShopify({...})`.
4. Update `etl_cursors` schema usage: `cursor.shopify.products.last_bulk_at`.
5. Unit test JSONL parser with fixture (10 products × 5 variants sample).
6. Smoke test on Brand A: verify `shopify_product_variants` populated, `printify_product_id` no longer null.
7. Re-run 12-month backfill (only the bulk products step, since orders are stable) — measure delta.

## Todo
- [x] Migration 0012 variants table + RLS (replaces 0010)
- [x] products-bulk.ts (start, poll, download, parse) — modularized into 3 files
- [x] pull-shopify.ts integration
- [x] etl_cursors usage updated
- [x] JSONL parser unit test (12 tests, all pass)
- [~] Brand A smoke — user-owned-operational
- [~] Brand B smoke — user-owned-operational

## Success Criteria
- After one daily ETL run on Brand A: `shopify_product_variants` has rows for every active product variant.
- `shopify_products.printify_product_id` populated for ≥80% of POD products (rest = unmapped products, surfaced in missing-cogs alert).
- Re-running same day: `etl_runs.rowsUpserted` for products = 0 (cursor skip works).
- Bulk op timeout (simulate by killing): partial failure logged, other Shopify pulls still complete.

## Risks
- **Bulk op stuck in CREATED forever:** existing 5-min polling cap + cursor skip on next run; document.
- **Metafield namespace varies per store:** make namespace configurable per workspace via `workspace_credentials.config.printify_metafield_namespace` (default `pod_dashboard`).
- **JSONL row order: parent before children, but interleaved across products:** parser must group by `__parentId`. Unit test covers this.
- **Inventory data large + volatile:** stripped to `inventoryQuantity` integer only; no historical snapshots.
- **Carried from Phase 02:** design orphan-detection predicate for `printify_variant_costs` prune (currently no-op; see prune-old-snapshots.ts `pruneOrphanVariantCosts()`). Requires staging-table approach to compare current ETL run's variant set against live table.

## Security
- RLS on new table: same workspace_id filter pattern as siblings.
- Bulk op JSONL URL is short-lived signed Shopify URL; do not log full URL.

## Code Review & Follow-ups

**Score: 7.8/10** — Caught 3 fixes:
- **H1 (REST upsert clobbering bulk's printify_product_id):** Fixed via `Omit<>` pattern in pull-shopify.ts REST path. REST row type omits `printify_product_id` so ON CONFLICT DO UPDATE never touches it.
- **H2 (metafield false-positive when referenced variant absent):** Fixed via catalog index lookup + SKU fallback + warning. Bad metafield now falls through to SKU match instead of returning silent false-positive.
- **M3 (stamp-source mismatch — effectively critical):** Fixed by moving stamping to `pullPrintify`. `last_etl_run_id` now stamped with Printify run ID at row level, removing `stampEtlRunId` from Shopify bulk pull entirely. Without this, on second prune cycle after Printify run, ALL `printify_variant_costs` rows would be deleted as stale (Shopify run IDs ≠ Printify run IDs).

**Migration drift corrected:** Plan said 0010; actual is 0012 (variants table + last_etl_run_id) + 0013 (sku column on printify_variant_costs). The migration numbering error was caught and corrected by the contributor.

**SKU-match activation:** Was DOA on first impl (read all-null SKUs from printify_variant_costs because column didn't exist). Migration 0013 added the column; 2-line fix in pull-printify.ts + pull-shopify-products-bulk.ts activated end-to-end mapping.

**Test results:** 54 phase tests pass; 261/269 total (8 pre-existing Printify failures, unrelated).

**Deferred to polish phase:** M1 (extractNumericId malformed GID), M2 (op-id mismatch log spam), M4 (parser unbounded buffer — OOM risk at 50k+ products), M5/M6 (polling sleep order, cursor JSONB merge), L1-L4 (precision, case sensitivity, majority-vote clarity, metafield limit).

## Next Steps
Phase 05 builds the per-product P&L view that joins these variants to orders + COGS + Meta spend.
