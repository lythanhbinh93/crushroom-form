# Phase 02 Connectors — Code Review

**Date:** 2026-05-05
**Reviewer:** code-reviewer agent
**Scope:** `lib/connectors/{shared,shopify,meta,printify}/` + tests + smoke scripts

## Summary
- **Verdict:** APPROVED_WITH_CONCERNS
- **Critical:** 0 | **High:** 4 | **Medium:** 6 | **Low:** 4

Well-structured, types are conservative, fixtures sanitized, money-as-string discipline consistent. Two real correctness bugs in shared utilities, one SSRF-class concern around Meta paging.next, and several spec deviations to reconcile with Phase 03.

## Findings

### HIGH
**[#H1] TokenBucket.configure resets bucket on every client creation — bypasses rate limit when multiple clients share a host**
- File: `lib/connectors/shared/rate-limit.ts:17-24`
- Risk: N parallel workspaces = N bucket resets per second = no rate limiting. 429 storm against Printify global 600/min limit; possible account ban.
- Fix: idempotent — only set bucket if `!this.buckets.has(host)`.

**[#H2] TokenBucket.acquire is not atomic — concurrent callers over-consume**
- File: `lib/connectors/shared/rate-limit.ts:26-40`
- Risk: parallel acquires both compute deficit, both sleep, both decrement. Defeats rate limiting under Phase 03 ETL fan-out.
- Fix: serialize via per-host promise chain.

**[#H3] Meta requestUrl follows paging.next without host validation — token leak risk**
- File: `lib/connectors/meta/client.ts` (requestUrl method)
- Risk: paging.next returned by API; access_token in query string. If a malformed/hijacked response returns next URL on different host, token gets sent to attacker. Stripe/HackerOne paging-redirect class.
- Fix: assert `new URL(fullUrl).hostname === 'graph.facebook.com'` before fetch.

**[#H4] Meta time_range ignores ad-account timezone — silent off-by-one**
- File: `lib/connectors/meta/insights.ts` (toIsoDate)
- Risk: `toISOString().slice(0,10)` returns UTC date. Caller passing 11pm Pacific gets next day's UTC date — Meta queries wrong day in account TZ.
- Fix: accept timezone param; or document "callers must pass UTC midnight Date" and assert.

### MEDIUM
- **[#M1]** Shopify request returns malformed body silently as zero-result. Shape-validate at client boundary.
- **[#M2]** Spec deviation: structured request logging not implemented. Phase 03 needs `etl_runs` rows.
- **[#M3]** Shopify transactions sub-fetch deferred without ticket ref.
- **[#M4]** Printify pagination has no max-page guard. Cap at e.g. 10000 to prevent infinite loop.
- **[#M5]** parseFloat on Meta money introduces precision loss. Keep raw string + Phase 03 converts to cents.
- **[#M6]** Printify `metadata.template_id` typed as `string` but fixtures contain `null`. Should be `string | null`.

### LOW
- **[#L1]** Dead variable `isFirstPage` in meta/insights.ts.
- **[#L2]** Shopify Link-header regex too permissive on `>` chars.
- **[#L3]** Printify client doesn't honor `Retry-After` header on 429.
- **[#L4]** Smoke scripts log customer PII (emails, addresses).

## What's good
- Money-as-string discipline consistent and loudly documented.
- Pagination uses Shopify full-URL Link cursor + Meta full-URL paging.next (no reconstruction bugs).
- RetryableError vs plain Error mapping clean.
- No real tokens, store domains, ad-account IDs in fixtures.
- Shopify error logs use `body.slice(0, 200)` (bounded).
- withRetry defaults conservative (3 attempts, 8s cap, jitter).
- No `as any` / `as unknown` casts in connector source.
- All connector files <200 LOC.
- Tests assert money-string typing — catches coercion regressions.

## Unresolved questions
1. Token rotation mid-stream during long backfills (Phase 03?).
2. Cursor persistence: spec asks for `list({ cursor? })` single-page form (success criteria line 113) NOT exposed. Generator-only intentional or needs adding?
3. Meta paging.next host allowlist: only `graph.facebook.com`, or also `business.facebook.com` / regional CDNs?
4. Printify rate limit: 600 req/min global across token, or per-shop?

## Action plan
**Fix before merge (this PR):** H1, H2, H3, H4, M6, L1
**Defer to Phase 03 (document only):** M2, M3, M5
**Cheap safety nets to add now:** M1 (shape guard), M4 (max-page)
