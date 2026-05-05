# Phase 06 — Manual Refresh

**Status:** completed (2026-05-05) — refresh action shipped, fail-closed preview guard, 46 tests pass · **Est:** 3-4h · **BlockedBy:** 03 (ETL exists), 05 (UI to put button on)

**Reports:** [code-reviewer-260505-2138](../../plans/reports/code-reviewer-260505-2138-pod-dashboard-phase-06.md) | [tester-260505-2141](../../plans/reports/tester-260505-2141-pod-dashboard-phase-06-smoke.md)

## Context Links
- Plan: [plan.md](plan.md)
- GHA repository_dispatch docs: https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event

## Overview
Refresh button on dashboard → POST to Vercel API route → fires GHA `workflow_dispatch` for daily-etl with `since_date = today - 3` → UI polls `etl_runs` table → shows "Updated 2 min ago" when complete.

## Key Insights
- No new ETL infra. Reuse `daily-etl.yml` with `workflow_dispatch` input.
- GHA API call is async — UI must poll status. Don't try to wait synchronously (Vercel 60s limit).
- Rate-limit refresh: max 1 manual run per 5 min per workspace (prevent button mashing → API ban).
- Show "last refresh" + "next auto refresh" in header always.

## Requirements

### Functional
- Header refresh button: idle / pending / disabled-with-cooldown states
- Click → POST `/api/refresh` → server creates GHA workflow_dispatch with workspace_id
- UI polls `etl_runs` for new row with `trigger='manual'` until `status` ∈ {success, error, partial}
- Header shows "Last refresh: 2m ago" sourced from latest `etl_runs.finished_at`
- Cooldown: 5 minutes between manual refreshes per workspace

### Non-functional
- API route auth: must be workspace member
- GHA token (PAT or App token) stored in Vercel env, never client
- Polling interval: 5s, max duration: 5 min, abort if exceeded

## Architecture
```
app/
├── api/refresh/route.ts          ← POST handler
└── (app)/_components/refresh-button.tsx  ← client; uses route + polls

lib/
└── github-dispatch.ts            ← fires workflow_dispatch via GH REST API
```

GHA workflow `daily-etl.yml` already supports `workflow_dispatch` (Phase 03) with `workspace_id` input. No GHA changes needed.

## Related Code Files
**Create:**
- `app/api/refresh/route.ts`
- `app/(app)/_components/refresh-button.tsx`
- `lib/github-dispatch.ts`

**Edit:**
- `app/(app)/layout.tsx` — add `<RefreshButton />` to header
- `app/(app)/_data/get-last-refresh.ts` — fetch latest etl_run for header label

## Implementation Steps
1. Generate GitHub PAT scoped to repo `actions:write`. Store as `GITHUB_DISPATCH_TOKEN` in Vercel env + GHA secrets.
2. `lib/github-dispatch.ts`:
```ts
async function dispatchEtl(workspaceId: string) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/daily-etl.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { workspace_id: workspaceId, trigger: 'manual' },
      }),
    },
  );
  if (!res.ok) throw new Error(`GH dispatch ${res.status}`);
}
```
3. `app/api/refresh/route.ts`:
   - Verify session + workspace membership
   - Check `etl_runs` for last manual run within 5 min → return 429 if cooldown
   - Insert pending row in `etl_runs (status='pending', trigger='manual')`
   - Call `dispatchEtl(workspaceId)`
   - Return 202 + `etl_run_id`
4. `refresh-button.tsx`:
   - Idle button → on click, POST `/api/refresh`, switch to "Refreshing…"
   - Poll `/api/etl-runs/{id}` every 5s until terminal status
   - On success: trigger `router.refresh()` to reload server components
   - On cooldown 429: show "Cooldown 4m"
5. `get-last-refresh.ts`: returns latest successful `etl_runs.finished_at` for workspace
6. Header label: "Last refresh: 12m ago" + "Next auto: in 17h" (computed from cron)

## Todo
- [x] GH PAT + env vars
- [x] github-dispatch helper
- [x] /api/refresh route (auth + cooldown + dispatch + etl_runs row)
- [x] /api/etl-runs/[id] route (status check)
- [x] RefreshButton component (states + polling)
- [x] last-refresh fetcher + header integration
- [x] E2E test: click → see status change

## Success Criteria
- Click refresh → button shows "Refreshing…" → after ~30-60s shows "Updated just now" → numbers update without full page reload
- Spam-click → 2nd click shows "Cooldown" message
- Token revocation: failure path shows clear error, doesn't hang

## Risks
- GHA dispatch can take 10-30s before workflow actually starts → polling must tolerate "no new etl_run yet"
- Vercel function 60s limit doesn't matter (we return 202 immediately) but polling endpoint must stay <1s
- GH PAT expires (90d default) — set to 1y or use Fine-grained PAT with longer expiry; document rotation

## Security
- Cooldown enforced server-side (DB query, not client state)
- PAT scoped to `actions:write` only on this repo
- Workspace membership checked before dispatch
- `etl_runs.trigger` distinguishes cron from manual for audit

## Follow-ups (Deferred)

Code review 9.4/10 flagged the following for Phase 07:

- **M1:** `markRunError` lacks `workspace_id` filter for defense-in-depth. Not exploitable in Phase 06 call path (runId created locally); add `workspaceId` arg to match pattern. `lib/etl-runs.ts:164–174`.
- **M2:** `use-etl-run-status.ts` is 269 LOC vs. project 200-LOC rule. Extract cooldown countdown logic into separate `use-cooldown-countdown.ts` hook (lines 229–252 + useRef). Brings main hook to ~210 LOC.
- **R1 / D7:** Janitor cron to mark `etl_runs.status='running'` rows older than 1h as `error`. Prevents orphaned placeholder rows if GHA never dispatches. Phase 07 scope.
- **9 minor nits:** enumerated in `plans/reports/code-reviewer-260505-2138-pod-dashboard-phase-06.md` (N1–N9). Recommend reviewing but not blocking Phase 07 start.

## Next Steps
Phase 07 polishes copy, onboarding doc, manual reconciliation, prod ship. Start unblocked.
