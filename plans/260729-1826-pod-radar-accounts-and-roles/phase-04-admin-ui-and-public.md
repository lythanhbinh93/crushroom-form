# Phase 04 — Accounts admin UI, then go public

**Depends on:** 03

The last phase, and the one that actually delivers the original request:
a URL other people can open.

## Deploy order is not optional

`master` must NOT be pushed before migration 0002 is applied. Cloud redeploys
on every push, and the new `auth.py` reads `app_config` on the first line of
every page — against a database without that table the dashboard is down until
the migration lands. Order:

1. apply 0002 in the Supabase SQL editor;
2. create the first admin with the CLI (it talks to the same database, no
   deploy needed);
3. then push `master`;
4. then make the app public.

## Steps

### 1. An Accounts view, admin-only

`dashboard/views/accounts.py`, a seventh nav entry visible only to admins and
refusing to render for anyone else (same double check as Data health).

- List: username, role, active, created, last login. **No hashes, ever** — not
  in the table, not in a debug expander, not in an export.
- Create an account: username, role, initial password entered twice.
- Reset a password, change a role, deactivate / reactivate.
- Guard rails, because this screen can strand the dataset:
  - refuse to deactivate or demote the **last active admin**;
  - refuse to let an admin deactivate or demote themselves;
  - both enforced in `pod_radar/users.py`, not in the view.
- Copy states plainly that a password reset does **not** end existing sessions
  (see phase 02) and that deactivating then reactivating is how you force a
  logout.

### 2. Migration 0002 on the live project

Apply in the Supabase SQL editor, as with 0001. **Check `design_state`'s row
count immediately before applying** — the primary-key change is only free while
it is empty, and phase 01 records why.

### 3. Create the real accounts

`python scripts/create_user.py --username <you> --role admin` on the desktop,
then the rest through the Accounts view once you can log in.

### 4. Deploy

Push `master`; Cloud redeploys automatically. Confirm in the build log that the
app starts, then log in as admin and as a test user.

**Verify `hashlib.scrypt` works on Cloud's Python 3.13 before trusting it** —
it needs an OpenSSL-backed build, and the failure mode is that nobody can log
in. Simplest check: the test user logging in *is* the check.

### 5. Make the app public — the point of all of this

Streamlit Cloud → app settings → Sharing → public.

Do this **last, and only after** an anonymous browser has been confirmed to hit
our login form. Until then the app is protected by Streamlit's own sign-in
wall, and that wall is the only reason a half-built gate has not been exposed.

### 6. Verification, from a browser with no session

- Anonymous visitor gets **our** login form — not the dataset, not Streamlit's
  sign-in wall.
- Wrong password rejected; correct password enters.
- A user account: no Data health tab, no exclude/star/notes/traffic controls,
  and `?view=health` typed by hand renders nothing.
- Two accounts, two independent mood boards.
- Deactivate the test account; its next navigation returns it to the login
  form.
- Log in from a second device to confirm the cookie is not machine-bound.

### 7. Docs

`README.md`: accounts replace the shared password, the roles table, the
bootstrap CLI, and the fact that the app is now public with the login form as
the only barrier. Delete the `app_password` / `POD_RADAR_OPEN` sections from
`README.md` and `.streamlit/secrets.toml.example` — both are gone as of
phase 02, and a stale runbook here is worse than none.

## Validation

Acceptance criteria 1–9 in [plan.md](plan.md), all checked from a browser with
no existing session.

## Risks

- **Step 5 is irreversible in the way that matters.** The moment the app is
  public, the URL is guessable and the login form is the whole defence. Do not
  reorder it earlier to make testing convenient.
- **Last-admin lockout.** The guard rails in step 1 are the fix; the CLI is the
  recovery. Test the guard rails by trying to demote the only admin.
- **Cloud secrets still hold `app_password`** from the previous phase. Remove
  it once phase 02 lands, so a stale secret cannot be mistaken for a live
  fallback path.
