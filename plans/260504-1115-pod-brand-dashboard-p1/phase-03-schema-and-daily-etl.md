# Phase 03 — Schema + Daily ETL

**Status:** completed (code-complete; user smoke against real Supabase + tokens pending) · **Est:** 10-12h · **BlockedBy:** 02 · **Blocks:** 04, 05

## Completion summary (2026-05-05)
- Branch `phase-03-schema-and-etl` in pod-dashboard repo, ready to merge.
- 74 connector tests still pass; `tsc --noEmit` clean. No new tests (user opted out).
- 2 migrations: `0002_etl_schema.sql` (12 tables + RLS) + `0003_daily_pl_matview.sql` (matview + security_invoker view + `refresh_daily_pl()` SECURITY DEFINER RPC).
- ETL pipeline at `etl/`: 8 files (types, upsert, run-logger, 3 pull-* scripts, refresh-mv, run-daily orchestrator). `tsx` installed. `npm run etl:run-daily` script wired.
- GHA workflow `.github/workflows/daily-etl.yml`: cron 06:00 UTC + manual dispatch with workspace_id/since_date inputs.
- Code review: NEEDS_CHANGES → all 2 CRITICAL + 4 HIGH fixed before commit. Report: [code-reviewer-260505-1306](../../reports/code-reviewer-260505-1306-phase-03-etl.md).
- Critical fixes: C1 Meta config snake_case key (was failing 100% of Meta runs); C2 matview included `'refunded'` in `rev` filter (was double-counting fully-refunded orders).
- High fixes: H2 GHA shell injection via env block; H3 refund processed_at over created_at; H4 refund amount includes tax + order adjustments.
- H1 Printify unbounded fetch documented as known-debt with TODO (sort order needs validation against live API before adding early-stop).
- Phase 04 carry-over: M1-M6 + L4 from review (purchase_count rounding, parseFloat boundary validation, COGS unlinkable observability, app_subs precise proration, app_alloc in keys union, abandoned-run janitor sweep), Shopify transactions sub-fetch, Printify→Shopify order linkage validation.

## User next steps
1. Apply migrations 0002 + 0003 in Supabase SQL Editor (in order).
2. Add per-source tokens via Settings → Credentials in dashboard (saves to Vault).
3. Add GHA repo secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Manual smoke: `cd pod-dashboard && SUPABASE_SERVICE_ROLE_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx npx tsx etl/run-daily.ts --workspace=<uuid>`.
5. Verify `daily_pl` matview has yesterday's row + reconcile against spreadsheet.

## Context Links
- Plan: [plan.md](plan.md)
- Brainstorm: `plans/reports/brainstorm-260504-1115-pod-brand-dashboard.md`

## Overview
Postgres schema for raw data + a `daily_pl` materialized view that joins everything into the P&L the dashboard renders. ETL Node script (idempotent, incremental) runs daily on GHA cron + manual dispatch.

## Key Insights
- Idempotent upserts > delete-and-reload. Re-running ETL must converge.
- Materialized view refreshed at end of ETL — single source for UI queries.
- Date-keyed denormalization in `daily_pl` makes UI queries cheap (single table scan, no joins at read time).
- App subscriptions are a **manual config table** (no API). User enters once.
- Refunds are *separate rows* in Shopify, must subtract from rev correctly (don't double-count).

## Requirements

### Functional
- Daily GHA cron (06:00 UTC = 13:00 ICT) pulls last 3 days (rolling window for late corrections)
- Per-source pull writes raw rows then `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_pl`
- ETL run logs: `etl_runs (id, workspace_id, started_at, finished_at, status, rows_per_source, error)`
- Manual dispatch via `workflow_dispatch` with optional `since_date` override (used in P04 backfill too)

### Non-functional
- Daily run completes <5 min for 1 brand
- ETL never deletes rows (only inserts/updates)
- Failures are atomic per source (one source can fail, others persist)

## Architecture

### Schema (migration 0002_etl_schema.sql)
```sql
-- Raw orders
shopify_orders (
  workspace_id uuid, order_id bigint, order_number text,
  created_at timestamptz, updated_at timestamptz,
  total_price numeric, subtotal numeric, total_tax numeric,
  total_shipping numeric, currency text,
  utm_source text, utm_medium text, utm_campaign text,
  customer_id bigint, financial_status text, fulfillment_status text,
  raw jsonb,                           -- full payload for re-processing
  primary key (workspace_id, order_id)
)

shopify_order_lines (
  workspace_id uuid, order_id bigint, line_id bigint,
  product_id bigint, variant_id bigint, sku text, title text,
  quantity int, price numeric,
  printify_product_id text,            -- denormalized via product metafield
  primary key (workspace_id, order_id, line_id)
)

shopify_transactions (              -- for true Shopify fees
  workspace_id uuid, order_id bigint, tx_id bigint,
  kind text, status text, amount numeric, fee numeric,
  processed_at timestamptz,
  primary key (workspace_id, order_id, tx_id)
)

shopify_refunds (
  workspace_id uuid, order_id bigint, refund_id bigint,
  amount numeric, processed_at timestamptz,
  primary key (workspace_id, order_id, refund_id)
)

shopify_products (
  workspace_id uuid, product_id bigint, handle text, title text,
  printify_product_id text,            -- the joining key
  updated_at timestamptz,
  primary key (workspace_id, product_id)
)

-- Meta
meta_ad_insights_daily (
  workspace_id uuid, ad_account_id text, date date,
  campaign_id text, campaign_name text,
  adset_id text, adset_name text,
  ad_id text, ad_name text,
  spend numeric, impressions bigint, clicks bigint,
  meta_reported_purchases int, meta_reported_revenue numeric,
  raw jsonb,
  primary key (workspace_id, ad_account_id, ad_id, date)
)

-- Printify
printify_products (
  workspace_id uuid, shop_id bigint, product_id bigint,
  external_shopify_product_gid text,   -- maps to Shopify product
  title text, updated_at timestamptz,
  primary key (workspace_id, shop_id, product_id)
)

printify_variant_costs (             -- variant-level COGS lookup
  workspace_id uuid, shop_id bigint, product_id bigint, variant_id bigint,
  unit_cost_cents int, currency text,
  updated_at timestamptz,
  primary key (workspace_id, shop_id, product_id, variant_id)
)

printify_orders (                    -- POD-side order, for actual COGS paid
  workspace_id uuid, shop_id bigint, order_id text,
  external_shopify_order_id bigint,    -- maps back to shopify order
  total_price_cents int, total_shipping_cents int, total_tax_cents int,
  status text, created_at timestamptz,
  raw jsonb,
  primary key (workspace_id, shop_id, order_id)
)

-- Manual config
app_subscriptions (
  workspace_id uuid, id uuid default gen_random_uuid(),
  name text, monthly_cost numeric, currency text,
  active_from date, active_to date,
  primary key (workspace_id, id)
)

-- ETL bookkeeping
etl_runs (
  id uuid default gen_random_uuid(),
  workspace_id uuid, source text,        -- shopify|meta|printify|all
  started_at timestamptz, finished_at timestamptz,
  status text,                            -- running|success|partial|error
  rows_upserted int, error text,
  trigger text,                           -- cron|manual|backfill
  primary key (id)
)

etl_cursors (                            -- per-source resume cursor
  workspace_id uuid, source text, cursor jsonb, updated_at timestamptz,
  primary key (workspace_id, source)
)
```

### Materialized view `daily_pl`
```sql
CREATE MATERIALIZED VIEW daily_pl AS
WITH days AS (
  SELECT generate_series(
    current_date - 365, current_date, '1 day'::interval
  )::date AS d
),
rev AS (
  SELECT workspace_id, date(created_at AT TIME ZONE 'UTC') AS d,
         sum(subtotal) AS gross_rev, count(*) AS orders
  FROM shopify_orders
  WHERE financial_status IN ('paid','partially_refunded')
  GROUP BY 1,2
),
fees AS (
  SELECT o.workspace_id, date(t.processed_at AT TIME ZONE 'UTC') AS d,
         sum(t.fee) AS shopify_fees
  FROM shopify_transactions t
  JOIN shopify_orders o USING (workspace_id, order_id)
  WHERE t.kind = 'sale' AND t.status = 'success'
  GROUP BY 1,2
),
refunds AS (
  SELECT workspace_id, date(processed_at AT TIME ZONE 'UTC') AS d,
         sum(amount) AS refund_amount
  FROM shopify_refunds GROUP BY 1,2
),
cogs AS (                               -- Printify COGS by Shopify-order-date
  SELECT po.workspace_id,
         date(so.created_at AT TIME ZONE 'UTC') AS d,
         sum(po.total_price_cents)/100.0 AS printify_cogs
  FROM printify_orders po
  JOIN shopify_orders so
    ON so.workspace_id = po.workspace_id
   AND so.order_id = po.external_shopify_order_id
  GROUP BY 1,2
),
ad_spend AS (
  SELECT workspace_id, date AS d,
         sum(spend) AS meta_spend,
         sum(meta_reported_revenue) AS meta_reported_revenue,
         sum(meta_reported_purchases) AS meta_reported_purchases
  FROM meta_ad_insights_daily GROUP BY 1,2
),
app_alloc AS (                          -- daily allocation of monthly subs
  SELECT workspace_id, days.d,
         sum(monthly_cost / 30.0) AS app_subs_daily
  FROM days
  CROSS JOIN app_subscriptions
  WHERE days.d BETWEEN active_from AND coalesce(active_to, current_date)
  GROUP BY 1,2
),
shopify_utm AS (
  SELECT workspace_id, date(created_at AT TIME ZONE 'UTC') AS d,
         count(*) FILTER (WHERE utm_source ILIKE '%fb%' OR utm_source ILIKE '%meta%') AS shopify_utm_orders,
         sum(subtotal) FILTER (WHERE utm_source ILIKE '%fb%' OR utm_source ILIKE '%meta%') AS shopify_utm_revenue
  FROM shopify_orders WHERE financial_status IN ('paid','partially_refunded')
  GROUP BY 1,2
)
SELECT
  COALESCE(rev.workspace_id, ad_spend.workspace_id, cogs.workspace_id) AS workspace_id,
  d::date AS date,
  COALESCE(rev.gross_rev, 0) AS gross_revenue,
  COALESCE(rev.orders, 0) AS orders,
  COALESCE(refunds.refund_amount, 0) AS refunds,
  COALESCE(cogs.printify_cogs, 0) AS printify_cogs,
  COALESCE(fees.shopify_fees, 0) AS shopify_fees,
  COALESCE(app_alloc.app_subs_daily, 0) AS app_subs,
  COALESCE(ad_spend.meta_spend, 0) AS meta_spend,
  COALESCE(ad_spend.meta_reported_revenue, 0) AS meta_reported_revenue,
  COALESCE(ad_spend.meta_reported_purchases, 0) AS meta_reported_purchases,
  COALESCE(shopify_utm.shopify_utm_orders, 0) AS shopify_utm_orders,
  COALESCE(shopify_utm.shopify_utm_revenue, 0) AS shopify_utm_revenue,
  -- net profit
  COALESCE(rev.gross_rev,0) - COALESCE(refunds.refund_amount,0)
    - COALESCE(cogs.printify_cogs,0) - COALESCE(fees.shopify_fees,0)
    - COALESCE(app_alloc.app_subs_daily,0) - COALESCE(ad_spend.meta_spend,0)
  AS net_profit
FROM days
FULL JOIN rev ON ...   -- (full outer join all CTEs on workspace_id+d)
;

CREATE UNIQUE INDEX ON daily_pl (workspace_id, date);
```

### ETL script
```
etl/
├── run-daily.ts          ← entry: pulls last N days for one workspace
├── pull-shopify.ts
├── pull-meta.ts
├── pull-printify.ts
├── upsert.ts             ← shared upsert helpers
└── refresh-mv.ts
```

GHA: `.github/workflows/daily-etl.yml`
- Triggers: `schedule: '0 6 * * *'`, `workflow_dispatch` (inputs: `workspace_id?`, `since_date?`)
- Steps: checkout, setup-node, `pnpm install`, `pnpm tsx etl/run-daily.ts`
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (loads tokens from Vault at runtime)

## Related Code Files
**Create:**
- `supabase/migrations/0002_etl_schema.sql`
- `supabase/migrations/0003_daily_pl_matview.sql`
- `etl/*.ts` (tree above)
- `.github/workflows/daily-etl.yml`

**Edit:**
- `package.json` — add `etl:run-daily` script

## Implementation Steps
1. Write + run migration 0002 (raw tables, app_subs, etl_runs, etl_cursors)
2. Write + run migration 0003 (daily_pl matview + unique index)
3. `etl/upsert.ts`: typed `upsertMany(table, rows, conflict)` using Supabase admin client
4. `etl/pull-shopify.ts`: iterate orders, lines, transactions, refunds, products. Cursor stored in `etl_cursors`. Window = last 3 days for daily run; configurable via arg.
5. `etl/pull-meta.ts`: list ad accounts → for each, pull insights for last 3 days at `level=ad`
6. `etl/pull-printify.ts`: list shops → orders + products + variant_costs
7. `etl/refresh-mv.ts`: `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_pl`
8. `etl/run-daily.ts`:
   - For each workspace with credentials:
     - Insert `etl_runs (status='running')`
     - Try each `pull-*` independently; collect partial failures
     - Refresh matview
     - Update `etl_runs` with finish + status
9. Local dev: `pnpm tsx etl/run-daily.ts --workspace=<uuid> --since=2026-04-01`
10. GHA workflow file: cron + dispatch + secrets
11. Test on real workspace: yesterday's `daily_pl` row populated, numbers sane

## Todo
- [ ] Migration 0002 (raw + bookkeeping)
- [ ] Migration 0003 (matview)
- [ ] Upsert helpers
- [ ] pull-shopify (orders, lines, transactions, refunds, products+metafields)
- [ ] pull-meta (insights at ad level)
- [ ] pull-printify (orders, products, variant costs)
- [ ] refresh-mv
- [ ] run-daily orchestrator + etl_runs logging
- [ ] daily-etl.yml GHA workflow
- [ ] Real workspace smoke run

## Success Criteria
- After one run, `daily_pl` has yesterday's row with all 11 numeric columns non-null and within 1% of manual spreadsheet calc
- Re-running same window doesn't duplicate rows
- One source failing (e.g. expired Meta token) doesn't block the others; `etl_runs.status='partial'`

## Risks
- `daily_pl` join logic is non-trivial. Write a comparison script vs spreadsheet before declaring done.
- App subs daily allocation = `monthly / 30` — close enough; document the choice
- Shopify UTM filter for Meta-attributed orders uses `ILIKE '%fb%' OR '%meta%'` — fragile if user uses different UTM naming. Document, revisit in P02.

## Security
- Service role key only in GHA secrets, never in repo
- ETL job runs with workspace context — uses RLS bypass deliberately (it's a system process), but loads tokens from Vault scoped per workspace
- `raw jsonb` columns may contain PII (customer email/address) → flag in docs, redact in any export

## Next Steps
Phase 04 (90-day backfill) reuses these connectors + upserts but with a different orchestrator. Phase 05 (UI) reads from `daily_pl` only.
