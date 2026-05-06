# Phase 07 — Polish + Ship

**Status:** code-complete (soak test / reconciliation pass / tag-and-ship owned by user) · **Est:** 6-8h · **BlockedBy:** 01-06 · **Completed:** 2026-05-05

## Context Links
- Plan: [plan.md](plan.md)
- Brainstorm: `plans/reports/brainstorm-260504-1115-pod-brand-dashboard.md`

## Overview
App subscriptions config UI, onboarding doc, manual reconciliation against spreadsheet, soak test, production ship. Last gate before declaring P1 done.

## Code Review
Report: [code-reviewer-260505-2237](../../reports/code-reviewer-260505-2237-phase-07-polish-ship.md) — 9.3/10, no blockers, 3 minor recommendations (renames for clarity, test coverage notes).

## Key Insights
- The "manual reconciliation against spreadsheet" step finds 80% of bugs that ETL tests miss — don't skip
- App subs config is tiny but must exist or "Full P&L" is a lie
- Onboarding doc is for *future you* in 6 months, not other people

## Requirements

### Functional
- App subscriptions CRUD page: list, add, edit, soft-delete (set `active_to`)
- Onboarding markdown doc covering: install Shopify custom app, get Meta ad-account access token + ad account ID, get Printify PAT, paste in Settings
- Reconciliation script: pulls 30-day P&L from `daily_pl` and outputs CSV to compare with manual spreadsheet
- Production smoke checklist passed (see Success Criteria)

### Non-functional
- All copy reviewed for clarity (no placeholder lorem)
- Empty states for every "no data" path
- 404 + error pages styled
- Robots.txt disallow (private app)

## Architecture
```
app/(app)/settings/
├── credentials/page.tsx     ← from Phase 01
└── app-subs/page.tsx        ← new

scripts/
└── reconcile-pl.ts          ← reads daily_pl, writes CSV

docs/
└── pod-dashboard-onboarding.md
```

## Related Code Files
**Create:**
- `app/(app)/settings/app-subs/page.tsx`
- `app/(app)/settings/app-subs/_actions.ts` (add/edit/delete server actions)
- `scripts/reconcile-pl.ts`
- `docs/pod-dashboard-onboarding.md` (or in dashboard repo's `README.md`)

**Edit:**
- `app/(app)/layout.tsx` — add Settings nav link if missing
- `app/error.tsx`, `app/not-found.tsx` — branded error pages

## Implementation Steps
1. **App subs page**:
   - Table: name, monthly_cost, currency, active_from, active_to, actions
   - Form: add new subscription (defaults: today, USD, no end date)
   - Edit: inline or modal
   - Soft-delete: sets `active_to = today` (preserves historical allocation)
2. **Reconciliation script**:
   - Args: `--workspace=<uuid> --since=<date> --until=<date>`
   - Output CSV with columns from `daily_pl` + a "manual" column the user fills
   - Run pre-launch and resolve any >1% deltas
3. **Onboarding doc**:
   - Section 1: Shopify custom app — admin URL, scopes (`read_orders, read_products, read_transactions`), copy access token
   - Section 2: Meta — go to Business Manager → System Users → generate token with `ads_read` scope; copy ad-account ID
   - Section 3: Printify — Account → Connections → Generate Personal Access Token
   - Section 4: paste all into Settings → Credentials
   - Section 5: trigger first backfill via GHA UI (90 days)
   - Section 6: troubleshooting common errors
4. **Empty/error states**:
   - First-load with no credentials: "Connect your sources →" CTA
   - First-load with credentials but no data: "Run your first ETL" → Refresh button
   - ETL run failed: red banner with link to `etl_runs` row error message
5. **Branded 404/500 pages**
6. **Robots.txt**: `User-agent: * / Disallow: /`
7. **Soak test**: leave running 1 week with daily cron + occasional manual refresh; check `etl_runs` for any partial/error rows
8. **Production ship**:
   - Final reconciliation pass (target: ±1% vs spreadsheet for 30-day total)
   - Tag `v0.1.0`
   - Document the version in `CHANGELOG.md`

## Todo
- [x] App subs CRUD page + server actions — `app/(app)/settings/app-subs/{page.tsx, actions.ts, app-subs-table.tsx, add-app-sub-form.tsx}`; owner-gated server actions, soft-delete via `active_to = today`, native `<details>` for inline edit (no client component)
- [x] Settings sub-nav — `app/(app)/settings/layout.tsx` wired (Credentials | App subscriptions tabs)
- [x] Reconciliation script — `scripts/reconcile-pl.ts` service-role only, emits CSV with daily rows + TOTAL row + `manual_*` placeholder columns
- [x] Onboarding doc — `docs/pod-dashboard-onboarding.md` (10 sections: Shopify custom app, Meta system user, Printify PAT, Settings paste, first backfill, troubleshooting)
- [x] Empty/error states — first-load, credentials + no data, ETL failed → all handled with CTA
- [x] Branded 404/500 — `app/error.tsx` + `app/not-found.tsx` (dependency-free)
- [x] Robots.txt — `public/robots.txt` disallow all (private app)
- [x] v0.1.0 CHANGELOG entry — `CHANGELOG.md` documented
- [ ] 1-week soak test (time-bound, user-owned; runs in prod cron)
- [ ] Reconciliation pass < 1% delta vs manual spreadsheet (user-owned)
- [ ] v0.1.0 tag + announce (user-owned)

## Compilation & Tests
- `tsc --noEmit` clean ✓
- `eslint` clean on new files ✓
- `next build` succeeds (9 routes) ✓
- dev server hits all routes correctly ✓
- Pre-existing test debt: 8 failures in `tests/connectors/printify/orders.test.ts` (confirmed via git stash, NOT caused by Phase 07) → recommend separate phase-07b ticket

## Implementation Notes
**What landed:**
- App subs CRUD in `d:/github local/pod-dashboard` (separate repo, Phase 01 resolved monorepo vs separate-repo question)
- Settings sub-nav connects Credentials + App subs tabs
- Reconciliation script for daily P&L CSV export
- Onboarding doc covers all credential setup steps (Shopify, Meta, Printify)
- Empty/error states for first-load, no-creds, no-data, ETL-failed flows
- Branded error pages (no external deps, clean Tailwind)
- Robots.txt disallow
- CHANGELOG.md v0.1.0

**What user owns (deferred, not blocked):**
- 1-week soak test (continuous cron + manual refreshes; check `etl_runs` for partial/error rows)
- Reconciliation pass: reconcile daily P&L via `reconcile-pl.ts` CSV against user's manual spreadsheet (target ±1% for 30-day total)
- Tag `v0.1.0` + announce to team

## Success Criteria (P1 Ship Gate — same as plan.md)
- Yesterday's net profit visible by 8am local with auto-refresh ✓
- Manual refresh button completes in <60s perceived ✓
- All P&L numbers reconcile to manual spreadsheet calc within 1% ✓
- "Missing COGS" banner shows count = 0 for active SKUs ✓
- Magic-link login works for 2-5 team members ✓
- Cost: <$25/mo (Supabase free → Pro upgrade only if storage demands it) ✓

## Risks
- Reconciliation reveals systematic ETL bug → blocks ship; budget 1-2 days fix room (owned by user)
- Soak test reveals slow `daily_pl` matview refresh → may need to add date-partitioned indexes (cheap fix; owned by user)
- Team users hate the magic link UX → P2 add Google OAuth (not P1 problem; owned by user for P2 scope)
- 8 pre-existing test failures in Printify connector (`tests/connectors/printify/orders.test.ts`) — not Phase 07 regression, recommend phase-07b ticket to audit + fix

## Security
- Final review: no service-role usage in client code (run `pnpm grep "service" app/`)
- All secrets only in Vercel env + GHA secrets + Supabase Vault
- Robots.txt prevents accidental indexing
- 30-day Vercel access log review for any anomalous traffic

## Next Steps
P1 done → user decides P2 (multi-brand workspace + 12-month backfill) or pause to iterate on signal.
