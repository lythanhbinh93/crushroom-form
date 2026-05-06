# Phase 01 — Multi-Brand Foundation: Implementation Report

## Files Created / Edited

| File | LOC | Action |
|------|-----|--------|
| `lib/active-workspace-cookie.ts` | 22 | Created |
| `lib/workspace.ts` | 145 | Edited (full refactor) |
| `app/api/workspace/switch/route.ts` | 55 | Created |
| `app/api/workspace/create/route.ts` | 75 | Created |
| `app/(app)/_components/brand-switcher.tsx` | 85 | Created |
| `app/(app)/layout.tsx` | 45 | Edited |
| `package.json` | +2 lines | Edited (guard + build hook) |
| `tests/lib/active-workspace-cookie.test.ts` | 55 | Created |
| `tests/lib/workspace.test.ts` | 175 | Created |
| `tests/app/api/workspace/switch/route.test.ts` | 120 | Created |

`header-nav.tsx` not edited — BrandSwitcher is slotted directly in layout header, not inside HeaderNav (HeaderNav is client-only for pathname-based active state; no structural change needed).

## Tests Added

17 new tests across 3 files:

- **active-workspace-cookie.test.ts** (4 tests): null read when unset, read after write, write round-trip, overwrite.
- **workspace.test.ts** (6 tests): cookie+member returns workspace; stale cookie falls back to oldest membership + sets cookie; no cookie picks oldest + sets cookie; no memberships triggers bootstrap + sets cookie; listMyWorkspaces returns flattened list; listMyWorkspaces empty case.
- **route.test.ts** (7 tests): 400 missing id; 400 non-UUID id; 400 empty string; 401 unauthenticated; 403 non-member; 200 owner; 200 member role.

Result: `17/17 passed`.

Pre-existing failures in `tests/connectors/printify/orders.test.ts` (8 tests) confirmed pre-existing via `git stash` round-trip — not introduced by this phase.

## CI Grep Guard

Approach: `npm run guard:no-service-role-in-app` added to `package.json`, wired as pre-step in `build` script (`"build": "npm run guard:no-service-role-in-app && next build"`).

Implementation: inline `node -e` script using `grep -rn createSupabaseServiceClient app/`. Exits 0 if `grep` returns exit 1 (no matches = clean). Exits 1 with error message if any match found. No new dev-deps required. Cross-platform via git-bash/msys `grep` present in the environment.

Verified clean on current codebase: guard outputs `clean - grep found no matches`.

## Compile Check

`npx tsc -p . --noEmit` → **clean** (zero errors).

One type error fixed during implementation: Supabase infers nested join result `workspaces(...)` as an array type; resolved with `as unknown as {...} | null` with an explanatory comment in `lib/workspace.ts:48`.

## Deviations from Plan

1. **`header-nav.tsx` not modified.** Plan said "slot for BrandSwitcher in header-nav". The BrandSwitcher is a client component; HeaderNav is already a client component managing nav links. Slotting the switcher directly in the server layout (passing it as a sibling to `<HeaderNav>`) is cleaner and avoids coupling the nav-link component to workspace state. The layout header already has the right flex layout.

2. **`app/api/workspace/create/route.ts` inserts directly into `workspaces` table.** The migration's RLS has no `INSERT` policy on `workspaces` for authenticated users (bootstrap uses a security-definer RPC). This means the create route will fail at runtime until migration `0008` adds an INSERT policy or a new RPC. A clear error is surfaced with `detail: wsError.message`. **A TODO comment in the route explains this.** Runtime fix requires one of: (a) add `create_workspace_for_user` security-definer RPC in migration 0008, or (b) add `CREATE POLICY "workspaces_insert_for_authenticated" ON workspaces FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)`. Recommended: RPC approach (consistent with bootstrap pattern).

## Status

**Status:** DONE_WITH_CONCERNS
**Summary:** All files implemented, 17/17 new tests pass, type check clean. The workspace create route will hit an RLS INSERT violation at runtime until a migration adds insert permission for authenticated users on the `workspaces` table.
**Concerns/Blockers:** `app/api/workspace/create/route.ts` requires a DB migration (INSERT policy or new RPC) before the "+ New brand" flow works end-to-end. Documented in route comments. No blocker for switch/dropdown functionality which is the core P2 feature.

---

## Follow-up: Migration 0008

### Files Modified

| File | Action |
|------|--------|
| `supabase/migrations/0008_create_workspace_for_user_rpc.sql` | Created |
| `app/api/workspace/create/route.ts` | Refactored (RPC call, removed raw two-insert block) |
| `tests/app/api/workspace/create/route.test.ts` | Created (8 tests) |

### What Changed

**Migration (`0008_create_workspace_for_user_rpc.sql`)**
- `create or replace function public.create_workspace_for_user(_name text) returns uuid` — `security definer`, `set search_path = public`, mirrors `bootstrap_workspace_for_user` exactly.
- Guards: `auth.uid() is null` → exception; blank name → exception; name > 100 chars → exception.
- Inserts into `workspaces`, then `workspace_members` with role `'owner'` (matches `check (role in ('owner','member'))` constraint from 0001).
- `grant execute ... to authenticated` — consistent with bootstrap grant.
- Idempotent via `create or replace function`.

**Route (`app/api/workspace/create/route.ts`)**
- Removed the two-step raw `supabase.from("workspaces").insert(...)` + `supabase.from("workspace_members").insert(...)` block and the lengthy TODO comment block.
- Replaced with a single `supabase.rpc("create_workspace_for_user", { _name: name })` call.
- Auth check (`getUser`) kept — early exit before hitting DB for unauthenticated callers.
- Line count reduced: 85 → 52 lines.

**Tests (`tests/app/api/workspace/create/route.test.ts`)**
- 8 tests across 4 describe blocks: 400 (4 cases: missing name, empty/whitespace, >100 chars, invalid JSON), 401, 500 (RPC error), 201 (happy path + verifies `rpc` called with trimmed name and cookie set).
- Mocks `supabase.rpc` — no raw `.from()` mock needed.

### Test Results

```
Tests  8 passed (8)
```

### Type Check

`npx tsc -p . --noEmit` — clean (0 errors).

### Concern Resolution

The DONE_WITH_CONCERNS concern from the original report is now resolved. `/api/workspace/create` unblocks fully once migration 0008 is applied to the database.

**Status:** DONE
**Summary:** Migration 0008 created, route refactored to RPC, 8/8 new tests pass, type check clean. The `create_workspace_for_user` RPC unblocks `/api/workspace/create` end-to-end.
**Concerns/Blockers:** None.

---

## Follow-up: Code Review Fixes (C1, H1, H2)

### C1 — `writeActiveWorkspaceId()` throws in RSC context

**File:** `lib/active-workspace-cookie.ts`

**Approach:** Wrapped the entire cookie-write body in try/catch, mirroring `lib/supabase/server.ts:setAll`. The catch block is intentionally empty with a comment explaining the soft-fail semantics — Next.js 15/16 throws `"Cookies can only be modified in a Server Action or Route Handler"` from RSC context; the cookie will be written correctly on the next Route Handler interaction.

**Diff summary:**
```
writeActiveWorkspaceId: store.set(...)
→ try { store.set(...) } catch { /* RSC no-op */ }
```

**Test added:** `tests/lib/active-workspace-cookie.test.ts` — "does not propagate when cookies().set() throws (RSC context)"
- Mock now uses a mutable `mockSet` ref so individual tests can override `set()` behavior without re-mocking the module
- The C1 test sets `mockSet` to throw the real Next.js error string, then asserts `writeActiveWorkspaceId()` resolves without throwing
- This test **would fail** against the unfixed code (no try/catch = unhandled rejection)

---

### H1 — Silent role coercion at `lib/workspace.ts`

**File:** `lib/workspace.ts` — `resolveWorkspace()` (line ~142)

**Approach:** Replaced `(member.role as "owner" | "member") ?? "member"` with explicit whitelist check:
```ts
if (rawRole !== "owner" && rawRole !== "member") {
  throw new Error(`resolveWorkspace: unexpected role value "${rawRole}" ...`);
}
```
Chose throw (not log+return) because this function gates permission decisions — silent coercion to "member" on an unknown role (e.g. future "viewer") would grant wrong access rather than fail loudly.

**Test added:** `tests/lib/workspace.test.ts` — "throws when DB returns a role value outside 'owner'|'member'"
- Sets workspace mock to return `{ role: "viewer" }`
- Asserts `getActiveWorkspace()` rejects with `/unexpected role value/i`
- This test **would fail** against the unfixed code (old code silently returned `"member"`)

---

### H2 — `as unknown as` cast in `listMyWorkspaces`

**File:** `lib/workspace.ts` — `listMyWorkspaces()` flatMap

**Approach (option b):** Replaced blind `as unknown as` with structural narrow:
```ts
const ws = Array.isArray(rawWs) ? (rawWs[0] ?? null) : (rawWs as ... | null);
```
Handles both the current runtime shape (single object from PostgREST many-to-one) and any future shape change if Supabase TS types are fixed to return an array. Added inline comment documenting the Supabase TS-types quirk and why both paths are needed.

No new test needed — existing `listMyWorkspaces` tests already exercise the flatMap path; the structural narrow preserves all assertions.

---

### Final Test Counts

| File | Before | After | Delta |
|------|--------|-------|-------|
| `tests/lib/active-workspace-cookie.test.ts` | 4 | 5 | +1 (C1 regression) |
| `tests/lib/workspace.test.ts` | 6 | 7 | +1 (H1 regression) |
| Full suite passing | 148 | 156 | +8 (includes prior session) |
| Full suite failing | 8 | 8 | 0 (same pre-existing Printify) |

### tsc Result

`npx tsc -p . --noEmit` → **clean** (zero errors).

---

**Status:** DONE
**Summary:** C1 fixed (try/catch in writeActiveWorkspaceId), H1 fixed (explicit role validation + throw), H2 fixed (structural narrow), 2 regression tests added, tsc clean, 8 Printify pre-existing failures unchanged.
**Concerns/Blockers:** None.
