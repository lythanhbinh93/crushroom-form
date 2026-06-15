---
phase: 5
title: "Products Columns and Creatives Cockpit"
status: 05a-shipped / 05b-pending
priority: P2
effort: 12-15h
dependencies: [phase-02-shell, phase-03-meta-etl]
owns_migrations: [next-free-for-05b]
---

> **Split into 05a + 05b (2026-06-15).** Two surfaces with very different risk:
> **05a — Products columns (Orders / Link clicks / ROAS): ✅ SHIPPED** to pod-dashboard main (`93fba25` → Vercel, /api/health 200). Code-only (NO migration — all data existed); `product-extra-columns.ts` pure helpers + `get-product-pl.ts` extension + 3 sortable table columns + footnote + variant-breakdown colspan fix. 13 tests, vitest 432/432, adversarial review (no Crit/High; 2 medium fixes applied: explicit-UTC order date bounds + large-`.in()` guard). Live-verified: Orders populate; Link clicks/ROAS correctly show "—" (ad_product_map ~empty → attribution maturing).
> **05b — Creatives cockpit + creative-metadata ETL: PENDING.** The ETL-heavy, ships-dormant half: migration (next free, likely 0019) ALTER meta_ad_creative_cache; extend pull-meta creative pull (image_hash → ad_image_history.permanent_url, creative_type, video/carousel thumbnail); `get-creatives.ts` + `creatives-table.tsx` + `group-toggle.tsx` + `lib/normalize-title.ts`; user-owned creative backfill. Steps 1–5 below are 05b; the Products-columns parts of steps 6 are 05a (done).

# Phase 5: Products Columns and Creatives Cockpit

## Overview
Two surfaces: (1) add Orders / Link clicks / ROAS columns to the existing Products table; (2) build the Creatives cockpit — a per-ad table (thumbnail, status, link clicks, spend, CPC, attr revenue, ROAS, CPA, purchases) with a "By creative / By product" toggle. Creative thumbnails use Meta's STABLE `permanent_url` (ad_image_history) — no Supabase Storage. By-product grouping merges products that share a normalized title (user relaunches listings — intentional).

## Key Insights
- **VERIFIED:** `meta_ad_creative_cache` (`0016:86-94`) is PK `(workspace_id, ad_id)` storing `ad_id, link_url, last_check`, members-select RLS, service-role-write via ETL (no authenticated INSERT). It is the SAME per-(workspace, ad) grain creative cache. ALTER it — do NOT create a second table.
- **No new table, extend existing ETL.** Migration 0020 = `ALTER TABLE meta_ad_creative_cache ADD COLUMN creative_id text, creative_type text, image_hash text, permanent_url text, thumbnail text`. Extend the EXISTING creative writer in `etl/pull-meta.ts` (`:204`, `:320-322` already upsert this cache) — do NOT add a parallel `pull-meta-creatives.ts`.
- **Thumbnail expiry trap (researcher-02 §4):** Ads API `thumbnail_url`/`image_url` are temporary signed CDN URLs (expire in hours). Store `image_hash` → resolve Meta's STABLE `ad_image_history.permanent_url` once and cache it. NO Supabase Storage download (the permanent_url already solves expiry — Storage adds a bucket, access control, free-tier consumption for zero benefit).
- **Video/carousel handling (researcher-02:133-151).** Image-only schema renders blank cells for video/carousel ads (large share of POD creatives). Store `creative_type` + a `thumbnail` derived from `object_story_spec.video_data` video thumbnail for video, and first-card image for carousel. Handle in the pull step.
- **VERIFIED:** `ad_product_map` (`0016`) maps `(workspace_id, ad_id) → product_id` with `source` + `confidence` — already exists for by-product grouping (scout §2). By-product = group ads by mapped product, then MERGE products sharing a normalized title (lower+trim) — user's relaunched/duplicate listings count as one (locked decision). Small accidental-merge risk if two genuinely different products share a title (footnote in UI).
- Products table source: existing `product_pl_view` + `get-product-pl.ts` (scout §3). New columns: Orders (count from `product_pl`/order lines), Link clicks (sum mapped ads' `inline_link_clicks` from Phase 03 via `ad_product_map`), ROAS (attr revenue / spend). Link-clicks + ROAS UNDER-report where ads unmapped — UI footnote (brainstorm round-2).
- Per-ad metrics come from `meta_ad_insights_daily` (spend, impressions, clicks, `inline_link_clicks` from Phase 03, purchases, revenue); CPC/ROAS/CPA computed in-query (DRY with Phase 03 derived-metric helpers).
- Creatives page placeholder route already scaffolded in Phase 02.

## Requirements
Functional: Products gains Orders / Link clicks / ROAS columns (sortable). Creatives page: per-ad rows with thumbnail + status + link clicks + spend + CPC + attr revenue + ROAS + CPA + purchases; "By creative / By product" toggle; by-product groups via `ad_product_map` + normalized-title merge; honest "—" for unattributed/unmapped ads. Thumbnails via stable `permanent_url`; video/carousel get a thumbnail too.
Non-functional: thumbnails survive re-render (no 404s); image AND video/carousel ads render; grouping deterministic; unmapped-ad under-reporting disclosed in UI.

## Architecture
ETL: extend the EXISTING Meta creative pull (`pull-meta.ts:~200-322`) to fetch `creative{image_hash}` + `creative_type` + (for video) `object_story_spec.video_data` thumbnail per ad, resolve stable `ad_image_history.permanent_url` once; upsert into ALTERed `meta_ad_creative_cache` (5 new columns). NO Storage bucket. Data flow (creatives): `meta_ad_insights_daily` (per-ad metrics over range) LEFT JOIN `meta_ad_creative_cache` (thumbnail/permanent_url) LEFT JOIN `ad_product_map` (product) → by-creative = per-ad rows; by-product = group by mapped product, merge normalized titles. Products columns: extend `get-product-pl.ts` to add orders/link-clicks/ROAS via `ad_product_map` join. CPC/ROAS/CPA computed in fetchers (reuse Phase 03 derived-metric helpers).

## Related Code Files
Create:
- `pod-dashboard/supabase/migrations/0020_meta_creative_cache_columns.sql` — `ALTER TABLE meta_ad_creative_cache ADD creative_id text, creative_type text, image_hash text, permanent_url text, thumbnail text` (no new table; existing RLS unchanged)
- `pod-dashboard/app/(app)/creatives/_data/get-creatives.ts` — per-ad rows + by-product grouping + normalized-title merge
- `pod-dashboard/app/(app)/creatives/_components/creatives-table.tsx` — sortable per-ad table + thumbnails (image/video/carousel)
- `pod-dashboard/app/(app)/creatives/_components/group-toggle.tsx` — By creative / By product switch
- `pod-dashboard/lib/normalize-title.ts` — title normalization (lower+trim+collapse-space) for merge
- `pod-dashboard/tests/data/creatives-grouping.test.ts` — normalized merge, unmapped "—", derived metrics, video/carousel thumbnail
Modify:
- `pod-dashboard/etl/pull-meta.ts` — extend EXISTING creative-cache writer (`:204`, `:320-322`) to fetch creative_id/creative_type/image_hash + resolve permanent_url + video/carousel thumbnail; upsert new columns
- `pod-dashboard/app/(app)/products/_data/get-product-pl.ts` — add orders / link-clicks / ROAS columns
- `pod-dashboard/app/(app)/products/page.tsx` — render 3 new columns + sort + unmapped footnote
- `pod-dashboard/app/(app)/creatives/page.tsx` — replace Phase-02 placeholder with real cockpit
Delete: none.

## Implementation Steps
1. Verify next migration = 0020 (`ls supabase/migrations/`; exclude stray bundle file). Author `ALTER meta_ad_creative_cache ADD` 5 columns. Apply.
2. Extend the EXISTING creative pull in `pull-meta.ts`: per ad, fetch `creative{image_hash}` + `creative_type`; resolve stable `ad_image_history.permanent_url`; for video/carousel derive a `thumbnail` from `object_story_spec.video_data` / first card; upsert into the ALTERed cache. NO Storage. (Already wired into `run-daily.ts` via the existing pull — no new run-daily edit.)
3. `lib/normalize-title.ts` + unit test (relaunch-merge cases, e.g. 2 "Plant Mom Mug" → 1).
4. `get-creatives.ts`: per-ad metrics over range, join cache + ad_product_map; by-product grouping + normalized merge; CPC/ROAS/CPA in-query; "—" for unmapped.
5. Build `creatives-table.tsx` + `group-toggle.tsx`; replace placeholder `creatives/page.tsx`.
6. Extend `get-product-pl.ts` (1 caller: `products/page.tsx:43`) + products `page.tsx` with Orders/Link-clicks/ROAS + unmapped footnote.
7. Unit-test grouping + derived metrics + video/carousel thumbnail path; `npm run build` + vitest.

## User-owned steps
- Apply migration 0020.
- Trigger creative-asset backfill after deploy (re-pulls creative metadata into the cache).

## Success Criteria
- [ ] Migration 0020 applied; `meta_ad_creative_cache` gains 5 columns (no new table); existing RLS intact.
- [ ] Thumbnails resolve from stable `permanent_url` — survive re-render, no 404s; no Supabase Storage bucket created.
- [ ] Video AND carousel ads render a thumbnail (creative_type handled), not blank cells.
- [ ] Products table shows sortable Orders / Link clicks / ROAS; unmapped under-report footnoted.
- [ ] Creatives per-ad table shows all required columns; unmapped ads show "—".
- [ ] By creative / By product toggle works; same-normalized-title products merge to one row.
- [ ] Grouping + derived-metric + video/carousel unit tests pass.
- [ ] `npm run build` + vitest green.

## Risk Assessment
| Risk | L×I | Mitigation |
|------|-----|------------|
| Caching `thumbnail_url` → 404s later | H×M | Store image_hash + resolve stable permanent_url; never cache signed URL — core mitigation |
| Video/carousel ads render blank | M×M | creative_type + video/carousel thumbnail path; unit-tested |
| Normalized merge collapses 2 genuinely-different products | L×M | Intentional per user; UI footnote; merge by exact-normalized title only (no fuzzy) |
| Link-clicks/ROAS under-report on unmapped ads | H×L | Footnote in UI; coverage chip; expected (UTM coverage maturing) |
| Meta creative pull hits rate limits | M×M | Fetch image_hash once per ad, cache in the existing table; if permanent_url later observed to 404, the daily creative pull re-resolves it (no separate weekly job) |

## Security Considerations
- Creative pull is service-role in `etl/` (expected); `meta_ad_creative_cache` keeps its existing members-select RLS for app reads.
- No Storage bucket — no public-image surface to access-control.

## Rollback
`git revert` the cockpit/products commit + redeploy. Migration 0020 is additive (ADD COLUMN) — safe to leave applied if UI reverts; no down-script needed.
