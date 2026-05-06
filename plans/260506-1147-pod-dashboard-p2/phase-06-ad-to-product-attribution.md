# Phase 06 — Ad → Product Attribution

**Status:** pending · **Est:** 5-7h · **BlockedBy:** 04, 05 · **Blocks:** 07

## Context Links
- Plan: [plan.md](plan.md)
- Research: Meta API does NOT expose creative→product mapping; UTM-based attribution is the tractable path
- Existing: `meta_ad_insights_daily.ad_id`, `shopify_orders.utm_*`

## Overview
Map each Meta ad to a Shopify product so phase-05's `product_pl.ad_spend` column has real numbers. Two complementary signals: (1) UTM `utm_content` = `ad_id` from the order, (2) Meta ad's destination URL parsed for `/products/<handle>`. Whichever resolves wins; both is best.

## Key Insights
- **No clean Meta API field** maps creative → product. We have to derive it.
- **UTM signal:** if user templates Meta ads with `utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.id}}&utm_content={{ad.id}}`, then `shopify_orders.utm_content = meta_ad_insights_daily.ad_id`. Highly reliable when present.
- **Destination URL signal:** Meta ads have a `link_url` field (in creative). Parse for `/products/<handle>` matches `shopify_products.handle`. Available even without UTM discipline.
- **Coverage report is mandatory:** show owner what % of ad spend is mapped vs unattributed; gives them a reason to fix UTMs.

## Requirements

### Functional
- New table `ad_product_map` (workspace_id, ad_id, product_id, source enum 'utm'/'destination_url'/'manual', confidence float, mapped_at).
- New ETL step in `pull-meta.ts`: for each ad, fetch `creative.link_url`, parse for product handle, insert mapping if confident.
- New post-ETL job `derive-utm-mappings.ts`: for each ad_id appearing in shopify_orders.utm_content, look up product via order_lines (most-frequent product wins), insert mapping.
- Manual override UI in `/products/[id]` (or `/settings/ad-mapping`): owner can pin an ad to a product.
- Coverage report on `/products` top: "X% of ad spend mapped to products".

### Non-functional
- Mapping derivation idempotent; re-running converges.
- UTM-derived mappings have higher precedence than URL-derived (in case of conflict).
- Manual mappings highest precedence (never overwritten by automation).

## Architecture

```
ad_product_map (workspace_id, ad_id, product_id, source, confidence, mapped_at)
  PRIMARY KEY (workspace_id, ad_id)   ← one product per ad

Mapping pipeline (runs after daily ETL):

1. pull-meta.ts (already runs daily)
   └─ for each new ad_id pulled, fetch creative.link_url via Marketing API
   └─ parse URL for /products/<handle>; if matches a shopify_products.handle, upsert into ad_product_map (source=destination_url, confidence=0.7)

2. derive-utm-mappings.ts (new, runs after pull-shopify)
   └─ SELECT utm_content as ad_id, product_id, COUNT(*) as n
      FROM shopify_orders o JOIN shopify_order_lines ol USING (workspace_id, order_id)
      WHERE utm_source ILIKE 'facebook' AND utm_content ~ '^[0-9]+$'
      GROUP BY 1,2
   └─ for each ad_id, pick product_id with highest n; upsert (source=utm, confidence=0.9, IF NOT manual)

3. Manual override (UI)
   └─ owner clicks "Map this ad to product X" → upsert (source=manual, confidence=1.0)
```

## Related Code Files

**Create:**
- `supabase/migrations/0012_ad_product_map.sql` (replaces phase-05's stub creation)
- `etl/derive-utm-mappings.ts`
- `lib/connectors/meta/creative-link.ts` — fetch + parse creative.link_url
- `app/(app)/products/[productId]/ad-mapping-form.tsx` — manual override UI
- `app/(app)/_data/get-ad-coverage.ts` — % attributed metric

**Edit:**
- `etl/pull-meta.ts` — add link_url fetch per ad
- `etl/run-daily.ts` — call derive-utm-mappings after pull-shopify
- `app/(app)/products/page.tsx` — show coverage banner

**Delete:** none

## Implementation Steps
1. Migration 0012: `ad_product_map` table (replaces phase-05 stub) + RLS + index on (workspace_id, ad_id).
2. `lib/connectors/meta/creative-link.ts`: GET `/{ad_id}?fields=creative{object_story_spec,link_url}`; parse URL for `/products/<handle>`.
3. Extend `pull-meta.ts` to fetch link_url per new ad (cache: skip ads where mapping already exists with source=manual).
4. `etl/derive-utm-mappings.ts`: SQL query above + upsert with conditional on existing `source != 'manual'`.
5. `run-daily.ts`: invoke derive-utm-mappings after pull-shopify success.
6. Coverage data fn: `SELECT sum(spend) FILTER (mapped) / sum(spend) FROM meta_ad_insights_daily LEFT JOIN ad_product_map`.
7. Manual override UI: simple form on product page lists "Unmapped ads with spend in this range" → owner picks.
8. Refresh `product_pl` matview after mapping changes (matview reads ad_product_map).
9. Smoke: Brand A: count mapped vs total ad_ids, target ≥30% on first run (UTM dependent), 100% achievable manually.

## Todo
- [ ] Migration 0012 (ad_product_map full schema)
- [ ] creative-link.ts connector
- [ ] pull-meta.ts integration
- [ ] derive-utm-mappings.ts
- [ ] run-daily.ts orchestration
- [ ] get-ad-coverage data fn + banner
- [ ] Manual override UI on /products/[id]
- [ ] Brand A smoke + coverage measurement

## Success Criteria
- After one daily ETL on Brand A: `ad_product_map` has rows for ≥30% of ads with spend (URL-based + UTM-based combined).
- `/products` top banner shows "X% of $Y ad spend attributed".
- Owner manually maps one ad → product_pl reflects within next matview refresh.
- Re-running ETL doesn't overwrite manual mappings (confirmed via inserted manual map row before second run).

## Risks
- **Low UTM coverage:** if user has not used `{{ad.id}}` template in past Meta ads, only URL-derived works. Acceptable; banner motivates fix.
- **link_url parsing fragile:** URLs can be cloaked/shortened. Implement minimal regex `/products/([a-z0-9-]+)`; document as best-effort.
- **One ad → multiple products:** picking highest-frequency product is heuristic. Document; owner can manually override.
- **API call volume for link_url:** 1 extra Meta API call per new ad per day. Brand with 100 active ads = 100 calls/day, well within rate limits.

## Security
- Manual mapping UI owner-gated.
- No PII in `ad_product_map`.

## Next Steps
Phase 07 ships everything together with reconciliation + smoke matrix.
