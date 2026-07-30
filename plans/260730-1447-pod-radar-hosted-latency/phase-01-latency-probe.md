# Phase 01 — Latency probe + measurement

**Depends on:** — · **Blocks:** 04

Ten minutes of work that decides whether a Supabase region migration is worth
considering. Temporary; removed in phase 04.

## Files

`dashboard/auth.py` (add `perf_diagnose`), `dashboard/app.py` (route it).

## Steps

1. `?perfdiag=1`, alongside the `?authdiag=1` already deployed and routed
   ahead of the gate. Reports:
   - time to open one connection and run `SELECT 1`
   - time for ten sequential reads on one connection (isolates RTT from handshake)
   - time for ten reads each opening its own connection (today's shape)
   - `SELECT inet_server_addr()` and the DSN **host only** — never the password
   - `time.time()` server-side vs the same numbers, so the two environments are
     comparable against the desktop figures already recorded in plan.md
2. Deploy, load it, record the numbers verbatim into plan.md.

## Validation

- The probe prints no credential, no DSN password, no token. Host only.
- Numbers land in plan.md as a table beside the desktop baseline.

## Risks

- **It is reachable while signed out**, deliberately — the same reasoning as
  `authdiag`, and it exposes nothing an anonymous visitor could not infer from
  page timings. It still comes out in phase 04.
- Running ten sequential connects on a cold Cloud container will look worse
  than steady state. Load it twice and record the second run.
