# Phase 06 — Execution Refinement

**Parent:** [phase-06-manual-refresh.md](phase-06-manual-refresh.md) · **Repo:** `D:\github local\pod-dashboard`
**Scout:** parallel scout did not deliver; self-scouted from repo (etl_runs schema, `daily-etl.yml`, existing service client, refresh-button stub).
**Status:** ready-to-execute · **Total est:** 3.5-4h · **Critical path:** T1 → T2 → T3 → T6 → T7 → T9 → T10 → T11

---

## Ticket List (executable order)

| ID | Intent | Files | Depends | Acceptance | Est |
|----|--------|-------|---------|------------|-----|
| **T1** | Env vars + secrets contract | `.env.example` (new), `README.md` (edit env section) | — | `.env.example` lists `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_WORKFLOW_REF` (default `main`). README documents Fine-grained PAT scope `actions:write` on this repo, 1y expiry, rotation note. No `lib/env.ts` exists in repo — skip Zod validation; throw at use-site (matches existing `createSupabaseServiceClient` pattern) | 20m |
| **T2** | `lib/github-dispatch.ts` helper | `lib/github-dispatch.ts` (new) | T1 | Exports `dispatchDailyEtl({ workspaceId }: { workspaceId: string }): Promise<void>`. POSTs to `/repos/{owner}/{repo}/actions/workflows/daily-etl.yml/dispatches` with `{ ref, inputs: { workspace_id } }`. Throws `GithubDispatchError` (subclass of Error) with `status` + body on non-204. Reads env at call time. <80 LOC | 30m |
| **T3** | `lib/etl-runs.ts` DB helpers | `lib/etl-runs.ts` (new) | — | Three functions, all take `(workspaceId: string)` first arg, use `createSupabaseServiceClient()`: `insertPendingManualRun()` returns `{ id }` with `source='all', trigger='manual', status='running'`; `getRunStatus(id)` returns `{ status, finished_at, error, rows_upserted } \| null`; `getLastSuccessfulRun()` returns `{ finished_at } \| null`; `getCooldownRemainingMs()` returns `number` (0 if free, else ms remaining; query: latest manual `started_at` within 5 min window). <120 LOC | 45m |
| **T4** | ~~Schema migration for `etl_runs`~~ | — | — | **SKIP.** Self-scout confirms `etl_runs` already has `id, workspace_id, source, trigger, started_at, finished_at, status, rows_upserted, error` (migration 0002:192-203). RLS select policy for members already in place (0002:258). No DDL needed | 0 |
| **T5** | ~~GHA workflow input changes~~ | — | — | **SKIP.** `daily-etl.yml` already accepts `workspace_id` input (line 20-22). The `trigger` value is computed in the workflow from `github.event_name` (line 59: `'cron'` vs `'manual'`) and passed via `--trigger=$TRIGGER` to `etl/run-daily.ts`. Manual dispatch always lands as `trigger='manual'`. No YAML edit needed | 0 |
| **T6** | `app/api/refresh/route.ts` (POST) | `app/api/refresh/route.ts` (new) | T2, T3 | Flow: `getActiveWorkspace()` (auth + membership in one call); `getCooldownRemainingMs()` → if >0 return `429 { error: "cooldown", retryAfterMs }` + `Retry-After` header (seconds); `insertPendingManualRun()`; `dispatchDailyEtl()`; on dispatch failure mark row `status='error', error=<msg>` and return 502; success returns `202 { etlRunId }`. Use `NextResponse`. <100 LOC | 45m |
| **T7** | `app/api/etl-runs/[id]/route.ts` (GET) | `app/api/etl-runs/[id]/route.ts` (new) | T3 | Auth via `getActiveWorkspace()`; pass workspace id to `getRunStatus(id)` filtered by `workspace_id` (RLS-safe even with service client by adding `.eq('workspace_id', ws.id)`); 404 if not found, 200 with `{ status, finished_at, error }`. <60 LOC | 30m |
| **T8** | `_data/get-last-refresh.ts` | `app/(app)/_data/get-last-refresh.ts` (new) | T3 | Server-side fetcher used by layout. Returns `{ finishedAt: Date \| null, ageMs: number \| null }` based on `getLastSuccessfulRun(ws.id)`. Uses RLS-aware `createSupabaseServerClient` (NOT service-role — header read goes through user session) | 20m |
| **T9** | `_components/refresh-button.tsx` (replace stub) | `app/(app)/_components/refresh-button.tsx` (replace) | T6, T7 | `"use client"`. States: idle / pending / cooldown / error. Click → `fetch('/api/refresh', {method:'POST'})`; on 202 store `etlRunId`, start polling `/api/etl-runs/${id}` every 5s; on terminal status (`success\|partial\|error`) call `router.refresh()` and show "Updated"; abort after 5min wall-clock; on 429 read `retryAfterMs`, render countdown "Cooldown 4m 12s", auto re-enable when timer hits zero. Use `AbortController` + `useEffect` cleanup. Polling uses `setTimeout` recursive (not `setInterval`) so we can abort cleanly. Initial cooldown derived from server response only — no client-only timer. <150 LOC | 60m |
| **T10** | Layout header label | `app/(app)/layout.tsx` (edit) | T8, T9 | Server-renders "Last refresh: Xm ago" from `get-last-refresh.ts` output (formatted via `formatRelativeTime` helper added to `lib/format.ts`). `<RefreshButton initialLastRefresh={iso} />` passes the timestamp as a serializable prop so client doesn't need to refetch on mount. After successful refresh `router.refresh()` re-renders layout → label updates | 30m |
| **T11** | Tests + smoke | `lib/github-dispatch.test.ts` (new), `lib/etl-runs.test.ts` (new), manual checklist | T2, T3, T9, T10 | Vitest unit: dispatch helper rejects on non-204 (mocked `fetch`), formats body correctly; cooldown helper math (boundary cases: 0ms, 4:59 ago, 5:01 ago). Manual: `pnpm dev`, click refresh → button shows "Refreshing…" → after ~30-60s shows "Updated just now" → spam-click → "Cooldown 4m 59s"; revoke PAT in env → click → "Dispatch failed" error toast | 45m |

**Total: ~5h** (estimate band 3.5-4h in parent plan; T9 polling state-machine is the cost driver).

---

## Sequencing Groups

### Wave 1 — Foundations (parallel, no shared files)
T1, T3 — independent. T2 depends on T1 (env names).

### Wave 2 — API layer (parallel after Wave 1)
T6 (needs T2 + T3) and T7 (needs T3) and T8 (needs T3) — distinct files, parallelizable.

### Wave 3 — UI layer (sequential)
T9 (needs T6, T7) → T10 (needs T8, T9 — edits `layout.tsx` once).

### Wave 4 — Verification
T11 last; runs after all code in.

### Critical path
T1 → T2 → T6 → T9 → T10 → T11 (~3.5h serial). T3, T7, T8 fan out in parallel slots; achievable in 4h with one dev if T9 stays disciplined.

---

## Resolved Decisions

### D1 — Dispatch type: `workflow_dispatch` (not `repository_dispatch`)
**Decision:** use `workflow_dispatch` against `daily-etl.yml`. Plan body conflated terms; overview is correct, title was wrong.
- **Why:** `daily-etl.yml` already declares `workflow_dispatch` with the `workspace_id` input we need. `repository_dispatch` would require workflow rewrite to listen on `on: repository_dispatch: types: [manual-etl]` — pure cost, zero benefit.
- **API:** `POST /repos/{owner}/{repo}/actions/workflows/daily-etl.yml/dispatches`.
- **Body:** `{ ref: env.GITHUB_WORKFLOW_REF || 'main', inputs: { workspace_id } }`. Do **not** send `since_date` — let workflow default (3 days ago) win; manual refresh is "catch up last 3 days", not arbitrary backfill.

### D2 — `trigger` value not sent from API
**Decision:** API does not pass `trigger`. The GHA workflow already computes `TRIGGER=manual` for `workflow_dispatch` events (line 59 of `daily-etl.yml`). Saves an unused input + avoids drift.
- **Implication:** API-inserted `etl_runs` row uses `trigger='manual'`; the ETL job will later upsert/update its own row also with `trigger='manual'`. We must not double-count — see D7.

### D3 — Polling: `setTimeout` recursion, not `setInterval`
**Decision:** `setTimeout`-based recursive poll inside `useEffect`, with `AbortController` cleanup.
- **Why:** `setInterval` fires regardless of in-flight request; `setTimeout` only schedules the next tick after the current one resolves. Cleaner abort semantics on unmount + on terminal status. 5-minute wall-clock cap via `Date.now()` start anchor; on cap, mark UI "Refresh timed out — check GitHub Actions" and stop polling.

### D4 — 429 response shape
**Decision:** `{ error: "cooldown", retryAfterMs: number }` body + `Retry-After: <seconds>` header.
- **Why:** `Retry-After` is the standard; `retryAfterMs` is for the client UI countdown (avoids a second math step). Client uses `retryAfterMs` for display, ignores header (header is for HTTP intermediaries). 429 status code is canonical for rate-limit.

### D5 — Service-role for `etl_runs` insert (not RLS write)
**Decision:** API route uses `createSupabaseServiceClient()` for the INSERT, but **only after** `getActiveWorkspace()` returns (which enforces auth + membership via RLS-aware client).
- **Why:** existing migration grants no INSERT policy on `etl_runs` for authenticated role (0002 comment line 270: "All other writes happen via service_role"). Adding an RLS write policy just for this is more code + new attack surface. The service-client write is gated by the prior membership check.
- **Hardening:** the service-role insert MUST use `workspace_id = ws.id` from `getActiveWorkspace()`, never from request body. Same rule as Phase 05.

### D6 — GH token: Fine-grained PAT
**Decision:** Fine-grained PAT, repo-scoped, `actions:write` only, 1y expiry.
- **Why:** classic PATs default 90d; fine-grained allows per-repo scope and longer expiry. Document rotation calendar reminder.
- **Storage:** Vercel project env (`Production` + `Preview` + `Development`) as `GITHUB_DISPATCH_TOKEN`. Never client-readable.

### D7 — `etl_runs` row ownership: API creates pending, ETL updates same row?
**Decision:** API inserts a pending row with `source='all', status='running'`, returns its `id`. **The ETL job does NOT touch this row.** The ETL inserts its own per-source rows (`source='shopify'`, `source='meta'`, etc.) as it already does today.
- **Why:** changing `etl/run-daily.ts` to find-and-update a pre-existing row is scope creep into Phase 03 territory and adds coordination risk (race: GHA queue delay > 30s, multiple manual clicks).
- **Polling correctness:** UI polls the row API created. UI marks "complete" when **either** (a) that row's status flips, OR (b) any newer row for this workspace with `started_at > apiRow.started_at AND status IN ('success','partial','error')` exists. The API insert is a placeholder/heartbeat; ETL completion is the source of truth.
- **Trade-off:** the API row may stay `status='running'` forever if GHA never starts (token revoked, repo disabled). Mitigated by 5-minute UI timeout and a future janitor job (Phase 07).

### D8 — Header label: server-rendered, refreshed on `router.refresh()`
**Decision:** Layout calls `getLastRefresh()` server-side; renders absolute timestamp into a `<time>` element + a tiny client component `<RelativeTime iso={…} />` that ticks every 30s for the "Xm ago" string. After successful refresh, `router.refresh()` re-runs the server component and updates the underlying timestamp.
- **Why:** keeps the source of truth on the server; client tick is purely cosmetic. Avoids polling layout from the client.

### D9 — Cooldown source-of-truth: DB query (server-side)
**Decision:** server queries `etl_runs` for last manual `started_at` within 5 min. Client never enforces cooldown — only displays the countdown returned in the 429 body.
- **Why:** plan mandates "Cooldown enforced server-side (DB query, not client state)". Local timer would be defeated by page reload. Initial render shows button enabled; first click hits the cooldown check authoritatively.

---

## Risk Register (delta from parent plan)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | GHA queue delay >30s before workflow row appears in `etl_runs` (parent R) → polling sees only the API placeholder row | High | Medium | D7 dual-condition completion detection (placeholder OR newer ETL row); 5-min wall-clock cap |
| R2 | PAT revoked / expired silently between cron runs | Medium | High | T6 catches dispatch error, marks API row `status='error', error=<msg>`; T11 manual smoke explicitly tests revoked-token path |
| R3 | Multiple users in same workspace clicking refresh simultaneously → 2 dispatches | Low | Medium | Cooldown DB check is read-then-write (TOCTOU). Acceptable for P1 — at worst a duplicate ETL run that idempotently upserts the same data (ETL is designed idempotent per Phase 03 docs). Document, do not fix |
| R4 | Service-role client used in `_data/get-last-refresh.ts` accidentally bypasses RLS | Low | High | T8 explicitly uses `createSupabaseServerClient()`. Code review checkpoint at T11: `grep "createSupabaseServiceClient" app/(app)/_data/` must be empty (matches Phase 05 R9) |
| R5 | `workflow_dispatch` `ref` defaults to non-existent branch in dev environments | Medium | Low | T1 documents `GITHUB_WORKFLOW_REF=main` default; throw early in `dispatchDailyEtl` if env undefined and no fallback. Preview deployments may need `GITHUB_WORKFLOW_REF` overridden to feature branch — note in README |
| R6 | Vercel function cold start adds 2-3s to dispatch latency → user perceives "stuck" before 202 | Medium | Low | T9 button shows "Refreshing…" the moment fetch starts (optimistic), not on response. Spinner masks the cold start |
| R7 | API placeholder row pollutes `etl_runs` query for `getLastSuccessfulRun` | Low | Medium | T3 `getLastSuccessfulRun` filters `status='success'` AND `finished_at IS NOT NULL`; placeholder is `running` so excluded |
| R8 | T9 component balloons past 200 LOC modularization rule | Medium | Low | Extract polling logic to `app/(app)/_components/use-etl-run-status.ts` hook if T9 hits 180 LOC. Add as T9a |

---

## Out-of-Scope Guard (DO NOT BUILD in Phase 06)

| Feature | Belongs to |
|---------|-----------|
| Onboarding wizard / first-run setup | Phase 07 |
| Email-on-failure for ETL runs | Phase 07 |
| Per-source retry buttons (only Shopify, only Meta) | Phase 07+ |
| Janitor cron to mark stuck `running` rows as `error` after 1h | Phase 07 |
| Toast notifications library (sonner / shadcn-toast) | Phase 07 |
| `since_date` arbitrary-date picker on refresh | out of P1 |
| WebSocket / SSE live status (vs polling) | out of P1 |
| Multi-workspace concurrent refresh dashboard | out of P1 |
| GH App auth (instead of PAT) | out of P1 |
| Rate-limit per-user (vs per-workspace) | out of P1 |
| Audit log UI for past manual refreshes | out of P1 |

**Rule:** if a ticket grows to include any of the above, stop and re-scope.

---

## Rollback Plan

Per-ticket atomic commits. Rollback = `git revert <sha>`.
- T9 (refresh-button replace) is the only **destructive** edit. Snapshot current `refresh-button.tsx` (the Phase 05 stub) to `.phase05-snapshot` before T9; delete after T11 passes. Revert restores stub.
- T10 (layout edit) is additive (label addition). Trivially revertable.
- No DB migrations in Phase 06 (T4 skipped). Zero schema risk.
- New files (T2, T3, T6, T7, T8): `git rm` reverts.
- Env vars: removing from Vercel is non-destructive (route just throws — same as before merge).

---

## Test Matrix

| Layer | Coverage | Tool |
|-------|----------|------|
| `lib/github-dispatch.ts` | success path (204), 401, 404, 422, network error | Vitest unit + mocked `fetch` |
| `lib/etl-runs.ts` | cooldown math: 0ms ago, 4:59 ago, 5:00 ago, 5:01 ago, no prior runs | Vitest unit + mocked Supabase client |
| `app/api/refresh/route.ts` | auth fail, cooldown 429, dispatch fail 502, success 202 | manual at T11 (Vitest with route handlers is heavy; defer) |
| `app/api/etl-runs/[id]/route.ts` | 404 on wrong workspace, 200 on own | manual at T11 |
| RefreshButton state machine | idle → pending → success; idle → 429 cooldown countdown; pending → timeout-after-5min | manual at T11 |
| End-to-end GH dispatch round-trip | click → row appears in `etl_runs` → workflow runs → status flips | manual at T11 |
| RLS guard | `grep "createSupabaseServiceClient" app/(app)/_data/` returns zero | manual at T11 |

**Required to ship:** dispatch + cooldown unit tests pass; T11 manual checklist all green; revoked-PAT path verified.

---

## File Ownership (no parallel-edit conflicts)

| File | Tickets | Single-owner? |
|------|---------|----------------|
| `.env.example` | T1 | yes (new) |
| `README.md` | T1 | yes (edit, env section only) |
| `lib/github-dispatch.ts` | T2 | yes (new) |
| `lib/etl-runs.ts` | T3 | yes (new) |
| `lib/format.ts` | T10 | yes (additive: `formatRelativeTime`) |
| `app/api/refresh/route.ts` | T6 | yes (new) |
| `app/api/etl-runs/[id]/route.ts` | T7 | yes (new) |
| `app/(app)/_data/get-last-refresh.ts` | T8 | yes (new) |
| `app/(app)/_components/refresh-button.tsx` | T9 | yes (replace stub) |
| `app/(app)/_components/use-etl-run-status.ts` | T9a (conditional) | yes (new, only if R8 triggers) |
| `app/(app)/layout.tsx` | T10 | yes (single edit) |
| `lib/github-dispatch.test.ts` | T11 | yes (new) |
| `lib/etl-runs.test.ts` | T11 | yes (new) |

No two tickets touch the same file simultaneously. T9 and T10 are sequential because T10 imports from T9.

---

## Success Criteria (measurable)

1. `pnpm build` exits 0; no TS errors.
2. Vitest: `lib/github-dispatch.test.ts` + `lib/etl-runs.test.ts` pass (≥8 cases total).
3. `pnpm dev` → click refresh → POST `/api/refresh` returns 202 with `etlRunId`.
4. New row visible in `etl_runs` with `trigger='manual', status='running'`.
5. GitHub Actions tab shows new "Daily ETL" run within 30s of click, with `workspace_id` input populated.
6. Within 60-90s, ETL run completes; UI auto-flips to "Updated just now"; KPIs update without manual reload.
7. Spam-click within 5 min → button shows "Cooldown 4m XXs" countdown; auto re-enables at 0.
8. With `GITHUB_DISPATCH_TOKEN` set to invalid value → click → UI shows "Dispatch failed: 401" within 2s; row in DB has `status='error'`.
9. Header "Last refresh: Xm ago" updates every 30s via client tick; jumps to "just now" after refresh completes.
10. `grep -r "createSupabaseServiceClient" "app/(app)/_data/"` returns zero matches.
11. Network tab: polling stops within 100ms of terminal status (no zombie requests).

---

## Unresolved Questions

1. **Janitor for stuck `running` rows** — D7 leaves placeholder rows orphaned if GHA never starts. Phase 07 should add a Supabase scheduled function to mark `running` rows older than 1h as `error`. Confirm with user this is acceptable for P1 ship.
2. **Repo owner/name source** — `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` as separate envs vs single `GITHUB_REPOSITORY="owner/repo"` string (matches GHA convention). Recommend the `owner/repo` form for parity; revisit at T1.
3. **Preview deployments** — Vercel preview branches dispatch against `ref=main` (production workflow), which may run ETL with prod tokens against the preview DB if envs leak. Recommend disabling refresh button in non-production via `process.env.VERCEL_ENV !== 'production'` check in T9. Confirm with user.
4. **Scout report failure** — parallel scout did not deliver to expected path; self-scout used instead. If scout report later lands with conflicting findings, reconcile before T1 starts.
