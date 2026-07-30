# POD Radar — hosted dashboard latency

**Status:** phases 01–03 ✅ complete 2026-07-30. 237 tests green (was 222).
Phase 04 open: the Cloud→Supabase number still has to be read off the deployed
app, then the diagnostics come out.

## What this actually found

The latency work went as planned. It also surfaced a **live correctness bug**
that had nothing to do with performance, and that is the more important result.

**`-c timezone=` never reliably applied.** Supabase's session pooler reuses
server-side backends across client connections: five separate
`psycopg.connect(dsn, options='-c timezone=Asia/Ho_Chi_Minh')` calls all
reported `UTC` while `pg_backend_pid()` cycled between two values. The startup
packet lands only on a freshly created backend; a recycled one keeps whatever it
had. So the session zone was **nondeterministic** — `runs` rows 24 and 25 were
written under `+07`, today's connections get UTC.

That matters because dates are written from Python's local `date.today()` while
queries compare against `CURRENT_DATE`, and naive timestamp literals are
interpreted in the session zone. Under UTC they disagree for the seven hours
after local midnight: `stale_brands` computes its threshold a day early,
exclude/restore stamp yesterday into the note, and a `runs.started_at` written
then reads back a day later — which `is_new` and the new-designs feed compare
against.

**Checked before shipping: no backfill needed.** Every existing `runs.started_at`
is consistent with the local time its stage plausibly ran, and the `is_new`
subquery still matches 816 designs. `search_path` in the startup options is
unaffected and still applies, so the test fixture's schema redirection is
untouched. Fixed by setting the zone with a statement, on both the pooled and
unpooled paths — the only deterministic option on a backend-pooling proxy.
**Code:** `D:/github local/pod-research` (remote `lythanhbinh93/pod-radar`, master)
**Follows:** [accounts and roles](../260729-1826-pod-radar-accounts-and-roles/plan.md)

Every tab click on the hosted dashboard takes seconds. Measured, the cause is
round trips rather than queries — and part of it was introduced by the auth
work immediately before this.

## The measurement this plan is built on

Taken 2026-07-30, this desktop → Supabase `ap-southeast-1`:

```
connect + trivial query :   0.49s     <- per get_conn() call
1 connect + 5 queries   :   0.57s     <- the queries are ~0.02s each
5 connects + 5 queries  :   2.08s

10 reads, connect each time :   4.12s
10 reads, pooled            :   1.16s
```

**Opening the connection is ~95% of the cost.** Tuning SQL would address 5%.
Pooling removes the TLS handshake; the residual ~0.12s is network latency and
no amount of client work removes it.

## Anatomy of one tab click today

| Step | Cost |
|---|---|
| `<a href="?view=slug">` → full document load, script boots fresh | page load |
| `_stored_token("read")` → component round trip → "Restoring your session…" + `st.stop()` | one extra render pass |
| Component replies → rerun → `_load_user()` | one fresh connection, ~0.5s |
| View renders | mostly cached, `CACHE_TTL = 120` |

The middle row is a regression from the localStorage session fix
(`16bbbd3`). It is the price of Community Cloud not forwarding cookies, and
in-session tabs remove it from the common path rather than paying it per click.

## Accepted decisions — 2026-07-30

| Decision | Choice |
|---|---|
| Nav | **In-session tabs.** Browser Back no longer walks tab history and middle-click-to-new-tab on a tab stops working. Accepted explicitly. |
| Region | **Measure before deciding.** No Supabase migration on an assumption about where Community Cloud runs. |
| Role re-read | **Stays on every interaction.** Pooling makes it ~0.12s; caching it would delay a demotion taking effect. Speed is bought with pooling, not by weakening the auth property. |

## Requirements

1. Tab switching is in-session — no document load, no session-restore round trip.
2. Database access is pooled, and pooling is **fenced to the Streamlit runtime**
   so `run_weekly.py` never holds a pool open across an 18-hour enrich.
3. Real Cloud→Supabase round-trip latency is measured from the deployed app and
   written down before any region decision.
4. The weekly harvest keeps working unchanged.

## Non-goals

- No Supabase region migration in this plan — only the number that would justify one.
- Not solving Community Cloud's ~30s wake-from-idle.
- Not batching the ranked board's 30 `history()` calls. Same root cause, bigger
  change; pooling already takes it from 30×0.41s to 30×0.12s. Revisit after.
- No UI redesign, no change to the auth model.

## Phases

| # | Phase | Depends on | File |
|---|-------|-----------|------|
| 01 | Latency probe ✅ built · number ⏳ | — | [phase-01-latency-probe.md](phase-01-latency-probe.md) |
| 02 | Connection pool ✅ | — | [phase-02-connection-pool.md](phase-02-connection-pool.md) |
| 03 | In-session tabs ✅ | 02 | [phase-03-in-session-tabs.md](phase-03-in-session-tabs.md) |
| 04 | Cleanup + region decision ⏳ | 01, 03 | [phase-04-cleanup-and-decision.md](phase-04-cleanup-and-decision.md) |

## The region number — measured 2026-07-30 from the deployed app

Acceptance criterion 3, closed. Streamlit Community Cloud → Supabase
`ap-southeast-1`:

| | desktop → SG | Cloud → SG | ratio |
|---|---|---|---|
| one query on an open connection | 0.055s | **0.196s** | 3.6× |
| connect + one query | 0.304s | 0.993s | 3.3× |
| 3 reads, connect each time | 1.114s | 4.335s | 3.9× |
| 3 reads, pooled | 0.498s | 1.919s | 3.9× |

**196ms per round trip is trans-Pacific.** Per the phase 04 decision table
(>150ms), a US Supabase project is justified: it would take the floor from
~196ms to roughly 5-20ms, which is 10-40× on every query rather than the ~2.3×
pooling bought. Everything else in this plan is now second-order.

Two things the number also exposes:

- **The `check=` liveness probe costs a full round trip per checkout** — ~196ms
  on Cloud, about half of a pooled read. Correct, but expensive at this
  latency, and free at US latency.
- **The 3-read sample includes pool warm-up** (`min_size=1`, so reads 2 and 3
  may create connections). Steady-state pooled reads are nearer 0.4s than the
  0.64s the average implies.

## Measured after (desktop → ap-southeast-1)

| | before | after |
|---|---|---|
| 10 reads via `get_conn` | 4.12s | **1.51s** |
| 3 reads via `get_conn` | ~1.11s | **0.50s** |
| Tab click | full document load | **no document load**, ~470ms |
| Session timezone | nondeterministic UTC/+07 | **`Asia/Ho_Chi_Minh`, every connection** |

Browser-verified against the running app: plain tab click intercepted with the
document alive, ctrl-click passed through to the browser, `?refresh=1` still
reloads, `?domain=` deep link then a tab click clears the domain, sign-out
still works.

## What review changed

Both blockers were mine, and one of them I had also mis-explained.

- **`?perfdiag=1` was unauthenticated and opened 21 connections per hit** — an
  anonymous way to exhaust the Supavisor budget for real users and pin the
  container. Now behind `require_auth()` **and** admin-only, cut to 3 reads, and
  `server_addr` / `pool_max` / the full host are no longer printed. `?authdiag=1`
  from the previous plan is deleted; it had done its job.
- **The pool had no `check=`**, so a recycled connection was handed out with no
  liveness probe while `max_lifetime` is only enforced on return. On a quiet
  dashboard the pool shrinks to one connection, the path in front of Supavisor
  drops it, and the next visitor's first query fails. Added
  `check=ConnectionPool.check_connection`.
- **I claimed a bare `conn = get_conn()` would leak a pooled checkout.** It
  does not — `@contextmanager` is lazy, so it raises `AttributeError` on first
  use. Corrected, and the grep guard widened to `pod_radar/` (reached from the
  views) and to annotated / attribute / walrus / return forms.
- **Modifier clicks were being swallowed.** ctrl/cmd/shift-click fire `click`,
  so "open this view in a new tab" became a silent in-place switch. Now passed
  through.
- **`_df` had no error handling** and is the widest path to the new
  `PoolTimeout` / `OperationalError` class. Now logs and shows a generic message,
  matching the rest of the file.

## Acceptance criteria

1. A tab click renders content with **no document navigation** in DevTools
   Network, in under 300ms.
2. Ten sequential pooled reads complete in **under 1.5s** (4.12s today).
3. The Cloud→Supabase RTT is recorded as a number in this plan.
4. `run_weekly.py --stage score` runs unattended, uses **no pool**, and its
   duration is unchanged.
5. `?domain=` and `?view=` still work when pasted into a fresh browser.
6. Sign-in, tab click, deep link, refresh and sign-out all verified in a real
   browser against the deployed app — not only in tests.
7. Suite green (222 today), with a test pinning the unpooled path.

## Risks

- **The pool must not leak into the harvest.** `run_weekly` runs for up to 18
  hours in one process; a pool there would hold Supabase slots open the whole
  time for no benefit. Fenced on `st.runtime.exists()`, the same fence
  `_streamlit_secret()` already uses in `db.py` — and verified by running the
  real command, not by reading it.
- **Supabase connection budget.** Pooled connections stay open. Cap at 4 per
  process and watch the pooler if app instances multiply.
- **In-session tabs change how state is reset.** The current anchors reset
  widget state by virtue of being a fresh document; switching in-session keeps
  `session_state`, so filters and page numbers may persist across views in ways
  they previously did not. Check `_clear_filters` / `_reset_page_on_change`.
- **A fourth dependency** (`psycopg[pool]`, pure Python) in a build that was
  just pinned to three lines.

## Rollback

Each phase is independent and revertable. The pool is one function in `db.py`
behind a runtime fence; the nav is one function in `design_system.py` plus the
routing block in `app.py`. Reverting either restores current behaviour.
