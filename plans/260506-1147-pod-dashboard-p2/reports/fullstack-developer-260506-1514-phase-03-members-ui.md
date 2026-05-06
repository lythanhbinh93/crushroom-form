# Phase 03 — Members + Permissions UI: Implementation Report

## Files Created / Edited

| Path | LOC | Op |
|------|-----|----|
| `supabase/migrations/0011_members_management.sql` | 90 | created |
| `app/(app)/settings/members/actions.ts` | 115 | created |
| `app/(app)/settings/members/members-table.tsx` | 190 | created |
| `app/(app)/settings/members/add-member-form.tsx` | 55 | created |
| `app/(app)/settings/members/page.tsx` | 60 | created |
| `app/(app)/settings/layout.tsx` | +1 line | edited |
| `tests/app/settings/members/actions.test.ts` | 315 | created |

## Migration Number Used

**0011** — confirmed by listing `supabase/migrations/`. Last existing was `0010_get_table_sizes_rpc.sql`. Plan stated 0009 which was already taken (0009 + 0010 used by Phase 02). Used 0011 as instructed.

## Anti-Enumeration Approach

RPC `add_workspace_member_by_email` always returns `void` with no error regardless of path taken:

1. **Email exists, not yet member** → `INSERT … ON CONFLICT DO NOTHING` (adds row)
2. **Email not found** → `_target_user_id` stays NULL → skip insert block entirely
3. **Already a member** → `ON CONFLICT DO NOTHING` → silent no-op

Server action `addMember` returns identical message in all 3 cases: `"If {email} is registered, they now have access — they'll see the brand on next login."` Only a `forbidden` error (not-owner path) or a genuine network failure produces a different response.

## Last-Owner Trigger SQL

```sql
create or replace function public.check_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare _remaining_owners integer;
begin
  if OLD.role <> 'owner' then return OLD; end if;
  if TG_OP = 'UPDATE' and NEW.role = 'owner' then return NEW; end if;

  select count(*) into _remaining_owners
  from public.workspace_members
  where workspace_id = OLD.workspace_id and role = 'owner' and user_id <> OLD.user_id;

  if _remaining_owners = 0 then
    raise exception 'cannot remove or demote the last owner';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

drop trigger if exists prevent_last_owner_removal on public.workspace_members;
create trigger prevent_last_owner_removal
  before delete or update on public.workspace_members
  for each row execute function public.check_last_owner();
```

Trigger fires on `BEFORE DELETE OR UPDATE`. Guards only `owner` rows. Counts remaining owners excluding the row-under-change. Raises if count = 0.

## Tests Added

**File:** `tests/app/settings/members/actions.test.ts` — 16 tests total

| Group | Tests |
|-------|-------|
| `addMember` | calls RPC with correct args + normalized email; identical generic success message (anti-enumeration); throws on invalid email; throws when non-owner; generic error on RPC failure; forbidden error surfaced |
| `removeMember` | calls DELETE with correct workspace_id + user_id; throws on invalid UUID; surfaces last-owner trigger message; throws with `remove failed` prefix on generic DB error |
| `setMemberRole` | calls UPDATE with `role='owner'` (promotion); calls UPDATE with `role='member'` (demotion); throws on invalid UUID; throws on invalid role value; surfaces last-owner trigger error; throws with `role update failed` prefix on generic DB error |

## Results

| Check | Result |
|-------|--------|
| `npx tsc -p . --noEmit` | **PASS** — clean, no errors |
| `npx vitest run` (full suite) | **PASS** — 210 passed, 8 pre-existing failures in `tests/connectors/printify/orders.test.ts` (confirmed pre-existing via `git stash` baseline run before my changes) |
| New tests only | **16/16 PASS** |
| `npm run guard:no-service-role-in-app` | **PASS** — no service-role client in `app/` |

## Unresolved Questions

None.

---

**Status:** DONE
**Summary:** Phase 03 complete — migration 0011, 3 server actions, 3 UI components, settings nav link, 16 unit tests all passing. tsc clean, guard passes. Pre-existing printify test failures (8) confirmed as baseline regressions not caused by this phase.
**Concerns/Blockers:** None.

---

## Follow-up: Code Review Fixes (H1, M1, M2)

**Date:** 2026-05-06 15:29
**Fixes applied to:** `0011_members_management.sql`, `actions.ts`, `actions.test.ts`

### H1 — Timing-uniformity SQL diff (`add_workspace_member_by_email`)

Old approach: existence check was skipped entirely when `_target_user_id IS NULL` — "email not found" path was measurably cheaper than "email found, already member" path.

New approach: both the `auth.users` lookup **and** the `workspace_members` EXISTS check always execute. Passing NULL as `user_id` to EXISTS returns false instantly but the query still runs, levelling the latency gap between the three paths.

Key changes:
- Added `_already_member boolean` declare
- EXISTS subquery always runs after the auth.users lookup
- INSERT condition changed from `if _target_user_id is not null then INSERT … ON CONFLICT` → `if _target_user_id is not null and not _already_member then INSERT` (no ON CONFLICT needed — the double-check guards it)
- Top-of-function comment documents the anti-enumeration design and acknowledges this is best-effort (not constant-time)

### M1 — Explicit owner check in `removeMember` and `setMemberRole`

Pattern copied verbatim from `addMember`:
```ts
if (workspace.role !== "owner") {
  throw new Error("only workspace owners can manage members");
}
```

Applied immediately after `getActiveWorkspace()` in both functions. RLS still enforces at the DB layer — this is belt-and-suspenders that gives a clean error message and protects against future RLS policy drift.

### M2 — `FOR UPDATE` lock in `check_last_owner` trigger

```sql
-- before:
select count(*) into _remaining_owners
from public.workspace_members
where workspace_id = OLD.workspace_id
  and role = 'owner'
  and user_id <> OLD.user_id;

-- after:
select count(*) into _remaining_owners
from public.workspace_members
where workspace_id = OLD.workspace_id
  and role = 'owner'
  and user_id <> OLD.user_id
for update;
```

`FOR UPDATE` serializes concurrent demotion attempts within the same workspace. Second transaction blocks at this SELECT until first commits, then re-reads the post-commit count and correctly raises the last-owner exception. Trigger semantics for DELETE and UPDATE paths are unchanged.

### Test results

| Check | Result |
|-------|--------|
| `npx tsc -p . --noEmit` | PASS — clean |
| `npx vitest run tests/app/settings/members/actions.test.ts` | **18/18 PASS** |

New tests added (2):
- `removeMember` — "throws when caller is not an owner (explicit M1 guard)"
- `setMemberRole` — "throws when caller is not an owner (explicit M1 guard)"

Both assert `rejects.toThrow(/only workspace owners/)` when `memberWorkspace()` fixture is used, mirroring the existing `addMember` pattern.

---

**Status:** DONE
**Summary:** H1 (timing side-channel), M1 (missing owner guard × 2 callsites), M2 (isolation race) all fixed. tsc clean. 18/18 tests pass (+2 new). No scope expansion.
**Concerns/Blockers:** None.
