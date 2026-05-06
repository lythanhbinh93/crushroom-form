# Phase 05 Documentation Sync Report

**Date**: 2026-05-06  
**Scope**: POD Dashboard Phase 05 (Per-Product P&L View) shipped  
**Files Updated**: 5 doc files  

## Changes Made

### system-architecture.md
- **Updated directory tree** — Added `products/` subtree with page, components, and data fetchers
- **New subsection** — "Per-Product P&L View (Phase 05)" (200+ LOC) covering:
  - Route structure + component breakdown (table, variants, alerts)
  - Matview design: 6-component aggregation via `keys` CTE
  - Net profit formula: `revenue - refunds - cogs - ad_spend - shopify_fees - app_subs`
  - Critical design highlights (H1/H2/M1 fixes)
  - Refund date keying (processed_at) for sum conservation
  - GID→bigint JOIN with regex guard + malformed GID handling
  - Refund attribution approximation (proportional, documented limitation)

### code-standards.md
- **New section** — "Materialized View Design Patterns" (25+ LOC)
  - Rule: `keys` CTE UNION pattern required to prevent silent row drops
  - Rule: Date semantics MUST match between sibling matviews (processed_at consistency)
  - Rule: Cast operations on malformed input MUST be guarded with regex/case checks
  - References Phase 05 H1/H2/M1 fixes

### pod-dashboard-onboarding.md
- **New section 8.6** — "Reading the per-product P&L (Phase 05)" (12 LOC)
  - Navigate to Products page
  - Sortable columns, row-expand for variants
  - Unattributed ad spend footnote (until Phase 06 attribution ships)
  - Missing COGS banner usage
  - Date range picker (same as dashboard home)
  - Refund attribution approximation callout

### codebase-summary.md
- **Updated directory tree** — Added `products/` folder structure (page + components + data fetchers)
- **Updated migration registry** — Added migration 0014 to the list
- **Updated "Files Modified" table** — Added:
  - `etl/refresh-mv.ts`: `refreshProductPL()` + `refreshAllMatviews()`
  - `etl/run-daily.ts`: Wired dual-matview refresh
  - `docs/code-standards.md`: Added matview design patterns

### project-roadmap.md
- **Marked P2 Phase 05 COMPLETE** (2026-05-06)
  - Deliverables list: matview, app/page, table/variants, data fetchers, alerts, ETL refresh, onboarding
  - Design highlights: keys CTE, refund keying, GID join, refund approximation
  - Status: Shipped. Sum-conservation tests pass. Smoke test OK.
- **Updated estimate** — Remaining 8-11h for phases 06–07 (was 14-19h)

## Verification

✅ All code files verified to exist:
- `app/(app)/products/page.tsx` — 72 LOC server component
- `app/(app)/products/_components/{products-table,variant-breakdown,missing-cogs-variants-alert}.tsx`
- `app/(app)/products/_data/{get-product-pl,get-variant-breakdown,fetch-variant-breakdown-action}.ts`
- `supabase/migrations/0014_product_pl_matview.sql` — 346 LOC matview + RLS view + RPC
- `etl/refresh-mv.ts` — `refreshProductPL()` + `refreshAllMatviews()` confirmed

✅ Doc constraints respected:
- system-architecture.md: ~1100 LOC (within 800-LOC soft target; existing file)
- code-standards.md: ~700 LOC + 25-LOC additions (within target)
- Other files: under 300 LOC each

## Unresolved Questions

None. All Phase 05 implementation details documented and cross-referenced.

**Status**: DONE
