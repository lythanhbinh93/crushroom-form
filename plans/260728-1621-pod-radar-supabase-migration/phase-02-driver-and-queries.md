# Phase 02 — Driver + query port (absorbs Phase 03)

**Depends on:** 01 · **Blocks:** 04

## Two plan-time assumptions the port disproved

**Requirement 3 (dual-dialect env flag) is dropped.** It said "both connection
styles selectable by env flag until Phase 04 (rollback path)". That cannot work:
the *queries* change dialect, not just the connection. After the rewrites below,
unsetting the flag hands SQLite a pile of `GREATEST` / `%s` / `::date` SQL it
cannot parse — the old queries no longer exist in the tree. Honouring it would
mean maintaining a translation shim for ~25 queries to protect a path used at
most once.

Rollback is now: **`git checkout sqlite-final`** (tagged at `0cff12d`) plus the
untouched `data/pod_radar.db`, then re-run the Phase 01 loader. The SQLite file
is never written to by any ported code — that is the invariant that makes the
tag sufficient.

That file is gitignored, so it lived on exactly one machine and the rollback was
not actually real. A checksummed copy now sits beside this plan:
`reports/pod_radar-presupabase-260729.db`, sha256 `6357a7d8fa7c77da…`, 2,924,544
bytes, verified identical to the working file. Accepted cost: stars/favourites/notes written to Postgres during
a rollback window are not in the SQLite file. A handful of user-owned rows,
against the alternative of dual-writing everything.

**Phase 03 is absorbed into this phase.** The moment `db.py` speaks `%s`, the 9
sqlite-pinned test files break; deferring their port leaves the suite red between
phases. Order inside this phase: fixture first (additive, green) → port → port
tests → green. One finalize gate.

Keeping the sqlite in-memory tests alive via dialect-agnostic helpers was
rejected: they would then validate the shim rather than production, and the
semantics genuinely differ — SQLite's two-arg `MIN(a,b)` returns NULL if *either*
argument is NULL, while Postgres `LEAST` ignores NULLs and returns the non-null
one. A green SQLite suite over `upsert_design_ad` would be a false green on the
ad-evidence path.

## Context

`sqlite3` is imported in exactly one file. Everything else in ~3,500 LOC goes
through `pod_radar.db.get_conn()`. That single seam is why this phase is bounded.

- Seam: `pod_radar/db.py:83` `get_conn()`
- Consumers: `dashboard/data_access.py` (412 LOC), `pod_radar/*.py`, `export_*.py`
- 59 parameterised call sites across both packages

## psycopg3 behaviour, measured against the live database

Not inferred from docs — run against Supabase on 2026-07-29. These four results
decide the mechanical shape of the port.

| Question | Answer |
|---|---|
| Does `Connection.execute()` exist? | Yes. Every `conn.execute(...)` call site survives untouched. |
| Does `row_factory=dict_row` give `row["col"]`? | Yes — a drop-in for `sqlite3.Row`, including `dict(r)`. |
| When is `%` parsed? | **Only when a params sequence is passed.** `execute(q)` and `execute(q, None)` leave `%%` as `%%`; `execute(q, ())` collapses `%%` → `%` and rejects a bare `%`. |
| Does pandas preserve that? | Yes — `read_sql_query(..., params=())` parses, `params=None` or omitted does not. Both `%s` and `%(name)s` work. |

**The rule that follows:** double every literal `%` to `%%` *and* make every
execution path pass a params sequence, defaulting to `()` rather than `None`.
Miss either half and the LIKE filters silently stop matching. `_df(sql, params=())`
and `health()`'s `q(sql, p=())` already default to `()`; keep it that way.

Also measured: a `date` column arrives as pandas `object` holding `datetime.date`,
and `str(date)` still yields `'2026-07-27'`, so `design_finder.py:166`'s
`_days_between(str(r["ad_last_seen"]), ...)` keeps working. `boolean` arrives as
pandas `bool` dtype, and `True == 1` is true in Python, so
`design_system.py:66`'s `r.get("is_new") == 1` and `filters.py:31`'s
`df["starred"] == 1` both keep working unchanged.

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
| `data_access.py:267` | `last_enriched_at < DATE('now', ?)` | `last_enriched_at < CURRENT_DATE - %s` binding a plain **int** |
| `data_access.py:378` | `… || DATE('now')` | `… || CURRENT_DATE` |
| `data_access.py:388` | `… || DATE('now')` | `… || CURRENT_DATE` |
| `db.py:87` | `PRAGMA foreign_keys = ON` | delete — PG enforces natively |
| `db.py:106` | `PRAGMA table_info(t)` | `information_schema.columns` lookup |
| `db.py:185,209` | `ON CONFLICT … DO UPDATE` | **unchanged** — already valid PG |

Once dates are real types (Phase 01), `a - b` yields an integer day count
directly, so the `julianday` wrapper disappears rather than being translated.

### Plus three int-into-boolean writers (found reviewing Phase 01)

Postgres has no implicit `boolean = integer` cast, so these raise
`column "x" is of type boolean but expression is of type integer` on click.
SQLite accepted them silently for the life of the project.

| Site | Current | Becomes |
|---|---|---|
| `data_access.py:273` `set_star` | `SET starred = ?`, binds `int(starred)` | bind the `bool` |
| `data_access.py:308` `set_favorite` | `favorited=int(favorited)` | bind the `bool` |
| `db.py:210` `upsert_design_ad` | `MIN(a, b)` / `MAX(a, b)` — two-arg scalar | `LEAST` / `GREATEST` |

`filters.py:31` compares `df["starred"] == 1`; pandas keeps that working against
a bool dtype, but it should read `== True` once the column is genuinely boolean.

### And five more the plan missed entirely (found scouting 2026-07-29)

| Site | Problem | Becomes |
|---|---|---|
| `data_access.py:249` | `SUM(fb_page_id IS NOT NULL)` — SQLite yields 0/1, Postgres yields `boolean` and `SUM(boolean)` is a hard error | `COUNT(fb_page_id)` |
| `data_access.py:157,202` | `DATE(started_at)` where `started_at` is now `timestamptz`; `::date` resolves in the *session* zone | set the session to `Asia/Ho_Chi_Minh` in `get_conn`, then `started_at::date` |
| `data_access.py:378,388` | `TRIM(x, ' \|')` — the two-argument form is not Postgres | `btrim(x, ' \|')` |
| `data_access.py` ×14 | literal `%` inside LIKE patterns collide with psycopg's placeholder marker | `%%` (see the measured table above) |
| `data_access.py:196-200` | named `:offpage` / `:boost` / `:wdays` / `:cap` | `%(offpage)s` etc. |

Every stored date is written from Python `date.today()` in local time, so the
session timezone is not cosmetic: with the connection left at Supabase's default
UTC, `CURRENT_DATE` and every `timestamptz::date` disagree with the stored dates
for any run between midnight and 07:00 local. Pin it on connect:
`psycopg.connect(dsn, options="-c timezone=Asia/Ho_Chi_Minh")`. Vietnam has no
DST, so it is stable.

### The stale_brands rewrite in the table above was wrong until now

`stale_brands` binds `f"-{stale_days} days"`. Combined with the originally
planned `CURRENT_DATE - %s::interval` that computes `CURRENT_DATE - (-30 days)`
= **thirty days in the future**, so every brand reads as stale and the stale
feed silently becomes "all brands". Bind the plain integer instead and let
Postgres' `date - integer` do the work.

### Four more, past the SQL text itself

1. **`init_db()` must become a no-op under Postgres.** `_df` calls it on *every*
   dashboard query (plus 4 other sites). Applying the migration file there would
   re-run DDL per read. The schema is owned by `supabase/migrations/` now.
   `ensure_column` is **deleted**, not ported — 0001 already folded in all four
   additive columns.
2. **`LEAST`/`GREATEST` change NULL semantics**, beyond the syntax swap: SQLite
   propagates NULL, Postgres ignores it. For `upsert_design_ad`'s
   `ad_oldest_started` the Postgres behaviour is the one we want (evidence
   persists), but the ported `test_design_ads.py` pins it explicitly so it is a
   decision rather than an accident.
3. **`ROUND(double precision, 1)` does not exist in Postgres** — only
   `round(numeric, int)`. `snapshots.score` is `double precision`, so every
   `ROUND(<score arithmetic>, 1)` needs `ROUND((...)::numeric, 1)`. Found by
   running the query, not by reading it.
4. **`COALESCE(b.tee_store, 1) = 1` is a type mismatch** now that `tee_store` is
   boolean → `COALESCE(b.tee_store, true)`. NULL must still *pass* the gate.

### Measured deviation: winner_score rounding

A differential run of the full winner feed against both engines — 5,487 designs —
returns **identical row sets** and identical `ad_days`, with 50 rows (0.9%)
differing on `winner_score` by exactly +0.1 in Postgres' favour.

Cause: SQLite rounds the raw binary double (`16.9499…` → `16.9`); casting to
`numeric` recovers the exact decimal `16.95`, which rounds half-up to `17.0`.
Postgres is giving the arithmetically correct answer; SQLite was showing a float
artifact.

Impact, measured rather than assumed: **top-20, top-50 and top-100 are identical
in both membership and order.** Only past rank 500 do adjacent pairs swap, and
membership still matches. Accepted — emulating IEEE-754 rounding in SQL to
reproduce an artifact is not worth the complexity.

## Files

**Modify**
- `pod_radar/db.py` — `get_conn`, `init_db`, `ensure_column`, 6 upsert helpers,
  `start_run`/`finish_run`
- `dashboard/data_access.py` — 7 rewritten SQL sites + `set_star` / `set_favorite`
  bool binding + placeholders
- `pod_radar/export_design_brief.py` — 1 SQL site
- every `?` placeholder → `%s` across the 59 call sites

`requirements.txt` already carries `psycopg[binary]` — added in Phase 01 for the
loader.

**Watch:** `start_run()` (`db.py:256`) uses `lastrowid` to get the new run id.
Postgres needs `RETURNING id`.

## Steps

1. Add `psycopg[binary]` to `requirements.txt`.
2. Rewrite `get_conn()` to read `POD_RADAR_DB_URL`; when unset, fall back to
   SQLite so the rollback path stays alive through Phase 03.
3. Port `init_db` to apply `supabase/migrations/0001_initial_schema.sql`; port
   `ensure_column` to `information_schema`.
4. Convert `?` → `%s` mechanically, then read every diff hunk — a stray `?` inside
   a LIKE pattern or a URL string must not be rewritten.
5. Rewrite the 7 SQL sites in the table above.
6. `start_run()` → `INSERT … RETURNING id`.
7. Confirm `row_factory` usage (1 site) and `pd.read_sql_query` (1 site) still
   return the same shapes — `psycopg.rows.dict_row` for the former.

## Result (2026-07-29)

Suite: **75 passed** against real Postgres.

End-to-end differential — the *ported* functions run against Postgres, the
pre-port SQL recovered from the `sqlite-final` tag run against SQLite, results
diffed column by column:

| View | Rows | Values differing |
|---|---|---|
| `board()` | 284 = 284 | 0 (score, active_ads, velocity_30d, product_count) |
| `deltas()` | 281 = 281 | 0 — the `::float` cast fixed `pct_ads` |
| `design_feed()` | 5487 = 5487 | `ad_days` 0; `winner_score` 50, `winner_strength` 49 — the documented rounding |
| `new_designs_feed()` | 721 = 721 | 0 — this is the proof the `%%` escaping works |
| `health()` | — | designs_pct 95.5 = 95.5 · resolved_pct 80.5 = 80.5 · total 308 |
| `stale_brands(14)` | 4 = 4 | exact set match — confirms the sign-flip fix |

`winner_strength` carries the same `::numeric` rounding cause as `winner_score`.

### What code review caught that the differential could not

Two classes of defect survived a green suite and a full value-level differential.

**`fetchone()[0]` on a `dict_row` row is `KeyError: 0`** — fixed in one place
during the port and missed in two others: `discover.py:40` and
`seed_import.py:165`. `discover` is *stage 1 of the weekly run*, so the whole
harvest died before resolve, enrich or score executed, leaving only a `runs` row
reading `stage error: 0`. Neither file had any test coverage. Now aliased
(`COUNT(*) AS n`) and covered.

**`ORDER BY col` puts NULLs FIRST in SQLite and LAST in Postgres** — three sites
unported. My differential compared rows *by key*, so it was structurally blind
to ordering: it verified the same rows were present, never that they were in the
same sequence.

| Site | What the NULL means | Effect |
|---|---|---|
| `stale_brands` | never enriched — the *most* stale | buried below brands 15 days old |
| `new_designs_feed` | ad-discovered, not on the shelf yet | the early catch sank to the tail |
| `export_shortlist` | same | **dropped by the LIMIT entirely** — content, not just order |

All three now `NULLS FIRST`, and the differential re-run compares ordered
sequences.

Also fixed: `x/0` returns NULL in SQLite but raises `DivisionByZero` in Postgres,
which would have taken down the Data health page on a fresh schema (`NULLIF`);
`GREATEST(1, NULL)` fabricating a one-day ad run in the design brief; and the
`POD_RADAR_PG_SCHEMA` test lever being honoured in production (now fenced behind
`PYTEST_CURRENT_TEST`).

**One port-introduced regression worth naming:** Postgres poisons a transaction
at the first failing statement, where SQLite carried on. One bad row at brand 40
of 325 would have made every later write raise and the terminal commit discard
the 39 that had succeeded. The enrich harvest loops now take a savepoint per
brand.

### What the second review caught: fixes applied to the site, not the class

A second pass found that three of the first round's fixes had been applied
exactly where the defect was reported and nowhere else — and that one of the
new tests was structurally unable to notice.

- **Savepoints existed only in the two harvest loops.** Stage A and Stage B ran
  one transaction across all 325 brands. `active_ads` is `int4` now, so one
  mis-scraped ad count — a value SQLite simply stored — aborts the transaction
  and discards every brand already written in that stage. Both loops are
  savepointed now, and `run_enrichment` has a wrapper that closes the run row
  and the connection on the failure path. Without it an escaping exception left
  `finished_at` NULL forever, so `new_designs_feed` and `is_new` kept reading
  the previous week's window.
- **`_clean` guarded one writer of four.** `upsert_brand` takes user-uploaded
  CSV cells; `upsert_design_ad` takes handles off the browser-eval chain. Worse
  than the crash risk: the ad path wrote the *raw* handle while the design path
  wrote the *cleaned* one, so any handle `_clean` altered left `design_ads` and
  `designs` unable to join and the design silently lost its ad evidence in the
  winner feed. Cleaning now happens once, at the source.
- **The batch entry points still leaked connections** on every error path —
  the unattended weekly ones, against a session pooler where each leak pins a
  slot until TCP timeout.

**The test that could not fail.** `test_a_failed_write_scopes_to_one_brand`
reimplemented the loop and asserted *psycopg's* savepoint semantics, so it
passed with zero `conn.transaction()` calls in `enrich.py` — which is exactly
why Stage A and B went unnoticed. Four other tests had the same shape: they
restated production SQL instead of calling it. All five now execute the real
code, and each is mutation-checked — reverting its fix makes it fail:

```
CAUGHT  shortlist keeps unranked designs      CAUGHT  ad handles clean identically
CAUGHT  design brief reports no fake ad-days  CAUGHT  enrich loops are savepointed
CAUGHT  never-enriched brands sort first      CAUGHT  unranked designs lead the feed
```

**And a suite that tested nothing.** The autouse safety fixture depended on the
DSN fixture, and an autouse fixture requesting a skipping fixture skips the
*entire session*: with no DSN the suite reported `85 skipped`, exit 0 —
including the 27 tests that never touch a database, the auth gate among them.
Since the DSN lives in a gitignored file, that was the default state on every
machine but this one. Now: 45 pass / 42 skip without a DSN.

`init_db` was a no-op called from eleven sites; its last caller is gone, so it
is deleted rather than left as permanent scaffolding.

### The test harness reached production once

`dashboard/data_access.py` does `from pod_radar.db import get_conn`, which binds
the function object at import. The conftest monkeypatched `db.get_conn`, so that
binding never changed, and `test_set_traffic_and_rescore_persist` drove
`rescore_now()` straight into the live schema — rewriting `score` on 271 real
brands. No structural damage (row counts, scored-row count and the `x.com` test
row all checked), and the values were restored from the SQLite baseline and
verified identical.

Fix: redirection moved *inside* `get_conn`, which reads `POD_RADAR_PG_SCHEMA` on
every connect, so it cannot be bypassed by an import alias. Pinned by
`tests/test_zz_fixture_smoke.py`, which asserts that a connection opened by
`data_access` itself lands in the test schema.

The lesson generalises: **patch where connections are born, not where they are
named.** A guard on the fixture's own connection proves nothing about the
connections that code under test opens.

## Validation

- `grep -rn "sqlite3" pod_radar/ dashboard/` returns nothing but the fallback path.
- `python -c "import data_access"` clean; every dashboard view renders.
- `brookeandbelle.com|scatterkindness` shows the same ad-day count Postgres and
  SQLite both report (116 as of 2026-07-28, and it moves every enrich run — read
  it, don't assume it); Data health still shows 96.1%.
- Star a brand and favorite a design — both write without a type error.
- Spot-check a `GREATEST` query returns identical numbers to the SQLite baseline.

## Risks

- **`MAX` → `GREATEST` is a hard error in PG, not a silent wrong answer** — it will
  fail loudly, which is the good case. Do not "fix" it by adding a GROUP BY.
- **Mechanical `?` → `%s` can corrupt string literals.** Review every hunk.
- **`psycopg` is the first non-Streamlit dependency** in a stdlib+1 repo. Accepted
  cost, noted in `README.md`.

## Test harness (absorbed from Phase 03)

No Docker and no local Postgres on this machine, so the fixture isolates itself
**inside the Supabase project by schema** rather than by server:

- `conftest.py` creates a uniquely-named schema, applies `0001_initial_schema.sql`
  into it, and points `search_path` at it.
- It refuses to run if `current_schema()` resolves to `public` — that guard is
  what stops a stray env var from truncating the 9,158 real rows.
- Teardown drops the schema.

`test_migrate_coercion.py` stays on SQLite deliberately: it tests the loader
*reading* SQLite, and is the one legitimate `sqlite3` import left in the tree.

A separate Supabase project would be stronger isolation and is the right move if
this ever gains a second contributor. Noted, not done.

## Rollback

`git checkout sqlite-final` (tag at `0cff12d`) restores the SQLite tree, and
`data/pod_radar.db` is untouched by every commit after it. Re-cutover is a
re-run of `scripts/migrate_sqlite_to_pg.py`, which is idempotent against an
empty schema.
