# Phase 02 — Login and session

**Depends on:** 01 · **Blocks:** 03

Replaces the shared-password gate with per-account login. After this phase the
app knows *who* is looking at it; phase 03 acts on that.

## Files

`dashboard/auth.py` (rewrite), `tests/test_auth.py` (rewrite),
`pod_radar/users.py` (add the cookie-key accessor), `README.md`,
`.streamlit/secrets.toml.example`.

## The cookie is the hard part

Today's cookie is `<expiry>.<hmac>` signed with a key derived from the shared
password. That design has two properties worth keeping — no server-side session
store to lose on restart, and a password change invalidating every outstanding
cookie — and one that no longer works: **there is no shared password to derive
a key from.**

### Signing key

A server-side secret, generated once and stored in `app_config` under
`cookie_key`, created on first use inside a single `INSERT ... ON CONFLICT DO
NOTHING` + read so two concurrent boots cannot generate two different keys.

Chosen over another entry in Cloud secrets because it is one less thing to
paste, one less thing to forget, and it survives a redeploy. The trade-off is
that anyone with DB read access can forge cookies — but anyone with DB read
access already has the whole dataset, so that is not a new boundary.

### Payload

`<username>.<expiry>.<hmac>` over `pr-auth-v2|username|expiry`.

- The version tag changes, so **every cookie minted by the old scheme stops
  verifying** rather than being reinterpreted under new rules.
- The username is inside the signed material, not merely alongside it. Signing
  only the expiry would let a valid cookie be replayed for any username.
- Role is **not** in the cookie. It is read from the database on every
  document load, so demoting an admin takes effect immediately instead of when
  their 30-day cookie expires. This costs one indexed primary-key lookup per
  load, which is the right trade.

### Revocation

Every authenticated load re-reads the user row and rejects the cookie when the
account is missing or `active = false`. Deactivating an account therefore locks
it out on the next document load — acceptance criterion 5 — without any
server-side session store.

Changing a user's password does **not** invalidate their existing cookies under
this design. Note it in the admin UI copy (phase 04): to force a logout,
deactivate and reactivate the account.

## Steps

1. `_configured_password()`, `_issue_token`, `_verify_token` and the login form
   are rewritten around username + password. `POD_RADAR_PASSWORD` and
   `app_password` are gone; the fail-closed logic they guarded is gone with
   them, because there is no longer a configuration in which the app has no
   gate — the gate now depends on rows, not on a secret being set.
2. **`POD_RADAR_OPEN` is deleted.** It existed so a trusted local machine could
   run with no password at all. With accounts, running open would mean running
   with no identity, and `owner` has nothing to write. Removing it also removes
   the one switch that could turn the gate off on a public URL.
3. `require_auth()` returns the current user `{"username", "role"}` and stores
   it in `session_state`, so views do not each re-query.
4. A logout control in the top nav clears the cookie and `session_state`.
5. Rate-limit login attempts per username — a counter in `app_config` or a
   simple `failed_attempts` / `locked_until` pair on `users`. The KDF is the
   main defence, but a public URL and a weak password is a real combination.
6. `tests/test_auth.py` is rewritten: token round trip, tampered signature,
   forged expiry, **forged username**, expired, wrong-key, inactive user
   rejected mid-session, and old-scheme cookies rejected outright.

## Validation

- Full suite green.
- Log in, click a tab, follow a `?domain=` deep link, refresh — one login.
  This is where the old cookie earned its place and the new one must too.
- Deactivate an account in the DB while its session is live; the next
  navigation returns it to the login form.
- Old `pr_auth` cookie present → treated as absent, not as valid.

## Risks

- **This is the phase that can lock everyone out**, including you. The CLI from
  phase 01 is the recovery path and must stay independent of anything here.
- **Cookie work is easy to get subtly wrong** — the failure is silent access,
  not an error. Every rejection case gets its own test, and each is
  mutation-checked.
- The nav is a full document load, so anything kept only in `session_state`
  dies on every tab click. That is why the cookie exists; the same trap applies
  to whatever phase 03 caches about the user.
