# Phase 02 — Connection pool

**Depends on:** — · **Blocks:** 03

The change that helps everything: 0.41s → 0.12s on every database touch,
app-wide. Measured, not projected.

## Files

`pod_radar/db.py`, `requirements.txt`, `tests/test_connection_pool.py` (new).

## Steps

### 1. A pool, fenced to the Streamlit runtime

`psycopg_pool.ConnectionPool`, `min_size=1, max_size=4`, held as a module-level
singleton created on first use under a lock. **Not** `@st.cache_resource` —
`db.py` is imported by processes with no Streamlit at all, and the decorator
would put a Streamlit dependency on the harvest's import path.

`get_conn()` keeps its exact signature and returns a pooled connection **only
when `st.runtime.exists()`**, the same fence `_streamlit_secret()` already uses
two functions above. Everywhere else it behaves exactly as today.

That fence is a correctness requirement, not tidiness: `run_weekly` runs one
process for up to 18 hours, and a pool there would hold Supabase session-pooler
slots open for the whole run to serve a workload that opens a connection per
stage.

### 2. The context-manager contract must not change

Callers do `with get_conn() as conn:` roughly 59 times and expect the
connection **closed** on exit. `pool.connection()` returns it to the pool
instead — which is what we want — but the object handed back must still work
under `with`, still expose `.execute`, `.commit`, `.cursor`, and still apply
`row_factory` and the `timezone`/`search_path` options.

Set those via the pool's `kwargs` and `configure` so every pooled connection is
identical to a fresh one. `dict_rows=False` for pandas must still work, which
means the row factory is per-checkout, not per-pool — verify it, do not assume.

### 3. `requirements.txt`

`psycopg[binary,pool]` rather than a separate line, so the version stays tied
to psycopg's own resolution.

### 4. Tests

- With no Streamlit runtime, `get_conn()` returns an **unpooled** connection —
  the harvest's path. Mutation-check by removing the fence.
- Pooled and unpooled connections behave identically: `dict_row` by default,
  `tuple_row` under `dict_rows=False`, timezone applied, test schema honoured.
- The pool is created once, not per call.
- A connection returned to the pool is reusable and carries no leaked state
  (an aborted transaction on one checkout must not poison the next).

## Validation

- Ten sequential reads under 1.5s (4.12s today), measured the same way.
- `run_weekly.py --stage score` runs end to end with **no pool created** —
  assert on the module's singleton being None afterwards, in a real process.
- Full suite green.

## Risks

- **A returned connection carrying state.** Postgres poisons a transaction at
  the first failing statement, and a checkout that ends mid-failure must be
  reset before reuse. `psycopg_pool` does this on `putconn`; the test above is
  what proves it rather than trusting it.
- **Thread safety.** Streamlit runs each session in its own thread, which is
  exactly why this is a pool and not one cached connection.
- **Supabase slots.** 4 per process, and the session pooler is shared with the
  desktop harvest. Watch it if instances multiply.
