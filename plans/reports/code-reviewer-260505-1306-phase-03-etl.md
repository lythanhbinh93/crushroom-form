# Phase 03 ETL — Code Review

**Date:** 2026-05-05
**Reviewer:** code-reviewer agent
**Scope:** ETL pipeline + migrations 0002/0003 + GHA workflow

## Summary
- **Verdict:** NEEDS_CHANGES → fixed inline before commit
- **Critical:** 2 | **High:** 4 | **Medium:** 6 | **Low:** 4

## CRITICAL (must fix before merge)

**[#C1] Meta config key mismatch — 100% Meta failure**
- File: `etl/pull-meta.ts` reads `config.adAccountId` (camelCase). Phase 01/02 stores `config.ad_account_id` (snake_case) — see `lib/vault.ts:11`, settings/credentials form.
- Fix: rename ETL reads to `ad_account_id`.

**[#C2] daily_pl drops fully-refunded order revenue while still subtracting refund**
- File: `0003_daily_pl_matview.sql` rev CTE filter excludes `'refunded'` status.
- Bug: fully-refunded order shows as `-$50` net loss (revenue dropped, refund still subtracted) instead of net 0.
- Fix: add `'refunded'` to filter in both `rev` and `shopify_utm` CTEs.

## HIGH

**[#H1] Printify orders unbounded by date** — paginates entire shop history every run. Won't trip day 1 but breaks <5 min SLA at scale. Add early-stop + TODO.

**[#H2] GHA workflow_dispatch shell injection** — `${{ inputs.x }}` interpolated directly into bash. Refactor to env block + bash array.

**[#H3] Refund processed_at uses created_at** — these can differ by hours/days. Refunds land on wrong P&L day.

**[#H4] Refund amount excludes tax + shipping** — undercount ~10-15% per refund.

## MEDIUM (deferred to follow-up)
- M1: Meta purchase_count fractional values → wrap with Math.round() at ETL boundary
- M2: parseFloat(undefined) → silent zeros — add zod boundary validation
- M3: matview JOIN drops unlinkable Printify COGS — needs observability metric
- M4: app_subs / 30 prorating drift — document or use exact month length
- M5: shopify_orders cascade delete → workspace delete → all data — confirmed intentional
- M6: app_alloc not in keys union → workspaces with subs but no orders missed

## LOW (deferred)
- L1: Shopify Link header regex (Phase 02 scope)
- L2: run-daily.ts 217 LOC — OK as single CLI
- L3: `as any[]` cast in upsert — necessary, documented
- L4: SIGKILL'd ETL leaves running rows → need janitor sweep on startup

## Action
**Fixed in this PR:** C1, C2, H1 (with TODO marker), H2, H3, H4
**Deferred to Phase 04+:** M1-M6, L4 (operational hygiene)
