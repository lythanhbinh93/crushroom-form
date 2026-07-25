---
phase: 3
title: "QA and ship"
status: todo
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: QA and ship

## Overview

Verify the price is true for every size band, survives variant and cart
interaction, and only then push to the live theme. Phase 01 is a hard gate: do
not ship an exact advertised price while ~366 products still fail the Function's
tag check.

## Requirements

- Functional: displayed price matches what checkout charges, for every size band.
- Non-functional: no Lighthouse or layout regression on the PDP buy column.
- Process: live push verified by pulled-source diff, not the CLI success banner.

## Related Code Files

- Verify: `snippets/dopamiles-stack-save.liquid`, `assets/dopamiles-stack-save.js`,
  `assets/dopamiles-stack-save.css`
- Do not push: `templates/*.json`, `config/settings_data.json` (`.shopifyignore`;
  live merchant JSON has diverged — `bundle_show_footer` is `false` live vs
  `true` in the repo copy)

## Implementation Steps

1. **Gate check.** Re-run the Phase 01 verification query. If it returns
   anything but `0`, stop.

2. **Local checks.** `shopify theme check` (expect 0 offenses) and `node --test`
   (expect the existing size-guide suite green). Neither covers this widget, so
   they are a floor, not proof.

3. **Price truth matrix.** On a live PDP with size upcharges (`merica-bear`:
   S $27.99 / M $29.99 / XL $30.99 / 2XL $31.99 / 3XL $32.99), for each size
   confirm all three tiers read `size price − {2,3,5}`:

   | Size | Hero | Tier 2 | Tier 3 | Tier 5 |
   |---|---|---|---|---|
   | S | $27.99 | $25.99 | $24.99 | $22.99 |
   | M | $29.99 | $27.99 | $26.99 | $24.99 |
   | XL | $30.99 | $28.99 | $27.99 | $25.99 |
   | 2XL | $31.99 | $29.99 | $28.99 | $26.99 |
   | 3XL | $32.99 | $30.99 | $29.99 | $27.99 |

   The M row is the design reference — it should reproduce the screenshot
   exactly.

4. **Checkout parity.** Add 3 units at a size with an upcharge (2XL), go to
   checkout, confirm the per-unit price actually charged equals the tier-3
   number the card advertised. This is the claim the whole plan rests on.

5. **Interaction sweep.** Variant change updates all three prices with no
   reformat flicker; tier click changes only active state; keyboard arrows still
   move selection; cart update still recounts and flips the CTA to "Tier
   active"; footer summary unchanged.

6. **Rendering sweep.** JS disabled → SSR price correct. 360px width → no
   overflow in the 3-up grid. Non-eligible product → nothing renders. Cheap
   product, if any exists below $5 → confirm the clamp reads acceptably or
   decide to suppress the line.

7. **Push.** Three files only, scoped, to the live theme:

   ```sh
   SHOPIFY_CLI_THEME_TOKEN=<token> shopify theme push \
     --store rfeixb-dd.myshopify.com --theme 158620516604 --allow-live \
     --only snippets/dopamiles-stack-save.liquid \
     --only assets/dopamiles-stack-save.js \
     --only assets/dopamiles-stack-save.css
   ```

8. **Verify the push by pulled source.** Pull the same three files to a scratch
   path and diff against the repo — byte-identical, or the push did not land.
   Then confirm the rendered storefront HTML contains the price markup;
   Shopify caches storefront HTML, so a stale response is not proof of failure —
   trust the pulled source over a curl of the page.

9. **Commit.** Conventional commit on the current branch, three files plus the
   plan directory.

## Success Criteria

- [ ] Phase 01 gap query returns 0 before any push
- [ ] All five size rows in the price matrix verified on a live PDP
- [ ] Checkout charges the advertised per-unit price at 2XL × 3
- [ ] Variant change, tier click, keyboard nav, cart update all behave as before
- [ ] SSR correct with JS off; no overflow at 360px
- [ ] `shopify theme check` clean; `node --test` green
- [ ] Pulled source byte-identical to repo for all three files
- [ ] No `templates/*.json` or `config/settings_data.json` pushed

## Risk Assessment

- **Shipping ahead of Phase 01.** The one genuinely damaging failure mode:
  advertising an exact price the checkout refuses. Step 1 is the gate.
- **Live pushes hit production.** This theme is the published one; every push is
  customer-visible immediately. Scoped `--only` plus a pulled-source diff is the
  standing pattern.
- **Merchant JSON clobber.** Never include template or settings JSON in the
  push; live values have diverged from the repo.
- **Cache confusion during verification.** Storefront HTML is cached behind
  `DYNAMIC` and unknown query params do not bust it. Verify from pulled theme
  source; treat a stale page as inconclusive rather than as a failed push.
