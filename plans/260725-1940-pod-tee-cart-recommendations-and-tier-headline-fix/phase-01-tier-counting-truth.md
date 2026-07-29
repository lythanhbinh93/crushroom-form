---
phase: 1
title: "Tier counting truth"
status: complete
priority: P1
effort: "3-4h"
dependencies: []
---

# Phase 1: Tier counting truth

## Step 1 verification result

**Step 1: NOT VERIFIED — shipped on safe default.**

Run on 2026-07-25 was unattended. Building a live cart and reading the applied
discount off a real checkout is a manual observation an agent cannot make
reliably, and inferring it from Admin API config alone was explicitly ruled out.

Shipped per the safe-default path:

- `dop_bundle_tier_basis` exists as a theme-global radio (`eligible` | `total`),
  default **`eligible`** — the current, under-promising behaviour.
- The Bug 1 multiplier fix is in and is correct regardless of the semantic.
- Bug 2 remains latent. Flipping the basis to `total` is a one-setting change
  in the theme editor once a human has watched the test cart.

**To close this:** put 1 bundle-eligible tee + 1 Shipping Protection in a live
cart, go to checkout, read the *discount* line (not the order total — SP's
$2.95 will otherwise look like a mismatch).

- $2 discount applies → counting is order-wide → set the setting to
  "All cart items, incl. Shipping Protection".
- No discount → counting is entitled-items-only → Bug 2 does not exist, leave
  the setting alone, and the phase is fully discharged.

Do not flip it without that observation. Under-promising is safe; over-promising
is a trust break.

## Step 2 — Shipping Protection collection membership

**Not independently confirmed.** The read-only Admin check was not run in this
session. It does not gate the shipped code: the snippet counts `bundle-eligible`
collection membership, and the user reports SP handling is already correct. If SP
*were* a member, `eligible_qty` would over-count by 1 — a pre-existing condition
this phase neither introduces nor fixes. Worth a 30-second confirmation during
Phase 04.

## Overview

Make the cart-drawer tier headline and progress bar state exactly what checkout
charges. Fixes two live arithmetic bugs. No new UI — this phase only corrects
numbers and the tier the copy targets.

## Requirements

**Functional**

- Verify empirically whether the live discounts' minimum quantity counts all cart
  lines or only `bundle-eligible` lines. All later requirements branch on this.
- Savings = `tier_amount × eligible_qty`, not `tier_amount × tier_threshold`.
- Tier selection uses the verified counting basis (`total_units` if order-wide,
  `eligible_qty` if entitled-items-only).
- "Add N more" targets the next **tier boundary**, not the next unit — marginal
  savings are non-monotonic (+$4, +$5, +$3, +$13, +$5), so "add 1 more" is the
  wrong ask at 3 items.
- Acknowledge already-earned savings when Shipping Protection alone has crossed a
  tier (e.g. 1 tee + SP already earns $2).
- Progress bar fill and `.hit` markers use the same counting basis as the copy.

**Non-functional**

- SSR-only where possible; the drawer already re-renders on every mutation.
- No new JS file. Extend `assets/dopamiles-stack-save.js` only if the bar needs a
  client-side recount.
- Under-promising is acceptable if a value is uncertain; over-promising is not.

## Architecture

### Two counts, not one

```liquid
{%- comment -%} total_units — ALL cart lines, Shipping Protection INCLUDED {%- endcomment -%}
{%- assign total_units = cart.item_count -%}

{%- comment -%} eligible_qty — bundle-eligible collection only, SP excluded {%- endcomment -%}
{%- assign eligible_qty = 0 -%}
{%- for item in cart.items -%}
  {%- assign handles = item.product.collections | map: 'handle' -%}
  {%- if handles contains 'bundle-eligible' -%}
    {%- assign eligible_qty = eligible_qty | plus: item.quantity -%}
  {%- endif -%}
{%- endfor -%}
```

`tier_basis` = `total_units` or `eligible_qty`, set by the Step 1 verification
result. Wire it as a single named assign so the decision is visible in one place
and reversible in one edit.

### Savings formula

```
tier_amount  = amount( tier_basis )        # $0 if <2, $2 if 2, $3 if 3-4, $5 if >=5
savings_now  = tier_amount × eligible_qty  # multiplier is ALWAYS eligible_qty
```

Only one automatic product discount applies at a time and Shopify picks the best
for the customer, which is what produces the $2 / $3 / $5 step function.

### Next-tier resolver

Parse `shop.metafields.bundles.tiers`, sort by `min`, find the first
`min > tier_basis`:

```
needed       = next_tier.min - tier_basis
savings_now  = amount(tier_basis)  × eligible_qty
savings_next = next_tier.amount    × (eligible_qty + needed)
```

Render `needed` in the copy, never a hardcoded 1. Expected outputs with SP
present (SP = 1 unit, not eligible), assuming order-wide counting:

| Cart | total | eligible | Saves now | Copy |
|---|---|---|---|---|
| 1 tee | 1 | 1 | $0 | Add 1 more · save $4 |
| 1 tee + SP | 2 | 1 | $2 | Saved $2 · add 1 more to save $6 |
| 2 tees | 2 | 2 | $4 | Saved $4 · add 1 more to save $9 |
| 2 tees + SP | 3 | 2 | $6 | Saved $6 · add 2 more to save $20 |
| 3 tees | 3 | 3 | $9 | Saved $9 · add 2 more to save $25 |
| 4 tees | 4 | 4 | $12 | Saved $12 · add 1 more to save $25 |
| 4 tees + SP | 5 | 4 | $20 | Max savings · saved $20 |
| 5 tees | 5 | 5 | $25 | Max savings · saved $25 |

Note the existing 5-state machine keys on exact `eligible_qty` values 1/2/3/4/5+.
With two counts in play the states must key on `tier_basis` for *which* tier and
`eligible_qty` for *how much*. Restructure to a resolver plus one render block
rather than five hardcoded branches — the branch count would otherwise multiply.

### Bar

Fill and markers currently use `eligible_qty`. Switch to `tier_basis` so the bar
and the copy cannot disagree. Marker labels keep total-savings phrasing but must
use `amount × eligible_qty` at the current position, not `amount × threshold`.

## Related Code Files

- Modify: `snippets/dopamiles-bundle-cart-headline.liquid` — two counts, resolver,
  restructured render, bar basis, marker label amounts.
- Modify: `assets/dopamiles-stack-save.js` — split the single SP-excluded count
  into `totalUnits` / `eligibleUnits`; keep SP exclusion for the multiplier only.
- Modify: `config/settings_schema.json` — add `dop_bundle_tier_basis`
  (radio `eligible` | `total`, default `eligible`) per the safe-default path.
  Theme-global, not section schema.
- Verify only, no change expected: `sections/dopamiles-cart-drawer.liquid` (render
  args), `snippets/dopamiles-stack-save.liquid` (PDP card — hypothetical
  quantities, no cart context, so unaffected).
- Fix stale comment: the header comment in
  `snippets/dopamiles-bundle-cart-headline.liquid` claims tag-based eligibility
  while the code uses collection membership. It contradicts itself in adjacent
  paragraphs.

## Autonomous execution — READ FIRST

Step 1 is a **manual live checkout observation**. An automated agent cannot
reliably build a cart and read the applied discount off a real checkout. Do not
guess it, and do not infer it from Admin API config alone.

**If running unattended, use the safe-default path:**

1. Implement `tier_basis` as a theme-global setting
   `dop_bundle_tier_basis` (radio: `eligible` | `total`) with default
   **`eligible`** — the current, under-promising behaviour.
2. Implement everything else in this phase, including the Bug 1 multiplier fix,
   which is correct regardless of the counting semantic.
3. Leave `dop_bundle_tier_basis` on `eligible`. Flipping it to `total` is a
   one-setting change a human makes after observing the test cart.
4. Record in this file: `Step 1: NOT VERIFIED — shipped on safe default`.

Under-promising is safe. Over-promising is a trust break and a support cost.
Never flip the basis to `total` without a recorded human observation.

## Implementation Steps

1. **GATE — verify the counting semantic.** Build a live cart with 1
   bundle-eligible tee + 1 Shipping Protection. Proceed to checkout. Record
   whether a $2 discount applies. Write the result into this file before
   continuing.
   - $2 applies → counting is order-wide → `tier_basis = total_units`.
   - No discount → counting is entitled-items-only → `tier_basis = eligible_qty`,
     Bug 2 does not exist, and only the multiplier fix below is needed.
   - **Cannot be observed (unattended run)** → follow the safe-default path above.
2. Confirm Shipping Protection is not a member of the `bundle-eligible` smart
   collection (rule is `PRODUCT_CATEGORY_ID = aa-1-13-8`). Read-only check; the
   user reports SP handling is already correct, so this is a confirmation, not a
   change.
3. Add `total_units` alongside the existing `eligible_qty` in the headline
   snippet. Introduce the single `tier_basis` assign.
4. Replace `bundle_tier_N_total = amount × N` with `amount × eligible_qty`
   computed at the current position.
5. Build the next-tier resolver off `shop.metafields.bundles.tiers` (sorted by
   `min`), returning `needed`, `savings_now`, `savings_next`.
6. Restructure the 5-state branch into resolver plus one render block. Preserve
   existing class names and DOM shape so CSS and the bar are untouched.
7. Add the already-earned state for SP-crossed tiers (1 tee + SP).
8. Point bar fill and `.hit` markers at `tier_basis`; update marker label amounts.
9. Split the count in `assets/dopamiles-stack-save.js` into `totalUnits` /
   `eligibleUnits`.
10. Rewrite the snippet's header comment to describe collection-based eligibility
    and both counts. Remove the tag-based claim.
11. Node tests for the resolver across the table above, including every SP row.

## Success Criteria

- [x] Step 1 verification result recorded in this file — recorded as NOT VERIFIED, shipped on safe default
- [x] Qty-4 renders $12, not $9
- [x] Qty-6 renders $30, not "$25+"
- [x] Every row of the Architecture table renders its stated copy — all 9 rows verified by rendering the snippet, not by arithmetic on paper
- [x] Bar fill, `.hit` markers, and copy all derive from the same `tier_basis`
- [x] 1 tee + SP acknowledges the already-earned $2 rather than claiming $0 — renders "Saved $2 · Add 1 more to save $6" when the basis is `total`
- [x] Header comment describes collection eligibility; no tag-based claim remains
- [x] `node --test` green including the SP rows — 36 tests
- [x] `shopify theme check` clean — 231 files, 0 offenses
- [x] No change to `.dop-bundle-cart-*` CSS — DOM shape preserved

### How the states were verified

`shopify theme check` parses Liquid but does not evaluate it, and it did not
catch an unclosed `{% if %}` introduced during this phase. The snippet was
therefore rendered through liquidjs against every row of the table, with Shopify
money filters stubbed. That harness found the unclosed tag and confirmed all
nine rows plus both empty-render guards. Kept out of the repo — see the phase
report for the standing recommendation to adopt it.

Marker labels at 1 tee still read `$4 / $9 / $25`, byte-identical to the values
the old hardcoded markup produced, so the fresh-cart path has no visible change.

## Risk Assessment

- **Step 1 comes back the other way.** Then Bug 2 is not real and the phase
  narrows to the multiplier fix. Explicitly fine — the gate exists to find this
  out cheaply. Do not pre-write copy that assumes order-wide counting.
- **Over-promising after the fix.** Currently the drawer under-promises, which is
  safe. A wrong fix in the other direction is a trust break. Every state must be
  checked against a real checkout total, not arithmetic on paper.
- **State explosion.** Two counts across five hardcoded branches is 10+ paths.
  Mitigated by collapsing to a resolver; if the restructure balloons, keep the
  five branches and inject resolver values into them instead.
- **`cart.item_count` semantics.** Confirm it is total units, not line count, for
  carts with quantity > 1 on a single line. A tee at qty 3 must read as 3.
- **PDP card divergence.** The PDP Stack & Save card shows hypothetical tier
  prices with no cart context, so it is unaffected. Do not "fix" it here — it is
  owned by `plans/260725-1737-pod-tee-stack-and-save-effective-per-unit-price`.
- **Marker label width.** Larger numbers ($30 vs $25) may widen labels; the
  overlapping plan already flagged mobile label collision at ~360px as accepted.
  Recheck in Phase 04.
