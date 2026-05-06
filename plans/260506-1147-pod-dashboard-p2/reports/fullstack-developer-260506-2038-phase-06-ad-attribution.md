# Phase 06 — Ad → Product Attribution: Implementation Report

## Files Created

| File | LOC | Notes |
|------|-----|-------|
| `supabase/migrations/0016_ad_product_map_attribution.sql` | 100 | Migration 0016 verified — 0015 was last, 0016 is correct |
| `lib/connectors/meta/creative-link.ts` | 100 | fetchCreativeLinkUrl + parseProductHandle |
| `etl/derive-utm-mappings.ts` | 185 | UTM majority-vote derivation |
| `app/(app)/_data/get-ad-coverage.ts` | 105 | Coverage metrics data fn |
| `app/(app)/products/_components/ad-coverage-banner.tsx` | 80 | Coverage callout + UTM CTA |
| `app/(app)/products/[productId]/page.tsx` | 55 | Product detail server page |
| `app/(app)/products/[productId]/actions.ts` | 95 | assignAdToProduct server action |
| `app/(app)/products/[productId]/_data/get-product-ad-mappings.ts` | 105 | Mapped + unmapped ad queries |
| `app/(app)/products/[productId]/_components/ad-mapping-form.tsx` | 180 | Client form with optimistic UI |
| `tests/connectors/meta/creative-link.test.ts` | 110 | 20 tests |
| `tests/etl/derive-utm-mappings.test.ts` | 175 | 7 tests |
| `tests/app/products/productId/actions.test.ts` | 165 | 10 tests |
| `tests/app/_data/get-ad-coverage.test.ts` | 145 | 8 tests |

## Files Modified

| File | Change |
|------|--------|
| `etl/pull-meta.ts` | Added creative link fetch + destination_url mapping pipeline (+~160 LOC) |
| `etl/run-daily.ts` | Wired deriveUtmMappings after shopify/meta pulls (+20 LOC) |
| `app/(app)/products/page.tsx` | Added AdCoverageBanner + parallel getAdCoverage fetch (+8 LOC) |

## Migration 0016 Summary

- **Path:** `supabase/migrations/0016_ad_product_map_attribution.sql`
- **Verified:** 0014 = last migration shipped; 0015 = security fix; 0016 = correct next number
- **PK collapse:** DROP `(workspace_id, ad_id, product_id)` → ADD `(workspace_id, ad_id)` — 1 product per ad
- **Dedupe guard:** DELETE lower-confidence duplicate rows before PK change (idempotent; table was empty on ship)
- **source column:** SET DEFAULT `'destination_url'`, SET NOT NULL; NULL rows back-filled before constraint
- **confidence check:** `CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)` wrapped in DO block (idempotent)
- **New table:** `meta_ad_creative_cache (workspace_id, ad_id, link_url, last_check PK)` — 7-day TTL cache avoids redundant Meta API calls
- **RLS:** INSERT policy for owners on `ad_product_map` (manual override from server action)
- **Indexes:** `idx_ad_product_map_workspace_ad`, `idx_ad_product_map_workspace_product`, `idx_meta_ad_creative_cache_*`

## Schema Decision: PK Collapse

Collapsed from `(workspace_id, ad_id, product_id)` to `(workspace_id, ad_id)`. Each ad maps to exactly one product — highest-confidence wins; manual > utm > destination_url. Dedupe runs before DDL change; expected table was empty on first deploy.

## UTM Derivation Precedence Logic

Enforced in two places (defense-in-depth):

1. **TS layer (`derive-utm-mappings.ts`):** Fetches existing rows; skips upsert for any ad where `source='manual'`. This keeps the upsert batch clean.
2. **DB layer (upsert `onConflict`):** Supabase upsert with `onConflict: 'workspace_id,ad_id'` — combined with RLS policy `is_workspace_member` check. Manual rows protected by TS pre-filter; DB is final guard.

Confidence hierarchy: `manual=1.0 > utm=0.9 > destination_url=0.7`.

## Coverage Data Function Formula

```
totalSpend   = SUM(spend) per unique ad_id from meta_ad_insights_daily [date range]
mappedSpend  = SUM(spend) for ad_ids present in ad_product_map
unmappedSpend = totalSpend - mappedSpend
coverageRatio = mappedSpend / totalSpend   (null when totalSpend = 0)
```

Spend is aggregated per `ad_id` before coverage computation to avoid double-counting ads that appear on multiple days within the range.

## Manual Override Owner-Check Pattern

Mirrors Phase 03 (`settings/members/actions.ts`) exactly:

```ts
if (workspace.role !== "owner") {
  return { ok: false, error: "only workspace owners can map ads to products" };
}
```

Applied BEFORE `createSupabaseServerClient()` is called — so the Supabase client is never created for non-owners (defense-in-depth over the RLS `ad_product_map_upsert_for_owners` policy).

## Tests Added

| File | Count | What they cover |
|------|-------|-----------------|
| `creative-link.test.ts` | 20 | parseProductHandle (14 URL forms), fetchCreativeLinkUrl (6 cases incl. error propagation) |
| `derive-utm-mappings.test.ts` | 7 | majority-vote, manual never overwritten, non-numeric utm_content → skip, error propagation |
| `actions.test.ts` | 10 | owner check, input validation, happy path row shape, RPC call, revalidatePath, RPC non-fatal, DB error, unauthenticated |
| `get-ad-coverage.test.ts` | 8 | zero spend, partial coverage, 100% coverage, 0% coverage, multi-day aggregation, both query failure degradations |
| **Total** | **45** | |

## Build Results

| Check | Result |
|-------|--------|
| `npx tsc -p . --noEmit` | PASS (0 errors) |
| `npx vitest run` (Phase 06 tests) | PASS 45/45 |
| `npx vitest run` (full suite) | 331 pass / 8 fail — 8 failures are pre-existing Printify connector regression on base branch (confirmed by stash test), zero regressions introduced |
| `npm run guard:no-service-role-in-app` | PASS |

## Carry-Forward / Deferred

- **M2 temporal validity** (`valid_from`/`valid_to`): explicitly deferred to P3 per spec
- **Bulk CSV import** for manual mappings: YAGNI — not in spec
- **Admin audit log** for manual overrides: YAGNI — not in spec
- **Operational backfill** of existing ads: user runs daily ETL post-deploy

## Unresolved Questions

1. **`utm_content` filter workspace scope in `derive-utm-mappings.ts`:** The `workspaceId` filter is applied client-side in TS (after fetching all valid UTM orders) rather than in the Supabase query, because the `filter()` method on the JS client doesn't support `::uuid` casting inline. For production scale (many workspaces), a Postgres function would be more efficient. Low priority while single-tenant but worth a P3 note.

2. **Printify orders test regression (pre-existing):** 8 tests in `tests/connectors/printify/orders.test.ts` fail on base branch. Not introduced by Phase 06. Should be investigated and fixed in a separate task before Phase 07 ships.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** All Phase 06 deliverables implemented — migration 0016, creative-link connector, UTM derivation ETL, run-daily wiring, coverage banner on /products, product detail ad-mapping UI with owner-gated server action. 45 new tests pass, tsc clean, service-role guard clean.
**Concerns:**
- `derive-utm-mappings` workspace filter is TS-side (not SQL-side) due to JS client limitations — acceptable at current scale, P3 candidate for RPC extraction.
- Pre-existing Printify test regression (8 tests, not Phase 06) should be fixed before Phase 07 final smoke.

---

## Follow-up: Code Review Fixes (C-1, H-1, H-3, L-6)

### C-1 — `shopify_orders.utm_content` column missing

**Root cause:** `derive-utm-mappings.ts` queried `o.utm_content` from `shopify_orders` but migration 0002 only defined `utm_source`, `utm_medium`, `utm_campaign`. `pull-shopify.ts` extracted UTMs from `note_attributes` only — never `utm_content`, and never from `landing_site`. Every derive-utm run threw a Postgres "column does not exist" error, swallowed by run-daily's try/catch.

**Shopify field used:** `landing_site` (primary) + `note_attributes` fallback. Meta Pixel writes UTM params to the order's `landing_site` URL query string (e.g. `/?utm_source=facebook&utm_content={{ad.id}}`), not to `note_attributes`. The existing `extractUtm()` helper only read `note_attributes` — so even if the column had existed, `utm_content` would have been null for all Meta-attributed orders.

**Diff summary:**

- `supabase/migrations/0017_shopify_orders_utm_columns.sql` — adds `utm_content text` to `shopify_orders` + index on `(workspace_id, utm_content) where utm_content is not null`. Idempotent (`add column if not exists`). Historical rows stay null until next Shopify pull.
- `etl/types.ts` — added `utm_content: string | null` field to `ShopifyOrderRow`.
- `lib/connectors/shopify/types.ts` — added `landing_site?: string | null` to `ShopifyOrder`.
- `lib/connectors/shopify/orders.ts` — added `landing_site` to `ORDER_FIELDS` request list.
- `etl/pull-shopify.ts` — added `extractUtmFromLandingSite()` helper (exported for testing); wires `utm_content` as `landing_site` param first, `note_attributes` fallback.

**Tests added:**
- `tests/etl/pull-shopify-utm-landing-site-extraction.test.ts` — 10 tests covering: relative path (`/?utm_...`), absolute URL, path with query, param absent, null/undefined/empty landing_site, malformed URL (no throw), encoded chars. All pass.

---

### H-1 — `orderAdMap` keyed by `order_id` only (cross-workspace collision)

**Root cause:** `orderAdMap` was `Map<number, ...>` keyed by `order_id`. `shopify_orders` PK is `(workspace_id, order_id)` — order IDs are unique per-workspace only. If the function were ever invoked without workspace scoping, workspace B's order 5001 would overwrite workspace A's order 5001 in the map, misattributing ad spend.

**Fix chosen:** Made `workspaceId` required (removed the optional "process all workspaces" code path) AND changed the map key to `${workspace_id}::${order_id}`. Defense-in-depth: required param eliminates the unscoped call path; composite key protects against future regressions if the signature changes.

**Diff summary:**

- `derive-utm-mappings.ts` — `DeriveUtmMappingsOpts.workspaceId` changed from `string | undefined` to `string`. Removed dead `workspaceFilter` SQL string (L-6 combined here). `orderAdMap` key changed to `${workspace_id}::${order_id}`. `linesByOrderId` renamed to `linesByCompositeId`, keyed by same composite. Order lines select now includes `workspace_id` column. Loop variable renamed `compositeOrderId`.

**Tests added:**
- New `it("isolates order_id lookup by workspace_id...")` appended to `tests/etl/derive-utm-mappings.test.ts`. Two workspaces share order_id 5001 with different ads and products. Running scoped to WS_A correctly maps only WS_A's ad; WS_B row absent from upsert.
- Existing fixture objects updated to include `workspace_id` field (required by the fixed `select('workspace_id, order_id, product_id')` query).

---

### H-3 — String ISO comparison on `timestamptz` TTL

**Root cause:** `pull-meta.ts:216` compared `r.last_check >= staleCutoffIso` where both sides are strings. PostgREST serializes `timestamptz` as `"2026-04-29T20:55:00+00:00"` (not `".000Z"`). When `last_check` and the cutoff represent the same UTC instant, their string forms differ at index 19: `'+'` (char 43) vs `'.'` (char 46) — `+00:00` compares less, making a fresh entry appear stale. Cache invalidates every run, re-fetching all ads against Meta API quota.

**Fix:** `Number(new Date(r.last_check)) >= Number(staleCutoff)` — both sides coerced to epoch milliseconds. Format-independent.

**Diff snippet (`pull-meta.ts`):**
```diff
-  .filter((r) => r.last_check >= staleCutoffIso)
+  .filter((r) => Number(new Date(r.last_check)) >= Number(staleCutoff))
```
Also removed `staleCutoffIso` variable (no longer needed); `staleCutoff` stays as `Date`.

**Tests added:**
- `tests/etl/pull-meta-stale-check-date-comparison.test.ts` — 7 tests:
  - Fresh Z-suffix 1 day ago → fresh
  - Fresh `+00:00` 1 day ago → fresh (regression case: string compare would wrongly return stale)
  - `+00:00` exactly at boundary → fresh (boundary = `>=`)
  - Z-suffix exactly at boundary → fresh
  - Z-suffix 8 days ago → stale
  - `+00:00` 8 days ago → stale
  - **PROOF test:** `+00:00 == cutoff` → string compare returns `false` (wrong); numeric compare returns `true` (correct). Anchors the regression.

---

### L-6 — Dead SQL injection vector deleted

**Root cause:** Lines 50-54 in `derive-utm-mappings.ts` built `const workspaceFilter = workspaceId ? \`and o.workspace_id = '${workspaceId}'::uuid\` : ''` — interpolating `workspaceId` directly into a SQL fragment. The variable was never used (the code path used the Supabase JS query builder). Not exploitable today but a footgun for future refactors.

**Fix:** Deleted the entire `workspaceFilter` variable block. Combined with H-1 fix in same edit pass.

---

### Final build results

| Check | Result |
|-------|--------|
| `npx tsc -p . --noEmit` | PASS (0 errors) |
| `npx vitest run` | 350 pass / 8 fail — 8 failures are pre-existing Printify regression (unchanged from Phase 06 baseline) |
| `npm run guard:no-service-role-in-app` | PASS |

New tests added this pass: 10 (UTM landing-site extraction) + 7 (stale-check date comparison) + 1 (H-1 workspace isolation) = **18 new tests**, all passing.

**Operational note (C-1 verification):** After migration 0017 applies and the next Shopify pull runs, query `select count(*) from shopify_orders where utm_content is not null` to confirm Meta-attributed orders are being captured. If Brand A uses `{{ad.id}}` in their Meta UTM template, rows should appear within 24h of the next daily run.

---

**Status:** DONE
**Summary:** All 4 review findings fixed — C-1 (missing column + extraction path), H-1 (composite map key + required workspaceId), H-3 (Date numeric comparison), L-6 (dead SQL string deleted). 18 new tests added. tsc clean, guard clean, 8 pre-existing Printify failures unchanged.
