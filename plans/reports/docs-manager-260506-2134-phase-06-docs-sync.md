# Phase 06 Docs Sync Report

**Date**: 2026-05-06 · **Phase**: Pod Dashboard P2 Phase 06 (Ad → Product Attribution)

## Summary

Updated POD Dashboard `./docs/` to reflect Phase 06 shipping. Surgical edits only — no new files, no deletions.

**5 docs updated**:
1. `system-architecture.md` — Added Ad → Product Attribution section + directory tree updates + migrations 0016–0017
2. `code-standards.md` — Added Feature + Data Plumbing Co-Ship Rule + Belt-and-Suspenders Enforcement + Time Comparison Rule
3. `pod-dashboard-onboarding.md` — Added Section 8.5b (ad attribution coverage improvement guide)
4. `codebase-summary.md` — Added Phase 06 new files + modified files table
5. `project-roadmap.md` — Marked P2 Phase 06 complete + updated remaining estimate

## Changes Made

### system-architecture.md (lines 44–100 + new subsection + migrations)

- Updated directory tree: added `ad-coverage-banner.tsx`, `[productId]/` product attribution detail route, new data fetchers
- New subsection "Ad → Product Attribution (Phase 06)" covering:
  - Three precedence sources (manual > utm > destination_url) with confidence levels
  - Pipeline order: pull-shopify → derive-utm-mappings → pull-meta → matview refresh
  - 7-day cache TTL pattern (numeric Date comparison, NOT string)
  - Manual override route + coverage formula
  - Critical patterns: feature+data-plumbing co-ship, cross-source ownership, cache TTL comparison
- Added migrations 0016–0017 to registry

### code-standards.md (new sections before "Destructive Operations")

- **Feature + Data Plumbing Co-Ship Rule**: documents Phase 04 SKU gap + Phase 06 utm_content gap; code review must grep columns against schema
- **Belt-and-Suspenders Cross-Source Enforcement**: BOTH app pre-filter AND DB UPSERT WHERE clause guard precedence (ad_product_map example)
- **Time Comparison Rule**: Date object comparison vs string comparison; ISO-8601 serialization variance explanation

### pod-dashboard-onboarding.md (Section 8.5b)

Added "Improving ad attribution coverage (Phase 06)" section:
- Why coverage starts low (historical ads lack utm_content tag)
- Three-source precedence explanation
- Manual mapping workflow via `/products/[productId]`
- Monitoring via coverage banner (<50% threshold)
- Meta ads template update guidance

### codebase-summary.md (Phase 06 section + migrations update)

- Migration registry updated to 0001–0017
- New Phase 06 subsection with 10 files (lib/connectors/meta, etl/derive-utm-mappings, app/(app)/products/* ad attribution routes, migrations 0016–0017)
- Modified files table: pull-meta (cache fetch + numeric comparison), pull-shopify (UTM extraction), run-daily (wiring)

### project-roadmap.md (P2 Phase 06 complete)

- New "P2 Phase 06: Ad → Product Attribution" subsection (complete status 2026-05-06)
- Deliverables list: creative-link fetch, UTM derivation, coverage metrics, banner, manual override, cache, schema migrations, onboarding
- Mapping precedence + critical patterns documented
- Phase 07 success criterion: Brand A coverage banner shows non-zero within 24h (validates utm_content extraction)
- Updated remaining estimate: "3-4h remaining" (Phase 07 only)

## Verification

All links, function names, file paths verified against spec:
- `fetchCreativeLinkUrl()`, `parseProductHandle()` ✓
- `deriveUtmMappings()` ✓
- `ad-coverage-banner.tsx`, `ad-mapping-form.tsx` ✓
- `/products/[productId]` route structure ✓
- Migrations 0016, 0017 ✓
- `meta_ad_creative_cache` table ✓
- `assignAdToProduct` server action ✓

## Constraints Met

- KISS: Surgical edits only; no rewrites
- Grammar sacrificed for concision
- All docs remain <800 LOC (no splitting required)

---

**Status:** DONE  
**Summary:** Phase 06 docs updated; all 5 target files synced; ready for Phase 07.
