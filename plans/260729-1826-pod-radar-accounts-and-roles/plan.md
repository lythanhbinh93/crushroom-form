# POD Radar — accounts and roles

**Status:** phases 01–04 code ✅ complete 2026-07-29. 219 tests green (was 126);
17 mutations of the auth and role guards all caught. **Not deployed** — the
migration, the accounts, and going public are the user's steps, in that order.
**Code:** `D:/github local/pod-research` (remote `lythanhbinh93/pod-radar`, private)
**Blocks:** making the hosted app public — see
[hosted deploy phase 02](../260729-1514-pod-radar-hosted-deploy/phase-02-deploy-and-verify.md)

The hosted app is live at `pod-radar.streamlit.app` but **invite-only**: an app
deployed from a private repo inherits the repo's privacy, so an anonymous
visitor is bounced to Streamlit's own sign-in wall and never reaches our gate.
Making it public means the app's own auth becomes the only thing between the
URL and the data. One shared password was acceptable for that; real accounts
are what was asked for, so real accounts are what protects it.

This **overturns a non-goal**. Both the [Supabase
migration](../260728-1621-pod-radar-supabase-migration/plan.md) and the
[hosted deploy](../260729-1514-pod-radar-hosted-deploy/plan.md) plans said "no
accounts, one shared mood board". The user changed that decision on 2026-07-29
after seeing the sign-in wall. `design_state.owner` was added in migration 0001
against exactly this day.

## Accepted decisions — 2026-07-29

| Decision | Choice | Consequence |
|---|---|---|
| Identity | **Username + password we manage** | A `users` table, hashing we own. No Google Cloud setup, no OIDC provider, works for people without a Google account. Rejected `st.login()` despite it being less code. |
| Roles | **admin / user** | Admin owns the dataset; users research it. |
| Per-user data | **Mood board only** | `design_state` gains `owner` in its primary key. `brands.starred` / `brands.notes` stay shared. |

### What a user can and cannot do

| | admin | user |
|---|---|---|
| Six views, export, design briefs | ✅ | ✅ |
| Own mood board — favourite, mood, workflow, design note | ✅ | ✅ (their own) |
| Brand star, brand notes, traffic edits | ✅ | ❌ |
| Exclude / restore / promote a brand | ✅ | ❌ |
| Rescore, sheet re-import, Data health tab | ✅ | ❌ |
| Manage accounts | ✅ | ❌ |

Brand star and brand notes land on the **admin** side because they live on the
`brands` table, shared with the harvest — one user starring a brand stars it
for everyone. That follows from "admin owns the data", but it was not stated
explicitly in the decision, so **confirm it at the phase 01 review gate**.

## Constraints

- **No new dependency.** Hashing uses `hashlib.scrypt` from the standard
  library — verified working on the desktop's 3.14 and available on 3.13.
  Adding `bcrypt`/`argon2-cffi` means a compiled wheel in the Cloud build, and
  the previous phase deliberately pinned the dependency set to three lines.
- **The weekly harvest must not learn about users.** `run_weekly.py` and
  `pod_radar/enrich.py` write brand and design rows; none of that becomes
  per-user, and none of it may start requiring an authenticated context.
- **Bootstrap happens off the web.** The first admin is created by a desktop
  CLI with the DSN, never by a "first visitor becomes admin" web path.

## Non-goals

- No self-signup, no email verification, no password-reset-by-email. An admin
  creates accounts and resets passwords.
- No per-user brand stars or notes — explicitly deferred, see the table above.
- No OAuth/SSO. Reconsider if the user count outgrows manual account creation.
- No row-level security in Postgres. The app is the only client and it connects
  as one role; `owner` is enforced in application SQL.

## Phases

| # | Phase | Depends on | File |
|---|-------|-----------|------|
| 01 | Accounts foundation — schema, hashing, CRUD, CLI ✅ | — | [phase-01-accounts-foundation.md](phase-01-accounts-foundation.md) |
| 02 | Login and session ✅ | 01 | [phase-02-login-and-session.md](phase-02-login-and-session.md) |
| 03 | Role enforcement + per-user mood board ✅ | 02 | [phase-03-roles-and-ownership.md](phase-03-roles-and-ownership.md) |
| 04 | Accounts admin UI ✅ · going public ⏳ | 03 | [phase-04-admin-ui-and-public.md](phase-04-admin-ui-and-public.md) |

## What review caught — and where it caught it

Two CRITICAL defects, both in the **session lifecycle plumbing** — the one part
of this the tests monkeypatched out. Everything the tests drove directly (the
token, the role guard, the ownership scoping) held up under adversarial reading.
That is the lesson worth keeping: the mutation testing was thorough and still
proved nothing about the code path it stubbed.

- **Sign-out was broken three ways at once**, and crashed rather than failing
  quietly. `require_auth` and `logout` both wrote the auth cookie through the
  same keyed component in one script pass, which raises
  `StreamlitDuplicateElementKey`; the clear sent an empty value, which the
  frontend's `if (!a.value) return` swallowed; and `st.rerun()` discarded the
  delta before it could flush. Net effect: clicking sign-out threw, and left a
  valid 30-day cookie in the browser. **Fixed** by moving the logout branch
  ahead of `require_auth`, giving the clear its own component key, fixing the
  frontend guard, and replacing the rerun with a confirmation + `st.stop()`.
- **A stale cookie for a deactivated account bricked the login form** for that
  browser, permanently, via the same duplicate-key path — so the documented
  revocation procedure locked the account out for good.

Six more that mattered:

- **No global rate limit.** `MAX_FAILED` is per account, so an attacker cycling
  random usernames was throttled by nothing — and every attempt costs a 16 MB
  scrypt, including for accounts that do not exist. The KDF protecting the
  hashes was also the amplifier. Now a process-wide budget of 20 attempts/min
  in front of the KDF.
- **The lockout counter never reset**, so it stuck at 10 forever and the next
  single failure re-locked for another window. An attacker could hold a known
  admin out of the web UI indefinitely at four requests an hour. The existing
  test only covered the correct-password path after expiry, which is exactly
  what hid it.
- **A stolen cookie could not be revoked at all.** Added `users.token_epoch`,
  signed into every cookie and checked on every load; a password reset bumps
  it, and there is a "Sign out everywhere" control plus `--deactivate` on the
  CLI.
- **`admin_only` trusted `session_state`**, which `require_auth` refreshes only
  on a full script run — and a `@st.dialog` rerun is a *fragment* rerun. A
  demoted admin kept admin rights for as long as the dialog stayed open. Now
  re-reads the role from the database.
- **Tracebacks would render to anonymous visitors** on the login page, carrying
  the pooler hostname and database user. `showErrorDetails = "none"` plus a
  guard around the pre-auth DB access.
- **The last-admin guard was check-then-act** with no lock — two concurrent
  demotions each saw one admin remaining. Now `FOR UPDATE`.

## Acceptance criteria

1. A desktop CLI creates the first admin; no web path can create one.
2. Wrong password is rejected; correct password enters; the session survives a
   tab click and a `?domain=` deep link (the nav is a full document load).
3. A user account cannot exclude a brand, rescore, re-import the sheet, edit
   traffic, or reach Data health — **enforced server-side**, not merely by a
   hidden button.
4. Two accounts favouriting the same design get two independent mood boards.
5. Deactivating an account locks it out on the next document load.
6. Password hashes are never logged, never rendered, and never leave the DB.
7. `run_weekly.py --stage score` still runs unattended with no user context.
8. Full test suite green.
9. The app is public on Streamlit Cloud and an anonymous visitor sees the
   login form — not the dataset, and not Streamlit's sign-in wall.

## Current state this is built on

Verified 2026-07-29:

- `design_state` — **0 rows**. Adding `owner` to the primary key costs nothing
  and needs no data migration. This will not be true later.
- `brands` — 325 rows, **0 starred**, 19 with notes.
- Migrations present: `0001_initial_schema.sql` only, so the next is **0002**.
- `hashlib.scrypt` works (32-byte digest) and `hmac.compare_digest` is present.
- Admin-op call sites are exactly ten, in five files:
  `brand_detail.py` (traffic, rescore, star, notes), `data_health.py` (restore,
  re-import), `design_finder.py` (exclude), `ranked_board.py` (promote),
  `brand_card.py` (star, exclude).

## Risks

- **Rolling our own auth is the risky choice** and was chosen with that
  understood. The mitigations are: a real KDF with real parameters, no session
  store to desynchronise, signed cookies with a server-side key, and
  enforcement at the data layer rather than the widget layer. Every one of
  those is a phase requirement, not a nice-to-have.
- **The cookie currently carries only "authenticated".** It must now carry
  identity and role, which makes forging it worth something. The signing key
  moves out of the shared password (which no longer exists) into a
  server-generated secret — see phase 02.
- **Hiding a button is not authorization.** Streamlit has no client-side API,
  so an unrendered button is genuinely unreachable — but a stale session, a
  role change mid-session, or a future page-level entry point all defeat that.
  Checks live in `data_access`.
- **Locking yourself out.** A bug in the role check with one admin account and
  no local fallback strands the dataset behind a broken gate. The CLI is the
  escape hatch and must work independently of the web session.

## Rollback

Migration 0002 is additive: dropping `users`/`app_config` and restoring
`design_state`'s two-column primary key returns the previous behaviour. The
shared-password gate stays on the previous commit and is one `git revert` away.
