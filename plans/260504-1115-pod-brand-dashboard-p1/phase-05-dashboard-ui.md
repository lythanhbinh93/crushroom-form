# Phase 05 — Dashboard UI

**Status:** completed · **Est:** 12-15h · **BlockedBy:** 03 (data) · **Blocks:** 06 (refresh button lives here)

**Completed:** 2026-05-05 · 20-ticket execution complete; smoke + code review pass. See [scout-260505-1903](../reports/scout-260505-1903-pod-dashboard-phase-05.md) + [code-reviewer-260505-1903](../reports/code-reviewer-260505-1903-pod-dashboard-phase-05.md).

## Context Links
- Plan: [plan.md](plan.md)
- Brainstorm: `plans/reports/brainstorm-260504-1115-pod-brand-dashboard.md` — see ASCII layout
- Tremor docs: https://tremor.so/docs

## Overview
Build the single-brand desktop layout from the ASCII mock: hero net-profit card, 5 supporting KPIs, 30-day trend chart, P&L breakdown, attribution check, missing-COGS alert, date selector. Server-rendered. Reads from `daily_pl` matview only.

## Key Insights
- Single source: `daily_pl`. UI does no joins. Performance trivial.
- Server components for data fetch; client components only for interactive bits (date picker, refresh button)
- Tremor handles 90% of the chart/card visuals; Recharts only if Tremor falls short
- Date range presets cover 95% of clicks; custom range is escape hatch
- Default Tailwind responsive collapses 3-col grid → 1-col on mobile, "good enough" for P1

## Requirements

### Functional
- Date range presets: Today, Yesterday, Last 7d, MTD, Last 30d, Custom
- Default load: Yesterday
- Hero card: Net Profit (current period) + delta vs prior equivalent period
- 5 supporting cards: Revenue, Ad Spend (with ROAS), COGS (with % of revenue), Fees, Margin %
- 30-day daily-net-profit line chart with revenue + ad-spend overlays
- P&L breakdown panel: revenue → fees → COGS → app subs → refunds → ad spend → net (waterfall or list)
- Attribution check panel: Meta-reported orders/$ vs Shopify-UTM orders/$, divergence % flagged when >15%
- Missing-COGS alert: count of active Shopify variants with no Printify cost map
- Header: workspace name, refresh button (Phase 06), user email

### Non-functional
- TTFB <500ms on Vercel for cached daily_pl row
- Lighthouse perf >85 on dashboard page
- All numbers formatted in user locale, currency from workspace row

## Architecture
```
app/(app)/
├── layout.tsx                ← header, auth guard, workspace context
├── page.tsx                  ← dashboard (server component)
├── _components/
│   ├── date-range-picker.tsx (client)
│   ├── kpi-card.tsx
│   ├── hero-net-profit.tsx
│   ├── trend-chart.tsx        (client; Tremor LineChart)
│   ├── pl-breakdown.tsx
│   ├── attribution-check.tsx
│   ├── missing-cogs-alert.tsx
│   └── refresh-button.tsx     (client; Phase 06)
└── _data/
    ├── get-pl-summary.ts      ← reads daily_pl, sums for range
    ├── get-pl-trend.ts        ← reads 30 days of daily_pl
    ├── get-attribution.ts
    └── get-missing-cogs.ts    ← joins shopify_products + printify_products
```

## Related Code Files
**Create:** all files under `app/(app)/` per tree above.
**Read:** `lib/supabase/server.ts` (from Phase 01), `daily_pl` (from Phase 03).
**Edit:** `app/(app)/layout.tsx` if it exists from Phase 01.

## Implementation Steps

### Data layer
1. `_data/get-pl-summary.ts`:
```ts
async function getPlSummary(workspaceId: string, since: Date, until: Date) {
  // SUM all numeric cols where workspace_id=$1 and date BETWEEN $2 AND $3
  // Returns single row aggregate
}
```
2. `_data/get-pl-trend.ts`: returns array of 30 daily rows for line chart
3. `_data/get-attribution.ts`: returns Meta-reported vs Shopify-UTM totals + divergence
4. `_data/get-missing-cogs.ts`: returns count of active Shopify products lacking matching Printify product

### Components
5. `kpi-card.tsx`: title, value, delta, icon. Tremor `Card` + `BadgeDelta`.
6. `hero-net-profit.tsx`: bigger card with sparkline. Tremor `Card` + `SparkAreaChart`.
7. `date-range-picker.tsx`: Tremor `DateRangePicker` + preset buttons. State synced to URL search params.
8. `trend-chart.tsx`: Tremor `LineChart`, three series.
9. `pl-breakdown.tsx`: simple table or Tremor `BarList` with positive/negative bars.
10. `attribution-check.tsx`: side-by-side numbers + divergence callout.
11. `missing-cogs-alert.tsx`: red banner when count > 0.

### Page composition
12. `app/(app)/page.tsx`:
```tsx
export default async function Dashboard({ searchParams }) {
  const range = parseRange(searchParams);  // default Yesterday
  const wsId = await getActiveWorkspaceId();
  const [summary, trend, attribution, missing] = await Promise.all([
    getPlSummary(wsId, range.since, range.until),
    getPlTrend(wsId, range.until),
    getAttribution(wsId, range.since, range.until),
    getMissingCogs(wsId),
  ]);
  return <DashboardLayout summary={summary} trend={trend} attribution={attribution} missing={missing} range={range} />;
}
```
13. Wire date picker → URL param → page re-render
14. Empty state: if no `daily_pl` rows yet → "Run your first ETL" CTA pointing at Phase 06 refresh button

## Todo
- [x] Data fetchers (4 files)
- [x] KPI card + hero
- [x] Date range picker (URL-synced)
- [x] Trend chart
- [x] P&L breakdown
- [x] Attribution check
- [x] Missing-COGS alert
- [x] Page composition
- [x] Empty state
- [x] Visual review against ASCII mock
- [x] Lighthouse pass

## Success Criteria
- Open dashboard → numbers match `daily_pl` row for yesterday
- Date range change → numbers update, URL updates
- Trend chart shows last 30 days, 3 lines
- Attribution panel shows divergence when present
- Missing-COGS alert hidden when count = 0
- Looks "good enough" on mobile (single column)

## Risks
- Tremor v3 has breaking changes from v2; pin major version
- 30 days × 3 series chart may look noisy → consider weekly smoothing toggle (not P1)
- Currency formatting bugs across locales → use `Intl.NumberFormat` with workspace currency

## Security
- All `_data/*` functions take `workspaceId` from authenticated session, never from client input
- RLS policies on `daily_pl` enforce workspace_id match (read-only policy: member can SELECT)
- `service-role` client never used in app routes; only ETL

## Next Steps
Phase 06 wires the refresh button to GHA. Phase 07 polishes + onboarding docs.

## Follow-ups (deferred)

Code review (9.6/10) surfaced two minor findings for future iteration:
- **workspace.timezone** — stored but unused in date display. Revisit if users report off-by-one date issues after first week of live usage.
- **getMissingCogs cold-start edge case** — returns 0 when Printify is empty (masks real unmatched product count). Surface "Printify not connected" banner in Phase 06 onboarding rather than a misleading count.

Nine additional minor nits documented in [code-reviewer-260505-1903 report](../reports/code-reviewer-260505-1903-pod-dashboard-phase-05.md) (M1–M7 scope: DRY extraction, formatting consistency, redundant RPC calls). Accept-as-is per YAGNI; lift to follow-up if code touches those areas.
