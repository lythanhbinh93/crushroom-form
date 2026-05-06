# Phase 03 — Members + Permissions UI

**Status:** pending · **Est:** 4-6h · **BlockedBy:** 01 · **Blocks:** 07

## Context Links
- Plan: [plan.md](plan.md)
- Schema: `supabase/migrations/0001_workspaces.sql` (workspace_members already exists)
- P1 settings pattern: `app/(app)/settings/credentials/page.tsx`

## Overview
`workspace_members` table + RLS policies were built in P1. Phase 03 adds the UI: owner sees member list per workspace, can grant/revoke other users' access, can promote/demote roles. Members see read-only list.

## Key Insights
- Existing RLS: only owners can `INSERT`/`UPDATE`/`DELETE` on `workspace_members`. RLS already enforces — UI just exposes it.
- Granting a non-existent user requires invite-by-email flow OR pre-existing `auth.users` row. P2 chooses **pre-existing only** (user must sign up first via magic link, then owner adds by email lookup). Avoids invite-token complexity.
- "Last owner" guard: owner cannot demote/remove the only owner of a workspace. Enforced via DB trigger AND UI confirmation.

## Requirements

### Functional
- `Settings → Members` lists all members of active workspace with email + role + joined date.
- Owner can:
  - Add member by email (looks up `auth.users.email`, insert into `workspace_members`).
  - Change role (owner ↔ member).
  - Remove member (cannot remove self if sole owner).
- Member sees read-only list.

### Non-functional
- Email lookup must not enumerate `auth.users` (no "user not found" leakage); return generic "if user exists, invite sent".
- All writes server-side actions; no client-side service-role.

## Architecture

```
Settings → Members page (server component)
  ├─ list members (RLS select on workspace_members JOIN auth.users)
  └─ <MembersTable> (client) with add/remove/role-change actions

Server actions (in app/(app)/settings/members/actions.ts):
  ├─ addMember(email)        → RPC public.add_workspace_member_by_email
  ├─ removeMember(userId)    → DELETE on workspace_members (RLS-gated)
  └─ setMemberRole(userId, role) → UPDATE on workspace_members

DB:
  ├─ migration 0009: trigger preventing removal of last owner
  └─ migration 0009: RPC add_workspace_member_by_email (security definer,
       owner-gated, looks up auth.users by email, inserts membership)
```

## Related Code Files

**Create:**
- `app/(app)/settings/members/page.tsx`
- `app/(app)/settings/members/members-table.tsx` (client)
- `app/(app)/settings/members/add-member-form.tsx` (client)
- `app/(app)/settings/members/actions.ts` (server actions)
- `supabase/migrations/0009_members_management.sql`

**Edit:**
- `app/(app)/settings/layout.tsx` — add Members nav link

**Delete:** none

## Implementation Steps
1. Write migration 0009: `add_workspace_member_by_email(_workspace_id, _email)` RPC + last-owner trigger on `workspace_members`.
2. Server actions: `addMember`, `removeMember`, `setMemberRole`. All call RLS-aware client; trust RLS to reject non-owners.
3. Members page (server): fetches members joined with auth.users (via security-definer view `workspace_members_with_email`).
4. Add `workspace_members_with_email` view in migration 0009 (RLS-filtered, returns email only for own workspaces).
5. Members table client component with confirm dialogs on remove + role change.
6. Settings nav link.
7. Manual test: 2 users, owner adds member, member can see brand in switcher, member tries to access /settings/credentials → 403.

## Todo
- [ ] Migration 0009 (RPC + trigger + view)
- [ ] Server actions
- [ ] Members page server component
- [ ] Members table + add form clients
- [ ] Settings nav update
- [ ] 2-user manual smoke test

## Success Criteria
- Owner adds another user by email → that user logs in → sees the brand in switcher.
- Owner cannot remove themselves if sole owner (UI disables; DB rejects if bypassed).
- Member cannot see members of workspaces they don't belong to (RLS).
- Email enumeration: lookup of nonexistent email returns same UX as success (no info leak).

## Risks
- **Email lookup race:** user created after lookup — handle gracefully (insert fails on FK, return generic success).
- **Privilege escalation:** RPC must verify caller is owner of target workspace (in addition to RLS); double-check.
- **Last-owner deletion via direct SQL:** trigger catches it.

## Security
- All mutations through RLS-aware client.
- RPC `security definer` strictly bounded: input workspace_id checked against `is_workspace_owner(auth.uid())`.
- Trigger fail-closed on last owner.

## Next Steps
Phase 07 ships the smoke matrix that includes owner+member flows across 2 brands.
