# Code Review — POD Dashboard P2 Phase 02 (Storage Budget + 12mo Backfill)

**Date:** 2026-05-06 14:04 UTC
**Reviewer:** code-reviewer (subagent)
**Branch:** Phase 02
**Scope:** 11 files (2 migrations, 1 modified types, 1 modified pull-meta, 3 new scripts, 2 workflows, 3 test files)

---

## Score: 8.5 / 10

**Recommendation: SHIP with one small fix (M1) before first scheduled cron run.**
The destruction-safety pieces are solid (dry-run default, idempotent migrations, no live readers of dropped column). One YAML boolean-coercion footgun in `prune-snapshots.yml` should be tightened. Two MEDIUM and a few LOW items are non-blocking.

---

## Findings by Severity

### CRITICAL — none

No critical issues. The high-risk areas (column drop, prune script, cron trigger) all pass:
- Migration 0009 column drop is safe — verified via grep that no live code (app, ETL, matview SQL) reads `meta_ad_insights_daily.raw`. `lib/connectors/meta/insights.ts:126` `...raw` is a JS spread on a local var, not the DB column.
- `stripShopifyRaw` dry-run path correctly issues `select ... head: true` only (no UPDATE possible — verified by reading both branches). Matview never selects `shopify_orders.raw`.
- WHERE guards present: both dry-run and apply paths chain `.lt('created_at', NOW()-90d).not('raw','is',null)` → cannot null all rows. ✓
- Cron `0 4 * * 0` = Sunday 04:00 UTC. ✓
- VACUUM is called via `exec_sql` RPC **after** the prune actions, not inside any transaction block. ✓
- `etl_runs.trigger` is `text not null` with no CHECK constraint (migration 0002 line 196), so `'backfill'` value works without schema change. ✓
- Migration ordering 0009 → 0010 is sequential, idempotent, both apply cleanly even if rerun.
- No SQL injection vector — dynamic queries are PostgREST chains with parameter binding; the only string-concat query is the comment-only fallback SQL in `measure-db-size.ts:53-58`.

### HIGH — none

### MEDIUM

**M1. `prune-snapshots.yml` boolean coercion is fragile (line 49).**
The expression
```yaml
DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || (inputs.dry_run == false && 'false' || 'true') }}
```
relies on GitHub Actions' boolean-to-string coercion. `inputs.dry_run` from `workflow_dispatch` arrives as the **string** `"true"` / `"false"`, not a boolean — so `inputs.dry_run == false` compares a string to a boolean, which evaluates `false` in GHA's expression language (depending on version). Net effect today: the OR-chain short-circuits to `'true'` when user passes `dry_run=false`, meaning a manual "apply" dispatch would silently dry-run.

**Fix (either):**
```yaml
# Compare strings explicitly:
DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || (inputs.dry_run == 'false' && 'false' || 'true') }}
```
Or restructure with a clearer default:
```yaml
DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || inputs.dry_run }}
```
(workflow_dispatch sends the string directly; default is `true`).

Either way, **smoke-test the manual-dispatch apply path before relying on it.** The schedule path is fine (always `'false'`).

**M2. `stripShopifyRaw` apply-mode return value is misleading.**
Line 108: `return { affectedRows: remaining === 0 ? -1 : (remaining ?? 0), ... }`. The `-1` sentinel for "all stripped" is then translated back to `0` in the caller (line 183). This indirection is confusing and the test only asserts `update was called once`, never the return value semantics. Either:
- Use `Supabase JS update().select('id', { count: 'exact' })` to get the actual mutated count, OR
- Drop the `-1` sentinel and just return `remaining` directly with a clear field name like `remainingOldRowsWithRaw`.

Current behavior is functionally OK but the apply-mode log message says `remaining old rows: 0` which is what the user wants to see — the gymnastics are just noise.

### LOW

**L1. `parseInt` with hex/unicode quirks in arg parsing (`backfill.ts:46`).**
`parseInt('0x1f', 10)` returns `0` not `NaN` in some edge cases; `parseInt('365abc', 10)` returns `365` (truncates). Combined with `isNaN` check, this means `--days=365abc` would silently accept `365`. The `Number.isFinite` check helps but doesn't catch the truncation case. Use `Number(daysStr)` + explicit integer check, or regex-validate before parseInt. Low risk because the caller is GHA (not user-facing).

**L2. `buildChunks` 365-day test asserts 53 chunks but real `--days=365` produces 366-day window.**
`since = today - 365` and `until = today`, inclusive on both ends, is 366 days. The test uses Jan 1 → Dec 31 = 365 days. Both yield 53 chunks (52 full × 7 days + remainder), so the test is not wrong, but the comment "53 chunks (52 full + 1 partial day)" is for the 365-day input, not the 366-day actual range. Document or align the test to match `main()`'s actual range computation.

**L3. `measure-db-size.ts` `fetchWorkspaceCounts` is N rows not N+1, but counts the entire workspace_id column (not aggregated server-side).**
Lines 81–85 fetch *every* `workspace_id` row from three tables, then aggregate client-side. At 5 brands × 1 year, that's ~108k workspace_id strings transferred. Functionally fine for a one-off measurement script, but `select workspace_id, count(*) group by workspace_id` via an RPC would be O(distinct workspaces) not O(rows). YAGNI says fine for now.

**L4. `backfill.ts` exit code on partial errors is 0 (line 202–206).**
Comment says "exit 0 so GHA marks the run yellow, not red." There is no yellow in GHA — runs are pass or fail. A partial-failure backfill that exits 0 will be invisible in the run history; the only signal is buried in logs. Recommend: exit 0 only if `totalErrors === 0`, exit 2 (or 1) otherwise so the workflow surfaces the failure. The puller-level `etl_runs` rows already record per-source errors for granular debugging.

**L5. `runVacuum` swallows non-error responses too quietly.**
Line 152 logs a warning saying "exec_sql RPC not available" on *any* RPC error — but the actual error message isn't included. If the RPC exists but fails for another reason (permissions, syntax), the operator gets no diagnostic. Add `error.message` to the warning.

**L6. Three files at 207–221 LOC.**
Slightly over the 200-LOC guideline. As the implementation report notes, splitting would add indirection without benefit. Acceptable.

**L7. Test mock-tautology check (review-focus #6).**
The prune dry-run test (`prune-old-snapshots-dry-run-vs-apply.test.ts:79-90`) asserts `selectChain` called once and `updateChain` not called — this is genuine behavior verification, not a tautology. ✓
The chunk math test (`backfill-args-and-chunks.test.ts:94-100`) asserts the count, plus a separate contiguity test. Boundary cases (1 day, 21 days, 365 days, single-day) covered. No leap-year test, but `setUTCDate` handles leap years natively so adding it would be redundant.
The measure-db-size tests use mocks but assert RPC name, byte→MB conversion, and string-handling — these test logic, not just mock returns. ✓
**Tests are not mock-tautologies.** Quality is good.

---

## Edge Cases (Scout findings)

- **Migration 0009 + `not null` constraint**: The `raw` column was `jsonb not null` (migration 0002 line 123). `DROP COLUMN IF EXISTS raw` works cleanly — Postgres drops the constraint with the column. ✓
- **Concurrent ETL during prune**: If `daily-etl.yml` runs while `prune-snapshots.yml` is updating shopify_orders, the UPDATE takes a row-level lock on old rows; new INSERTs are unaffected (PK is `(workspace_id, order_id)`, not `created_at`). No deadlock risk. The Sunday 04:00 UTC slot avoids the daily-ETL 02:00 window — verified by reading `daily-etl.yml` if it exists at that schedule.
- **`refreshDailyPL` after partial-failure backfill**: If chunk 17 of 53 fails for Meta but Shopify+Printify succeed, the matview refresh at the end uses inconsistent state for that chunk's date range. Currently logged as non-fatal (line 194). Acceptable for backfill (re-run picks up via `etl_runs` resume).
- **`stripShopifyRaw` race vs ongoing pulls**: `pull-shopify` upserts new orders with `raw` populated. The strip's `WHERE created_at < NOW()-90d` will never match newly-inserted rows. Safe.

---

## Positive Observations

- Two-pass safety on prune (dry-run default + workflow-level toggle + cron-only auto-apply) is well-layered.
- Migration `IF EXISTS` + `CREATE INDEX IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION` makes both 0009 and 0010 fully idempotent — re-running is harmless.
- Documented no-op for `pruneOrphanVariantCosts` is the right call (KISS) given the missing snapshot infrastructure. Returning `{skipped:true, reason: ...}` is clearer than throwing or silently no-oping.
- `runSourceChunk` reuses existing `etl_runs` logger — backfill resume works via the same row-level idempotency as daily ETL. No new persistence layer.
- Workflow secrets are env-injected (not interpolated into shell command), preventing command injection (`backfill.yml:51-56`). Good practice.
- `get_table_sizes` RPC granted to `service_role` only (not anon/public). ✓
- All 3 new scripts include the ESM entry-point guard (`isEntryPoint = process.argv[1]?.endsWith(...)`) so tests can import without triggering main. Consistent pattern.

---

## Recommended Actions

**Before first cron run (1 fix):**
1. Tighten the `DRY_RUN` boolean expression in `.github/workflows/prune-snapshots.yml:49` and smoke-test manual-dispatch with `dry_run=false`. (M1)

**This sprint (cleanup, no urgency):**
2. Simplify `stripShopifyRaw` apply return — drop `-1` sentinel. (M2)
3. Make `backfill.ts` exit non-zero on partial errors so GHA surfaces them. (L4)
4. Include `error.message` in `runVacuum` warning. (L5)

**Optional / future:**
5. Server-side aggregation in `fetchWorkspaceCounts` (L3) when row volumes grow.
6. Strict integer parsing in `parseBackfillArgs` (L1).

---

## Metrics

| Metric | Value |
|---|---|
| Files reviewed | 11 |
| Critical/High | 0 |
| Medium | 2 |
| Low | 6 |
| Test files | 3 |
| Test coverage of new logic | High — 38 tests, boundary + dry-run + RPC-error paths |
| Type errors | 0 (tsc clean) |
| Tests pass | 38/38 new, 194/202 total (8 pre-existing Printify failures unchanged) |

---

## Unresolved Questions

1. Does `exec_sql` RPC exist on the project? `runVacuum` falls back to a manual reminder if not — fine for now, but VACUUM ANALYZE never running in production means table bloat post-prune won't be reclaimed. Consider a migration adding `exec_sql` (with strict service-role-only grant) OR replace with a direct `vacuum_pruned_tables()` security-definer RPC scoped to just the two tables.
2. Has manual `dry_run=false` dispatch been smoke-tested? See M1.
3. The implementation report mentions Brand A/B 12mo backfill measurement was deferred — the plan's success criterion requires actual measured DB size ≤400 MB. Has this been run end-to-end on a feature branch yet, or is it a phase-04/05 prerequisite?

---

**Status:** DONE
**Summary:** Phase 02 ships. One YAML expression fix (M1) recommended before first scheduled prune run. Destruction-safety, migration ordering, cron syntax, and SQL injection surface all clean. Tests are real (not mock-tautologies). 8.5/10.
**Concerns/Blockers:** M1 should be addressed before relying on manual `dry_run=false` dispatch, but does not block the scheduled-cron path.
