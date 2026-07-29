# Phase 04 — Cutover + soak

**Depends on:** 02 · **Blocks:** Phase 2 of the hosted route (auth)

**04a — cutover readiness: ✅ DONE 2026-07-29** (after a review round; it was
marked done prematurely once — see below). Everything verifiable without
waiting.
**04b — soak: ⏳ open, closes itself.** One unattended weekly cycle
(Mon 2026-08-03 09:00) plus a week of real dashboard use. Elapsed time, not
work; nothing to implement.

Split because the original phase mixed the two and would otherwise have sat
"in progress" for a week with nothing to do.

## Two causes of a silently-stale dashboard, not one

I marked 04a done after fixing the first and had to take it back. Both fire on
the same Monday, and the second was already recorded in the repo's own logs.

### 1. The 6-hour execution limit vs an 18-hour run — the actual blocker

`PODRadarWeekly` capped at `PT6H`. Observed `enrich` durations, from the logs:

| run | duration |
|---|---|
| 12 Jul | 6,303s — 1h45 |
| 13 Jul | 22,032s — 6h07 |
| 25 Jul | 66,523s — **18h29** |

**It had already fired.** The 27 Jul scheduled run returned `267014`
(`SCHED_S_TASK_TERMINATED`) and its log stops after `resolve` at 10:24 — `enrich`
and `score` never ran. Under Postgres the blast radius is worse: killed mid-run,
`score` never executes, and `score` is what every dashboard view reads.

Now `PT36H`, with `MultipleInstances IgnoreNew` so an overrun can never double up
with the next week's trigger, and 36h chosen to sit well clear of the worst
observed run while still self-healing long before the next Monday.

**Watch the trend.** 1h45 → 6h07 → 18h29 is growing with the catalogue and with
ad gap-fill (40 → 124 fetches). At this slope the job eventually will not fit in
a week, and that is a throughput problem no scheduler setting fixes.

### 2. The interpreter

The plan worried about the scheduled task not inheriting an env var. That was
already moot — `get_conn()` reads `secrets.toml` from the repo and raises loudly
rather than degrading.

The real failure was the **interpreter**. `PODRadarWeekly` executed
`~/.claude/skills/.venv/Scripts/python.exe`, which has `streamlit` but **not
`psycopg`**. Monday's run would have died at import — before the first log line,
before any `runs` row — and the only symptom would have been a dashboard that
quietly stopped updating.

`register-weekly-task.ps1` could not have caught it: it tested
`Test-Path $py`, i.e. that the interpreter *exists*. That was a sound proxy while
the app was stdlib + streamlit and any Python would do; it stopped being sound
the moment a compiled dependency arrived. The script now probes
`import psycopg, streamlit` and registers the winner's own `sys.executable` —
`Get-Command python` returned the WindowsApps execution alias, which is a shim
that misbehaves under Task Scheduler.

**Generalised lesson:** a launcher that checks for an interpreter's *existence*
silently rots the first time the dependency set changes. Check capability.

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

## 04a — cutover readiness ✅

0. ✅ Raised `ExecutionTimeLimit` 6h → 36h, `MultipleInstances IgnoreNew`, and
   cleared the battery defaults that would stop the run on a laptop.
1. ✅ Fixed the interpreter and hardened the registration script (above).
   `PODRadarWeekly` now executes
   `…\Python\pythoncore-3.14-64\python.exe` with `psycopg 3.3.4`, next run
   **Mon 2026-08-03 09:00**, interactive token, workdir = repo.
2. ✅ **Manual proof run through the task's own interpreter and working
   directory**: `run_weekly.py --stage score` → `{'scored': 271}`, exit 0, 10s.
   Wrote `runs` row **#25** with local wall-clock timestamps and a clean
   `finished_at` — so DSN resolution, write, and run bookkeeping are all proven
   in the context the scheduler will actually use. `score` was chosen over
   `discover`: no browser needed, and it does not spend the IP-wide
   `products.json` budget that Monday's real run depends on.
3. ✅ **All six dashboard write paths** driven through the real `data_access`
   functions (`tests/test_dashboard_write_paths.py`, 8 tests): star, favourite /
   mood / workflow, traffic, exclude / restore, notes, promote, rescore, sheet
   re-import. Reads were already proven by the differential; these are where the
   boolean and int4 narrowing bites, and they had no coverage at all.
4. ✅ **The enrich write path, proven without the network**
   (`tests/test_enrich_write_path.py`). This was the largest unproven surface —
   `upsert_design`, `upsert_design_ad`, `store_ad_matches` and the per-brand
   savepoints had never touched Postgres, and Monday exercises them first. The
   savepoint test uses the failure that actually threatens it: an `active_ads`
   value past int4, which SQLite stored without complaint.
5. ✅ Fixed `reimport_sheet_csv`, which built its own UPDATE and so bypassed
   `_clean` entirely — one NUL byte in an uploaded cell would have aborted the
   import mid-file and rolled back every row already written. The test that
   claimed to cover this called `upsert_brand` instead, which the upload path
   never reaches; it now drives the real path and is mutation-checked.
6. ✅ `run_weekly` logs the start line *before* `preflight()`. A preflight
   failure previously produced no log file at all, which reads identically to
   "the task never fired".
7. ✅ Suite 101 green. Zero test rows in production, test schema dropped.

Expected drift from the frozen SQLite baseline after step 2: **271 rows, every
one a brand-latest snapshot, zero historical rows touched** — exactly what
`compute_scores` is specified to do, and the same shape it had under SQLite.
From here the SQLite file is a rollback artifact, not a comparison baseline.

## 04b — soak ⏳ (elapsed time, nothing to implement)

1. **Mon 2026-08-03 09:00** — let the scheduled cycle run untouched. The browser
   stages (`discover`, `resolve`, `enrich`) have still never run against
   Postgres; only `score` has. This is the first exercise of `upsert_design`,
   `upsert_design_ad` and the new per-brand savepoints under real data.
2. Afterwards, check in this order — each answers a different question:
   - **`data/logs/run-260803.log` AND `run-260804.log`.** An 18h enrich writes
     its completion line into the *next day's* file — already demonstrated by
     the 24 Jul / 25 Jul pair. Looking at one day and seeing no `enrich:` line
     proves nothing.
   - `SELECT * FROM runs WHERE id > 25` — expect **three** top-level rows, not
     four: `logged_stage` passes `run_id = None` for `enrich`, which writes its
     own row internally.
   - The escape signal is **not** a NULL `finished_at`. `logged_stage` calls
     `finish_run` *before* re-raising, so a failed stage has a timestamp,
     `brands_failed = 1`, and `notes` starting `stage error:`. Look for a
     **missing** row, or `notes LIKE 'stage error:%%'`.
   - `notes` on the enrich row — `:catalog(...)`, `:ads-write(...)`,
     `:harvest-write(...)` entries are savepoint rollbacks. **A handful is
     normal; a pattern is the port leaking a type error under real data.**
   - `brands_failed` vs the baseline. Use the **24–25 Jul** pair
     (`enrich: ok 285, failed 19`) — the last cycle that actually completed. The
     27 Jul scheduled run is not a baseline: it was terminated during `resolve`.
   - Row counts move in the usual weekly shape (new designs appear, prune
     behaves).
3. Use the dashboard through the week. Watch for **latency** specifically: every
   query is a network round trip now where SQLite was a local file read, and
   `_df` opens a fresh connection per call. If it drags, that is a caching
   problem to solve here, not after.
4. ~~Remove the SQLite fallback~~ — done in Phase 02, there is none.
5. ✅ `README.md` updated: structure, the new Database section (`pg_dsn`, session
   pooler, `sqlite-final` tag), the `tee_store` true/false/NULL wording, and the
   "access from anywhere" section — the split-brain warning no longer applies.
   `.streamlit/secrets.toml.example` documents `pg_dsn` and the percent-encoding
   trap.

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
- **The real one was the interpreter** (see the top of this file). Fixed and
  verified. It recurs if the Python environment changes: the interpreter is
  resolved at *registration* time, so re-run `register-weekly-task.ps1` after
  any environment change. The script now says so on every run.
- **The browser stages have never touched Postgres.** `score` alone was proven
  manually, deliberately — running `enrich` early would spend the IP-wide
  `products.json` budget that Monday's real run needs. So Monday is the first
  test of the write-heavy path, and 04b step 2 is how you read the result.
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
