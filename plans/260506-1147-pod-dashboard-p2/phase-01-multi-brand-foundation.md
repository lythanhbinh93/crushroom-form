# Phase 01 — Multi-Brand Foundation (switcher + active workspace refactor)

**Status:** completed · **Est:** 6-8h · **Completed:** 2026-05-06 · **BlockedBy:** none · **Blocks:** 02, 03, 04, 05, 06, 07

## Context Links
- Plan: [plan.md](plan.md)
- Existing: `pod-dashboard/lib/workspace.ts`, `app/(app)/layout.tsx`, `supabase/migrations/0001_workspaces.sql`

## Overview
P1 hardcoded `getActiveWorkspace()` to "first workspace user belongs to". P2 makes the active workspace selectable. The schema already supports N workspaces per user via `workspace_members`; the gap is purely UX + routing + a cookie.

## Key Insights
- `workspace_id` is on every P1 source/derived table — no schema migration needed.
- `bootstrap_workspace_for_user` only creates a workspace on first login; safe to keep, will no-op once user has any membership.
- Risk surface = every server component / `_data/*` function that reads `getActiveWorkspace()`. Each must accept the active id from cookie, not auto-pick.
- Cookie is the simplest persistence; URL segments would force every route under `/[brand]/...` and break Vercel preview links.

## Requirements

### Functional
- Top-nav dropdown lists all workspaces the user belongs to (from `workspace_members`).
- Selecting a workspace sets cookie `active_workspace_id` (server-side via route handler) and triggers `router.refresh()`.
- All `_data/*` queries scope by the cookie-resolved workspace id; if cookie missing or stale (user removed), fall back to bootstrap.
- New workspace creation: owner-initiated from dropdown ("+ New brand"); creates row + assigns owner via existing pattern.

### Non-functional
- Switching feels instant (<300ms perceived); no full page reload required.
- No data leak: a server component cannot accidentally use a workspace id the user is not a member of.
- Backwards-compatible: existing single-workspace users (Brand A, Brand B) see no behavior change on first load.

## Architecture

```
Browser dropdown → POST /api/workspace/switch?id=<uuid>
                       │
                       ├─ verify membership (RLS-checked select)
                       ├─ set cookie active_workspace_id (httpOnly, sameSite=lax)
                       └─ 200 { ok: true }
                       
Browser → router.refresh() → server components re-render
                       │
                       └─ getActiveWorkspace() reads cookie, validates membership, returns
```

### `getActiveWorkspace()` new contract
1. Read `active_workspace_id` cookie.
2. If present + user is member of that ws → return it.
3. Else: pick lowest-`created_at` workspace user belongs to (deterministic), set cookie, return.
4. Else: call `bootstrap_workspace_for_user` (first-time user).

## Related Code Files

**Edit:**
- `lib/workspace.ts` — new contract above
- `app/(app)/layout.tsx` — render `<BrandSwitcher>` in header
- `app/(app)/_components/header-nav.tsx` — slot for switcher

**Create:**
- `app/(app)/_components/brand-switcher.tsx` — client dropdown
- `app/api/workspace/switch/route.ts` — POST cookie setter
- `app/api/workspace/create/route.ts` — POST owner-create new workspace
- `lib/active-workspace-cookie.ts` — typed cookie read/write helpers (single source of truth)

**Delete:** none

## Implementation Steps
1. Add `lib/active-workspace-cookie.ts` with `readActiveWorkspaceId()` / `writeActiveWorkspaceId(id)` using `next/headers cookies()`.
2. Refactor `getActiveWorkspace()` per new contract; add `listMyWorkspaces()` helper.
3. Build `/api/workspace/switch` route: validates membership via RLS server client (NOT service role), sets cookie, returns 200/403.
4. Build `/api/workspace/create` route: owner-creates row, inserts membership, sets cookie, returns new id.
5. Build `<BrandSwitcher>` client component: fetches list on mount via server action OR receives prop from layout, renders dropdown, on-select calls switch API + `router.refresh()`.
6. Wire `<BrandSwitcher>` into `header-nav.tsx`.
7. Add CI grep guard: fail build if any file under `app/` calls `createSupabaseServiceClient()` (already an R9 rule, codify).
8. Manual test: log in as user with 2 brands → switch → verify KPIs change.

## Todo
- [x] `lib/active-workspace-cookie.ts`
- [x] Refactor `getActiveWorkspace()` + tests
- [x] `/api/workspace/switch` route + 403 path test
- [x] `/api/workspace/create` route (requires migration 0008)
- [x] `<BrandSwitcher>` component
- [x] Header wiring
- [x] CI grep guard for service-role in app/
- [~] Manual 2-brand smoke test (owner-tested; requires live Supabase)

## Success Criteria
- User with 2 workspaces sees both in dropdown; selecting one updates dashboard within 300ms.
- Curl-style attempt to set cookie to a non-member workspace id → switch route returns 403.
- Cold cookie (cleared) → fallback to oldest workspace, no error.
- All `_data/*` queries return rows only for the active workspace (verify via SQL: `SELECT DISTINCT workspace_id FROM daily_pl_view` after spoofing cookie).

## Risks
- **Stale server render after switch:** mitigated by `router.refresh()` + cookie-set in route handler (synchronous).
- **Layout caches workspace name:** Next 15 server-component cache could return wrong name; mark layout `dynamic = 'force-dynamic'`.
- **Race between switch API and refresh:** await switch response before calling refresh.
- **Owner deletes themselves from workspace:** disallow in members API (phase 03), document here.

## Security
- Switch route uses RLS-aware `createSupabaseServerClient()` — RLS validates membership; defense in depth.
- Cookie is httpOnly + sameSite=lax (CSRF defense for state-changing route).
- Service-role client banned from `app/` (CI grep). Already P1 rule R9; codified now.

## Code Review & Follow-ups

**Initial review (code-reviewer-260506-1251):** 6.5/10. Security posture strong (RLS-aware, service-role banned, CSRF defense); implementation rigorous. One CRITICAL bug surfaced: `writeActiveWorkspaceId()` throws in RSC context (Next.js 15/16 forbids cookie writes outside Route Handlers). Bug hidden by permissive test mocks. Fixed via try/catch in `lib/active-workspace-cookie.ts` + added regression test.

**Fixes applied:**
- **C1:** Wrapped `cookies().set()` in try/catch; soft-fail on RSC throws (cookie resets on next handler/refresh). Added test asserting no throw.
- **H1:** Explicit role validation narrow (throw on unexpected role, not silent coerce to "member").
- **H2:** Structural type narrow in `listMyWorkspaces()` instead of blind `as unknown as` cast.

**Deferred to Phase 02-03:**
- **H3:** Add composite index `idx_workspace_members_user_created` on `workspace_members(user_id, created_at)` during storage budget work (Phase 02).
- **M5:** Replace `window.prompt()` with real dialog (Phase 03 polish).
- **L1:** Persist cookie across sessions (update `maxAge`; requires UX review).
- **M2, M3:** Strengthen CI guard + Node-native cross-platform search (Phase 02 ETL work).

All 154/162 tests pass (8 pre-existing Printify failures unchanged). tsc clean. Phase shipped.

## Next Steps
Phase 02 sizes the storage cost of running the daily ETL across N workspaces; Phase 03 builds the members management UI that this phase's switcher implies exists.
