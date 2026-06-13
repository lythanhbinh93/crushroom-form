---
phase: 3
title: "Meta ETL Extension and Summary Tiles"
status: code-complete
priority: P1
effort: 12-16h
dependencies: [phase-02-shell]
owns_migrations: [0018]
---

> **Code-complete 2026-06-13.** Migration renumbered 0019→**0018** (next free on disk; phase 01 not yet built). All code shipped on branch `claude/add-photo-upload-tool-p3dI0` (pending push to main → Vercel). Gates: tsc clean, eslint 0 errors, vitest 412/412, `npm run build` ✓. Adversarial review: no Critical/High; M1 (partial-backfill spark zero-fill) fixed by dropping null per-day points. USER-OWNED REMAINING: apply migration 0018 to Supabase + trigger the trailing-90-day Meta backfill — until then Link-clicks + CPC tiles render "—".

# Phase 3: Meta ETL Extension and Summary Tiles

## Overview
Build the Summary page tile grid (4 fixed sections: Blended / Store-Shopify / Meta / Fulfillment-Printify) with value + vs-previous-period delta + sparkline per tile, plus a compare toggle. Extend Meta ETL only for the one missing field (`inline_link_clicks`); CPM/CPC/CTR are computed in-query, not stored.

## Key Insights
- **VERIFIED (re-grepped):** `meta_ad_insights_daily` already stores `impressions` + `clicks` (both `bigint`) — `supabase/migrations/0002_etl_schema.sql:119-120`. CPM/CPC/CTR are NOT stored (scout §1 confirmed). Compute downstream: `CPM=spend/impressions*1000`, `CPC=spend/clicks`, `CTR=clicks/impressions*100` (guard div-by-zero). DO NOT materialize — avoids stale aggregates (researcher-02 §1, scout §7).
- **VERIFIED:** `INSIGHT_FIELDS` (`lib/connectors/meta/insights.ts:70-84`) requests `spend, impressions, clicks, actions, action_values` — but NOT `inline_link_clicks`. "Link clicks" tile needs this field added to the ETL pull + a new column (migration 0019) + historical backfill via insights `time_range`.
- **Column is NULLABLE (`bigint NULL`), NOT `default 0`.** Backfill has NO resume logic (`backfill.ts:11` "resume logic" claim is FALSE — grep confirms no chunk-resume in any puller) and EXITS 0 on failed chunks (`backfill.ts:202-206` — GHA shows green on partial failure). `default 0` would make never-backfilled dates indistinguishable from real zeros in Summary/Products tiles. `null` = not-backfilled; `0` = real zero. Completeness reconciled in phase-09.
- Prefer `inline_link_clicks` over `actions:link_click` — 1-day window matches Ads Manager UI; avoids retro-inflation on old dates (researcher-02 §1). Attribution windows now account-default post-Jan-2026; do not pass `action_attribution_windows` (researcher-02 §6).
- **Existing tile components partial-reuse:** `Sparkline` (SVG), `BadgeDelta`, `Card`, `DashboardGrid` reuse as-is. BUT `kpi-card.tsx:5-12` props are `{label, value, delta?, sublabel?, accent?}` — NO sparkline slot. "value + delta + sparkline per tile" REQUIRES modifying `kpi-card.tsx` to add sparkline/delta props (1 caller: `dashboard-grid.tsx:8`). Existing fetchers `get-pl-summary.ts` (delta vs prior period, `:64-94`) + `get-pl-trend.ts` (series) are the pattern to extend (DRY).
- **Consolidate fetchers 4→2 (DRY).** Blended/Store/Fulfillment tiles are ALL columns of the SAME `daily_pl` matview (gross, refunds, fees, app_subs, meta_spend, net_profit) — 3 separate fetchers re-pull overlapping rows 3×. Use ONE `get-summary-pl.ts` over `daily_pl` (current+prior, per-day rows feed sparklines too) for Blended+Store+Fulfillment, and ONE `get-summary-meta.ts` over `meta_ad_insights_daily` (the only genuinely new source). MER = revenue/spend; margin = net/revenue; AOV = revenue/orders — all query-time.
- **page.tsx blast radius — disposition of all 5 existing surfaces (verified `page.tsx:64-70`):** `getPlSummary`→folds into Blended/Store/Fulfillment sections; `getPlTrend`→sparkline series now come from `get-summary-pl` per-day rows (drop or fold); `getAttribution`/`AttributionCheck`→KEEP (move into Store or a diagnostics strip); `getMissingCogs`/`MissingCogsAlert`→KEEP (operational safeguard — do NOT silently drop); `getLastRefresh`→KEEP (topbar/freshness). Hero/`PlBreakdown`→reframe into Blended hero + sections. No surface dropped without an explicit decision here.
- Compare toggle hides deltas (brainstorm); date-range switch re-renders with the 2nd dataset (mockup).

## Requirements
Functional: 4 tile sections per locked decision — Blended (net profit hero + revenue/spend/MER/margin/orders/AOV), Store-Shopify (gross, refunds, fees, app subs; funnel + bounce land in Phase 04), Meta (spend, attr-ROAS, CPA, purchases, CPM, CPC, CTR, link clicks), Fulfillment-Printify (COGS, units, avg cost/order). Every tile: value + vs-previous-period delta + sparkline. Compare toggle hides deltas. Meta ETL stores `inline_link_clicks` (nullable); backfill = TRAILING 90 DAYS (validated decision — covers selected range + prev-period compare a quarter back; extend later only if older ranges are actually browsed), rerunnable. <!-- Updated: Validation Session 1 - backfill depth: 90 days -->
Non-functional: no new matview (query-time compute); deltas correct across month boundaries; sparkline = trailing daily series for the selected range; 2 fetchers (not 4) on the most-loaded page.

## Architecture
Data flow: ETL `pull-meta.ts` adds `inline_link_clicks` to fields + upsert → migration 0019 adds `inline_link_clicks bigint NULL` to `meta_ad_insights_daily` → backfill workflow re-pulls the TRAILING 90 DAYS with the new field (rerun failed chunks via `--days` over the gap) → TWO `_data` fetchers (`get-summary-pl` over `daily_pl` for Blended+Store+Fulfillment; `get-summary-meta` over `meta_ad_insights_daily`) aggregate over selected + prior range → Summary page renders `DashboardGrid` of `KpiCard`s (sparkline slot added) with `Sparkline`. CPM/CPC/CTR/MER/margin/AOV computed in the fetchers' SQL/TS, never stored.

## Related Code Files
Create:
- `pod-dashboard/supabase/migrations/0019_meta_inline_link_clicks.sql` — add `inline_link_clicks bigint NULL` (null = not-backfilled, never default 0)
- `pod-dashboard/app/(app)/_data/get-summary-pl.ts` — Blended+Store+Fulfillment over `daily_pl` (current+prior, per-day series for sparklines)
- `pod-dashboard/app/(app)/_data/get-summary-meta.ts` — spend/attr-ROAS/CPA/purchases/CPM/CPC/CTR/link-clicks + deltas + spark
- `pod-dashboard/app/(app)/_components/summary-section.tsx` — section header + KpiCard grid + sparklines
- `pod-dashboard/tests/data/summary-metrics.test.ts` — CPM/CPC/CTR/MER/AOV math + div-by-zero
Modify:
- `pod-dashboard/lib/connectors/meta/insights.ts` — add `inline_link_clicks` to `INSIGHT_FIELDS`
- `pod-dashboard/etl/pull-meta.ts` — map + upsert `inline_link_clicks`
- `pod-dashboard/app/(app)/_components/kpi-card.tsx` — ADD sparkline + delta props (1 caller: `dashboard-grid.tsx:8`)
- `pod-dashboard/app/(app)/page.tsx` — rebuild Summary into 4 fixed sections; KEEP `getAttribution`/`AttributionCheck`, `getMissingCogs`/`MissingCogsAlert`, `getLastRefresh`; preserve cold-start empty-state
Delete: none.

## Implementation Steps
1. Verify next migration = 0019 (`ls supabase/migrations/`). Author 0019 adding `inline_link_clicks bigint NULL`. Apply.
2. Add `inline_link_clicks` to `INSIGHT_FIELDS`; map + upsert in `pull-meta.ts` (parseFloat string→bigint like `clicks`; leave NULL when absent).
3. Trigger backfill workflow to re-pull the trailing 90 days of insights with the new field (user-owned); rerun failed chunks by re-dispatching with `--days` covering the gap (no auto-resume exists).
4. Add sparkline/delta props to `kpi-card.tsx`. Write the TWO consolidated fetchers (`get-summary-pl` over `daily_pl` current+prior+per-day; `get-summary-meta`); compute CPM/CPC/CTR/MER/margin/AOV in-query with div-by-zero guards; emit trailing spark series.
5. Build `summary-section.tsx`; rebuild `page.tsx` into 4 fixed sections + net-profit hero, KEEPING attribution-check + missing-COGS-alert + last-refresh surfaces. Keep cold-start empty-state (count on `daily_pl_view`).
6. Unit-test all derived-metric math.
7. `npm run build` + vitest.

## User-owned steps
- Apply migration 0019.
- Trigger backfill workflow after deploy so `inline_link_clicks` populates the trailing 90 days; rerun failed chunks via `--days` over any gap.

## Success Criteria
- [x] Migration **0018** authored; `inline_link_clicks bigint NULL` present (NOT default 0). *(USER-OWNED: apply to Supabase)*
- [x] ETL stores `inline_link_clicks` (null when Meta omits — never coerced to 0). *(USER-OWNED: trigger trailing-90-day backfill; never-backfilled dates read NULL → link-clicks/CPC tiles show "—")*
- [x] CPM/CPC/CTR/MER/margin/AOV/ROAS/CPA computed in-query (NOT stored); div-by-zero returns `null` → "—", never NaN.
- [x] 4 fixed sections render with value + delta + sparkline per tile via 2 consolidated fetchers (`get-summary-pl` over daily_pl+product_pl-units; `get-summary-meta`).
- [x] `kpi-card.tsx` additive sparkline/delta props added; sole caller `dashboard-grid.tsx` still compiles/renders (now orphaned, not deleted).
- [x] Attribution-check, missing-COGS-alert, last-refresh surfaces retained (no silent drop).
- [x] Compare toggle (`?compare=1`) hides deltas; date-range switch re-renders both datasets.
- [x] Derived-metric + view-model unit tests pass (summary-metrics math + build-summary-sections honesty/gating).
- [x] Cold-start empty-state preserved.
- [x] `npm run build` + vitest (412/412) green; tsc clean; eslint 0 errors.

**Implementation notes (2026-06-13):**
- `units` sourced from `product_pl_view.units` (daily_pl has no units column) — secondary read, degrades to 0 on error so it never crashes the P&L page.
- `sparkline.tsx` gained a unique `useId()` gradient id (was a hardcoded `sparkline-fill` that would collapse all ~28 tile sparkline fills to one color).
- Spark omits null per-day points (no zero-fill) so partial-backfill gaps and zero-denominator days don't draw a misleading valley to 0.
- Deferred (NOT a regression): no coverage badge on Meta section (would add a redundant meta read); no funnel/bounce (Phase 04 pixel data); delta = simple % change via existing BadgeDelta (mockup's pp/absolute deltas are visual-only).

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|------------|
| Backfill exits 0 on failed chunks; partial data looks complete | M×H | Nullable column (null≠0); phase-09 completeness reconcile; documented `--days` rerun |
| Ranges older than 90d show NULL link-clicks | accepted | Validated scope: 90-day depth; nullable column makes gap honest ("—"); extend backfill later if older ranges are browsed (13-mo API retention boundary, researcher-02 §2) |
| Div-by-zero on zero-impression days | M×M | Guard all derived metrics; unit test |
| Prior-period delta wrong across month edges | M×M | Compute prior range as equal-length offset; test boundaries |
| Summary rebuild silently drops an operational surface | M×M | Enumerated disposition of all 5 fetchers; keep attribution + missing-COGS + last-refresh |
| kpi-card contract change breaks sole caller | L×M | 1 caller (`dashboard-grid.tsx:8`); additive optional props |

## Security Considerations
- All fetchers via `createSupabaseServerClient()` (cookie-session RLS); no service-role in app.
- ETL change is service-role in `etl/` only (expected).

## Rollback
`git revert` the Summary commit + redeploy. Migration 0019 is forward-only but additive (nullable column) — safe to leave applied even if UI reverts; no down-script needed.
