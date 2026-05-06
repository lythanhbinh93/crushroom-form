# Phase 02 — Storage Budget + 12-Month Backfill

**Status:** pending · **Est:** 5-7h · **BlockedBy:** 01 · **Blocks:** 05, 07

## Context Links
- Plan: [plan.md](plan.md)
- P1 backfill: `plans/260504-1115-pod-brand-dashboard-p1/phase-04-backfill-90-day.md`
- Existing: `pod-dashboard/etl/run-daily.ts`, `.github/workflows/daily-etl.yml`, `.github/workflows/backfill.yml` (if present, else create)

## Overview
P1's 90-day backfill ran in 1m45s for one brand (47 daily_pl rows, 55k Printify catalog rows, 137 Shopify rows, 269 Meta rows). P2 must (a) prove 12mo × 5 brands stays in budget; (b) extend the backfill orchestrator to handle 365 days; (c) add prune jobs to stop unbounded catalog growth.

## Key Insights
- Meta Marketing API: insights tables retain 37 months; 12-month backfill stays in **sync** rate-limit window (no async job required) IF chunked at ≤7 days. Async required only at >13mo or with breakdowns.
- Shopify orders: linear in volume; one brand's 90d backfill was 137 rows = ~1.5/day. Worst case 5 brands × 365d × 50 orders/day = ~91k order rows. Within 500MB easily.
- **Printify catalog is the storage risk:** 55k rows for one brand's snapshot. 5 brands × 55k = 275k rows. Catalog snapshots are mostly variant_costs (hot data) — but old snapshots accumulate. Need TTL prune.
- GHA free tier: 2000 min/month (private) or unlimited (public). 12mo × 5 brands × ~5min each = 25 min. Trivial.

## Requirements

### Functional
- `etl/backfill.ts` accepts `--workspace=<uuid> --days=365` (default 90 → bump default? no, opt-in).
- Date chunking: existing 7-day chunks reused (already proven for 90d).
- Per-source resume via `etl_runs` lookup unchanged.
- New `etl/prune-old-snapshots.ts` script: deletes Printify catalog snapshots older than N days (default 30) for products no longer present in latest snapshot.
- New GHA workflow `prune-snapshots.yml` runs weekly on cron.

### Non-functional
- 12-month single-brand backfill ≤30 min wall time on GHA.
- Total Postgres usage post-backfill of 5 brands ≤400 MB (80% of 500 MB free tier).
- Daily ETL run for all 5 brands ≤15 min (currently ~5 min for 1).
- **Carried from Phase 01 review (H3):** add composite index `idx_workspace_members_user_created` on `workspace_members(user_id, created_at)` to optimize membership listing order-by on `created_at` (currently relies on single-column index + sort).

## Storage budget (modelled, sanity-check before phase-04 ships)

Rough rows per brand × 365d:
| Table | Rows/brand | Avg row | 5-brand size |
|---|---|---|---|
| `shopify_orders` | ~18k | 2 KB (jsonb raw) | 180 MB |
| `shopify_order_lines` | ~30k | 0.5 KB | 75 MB |
| `shopify_transactions` | ~18k | 0.4 KB | 36 MB |
| `shopify_refunds` | ~1k | 0.4 KB | 2 MB |
| `meta_ad_insights_daily` | ~36k (100 ads × 365d) | 1 KB | 180 MB |
| `printify_orders` | ~18k | 1 KB | 90 MB |
| `printify_variant_costs` | ~50k (snapshot) | 0.2 KB | 50 MB |
| `daily_pl` (mat view) | 1825 | 0.5 KB | 5 MB |

**Worst-case total: ~620 MB.** Over free tier. Mitigations:
- Strip `raw jsonb` from `shopify_orders` for rows older than 90 days → drops 180→30 MB (75% saving).
- Don't store `meta_ad_insights_daily.raw`; we don't query it.
- Prune `printify_variant_costs` snapshots not in latest catalog.

**Targeted total post-mitigation: ~280 MB.** Comfortable on free tier.

## Architecture

```
GHA workflow_dispatch (backfill.yml)
  inputs: workspace_id, days (default 90), since_date?
  ↓
etl/backfill.ts
  ├─ chunkRange(since, until, 7) → 52 chunks for 365d
  ├─ for each chunk: skip-if-completed, else pull-{shopify,meta,printify}
  ├─ refresh daily_pl matview at end
  └─ exit 0 if all chunks succeed or already-done

GHA workflow cron (prune-snapshots.yml, weekly)
  ↓
etl/prune-old-snapshots.ts
  ├─ DELETE FROM shopify_orders SET raw = NULL WHERE created_at < NOW() - 90d
  ├─ DELETE FROM printify_variant_costs WHERE updated_at < NOW() - 30d AND product_id NOT IN (latest snapshot)
  └─ VACUUM ANALYZE
```

## Related Code Files

**Edit:**
- `etl/backfill.ts` — accept `--days`, validate ≤365
- `.github/workflows/backfill.yml` — add `days` input

**Create:**
- `etl/prune-old-snapshots.ts`
- `.github/workflows/prune-snapshots.yml`
- `supabase/migrations/0008_drop_meta_raw_column.sql` — drop `meta_ad_insights_daily.raw`
- `scripts/measure-db-size.ts` — outputs per-table size for ongoing monitoring

**Delete:** none

## Implementation Steps
1. Write `0008_drop_meta_raw_column.sql`; apply, confirm Meta ETL still passes (ETL never reads `raw`).
2. Add `--days` arg to `backfill.ts` + workflow input wiring.
3. Run 12-month backfill against Brand A on a feature branch; measure wall time + post-backfill DB size.
4. If DB > 400 MB: implement `prune-old-snapshots.ts` and the `raw` strip-old-rows logic, re-measure.
5. Add `scripts/measure-db-size.ts` (queries `pg_total_relation_size`); commit baseline numbers in phase journal.
6. Run 12-month backfill against Brand B; verify under budget.
7. Wire `prune-snapshots.yml` cron weekly Sunday 04:00 UTC.

## Todo
- [ ] Migration 0008 drop meta raw
- [ ] backfill.ts `--days` flag + validation
- [ ] Brand A 12mo backfill measured
- [ ] DB size script + baseline
- [ ] prune-old-snapshots.ts
- [ ] Brand B 12mo backfill measured under 400 MB
- [ ] prune-snapshots.yml cron

## Success Criteria
- Brand A + Brand B each have 365 daily_pl rows post-backfill.
- Total Postgres usage ≤400 MB after both backfills + prune.
- Backfill wall time ≤30 min/brand on GHA.
- Prune cron runs weekly without errors for 2 consecutive weeks before phase-07 ships.

## Risks
- **Meta rate limit hit mid-backfill:** existing chunked + resume logic from P1 handles. Verify `x-fb-ads-insights-throttle` header logged.
- **Prune deletes wrong rows:** dry-run mode in `prune-old-snapshots.ts` (default ON; `--apply` flag required for delete).
- **VACUUM blocks live queries:** use `VACUUM ANALYZE` not `VACUUM FULL`; non-blocking.
- **Storage estimate wrong:** if Brand B's measured size projects >500 MB at 5 brands → escalate to user (option: Supabase Pro $25/mo OR weekly aggregation for >180-day data).

## Security
- Service-role only (existing convention).
- Prune script logs every DELETE with row counts; no silent destruction.

## Next Steps
Phase 04 builds the product-catalog pull (uses Shopify GraphQL bulk for variants); phase-02 ensures storage headroom for that data.
