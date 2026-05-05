# Code Review — POD Brand Dashboard Phase 06 (Manual Refresh)

**Date:** 2026-05-05
**Reviewer:** code-reviewer
**Plan:** `plans/260504-1115-pod-brand-dashboard-p1/phase-06-execution.md`
**Repo:** `D:\github local\pod-dashboard`
**Branch:** `claude/add-photo-upload-tool-p3dI0` (parent: pod-dashboard work tree)

## Score: 9.4 / 10

## Verdict: APPROVE_WITH_FIXES

Auto-approve threshold (≥ 9.5 + zero critical) **not met** — one critical fix required (`NEXT_PUBLIC_VERCEL_ENV` env documentation gap that silently disables Q3 preview guard). Otherwise the implementation is high-quality, faithful to D1–D9, and ready to ship after that one-line fix.

---

## Critical Issues (block ship)

### C1 — `NEXT_PUBLIC_VERCEL_ENV` undocumented; preview-env guard silently no-ops

**File:** `.env.local.example` (and Vercel project settings — not in repo)
**Risk:** **Q3 / R5 high-impact silent failure.** The button code in `refresh-button.tsx:30-33` reads `process.env.NEXT_PUBLIC_VERCEL_ENV`. Vercel only auto-injects `VERCEL_ENV` at build/runtime; `NEXT_PUBLIC_*` mirrors are NOT auto-set. If the operator forgets to add `NEXT_PUBLIC_VERCEL_ENV=$VERCEL_ENV` in Vercel project settings, every preview deployment will render `isPreviewEnv === false` and dispatch real ETL runs against production GitHub workflow with prod tokens — exactly the scenario R5 / Q3 was designed to prevent.

**Fix:**
1. Add to `.env.local.example`:
   ```
   # MUST be wired in Vercel: Settings → Environment Variables → add
   # NEXT_PUBLIC_VERCEL_ENV with value $VERCEL_ENV (system variable reference)
   # If unset, refresh button defaults to enabled (production semantics).
   NEXT_PUBLIC_VERCEL_ENV=development
   ```
2. Add a one-paragraph README note in the GitHub-dispatch section.
3. **Optional defense-in-depth:** invert the default in `refresh-button.tsx` — `const isPreviewEnv = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";` — so the guard fails CLOSED (button disabled) when env is missing, instead of FAILING OPEN. Currently, missing env → button enabled. Recommended: flip the polarity.

This is the only blocker. One env-line + a polarity flip fixes it.

---

## Major Issues (fix soon)

### M1 — `markRunError` lacks `workspace_id` defense-in-depth

**File:** `lib/etl-runs.ts:164-174`

`markRunError(runId, errorMessage)` updates by `id` alone:
```ts
.update({ status: "error", error: errorMessage, finished_at: ... })
.eq("id", runId);
```

Every other helper in this file scopes by `workspace_id` (D5/D7 hardening). Practically not exploitable in current code path — the `runId` was created 2 lines earlier from `insertPendingManualRun(workspace.id)` so it is owned by the same workspace — but the function signature invites a future caller to pass a `runId` derived from request input. Add `workspaceId` arg + `.eq("workspace_id", workspaceId)` filter to match the pattern. Two-line change, eliminates a foot-gun.

### M2 — `use-etl-run-status.ts` is 269 LOC vs. project 200-LOC rule (R8 follow-through)

**File:** `app/(app)/_components/use-etl-run-status.ts`

R8 forecast was "extract to hook if T9 hits 180 LOC." Done — but the hook itself is now 269 LOC (190 code + 79 doc). Project CLAUDE.md says "consider modularizing." The doc lines are well-written and load-bearing; trimming them is destructive. The cleaner split is **one further extraction**: pull the cooldown countdown out into `use-cooldown-countdown.ts` (currently lines 229–252 of the trigger callback — 25 lines + a useRef + 5 constants moves out cleanly). That brings the main hook to ~210 LOC and gives the cooldown logic its own test surface.

Acceptable to ship as-is and follow up next phase, but flag in journal so it doesn't drift further.

### M3 — Race: rapid click-click during success-linger window can fire duplicate POSTs

**File:** `use-etl-run-status.ts:200-225`

`trigger()` aborts pending fetches and clears timers, but the state-machine UI only renders the button as `<Button>` (clickable) in the `idle` branch. In `success` and `error` linger states the button is `disabled`, so React-tree-wise the click handler isn't bound — good. **However**, the state transition `pending → success → idle (after SUCCESS_LINGER_MS)` could allow a quick click immediately after `idle` returns, and if the previous `router.refresh()` server roundtrip is still resolving, a fresh POST could overlap. The server-side cooldown will catch this (D9), so the user sees a 429 not a duplicate dispatch. Acceptable. Consider adding an `inFlightRef` boolean as belt-and-suspenders if you ever drop the cooldown.

### M4 — `RefreshButtonProps.initialLastRefresh` is read but never used

**File:** `app/(app)/_components/refresh-button.tsx:22-25, 43`

```ts
export function RefreshButton(_props: RefreshButtonProps) {
```
The underscore prefix is a deliberate "intentionally unused" signal but the JSDoc says `reserved for T10 layout label`. T10 is now done — `RelativeTime` is wired separately in `page.tsx:122`. The prop is dead. **YAGNI:** drop the prop and the type, or actually consume it (e.g. pass to the cooldown 429 path so we can show "Last successful Xm ago" inside the button title). Recommend: **remove it.** Dead surface area is a contract debt — future callers will pass values that quietly do nothing.

---

## Minor / Nits

### N1 — `getCooldownRemainingMs` doesn't filter out terminal-error runs

`lib/etl-runs.ts:72-88` queries the latest manual run (any status) and uses `started_at`. If the previous manual run errored (e.g. revoked PAT) 30s ago, the user is locked out for 4m30s before retry. Arguably the correct UX (rate-limit applies regardless of outcome), but worth a comment. Consider `.in("status", ["running", "success", "partial"])` to let users immediately retry after an error. Trade-off; pick a side and document.

### N2 — `getRunStatus` is exported but never imported anywhere except tests

`lib/etl-runs.ts:33-52`. The route uses `getCompletionForPlaceholder`, not `getRunStatus`. Either delete `getRunStatus` (YAGNI) or add a doc comment noting it's the "simple" lookup retained for future single-row needs.

### N3 — `lingerTimerRef.current = setTimeout(...)` after `clearAllTimers()` race

`use-etl-run-status.ts:96-100` and `:173-176`: `setState` is sync but `setTimeout` schedules. If a parallel state transition fires (`toError` from a network event) between the `setState` and the `setTimeout` assignment, the linger handle could overwrite a freshly-cleared one. Practically impossible given React's batching, but theoretically a small window. Not worth fixing.

### N4 — `data` typed as ad-hoc inline shape in `tick()`

`use-etl-run-status.ts:133`. Reuse the `EtlRunSnapshot` type from `lib/etl-runs.ts` (or a frontend-narrowed equivalent). Remove the `string` union ambiguity on `status`.

### N5 — Workflow ref env in `.env.local.example` says default is `main` — but `dispatchDailyEtl` falls back silently

`lib/github-dispatch.ts:27`: `const ref = process.env.GITHUB_WORKFLOW_REF || "main";` — if the env is set to empty string the fallback kicks in. Risk per R5 says preview deployments may need an override; if a dev sets `GITHUB_WORKFLOW_REF=` (empty) thinking they cleared it, they silently dispatch against `main`. Low likelihood; accept.

### N6 — `daily-etl.yml` workflow ID hardcoded in dispatch URL

`lib/github-dispatch.ts:29` hardcodes `daily-etl.yml`. If the workflow file is ever renamed, this breaks silently with a 404. Acceptable hardcoding (filename is a contract), but worth a comment pointing at `.github/workflows/daily-etl.yml`.

### N7 — `etl-runs.test.ts` mock chains are repetitive

The Supabase mock-builders in the test file are duplicated per test for `getCompletionForPlaceholder`. Consider a small `mockSupabaseChain()` helper to DRY this up. Tests pass, behavior coverage is good (18 test cases). Nit only.

---

## Strengths

- **D1/D2/D5/D7/D9 all faithfully implemented.** No drift from spec.
- **Auth hardening solid:** `getActiveWorkspace()` precedes every service-role write; `workspace_id` always derived from auth'd session, never request body. Same pattern as Phase 05 (R9).
- **`getCompletionForPlaceholder` (D7) correctly scopes both queries** by `workspace_id` — placeholder lookup AND the newer-row scan. Filter chain is right.
- **`get-last-refresh.ts` uses `createSupabaseServerClient` (RLS-aware), not the service client.** R4 verified.
- **Token never echoed to clients.** Authorization header isolated to `dispatch` helper; on failure, only `status` + `body` (GitHub's response, never our PAT) propagate. Body is truncated to 500 chars in route.
- **Polling state machine well-engineered:** `setTimeout` recursion (D3 ✓), `AbortController` per-fetch (✓), 5-min wall-clock (✓), unmount cleanup (✓), abort errors silently swallowed (✓), terminal-status `router.refresh()` (✓).
- **Cooldown math correct at boundaries:** test #8 (5:00 ago = 0ms remaining), test #9 (4:59 ago = 1000ms remaining). `Math.max(0, ...)` prevents negative.
- **Type safety:** zero `any`, zero `as unknown as` (the `mockClient as unknown as ReturnType<...>` casts are confined to test files). Production code casts only Supabase return types via narrow `as string | null` patterns — necessary given Supabase's loose typing.
- **GHA dispatch error handling:** `markRunError` placeholder rescue means no orphaned `running` rows from PAT failures. Failure path is end-to-end testable per T11.
- **Out-of-scope hygiene:** no janitor cron added (deferred ✓), no toast lib (deferred ✓), no SSE/WebSocket. Phase scope held.
- **Tests:** 9 dispatch + 18 etl-runs cases, including boundary math, missing env vars, malformed env, network errors, dual-condition completion paths.
- **Tremor:** no spark-variant traps; `<Button loading>` is v3-correct.

---

## Edge Cases (scout-style)

- **Stale `etlRunId` from previous session:** if a user reloads with the button mid-poll, the local state resets to `idle` — no resume mechanism. By design (no localStorage). The cooldown still applies server-side, so the user can't double-dispatch. ✓
- **`getCompletionForPlaceholder` finds a newer ETL row written by a CRON between the click and the poll:** the function picks ANY newer terminal row (`trigger='manual'` filter narrows it). Cron rows would be `trigger='cron'`, so cron completions don't pollute manual polling. ✓
- **Wall-clock cap at exactly 5:00:** `Date.now() - startedAt >= POLL_TIMEOUT_MS` is correct (boundary inclusive of timeout); won't loop forever.
- **404 from `/api/etl-runs/[id]`:** code retries until wall-clock cap. Right behavior given GHA queue delay (R1). Will spam the server up to 60 times in 5 min, but that's 60 cheap RLS-scoped lookups — acceptable.

---

## Metrics

- TypeScript: zero `any`, zero forbidden casts in production paths
- LOC budget: T9 split honored. `use-etl-run-status.ts` 269 LOC over rule, flagged M2.
- Test count: 27 unit tests across 2 files (vs. plan target ≥8). Excellent coverage.
- File ownership: clean — no parallel-edit conflicts.

---

## Recommended Actions (priority order)

1. **C1:** add `NEXT_PUBLIC_VERCEL_ENV` to `.env.local.example` + README; flip the guard polarity to fail closed.
2. **M1:** add `workspaceId` arg to `markRunError`; pass `workspace.id` from route.
3. **M4:** delete unused `RefreshButtonProps.initialLastRefresh` prop.
4. **M2:** schedule `use-cooldown-countdown.ts` extraction in next phase journal.
5. Nits N1, N4, N6 at editor's discretion.

---

## Unresolved Questions

1. **Cooldown after error runs (N1):** should a failed dispatch immediately re-enable the button, or hold the 5-min lock? UX call.
2. **`markRunError` workspace scoping (M1):** confirm two-line patch is acceptable vs. shipping as-is (current behavior is safe due to call-site discipline; the change is purely defense-in-depth).
3. **NEXT_PUBLIC_VERCEL_ENV polarity (C1):** confirm fail-closed default is desired. (Recommend yes — R5 says preview deployments must NOT dispatch against prod ref by accident.)
