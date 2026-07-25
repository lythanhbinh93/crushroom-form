---
phase: 1
title: "Reconcile bundle eligibility"
status: todo
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Reconcile bundle eligibility

## Overview

Make the set of products the storefront advertises as bundle-eligible identical
to the set the checkout Function actually discounts. Today the theme gates on
smart-collection membership (579 products, rule = T-shirt category) and the
Function gates on the `bundle-eligible` product tag (213 products). Close the
gap by tagging every active T-shirt.

This is a live-data operation, not a code change. It is a prerequisite for
advertising exact after-discount prices in Phase 02.

## Requirements

- Functional: every product rendering the Stack & Save card carries the
  `bundle-eligible` tag, so the Function discounts it at checkout.
- Non-functional: reversible; no product field other than `tags` is modified.
- Safety: confirm the target set by count before writing.

## Architecture

Two eligibility predicates exist and must converge:

```
theme    snippets/dopamiles-stack-save.liquid:33
         product.collections | map:'handle' contains 'bundle-eligible'
           └── smart collection, rule: PRODUCT_CATEGORY_ID EQUALS
               gid://shopify/TaxonomyCategory/aa-1-13-8   (T-shirts)

function extensions/bundle-discount/src/cart_lines_discounts_generate_run.graphql
         product { hasTags(tags: ["bundle-eligible"]) }
```

Converging by **adding tags** (rather than narrowing the theme) preserves the
upsell on all tees and matches the storewide Stack & Save positioning. The
collection rule stays untouched, so newly added tees keep auto-joining the
collection — meaning this is a recurring maintenance duty, not a one-off. Step 5
records that.

## Related Code Files

- Modify: none (live product data only)
- Read for context: `snippets/dopamiles-stack-save.liquid` (line 33 predicate)
- Read for context: `extensions/bundle-discount/src/cart_lines_discounts_generate_run.graphql`

## Implementation Steps

1. **Confirm the gap before writing.** Re-run the counts; abort if they have
   drifted materially from the planning snapshot (583 / 581 / 213):

   ```graphql
   {
     allProducts: productsCount { count }
     tshirtCategory: productsCount(query: "category_id:aa-1-13-8") { count }
     tagged: productsCount(query: "tag:bundle-eligible") { count }
     gap: productsCount(query: "category_id:aa-1-13-8 AND -tag:bundle-eligible AND status:active") { count }
   }
   ```

2. **Spot-check the target set.** List 5 products from `gap` and confirm they are
   genuinely tees that should be discountable — not samples, bundles, gift
   cards, or the Shipping Protection product.

3. **Apply the tag.** Preferred path is the Admin UI bulk editor (no rate
   limits, no partial-failure states):

   Products → filter **Category = T-shirts**, **Status = Active** → select all →
   *Add tags* → `bundle-eligible` → Save. Re-tagging already-tagged products is
   idempotent.

   API fallback, batched, one call per product id:

   ```graphql
   mutation ($id: ID!, $tags: [String!]!) {
     tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
   }
   ```

4. **Verify convergence.** The gap query from step 1 must return `0`:

   ```graphql
   { gap: productsCount(query: "category_id:aa-1-13-8 AND -tag:bundle-eligible AND status:active") { count } }
   ```

5. **Record the maintenance duty.** The smart collection auto-adds new tees but
   nothing auto-tags them, so every new tee needs the tag or it will advertise a
   discount it does not get. Note this in the product-creation runbook, or
   change the theme predicate to the tag in a follow-up so one gate governs both.

6. **Confirm enforcement end-to-end.** Add 3 units of a *newly tagged* product
   to cart and reach checkout; confirm a $3/each bundle discount appears.

## Verification Log

Steps 1-2 completed 2026-07-25 against the live store:

| Query | Count |
|---|---|
| All products | 583 |
| T-shirt category (all statuses) | 581 |
| T-shirt category, active | 571 |
| Carrying the tag (all statuses) | 213 |
| **Active tees missing the tag (the gap)** | **361** |
| Tagged but NOT a tee | 0 |
| Active products outside the tee category | 0 |

`product_type:'T-Shirt'` and `category_id:aa-1-13-8` select the **identical**
571 active products (both exclusion counts are 0), so the admin product-type
filter is a safe stand-in for the taxonomy filter.

Spot check of 6 gap products — `aaahhhhh-running-t-shirt`, `runs-well-with-coffee`,
`slow-running-buddy`, `all-these-shoes`, `all-i-need`,
`pheidippides-one-star-review` — all genuine active tees, $27.99-$29.99.

Shipping Protection (`shipping-protection`) is status `UNLISTED`, category
`Shipping Insurance`, untagged — correctly excluded by both the category and the
status filter. No risk of tagging it.

Cheapest tee is $27.99, so tier 5 ($5 off) floors at $22.99. **The
`t_eff_cents < 0` clamp in Phase 02 is defensive only — no product in the
current catalog can trigger it.**

## Success Criteria

- [ ] Gap query returns 0 active T-shirts without the tag
- [ ] Tagged count ≈ category count (±small drift from draft/archived products, explained)
- [ ] Checkout applies the tier discount on a product that was untagged before this phase
- [ ] No product attribute other than `tags` changed
- [ ] Recurring-tagging duty recorded somewhere durable

## Risk Assessment

- **Over-tagging non-tees.** Filtering by taxonomy category (not a text search)
  keeps the set precise. Spot-check in step 2 is the guard. Reversal is
  `tagsRemove` on the same filter.
- **Margin impact.** ~366 additional products become genuinely discountable.
  Accepted by the user during planning; flagged again here because it is the
  one hard-to-walk-back consequence — customers who see the price will expect it.
- **Drift after this phase.** New tees auto-join the collection but not the tag.
  Step 5 is the mitigation; the durable fix is switching the theme predicate to
  the tag.
