# Phase 02 — Driver + query port

**Depends on:** 01 · **Blocks:** 03

## Context

`sqlite3` is imported in exactly one file. Everything else in ~3,500 LOC goes
through `pod_radar.db.get_conn()`. That single seam is why this phase is bounded.

- Seam: `pod_radar/db.py:83` `get_conn()`
- Consumers: `dashboard/data_access.py` (412 LOC), `pod_radar/*.py`, `export_*.py`
- 59 parameterised call sites across both packages

## Requirements

1. `get_conn()` returns a Postgres connection; no caller signature changes.
2. All SQLite-only SQL rewritten.
3. Both connection styles selectable by env flag until Phase 04 (rollback path).

## The 10 non-portable sites (from scout)

| Site | Current | Becomes |
|---|---|---|
| `data_access.py:107-108` | `MAX(1.0, ROUND(julianday(a) - julianday(b)))` | `GREATEST(1.0, ROUND(a - b))` |
| `data_access.py:185` | same shape | same |
| `data_access.py:199` | `MAX(1.0, julianday(a) - julianday(b))` | `GREATEST(1.0, a - b)` |
| `export_design_brief.py:20` | `CAST(MAX(1, ROUND(julianday…)) AS INT)` | `GREATEST(1, ROUND(a - b))::int` |
| `data_access.py:267` | `last_enriched_at < DATE('now', ?)` | `last_enriched_at < CURRENT_DATE - %s::interval` |
| `data_access.py:378` | `… || DATE('now')` | `… || CURRENT_DATE` |
| `data_access.py:388` | `… || DATE('now')` | `… || CURRENT_DATE` |
| `db.py:87` | `PRAGMA foreign_keys = ON` | delete — PG enforces natively |
| `db.py:106` | `PRAGMA table_info(t)` | `information_schema.columns` lookup |
| `db.py:185,209` | `ON CONFLICT … DO UPDATE` | **unchanged** — already valid PG |

Once dates are real types (Phase 01), `a - b` yields an integer day count
directly, so the `julianday` wrapper disappears rather than being translated.

## Files

**Modify**
- `pod_radar/db.py` — `get_conn`, `init_db`, `ensure_column`, 6 upsert helpers,
  `start_run`/`finish_run`
- `dashboard/data_access.py` — 7 rewritten SQL sites + placeholders
- `pod_radar/export_design_brief.py` — 1 SQL site
- `requirements.txt` — add `psycopg[binary]`
- every `?` placeholder → `%s` across the 59 call sites

**Watch:** `start_run()` (`db.py:256`) uses `lastrowid` to get the new run id.
Postgres needs `RETURNING id`.

## Steps

1. Add `psycopg[binary]` to `requirements.txt`.
2. Rewrite `get_conn()` to read `POD_RADAR_DB_URL`; when unset, fall back to
   SQLite so the rollback path stays alive through Phase 03.
3. Port `init_db` to apply `migrations/0001_initial_schema.sql`; port
   `ensure_column` to `information_schema`.
4. Convert `?` → `%s` mechanically, then read every diff hunk — a stray `?` inside
   a LIKE pattern or a URL string must not be rewritten.
5. Rewrite the 7 SQL sites in the table above.
6. `start_run()` → `INSERT … RETURNING id`.
7. Confirm `row_factory` usage (1 site) and `pd.read_sql_query` (1 site) still
   return the same shapes — `psycopg.rows.dict_row` for the former.

## Validation

- `grep -rn "sqlite3" pod_radar/ dashboard/` returns nothing but the fallback path.
- `python -c "import data_access"` clean; every dashboard view renders.
- The 113-day design still shows `113d`; Data health still shows 96.1%.
- Spot-check a `GREATEST` query returns identical numbers to the SQLite baseline.

## Risks

- **`MAX` → `GREATEST` is a hard error in PG, not a silent wrong answer** — it will
  fail loudly, which is the good case. Do not "fix" it by adding a GROUP BY.
- **Mechanical `?` → `%s` can corrupt string literals.** Review every hunk.
- **`psycopg` is the first non-Streamlit dependency** in a stdlib+1 repo. Accepted
  cost, noted in `README.md`.

## Rollback

Unset `POD_RADAR_DB_URL` → `get_conn()` returns SQLite and the old queries. Keep a
branch until Phase 04 proves the port.
