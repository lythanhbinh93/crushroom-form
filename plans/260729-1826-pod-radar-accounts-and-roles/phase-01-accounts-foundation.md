# Phase 01 — Accounts foundation

**Depends on:** — · **Blocks:** 02

Schema, hashing, CRUD and the bootstrap CLI. No UI, no login change — the app
behaves exactly as it does today when this phase lands.

## Files

| File | Change |
|---|---|
| `supabase/migrations/0002_accounts.sql` | new — `users`, `app_config`, `design_state` PK |
| `pod_radar/passwords.py` | new — hash / verify |
| `pod_radar/users.py` | new — CRUD against `users` |
| `scripts/create_user.py` | new — bootstrap CLI |
| `tests/test_passwords.py`, `tests/test_users.py` | new |
| `tests/conftest.py` | add the two new tables to `TABLES` |

## Steps

### 1. Migration 0002

```sql
CREATE TABLE users (
  username      text PRIMARY KEY,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE app_config (key text PRIMARY KEY, value text NOT NULL);
```

Then `design_state`, which is **empty today** (verified: 0 rows) so this needs
no backfill — and will not be free once anyone starts favouriting:

```sql
ALTER TABLE design_state DROP CONSTRAINT design_state_pkey;
UPDATE design_state SET owner = '' WHERE owner IS NULL;   -- no-op at 0 rows;
                                                          -- correctness if not
ALTER TABLE design_state ALTER COLUMN owner SET NOT NULL;
ALTER TABLE design_state ADD PRIMARY KEY (domain, handle, owner);
```

RLS enabled and `REVOKE ... FROM anon, authenticated` on both new tables, to
match every table in 0001. `users` holding password hashes makes that not
optional.

The migration must be **idempotent-safe to read**: it is applied by hand in the
Supabase SQL editor, the same as 0001. Say so at the top of the file.

### 2. `pod_radar/passwords.py`

`hashlib.scrypt`, standard library — no wheel in the Cloud build.

- Format: `scrypt$<n>$<r>$<p>$<b64 salt>$<b64 hash>`. Parameters are stored per
  hash, not assumed, so they can be raised later without invalidating existing
  passwords.
- `n=2**14, r=8, p=1, dklen=32`, 16-byte `os.urandom` salt. That is ~16 MB of
  memory per verification — comfortable on Cloud, and the point of a
  memory-hard KDF.
- `verify_password` uses `hmac.compare_digest`, and returns `False` for a
  malformed or unknown-scheme stored value rather than raising. A crash on a
  corrupt row must not become an availability incident on the login page.
- **Never** log, `repr`, or return the hash from anything user-facing.

### 3. `pod_radar/users.py`

`create_user`, `get_user`, `verify_login`, `set_password`, `set_role`,
`set_active`, `list_users`, `touch_last_login`. Thin SQL over `get_conn()`,
matching the existing `pod_radar/db.py` style.

Two behaviours that are security-relevant, not cosmetic:

- `verify_login` **runs the KDF even when the username does not exist**,
  against a dummy hash. Otherwise the response time says whether an account
  exists.
- `verify_login` returns nothing for an inactive account, and it checks
  `active` in the same query rather than in a second round trip.

Usernames are compared case-insensitively and stored lowercase — otherwise
`Admin` and `admin` are two accounts and only one of them is the one you think.

### 4. `scripts/create_user.py`

```
python scripts/create_user.py --username x --role admin
```

Prompts for the password twice with `getpass` — never accepted as an argument,
which would put it in shell history and in the process list. Refuses a password
under 12 characters. Prints the username and role, never the hash.

This is also the **lockout escape hatch** (see plan Risks), so it must work
from a DSN alone with no web session and no Streamlit runtime.

### 5. Tests

- Round-trip hash/verify; wrong password fails; two hashes of the same password
  differ (salt is real); a tampered hash fails; malformed stored values return
  `False` instead of raising.
- Stored parameters are honoured: a hash written with different `n` still
  verifies.
- `verify_login` — unknown user, inactive user, wrong password, correct
  password. Unknown-user and wrong-password paths both perform a KDF call.
- Username case-insensitivity.
- **Mutation-check every one of these.** This codebase has already shipped a
  test that reimplemented production logic and passed with the fix reverted;
  auth is the worst place to repeat it.

## Validation

- Full suite green.
- `run_weekly.py --stage score` unaffected — this phase adds tables and modules
  and touches no path it uses.
- The migration applied to the live Supabase project, `design_state` still
  0 rows afterwards, `users` holding exactly one admin.

## Risks

- **The `design_state` primary-key change is only free while the table is
  empty.** If anyone favourites a design between now and applying 0002, the
  `UPDATE ... SET owner = ''` silently assigns their board to a nobody. Check
  the row count immediately before applying, and assign to the admin username
  instead of `''` if it is non-zero.
- **`hashlib.scrypt` requires an OpenSSL-backed build.** Verified present on
  the desktop's 3.14; re-verify on Cloud's 3.13 in phase 04 rather than
  assuming, because the failure mode is nobody can log in.
