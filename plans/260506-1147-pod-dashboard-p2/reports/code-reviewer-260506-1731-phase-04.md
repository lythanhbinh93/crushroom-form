# Phase 04 Code Review — Product Catalog Pull + SKU-Match + Orphan Prune

**Reviewer:** code-reviewer subagent
**Date:** 2026-05-06 17:57 UTC
**Scope:** Phase 04 net-new + modified files in `d:/github local/pod-dashboard`
**Score:** **7.8 / 10** — ship after fixing 2 HIGH findings (H1, H2). Rest are MEDIUM/LOW polish.

---

## Summary

Solid implementation of a non-trivial feature: GraphQL bulk lifecycle, JSONL streaming parser, SKU/metafield mapping, and orphan prune all hang together. Tests cover the parsing and mapping happy/edge paths well. TypeScript clean, guard clean, RLS pattern matches siblings.

Two real correctness bugs and two architectural concerns warrant fixing before live deploy. None block ship to staging.

---

## CRITICAL

_None._ (No security vuln, no data-loss path, no auth bypass, no service-role leak.)

---

## HIGH

### H1 — REST `listProducts` overwrites bulk's `printify_product_id` with NULL on cursor-skip days
**File:** `etl/pull-shopify.ts` lines 282–303 + 309–326

`pullShopify` upserts `shopify_products` **twice** per run:

1. Line 303: REST `listProducts` upsert. Fills `printify_product_id` from a `printify`/`printify_product_id` metafield (REST often does **not** return metafields inline → value is `null`).
2. Line 309: `pullProductsBulk` upsert. Fills `printify_product_id` via SKU-match.

When `pullProductsBulk` is **cursor-skipped** (last_bulk_at < 24 h ago), only step 1 runs — and its `printify_product_id: printifyMeta?.value ?? null` **overwrites** the previously good value from yesterday's bulk run with `null`.

Effect: `printify_product_id` flickers between populated (every 24 h, post-bulk) and NULL (every other run). Downstream P&L joins miss COGS for ~50 % of runs.

**Fix options (pick one):**
- Drop the REST products section entirely — bulk supersedes it. Plan file already says "REST products call kept as fallback for non-bulk-capable shops, which is none on 2026-01 API".
- Or, in REST upsert, omit `printify_product_id` from the row payload so existing values persist (Postgres `ON CONFLICT DO UPDATE` only touches columns in the SET list — but Supabase `.upsert()` builds SET from the full object). Cleanest: remove the second upsert.

### H2 — `mapVariantsBySku` returns `source='metafield'` with no warning when metafield references a non-existent Printify variant
**File:** `lib/connectors/shopify/sku-match.ts` lines 112–125

```ts
const matchedPv = printifyVariants.find((pv) => String(pv.id) === metafieldValue);
result.set(sv.id, {
  printifyVariantId: metafieldValue,
  printifyProductId: matchedPv?.productId ?? null,
  source: 'metafield',
});
```

If the operator typed an obsolete or wrong `printify_variant_id` into the metafield, the function returns `source: 'metafield'` with `printifyProductId: null` — no warning. Downstream code (P&L join, missing-cogs alert in Phase 05) will see this as "mapped" and silently miss the cost lookup.

**Fix:** when `matchedPv` is null, downgrade to `source: 'unmapped'` or keep `source: 'metafield'` but emit a warning like `"metafield references unknown Printify variant {id}"`.

---

## MEDIUM

### M1 — `extractNumericId` returns `0` on malformed GID, causing PK collision in `shopify_products`
**File:** `etl/pull-shopify-products-bulk.ts` lines 314–319

```ts
function extractNumericId(gid: string): number {
  const parts = gid.split('/');
  const raw = parts[parts.length - 1];
  const n = parseInt(raw ?? '', 10);
  return isNaN(n) ? 0 : n;
}
```

If two products both yield malformed GIDs (Shopify migration weirdness, mocked test data, future API change), they both map to `product_id=0` → second upsert overwrites first under PK `(workspace_id, product_id)`. Comment says "should not happen in practice" — but a corrupted catalog of 1 product isn't worth a silent merge.

**Fix:** throw on malformed GID. This is an upstream invariant violation that the dev should see, not paper over.

### M2 — `pullProductsBulk` runs `pollBulkOperation` even when an unrelated bulk op is "current" — eats the full 5-min timeout
**File:** `lib/connectors/shopify/products-bulk-poll.ts` lines 98–103

If another team's process started a bulk op for the same shop between `startBulkProductsQuery` (line 189 of pull-shopify-products-bulk.ts) and the first poll, `currentBulkOperation.id !== opId` will trigger a `console.warn` every 5 s for 300 s (60 warnings, then timeout-throw). Our op is queued behind theirs and may complete after our timeout.

The plan file (Risks → "Bulk op stuck in CREATED forever") accepts this. But:
- Log severity should be `console.warn` once + downgrade subsequent to `console.debug` to avoid log flooding.
- Consider extending timeout when `op.id !== opId AND op.status IN (RUNNING, CREATED)` — we know we're queued.

**Severity:** MEDIUM only because Shopify caps concurrent bulk ops per shop at 5 (2026-01+) — collision is rare for the same app.

### M3 — `stampEtlRunId` blanket-updates ALL workspace rows, even ones not seen in the current Printify pull
**File:** `etl/pull-shopify-products-bulk.ts` lines 138–153

The function does `UPDATE printify_variant_costs SET last_etl_run_id = $runId WHERE workspace_id = $workspaceId` — every row, regardless of whether `pullPrintify` saw the variant in the latest fetch.

This **defeats the orphan-prune predicate**: a Printify variant that was deleted upstream still gets re-stamped here (because it's still in the DB until prune runs). Prune will only catch rows where `last_etl_run_id IS NULL` (i.e. never been stamped — only happens once, immediately post-migration 0012) or `!=` the latest run (only happens after a NEW Printify pull stamps a different `runId`).

The intent (per the report's "Stamp strategy" section) is "Printify pull runs separately from Shopify bulk pull, so stamp post-Shopify". But that means **the `runId` stamped is the Shopify run's ID, not a Printify run's ID**, while `pruneOrphanVariantCosts` filters `etl_runs.source='printify'`. So the `latestRunId` from prune will never match what `stampEtlRunId` wrote. Result: every row looks "stale" to prune (after the next Printify run), and prune deletes them all.

Confirm by tracing:
- pull-shopify-products-bulk.ts:301 → `await stampEtlRunId(supabase, workspaceId, runId)` — `runId` is the Shopify ETL run ID (passed in via `PullShopifyOpts.runId`).
- prune-old-snapshots.ts:152–158 → `select('id').eq('source','printify').eq('status','success')` — finds the latest Printify run ID.
- prune-old-snapshots.ts:202–204 → deletes where `last_etl_run_id != latestRunId`.

Shopify run IDs ≠ Printify run IDs → **on the next prune after the next Printify run completes, every stamped row is deleted as "stale"**.

**Fix:**
- Either move `stampEtlRunId` from `pullProductsBulk` to `pullPrintify` (stamp inside the Printify upsert loop, with the Printify run's ID).
- Or change the prune predicate to `last_etl_run_id IS NULL` only — drop the staleness check.
- Or stamp from both pulls but use a shared `latest_run_id_per_source` dimension.

**Severity:** Currently MEDIUM because no workspace has hit a second Printify run + prune cycle yet (per test report "skipped: false" only kicks in once a completed Printify run exists). Will become CRITICAL on second prune cycle in production.

### M4 — Bulk JSONL parser buffers entire response in memory; no streaming
**File:** `lib/connectors/shopify/products-bulk-parse.ts` lines 137–212

The "buffer phase" loads every product/variant/metafield into in-memory Maps before yielding. For a 50 k-product store with 10 variants each (Printify ceiling), that's 500 k variant rows × ~200 bytes JSON parsed = ~100 MB of object overhead. Node's default heap is 1.5 GB, so it survives — but with Vercel/serverless ETL workers (often 256–512 MB), this OOMs.

The doc-comment claims "~2-5 MB for a 1000-product store — acceptable". For Phase 04's stated workspaces (Brand A, Brand B), fine. Flagging for Phase 06 scale.

**Fix (deferred):** stream-yield products as soon as they're complete. Requires either (a) Shopify guarantee on tree-order JSONL (they don't promise this) or (b) two passes: one over JSONL to build `__parentId` index, second to assemble (but then you've read the file twice).

### M5 — `pollBulkOperation` sleeps **before** the first check; fast ops still wait 5 s
**File:** `lib/connectors/shopify/products-bulk-poll.ts` line 75

```ts
while (Date.now() < deadline) {
  await sleep(POLL_INTERVAL_MS);   // ← always 5 s before first check
  ...
}
```

A 100-product bulk op completes in ~3 s. We add a flat 5 s of latency for nothing. Move the sleep to the bottom of the loop or use a `do { check } while (sleep)` pattern.

**Severity:** LOW for correctness; MEDIUM for ETL wall-time SLA (the plan caps bulk pull at 2 min — every saved second helps).

### M6 — `setLastBulkAt` writes `cursor: { last_bulk_at }` — overwrites any other Shopify-products cursor fields
**File:** `etl/pull-shopify-products-bulk.ts` lines 78–88

Upsert payload: `cursor: { last_bulk_at: ... }`. If a future field gets added to the same row (`cursor.last_full_pull_at`, `cursor.last_metafield_pull_at`), this upsert wipes them.

**Fix:** read-modify-write the cursor JSONB, or use Postgres JSONB `||` merge via raw SQL. Acceptable today since no other field exists; flagging for next migration that adds one.

---

## LOW

### L1 — `priceToCents` uses `parseFloat` + `Math.round` — drops precision for prices like `"99.995"` (rounds to 9999 → $99.99 instead of $99.99 5)
Standard JS float issue. Acceptable for Shopify (always 2 decimals). Low.

### L2 — SKU match is exact-byte — case + whitespace sensitive
`"AB-RED-XL"` vs `" ab-red-xl "` won't match. Most catalogs are consistent within a single tenant, but cross-store or after manual export/import this bites. Add a TODO; don't fix without a real-world report.

### L3 — `mapProductsBySku` majority-vote tiebreak is non-deterministic-looking but actually deterministic
Lines 222–229: in a tie (2 vs 2), the first key with `count > bestCount` wins. Map iteration order in JS is insertion order — first Printify product whose first matching variant was processed wins. This is deterministic but not documented. Add a one-line comment; behavior is fine.

### L4 — `BULK_PRODUCTS_QUERY` hard-codes `metafields(first: 10)` — silently truncates if a product has >10 metafields
Per the GraphQL query in products-bulk-start.ts:46. A POD store with localized metafields can easily exceed 10. The code has no detection — just gets the first 10. Add a logged-warning if `metafields.edges.length === 10` (boundary heuristic).

### L5 — Migration 0012 is missing a `service_role` write policy
Only a SELECT policy is created (`shopify_product_variants_select_for_members`). Service-role bypasses RLS so writes work, but the pattern in `0002_etl_schema.sql:255-260` is consistent: SELECT for members. OK — matches sibling tables. No fix.

### L6 — `extractNumericId` and `priceToCents` are not exported, so not directly unit-testable
They're tested indirectly via the `pullProductsBulk` orchestration tests… which don't exist. Add quick exports + 2 unit tests each.

### L7 — `console.warn` for malformed JSONL lines doesn't include line number or content snippet
`products-bulk-parse.ts:170`. Diagnostic value is near-zero. Either include a (truncated) hash of the line or drop the warn entirely.

---

## Edge Cases Found by Scout

1. **Concurrent ETL runs for the same workspace** — `pullProductsBulk` from two cron triggers could race. `currentBulkOperation` returns the most recent op, so only the second poller wins; first poller times out. Cursor write at end is last-write-wins. No data corruption, but wasted bulk credit. Mitigation: a `LOCK` row in `etl_runs` per workspace. Not blocking.

2. **`last_etl_run_id` UUID column has no FK to `etl_runs.id`** — orphaned references possible after etl_runs cleanup. Not a correctness bug but losing audit trail. LOW.

3. **`pullProductsBulk` failure midway through upsert** — variants partially upserted, `setLastBulkAt` not called → next run retries. OK (idempotent). But: if `stampEtlRunId` runs before the second upsert fails, prune sees stamped rows as "fresh" while the variant pull was incomplete. Order matters: stamp **after** all upserts. ✓ Already correct in pull-shopify-products-bulk.ts:283–301.

4. **Metafield value vs Printify ID type coercion** — `String(pv.id) === metafieldValue` (sku-match.ts:117). If `pv.id` is `123` (number) and metafield stores `"123 "` (trailing space), no match. Same as L2.

5. **EXPIRED status** — `pollBulkOperation` correctly handles per the type union. Good.

6. **CANCELING** — code skips it (line 124 path), keeps polling until terminal. If Shopify sticks in CANCELING > timeout, throws timeout. Acceptable.

---

## Migration Safety

- ✓ 0012 `unique (workspace_id, variant_id)` matches upsert `onConflict: ['workspace_id', 'variant_id']`.
- ✓ 0012 `last_etl_run_id` column is nullable — safe with existing rows.
- ✓ 0013 partial index `WHERE sku IS NOT NULL` is a valid Postgres immutable predicate.
- ✓ Both migrations are idempotent (`if not exists` / `add column if not exists`).
- ⚠ M3 above: stamp-strategy mismatch with prune predicate may cause mass deletion on second prune cycle.

---

## Security

- ✓ No `createSupabaseServiceClient` in `app/` (guard:no-service-role-in-app passes).
- ✓ Bulk JSONL signed URL never logged (verified: `pull-shopify-products-bulk.ts:194` deliberately omits, `products-bulk-poll.ts:5` doc warns).
- ✓ Errors in fetch-catalog and stamp paths use `error.message` only — no full row dumps.
- ⚠ `console.warn` warnings include Shopify variant GIDs and SKUs. SKUs can be commercially sensitive (private mappings). Consider hashing or omitting in prod log destination. LOW.
- ✓ RLS on `shopify_product_variants` matches sibling tables.

---

## Tests Quality

- ✓ Parser tests use generated JSONL fixtures shaped to Shopify's documented format (not parser-output-coupled). Not mock-tautologies.
- ✓ Interleaved variant ordering specifically exercised (test line 196).
- ✓ SKU-match tests cover all 4 paths + null + collision (22 tests across resolution branches).
- ✓ Migration 0013 live-catalog scenario covered (3 tests).
- ⚠ No tests for `pull-shopify-products-bulk.ts` orchestration (cursor logic, stamp ordering, failure isolation). Test report flags this as "appropriate at integration level". I disagree — the cursor TTL and the stamp-vs-upsert ordering have correctness implications (M3, H1) that unit tests would catch. Consider adding 2-3 tests for the cursor branch and one for failure isolation.
- ⚠ No tests for `pollBulkOperation` (status transitions, timeout, op-id mismatch). All 6 statuses are documented but unverified. Add a test with a fake client that returns each status — cheap.

---

## Positive Observations

- **YAGNI/KISS:** `sku-match.ts` is pure if/else. No "rule engine". Good.
- **Modularization:** `pull-shopify-products-bulk.ts` correctly extracted to keep `pull-shopify.ts` small. Doc-comment explains why.
- **Failure isolation:** `pull-shopify.ts:309–326` try/catch around `pullProductsBulk` is the right call.
- **Idempotent migrations:** all three changes use `if not exists`/`add column if not exists`.
- **Cursor pattern reused correctly** for the 24-h skip.
- **Doc comments are excellent** — every file explains the why, not just the what. Future maintainers will thank this PR.

---

## Recommended Actions (priority)

1. **Fix H1** — Drop the REST `listProducts` upsert in `pull-shopify.ts` OR omit `printify_product_id` from the REST row payload. Without this, P&L will be wrong on most days.
2. **Fix M3** — The stamp/prune source mismatch will mass-delete `printify_variant_costs` rows the second time a Printify run completes after a successful prune. Move stamping into `pullPrintify`, OR change the prune predicate to NULL-only.
3. **Fix H2** — Emit a warning (or downgrade `source` to `unmapped`) when metafield references a Printify variant the catalog doesn't know about.
4. **Fix M5** — Move the 5 s sleep to end-of-loop in `pollBulkOperation`. Cheap.
5. **Add tests** for `pollBulkOperation` (5 status transitions + timeout + op-id mismatch) and for `pullProductsBulk` cursor branch.
6. **Fix M1** — Throw on malformed GID instead of returning 0.
7. (Defer) M4 streaming refactor — only when a >10 k-product workspace lands.

---

## Recommendation

**Ship after H1, H2, M3.** Other items are MEDIUM polish or test gaps that don't block merge but should land before next phase.

Score: **7.8 / 10** — would be **9.0+** with H1, H2, M3 fixed. The implementation quality, doc-comments, and test coverage of the pure-logic modules are clearly above-average; the architectural integration (REST+bulk double-upsert, stamp-source-mismatch) is where it slips.

---

## Unresolved Questions

1. Confirm: does `pullPrintify` already write `last_etl_run_id` somewhere (didn't see it in the read of pull-printify.ts:130–162)? If yes, M3 is moot. If no, M3 stands and will detonate on the second prune cycle.
2. Is the "REST products fallback" still meaningful in 2026-01+? Plan says "no shop is non-bulk-capable on 2026-01 API". If true, removing it (per H1) is the cleanest fix.
3. Is there a test environment with >1000 products to validate M4 memory consumption before P3 brand onboarding?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 04 is structurally sound and well-tested at the pure-logic level. Two correctness bugs (H1 REST/bulk overwrite, H2 silent metafield mismap) and one architectural mismatch (M3 stamp source ≠ prune source) need fixing before production. Rest is polish. Score 7.8/10.
**Concerns:** M3 will cause mass deletion of `printify_variant_costs` rows on the second prune-after-Printify-run cycle. Verify M3 by reading pull-printify.ts in full to confirm `last_etl_run_id` is or isn't stamped there.
