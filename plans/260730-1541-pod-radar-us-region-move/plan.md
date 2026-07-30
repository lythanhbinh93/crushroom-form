# POD Radar — move Supabase to a US region

**Status:** planned 2026-07-30, not started
**Code:** `D:/github local/pod-research` (remote `lythanhbinh93/pod-radar`, master)
**Follows:** [hosted latency](../260730-1447-pod-radar-hosted-latency/plan.md)

## Why — the number, not a hunch

Measured 2026-07-30 from the deployed app, Streamlit Community Cloud →
Supabase `ap-southeast-1`:

| | desktop → SG | Cloud → SG |
|---|---|---|
| one query on an open connection | 0.055s | **0.196s** |
| connect + one query | 0.304s | 0.993s |
| 3 reads, pooled | 0.498s | 1.919s |

**196ms per round trip is trans-Pacific.** Community Cloud is US-hosted; the
database is in Singapore. Pooling already bought ~2.3× and is why the app is
usable, but it cannot touch the floor. A US project takes that floor to roughly
5-20ms — **10-40× on every query** — and makes the remaining items in the
latency plan (the board's 30 `history()` calls, the `check=` probe's extra round
trip) stop mattering.

## Source is Postgres now, not SQLite

`scripts/migrate_sqlite_to_pg.py` does **not** apply. It reads a SQLite file;
this is Postgres → Postgres.

`pg_dump` is the obvious tool and is likely unavailable: dumping needs a direct
connection, and Supabase's direct host is **IPv6-only** on this plan — the
documented reason the DSN uses the session pooler on 5432 in the first place. So
the plan is a table-by-table copy in Python through two pooler connections,
reusing the verification shape that the SQLite migration already proved.

## What moves — counts as of 2026-07-30

| table | rows | note |
|---|---|---|
| `brands` | 325 | includes `starred`, `notes`, `traffic_manual` — user-owned |
| `snapshots` | 1431 | `id` is `GENERATED ALWAYS AS IDENTITY` |
| `designs` | 6623 | `id` identity |
| `runs` | 25 | `id` identity; history the dashboard reads |
| `design_ads` | 745 | |
| `design_analysis` | 10 | |
| `design_state` | 0 | still empty — nobody has favourited yet |
| `users` | 2 | **copy the hashes**, so existing passwords keep working |
| `app_config` | 1 | **copy the cookie key**, so nobody is signed out |

Three identity columns need `OVERRIDING SYSTEM VALUE` on insert and a sequence
reset afterwards — the same problem the SQLite loader solved, and the same
non-consuming `SELECT last_value, is_called` check to verify it.

Copying `users` and `app_config` is the difference between a migration nobody
notices and one where two people have to be re-created and everyone signs out.

## Sequencing — this is the real decision

The weekly harvest and the dashboard read **one** DSN. There is no split-brain
option; the cutover moves both at once.

[Migration phase 04b](../260728-1621-pod-radar-supabase-migration/phase-04-cutover.md)
sets **Mon 2026-08-03 09:00** as the soak — the first time the browser stages
(`discover`, `resolve`, `enrich`) ever touch Postgres. Moving regions before
that means the soak tests a brand-new database *and* a new region at once, and
any failure has two candidate causes.

**Recommended: cut over after Monday's run completes.** The dashboard is already
usable at ~0.4s per pooled read, so the cost of waiting is small and the cost of
confounding the soak is a day of diagnosis.

## Which US region

Unknown until measured, and measurable **before** cutting over: create the new
project, point `POD_RADAR_PG_DSN` at it in Cloud secrets only, load nothing, and
read `?perfdiag=1`. Pick on the number rather than on a guess about where
Community Cloud runs.

Start with `us-east-1` (the common default and closest to GCP `us-central1` on
most paths), but treat that as a hypothesis.

## Phases

| # | Phase | File |
|---|-------|------|
| 01 | New project + region measured before any data moves | phase-01-project-and-region.md |
| 02 | Postgres → Postgres copy script + verification | phase-02-copy-and-verify.md |
| 03 | Cutover, re-measure, retire the old project | phase-03-cutover.md |

## Acceptance criteria

1. `?perfdiag=1` from the deployed app reports **one query < 40ms** (from 196ms).
2. Every table's row count matches the Singapore project exactly, and a
   value-level differential on `brands` + `snapshots` finds no differences.
3. The three identity sequences are past their max id, verified without
   consuming a value.
4. `lythanhbinh` and `vytun` sign in with their **existing** passwords.
5. Nobody is signed out — `app_config.cookie_key` carried over.
6. `run_weekly.py --stage score` runs unattended against the new DSN.
7. Full suite green against the new project.
8. The Singapore project stays alive and untouched until 1-7 pass.

## Non-goals

- No schema change. Migrations 0001 and 0002 apply as they are.
- Not moving the harvest off the desktop — `agent-browser` still needs Chrome.
- Not revisiting `check=` or the board's `history()` batching here; the point of
  this plan is to make both irrelevant.

## Risks

- **The desktop harvest gets slower**: ~55ms → ~200ms per query. `enrich` is
  browser-bound at ~12s per item so it will not notice; `score` does a few
  hundred queries and may add ~a minute to a multi-hour run. Accepted, and worth
  re-measuring rather than assuming.
- **A copy that silently drops rows.** The SQLite migration's lesson was that a
  row-count check passes while values differ; criterion 2 requires a value-level
  differential, not just counts.
- **Two DSN locations** (`.streamlit/secrets.toml` and Cloud secrets). Updating
  one and not the other means the dashboard and the harvest write to different
  databases — the exact split-brain the Postgres migration existed to remove.
- **Cutting over before Monday** confounds the soak. See Sequencing.

## Rollback

The Singapore project is not deleted until everything passes. Reverting is
putting the old DSN back in both places; anything written to the US project in
between is re-derivable by a harvest, except `design_state`, `brands.starred`
and `brands.notes`, which are user-owned — export those three to CSV before
cutover.
