# Code Review — Phase 03 Members + Permissions UI

**Reviewer:** code-reviewer
**Date:** 2026-05-06 15:25
**Scope:** Phase 03 (auth/permissions code path)
**Files reviewed:** 0011 migration, members actions/page/table/form, members tests

---

## Score: 8.6 / 10 — **SHIP with minor follow-ups**

The auth-critical surface is correct: RLS is owner-gated end-to-end (verified in 0001), the new RPC is `is_workspace_owner`-checked before any side effect, the last-owner trigger covers DELETE+UPDATE without breaking bootstrap INSERT, and the server actions correctly normalize and validate inputs. Anti-enumeration is functionally correct at the response-shape layer. There are real but non-blocking concerns around timing side-channels in the RPC, defense in depth on `removeMember`/`setMemberRole`, and a couple of test-quality gaps.

---

## Findings

### CRITICAL — none

No data-loss, no auth bypass, no privilege escalation. RLS + RPC + trigger form a coherent three-layer model.

---

### HIGH — 1

#### H1. `add_workspace_member_by_email` has a measurable timing side-channel
File: `supabase/migrations/0011_members_management.sql:50-85`

The RPC claims byte-identical anti-enumeration behavior across three paths, and the **return shape** is identical (`returns void`, no data). However, execution time is **not** identical:

- Path 1 (email exists, not a member): owner-check + auth.users lookup + INSERT.
- Path 2 (email not found): owner-check + auth.users lookup + skip INSERT.
- Path 3 (already a member): owner-check + auth.users lookup + INSERT with `ON CONFLICT DO NOTHING` (still touches the index/page).

A patient attacker (especially a malicious owner of *another* workspace) calling this in a tight loop with the workspace-id of a workspace they own could distinguish "user exists in auth.users" from "doesn't exist" by measuring response latency. The `INSERT … ON CONFLICT DO NOTHING` path is observably more expensive than the early-skip path.

**Why it's HIGH not CRITICAL:** the attacker must already be an authenticated owner of *some* workspace and only learns "is this email registered in our auth.users." For a private B2B dashboard this is low impact, and the spec mentions "no information leakage" as a design goal more than a hard threat model.

**Recommendation (cheap fix):** in path 2, perform a no-op write that costs ~the same as the conflict-insert. Easiest: always run the INSERT and rely on `_target_user_id is null` short-circuiting via a CTE that yields zero rows. Or just document the residual side-channel in a comment and accept it as out of scope for P2. Not blocking ship.

---

### MEDIUM — 3

#### M1. `removeMember`/`setMemberRole` lack an explicit owner-check; relies solely on RLS
File: `app/(app)/settings/members/actions.ts:65-89, 94-124`

Defense-in-depth pattern from `addMember` (lines 36-38) checks `workspace.role !== "owner"` *before* hitting the DB. `removeMember` and `setMemberRole` skip this and rely entirely on RLS to reject non-owner UPDATE/DELETE. This works today (RLS verified in 0001 lines 91-95), but:

- An RLS policy bug or a future migration that loosens the policy would silently turn these endpoints into escalation vectors.
- A non-owner attempting to remove a member currently gets a confusing error like `remove failed: new row violates row-level security policy` (or worse, a no-op silent success because DELETE with no matching row returns 0 rows + no error).

**Recommendation:** mirror the pattern from `addMember` — add `if (workspace.role !== "owner") throw new Error("only workspace owners can manage members");` at the top of both functions. ~4 lines, removes a class of future regressions, gives a clean error message.

#### M2. Last-owner trigger is `read committed` racy on concurrent demotions
File: `supabase/migrations/0011_members_management.sql:99-128`

Two owners A and B simultaneously running `setMemberRole(B, 'member')` and `setMemberRole(A, 'member')` can both pass the `count(*) > 0` check (each sees the other still as owner) and both UPDATEs commit, leaving zero owners. PostgreSQL default isolation is `read committed`, and the trigger's count is a snapshot read.

**Why MEDIUM not HIGH:** requires two simultaneous owner self-demotion attempts — not a normal flow. Recovery: a Supabase admin can re-promote via service-role.

**Recommendations (pick one, all cheap):**
- Add `for update` to the count query: `select count(*) … from public.workspace_members where … for update;` — locks the rows against concurrent writes.
- Or use `pg_advisory_xact_lock(hashtextextended('workspace_owner_count', workspace_id))` to serialize per-workspace.
- Or accept the risk explicitly with a `-- Race note:` comment.

#### M3. Test for "anti-enumeration" doesn't actually verify byte-identical responses across the 3 RPC paths
File: `tests/app/settings/members/actions.test.ts:148-156`

The named test "returns identical generic message regardless of RPC outcome (anti-enumeration)" only exercises **one** path (no-error). It doesn't compare:
- `addMember(unknown@x.com)` response vs. `addMember(known@x.com)` response.

Because the RPC is mocked at the boundary, the test can't catch a real-world enumeration bug — but it could at least call `addMember` twice with identical mocks and assert `result1.message === result2.message` for two different emails to prove the message format is stable. Today the assertion is just `match(/user@example\.com/)`.

**Recommendation:** add a single test that calls `addMember` twice (different emails, same mock-success) and asserts response shape and structure are stringwise identical aside from the embedded email.

---

### LOW — 4

#### L1. `members-table.tsx` is at 190 LOC — borderline against 200-LOC modularity guideline
The file is well-organized (Th/Td/RoleBadge/RoleSelect are colocated). Splitting now would be churn. **Recommend: leave as-is**, revisit if it grows past 200.

#### L2. Browser-native `confirm()` dialog
`members-table.tsx:83, 97` uses `window.confirm()`. Functional but inconsistent with rest of the app (presumably uses toast/modal patterns). Acceptable for P2; flag for P3 polish.

#### L3. `setMemberRole` doesn't short-circuit when newRole === current.role on the server
The client guards this (`members-table.tsx:95`), but if a future caller bypasses the UI, `setMemberRole(userId, sameRole)` runs a needless UPDATE that fires the trigger. Cosmetic.

#### L4. `getActiveWorkspace()` is called twice in `addMember` (line 35) when also `revalidatePath` is called. Not a bug — just an observation that workspace lookup happens once per action.

---

### Edge cases (scout)

- **Bootstrap insert path:** trigger is `before delete or update` only — confirmed unaffected. ✓
- **Owner promoting member→owner:** trigger early-returns at `OLD.role <> 'owner'` (line 103). ✓
- **Owner→owner UPDATE (no role change):** trigger guards at `NEW.role = 'owner'` (line 108) and returns NEW. ✓
- **DELETE of non-owner member:** trigger early-returns at `OLD.role <> 'owner'`. ✓
- **`get_workspace_members_with_email`:** explicitly checks `is_workspace_member` (line 23). ✓
- **Page renders if RPC errors:** `page.tsx:21-23` throws, which produces a generic Next error boundary. Acceptable.
- **`currentUserId = ""` fallback** (`page.tsx:12`): if `auth.getUser` returns null, `isSelf` will never match, all rows show actions. Harmless given `isOwner` is the gate, but worth noting.
- **Concurrent add:** RPC's INSERT … ON CONFLICT handles duplicate-add races correctly. ✓
- **Email with non-ASCII/case:** `lower(trim(email))` matches both sides — tests cover the trim+lowercase path. ✓
- **Self-removal as the last owner:** UI disables button (`canAct = false`) AND trigger blocks at DB. Two-layer defense. ✓

---

### Positive observations

- Three-layer auth model (UI gate → server-action gate → RLS/RPC gate → DB trigger) is well-implemented and the layers reinforce each other.
- `EmailSchema` correctly normalizes (trim+lowercase) on the client side **and** the SQL re-normalizes (`lower(trim(email))`) — defense in depth against odd casings.
- Migration is properly idempotent (`create or replace`, `drop trigger if exists`).
- `create_at asc` ordering in the RPC keeps the table stable across reloads — small touch but appreciated.
- The "(you)" indicator and `last owner` empty-state copy are clear and humane.
- No client-side use of `service_role` — all writes go through server actions. ✓
- Tests cover both happy + 5 distinct error paths per action; ~16 tests for ~115 LOC of action code is good ratio.

---

### Metrics

- Files reviewed: 7
- LOC reviewed: ~825
- Test count: 16 (mostly error/edge — good ratio)
- Type coverage: 100% (no `any` in production code; 1 justified `unknown` cast in `page.tsx:28-33` for un-typed RPC)
- Lint issues observed: none

---

### Recommended actions (priority order)

1. **M1** — add explicit `workspace.role !== "owner"` check at top of `removeMember` and `setMemberRole`. ~5 min.
2. **M2** — add `for update` to `_remaining_owners` count query OR document the race as accepted. ~5 min.
3. **M3** — add one test asserting response equality across two `addMember` calls. ~10 min.
4. **H1** — comment-document the residual timing side-channel in 0011. Optional code mitigation if threat model warrants. ~10 min.
5. Punt L1-L4 to backlog.

**Total follow-up: ~30 min. Not blocking ship.**

---

### Unresolved questions

1. Is the "owner of workspace A learns whether email X has signed up" timing side-channel within P2's threat model, or out of scope? (drives whether H1 needs a code fix vs. a comment).
2. Is concurrent-owner-self-demotion (M2) a realistic flow worth defending against, or "we'll fix it if it happens" given the easy admin recovery?
3. Should owners be allowed to *promote* themselves (member → owner) accidentally? Currently no — only existing owners can call setMemberRole. ✓ but worth confirming product intent for P3 if multi-tier roles are added.

---

**Status:** DONE
**Summary:** Phase 03 ships. Score 8.6/10. Three-layer auth model is solid; one HIGH (timing side-channel) and three MEDIUM (defense-in-depth, isolation race, test gap) are non-blocking with ~30 min follow-up.
**Concerns:** see Unresolved questions above.
