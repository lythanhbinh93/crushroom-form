# Phase 02 — Deploy + verify

**Depends on:** 01

Half of this is done in a browser on the user's account and cannot be
automated. Those steps are marked **[you]**.

## Steps

### 1. Merge to `master` and push

`master` is **10 commits behind** `fix/dashboard-nav-auth-and-render-bugs` and
**0 ahead** — a clean fast-forward, no conflict possible. Cloud can deploy any
branch, but pointing it at a long-lived feature branch means the deployed
"latest" silently diverges from the repo's default branch.

```
git checkout master && git merge --ff-only fix/dashboard-nav-auth-and-render-bugs
git push origin master
```

The `sqlite-final` tag stays as the pre-migration rollback point.

### 2. **[you]** Confirm the free tier accepts a private repo — do this first

share.streamlit.app → **Create app** → *Deploy from GitHub*, authorise the
`pod-radar` repo. If it will not list or will not deploy a private repo, stop
here and re-decide hosting. **Making the repo public is not the fallback.**

### 3. **[you]** Create the app

| Field | Value |
|---|---|
| Repository | `lythanhbinh93/pod-radar` |
| Branch | `master` |
| Main file path | `dashboard/app.py` |
| Python version (Advanced) | **3.13** |

`dashboard/app.py` inserts both its own directory and the repo root onto
`sys.path`, so the nested `data_access` / `components` / `views` imports resolve
from Cloud's repo-root working directory unchanged.

### 4. **[you]** Paste secrets

Advanced settings → Secrets, in TOML:

```toml
pg_dsn = "..."        # the session-pooler DSN, port 5432, password percent-encoded
app_password = "..."  # anything; this is the only thing between the URL and the data
```

Both values come from the desktop's `.streamlit/secrets.toml`, which is
gitignored and stays that way. Do not commit them and do not paste them into
chat. Percent-encoding matters: an `@` in the password must be `%40` or the DSN
parses wrong — the same trap the migration hit.

### 5. Verify against the acceptance criteria

**Stop the desktop Streamlit process first.** Otherwise a working local app
masks a broken hosted one.

- Load the URL → login gate appears, wrong password rejected, right one enters.
- Click through all six views; then a `?domain=` deep link and a tab click —
  both are full document loads and exercise the auth cookie, not session state.
- Star a brand on the hosted URL → visible on the desktop dashboard after
  `CACHE_TTL` (120s) or a `↻`. Then the reverse.
- Export a shortlist → the file lands in the **browser's** downloads.
- **With the password still set**, confirm what Cloud actually sends: add a
  throwaway `st.write(st.context.headers.get("Host"))` (or check via the app's
  own logs) and verify it is the `.streamlit.app` name, not a proxy-rewritten
  `localhost`. Safety no longer depends on this — `POD_RADAR_OPEN` is never set
  on Cloud, and it is the necessary condition — but it is the one assumption
  the desktop could not test.
- Temporarily blank `app_password` in Cloud secrets → app must refuse to serve.
  Restore it. This is criterion 3 and it is the one worth actually doing,
  because it is the failure that loses the data.

**Do not set `POD_RADAR_OPEN` in Cloud secrets.** It exists so a trusted local
machine can run without a password; on a public URL it is the one switch that
turns the gate off.

### 6. README

Replace the tunnel-only "Access from anywhere" section: the Cloud URL is now
the primary path, the tunnel becomes the fallback for when Cloud is asleep or
the app is mid-redeploy. Document that Cloud secrets are a separate copy of
`pg_dsn` / `app_password` that must be updated when either rotates — a
password change invalidates every outstanding auth cookie by design.

## Validation

Acceptance criteria 1–8 in [plan.md](plan.md), checked with the desktop
Streamlit process stopped.

## Risks

- **Cloud redeploys on every push to `master`.** Once this is live, a push is a
  deploy. The weekly harvest is unaffected (it runs from the local working
  tree), but a broken commit on `master` now takes the dashboard down.
- **Secrets now live in two places.** Rotating the Supabase password or the app
  password means updating the desktop `secrets.toml` *and* Cloud. If only one
  is updated the symptom is one of the two dashboards failing, which reads like
  a deploy problem rather than a credentials problem.
