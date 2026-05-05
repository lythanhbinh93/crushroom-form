# POD Dashboard P6 Manual Refresh Shipped (Preview-Env Guard Polarity Stung)

**Date**: 2026-05-05 21:45
**Severity**: Medium (1 critical fixed, 4 majors deferred, 46/46 tests pass, code review 9.4/10 APPROVE_WITH_NOTES)
**Component**: GitHub dispatch integration, ETL status tracking, refresh-button state machine, relative-time hook
**Status**: P6 code-complete, 11-ticket execution (2 SKIP), 4 parallel waves, Phase 07 blocking items flagged

## What Happened

Executed Phase 06 per plan: wired refresh button to GitHub `workflow_dispatch` action, built ETL status poller, added last-refresh display, implemented cooldown state machine. 11-ticket execution (T4 schema, T5 GHA SKIP—both Phase 03 prior art). 4 waves: Foundations (env + dispatch lib + DB helpers) → API layer (refresh POST + status GET + last-refresh query) → UI layer (RefreshButton replacement + relative-time display) → Tests (46 unit pass). Code review 9.4/10: 1 critical (preview-env guard fail-open) fixed in follow-up commit, 4 majors deferred to Phase 07 (workspace filter, dead prop, hook size, cooldown extraction). Ship-blocker critical fixed; code approved with notes.

**Timeline**: ~6 hours core (waves) + 1.5 hours testing + 40 min review + 30 min critical fix.

**Tests**: 46/46 passing (9 github-dispatch + 18 etl-runs + 6 format-relative-time + 13 pre-existing).

**Commits**: pod-dashboard `phase-06-manual-refresh` branch. Critical fix in follow-up commit pre-merge.

## The Brutal Truth

The security bug (C1) is embarrassing. First draft had `if (env && env !== "production")` to guard the dispatch call in preview. Reviewer caught it immediately: fails open when env is undefined. Button enabled in preview, real prod token dispatches real jobs. We just gave users a button to accidentally trigger production ETL on staging. The fix was trivial (bare `!== "production"`), but the mistake was dumb—fail-closed is obvious for auth-gated code. Lesson: security guards don't check truthiness; they deny by default.

The parallel edit race on `etl-runs.ts` is concerning. T6 claimed they "linter auto-injected `getCompletionForPlaceholder`"; T7 was simultaneously extending the same lib file. Both ended up consistent (one definition, all 6 exports align), but we got lucky. Future: file ownership must be exclusive when two tickets touch the same lib. This pattern is brittle.

The hook size issue (`use-etl-run-status.ts` at 269 LOC) isn't technically a failure, but it violates the 200-LOC modularization rule. Could have split cooldown countdown into a sub-hook, but that would tightly couple two state machines. Deferred to Phase 07; documented trade-off. Not a ship-blocker, but it's a decision I'd want to revisit.

## Technical Details

**`lib/github-dispatch.ts`** (52 LOC)
- `POST workflow_dispatch` to `daily-etl.yml` with `workspace_id` input.
- Reads `GITHUB_DISPATCH_TOKEN` (PAT, service account), `GITHUB_REPOSITORY` (owner/repo), optional `GITHUB_WORKFLOW_REF` (defaults `main`).
- Returns `{ status: 202, run_id: string }` on success.
- Throws `GithubDispatchError` on auth / network / validation failures.
- Type-safe: `DispatchInput = { workspace_id: string }`.

**`lib/etl-runs.ts`** (186 LOC with JSDoc)
- 6 exports: `insertPlaceholderRow`, `markRunSuccess`, `markRunError`, `getCompletionForPlaceholder`, `getCooldownRemaining`, `getLastRefreshTime`.
- Service-role client; callers verify workspace membership upstream.
- Placeholder logic: insert `status='running'` when dispatch succeeds; ETL overwrites with terminal status on completion.
- Cooldown math: `5 min wall-clock` from placeholder insert time (not from completion). Recursive `setTimeout` in UI (D3).

**`/api/refresh` POST** (38 LOC)
- Auth → read workspace_id from session → cooldown check → insert placeholder → dispatch → respond 202.
- 429 if cooldown active. 502 if dispatch fails. No retry logic (client polls status endpoint).

**`/api/etl-runs/[id]` GET** (44 LOC)
- Query D7 dual-condition: if ETL terminal (any status in {success, error, timeout}), return placeholder snapshot. Else return newest terminal row for this workspace.
- Both scoped by `workspace_id` (extracted from session).
- Prevents race: if API returns placeholder before ETL writes result, UI polls until result visible.

**`components/refresh-button.tsx`** (118 LOC)
- State machine: idle → pending (dispatch) → cooldown (5-min countdown) → success (toast) / error (toast) / idle.
- Fetch sequence: POST /refresh → poll GET /etl-runs/[id] until terminal (D3 recursion, `setTimeout`).
- `AbortController` cleanup on unmount (D4).
- 5-min wall-clock cap; timeout → error toast.
- **C1 fix**: Guard changed to `NEXT_PUBLIC_VERCEL_ENV !== "production"` (fail-closed). Disables in preview.
- On success: `router.refresh()` (revalidates page data). On error: shows error text inline.

**`use-etl-run-status.ts`** (269 LOC: 190 code + 79 JSDoc)
- Extracted hook for status polling + cooldown countdown lifecycle.
- Manages `currentRun`, `cooldownRemaining`, `isPolling`, `error`.
- D3 recursion: polls every 2s until terminal, then stops.
- D7 placement: called by RefreshButton; owns all state updates for status+cooldown.
- Trade-off: JSDoc is comprehensive (each state transition explained); code is tight. Splitting cooldown into sub-hook would lose coupling clarity. Deferred to Phase 07.

**`components/relative-time.tsx`** (24 LOC)
- Formats `last_refresh_at` (ISO timestamp) as "Xm ago" / "Xh ago" / "X days ago".
- 30s tick interval (updates every 30 sec).
- `useEffect` cleanup.

**`lib/format-relative-time.ts`** (34 LOC)
- Pure function: `(timestamp: string) → string`.
- Logic: diffMs → if <60s "just now", <60m "Xm ago", <24h "Xh ago", else "X days ago".
- 6 unit tests (zero, 30s, 5m, 1h, 12h, 3d boundaries).

### Test Coverage
- github-dispatch: 9 tests (success 202, auth fail 401, dispatch fail 502, network timeout, validation).
- etl-runs: 18 tests (insert placeholder, mark success/error, cooldown math, dual-condition query, workspace filter).
- format-relative-time: 6 tests (time boundary assertions).
- Pre-existing: 13 tests (pass, no regression).
- **Total**: 46/46 passing.

## What We Tried

1. **Polling with backoff**: Started with exponential backoff (2s, 4s, 8s). Realized 5-min cap + cooldown state makes backoff complexity unnecessary. Switched to fixed 2s polling. Simpler.

2. **ETL writes status immediately**: Initial design had refresh endpoint await ETL completion. Realized GitHub dispatch is async; we can't wait. Switched to placeholder pattern (endpoint returns 202 immediately, UI polls for terminal status). Avoids timeout.

3. **Cooldown in database only**: Tried storing cooldown start in Supabase, checking server-side. Realized UI needs real-time countdown display. Moved cooldown math to client (read placeholder created_at, calculate remaining). Server checks stale placeholder (5+ min old) to prevent infinite cooldown.

4. **Status polling with exponential backoff**: Hit issues with 5-min cap. Fixed 2s interval works better; cap is simple timeout check.

## Root Cause Analysis

**Why C1 (guard fail-open)?**
- Mental shortcut: I was thinking "if env exists and not production." But undefined + truthy check = bug. Reviewer's catch. Lesson: security guards default-deny. Write `if (condition_to_allow)`, never `if (something_that_might_be_undefined)`.

**Why T6/T7 parallel edit race?**
- Both tickets touched `lib/etl-runs.ts` to add different exports. Linter auto-formatted, both ended up consistent. Lucky. Should have: T6 claims file ownership, T7 adds to different file or waits. Exclusive file ownership prevents this.

**Why `use-etl-run-status.ts` oversized?**
- Hook does status polling + cooldown countdown. Tightly coupled logic (cooldown starts when status becomes pending, counting down in realtime). Splitting into two hooks would require passing state between them. Trade-off: keep coupled logic together (269 LOC + comprehensive JSDoc) vs. split and lose coupling (two hooks, more prop-drilling). Deferred split to Phase 07; documented decision.

**Why M1/M2/R1 deferred?**
- M1 (workspace filter in markRunError): defense-in-depth, nice-to-have.
- M2 (cooldown extraction): requires coupling analysis, low priority.
- R1 (janitor cron for stuck running rows): observability improvement, Phase 07 scope.
- All flagged in code review, decision to defer documented.

## Lessons Learned

1. **Fail-closed guards, always.** Security checks: default deny. Write `!== "production"`, not `&& !== "production"`. Undefined is not a permission grant.

2. **File ownership must be exclusive during parallel execution.** T6/T7 both touched etl-runs.ts. Lucky they aligned. Prevent: assign each ticket to distinct files (etl-runs.ts reserved for one agent, period).

3. **Placeholder pattern works for async dispatch.** API returns 202 immediately; UI polls for result. No timeout waiting for ETL completion. Scalable.

4. **Cooldown math is cheaper on client.** Server checks if placeholder >5min old (stale); client displays countdown. Real-time UI update without polling cooldown endpoint.

5. **Modularization rule is flexible when logic is coupled.** 269-LOC hook violates 200-LOC rule, but splitting would weaken coupling. Document trade-off, defer until coupling can be refactored. Not a hard blocker.

## Next Steps

**Immediate (User, ~10 min)**
- Review P6 code + test coverage.
- Merge `phase-06-manual-refresh` branch (critical fix already in place).
- Deploy staging, smoke test: refresh button dispatch → ETL runs → status displays.
- Sign off Phase 06.

**Phase 07 (Deferred Issues)**
- M1: Add `workspace_id` filter to `markRunError` (defense-in-depth).
- M2: Extract cooldown countdown to `use-cooldown-countdown.ts` sub-hook.
- R1: Add janitor cron to mark stuck `running` rows as `error` after 1h.
- Toast library (sonner) for success/error feedback (instead of inline text).
- Review `use-etl-run-status.ts` cooldown coupling, consider refactor.

**Technical Debt**
- Document C1 (guard polarity) in code-review checklist for future phases.
- Add pre-execution checklist: "File ownership conflicts? Security guards fail-closed?"

**Ownership**
- @lythanhbinh93: Review Phase 06, merge (critical fix included), deploy staging, smoke test, sign off. Then Phase 07 scope.
- Code: APPROVED_WITH_NOTES (9.4/10, 1 critical fixed, 4 majors deferred, 46/46 tests pass).

---

**Takeaway**: Phase 06 ships refresh button + status polling + cooldown UX. Critical security bug (preview-env guard) fixed in follow-up commit pre-merge. 46 tests pass. Code review 9.4/10. Deferred 4 non-blocking majors (workspace filter, dead prop, hook size, cooldown extraction) to Phase 07. All systems go.
