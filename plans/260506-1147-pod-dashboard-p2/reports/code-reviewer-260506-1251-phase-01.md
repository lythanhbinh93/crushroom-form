# Code Review — POD Dashboard P2 Phase 01 (Multi-Brand Foundation)

**Date:** 2026-05-06 · **Reviewer:** code-reviewer · **Phase:** P2-01 Multi-Brand Foundation

---

## Scope
- Files: `lib/active-workspace-cookie.ts`, `lib/workspace.ts`, `app/api/workspace/{switch,create}/route.ts`, `app/(app)/_components/brand-switcher.tsx`, `app/(app)/layout.tsx`, `supabase/migrations/0008_*.sql`, `package.json`, 4 new test files.
- LOC: ~535 production + ~530 test.
- Focus: security boundaries, cookie + RLS contract, race conditions, test rigor, CI guard portability.

## Overall Assessment

Solid security posture (RLS-aware client throughout, no service-role in `app/`, owner-creation routed through SECURITY DEFINER RPC, CSRF defense via httpOnly + sameSite=lax, UUID format guard prevents cookie poisoning). The 4-step `getActiveWorkspace()` contract is correctly implemented with no infinite-loop risk.

**However, one CRITICAL runtime bug:** `getActiveWorkspace()` calls `writeActiveWorkspaceId()` from layout-as-server-component context. In Next.js 15+ (this repo: `next 16.2.4`), `cookies().set()` invoked from a Server Component throws — and unlike `createSupabaseServerClient` (which try/catches the throw at server.ts:22), `lib/active-workspace-cookie.ts` does not. First-time login (bootstrap path) and cold-cookie fallback path will throw an unhandled exception in production. The vitest mocks override `cookies()` and so completely hide the issue — all 25 tests pass against a fake store that allows writes.

Recommend **REWORK** for the cookie-write boundary, then ship.

---

## Findings by Severity

### CRITICAL

**C1. `writeActiveWorkspaceId()` will throw when called from `getActiveWorkspace()` in a Server Component (layout.tsx).**

- `lib/workspace.ts:86` and `:103` call `writeActiveWorkspaceId(...)` from inside `getActiveWorkspace()`.
- `getActiveWorkspace()` is invoked from `app/(app)/layout.tsx:13` — a React Server Component (RSC), not a Route Handler / Server Action.
- In Next.js 15/16, `cookies().set()` from an RSC **throws** ("Cookies can only be modified in a Server Action or Route Handler"). See contrast in `lib/supabase/server.ts:22` where `setAll` is intentionally wrapped in try/catch and explicitly comments "Called from a Server Component — set is a no-op there."
- `lib/active-workspace-cookie.ts:15-23` has no such guard. Result: unhandled exception during render → 500 page on:
  - First-time login (Step 4: bootstrap path).
  - Returning user with cleared/expired cookie (Step 3: oldest-membership fallback).
- Vitest mocks at `tests/lib/workspace.test.ts:17-25` make `cookies().set()` succeed, so the bug is completely hidden by test scaffolding. This is a textbook "tests pass even if implementation is wrong" hazard.
- Cookie writes from Route Handlers (`/api/workspace/switch`, `/api/workspace/create`) are fine — that's the only context Next allows.

**Fix options (pick one):**
1. **Wrap the write in try/catch** in `writeActiveWorkspaceId()` mirroring `server.ts:22`. The cookie will be re-set on next switch or on the next route-handler call. Document the soft-fail.
2. **Move cookie-write out of `getActiveWorkspace()`** and have layout (or middleware) detect "no cookie" and redirect through a route handler that sets it. More invasive but explicit.
3. **Use middleware** to set the cookie on first-request to `/(app)/*`. Cleanest long-term.

Add a test that asserts the throw is swallowed (option 1) or that the no-cookie path does not call `writeActiveWorkspaceId` synchronously (option 2/3). Replace the permissive cookie mock with one that throws on `set()` to catch this class of bug.

---

### HIGH

**H1. `lib/workspace.ts:142` — role cast loses runtime safety.**
`(member.role as "owner" | "member") ?? "member"` silently coerces an unexpected DB value (e.g. future role `"viewer"`) to the literal type. The DB CHECK constraint at `0001_workspaces.sql:21` guards against this today, but downstream code branches on `role === "owner"` for permission decisions — if the constraint is ever relaxed, a new role string would be typed as `"member"` while logging/auditing would show otherwise. Prefer an explicit narrow:
```ts
const role: "owner" | "member" = member.role === "owner" ? "owner" : "member";
```

**H2. `listMyWorkspaces()` — `as unknown as ...` cast hides a real Supabase typing problem.**
At `lib/workspace.ts:49`, the dev cast `row.workspaces` from array-typed inference to single-row. The cast is **wrong in shape** but **right by accident**: PostgREST returns `workspaces` as a single object on a many-to-one join (one `workspace_members` row → one `workspaces` row), but `@supabase/supabase-js` types it as an array because the relationship isn't declared as `!inner` or single-cardinality. The cast works at runtime but masks two real bugs:
   - If a future schema migration adds a back-reference, the type would change and the cast would silently keep working.
   - The variable name `flatMap` + array-assumed iteration in tests gives a false sense that this is multi-row safe.

Recommendation: either declare the relationship explicitly (`workspaces!inner(id, name, created_at)`) and use `.returns<{...}>()` for type-safe rows, or do a structural narrow at runtime:
```ts
const ws = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
```

**H3. Order-by column for membership listing is `created_at` but no index exists for `(user_id, created_at)`.**
`lib/workspace.ts:157` — `fetchMemberships` orders by `created_at`. The index at `0001_workspaces.sql:26` is `idx_workspace_members_user(user_id)` only. For users with many workspaces this requires a sort step on the filtered result. Today this is "tens of rows", but it's the kind of N+1-equivalent inefficiency that bites at scale. Add a composite index in a future migration:
```sql
create index if not exists idx_workspace_members_user_created
  on public.workspace_members(user_id, created_at);
```
Not a ship blocker; flag for Phase 02 storage planning.

---

### MEDIUM

**M1. `app/api/workspace/switch/route.ts:50` — UUID regex accepts non-v4 UUIDs.**
The regex matches any 32-hex-with-dashes pattern. Fine for cookie-poisoning defense (the goal is "rejects garbage") but doesn't enforce v4 specifically. Acceptable, but rename `isUuid` to `isUuidLike` or document. Don't tighten unless you can guarantee Postgres `uuid_generate_v4()` only returns v4 (it does, but middleware tokens or future DB-side gen could vary).

**M2. CI grep guard — false-negative risk for inline service-role usage.**
`package.json:13` greps for the string `createSupabaseServiceClient`. A future refactor that rebinds (`const fn = createSupabaseServiceClient; fn();` is silly, but `import { createSupabaseServiceClient as svc }` would still match) — but if someone uses `createClient` from `@supabase/supabase-js` directly with the service-role key, the guard misses it entirely. Strengthen by also banning `SUPABASE_SERVICE_ROLE_KEY` token under `app/`:
```
grep -rn "createSupabaseServiceClient\|SUPABASE_SERVICE_ROLE_KEY" app/
```

**M3. CI guard cross-platform — relies on `grep` on PATH.**
Verified working on Windows via this review (PowerShell `npm run guard:no-service-role-in-app` returned exit 0 with no output — git-bash `grep` is on the user's PATH). On a fresh Windows machine without git-for-windows installed, `grep` would not exist and `execSync` would throw an error that the catch block re-handles incorrectly: `e.status === 1` would be `undefined`, `e.stdout` would be empty, so the function falls through to `process.exit(0)` — **silently passing**. Linux CI is fine. Mitigation: use a Node-native search:
```js
"guard:no-service-role-in-app": "node scripts/guard-no-service-role.js"
```
Where the script reads files via `fs.readdirSync` recursively and searches the string. Eliminates the dependency. Not blocking for current setup (CI is Linux per Next/Vercel norm) but document the constraint.

**M4. `BrandSwitcher` race window on rapid switching.**
`brand-switcher.tsx:22-47` — `setBusy(true)` happens before the fetch; the `<select>` is `disabled={busy}`, which prevents simultaneous clicks. However, the React state update + re-render is async — a fast user could potentially fire two `onChange` events before `disabled` propagates. Low real-world risk (browsers serialize keyboard/click on `<select>`), but a dedicated `inFlightRef = useRef(false)` early-return is more robust than relying on render timing.

**M5. `BrandSwitcher` uses `window.prompt()` for "+ New brand".**
`brand-switcher.tsx:50` — functional but ugly UX, blocks the event loop, and not testable. Acceptable for Phase 01 ("ugly UX is fine, security is not"), but file as a Phase 02 polish task. Add a TODO comment.

**M6. `app/api/workspace/create/route.ts:48` — `workspaceId as string` type assertion.**
RPC return type is `string | null`, route casts to `string` without validating. If RPC returns null (shouldn't, but defense-in-depth), `writeActiveWorkspaceId(null)` would write the string `"null"` to the cookie. Add:
```ts
if (!workspaceId || typeof workspaceId !== "string") {
  return NextResponse.json({ error: "rpc returned invalid id" }, { status: 500 });
}
```

**M7. Test rigor — many tests are mock-tautologies.**
- `tests/lib/workspace.test.ts` mocks `createSupabaseServerClient` and constructs response sequences. Tests assert that the function returns what the mocks were configured to return. The "stale cookie" test (lines 132-160) is the most meaningful (it exercises the fallback). The "happy path" test (lines 107-127) would pass if `getActiveWorkspace` simply returned `{id: cookie, name: ws.name, ...}` with no membership check at all — because the mock for `workspace_members.single()` returns `{role: "owner"}` regardless of input.
- Add a test that asserts `resolveWorkspace` queries `workspace_members` with the **specific** workspace_id from cookie (not any value). This catches the "implementation forgot to pass workspaceId to the membership query" class of bug.
- Add a test where the cookie write throws (per C1 above) to assert graceful degradation.

**M8. `getActiveWorkspace()` calls `auth.getUser()` and the layout calls it again.**
`app/(app)/layout.tsx:19` — after `getActiveWorkspace()` (which already validates user), the layout re-invokes `supabase.auth.getUser()` to get email. That's an extra round-trip per page load. Trivial fix: have `getActiveWorkspace` return the user info too, or use `auth.getSession()` (cookie-only, no network). Not a blocker.

---

### LOW

**L1. `lib/active-workspace-cookie.ts:21` — session cookie (no maxAge) means switch is forgotten on browser close.**
Comment acknowledges this. For a workspace switcher this is probably wrong UX (user expects "I'm still on Brand B tomorrow"). Consider `maxAge: 60 * 60 * 24 * 365`. Not security-relevant, just UX.

**L2. Migration 0008 `name` length guard duplicates route-level guard.**
Belt and suspenders, fine. Just note that the error messages differ ("name too long (max 100 chars)" vs the same string raised as exception → mapped to generic 500 in route). Consider mapping known RPC errors to 400 in the route's `rpcError` handler:
```ts
if (rpcError.message.includes("name too long")) return 400; etc.
```
Otherwise legit user error returns 500, polluting logs/alerts.

**L3. `isUuid` regex compiled on each call.**
`app/api/workspace/switch/route.ts:50` — micro-perf nit. Hoist to module-level `const`. Negligible.

**L4. `BrandSwitcher` error state never auto-clears.**
If a switch fails then succeeds, the red "switch failed" text persists. Clear `error` on next attempt (already happens in `handleSwitch:31` via `setError(null)`). OK.

---

## Edge Cases (scout findings)

1. **Concurrent ETL run while user is mid-switch** — ETL uses service-role client and reads `workspace_id` from job param, not from cookie, so no interference. ✓
2. **User removed from workspace while their dashboard is open** — Next request to `getActiveWorkspace()` will fall through stale-cookie path → resolve to oldest remaining workspace. Cookie gets rewritten. Correct. ✓ (modulo C1 above)
3. **Owner deletes the workspace they're currently viewing** — workspace row deleted → `workspaces` select returns null → `resolveWorkspace` returns null → fall through to oldest membership. RLS cascades from delete. ✓
4. **User has zero memberships AND bootstrap RPC fails** — `getActiveWorkspace` throws "workspace bootstrap failed: ..." which propagates to the layout, which has no error boundary. The user sees Next.js's default error UI. Acceptable for now, but consider an error boundary in `(app)/error.tsx` for a friendlier message.
5. **Migration 0008 idempotency** — `create or replace function` is idempotent. But if the function signature ever changes (`_name text` → `_name text, _currency text`), the old binding lingers and PostgREST may pick the wrong one. Future-proofing: drop-and-recreate with a version comment.
6. **`bootstrap_workspace_for_user(_name => "My Brand")` race** — two concurrent first-login requests for the same user could both pass the "skip if user already in a workspace" check and both insert. The second insert succeeds because there's no UNIQUE constraint on `(user_id) WHERE first-membership`. Result: user ends up with two workspaces named "My Brand". Pre-existing P1 issue, not introduced here. Phase 03 members management could surface as bug.

---

## Positive Observations

- RLS-aware client used everywhere in `app/`. Service-role properly confined to `lib/`, `etl/`, `tests/`.
- `dynamic = "force-dynamic"` correctly placed in layout — caching risk acknowledged + mitigated.
- `Promise.all` for parallel fetches in `resolveWorkspace` and the layout — good perf habit.
- UUID format guard before any DB call in `/switch` — prevents cheap DoS via malformed cookie probing.
- `httpOnly` + `sameSite=lax` cookie correctly chosen. Lax (not Strict) allows top-level GET navigation, which is right for this cookie's purpose.
- Migration 0008 mirrors `bootstrap_workspace_for_user` precisely — pattern consistency. Good.
- `_data/*` not modified — phase scope respected. Existing `getActiveWorkspace()` consumers continue to work because the return type didn't change.
- The honest "DONE_WITH_CONCERNS" report flagged the missing INSERT policy before tests caught it. Good engineering hygiene.

---

## Recommended Actions

**Before merge (blocking):**
1. **Fix C1** — wrap `cookies().set()` in `lib/active-workspace-cookie.ts:writeActiveWorkspaceId` in try/catch (or refactor cookie-write out of server-component path). Add a test that asserts the no-cookie path does not 500 when running in an RSC context (mock `cookies().set` to throw).

**Before next phase (non-blocking but soon):**
2. Tighten H2 — replace `as unknown as` with structural narrow in `listMyWorkspaces`.
3. Tighten H1 — explicit role narrow.
4. Add M6 — null-check on RPC return.
5. Add M7 — deeper assertions in workspace.test.ts (assert workspaceId is propagated to membership check).
6. Strengthen guard per M2 (also ban `SUPABASE_SERVICE_ROLE_KEY` literal).

**Future (Phase 02-03):**
7. Composite index on `workspace_members(user_id, created_at)` (H3).
8. Replace `window.prompt` with a real dialog (M5).
9. Map known RPC error messages to 400 (L2).
10. Persist cookie across browser sessions (L1).
11. Address bootstrap-race in `bootstrap_workspace_for_user` (edge #6).

---

## Metrics

- Type Coverage: clean `tsc --noEmit`. Two locations use casts (H1, H2) that mask real type concerns.
- Test Coverage: 25 new tests, 25 pass. **Coverage of behavior is shallower than coverage of paths** — see C1 (whole class of RSC-context bugs invisible to mocks) and M7 (mock-tautologies).
- Linting Issues: not run in this review (dev report claims clean).
- CI Guard: works on current dev box (Windows + git-bash). Documented portability concern in M3.

---

## Score: **6.5 / 10**

Phase scope was security-sensitive and the team made all the right defense-in-depth moves at the API + DB layer. But the cookie-write-from-RSC bug (C1) is a hard production failure on the most common codepath (any user without a cookie hitting the dashboard) and the test suite is structurally unable to catch it. Score reflects: strong design, weak verification.

**Ship Recommendation: REWORK then SHIP**

Fix C1 + add the regression test. Everything else is iterative improvement that should not block Phase 02.

---

## Unresolved Questions

1. Was `getActiveWorkspace()` from layout actually exercised in manual smoke testing with a cleared cookie? The manual test bullet in the plan ("log in as user with 2 brands → switch") would not hit the cookie-set-from-RSC path because both brands already have memberships and step 2's cookie write path requires no cookie. Suggest manual repro: clear browser cookies for the site, hit `/`, observe.
2. Is there a Next.js middleware in this repo? If so, setting the cookie there avoids C1 entirely. Check `middleware.ts` (didn't review).
3. Phase 02-07 plans assume the dropdown works in production — does the team want a quick smoke test on a Vercel preview before signing off P2-01?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** 25/25 tests pass and security boundaries are correct, but C1 (cookie-write-from-RSC) is a runtime regression hidden by permissive mocks. Recommend fix-then-ship.
**Concerns/Blockers:** C1 will 500 on first login and on cleared-cookie return visits. Must be fixed before merge.
**Score:** 6.5 / 10
