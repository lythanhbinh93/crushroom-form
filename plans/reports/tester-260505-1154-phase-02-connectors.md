# Phase 02 Connectors — Test Validation Report

## Baseline
- **npm test:** PASSED — 72 tests across 10 files
- **tsc --noEmit:** CLEAN — no type errors
- **Test duration:** 389ms

## Quality Spot-Checks

### shared/ (retry, paginate, rate-limit)
**Status:** STRONG

- **retry.test.ts (4 tests):** Excellent error path coverage. Tests both retryable (429, 503) and non-retryable errors. Verifies backoff count limits.
- **paginate.test.ts (2 tests):** Basic pagination with null cursor termination. Validates cursor passing. Does NOT test RFC 5988 Link header parsing (that's in shopify/orders.test.ts instead).
- **rate-limit.test.ts (3 tests):** Token bucket enforced correctly. Covers empty config (passthrough), capacity exhaustion + refill wait, and 1000 sequential requests. Does NOT test actual bursting after timeout.

### shopify/ (orders, products)
**Status:** STRONG

- **orders.test.ts (12 tests):** Excellent realistic mocking with Link header parsing. Tests pagination flow, money string preservation (total_price, subtotal_price, tax, discounts, line_items.price). Tests refunds, null fields (fulfillment_status, shipping_address), empty pages, date filtering (not in connector yet—looks ahead). Status param handling. GAP: No 4xx/5xx error tests (401, 403, 404, 429) — these should bubble from client, but connector never tests error propagation.
- **products.test.ts (9 tests):** Similar quality. Link header parsing, pagination, metafields extraction, price string preservation, status filter. GAP: Same as orders — no client error propagation tested.

### meta/ (insights, ad-accounts)
**Status:** ADEQUATE with notable gaps

- **insights.test.ts (12 tests):** Pagination via paging.next URL, parameter serialization (time_range JSON), level override, purchase_count/purchase_value extraction from actions/action_values arrays, spend as string preservation, empty data handling. GAP: No error testing. Meta returns specific error codes (4, 17, 32, 613 = rate limits per client.ts line 16) — NONE tested. No 4xx/5xx mock scenarios.
- **ad-accounts.test.ts (7 tests):** Account listing, field mapping, paging.next following, field list verification. GAP: Same — no error scenarios. No test for pagination across multiple pages (ad-accounts test only covers one page → one page2, no page3).

### printify/ (shops, orders, products)
**Status:** STRONG

- **shops.test.ts (5 tests):** Pagination, count matching, error propagation (one test). Good.
- **orders.test.ts (11 tests):** Pagination termination on empty page. Cost/shipping_cost in cents (numbers, not strings — correctly asserts type). Date filtering (since/until client-side). Metadata linking (shopify_order_id). Error propagation. EXCELLENT.
- **products.test.ts (7 tests):** Pagination on empty data. Variant mapping, cost/price in cents (number type). External ID (Shopify GID), provider/blueprint IDs, tags. Error propagation. EXCELLENT.

## Top Gaps for Phase 03 (Prioritized by Risk)

### 1. Meta error codes (4, 17, 32, 613) NOT tested — risk: HIGH
**Why:** Meta client.ts line 16 lists specific error codes as retryable. Tests never mock `error.code: 17` (User request limit) or `error.code: 4` (Application request limit). If Phase 03 ETL logs these errors, no evidence they were tested. Phase 03 retry logic depends on client's error classification.
**What's missing:**
- Mock Meta response with `{ error: { code: 17, message: "User request limit exceeded" } }` — verify withRetry catches it.
- Mock error code 4, 32, 613 separately.

---

### 2. HTTP 4xx error handling untested for Shopify/Meta connectors — risk: HIGH
**Why:** Shopify client.ts line 119 throws non-retryable Error on 4xx. Meta client.ts line 79+ classifies 429 as retryable but other 4xx as non-retryable. Tests never mock 401 (bad token), 403 (forbidden), 404 (shop deleted), or 429 (before retries exhausted).
**What's missing:**
- Shopify: Mock 401 → verify listOrders/listProducts reject with non-retryable error.
- Meta: Mock 401, 403 → verify they do NOT trigger retry.
- Both: Mock 429 at HTTP level (rate-limit header) — Shopify tests use RetryableError mock, not actual HTTP 429.

---

### 3. 5xx error handling partially untested — risk: MEDIUM
**Why:** retry.test.ts covers 503 in unit test, but no connector-level tests inject 5xx. If a connector makes 2 requests and the 2nd fails with 500, tests don't verify behavior.
**What's missing:**
- Shopify: Mock 502/503 on second page request → verify withRetry re-attempts full pagination.
- Meta: Mock 500 on paging.next request → verify behavior.

---

### 4. Pagination boundary cases untested — risk: MEDIUM
**Why:** No tests for exactly-at-limit responses, single-item pages, or large pages (1000+ items).
**What's missing:**
- Shopify: Test Link header with exactly 250 items (Shopify page size limit).
- Meta: Test ad-accounts with exactly 10,000 accounts (Meta limit) split across pages.
- Printify: Orders with single item per page (stress pagination logic).

---

### 5. Money/currency type drift untested — risk: MEDIUM
**Why:** Shopify tests assert price='string', Printify tests assert cost=number(cents). Tests do NOT verify what happens if API breaks contract (Shopify returns number, Printify returns string).
**What's missing:**
- Mock Printify response with `cost: "1299"` (string instead of number) → verify type error surfaced to ETL or handled gracefully.
- Mock Shopify response with `total_price: 49.99` (number instead of string) → same.

---

### 6. Empty/null field handling edge cases — risk: LOW to MEDIUM
**Why:** Tests cover null (fulfillment_status, shipping_address) but not undefined vs null vs missing field.
**What's missing:**
- Shopify: Order with missing line_items array entirely.
- Meta: Ad account with missing timezone_name.
- Printify: Product with empty variants array (should this error or return empty product?).

## Fixture Sanitization
- **Result:** CLEAN — no real tokens, store domains, or order IDs found.
- All access_token fields use PLACEHOLDER_TOKEN or omitted entirely.
- Example addresses, emails, order IDs all fake (example.com, @example.com, order-aaa-001).
- Shopify fixtures use mystore.myshopify.com (not a real shop).
- Meta fixtures use act_111, act_222 (not real ad account IDs).

## Test Organization Quality
- Helpers (makeMockClient, makeClient) are well-structured, consistent across files.
- Fixtures are hand-built JSON (not auto-generated), making intentional gaps obvious.
- Test names are descriptive (e.g., "paginates across multiple pages", "preserves money strings").
- No test interdependencies (each test is isolated, beforeEach/afterEach used correctly).

## Confidence Assessment
- **Happy path coverage:** HIGH — all three platforms paginate, filter, extract fields correctly.
- **Error path coverage:** LOW to MEDIUM — only Printify tests error propagation. Shopify/Meta lack HTTP error and platform-specific error code tests.
- **Type safety:** MEDIUM — money field types verified, but no regression tests for type drift.
- **Production readiness:** ADEQUATE with conditions — Phase 03 ETL should handle the identified error gaps or tests must be added first.

## Recommendations for Phase 03

1. **Before merging Phase 02:**
   - Add tests for Meta error codes (4, 17, 32, 613) in meta/insights.test.ts.
   - Add HTTP 4xx/5xx error tests to shopify/ and meta/ (copy pattern from printify/).
   - Verified Shopify client throws retryable on 429, non-retryable on 4xx.

2. **During Phase 03 ETL implementation:**
   - ETL must handle non-retryable errors (401, 403) gracefully — log and skip, or fail fast with clear message.
   - ETL must validate money field types at deserialization (catch Printify string-as-cost before DB insert).
   - Pagination stress-test: generate 10K+ records per connector, verify cursor state machine is correct.

3. **Post-Phase 03:**
   - Add integration tests (against staging APIs if available) to verify error codes match reality.
   - Monitor error logs for untested error scenarios (e.g., Meta error.code values we don't know about).

## Unresolved Questions
- Does Phase 03 ETL validate/coerce money types, or assume connector fixtures are correct? (If latter, add type-drift regression tests now.)
- What should happen if Shopify/Meta pagination cursor becomes invalid mid-sync? (Tests don't cover cursor expiration.)
- Are there Printify error codes (besides HTTP status) we should test? (No Printify client error code parsing found — seems simpler than Meta/Shopify.)

---

**Status:** DONE
**Summary:** 72 tests pass with strong happy-path coverage. Error handling gaps identified in Meta error codes, HTTP 4xx/5xx, and type drift; Shopify/Meta connectors lack error propagation tests that Printify includes. Fixtures are clean and realistic. Recommend adding error tests before Phase 03 to avoid production surprises.
