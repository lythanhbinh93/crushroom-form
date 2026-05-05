# Phase 02 — Source Connectors

**Status:** completed (code-complete; live smoke deferred until tokens loaded into Vault) · **Est:** 10-12h · **BlockedBy:** 01 · **Blocks:** 03, 04

## Completion summary (2026-05-05)
- Branch `phase-02-source-connectors` in pod-dashboard repo, ready to merge to main.
- 74 unit tests pass (vitest); `tsc --noEmit` clean.
- Connectors built: Shopify Admin REST (orders/products), Meta Marketing v22.0 (insights/ad-accounts), Printify v1 (shops/orders/products) + shared retry/paginate/rate-limit utilities.
- Code review: APPROVED_WITH_CONCERNS — 4 HIGH findings fixed in this PR (rate-limit reset, rate-limit atomicity, Meta SSRF, Meta TZ off-by-one). Reports: [code-reviewer-260505-1200](../../reports/code-reviewer-260505-1200-phase-02-connectors.md), [tester-260505-1154](../../reports/tester-260505-1154-phase-02-connectors.md).
- Smoke scripts at `scripts/smoke-{shopify,meta,printify}.ts` for user to run locally with real tokens (deferred to Phase 03 setup).
- Phase 03 carry-over notes: error-code coverage gaps (Meta 4/17/32/613), HTTP 4xx/5xx scenarios in Shopify/Meta, money type drift checks; structured request logger for `etl_runs` table; expose explicit `list({ cursor? })` form per spec; cursor persistence between runs.

## Context Links
- Plan: [plan.md](plan.md)
- Brainstorm: `plans/reports/brainstorm-260504-1115-pod-brand-dashboard.md`

## Overview
Build typed, paginated, retryable client libs for **Shopify Admin API**, **Meta Marketing API**, **Printify API**. Pure TypeScript modules — no DB writes. Phase 03 wires them into ETL.

## Key Insights
- Each API has different rate-limit semantics. Treat them as 3 distinct backoff strategies.
- Pagination differs: Shopify = `Link` header cursor, Meta = `paging.next` URL, Printify = page number.
- Date semantics matter: Meta uses ad-account timezone; Shopify uses store TZ; Printify uses UTC. Normalize all to UTC + store the source TZ on workspace row.
- Connectors must be **resumable**: caller passes a cursor, gets next page + new cursor. Phase 03 persists cursors.

## Requirements

### Functional
- `shopify.orders.list({ since, until, cursor? })` → paginated orders with line items, transactions, refunds
- `shopify.products.list({ cursor? })` → products with metafields (need `printify_product_id`)
- `meta.insights.list({ adAccountId, since, until, level: 'campaign'|'adset'|'ad', cursor? })` → daily insights
- `meta.adAccounts.list()` → ad accounts visible to token
- `printify.shops.list()` → all shops on token
- `printify.orders.list({ shopId, since, until, cursor? })` → POD orders with line items + cost breakdown
- `printify.products.list({ shopId, cursor? })` → product catalog (for variant cost map)

### Non-functional
- Each call retries on 429/5xx with exp backoff + jitter (3 attempts)
- Respects platform-specific rate limits (Shopify leaky bucket, Meta hourly, Printify per-minute)
- Logs every request with duration + status to a structured logger (consumed in P03 for `etl_runs`)
- Tests use recorded fixtures (no live API calls in CI)

## Architecture
```
lib/connectors/
├── shopify/
│   ├── client.ts             ← fetch wrapper, auth, retry, rate-limit
│   ├── orders.ts
│   ├── products.ts
│   └── types.ts
├── meta/
│   ├── client.ts
│   ├── insights.ts
│   ├── ad-accounts.ts
│   └── types.ts
├── printify/
│   ├── client.ts
│   ├── orders.ts
│   ├── products.ts
│   ├── shops.ts
│   └── types.ts
└── shared/
    ├── retry.ts              ← exp backoff + jitter
    ├── paginate.ts           ← async iterator helper
    └── rate-limit.ts         ← per-host token bucket
```

## Related Code Files
**Create:** all files under `lib/connectors/` (above tree).
**Read:** `lib/vault.ts` (from Phase 01).
**No edits.**

## Implementation Steps

### Shopify
1. `client.ts`: `createShopifyClient({ shop, accessToken })`. Base URL `https://{shop}.myshopify.com/admin/api/2026-04`. Header `X-Shopify-Access-Token`.
2. Parse `Link` header → next cursor. Helper `parseLinkHeader(res)`.
3. Respect `X-Shopify-Shop-Api-Call-Limit` header (e.g. `38/40`); pre-emptive sleep if >35.
4. `orders.list`: query `?status=any&updated_at_min=...&updated_at_max=...&limit=250&fields=...`. Include `line_items`, `transactions` via separate sub-request, `refunds`.
5. `products.list`: include `metafields(namespace:'printify')` to grab `printify_product_id`.
6. Types: trim Shopify's massive response to fields we use.

### Meta Marketing API
1. `client.ts`: `createMetaClient({ accessToken })`. Base URL `https://graph.facebook.com/v22.0/`.
2. Pagination: response `paging.next` is a full URL — follow it.
3. Rate-limit: parse `X-Ad-Account-Usage` JSON header; if `acc_id_util > 90`, sleep 60s.
4. `insights.list`: `GET /act_{adAccountId}/insights?level=ad&time_increment=1&time_range={...}&fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values&limit=500`.
5. `actions` array contains conversions; extract `purchase` action and `purchase` action_value as `meta_reported_revenue`.
6. `adAccounts.list`: `GET /me/adaccounts?fields=id,name,timezone_name,currency`.

### Printify
1. `client.ts`: `createPrintifyClient({ accessToken })`. Base URL `https://api.printify.com/v1/`. Auth `Bearer`.
2. Rate limit: 600 req / minute (global). Throttle ~8 req/s with token bucket.
3. `shops.list`: `GET /shops.json`.
4. `orders.list`: `GET /shops/{shop_id}/orders.json?limit=100&page=N&created_at_min=...`. Returns array; pagination by incrementing page until empty.
5. Each order has `line_items[].cost` (incl. shipping) and `line_items[].metadata.variant_id` to map to Shopify variant via product cross-ref.
6. `products.list`: `GET /shops/{shop_id}/products.json?limit=100&page=N`. Each product has `variants[].cost` and `external.id` = Shopify product GID. Goldmine.

### Shared utilities
1. `shared/retry.ts`: `withRetry(fn, { attempts: 3, baseMs: 500 })`. Retry on 429/5xx + network errors.
2. `shared/paginate.ts`: `async function* paginate<T>(fetchPage)` for clean callers.
3. `shared/rate-limit.ts`: per-host token bucket; lazy-init via WeakMap.

### Tests
- `vitest` set up in Phase 01? If not, add now.
- Record real responses as JSON fixtures (one-off via dev script with real token); test parsing/pagination logic against fixtures.
- Skip live calls in CI.

## Todo
- [ ] 1-6. Shopify connector
- [ ] 7-12. Meta connector
- [ ] 13-18. Printify connector
- [ ] 19-21. Shared retry/paginate/rate-limit
- [ ] 22. Vitest fixtures + green tests
- [ ] 23. Smoke-test each connector against real account (script in `scripts/smoke-{shopify,meta,printify}.ts`)

## Success Criteria
- Smoke scripts list ≥10 orders / insights rows / products from real account
- Tests pass against fixtures
- Rate-limit sim test: 1000 fake calls trigger backoff but never throw
- Each connector exports an `async function*` iterator AND a single-call `list({ cursor? })` form

## Risks
- Meta API version changes annually; pin v22.0 explicitly, not "latest"
- Shopify GraphQL is the long-term API but Admin REST is sufficient for v1 read-only — REST is locked for P1 to avoid GraphQL complexity
- Printify cost amounts in cents → easy to forget. Document loudly in types.

## Security
- All API tokens loaded from Vault at runtime (never hardcoded in fixtures or test files)
- Fixtures must redact tokens, store IDs, and ad account IDs
- Test secrets via `.env.test` git-ignored

## Next Steps
Phase 03 (Schema + ETL) calls these connectors and writes to Postgres.
