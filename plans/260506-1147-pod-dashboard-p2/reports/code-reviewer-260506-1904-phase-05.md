# Code Review — Phase 05 Per-Product P&L View

**Date:** 2026-05-06 19:04 UTC
**Reviewer:** code-reviewer
**Scope:** d:/github local/pod-dashboard — 8 source files + 3 test files + 2 ETL files
**Score:** 7.5 / 10
**Verdict:** SHIP WITH FIXES — 2 HIGH issues to patch before refresh runs in prod, 4 MEDIUM, several LOW.

---

## TL;DR

Phase 05 is solid mathematically and the security posture (RLS view, service-role guard, server-action workspace re-derivation) is correct. The headline risks are **two correctness bugs in the matview** that won't be caught by the current unit tests because tests mock Supabase results rather than execute SQL:

1. **Refund attribution date drift** — `product_pl` buckets refunds by the *order* date, while `daily_pl` buckets by the *refund* `processed_at` date. The success criterion "Sum(product_pl.revenue) over date range = daily_pl.gross_revenue" will hold for revenue, but **net_profit divergence between the two views will be non-trivial and will look like a bug to operators**.
2. **Products with refunds-only / fees-only / ad_spend-only days are silently dropped.** `product_pl` is anchored to `product_revenue`; a product fully refunded on day D (zero net new revenue, but real refund) gets no row.

Neither will surface in tests with mocked rows. Both will surface the first time an operator clicks a product whose refund date ≠ order date — i.e. always, after the 30-day Shopify refund window kicks in.

Otherwise: code is well-organised, comments are excellent, RLS path is correct, validation in the server action is correct, no service-role leakage to `app/`. The two over-LOC files are justified by single-responsibility.

---

## Findings

### CRITICAL
None.

### HIGH

#### H1. Refund-date semantics diverge from `daily_pl` — operator will see two different "net profit" values for the same period

**File:** `supabase/migrations/0014_product_pl_matview.sql` lines 113-142
**Compare to:** `0003_daily_pl_matview.sql` lines 41-47

`daily_pl.refunds` uses `(processed_at at time zone 'UTC')::date` — refund lands on the day Shopify processed it.
`product_pl.refunds` is keyed by `old.d` which is the **order's** `created_at` date (see CTE `order_lines_dated` line 75 → propagated via `product_refunds.d`).

Real-world impact: an order created on April 1, refunded on April 15. In `daily_pl` the refund hits April 15. In `product_pl` it hits April 1.

**Why it matters:**
- The plan's own success criterion says: *"Sum(product_pl.revenue) on date range = daily_pl.gross_revenue (within rounding)."* That stays true.
- But the implicit corollary `Sum(product_pl.net_profit) ≈ daily_pl.net_profit` for the same date range **will not hold** when refunds straddle the range boundary. If the user looks at "Last 7 days" on home dashboard and "Last 7 days" on /products, the totals will differ by however many dollars of refunds processed in those 7 days but originated outside.
- Worse: a date range entirely after the order date but containing the refund will show the order's net profit on the home page with the refund subtracted, and the same range on /products will show $0 (the order isn't in range at all per `product_pl`'s order-date keying).

**Fix options:**
- (A) Re-key refunds by `(processed_at at time zone 'UTC')::date` to match `daily_pl`. Requires joining `shopify_refunds` independently rather than via `order_lines_dated`. Recommended.
- (B) Re-key `daily_pl.refunds` by order date. Breaking change to a shipped matview. Not recommended.
- (C) Document the divergence and add a footnote on /products. Punt.

**Recommendation:** option A. The pattern is similar to how `daily_pl` does it — group refunds by `processed_at`, then join to a per-product allocation share derived from the *original* order's line splits. Slightly harder than what's there but matches existing semantics.

---

#### H2. Products with refunds / ad_spend / fees but no revenue on a given day are silently dropped

**File:** `supabase/migrations/0014_product_pl_matview.sql` lines 264-269

```sql
from product_revenue pr
left join product_refunds  pref using (workspace_id, product_id, d)
left join product_cogs     pc   using (workspace_id, product_id, d)
left join product_ad_spend pa   using (workspace_id, product_id, d)
left join product_fees     pf   using (workspace_id, product_id, d)
left join product_app_subs pas  using (workspace_id, product_id, d)
```

The FROM is `product_revenue`, so the matview only contains rows where the product had **revenue on that day**. Combined with H1, refunds on a day after the original sale will produce no row (because there's no revenue that day). Ad spend on a day a product didn't sell? No row. Same for app_subs.

`daily_pl` correctly handles this with a `keys` CTE that's a UNION across all sources (lines 88-102). `product_pl` mirrors none of this.

**Worst case:** a brand running ads on a product that hasn't sold in the date range will see $0 ad_spend on /products and an over-stated "Unattributed ad spend" footer (because `unattributed_ad_spend` is computed in TS over all spend, regardless of map presence — see `get-product-pl.ts` line 204). The product's mapped ad spend will be computed correctly by `product_ad_spend` CTE but discarded by the FROM-anchor.

**Fix:** rewrite the FROM clause to mirror `daily_pl`:

```sql
keys as (
  select workspace_id, product_id, d from product_revenue
  union
  select workspace_id, product_id, d from product_refunds
  union
  select workspace_id, product_id, d from product_ad_spend
  union
  select workspace_id, product_id, d from product_fees
)
select k.workspace_id, k.product_id, k.d as date,
       coalesce(pr.units, 0)         as units,
       coalesce(pr.gross_revenue, 0) as gross_revenue,
       ...
from keys k
left join product_revenue  pr on ...
left join product_refunds  pref on ...
...
```

Note: `product_app_subs` is currently joined off `product_revenue` (line 236-237) so its key set already follows the over-narrow set — fix that too if you adopt the union-keys pattern.

---

### MEDIUM

#### M1. `split_part(...)::bigint` cast will throw on malformed GID and abort the entire matview refresh

**File:** `0014_product_pl_matview.sql` line 162

```sql
left join public.shopify_product_variants pv
  on  pv.workspace_id = old.workspace_id
  and split_part(pv.variant_id, '/', -1)::bigint = old.line_variant_id
```

Any row in `shopify_product_variants` with a malformed `variant_id` (no `/`, non-numeric tail, NULL → fine, but anything alpha) → cast throws → `REFRESH MATERIALIZED VIEW CONCURRENTLY` errors → ETL logs failure but the matview is left stale. The "best-effort, log-and-continue" behavior in `refresh-mv.ts` means this can rot quietly: dashboard shows stale numbers and the only signal is a console.error in the ETL log.

**Probability:** low if the Shopify GraphQL pull always writes well-formed GIDs. But there is no DB CHECK constraint on the format and no application-level validation in the upstream connector that I can see. One bad upstream row = matview stuck for that workspace forever.

**Fix:** wrap with a safe-cast pattern:

```sql
case
  when pv.variant_id ~ '^gid://shopify/ProductVariant/[0-9]+$'
  then split_part(pv.variant_id, '/', -1)::bigint
  else null
end = old.line_variant_id
```

Or add a generated column on `shopify_product_variants` that stores the parsed bigint with a CHECK / fallback to NULL. Faster join too (indexable).

#### M2. `unattributed_ad_spend` does not consider date filter on `ad_product_map` — but `ad_product_map` has no date column, which means it should be reviewed for staleness semantics

**File:** `app/(app)/products/_data/get-product-pl.ts` lines 194-206

```ts
const { data: mappedAds } = await supabase
  .from("ad_product_map")
  .select("ad_id")
  .eq("workspace_id", workspaceId);
```

Pulls ALL mapped ad_ids ever recorded for the workspace, then subtracts from the date-windowed Meta spend. This is correct **today** because Phase 06 hasn't shipped yet so the table is empty. After Phase 06: an ad mapped today and active 6 months ago will count as "attributed" for a 6-months-ago date range, even if the mapping didn't exist at the time. This is a Phase-06 concern but worth flagging now in this code so Phase 06 reviewer knows where to look.

**Fix:** none yet, but add a TODO comment near line 194 saying "Phase 06: revisit if ad_product_map gains a temporal validity column."

#### M3. `get-product-pl.ts` does aggregation in TypeScript that the matview already handles — duplicated logic and N rows × M days of materialization on the wire

**File:** `get-product-pl.ts` lines 132-176

The matview is keyed by `(workspace_id, product_id, date)`. The query selects all per-day rows in range, then re-aggregates per-product in TS. For a 500-product brand × 30-day range that's 15,000 rows over the wire on every page render, then summed in JS.

A SQL roll-up via a Postgres function or even an inline SELECT with `SUM(...) ... GROUP BY product_id` would cut that to 500 rows. Since this is server-side and `daily_pl_view` patterns in other files use range filters with no in-app aggregation, it's worth considering an RPC or an aggregating view.

**Why it's MEDIUM not HIGH:** for the target brand size (≤500 products) this is fine; first-paint <800ms target is achievable with the current shape. Flag for P3.

#### M4. `subtotal > 0` filter in `order_totals` silently drops free orders from refund + fee attribution

**File:** `0014_product_pl_matview.sql` line 109

```sql
where financial_status in ('paid', 'partially_refunded', 'refunded')
  and subtotal > 0
```

Combined with the INNER JOIN at line 139 (`join order_totals ot using (workspace_id, order_id)`), an order with subtotal=0 (100%-discount free order with shipping fee) **won't have refunds or fees attributed to its products**. The order isn't in the FROM-anchor `product_revenue` either if revenue=0. So free orders that later got refunded the shipping fee will silently skip the matview entirely.

Probably fine for POD (free orders are rare). Flag for awareness; not worth a fix unless Brand A has them.

---

### LOW

#### L1. `useEffect` in `variant-breakdown.tsx` cancels stale fetches but doesn't show a loading transition between two productIds

**File:** `variant-breakdown.tsx` lines 23-42

When the user expands product A, then immediately expands product B, the two component instances are different (key differs in parent), so React unmounts A's effect (cancellation flag fires) and mounts B's. Correct. But the `cancelled` flag only prevents `setRows`/`setError` calls — there's no AbortController on the underlying server-action fetch, so the wasted RTT still completes. For a single-row expand this is negligible; if a user mass-expands rows, the server churns. Cosmetic.

#### L2. JSX fragment used with `<tr>` siblings has no `key` for the iteration item — React warning likely

**File:** `products-table.tsx` lines 173-235

```tsx
return (
  <>
    <tr key={row.product_id} ...>
      ...
    </tr>
    {isExpanded && <VariantBreakdown ... />}
  </>
);
```

The fragment wraps a `<tr>` and a possible second `<tr>`. The outer fragment is the iteration item — React expects a `key` on the fragment, not the inner `<tr>`. Move to `<React.Fragment key={row.product_id}>`. If tests pass without a console warning that's because vitest hides it; check browser console.

#### L3. `getVariantBreakdown` has two separate scans of `filteredLines` for refund pro-ration

**File:** `get-variant-breakdown.ts` lines 217-265

`orderLineGrossTotals` is computed in a separate loop after the main aggregation, then `variantRefunds` does a third loop. Could fold into a single pass. Minor; tests pass; readability over micro-perf.

#### L4. `gidToNumber` returns `null` but later code calls `parseInt(meta.printify_variant_id, 10)` and double-checks `!isNaN(printifyId ?? NaN)` — defensive but ugly

**File:** `get-variant-breakdown.ts` lines 226-231

The `printifyId !== null && !isNaN(printifyId ?? NaN)` is unreachable in practice (`isNaN(null)` is false anyway in the way TS narrows here, and the guard is `!== null` first). Extract a helper or simplify to:

```ts
const printifyId = meta?.printify_variant_id
  ? parseInt(meta.printify_variant_id, 10)
  : NaN;
const unitCostCents = !isNaN(printifyId) ? (costMap.get(printifyId) ?? 0) : 0;
```

#### L5. Migration is non-replaceable — `create materialized view if not exists` is brittle for re-runs after schema change

**File:** `0014_product_pl_matview.sql` line 64

If H1 / H2 fixes ship in a follow-up migration, that migration must `drop materialized view if exists public.product_pl cascade;` first. Not a Phase-05 bug, but a Phase-06+ liability. Flag in the migration registry note.

#### L6. `formatMargin` uses `(pct * 100).toFixed(1)` — locale-insensitive

**File:** `products-table.tsx` line 100

`formatCurrency` takes a currency arg presumably for locale; `formatMargin` always uses `.` decimal. For non-US locales the rest of the page localizes, this column won't. Minor.

#### L7. No test exercises the `unattributed_ad_spend > 0 && empty rows` branch on the table footer

**File:** `products-table.tsx` line 240

If a brand has only unattributed Meta spend (no orders, no products with revenue), the table renders the empty-state `<p>` at line 127-133 and **never reaches the `<tfoot>`**. The unattributed amount is hidden. Minor edge but worth either dropping the early-return or showing a unattributed-only state.

---

## Edge Cases Found by Scout

1. **Sum-conservation regression after Phase 06 ships ad_product_map.** Today the only signal of ad-spend correctness is the unattributed footer. After Phase 06, any bug in the mapping will silently re-bucket spend per product. No QA hook in this phase to verify "Sum(product_pl.ad_spend) + unattributed_ad_spend == Sum(meta_ad_insights_daily.spend)" — recommend adding such an invariant test in Phase 06.

2. **GID format change.** Shopify has historically promised stability of GIDs, but the cast at 0014 line 162 will detonate on any future format change. Combined with M1, the matview can't self-heal.

3. **`shopify_orders.subtotal`-based proportion vs `line_gross` denominator.** The CTE uses `(line_gross_total / nullif(ot.order_subtotal, 0))`, but `line_gross_total` is product-level sum-of-line-gross (pre-discount), while `subtotal` from Shopify is post-line-discount and pre-order-discount. The two won't match for orders with line-level discounts: `Σ(product_share)` will not equal 1.0, so refunds attributed across products will not sum back to the order's refund. Either denominator should be `Σ(line_gross_total) over the order` (computed locally) or numerator should be post-discount. Subtle, hard to catch without a fixture order with line-level discounts.

4. **`active_product_count = 0` divide-by-zero** in `product_app_subs` — guarded with `nullif(...)`. Fine.

5. **`ad_product_map.product_id` is `text`** (line 41) but `product_pl.product_id` from `order_lines_dated` is `bigint::text`. The JOIN in `product_ad_spend` (line 173-181) uses `m.product_id` directly into the GROUP BY. Compatible only if Phase 06 also writes `product_id` as a stringified bigint. If Phase 06 writes a Shopify GID instead, the join dies silently (no rows match). Add a comment / CHECK constraint to lock the format.

6. **Migration ordering risk.** `_apply-0012-0013-bundle.sql` (visible in git) suggests migrations 0012-0013 had to be hand-applied on at least one env. If 0014 lands on an environment where 0012 (`shopify_product_variants`) hasn't been applied, the matview body fails to compile (table doesn't exist). The `if not exists` on the matview itself doesn't help if the inner SQL references a missing table.

---

## Positive Observations

- **Security posture is clean.** `security_invoker=true` view, RPC `security definer` granted only to `service_role`, server action re-derives workspace from session, never trusts client-supplied `workspaceId`. Service-role guard catches `app/` leaks. All correct.
- **Excellent SQL comments** in 0014 documenting the type-mismatch resolution and refund-allocation choice. Future maintainers will thank the author.
- **Best-effort refresh** in `refresh-mv.ts` is the right tradeoff — stale matview is recoverable; lost source data isn't.
- **Validation at boundary** in `fetch-variant-breakdown-action.ts` — ISO date regex, productId numeric check, workspace re-derive. Textbook.
- **Non-fatal title fetch degradation** in `get-product-pl.ts` lines 121-129 — degrades to `null` rather than failing the whole page. Good UX.
- **Tests for divide-by-zero, error propagation, graceful degradation** all present.

---

## Behavioral Checklist

- [x] Concurrency — Promise.all in refreshAllMatviews, useEffect cancellation flag.
- [⚠] Error boundaries — matview refresh logs and swallows; `subtotal > 0` filter silently drops orders (M4); GID cast throws inside refresh (M1).
- [x] API contracts — `ProductPlRow` shape stable, server action returns discriminated union.
- [x] Backwards compatibility — additive only. `daily_pl` untouched.
- [x] Input validation — ISO date regex, productId regex, workspace re-derived.
- [x] Auth/authz — `security_invoker` view + `is_workspace_member`. RPC granted only to service_role.
- [⚠] N+1 / efficiency — M3: full per-day matview rows pulled then re-aggregated in TS.
- [x] Data leaks — no PII logging, only error messages with table names.

---

## Recommended Actions (in order)

1. **Fix H1**: re-key `product_pl.refunds` by `processed_at` to match `daily_pl`. Add a sum-conservation invariant test (SQL or integration).
2. **Fix H2**: switch `product_pl` FROM-anchor to a `keys` UNION CTE following `daily_pl` pattern.
3. **Fix M1**: regex-guard the `split_part(...)::bigint` cast.
4. **Address scout #3 (line-discount denominator)** — either compute `Σ(line_gross)` locally or change numerator to post-discount.
5. **Add invariant test** for Phase 06 hand-off: `Σ(product_pl.ad_spend) + unattributed_ad_spend == Σ(meta_ad_insights_daily.spend)` over the same range.
6. Sweep the LOWs at convenience.

---

## Metrics

- Type coverage: clean (`npx tsc -p . --noEmit` reported clean).
- Test coverage: 24 new tests pass; 8 pre-existing Printify failures unchanged.
- Linting: not run in this review; report says guard:no-service-role passes.
- LOC over 200-line guideline: 3 files (`0014`: 310, `get-product-pl.ts`: 224, `get-variant-breakdown.ts`: 292, `products-table.tsx`: 259). Justified per dev report; agreed for `products-table.tsx` and `get-variant-breakdown.ts`. `0014` is fine for SQL. `get-product-pl.ts` could split (M3 above) but not urgent.

---

## Unresolved Questions

1. After H1 fix, do we expect `daily_pl.net_profit` and `Σ(product_pl.net_profit)` to match exactly, or is there a documented residual (e.g. `meta_reported_revenue` informational vs Shopify revenue)?
2. Is the line-level vs subtotal denominator mismatch (scout #3) going to bite Brand A given their typical discount usage?
3. Should `ad_product_map` gain a `valid_from`/`valid_to` for temporal mappings (Phase 06 question)?
4. Migration registry: is 0014 the next sequential, or should I cross-check given prior drift noted in agent memory (`feedback_migration_number_drift`)?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 05 ships a clean architecture and clean security posture, but two HIGH correctness issues in the matview (refund-date keying and FROM-anchor) will cause visible cross-view discrepancies. Recommend a small follow-up migration to address H1+H2 before P2 closes; M1 (GID cast) should ride along.
**Concerns/Blockers:** Two correctness regressions vs `daily_pl` semantics (H1, H2). Tests don't catch them because they mock SQL results.
**Score:** 7.5 / 10
