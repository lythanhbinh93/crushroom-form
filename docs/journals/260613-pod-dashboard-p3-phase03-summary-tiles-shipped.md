# POD Dashboard P3 — Phase 03: Summary Tile Grid + Meta inline_link_clicks (SHIPPED)

**Date:** 2026-06-13
**Repos:** code = `pod-dashboard` (commit `62b9b4e` → main → Vercel prod, /api/health 200); plans = `crushroom-form` (commit `7ca273f`)
**Plan:** `plans/260611-0954-pod-dashboard-p3-triplewhale-redesign/phase-03-...md`

## What shipped
Replaced the P2 hero+5-KPI Summary with a Triple Whale-style tile grid: net-profit hero + 4 fixed sections (Blended / Store·Shopify / Meta / Fulfillment·Printify). Every tile = value + vs-previous-period delta (gated on `?compare=1`) + sparkline. Meta ETL extended for the one missing field (`inline_link_clicks`).

- **Migration 0018** `inline_link_clicks bigint NULL` (no default) on `meta_ad_insights_daily`.
- **ETL**: field added to `INSIGHT_FIELDS` + `MetaInsight`/`MetaInsightRow`; `pull-meta` stores `null` when Meta omits it (never coerced to 0).
- **2 consolidated fetchers**: `get-summary-pl` (daily_pl current+prior+per-day series + `product_pl_view.units`) and `get-summary-meta` (per-day aggregation, null-aware link clicks).
- **`lib/summary-metrics.ts`**: pure MER/margin/AOV/ROAS/CPA/CPM/CPC/CTR; div-by-zero → `null`.
- **`build-summary-sections.ts`**: pure view-model builder (keeps page.tsx thin + unit-testable).
- **UI**: additive `KpiCard` spark props; new `SummarySection`; `page.tsx` rebuilt keeping attribution-check, missing-COGS alert, last-refresh, cold-start.
- **31 new tests**; gates: tsc clean, eslint 0 errors, vitest 412/412, build ✓.

## Decisions & lessons
- **Migration number drift, again.** Plan said 0019; disk max was 0017 and phase-01's "0018" pixel migration was never built — so phase 03 took **0018** (next free). Numbers are assigned by disk order at build time, NOT reserved by phase. Re-verified `ls supabase/migrations/` before authoring. (Matches the standing anti-drift rule.)
- **`units` isn't in daily_pl.** The plan listed units as "buildable now," but `daily_pl` has no units column — it lives in `product_pl_view.units` (sum of order-line quantity). Scouting caught this; sourced units from product_pl as a secondary read that degrades to 0 on error so it never crashes the primary P&L page. Lesson: verify "buildable" claims against the actual matview columns, not the plan's assertion.
- **Null vs real-zero is the whole point.** `inline_link_clicks` NULL = not-backfilled, 0 = real zero. Carried end-to-end (connector omits → ETL null → column nullable-no-default → fetcher null-aware via a `seen` flag → tiles render "—"). A `default 0` would have made never-backfilled dates indistinguishable from real zeros.
- **Latent sparkline bug found + fixed.** `sparkline.tsx` used a hardcoded `id="sparkline-fill"`; harmless with one hero sparkline, but the tile grid renders ~28 — duplicate SVG ids collapse every fill to the first def's color. Switched to `useId()` (colon-stripped for valid `url(#…)`), hydration-safe.
- **Adversarial-review catch (M1):** sparklines zero-filled not-yet-backfilled days → a misleading valley to $0 on CPC/Link-clicks during a partial backfill. Fixed by dropping null per-day points from the spark (honest gap) rather than zero-filling. The tile *value* was already honest; only the glyph lied.
- **Scope discipline:** skipped the Meta coverage badge (would add a redundant `meta_ad_insights_daily` read), funnel/bounce (Phase 04 pixel data), and pp/absolute deltas (used existing % BadgeDelta). Pre-existing `ratio()` sign-inversion on negative baselines left unchanged (out of scope; documented).

## Verification
- Prod `/api/health` 200 + supabase ok after push. Summary page render requires an authed session — visual verification is user-side.

## User-owned remaining
1. Apply migration `0018_meta_inline_link_clicks.sql` to Supabase.
2. Trigger the trailing-90-day Meta backfill (rerun failed chunks via `--days` over any gap; no auto-resume). Until both run, Link-clicks + CPC tiles show "—".

## Unresolved questions
- None blocking. The `dashboard-grid`/`get-pl-summary`/`get-pl-trend`/`trend-chart`/`pl-breakdown` modules are now orphaned but kept per the plan's "Delete: none" — candidate cleanup if they stay unused after later P3 phases.
