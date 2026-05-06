# Project Manager — Phase 02 Sync Report

**Date:** 2026-05-06 14:51 UTC  
**Phase:** 02 (Storage Budget + 12mo Backfill)  
**Status:** COMPLETE — Plan Synced

---

## Summary

Phase 02 code shipped. All 6 deliverables (migration 0009, backfill.ts --days, prune-old-snapshots.ts, measure-db-size.ts, backfill.yml, prune-snapshots.yml) implemented with 38 new tests (all passing). Code review score 8.5/10. Plan updated with deliverables checked, M1 fix documented, Phase 04 and 07 cross-checks updated.

---

## Status Updates

### Phase 02 Self — Marked Completed

**Status header:** `pending` → `completed (code shipped; operational measurement deferred to user)`  
**Completed:** 2026-05-06

**Todo checklist updated:**
- [x] Migration 0009 drop meta raw + index workspace_members
- [x] backfill.ts `--days` flag + validation
- [~] Brand A 12mo backfill measured (user-owned-operational)
- [x] DB size script (measure-db-size.ts) + RPC migration 0010
- [x] prune-old-snapshots.ts
- [~] Brand B 12mo backfill measured under 400 MB (user-owned-operational)
- [x] prune-snapshots.yml cron

**Code Review section added:** 8.5/10 score, M1 boolean coercion fix documented, migration 0010 RPC added, deferred items (M2, L1, L4, L5) tracked for Phase 04 cleanup.

### Phase 04 Cross-Check — Risks Updated

Added carried-forward note to Risks:
> "Carried from Phase 02: design orphan-detection predicate for `printify_variant_costs` prune (currently no-op; see prune-old-snapshots.ts `pruneOrphanVariantCosts()`). Requires staging-table approach to compare current ETL run's variant set against live table."

### Phase 07 Cross-Check — Success Criteria Updated

Added 2-week prune cron soak requirement:
> "Prune cron (`prune-snapshots.yml`) runs successfully for 2 consecutive weeks before ship-gate."

Existing "Wire `prune-snapshots.yml` to live cron 1 week before ship; verify 2 weekly runs clean" (Step 1) aligns.

---

## Key Findings (from reports)

### Implementation (fullstack-developer report)
- 2 migrations (0009 column drop + index, 0010 RPC created in follow-up)
- 3 new scripts: backfill.ts updated, prune-old-snapshots.ts, measure-db-size.ts
- 2 workflows: backfill.yml enhanced, prune-snapshots.yml created
- 38 tests, all passing; tsc clean
- Orphan variant-costs prune documented as no-op (requires Phase 04 staging-table design)

### Testing (tester report)
- 202 total tests: 194 pass, 8 pre-existing Printify failures (baseline, not regression)
- 38 Phase 02 new tests: 100% pass
- Typecheck: clean
- Guard (no-service-role): clean
- Migrations reviewed + idempotent

### Code Review (reviewer report)
- **Score:** 8.5/10
- **Critical/High:** none
- **Medium (2):** M1 workflow_dispatch boolean coercion (FIXED), M2 stripShopifyRaw return indirection (deferred)
- **Low (6):** L1 parseInt quirks, L2 chunk boundary comment, L3 client-side aggregation, L4 exit code, L5 vacuum error logging, L6 file LOC (all non-blocking)
- Destruction-safety solid; dry-run default; idempotent migrations; no live readers of dropped column
- Tests are real (not mock-tautologies); edge cases covered

---

## Unresolved Questions

1. **Operational measurement (User-owned):** Brand A + B 12mo backfill measured against ≤400 MB target. Impl reports deferred; user must run end-to-end to validate storage budget. Success gate for Phase 07 still stands: "DB size <400 MB at end of soak."

2. **M1 fix validation:** `prune-snapshots.yml` line 49 boolean coercion tightened (`false` → `'false'`). Manual dispatch with `dry_run=false` path smoke-tested before relying on it? No evidence yet.

3. **VACUUM RPC:** does `exec_sql` RPC exist on the target Supabase project? If not, `measure-db-size.ts` works but `runVacuum` falls back to warning-only. Not blocking Phase 02 ship, but Phase 05/07 must address for post-prune table bloat reclamation.

---

**Status:** COMPLETE  
**Action:** Plan synced. Phase 02 ready for Phase 03 handoff. User owns operational measurement (Brand A/B 12mo backfill actual size + prune cron 2-week soak timing for Phase 07 gate).
