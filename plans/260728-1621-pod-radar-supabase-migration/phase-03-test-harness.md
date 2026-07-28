# Phase 03 — Postgres test harness

**Depends on:** 02 · **Blocks:** 04

This is the largest phase by effort. It is bigger than the driver swap and is the
part most likely to be under-budgeted.

## Context

9 test files build an in-memory SQLite database and call `init_db(conn)` against
it (23 `:memory:` occurrences):

- `test_dashboard_deltas.py`
- `test_data_health_coverage.py`
- `test_design_ads.py`
- `test_design_state.py`
- `test_latest_snapshot_skips_unscored_midrun_rows.py`
- `test_score.py`
- `test_score_traffic.py`
- `test_tee_store_gate.py`
- `test_upsert_design_image_guard.py`

Several assert against SQL that is being rewritten in Phase 02 — `test_dashboard_
deltas` and `test_data_health_coverage` exercise `data_access` SQL constants
directly, so they must run on the dialect that ships.

## Requirements

1. The suite runs against real Postgres.
2. Each test gets an isolated, empty schema — no cross-test bleed.
3. Setup cost is low enough that the suite stays runnable on every edit.

## Approach

A session-scoped `conftest.py` fixture that:
- reads `POD_RADAR_TEST_DB_URL` (a Supabase branch/schema or a local container),
- creates a uniquely-named schema per test, applies
  `migrations/0001_initial_schema.sql`, sets `search_path`, drops it on teardown.

Replace the per-file `sqlite3.connect(":memory:")` + `init_db()` pattern with that
fixture. Test *bodies* — the assertions — stay as they are; only the connection
setup changes.

## Files

**Create**
- `tests/conftest.py` — the fixture

**Modify** — all 9 files above, setup only

## Steps

1. Write `conftest.py`; prove it on the smallest file (`test_design_state.py`).
2. Port the remaining 8 one at a time, running the suite after each.
3. Delete the now-dead `import sqlite3` lines.
4. Record wall-clock before/after; if it exceeds ~30s, switch schema-per-test to
   transaction-rollback-per-test.

## Validation

- Full suite green against Postgres.
- `grep -rn ":memory:" tests/` returns nothing.
- Deliberately reintroduce `MAX(1.0, …)` in one query → a test fails. This proves
  the suite actually exercises the dialect; if everything still passes, the harness
  is not testing what it claims to.

## Risks

- **Speed.** SQLite in-memory is effectively free; Postgres is not. If the suite
  becomes slow enough to skip, the port has made testing worse, not better.
  Transaction-rollback isolation is the fallback.
- **Network dependency.** A remote test DB makes the suite fail offline. A local
  container avoids it at the cost of requiring Docker.
- **Fixture masking.** A fixture that silently swallows DDL errors would make every
  test pass against an empty schema. The deliberate-failure check above exists to
  catch exactly that.

## Rollback

Tests are additive to the port — if the harness stalls, Phase 02 code still works.
Do not ship Phase 04 with a red or skipped suite.
