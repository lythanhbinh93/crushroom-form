# Phase 01 — Schema + data migration

**Depends on:** nothing · **Blocks:** 02

## Context

- Schema DDL: `pod_radar/db.py:8-70` (7 tables, 2 indexes)
- Source data: `D:/github local/pod-research/data/pod_radar.db` (2.8 MB)
- Existing Supabase practice lives in `pod-dashboard` (migrations `0001`–`0017`) —
  reuse that numbering discipline, do **not** continue its sequence; this is a
  separate project.

## Requirements

1. A Supabase project with the 7 tables, typed properly.
2. A one-shot migration script that transforms and loads the SQLite contents.
3. A recorded row-count baseline so phase 04 can prove nothing was lost.

## Type mapping (decided)

| SQLite | Postgres | Columns |
|---|---|---|
| `TEXT` date | `date` | `captured_at`, `first_seen_at`, `product_created_at`, `ad_oldest_started`, `ad_last_seen`, `last_enriched_at`, `first_seen`, `favorited_at`, `analyzed_at` |
| `TEXT` timestamp | `timestamptz` | `runs.started_at`, `runs.finished_at`, `design_state.updated_at` |
| `INTEGER` flag | `boolean` | `brands.starred`, `snapshots.product_count_capped`, `snapshots.ads_approx`, `design_state.favorited` |
| `id INTEGER PRIMARY KEY` | `bigint GENERATED ALWAYS AS IDENTITY` | `snapshots.id`, `designs.id`, `runs.id` |
| `REAL` | `double precision` | `snapshots.score` |
| everything else | `text` / `integer` | unchanged |

Add in this phase: `design_state.owner text` (nullable now; NOT NULL arrives with
auth in Phase 2).

Keep: `UNIQUE(domain, handle)` on `designs`, composite PKs on `design_ads` /
`design_analysis` / `design_state`, both indexes, FK `domain → brands(domain)`.

## Files

**Create**
- `migrations/0001_initial_schema.sql` — full DDL, Postgres types
- `scripts/migrate_sqlite_to_pg.py` — one-shot transforming loader
- `plans/.../reports/baseline-rowcounts.json` — pre-migration truth

**Do not touch yet:** `pod_radar/db.py`, `dashboard/data_access.py` (Phase 02).

## Steps

1. Capture the baseline: row count per table + `SELECT max(captured_at) FROM
   snapshots` + `SELECT count(DISTINCT captured_at) FROM snapshots` → write to
   `reports/baseline-rowcounts.json`.
2. Write `0001_initial_schema.sql` from the mapping above. Apply to Supabase.
3. Write the loader. Per table: read SQLite rows, coerce dates (`str` → `date`,
   rejecting anything that does not parse rather than writing NULL silently),
   coerce `0/1` → `bool`, let identity columns generate fresh ids **except**
   `runs.id`, which `finish_run()` references — preserve those explicitly with
   `OVERRIDING SYSTEM VALUE`, then `setval` the sequence.
4. Load in FK order: `brands` → `snapshots`/`designs`/`design_ads`/
   `design_analysis`/`design_state` → `runs`.
5. Re-count on the Postgres side and diff against the baseline.

## Validation

- Row counts match the baseline exactly, per table.
- `SELECT count(*) FROM snapshots WHERE captured_at IS NULL` = 0 (no date silently
  lost in coercion).
- Spot-check `ad_last_seen - ad_oldest_started` for a known 113-day design
  (`brookeandbelle.com|scatterkindness`) returns `113`.
- `brands.starred` / `design_state.favorited` are real booleans.

## Risks

- **Silent date coercion.** A malformed `TEXT` date becoming NULL would quietly
  break every evidence calculation. The loader must fail loudly instead.
- **`runs.id` renumbering** would break `finish_run()`'s update-by-id and the
  Data-health run list. Preserve ids explicitly.
- **Sequence left at 1** after preserving ids → next insert collides. `setval`
  after load, and assert `nextval > max(id)`.

## Rollback

Drop the Supabase schema and re-run. The SQLite file is read-only throughout and
is never modified by this phase.
