# Phase 05 — Per-Product P&L View — Implementation Report

## Files Created / Modified

| File | LOC | Action |
|------|-----|--------|
| `supabase/migrations/0014_product_pl_matview.sql` | 310 | created |
| `app/(app)/products/_data/get-product-pl.ts` | 224 | created |
| `app/(app)/products/_data/get-variant-breakdown.ts` | 292 | created |
| `app/(app)/products/_data/fetch-variant-breakdown-action.ts` | 64 | created |
| `app/(app)/products/_components/products-table.tsx` | 259 | created |
| `app/(app)/products/_components/variant-breakdown.tsx` | 132 | created |
| `app/(app)/products/_components/missing-cogs-variants-alert.tsx` | 32 | created |
| `app/(app)/products/page.tsx` | 78 | created |
| `app/(app)/_components/header-nav.tsx` | +1 link | edited |
| `etl/refresh-mv.ts` | 91 | edited (+ refreshProductPL + refreshAllMatviews) |
| `etl/run-daily.ts` | +2 lines | edited (refreshDailyPL → refreshAllMatviews) |
| `tests/app/products/_data/get-product-pl.test.ts` | 278 | created |
| `tests/app/products/_data/get-variant-breakdown.test.ts` | 259 | created |
| `tests/etl/refresh-mv.test.ts` | 138 | created |

## Migration 0014 Verified

Path: `d:/github local/pod-dashboard/supabase/migrations/0014_product_pl_matview.sql`

Three additions, all idempotent:

**A. `ad_product_map` stub** — empty table with `(workspace_id, ad_id, product_id)` PK, RLS select policy for members, service-role writes. Indexes on workspace and workspace+product. Phase 06 fills via UTM stitching.

**B. `product_pl` materialized view** — per `(workspace_id, product_id, date)`. CTEs: `order_lines_dated`, `product_revenue`, `order_totals`, `order_refunds`, `product_refunds`, `product_cogs`, `product_ad_spend`, `order_fees`, `product_fees`, `active_products_per_day`, `product_app_subs`. Columns: `units`, `gross_revenue`, `refunds`, `cogs`, `ad_spend`, `shopify_fees`, `app_subs`, `net_profit`. Unique index on `(workspace_id, product_id, date)` for CONCURRENT refresh. Revoke from `authenticated`; grant `product_pl_view` to authenticated, `product_pl` to service_role. RPC `refresh_product_pl()` SECURITY DEFINER, service_role only.

**C. `product_pl_view`** — `security_invoker=true`, filters by `is_workspace_member(workspace_id)`.

## Variant_id Type-Mismatch Resolution

| Column | Type | Value example |
|--------|------|---------------|
| `shopify_order_lines.variant_id` | `bigint` | `501` |
| `shopify_product_variants.variant_id` | `text` | `gid://shopify/ProductVariant/501` |
| `shopify_product_variants.printify_variant_id` | `text` | `"9001"` |
| `printify_variant_costs.variant_id` | `bigint` | `9001` |

**JOIN technique in matview:** `split_part(pv.variant_id, '/', -1)::bigint = ol.variant_id` extracts trailing numeric segment from GID and casts to bigint for comparison. Not index-safe but acceptable for matview refresh (not a hot OLTP path). Documented in migration comment.

**JOIN technique in `get-variant-breakdown.ts`:** `gidToNumber()` helper extracts trailing number from GID for in-memory map lookup — no SQL cast needed since variant metadata is fetched separately and matched in TypeScript.

## Refund-Line-Items → Product Mapping

`shopify_refunds` stores total refund amount per `(workspace_id, order_id, refund_id)` — the ETL collapses `refund_line_items` into a single `amount`. No per-line-item refund table exists in the schema.

**Strategy:** proportional allocation by line-item gross share of order subtotal:
```
product_refund_share = order_total_refund × (product_line_gross / order_subtotal)
```
Same pattern as shopify_fees pro-ration in `daily_pl`. Documented in migration comment.

## App Subs Allocation

Mirrors `daily_pl` pattern exactly: `monthly_cost / 30` per active day. Extension: divided equally across all active products (products with ≥1 unit sold that day). `active_products_per_day` CTE counts distinct product_ids per workspace per day; `product_app_subs` divides the daily allocation.

## Tests Added

**24 total new tests across 3 files:**

`tests/app/products/_data/get-product-pl.test.ts` (8 tests):
- Multi-day aggregation per product, sort order
- margin_pct calculation, null when gross_revenue=0
- Unattributed ad spend (mapped vs unmapped ad_ids)
- unmapped_variant_count passthrough
- Error propagation on product_pl_view failure
- Non-fatal degradation on title fetch failure
- Empty result when no data

`tests/app/products/_data/get-variant-breakdown.test.ts` (8 tests):
- Invalid productId throws immediately
- Empty when no order lines
- Throws on order lines query error
- Units/revenue/cogs aggregation per variant
- Proportional refund allocation
- Graceful degradation when refunds query errors
- Empty when orders outside date range
- Revenue DESC sort order

`tests/etl/refresh-mv.test.ts` (8 tests):
- refreshDailyPL: success → true, failure → false+log
- refreshProductPL: success → true, failure → false+log
- refreshAllMatviews: both pass, dailyPl fails, productPl fails, both fail

**Mock pattern note:** Supabase's query builder is a `PromiseLike`. Initial mock used a thenable that fired on every chained method call, causing timeouts. Fixed by making fluent methods return `this` while `.then/.catch/.finally` delegate to an internal `Promise.resolve(result)` — fires only when explicitly awaited.

## tsc + vitest + guard Results

- `npx tsc -p . --noEmit` → clean (no output)
- `npx vitest run` → 285 passed, 8 failed (8 failures are pre-existing in `tests/connectors/printify/orders.test.ts`, confirmed identical on stashed pre-phase-05 state)
- `npm run guard:no-service-role-in-app` → clean

## File Size Note

`get-variant-breakdown.ts` is 292 lines, slightly over the 200-line guideline. It has one cohesive responsibility (fetch + aggregate variant data for one product). Splitting into types + computation files would add artificial indirection with no readability gain. Left intact.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** All phase 05 deliverables implemented: migration 0014 (ad_product_map stub + product_pl matview + RLS view), server data fns, products page, table with expand-to-variants, ETL refresh updated. 24 new tests pass, tsc clean, guard clean.
**Concerns/Blockers:** (1) Pre-existing 8 Printify orders test failures — not caused by this phase, verified on stashed state. (2) `ad_spend` column on products page will show $0 for all products until Phase 06 fills `ad_product_map`. The "Unattributed ad spend" footer row in the table makes this gap visible to users.

---

## Follow-up: Code Review Fixes (H1, H2, M1)

**Date:** 2026-05-06
**Migration amended:** `supabase/migrations/0014_product_pl_matview.sql` (in-place; not yet applied to live Supabase)

### H1 — Refund date keying

**Root cause:** `product_refunds` CTE was keyed by `old.d` which is `(shopify_orders.created_at AT TIME ZONE 'UTC')::date` — the ORDER date. `daily_pl.refunds` keys by `(shopify_refunds.processed_at AT TIME ZONE 'UTC')::date`. Sums diverge when refund processed date differs from order date (always after the 30-day Shopify refund window kicks in).

**Before:**
```sql
product_refunds as (
  select
    old.workspace_id,
    old.product_id,
    old.d,                          -- ← order's created_at date (WRONG)
    sum(
      coalesce(orr.total_refund, 0)
      * (old.line_gross_total / nullif(ot.order_subtotal, 0))
    )::numeric(14,4) as refunds
  from (
    select workspace_id, product_id, order_id, d, sum(line_gross) as line_gross_total
    from order_lines_dated
    group by 1, 2, 3, 4
  ) old
  join order_totals ot using (workspace_id, order_id)
  left join order_refunds orr using (workspace_id, order_id)
  group by 1, 2, 3
)
```

**After:** introduced `order_product_line_shares` CTE (order-scoped line gross, no date) and joined `shopify_refunds` directly to pick up `processed_at`:
```sql
order_product_line_shares as (
  select workspace_id, product_id, order_id, sum(line_gross) as line_gross_total
  from order_lines_dated
  group by 1, 2, 3
),
product_refunds as (
  select
    opls.workspace_id,
    opls.product_id,
    (r.processed_at at time zone 'UTC')::date as d,   -- ← refund date (CORRECT)
    sum(
      r.amount
      * (opls.line_gross_total / nullif(ot.order_subtotal, 0))
    )::numeric(14,4) as refunds
  from public.shopify_refunds r
  join order_totals ot using (workspace_id, order_id)
  join order_product_line_shares opls using (workspace_id, order_id)
  group by 1, 2, 3
)
```

**`daily_pl` semantics matched:** `daily_pl.refunds` CTE uses `(processed_at at time zone 'UTC')::date` (0003 line 44) — identical date key. `product_fees` was also updated to use `order_product_line_shares` for consistency (same ratio formula, same order-scope).

---

### H2 — FROM-anchor only on product_revenue

**Root cause:** final SELECT used `FROM product_revenue pr LEFT JOIN ...`. Any (workspace_id, product_id, d) tuple present only in `product_refunds`, `product_cogs`, `product_ad_spend`, or `product_fees` was silently dropped. After H1 fix, refunds now land on the refund's `processed_at` date — that date often has no revenue, making H2 a hard blocker not just a corner case.

**Before:**
```sql
from product_revenue pr
left join product_refunds  pref using (workspace_id, product_id, d)
left join product_cogs     pc   using (workspace_id, product_id, d)
left join product_ad_spend pa   using (workspace_id, product_id, d)
left join product_fees     pf   using (workspace_id, product_id, d)
left join product_app_subs pas  using (workspace_id, product_id, d)
```

**After:** added `keys` UNION CTE anchoring the SELECT:
```sql
keys as (
  select workspace_id, product_id, d from product_revenue
  union
  select workspace_id, product_id, d from product_refunds
  union
  select workspace_id, product_id, d from product_cogs
  union
  select workspace_id, product_id, d from product_ad_spend
  union
  select workspace_id, product_id, d from product_fees
  -- product_app_subs omitted: only applies to days with revenue (derived from product_revenue)
)
...
from keys k
left join product_revenue   pr   using (workspace_id, product_id, d)
left join product_refunds   pref using (workspace_id, product_id, d)
...
```

**`daily_pl` semantics matched:** mirrors `daily_pl`'s `keys` CTE (0003 lines 88-102) exactly — union across all sources, `app_alloc` excluded from the union for the same reason.

---

### M1 — Malformed GID throws on matview refresh

**Root cause:** `split_part(pv.variant_id, '/', -1)::bigint` throws a cast error if `variant_id` has no `/` or a non-numeric tail. A single bad row in `shopify_product_variants` aborts the entire `REFRESH MATERIALIZED VIEW CONCURRENTLY` call, leaving the matview stale.

**Before:**
```sql
left join public.shopify_product_variants pv
  on  pv.workspace_id = old.workspace_id
  and split_part(pv.variant_id, '/', -1)::bigint = old.line_variant_id
```

**After:** regex guard filters out malformed GIDs before the cast:
```sql
left join public.shopify_product_variants pv
  on  pv.workspace_id = old.workspace_id
  -- M1: only join GIDs with a valid numeric tail; malformed GIDs skipped silently.
  and pv.variant_id ~ '/[0-9]+$'
  and split_part(pv.variant_id, '/', -1)::bigint = old.line_variant_id
```

Skipped rows surface in the `unmapped_variant_count` metric visible on the /products page. Pattern (A) from review — simpler than CASE WHEN, keeps rows clean.

---

### Test added — refund-only-day case

**File:** `tests/app/products/_data/get-product-pl.test.ts`

Added fixture `PL_ROWS_REFUND_ONLY_DAY` simulating product "333" with:
- Row 1 (April 1, order date): `gross_revenue=80, refunds=0, net_profit=57`
- Row 2 (April 10, refund processed_at): `gross_revenue=0, refunds=40, net_profit=-40`

Test `"includes refund-only-day rows in the rollup (H1+H2 fix verification)"` asserts:
- `rows.length === 1` (product appears exactly once after aggregation)
- `gross_revenue ≈ 80` (revenue from order date only)
- `refunds ≈ 40` (refund from its processed_at date)
- `net_profit ≈ 17` (57 + −40)
- `margin_pct ≈ 17/80`

Note: TS-layer tests cannot exercise SQL semantics directly (keys CTE and processed_at date are SQL constructs). The test verifies that the TS aggregation in `get-product-pl.ts` correctly handles rows the fixed matview will now emit — i.e., rows with `gross_revenue=0` and `refunds>0` that previously would not appear.

---

### Verification

| Check | Result |
|-------|--------|
| `npx tsc -p . --noEmit` | clean |
| `npx vitest run` | 286 passed, 8 failed (8 = pre-existing Printify failures, unchanged) |
| New refund-only-day test | pass |
| `npm run guard:no-service-role-in-app` | clean |

---

**Status:** DONE
**Summary:** H1 (refund date keying), H2 (FROM-anchor keys CTE), M1 (GID regex guard) all applied to 0014 in-place. Migration not yet applied to live — safe to amend. 286 tests pass; 1 new test for refund-only-day scenario added and passing.
