# Phase 05 — Per-Product P&L View

**Status:** pending · **Est:** 6-8h · **BlockedBy:** 02, 04 · **Blocks:** 06, 07

## Context Links
- Plan: [plan.md](plan.md)
- P1 daily_pl: `supabase/migrations/0003_daily_pl_matview.sql`
- P1 dashboard pattern: `app/(app)/page.tsx` + `app/(app)/_data/get-pl-summary.ts`

## Overview
P1 ships date-range P&L. P2 adds a sortable product table: per-product revenue, units sold, COGS, ad spend (attributed via phase-06 mapping), net profit, with expand-to-variants drill-down.

## Key Insights
- Reuse the `daily_pl` mat-view pattern: build a `product_pl` mat-view keyed by (workspace_id, product_id, date).
- Ad spend attribution to product is the hard part — phase-06 owns the mapping table; phase-05 LEFT JOINs it (NULL = unattributed bucket shown separately).
- Variants drill-down is server-rendered on demand (per-product API route) — not pre-aggregated, keeps mat-view light.
- Sorting + filtering = client-side on the product table (small N: typical brand has <500 active products).

## Requirements

### Functional
- New page `/products` (server component): sortable table of products.
- Columns: title, units_sold, gross_revenue, refunds, cogs, ad_spend (attributed), net_profit, margin_%.
- Filters: date range (reuses date-range-picker), only-with-orders toggle.
- Row click → expands to variant breakdown (size/color × revenue/units/cogs).
- "Unattributed ad spend" row at bottom: total Meta spend not mapped to a product.
- **Variants without `printify_variant_id` (unmapped) must be surfaced in missing-cogs alert; do not silently exclude from product list.**

### Non-functional
- Page first paint <800ms for 500-product brand at 30-day range.
- Sorting client-side (no server roundtrip).
- Variant drill-down ≤300ms.

## Architecture

```
Migration 0011_product_pl_matview.sql:

CREATE MATERIALIZED VIEW product_pl AS
WITH order_lines_dated AS (
  SELECT ol.workspace_id, ol.product_id, ol.variant_id,
         date(o.created_at AT TIME ZONE 'UTC') AS d,
         ol.quantity, ol.price * ol.quantity AS line_revenue
  FROM shopify_order_lines ol
  JOIN shopify_orders o USING (workspace_id, order_id)
  WHERE o.financial_status IN ('paid','partially_refunded')
),
product_revenue AS (
  SELECT workspace_id, product_id, d,
         sum(quantity) AS units, sum(line_revenue) AS revenue
  FROM order_lines_dated GROUP BY 1,2,3
),
product_cogs AS (
  -- Map line variants to printify variant cost; if missing, fall back to printify_orders allocation
  SELECT ol.workspace_id, ol.product_id, date(o.created_at AT TIME ZONE 'UTC') AS d,
         sum(ol.quantity * (pvc.unit_cost_cents / 100.0)) AS cogs
  FROM shopify_order_lines ol
  JOIN shopify_orders o USING (workspace_id, order_id)
  LEFT JOIN shopify_product_variants pv
    ON pv.workspace_id = ol.workspace_id AND pv.variant_id = ol.variant_id
  LEFT JOIN printify_variant_costs pvc
    ON pvc.workspace_id = pv.workspace_id
   AND pvc.variant_id = pv.printify_variant_id::bigint
  WHERE o.financial_status IN ('paid','partially_refunded')
  GROUP BY 1,2,3
),
product_ad_spend AS (
  -- Joins phase-06 ad_product_map: ad_id → product_id; sum spend per product per day
  SELECT m.workspace_id, m.product_id, mai.date AS d,
         sum(mai.spend) AS ad_spend
  FROM ad_product_map m
  JOIN meta_ad_insights_daily mai USING (workspace_id, ad_id)
  GROUP BY 1,2,3
)
SELECT pr.workspace_id, pr.product_id, pr.d AS date,
       pr.units, pr.revenue,
       COALESCE(pc.cogs, 0) AS cogs,
       COALESCE(pa.ad_spend, 0) AS ad_spend,
       pr.revenue - COALESCE(pc.cogs,0) - COALESCE(pa.ad_spend,0) AS net_profit
FROM product_revenue pr
LEFT JOIN product_cogs pc USING (workspace_id, product_id, d)
LEFT JOIN product_ad_spend pa USING (workspace_id, product_id, d);

CREATE UNIQUE INDEX ON product_pl (workspace_id, product_id, date);

CREATE VIEW product_pl_view WITH (security_invoker=true) AS
SELECT * FROM product_pl WHERE is_workspace_member(workspace_id);
```

```
app/(app)/products/
  page.tsx                        ← server: parses date range, fetches aggregates
  _components/
    products-table.tsx            ← client: sortable, expandable
    variant-breakdown.tsx         ← client: shown on row expand
  _data/
    get-product-pl.ts             ← SUM rollup over date range
    get-variant-breakdown.ts      ← per-product per-variant aggregates
```

## Related Code Files

**Create:**
- `supabase/migrations/0011_product_pl_matview.sql`
- `app/(app)/products/page.tsx`
- `app/(app)/products/_components/products-table.tsx`
- `app/(app)/products/_components/variant-breakdown.tsx`
- `app/(app)/products/_data/get-product-pl.ts`
- `app/(app)/products/_data/get-variant-breakdown.ts`

**Edit:**
- `app/(app)/_components/header-nav.tsx` — add Products link
- `etl/refresh-mv.ts` — also refresh `product_pl`
- Daily ETL `run-daily.ts` — refresh both matviews

**Delete:** none

## Implementation Steps
1. Migration 0011: matview + unique index + RLS view. Note: depends on `ad_product_map` (phase-06) — create as empty table FIRST in 0011 (phase-06 fills it), so matview compiles.
2. `etl/refresh-mv.ts` extend to refresh `product_pl` as well; daily ETL refreshes both.
3. Server data fns: `get-product-pl(workspaceId, range)` returns rolled-up rows per product; `get-variant-breakdown(workspaceId, productId, range)` returns per-variant.
4. Products page: render `<ProductsTable>` with rows.
5. Client table: sortable columns (use `useState` + sort fn; no library).
6. Row expand: fetch variant breakdown via server action or RSC streaming.
7. Smoke test on Brand A: verify rows match handful of known products from Shopify admin.

## Todo
- [ ] Migration 0011 (matview + ad_product_map empty stub)
- [ ] refresh-mv updated to refresh both matviews
- [ ] get-product-pl + get-variant-breakdown
- [ ] /products page + table
- [ ] Variant breakdown expansion
- [ ] Header nav link
- [ ] Brand A smoke

## Success Criteria
- Top product by net profit on Brand A matches owner's intuition (sanity check).
- Sum(product_pl.revenue) on date range = daily_pl.gross_revenue (within rounding).
- Variant drill-down shows correct size/color split for a known multi-variant product.
- Page renders <800ms first paint (server timing log).
- Switching brand via dropdown changes table to other brand's products with no leak.

## Risks
- **Ad spend attribution coverage low at launch:** phase-06 ships UTM gap report; products page shows "Unattributed: $X" line so user sees the gap explicitly.
- **Variant cost missing → cogs = 0 → inflated net:** existing missing-cogs alert covers this; reuse on /products top.
- **Matview refresh slow:** product_pl JOIN volume = order_lines (~30k/brand/year). Acceptable; refresh time logged in `etl_runs`.
- **Refunds not allocated to products in this view (V1):** explicitly out of scope; net = revenue - cogs - ad_spend, not minus refunds. Document. P3 may add.

## Security
- RLS view enforces workspace boundary.
- No service-role in app/.

## Next Steps
Phase 06 fills `ad_product_map` with real attribution data so the `ad_spend` column lights up.
