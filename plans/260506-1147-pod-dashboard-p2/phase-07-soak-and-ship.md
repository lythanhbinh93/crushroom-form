# Phase 07 — Soak + Ship (P2 release)

**Status:** pending · **Est:** 3-4h · **BlockedBy:** 01, 02, 03, 04, 05, 06 · **Blocks:** none

## Context Links
- Plan: [plan.md](plan.md)
- P1 ship gate: `plans/260504-1115-pod-brand-dashboard-p1/phase-07-polish-and-ship.md`

## Overview
End-to-end smoke matrix across both real brands + a temporary 3rd test brand. 1-week soak on daily cron with all phases live. Documentation + onboarding doc updates. Tag `v0.2.0`.

## Key Insights
- P1 ship gate worked — copy the structure.
- New tests: brand isolation (member of A cannot see B), 12mo data integrity, product P&L numbers reconcile.
- The riskiest single item is `getActiveWorkspace()` callsite coverage — phase-01's grep guard catches static cases; smoke catches dynamic ones.

## Requirements

### Functional
- Reconciliation: re-run `scripts/reconcile-pl.ts` for both brands × 30-day windows; ±1% gate.
- New `scripts/reconcile-product-pl.ts`: per-product totals match Shopify admin product report ±5% (looser bound — variants/refunds attribution is approximate).
- Manual smoke matrix executed (see below) and recorded in journal.

### Non-functional
- 1-week soak: zero `etl_runs.status = 'error'` rows across all workspaces.
- DB size logged daily; trend monotonically below 400 MB.
- Page latency: dashboard + products page p95 <1s.

## Smoke matrix

| # | Scenario | Expected |
|---|---|---|
| 1 | Owner of A logs in fresh | Sees A in switcher, no B |
| 2 | Owner of A,B logs in | Sees both; default = A (oldest) |
| 3 | Switch from A to B | KPIs change; URL stable; 200ms perceived |
| 4 | Owner of A invites user X (member of B) | X sees both A and B in switcher |
| 5 | Owner of A removes X | X loses A from switcher on next refresh |
| 6 | Trigger 12mo backfill on temp brand C | Completes <30 min, 365 daily_pl rows |
| 7 | DB size after temp brand C added | <450 MB (5-brand simulation) |
| 8 | Products page on Brand A | Top product matches owner intuition; ad spend coverage ≥30% |
| 9 | Map one ad manually | product_pl reflects next refresh |
| 10 | Member (non-owner) tries /settings/credentials | 403 / redirect |
| 11 | Member tries to switch to non-member workspace via curl | 403 |
| 12 | Cron fires for 5-workspace setup | Completes <15 min |

## Related Code Files

**Create:**
- `scripts/reconcile-product-pl.ts` — per-product CSV export for spreadsheet diff
- `docs/journals/26MMDD-pod-dashboard-p2-shipped.md`

**Edit:**
- `docs/pod-dashboard-onboarding.md` — add Section 11: "Inviting teammates", update Section 6: "12-month backfill option"
- `docs/system-architecture.md` — multi-brand switcher, product_pl matview, ad_product_map
- `README.md` (dashboard repo) — multi-brand mention
- `CHANGELOG.md` — v0.2.0 entry

**Delete:** none

## Implementation Steps
1. Wire `prune-snapshots.yml` to live cron 1 week before ship; verify 2 weekly runs clean.
2. Run reconcile.ts on Brand A + B, 30-day window. Fix any >1% deltas before proceeding.
3. Run reconcile-product-pl.ts on Brand A. Acceptable: ≥80% of products within ±5%; investigate outliers.
4. Execute smoke matrix; log results in journal.
5. Update onboarding + architecture docs.
6. Tag v0.2.0; deploy to Vercel prod; invite real second user (if not already).
7. Soak observation: daily check `etl_runs` + DB size for 1 week before declaring DONE.

## Todo
- [ ] reconcile-product-pl.ts
- [ ] Reconcile A 30d ±1%
- [ ] Reconcile B 30d ±1%
- [ ] Product reconcile A ±5%
- [ ] Smoke matrix 1-12 executed
- [ ] Onboarding doc updated
- [ ] Architecture doc updated
- [ ] CHANGELOG v0.2.0
- [ ] Tag + deploy
- [ ] 1-week soak clean

## Success Criteria
- All 12 smoke matrix items pass.
- 30-day P&L reconcile within ±1% on both real brands.
- Per-product P&L within ±5% on Brand A.
- 1-week soak: zero error rows in `etl_runs`.
- DB size <400 MB at end of soak.
- v0.2.0 tagged.

## Risks
- **5-brand simulation breaks free tier:** if temp brand C pushes DB > 500 MB, abort and revisit phase-02 prune logic. Worst case: defer 5-brand support to P3.
- **Product reconcile fails ±5% widely:** likely cause is missing variant cost map; iterate on missing-cogs surfacing rather than blocking ship.
- **Member invite finds bug in RLS:** treat as P0; do not ship.

## Security
- Final RLS audit: `psql` query enumerates every table, asserts RLS enabled + policies present.
- No service-role usage in `app/` (codified in phase-01 grep guard; verify still passes in CI).

## Next Steps
P3 candidates (do not start in P2):
- Anomaly detection (alert if today's net profit < 50% of 7-day median)
- Customer LTV view
- Mobile-first redesign
- Competitor research integration
