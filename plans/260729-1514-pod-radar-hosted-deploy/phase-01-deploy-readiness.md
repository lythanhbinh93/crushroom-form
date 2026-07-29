# Phase 01 — Deploy readiness (code)

**Depends on:** — · **Blocks:** 02 · **✅ DONE 2026-07-29**

Everything that must be true *before* a Cloud app is created. All of it is
verifiable on the desktop; none of it needs an account.

## What review changed — read this before trusting the steps below

Two findings survived verification and materially changed the design. Both are
recorded here because the *original* version of each looked correct.

### The Host header cannot carry an authorization decision

Step 2 originally opened the app whenever `st.context.headers["Host"]` named
localhost. `Host` is client-supplied: anything that can reach the app can send
`Host: localhost` on the websocket handshake and be treated as local — the
exact outcome the change exists to prevent. A browser won't; a scripted client
will.

Consent now comes from **`POD_RADAR_OPEN=1` in the server's environment**,
which a remote caller cannot forge, **ANDed** with the local-looking request.
There is a second, opposite risk that argued for the same fix: if Community
Cloud's proxy rewrites `Host` when forwarding to the container, the app would
have seen `localhost` and opened itself with no attacker at all.

`st.context.ip_address` is not a substitute — Streamlit runs Tornado without
`xheaders`, so behind a same-pod proxy it returns `None` exactly as it does
for a genuine localhost request.

### `st.secrets` is not Cloud-only, and step 1 nearly aimed the weekly task at
### the wrong database

`st.secrets` has its own search path. Verified on the installed 1.56:

```
C:\Users\<user>\.streamlit\secrets.toml
<CWD>\.streamlit\secrets.toml
```

So the new fallback was a **second filesystem source keyed on `%USERPROFILE%`
and on the process working directory**. The repo's `secrets.toml` wins today,
so nothing misbehaved — but the moment that file went missing or lost its
`pg_dsn`, the unattended weekly task would stop failing loudly and instead
resolve a DSN from the home directory and write an entire harvest into it.

`_streamlit_secret` is now gated on `st.runtime.exists()`, which is `False` in
every non-Streamlit process. A loud failure is the feature.

## Files to modify

| File | Why |
|---|---|
| `pod_radar/db.py` | `resolve_dsn()` cannot see Cloud secrets — deploy blocker |
| `dashboard/auth.py` | gate fails open on a public URL |
| `pod_radar/export_shortlist.py` | returns a server-side `Path` |
| `pod_radar/export_design_brief.py` | same |
| `dashboard/views/ranked_board.py` | export call site → download button |
| `dashboard/views/design_finder.py` | export call site → download button |
| `requirements.txt` | `pandas` implicit |
| `tests/test_auth.py` | new fail-closed behaviour |
| new `tests/test_dsn_resolution.py` | source precedence |

## Steps

### 1. `resolve_dsn()` learns a third source

Order is deliberate: **env → `secrets.toml` file → `st.secrets` → raise.**

- env first, so an explicit override always wins;
- the **file before** `st.secrets`, so the desktop and `run_weekly.py` resolve
  without importing Streamlit at all — `run_weekly` runs under Task Scheduler
  with no script-run context, and `st.secrets` there is at best a warning and
  at worst an exception;
- `st.secrets` last, guarded by `try/except Exception`, because that is the
  only source Streamlit Cloud actually provides.

The raise message gains the Cloud case so a failed deploy says what to do.

### 2. The gate fails closed off-localhost

`require_auth()` keeps returning early with no password **only when the request
came from localhost**. Read the host from `st.context.headers.get("Host")`:
`localhost:8501` / `127.0.0.1:*` on the desktop, `*.streamlit.app` on Cloud,
`*.trycloudflare.com` behind the tunnel that is already in the README.

Off-localhost with no password configured → render an explicit
"this deployment has no password set" panel and `st.stop()`. Serving nothing is
the correct failure; serving the dataset open is not.

If the header is unreadable (bare script run, tests) treat it as **not**
localhost — fail closed is the safe default when the signal is missing. Local
`streamlit run` always has the header, so this costs the desktop nothing.

### 3. Exports become client downloads

Split content generation from disk I/O, which is the actual defect — the write
is fine locally and meaningless hosted.

- `export_shortlist(domains, top_designs=8)` → keep the signature, but factor
  the body into `build_shortlist(...) -> {"md": str, "csv": str, "stamp": str}`
  and have the existing function write those strings. Same for
  `build_design_brief(...) -> {"md": str, "name": str}`.
- Both views call the **builder** and render `st.download_button` per artefact.
  No file is written by the hosted app at all.

No CLI or script calls either function (checked: the only callers are the two
views and the tests), so the writer wrappers exist purely to keep the current
tests meaningful. Keep them — they are three lines and they document intent.

### 4. `requirements.txt`

Add `pandas>=2,<3`. It is imported directly by `dashboard/data_access.py` and
is currently satisfied only as a transitive Streamlit dependency.

### 5. Tests

- **DSN precedence** — env beats file beats `st.secrets`; each source alone
  resolves; none configured raises. `st.secrets` is faked via a stub module so
  the test does not need a Streamlit runtime.
- **Fail-closed auth** — no password + `Host: pod-radar.streamlit.app` must
  `st.stop()`; no password + `Host: localhost:8501` must pass through. Extend
  `tests/test_auth.py`, which already fakes `st.secrets`.
- Mutation-check both: revert the change, the test must fail. The migration
  phase produced a savepoint test that passed with the fix reverted — do not
  repeat that.

### 6. Fixes taken from review beyond the two above

- **Stale export payloads.** `pr-shortlist` is keyed by the exact filtered
  domain list and `pr-brief` by `(domain, handle, target)`. Unkeyed, changing a
  filter or editing the target niche left the download buttons serving the
  *previous* result with no signal — and "export the current filter" is the
  button's entire contract.
- **`streamlit>=1.49`**, not `>=1`. The floor is load-bearing: `st.context`
  arrived in 1.37 and `width="stretch"` in 1.49. On an older 1.x the auth guard
  becomes a **permanent lockout** — `st.context` raises, the request is treated
  as non-local, and the refuse panel renders even on the desktop.
- **`showErrorDetails = "stacktrace"`** in `.streamlit/config.toml`. The
  default renders surrounding source in the browser on any uncaught exception.
- **Non-string secret rejected.** A DSN pasted as a TOML section is a truthy
  Mapping; it now falls through to the actionable `RuntimeError` instead of an
  obscure `TypeError` inside psycopg.
- **`st.error` no longer prints raw exception text** in `design_finder` — a
  psycopg failure carries host/user/dbname. Detail goes to the server log.
- **`--selector`** (a stray 400 KB artifact at the repo root) is gitignored so
  a `git add -A` on a deploy commit cannot ship it.

## Validation — all done 2026-07-29

- **126 tests pass** (101 before this phase).
- **Mutation-checked all five new guards.** Reverting each makes its test fail:
  gate fails open; no-signal treated as local; `st.secrets` source dropped;
  `POD_RADAR_OPEN` requirement dropped; live-runtime gate dropped.
- **Unattended path proven in a fresh process**: `import run_weekly` +
  `resolve_dsn()` + `get_conn()` succeeds and `streamlit` is **not** in
  `sys.modules`. Latest `runs` id still 25 — no test rows leaked.
- **Host parsing proven against a real browser**, not the docs: agent-browser
  against a live local Streamlit reports `Host: localhost:8598` →
  hostname `localhost` → local. The lockout risk is measured, not assumed.
- **`download_button` inside `st.dialog` proven in a real browser** — review
  flagged known dialog/rerun edge cases. Clicking Export keeps the dialog open
  and renders the button; clicking the download keeps both alive.
- Export output **byte-identical** to the previous writer (verified old vs new
  against the same rows and a frozen timestamp), except downloaded markdown is
  LF where the written file was CRLF. Benign; CSV keeps CRLF, so Excel is
  unaffected.
- Dashboard boots headless, `/_stcore/health` 200, no import errors.

## Risks

- **Step 1 touches the connection path every process shares**, including the
  scheduled task. The ordering is what keeps `run_weekly` from importing
  Streamlit; verified with the real import, not by reading it.
- **Step 2 changes local behaviour for LAN access.** `streamlit run` prints a
  Network URL (`http://192.168.x.x:8501`), and opening the dashboard from a
  phone on the same LAN now needs either a password or `POD_RADAR_OPEN=1`.
  This is intended — LAN is not localhost — but it is a real change to an
  existing workflow, and the refuse panel names both remedies.
- **Not verifiable from the desktop:** whether Community Cloud preserves the
  original `Host` on the `/_stcore/stream` upgrade. It no longer matters for
  safety (the env var is the necessary condition), but confirm it on first
  deploy anyway — see phase 02.
