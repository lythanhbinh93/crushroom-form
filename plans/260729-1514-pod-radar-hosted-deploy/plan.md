# POD Radar — hosted dashboard on Streamlit Community Cloud

**Status:** phase 01 ✅ complete 2026-07-29 (126 tests green, was 101).
Phase 02 open — it needs a browser on the user's own Streamlit account.
**Code:** `D:/github local/pod-research` (remote `lythanhbinh93/pod-radar`, **private**)
**Plans:** this repo, per README convention

Phase 2 of the hosted route. The [Supabase migration](../260728-1621-pod-radar-supabase-migration/plan.md)
moved the data off the desktop; this puts the *reader* off the desktop too, so
the dashboard is reachable from any browser without the desktop being awake or
a tunnel being up.

## Outcome

A permanent `*.streamlit.app` URL, password-gated, serving the live Supabase
data. The desktop keeps running `PODRadarWeekly` and keeps writing — nothing
about enrichment moves or changes.

## Constraints

- **Enrichment cannot move.** `agent-browser` needs a logged-in desktop Chrome.
  The hosted app is a reader plus the same small set of user-owned writes
  (star, favourite, mood, notes, traffic, exclude, rescore) it already has.
- **The repo is private and stays private.** It is deployed from GitHub, not
  from a build artefact.
- **No new database.** Same Supabase project `afcjfcroktlnelmhiyus`, same
  session pooler on 5432.
- **Streamlit Community Cloud pins Python ≤ 3.13**; the desktop runs 3.14.
  Nothing in the tree uses 3.14-only syntax (checked), but 3.13 is the build
  target now.

## Non-goals

- **No real accounts.** One shared password, one shared mood board — decided
  2026-07-29. `design_state.owner` stays unused; per-user boards are a later
  phase and this deploy must not pre-empt its schema.
- No UI redesign, no new views, no scoring changes.
- No connection pooling work unless the soak shows it is needed (see Risks).

## Phases

| # | Phase | Depends on | File |
|---|-------|-----------|------|
| 01 | Deploy readiness (code) ✅ | — | [phase-01-deploy-readiness.md](phase-01-deploy-readiness.md) |
| 02 | Deploy + verify ⏳ | 01 | [phase-02-deploy-and-verify.md](phase-02-deploy-and-verify.md) |

## The four things that actually break on a hosted box

Found by scouting, not by deploying. Each one is silent — the app starts and
looks fine.

1. **`resolve_dsn()` cannot see Streamlit Cloud's secrets.** It reads
   `os.environ["POD_RADAR_PG_DSN"]`, then parses `.streamlit/secrets.toml` with
   `tomllib` directly. Cloud injects secrets into `st.secrets`; it does not
   guarantee that file on disk, and it sets no env var. Result: `RuntimeError`
   on the first query, on every page. **This is the deploy blocker.**
2. **The password gate fails OPEN.** `require_auth()` returns immediately when
   no password is configured — deliberate, so local `streamlit run` has no
   login friction. On a public URL, one forgotten secret publishes the whole
   competitor dataset *with edit rights* and nothing in the UI says so.

   The first fix gated this on the request's `Host` header, which review
   correctly rejected: `Host` is **supplied by the caller**, so anything that
   can reach `/_stcore/stream` can claim to be localhost. Consent now has to
   come from `POD_RADAR_OPEN=1` in the server's environment — something a
   remote caller cannot send — **and** a local-looking request. Both.
3. **Exports write to the server's disk.** `export_shortlist` and
   `export_design_brief` write into `<repo>/exports` and return a `Path`. On
   Cloud that is an ephemeral container the user can never reach: the button
   reports success and produces nothing.
4. **`pandas` is not in `requirements.txt`.** It works today only because
   Streamlit happens to depend on it. A Streamlit release that drops or moves
   that dependency breaks the build with no change on our side.

## Acceptance criteria

1. A `*.streamlit.app` URL loads the dashboard from a browser with the desktop
   Streamlit process **stopped**.
2. The login gate appears on that URL, rejects a wrong password, and survives
   a tab click / `?domain=` deep link (cookie path).
3. With `app_password` deliberately removed from Cloud secrets, the app
   **refuses to serve** rather than serving open.
4. All six views render against live Supabase data.
5. Shortlist and design-brief export deliver a file to the **client's**
   downloads, not the server's disk.
6. A star / favourite / note set from the hosted URL is visible on the desktop
   dashboard, and vice versa.
7. Local `python -m streamlit run dashboard/app.py` still runs with no login
   and no behaviour change.
8. Full test suite green.

## Risks

- **Private repo on the free tier.** Streamlit Community Cloud has historically
  allowed one private-repo app per account. If it refuses, the fork is: pay,
  or move to Railway/Render (~$5-7/mo). **Do not make the repo public** — that
  is not a fallback. Verified at phase 02 step 2, before any other deploy work.
- **Supabase connection pressure.** `_df` opens a fresh connection per
  uncached call and every Streamlit rerun can trigger several. One desktop
  reader was free; N hosted readers × reruns is not. `CACHE_TTL = 120` absorbs
  most of it. Watch the pooler; add pooling only if connections climb.
- **Cold starts.** Community Cloud sleeps an idle app; first load is ~30s.
  Accepted — this is a research tool, not a storefront.
- **Latency.** Already flagged in the migration's phase 04: every query is a
  network round trip. Hosted adds a second hop (Cloud → Supabase). If the board
  drags, that is a caching problem to solve here.

## Rollback

Delete the Cloud app. The desktop workflow is untouched throughout — every
code change in phase 01 is additive and keeps the local path on its existing
branch. Reverting is `git revert` of the phase-01 commit.
