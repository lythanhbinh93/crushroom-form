# Phase 04 — Cutover + soak

**Depends on:** 03 · **Blocks:** Phase 2 of the hosted route (auth)

## Requirements

1. The weekly pipeline writes to Postgres unattended.
2. The dashboard reads Postgres with the desktop's SQLite file untouched.
3. The SQLite fallback is removed only after one clean weekly cycle.

## Steps

1. Set `POD_RADAR_DB_URL` in the desktop environment **and** in the scheduled
   task's context — a task running as a different user will not inherit a
   user-scoped variable. Verify with a logged env dump on first run.
2. Run `python run_weekly.py --stage discover` manually against Postgres; confirm
   rows land.
3. Let one full scheduled `PODRadarWeekly` cycle run untouched. Compare
   `runs` rows and per-table counts against the previous week.
4. Soak the dashboard for a week: all 6 views, mood board write, star, exclude and
   restore, sheet re-import.
5. Remove the SQLite fallback from `get_conn()`; drop the `sqlite3` import.
6. Update `README.md`: run instructions, the "access from anywhere" section (the
   split-brain warning no longer applies), and the new `psycopg` dependency.

## Validation

- Weekly run completes with `brands_failed` no worse than the SQLite baseline.
- Row counts move in the same shape as a normal week (new designs appear, prune
  behaves).
- Dashboard serves with the local `data/pod_radar.db` file **renamed** — proves
  nothing silently fell back to it.
- `grep -rn "sqlite3" pod_radar/ dashboard/` returns nothing.

## Risks

- **The scheduled task not seeing the env var** is the most likely failure and it
  fails quietly — the task would keep writing to local SQLite while the dashboard
  reads an increasingly stale Postgres. The renamed-file check in Validation is
  what catches it. Do this check; it is the whole point of the phase.
- **Supabase connection limits** under Streamlit's rerun model: every rerun may
  open a connection. Watch the pooler; add pooling if connections climb.
- **Latency.** Local SQLite reads were free. Every dashboard query is now a network
  round trip; the board renders 44 sparklines and 6 thumbnails per row. If it drags,
  that is a caching problem to solve in this phase, not after.

## Rollback

Unset `POD_RADAR_DB_URL`, restore the SQLite file name, re-run the weekly task.
Data written to Postgres during the soak is re-derivable — a full enrich rebuilds
it — except `design_state`, `starred` and `notes`, which are user-owned. Export
those three to CSV before cutover.
