# Phase 04 — Cutover + soak

**Depends on:** 03 · **Blocks:** Phase 2 of the hosted route (auth)

## What Phase 02 already settled

Three items here were written before the port and no longer apply:

- **There is no SQLite fallback to remove.** Phase 02 dropped the dual-dialect
  flag entirely (see that phase file for why). Old requirement 3 and old step 5
  are struck.
- **The env var is `POD_RADAR_PG_DSN`, not `POD_RADAR_DB_URL`**, and it is
  normally *not* set: `get_conn()` falls back to `pg_dsn` in
  `.streamlit/secrets.toml`, which the scheduled task picks up from the repo
  regardless of which user it runs as. That defuses the "most likely failure"
  in Risks below — but verify it rather than assume it.
- **The renamed-file check is already done and passed** (2026-07-29): with
  `data/pod_radar.db` renamed away, all six views rendered clean. Nothing falls
  back, because nothing *can*.

## Requirements

1. The weekly pipeline writes to Postgres unattended.
2. The dashboard reads Postgres with the desktop's SQLite file untouched.

## Steps

1. Confirm the scheduled task's context resolves the DSN. It reads
   `.streamlit/secrets.toml` from the repo, so this should hold for any user,
   but log the resolved host on the first run rather than trusting it.
2. Run `python run_weekly.py --stage discover` manually against Postgres; confirm
   rows land.
3. Let one full scheduled `PODRadarWeekly` cycle run untouched. Compare
   `runs` rows and per-table counts against the previous week.
4. Soak the dashboard for a week: all 6 views, mood board write, star, exclude and
   restore, sheet re-import. The six views are already proven to *render*; the
   soak is about the write paths and about latency under real use.
5. ~~Remove the SQLite fallback~~ — done in Phase 02, there is none.
6. Update `README.md`: run instructions, the "access from anywhere" section (the
   split-brain warning no longer applies), the `pg_dsn` secret, and the new
   `psycopg` dependency.

## Validation

- Weekly run completes with `brands_failed` no worse than the SQLite baseline.
- Row counts move in the same shape as a normal week (new designs appear, prune
  behaves).
- ✅ Dashboard serves with the local `data/pod_radar.db` file **renamed** — proves
  nothing silently fell back to it. Done 2026-07-29, all six views clean.
- ✅ `grep -rn "sqlite3" pod_radar/ dashboard/` returns nothing but one docstring.

## Risks

- ~~**The scheduled task not seeing the env var**~~ — this risk assumed a silent
  SQLite fallback. There is none: `get_conn()` with no resolvable DSN raises
  rather than degrading, so the failure mode is now a loud crash in the task
  log, not a quiet split-brain. The renamed-file check confirmed it.
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
