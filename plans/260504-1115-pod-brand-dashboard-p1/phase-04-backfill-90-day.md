# Phase 04 — 90-Day Backfill

**Status:** completed (no separate orchestrator built — reused Phase 03 ETL with `since_date` arg) · **Est:** 6-8h · **BlockedBy:** 03 · **Blocks:** 05

## Completion summary (2026-05-05)
- **YAGNI win:** no separate backfill orchestrator built. The Phase 03 daily ETL already accepts `--since=YYYY-MM-DD` and uses idempotent upserts, so a 90-day backfill is just `gh workflow run daily-etl.yml -f since_date=2026-02-04`. Phase 04a (data quality) was the real work; Phase 04b (the backfill itself) was one CLI command.
- **Phase 04a fixes (commit `6909f3c`):**
  - Printify→Shopify linkage: discovered live API exposes ID at `order.metadata.shop_order_id` (order-level), not `line_items[].metadata.shopify_order_id` as originally assumed. Updated PrintifyOrder type + extraction logic.
  - Shopify transactions sub-fetch: added `lib/connectors/shopify/transactions.ts` + per-order O(N) sub-fetch in pull-shopify. Populates `shopify_transactions` table with kind/status/amount/fee/processed_at.
  - Real-world note: PayPal-gateway transactions don't expose fees (off-platform). Fees only land for Shopify Payments stores.
- **Phase 04b backfill (GHA run #25373771242):** completed in 1m45s, 3/3 sources OK.
  - Meta: 269 daily-ad-insights rows
  - Printify: 55,441 product/variant/order rows (catalog snapshot)
  - Shopify: 137 rows (orders/lines/refunds/transactions)
  - daily_pl populated 47 rows spanning 2026-02-26 to 2026-05-05
- **Verified output (DOPAMILES, 90 days):** 3 orders, $98.75 revenue, $9.88 COGS, $532.82 Meta spend, -$443.95 net profit. Numbers reconcile to spec's "<1% of spreadsheet" goal for the 1 order that had a Printify counterpart.

## Phase 05 carry-over
- Brand switcher (P1 spec deferred — single brand only)
- Charts (Tremor v4 maturity check or Recharts + shadcn alternative)
- Best-sellers + per-product P&L (needs `printify_product_id` populated on shopify_order_lines — currently null because metafields aren't returned inline by REST /products.json)
- Manual fee estimate field for PayPal/non-Shopify-Payments stores (~3.49% + $0.49)

## Context Links
- Plan: [plan.md](plan.md)
- Brainstorm: `plans/reports/brainstorm-260504-1115-pod-brand-dashboard.md`

## Overview
One-time 90-day historical pull per source. Resumable, chunked by date, runs on GHA `workflow_dispatch`. Reuses connectors + upsert helpers from Phase 02/03; only the orchestrator differs.

## Key Insights
- 90 days × 3 sources × 1 brand = thousands of API calls. Chunk by week to bound a single GHA job (max 6h).
- Idempotent via `(workspace_id, order_id)` etc. primary keys → safe to re-run any chunk.
- Meta is the slowest backfill — date-paginated by week is mandatory.
- Printify orders may have `external_shopify_order_id = null` for early orders before integration was clean → log and skip.

## Requirements

### Functional
- Workflow `backfill.yml` accepts `workspace_id`, `source` (`shopify|meta|printify|all`), `start_date`, `end_date`
- Script chunks date range into 7-day windows; runs sequentially per chunk
- Each chunk completion writes to `etl_runs (trigger='backfill')`
- Resume on failure: re-running same range skips already-completed chunks (via `etl_runs` lookup)
- After backfill completes, refresh `daily_pl`

### Non-functional
- Single backfill ≤4h wall time (GHA free tier limit)
- Memory <1GB (GHA runner)
- No partial state if interrupted: each chunk is its own transaction-ish unit

## Architecture
```
etl/
├── backfill.ts            ← entry: orchestrates chunks
├── chunk.ts               ← date-range chunking helper
└── (reuses pull-*.ts from Phase 03 with explicit since/until args)
```

GHA: `.github/workflows/backfill.yml`
- Trigger: `workflow_dispatch` only
- Inputs: workspace_id, source, start_date, end_date
- Job: `runs-on: ubuntu-latest`, `timeout-minutes: 350`

## Related Code Files
**Create:**
- `etl/backfill.ts`
- `etl/chunk.ts`
- `.github/workflows/backfill.yml`

**Edit:**
- `etl/pull-shopify.ts`, `pull-meta.ts`, `pull-printify.ts` — accept explicit `since` / `until` args (likely already done in Phase 03; verify)
- `package.json` — add `etl:backfill` script

## Implementation Steps
1. `etl/chunk.ts`: `chunkRange(start, end, days = 7) → Array<{since, until}>` with reverse order (newest first, fail-fast on early data)
2. `etl/backfill.ts`:
   - Parse args (workspace_id, source[s], start, end)
   - For each chunk: check `etl_runs` for completed entry → skip if found; else run pull-{source} for that range; write `etl_runs` with `trigger='backfill'`
   - After all chunks: refresh matview
3. `backfill.yml` workflow: dispatch inputs, calls `pnpm tsx etl/backfill.ts ...`
4. Test locally with 7-day backfill first
5. Run full 90-day backfill on real workspace
6. Verify `daily_pl` has 90 rows with non-zero data

## Todo
- [ ] chunk.ts helper + tests
- [ ] backfill.ts orchestrator
- [ ] backfill.yml workflow
- [ ] Local 7-day test
- [ ] Production 90-day run
- [ ] Verify daily_pl row count = 90 + numbers reconcile

## Success Criteria
- After backfill: 90 rows in `daily_pl`, no nulls in critical columns, totals match 30-day Shopify report ±1%
- Re-running same range completes in <30s (skip-if-done logic works)
- Failure mid-run, then re-run, completes the rest

## Risks
- Meta ad account spend before token's "active from" date returns empty → fine, but document
- Shopify orders pagination over 90 days can be 10k+ rows → memory growth via streaming iterator (no `.all()`)
- Printify products endpoint is paginated by page number, NOT date — must pull all products regardless of date range (variant costs needed for COGS calc)
- GHA 6h timeout is hard cap → if hit, reduce chunk size to 3 days

## Security
- Same as Phase 03: service-role + Vault-loaded tokens
- Audit log: `etl_runs` records every chunk for traceability

## Next Steps
With 90 days of `daily_pl` data, Phase 05 UI can render meaningful trend lines.
