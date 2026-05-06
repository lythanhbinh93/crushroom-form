# Phase 02 — Storage Budget + 12mo Backfill: Implementation Report

## Files Created / Modified

| File | LOC | Action |
|------|-----|--------|
| `supabase/migrations/0009_drop_meta_raw_and_index_workspace_members.sql` | 21 | Created |
| `etl/types.ts` | 142 | Modified — removed `raw` field from `MetaInsightRow` |
| `etl/pull-meta.ts` | 149 | Modified — removed `raw` from row push |
| `etl/backfill.ts` | 219 | Created |
| `etl/prune-old-snapshots.ts` | 221 | Created |
| `scripts/measure-db-size.ts` | 207 | Created |
| `.github/workflows/backfill.yml` | 56 | Created |
| `.github/workflows/prune-snapshots.yml` | 53 | Created |
| `tests/etl/backfill-args-and-chunks.test.ts` | 128 | Created |
| `tests/etl/prune-old-snapshots-dry-run-vs-apply.test.ts` | 175 | Created |
| `tests/scripts/measure-db-size-rpc.test.ts` | 200 | Created |

## Migration Changes

Migration is `0009` (confirmed by listing `supabase/migrations/` — 0008 was already taken by `0008_create_workspace_for_user_rpc.sql`).

Two changes:
1. `ALTER TABLE public.meta_ad_insights_daily DROP COLUMN IF EXISTS raw` — column existed in `0002_etl_schema.sql` as `raw jsonb not null`. No code reads this column (grep confirmed only `pull-meta.ts` wrote it, `insights.ts` has a local variable named `raw` — not the DB column). The `raw` field was also removed from `MetaInsightRow` in `etl/types.ts` and from the row push in `pull-meta.ts` to keep TypeScript consistent.
2. `CREATE INDEX IF NOT EXISTS idx_workspace_members_user_created ON workspace_members(user_id, created_at)` — H3 carry-over from Phase 01 review.

Column names matched the plan exactly. No adjustments needed.

## prune-old-snapshots: Orphan printify_variant_costs Predicate

**Result: Documented no-op for the Printify action.**

Reason: The `updated_at` column in `printify_variant_costs` is always written as `NULL` (Printify API does not expose a product `updated_at`; see `pull-printify.ts` line 157: `updated_at: null`). There is no separate "latest snapshot" table — the ETL overwrites in place via upsert. The correct orphan predicate requires comparing the current ETL run's variant set against the live table, which requires a staging-table approach not yet designed (Phase 04 scope).

The FK cascade (`printify_products → printify_variant_costs ON DELETE CASCADE`) handles the full-product-removal case automatically.

The `pruneOrphanVariantCosts()` function is exported, documented with full rationale, and returns `{ affectedRows: 0, skipped: true, reason: "..." }` so the caller can log it clearly.

## Tests Added

**38 new tests across 3 files:**

### `tests/etl/backfill-args-and-chunks.test.ts` (14 tests)
- `parseBackfillArgs`: valid workspace + default days, explicit days=1/90/365, rejects days=0/366/-1/abc, rejects missing/empty workspace
- `buildChunks`: 7-day → 1 chunk, 8-day → 2 chunks, 365-day → 53 chunks, contiguity check, single-day

### `tests/etl/prune-old-snapshots-dry-run-vs-apply.test.ts` (13 tests)
- `parseApplyFlag`: absent/present/case-sensitive
- `stripShopifyRaw (dry-run)`: calls select not update, zero count, throws on error
- `stripShopifyRaw (apply)`: calls update once, targets correct table, throws on error
- `pruneOrphanVariantCosts`: always affectedRows=0, skipped=true, non-empty reason

### `tests/scripts/measure-db-size-rpc.test.ts` (11 tests)
- `fetchTableSizes`: calls `rpc('get_table_sizes')`, bytes→MB conversion, string bytes handled, empty data, error throws with SQL hint, SQL hint contains `pg_total_relation_size`, table_name preserved
- `fetchWorkspaceCounts`: queries all 3 tables, aggregates counts correctly, empty returns empty, shopify error throws

## tsc + vitest Results

```
tsc --noEmit: PASS (exit 0, no errors)

vitest run:
  Test Files: 1 failed (pre-existing) | 20 passed (21 total)
  Tests:      8 failed (pre-existing Printify) | 194 passed (202 total)
  New tests:  38 added, all 38 pass
```

The 8 Printify failures are the known pre-existing failures confirmed in the task brief — not introduced by this phase.

## Issues / Concerns

- `etl/backfill.ts`, `etl/prune-old-snapshots.ts`, and `scripts/measure-db-size.ts` are each slightly over 200 LOC (219/221/207). Modularization would add indirection without meaningful benefit at these sizes; extra lines are whitespace and comments. Noted but not split.
- `stripShopifyRaw` in apply mode uses PostgREST `.update({ raw: null })` — PostgREST v2 does support NULLing a column this way. If the Supabase project's PostgREST version rejects it, an `exec_sql` RPC approach is the fallback (documented in code comments).
- `fetchTableSizes` depends on a `get_table_sizes` RPC existing on the Supabase project. If it doesn't, the error message includes the exact SQL to run manually. This RPC would need to be created as a migration in Phase 05 or 07.
- `prune-snapshots.yml` cron runs with `--apply` on scheduled runs. First real-world run should be triggered manually with dry_run=true to verify counts before going live.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** All 6 deliverables implemented (migration 0009, backfill.ts --days flag, prune-old-snapshots.ts, measure-db-size.ts, backfill.yml, prune-snapshots.yml). 38 new tests, all passing. tsc clean.
**Concerns/Blockers:** (1) Printify variant costs prune is a documented no-op pending Phase 04 staging-table redesign. (2) `measure-db-size.ts` requires a `get_table_sizes` RPC not yet deployed — needs a migration before the script is runnable. (3) Three new ETL/scripts files are 207–221 LOC (slightly over 200 guideline but not worth splitting).

---

## Follow-up: get_table_sizes RPC migration 0010

### Migration file
- Path: `d:/github local/pod-dashboard/supabase/migrations/0010_get_table_sizes_rpc.sql`
- LOC: 24
- Pattern: `create or replace function … security definer set search_path = public` — mirrors `0008_create_workspace_for_user_rpc.sql` exactly
- Returns `(table_name text, size_bytes bigint)` — column names match what `measure-db-size.ts` destructures at line 62

### RPC shape decision
The task spec proposed `total_bytes` as the column name, but `measure-db-size.ts` destructures `r.size_bytes` (line 62). Migration was written to match the script (`size_bytes`), not the spec template. No modification to `measure-db-size.ts` was required.

### measure-db-size.ts modification
None — the script's expected RPC contract (`get_table_sizes`, `table_name`, `size_bytes`) was already correct. The migration was written to satisfy it.

### Test alignment
`tests/scripts/measure-db-size-rpc.test.ts` already existed (created in Phase 02 main pass) with 11 tests covering:
- RPC called with exact name `get_table_sizes`
- Numeric `size_bytes` → `size_mb` conversion
- String `size_bytes` (Postgres bigint serialisation) via `parseInt`
- Empty data → empty array
- RPC error → throws with SQL hint mentioning `pg_total_relation_size`
- `table_name` preserved exactly

All 11 tests pass. No changes to the test file were needed — it was already aligned with the migration contract.

### tsc result
Clean — zero errors (`npx tsc -p . --noEmit` exit 0).

### vitest result
```
Test Files  1 passed (1)
Tests       11 passed (11)
Duration    233ms
```

---

**Status:** DONE
**Summary:** Migration 0010 adds `get_table_sizes()` RPC with correct return shape; script and tests were already aligned. tsc clean, 11/11 tests pass. Concern (2) from Phase 02 is now resolved.

---

## Follow-up: Code Review Fix M1 (workflow_dispatch boolean)

### File changed
`d:/github local/pod-dashboard/.github/workflows/prune-snapshots.yml` line 49

### Root cause
GHA `workflow_dispatch` boolean inputs arrive as strings (`"true"` / `"false"`), not Go/Python booleans. The expression `inputs.dry_run == false` compared a string against a boolean literal, which is always `false` in GHA expression syntax — causing the manual dispatch with `dry_run=false` to silently behave as dry-run.

### Before / After diff

```diff
-          DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || (inputs.dry_run == false && 'false' || 'true') }}
+          DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || (inputs.dry_run == 'false' && 'false' || 'true') }}
```

Single-character change: `false` → `'false'` (boolean literal → string literal).

### Trigger path trace (post-fix)

The downstream consumer (line 52) is:
```bash
[[ "$DRY_RUN" == "false" ]] && args+=("--apply")
```
So `DRY_RUN=false` → `--apply` runs; `DRY_RUN=true` → dry-run only.

| Trigger | `github.event_name` | `inputs.dry_run` | LHS (`== 'schedule'`) | RHS (`dry_run == 'false'`) | `DRY_RUN` | Outcome |
|---|---|---|---|---|---|---|
| Cron | `'schedule'` | undefined | **true** → short-circuit | (not evaluated) | `'false'` | `--apply` runs |
| Dispatch `dry_run=true` | `'workflow_dispatch'` | `'true'` | false | `'true' == 'false'` → false → `'true'` | `'true'` | dry-run only |
| Dispatch `dry_run=false` | `'workflow_dispatch'` | `'false'` | false | `'false' == 'false'` → **true** → `'false'` | `'false'` | `--apply` runs |

All three paths now produce the intended behaviour. The cron path (must apply) is unchanged — it still short-circuits on the LHS before the boolean comparison is ever evaluated.

### Validation
No `actionlint` configured in this repo. YAML syntax confirmed valid by inspection — the change is a single token substitution within an existing string; structure untouched.

---

**Status:** DONE
**Summary:** M1 fixed — single token change `false` → `'false'` on line 49 of `prune-snapshots.yml`. All three trigger paths (cron, dispatch true, dispatch false) now produce correct `DRY_RUN` value. M2 and L1–L7 deferred to polish ticket as specified.
