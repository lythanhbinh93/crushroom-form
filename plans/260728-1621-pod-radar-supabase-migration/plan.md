# POD Radar — SQLite → Supabase Postgres (Phase 1 of hosted multi-user)

**Status:** Phase 01 ✅ complete 2026-07-29 — all 9,158 rows live in Supabase
(`afcjfcroktlnelmhiyus`, ap-southeast-1), every count matching baseline.
Phase 02 (driver + query port) is next. The app still reads SQLite.
**Code:** `D:/github local/pod-research` (remote `lythanhbinh93/pod-radar`)
**Plans:** this repo, per README convention

## Starting state — read before touching code

Work branches from **`fix/dashboard-nav-auth-and-render-bugs`**, which is 6 commits
ahead of `master` and not merged. Starting from `master` silently loses all of it:

| Commit | What |
|---|---|
| `7c15496` | hot reload restored (`runOnSave`, watcher re-enabled) |
| `6136cf8` | tab + nav label spacing |
| `5261221` | data-health coverage SQL + movers formatting |
| `b275938` | ad-timeline label collision |
| `60f1d6d` | board sparklines (vega spec, not `st.line_chart`) |
| `b1e2389` | cookie-persisted auth (`auth.py` + `cookie_writer` component) |

Two of these matter directly to this migration:

- `5261221` rewrote the `designs_pct` SQL into `data_access.DESIGNS_PCT_SQL`. Phase
  02 ports that constant, not the old inline query.
- `b1e2389` added `dashboard/components/cookie_writer*`. It becomes dead code at
  Phase 2 of the hosted route (auth), **not** in this migration — leave it alone.

Also live: `dashboard/auth.py` gates on `.streamlit/secrets.toml` (gitignored).
Tests: 46 passing on that branch. Hot reload works — no restart needed after edits.


## Why

POD Radar must become always-on with real accounts and a per-user mood board.
Enrichment cannot move — `agent-browser` needs a logged-in desktop Chrome — so the
desktop keeps writing and a hosted tier keeps serving. Two writers against one
SQLite file is the split-brain the README already warns about. Moving the data to
Postgres is required by every end state, so it is done first and alone.

Phase 1 changes **where the data lives**, nothing else. The Streamlit app keeps
running against it unchanged. Auth and the UI port are later phases and are not
planned here.

## Phases

| # | Phase | Depends on | File |
|---|-------|-----------|------|
| 01 | Schema + data migration ✅ | — | [phase-01-schema-and-migration.md](phase-01-schema-and-migration.md) |
| 02 | Driver + query port | 01 | [phase-02-driver-and-queries.md](phase-02-driver-and-queries.md) |
| 03 | Postgres test harness | 02 | [phase-03-test-harness.md](phase-03-test-harness.md) |
| 04 | Cutover + soak | 03 | [phase-04-cutover.md](phase-04-cutover.md) |

## Accepted decisions

- **Dates become real types.** `TEXT` → `date` / `timestamptz`. Collapses all five
  `julianday()` sites to plain subtraction. Costs a transforming migration rather
  than a row copy; done once against 2.8 MB.
- **Tests run Postgres.** The 9 SQLite-pinned test files move to a throwaway
  Postgres fixture so the suite exercises the dialect that ships (`GREATEST`,
  identity columns, date math) — the exact places this port can break.
- **`design_state.owner` lands now.** The table has 0 rows today, so it is free.
  Waiting means altering populated mood-board data during the auth phase.

## Acceptance criteria

1. `sqlite3` appears nowhere in `pod_radar/` or `dashboard/`.
2. A full `discover → resolve → enrich → score` run completes against Postgres and
   row counts match the SQLite baseline captured in phase 01.
3. All dashboard views render with no errors, password gate still working.
4. Full test suite green against Postgres.
5. The weekly scheduled task writes remotely with the dashboard stopped.

## Non-goals

- No auth work, no per-user enforcement (only the `owner` column exists).
- No UI port, no framework change.
- No change to enrichment logic or scoring maths.
- Moving enrichment off the desktop — impossible, `agent-browser` needs Chrome.

## Baseline to preserve

Captured 2026-07-28 into [reports/baseline-rowcounts.json](reports/baseline-rowcounts.json)
— that file, not this summary, is the number phase 04 diffs against.

`brands 325 · designs 6623 · snapshots 1431 · design_ads 745 · runs 24 ·
design_analysis 10 · design_state 0` · db 2.79 MB · max run id 24

`design_state` is still empty, so the `owner` column remains free to add.

## Rollback

The SQLite file is never deleted. Every phase keeps `get_conn()` able to return a
SQLite connection behind an env flag until phase 04 removes it. Reverting is
switching the flag back and re-registering the scheduled task.
