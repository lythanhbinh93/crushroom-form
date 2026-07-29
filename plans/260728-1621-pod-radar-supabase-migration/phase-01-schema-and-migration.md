# Phase 01 — Schema + data migration

**Depends on:** nothing · **Blocks:** 02
**Status:** ✅ COMPLETE — loaded and verified against Supabase 2026-07-29

## Context

- Schema DDL: `pod_radar/db.py:7-71` (7 tables, 2 indexes) — **not the whole
  schema**. `init_db()` (`db.py:91-102`) adds four more columns through
  `ensure_column`, so the live `brands` table has 20 columns, not the 17 in the
  `DDL` constant. See the additive-column table below.
- Source data: `D:/github local/pod-research/data/pod_radar.db` (2.9 MB)
- Existing Supabase practice lives in `pod-dashboard` (`supabase/migrations/`,
  `0001`–`0019`) — reuse that directory layout and numbering discipline, do
  **not** continue its sequence; this is a separate project.

## Requirements

1. A Supabase project with the 7 tables, typed properly.
2. A one-shot migration script that transforms and loads the SQLite contents.
3. A recorded row-count baseline so phase 04 can prove nothing was lost.

## Type mapping (decided)

| SQLite | Postgres | Columns |
|---|---|---|
| `TEXT` date | `date` | `captured_at`, `first_seen_at`, `product_created_at`, `ad_oldest_started`, `ad_last_seen`, `last_enriched_at`, `first_seen`, `favorited_at`, `analyzed_at`, `domain_registered` |
| `TEXT` timestamp | `timestamptz` | `runs.started_at`, `runs.finished_at`, `design_state.updated_at` |
| `INTEGER` flag | `boolean` | `brands.starred`, `snapshots.product_count_capped`, `snapshots.ads_approx`, `design_state.favorited`, `brands.tee_store` |
| `id INTEGER PRIMARY KEY` | `bigint GENERATED ALWAYS AS IDENTITY` | `snapshots.id`, `designs.id`, `runs.id` |
| `REAL` | `double precision` | `snapshots.score` |
| everything else | `text` / `integer` | unchanged |

### Columns the `DDL` constant does not contain

`init_db()` adds these at runtime; a schema written from `DDL` alone loses them.

| Column | Live data | Postgres type |
|---|---|---|
| `brands.tee_store` | 250 true · 24 false · 51 NULL | `boolean` **nullable** — NULL means "unknown", not false |
| `brands.traffic_manual` | 1 row (45400) | `integer` |
| `brands.domain_registered` | 199 dates · 126 NULL | `date` |
| `designs.product_type` | 214 non-empty · 1059 empty string · 5350 NULL | `text` |

`tee_store` gates the tee filter (`test_tee_store_gate.py`) and `traffic_manual`
feeds the `traffic` score weight (0.30) — dropping either changes results
silently.

### Decided at implementation time

- **`runs.*` carry no offset.** `enrich.py:102` writes
  `datetime.now().isoformat()` — naive local time. Load them as
  `Asia/Ho_Chi_Minh` so historical run times keep their meaning; loading naive
  into a UTC session would shift the whole run history 7 hours. Phase 02 moves
  the writers to timezone-aware stamps.
- **`snapshots` gains `UNIQUE(domain, captured_at)`.** The 1431 existing rows
  already satisfy it. `insert_snapshot` currently dedupes with SELECT-then-INSERT,
  which races once a second writer exists — the exact end state this migration
  enables. The constraint also lets Phase 02 use `ON CONFLICT`.
- **`designs.product_created_at` is 100% NULL** (6623/6623) — `upsert_design`
  never writes it. Keep it typed `date`; the loader's strict date coercion must
  treat an all-NULL column as valid.
- **`design_state.favorited_at` is `timestamptz`, not `date`** (the mapping above
  said `date`). `upsert_design_state` stamps it with the same full ISO timestamp
  it writes to `updated_at`, so `date` would both abort the loader and truncate
  the time on every future favorite. The table is empty, so nothing is migrated
  through this path today — which is exactly why it needed a test rather than a
  dry run.
- **Flag columns stay nullable.** `insert_snapshot` and `upsert_design_state`
  name every column they know about and bind `dict.get()`, so an unset key
  arrives as an explicit NULL — and an explicit NULL does not fall back to a
  column DEFAULT in Postgres. `NOT NULL` on `ads_approx` would abort the weekly
  enrich run, which inserts the snapshot in stage A and fills the ad fields in
  stage B. SQLite had these nullable; the port keeps them nullable.
- **`idx_snapshots_domain_time` is not recreated.** The new
  `UNIQUE(domain, captured_at)` builds a byte-identical btree; keeping both
  would maintain two copies of the same index on every write.
- **RLS enabled + `anon`/`authenticated` revoked on all 7 tables.** Supabase
  exposes the `public` schema through PostgREST by default. The app connects
  with a direct psycopg DSN, which bypasses RLS, so this costs nothing now and
  stops being free once the hosted tier exists.

Add in this phase: `design_state.owner text` (nullable now; NOT NULL arrives with
auth in Phase 2).

Keep: `UNIQUE(domain, handle)` on `designs`, composite PKs on `design_ads` /
`design_analysis` / `design_state`, both indexes, FK `domain → brands(domain)`.

## Files

**Create**
- `supabase/migrations/0001_initial_schema.sql` — full DDL, Postgres types
- `scripts/migrate_sqlite_to_pg.py` — one-shot transforming loader
- `plans/.../reports/baseline-rowcounts.json` — pre-migration truth ✅ captured

**Modify**
- `requirements.txt` — add `psycopg[binary]` (currently `streamlit` only)

**Do not touch yet:** `pod_radar/db.py`, `dashboard/data_access.py` (Phase 02).

## Steps

1. ✅ Capture the baseline: row count per table + `SELECT max(captured_at) FROM
   snapshots` + `SELECT count(DISTINCT captured_at) FROM snapshots` → write to
   `reports/baseline-rowcounts.json`. Re-verified against the live DB — no drift.
2. ✅ Write `0001_initial_schema.sql` from the mapping above and apply it to
   Supabase (project `afcjfcroktlnelmhiyus`, ap-southeast-1). Applied clean via
   the SQL Editor.
3. ✅ Write the loader. Per table: read SQLite rows, coerce dates (`str` →
   `date`, rejecting anything that does not parse rather than writing NULL
   silently), coerce `0/1` → `bool`, let identity columns generate fresh ids
   **except** `runs.id`, which `finish_run()` references — preserve those
   explicitly with `OVERRIDING SYSTEM VALUE`, then `setval` the sequence.
   `--dry-run` does steps 3's coercion and every validation that does not need
   a server, so the transformation was proven before the project existed.
4. ✅ Load in FK order: `brands` → `snapshots`/`designs`/`design_ads`/
   `design_analysis`/`design_state` → `runs`. Only `snapshots` and `designs`
   actually declare the FK; the rest reference a domain by convention.
5. ✅ Re-count on the Postgres side and diff against the baseline — all 7 tables
   match exactly.

## Validation

- Row counts match the baseline exactly, per table.
- `SELECT count(*) FROM snapshots WHERE captured_at IS NULL` = 0 (no date silently
  lost in coercion).
- Spot-check `ad_last_seen - ad_oldest_started` for `brookeandbelle.com|
  scatterkindness`. **Do not hardcode the number** — it advances with every
  enrich run (was 113 when this plan was drafted, 116 after the 2026-07-27 run).
  The loader computes it from SQLite and asserts Postgres returns the same value.
- `brands.starred` / `design_state.favorited` are real booleans.
- `brands.tee_store` keeps its three states: 250 true / 24 false / 51 NULL.
- Every column present in SQLite exists in Postgres — compared programmatically,
  not by eye, so the `ensure_column` set cannot go missing again.

## Risks

- **Silent date coercion.** A malformed `TEXT` date becoming NULL would quietly
  break every evidence calculation. The loader must fail loudly instead.
- **`runs.id` renumbering** would break `finish_run()`'s update-by-id and the
  Data-health run list. Preserve ids explicitly.
- **Sequence left at 1** after preserving ids → next insert collides. `setval`
  after load, and assert `nextval > max(id)`.

## Result (2026-07-29)

All validations passed on the first load:

```
brands 325 · snapshots 1431 · designs 6623 · design_ads 745 ·
design_analysis 10 · design_state 0 · runs 24     — all match baseline
ad duration spot-check: 116 days  [ok]
brands.tee_store: NULL 51 · false 24 · true 250   — tri-state intact
runs id sequence: next start_run() gets 25
run 1 AT TIME ZONE 'Asia/Ho_Chi_Minh' = 23:30:35  — matches SQLite exactly
RLS enabled on all 7 tables
```

`ad_last_seen - ad_oldest_started` returns an integer day count directly, which
is what removes the `julianday()` wrapper in Phase 02.

## This load is a rehearsal

The weekly task still writes to SQLite and fires Monday 09:00, so Postgres goes
stale by one harvest per week until Phase 04 cuts over. Re-load at cutover:

```sql
TRUNCATE brands, snapshots, designs, runs, design_ads, design_analysis,
         design_state RESTART IDENTITY CASCADE;
```

then re-run the loader. It is idempotent against an empty schema.

## Rollback

Drop the Supabase schema and re-run. The SQLite file is opened `mode=ro`
throughout and is never modified by this phase.
