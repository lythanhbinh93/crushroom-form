# Phase 5 — Status Board, Polish, Retire Streamlit, Docs

## Context Links
- `app.py` (RETIRE target — replaced by P3 reconcile + P4 package gen)
- `index.html` — staff homepage card grid (add Fulfillment card)
- `README.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/project-roadmap.md` (update)

## Overview
- **Priority**: P2. **Status**: pending. **Depends**: P1-P4 working.
- Make the platform the daily driver: status board over the order lifecycle, UX polish, retire the Streamlit app, automate the orders-sync trigger, update docs.

## Key Insights
- The full loop already works after P4 (manual sync). P5 = adoption + housekeeping, not new core capability (YAGNI: no extra features beyond what CS actually needs to run a shift).
- Streamlit retirement is safe ONLY once P3+P4 produce byte-identical filenames + equivalent supplier packages (verified in P3/P4 success criteria). Keep `app.py` in repo but unlink from homepage; delete Streamlit Cloud deploy.
- Add the time-driven `syncOrders` trigger here (after P1 manual sync proven) so CS sees fresh PULLED orders without clicking. **No products sync** — there is no Products cache.

## Requirements
**Functional**
- Status board: counts + filterable lists across the lifecycle — Orders `fulfill_status` (`synced` / `reconciling` / `ready` / `batched` / `cancelled`) + the UploadGroup chase list (`awaiting_upload` / `uploaded`). CS sees workload at a glance. The P4 queue tabs are the working surface; this board is the aggregate roll-up over the same statuses. Surface **`synced` not yet reconciled** (pulled order, photos available) as the primary CS queue and **UploadGroup `awaiting_upload`** (link sent, no photos) as the chase list. Make the **two-sided waiting** visible: orders synced but with no matched UploadGroup yet, and UploadGroups uploaded but with no matched pulled order yet.
- Time-driven orders-sync trigger, with "sync running" guard + last-sync timestamp shown.
- Homepage: add "Fulfillment" card; mark Photo-Naming-Helper card retired/removed.
- Docs updated to reflect new component + endpoints + data flow.

**Non-functional**
- Vietnamese UI consistent with existing B&W/admin styling.
- No regression to customer photo upload (`google-apps-script-complete.js` untouched / isolated).

## Architecture
```
Time trigger → syncOrders (guard: skip if running) → Orders mirror fresh (pulled from Poscake)
fulfillment.html → status board (Orders by fulfill_status: synced|reconciling|ready|batched|cancelled
                   + UploadGroups by status: awaiting_upload|uploaded + two-sided-waiting view) + last-sync time
index.html → Fulfillment card (replaces Streamlit link)
```

## Related Code Files
**Modify**: `assets/fulfillment.js` + `fulfillment.html` (status board view, last-sync display). `index.html` (card swap). `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/project-roadmap.md`, `README.md`.
**GAS**: add `ScriptApp.newTrigger('syncOrders')` time-driven; add `lastSyncAt` to `scriptProp`; expose via `whoami`/status endpoint.
**Retire**: unlink `app.py` from `index.html`; remove Streamlit Cloud deploy (keep file in repo, note retired in README).

## Implementation Steps
1. Build status board (group Orders by the 5-value `fulfill_status` enum + UploadGroups by status; counts + drill-in; `synced`-not-reconciled as primary CS queue, UploadGroup `awaiting_upload` as chase list, plus a two-sided-waiting panel — wording aligned to the P4 queue tabs).
2. Show last-sync timestamp + manual "Đồng bộ" still available.
3. Install time-driven `syncOrders` trigger + "sync running" flag guard.
4. Swap homepage card; mark Streamlit retired.
5. Update docs: architecture diagram (add Poscake→GAS→Sheets fulfillment lane: pull orders, reconcile photos, write back tag/note/link), endpoint table, data-flow, roadmap status.
6. Final regression check: customer upload via `couplepix.html` still works; photos still searchable; no shared-state breakage between the two GAS projects.

## Todo List
- [ ] Status board (Orders by 5-value fulfill_status enum + UploadGroups by status + two-sided-waiting; counts + filter; wording aligned to P4 queue tabs)
- [ ] Last-sync timestamp + manual sync retained
- [ ] Time-driven orders-sync trigger + running-guard
- [ ] Homepage card swap + Streamlit retire note
- [ ] Update README + docs/ (architecture, codebase-summary, roadmap)
- [ ] Regression: customer upload + photo search unaffected

## Success Criteria
- CS runs an entire shift from `fulfillment.html` (no Streamlit, no manual Drive renaming).
- Pulled orders auto-appear within one trigger interval of `syncOrders`.
- Docs reflect the new component (pull/reconcile/writeback model); a new dev can trace the full loop from `docs/system-architecture.md`.
- Customer upload + admin photo search regression-clean.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|-----------|
| Auto-sync quota/exec creep over time | M×M | Conservative interval; only sync recent/open orders if P0 server-filter works; monitor |
| Streamlit retired before parity proven | L×H | Gate retirement on P3/P4 byte-identical-filename success criteria; keep app.py recoverable in repo |
| Two GAS projects drift on shared sheet schema | L×M | Document shared "form data" contract; fulfillment project READ-ONLY on "form data" |
| Trigger double-fires overlapping sync | L×M | "sync running" flag in scriptProp + LockService |

## Security Considerations
- Status board behind `requireRole_`.
- Trigger runs as script owner — ensure no PII leaks to logs.
- Confirm retiring Streamlit removes any exposed GAS URL in `app.py` from public Streamlit Cloud.

## Next Steps
Platform live. Future (out of scope, YAGNI now): webhooks instead of polling (if P0 found them), R2/Drive archival, batch-level supplier email automation.
