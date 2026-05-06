# POD Dashboard P2 Phase 04 Documentation Sync

**Date**: 2026-05-06 · 18:16 UTC  
**Scope**: Surgical doc updates reflecting Phase 04 (Product Catalog Pull + SKU-Match) completion  
**Files Updated**: 5 docs in `pod-dashboard/docs/`

## Changes Made

### 1. system-architecture.md
- Added new `lib/connectors/shopify/` module tree (products-bulk-start/poll/parse, sku-match)
- Added `Source Connectors (P2 Phase 04)` section: GraphQL bulk ops lifecycle (start → poll → parse JSONL → assemble)
- Documented SKU-match 4-path strategy (metafield → SKU → fallback → unmapped)
- Extended "Storage Management" section with:
  - `pruneOrphanVariantCosts()` now active (was no-op)
  - **Data Ownership Model** subsection: Printify-only stamps `last_etl_run_id`; Shopify pull read-only; prevents cross-source race condition
- Added migration registry (0012–0013) to context
- Added `etl/pull-shopify-products-bulk.ts` to directory tree

### 2. code-standards.md
- New subsection "Cross-Source ETL Data Ownership (P2 Phase 04+)": when one ETL source writes to another's table
- Documented `printify_variant_costs.last_etl_run_id` ownership boundary explicitly
- Added rationale for run-id stamping segregation (anti-data-destruction pattern)
- Included implementation guidance: identify owner, that source only writes, others read-only

### 3. pod-dashboard-onboarding.md
- Added Section 4.5 "Catalog mapping (SKU-match strategy)"
- Explained 4-step matching precedence (metafield → SKU → fallback → unmapped)
- Troubleshooting for unmapped variants (SKU consistency check, metafield setup)
- Note on 24h catalog cache + manual refresh option

### 4. codebase-summary.md
- Updated `lib/connectors/shopify/` section: added products-bulk-{start,poll,parse}, sku-match, types, index
- Updated `etl/` directory tree: added pull-shopify-products-bulk.ts; noted orphan-prune now active
- Added P2 Phase 04 full implementation summary:
  - New module descriptions + LOC estimates
  - Files modified: pull-shopify.ts, pull-printify.ts, prune-old-snapshots.ts (with change descriptions)
  - SKU-match strategy breakdown (4 paths + collision warnings)
  - Anti-data-destruction design explanation (M3 fix rationale)
  - Status: Shipped 2026-05-06
- Updated migration registry header (0001–0013)

### 5. project-roadmap.md
- Replaced "P2 Phase 04–07: Pending" with full P2 Phase 04 section
- Documented all deliverables (GraphQL bulk ops, SKU-match, migrations, onboarding)
- Explained mapping strategy (4-path precedence + warnings)
- Added data ownership model context (M3 fix)
- Updated success criteria table: marked "Product catalog pull + SKU-match" ✅
- Adjusted remaining estimate: "14-19h remaining" (was "20-28h")

## Quality Checks

✅ **Code accuracy**: Verified against actual files (products-bulk-*.ts, sku-match.ts, pull-shopify-products-bulk.ts, migrations 0012–0013)  
✅ **Cross-reference consistency**: All docs aligned on SKU-match strategy, data ownership model, migration numbering  
✅ **Surgical edits**: No deletions; only surgical inserts + targeted replacements  
✅ **File size**: All docs remain <800 LOC (no splits needed)  
✅ **Terminology**: Consistent case (printify_variant_costs, shopify_product_variants, SKU-match)

## Notes

- Migration 0012 adds `last_etl_run_id` column to `printify_variant_costs` (critical for orphan-prune)
- Migration 0013 adds `sku` column with partial index (required for SKU-match queries)
- Phase 04 M3 fix (data ownership) is intentionally elevated to code-standards.md as a reusable pattern for future cross-source ETL scenarios
- Catalog mapping section in onboarding addresses user-facing "Unmapped" variants; troubleshooting provided

## Status

**DONE**

All Phase 04 changes reflected in docs. Docs now synchronized with codebase state (2026-05-06). Ready for review/merge.
