---
phase: 3
title: "Migrate manual pickers"
status: pending
priority: P2
effort: "1-1.5h"
dependencies: [2]
---

# Phase 3: Migrate manual pickers

## Overview

Move the three merchant upsell product pickers off section schema and onto the
theme-global settings added in Phase 02, then delete the `upsell_product` block
definitions. Fixes a latent bug: the picks currently vanish on the first cart
mutation.

## Requirements

**Functional**

- The three manual picks read from `settings.dop_cart_recs_manual_1..3`.
- Manual-first ordering: manual picks fill slots 1..n, the automatic source
  backfills to `dop_cart_recs_max` (hard cap 3 total). This is UpCart's
  "evaluated top to bottom" model.
- `upsell_product` block definitions removed from the drawer section schema, along
  with the render loop that consumed them.
- Manual picks are subject to the same dedup rules as automatic ones: excluded if
  already in cart, and Shipping Protection never renders.
- Empty state uses the same combined ordering.

**Non-functional**

- No orphan CSS. If `.dop-cart-upsell*` rules become unreachable after the block
  removal, delete them; if they are shared with the new strip, keep and note it.

## Architecture

### The bug being fixed

`sections/dopamiles-cart-drawer.liquid:245-282` defines `upsell_product` blocks
(max 3 product pickers, "You might also like", rendered when
`block.settings.product != blank`). Because the drawer re-renders through
`/cart/change.js?sections=`, the Section Rendering API rebuilds it with **schema
defaults** — so `block.settings.product` is blank after any quantity change and
the picks disappear mid-session. Merchant-configured, silently non-functional.

### Combined ordering

```
picks   = [manual_1, manual_2, manual_3] (compact, drop blanks)
picks   = dedup(picks)                     # in-cart, SP
if picks.size < cap
  picks += automatic_source_results        # same dedup
picks   = picks | slice: 0, cap
```

Three manual picks means the automatic source never renders. That is accepted and
intentional — it is the merchant override. Note it in the setting's `info` text so
it is not discovered by surprise.

## Related Code Files

- Modify: `snippets/dopamiles-cart-recs.liquid` — consume
  `settings.dop_cart_recs_manual_1..3` ahead of the automatic source.
- Modify: `sections/dopamiles-cart-drawer.liquid` — delete the `upsell_product`
  block schema definitions and the render loop at approximately lines 245-282.
- Modify: `config/settings_schema.json` — `info` text on the manual pickers
  documenting the crowd-out behaviour.
- Possibly delete: unreachable `.dop-cart-upsell*` CSS. Grep before deleting —
  hybrid port/Dawn themes reach snippets from more places than expected.

## Implementation Steps

1. Record the current merchant picks from the live theme editor **before**
   deleting the blocks. Section block settings are lost on removal and are not
   recoverable from a theme pull.
2. Extend `snippets/dopamiles-cart-recs.liquid` with manual-first ordering.
3. Set the same three products in the new theme-global settings.
4. Delete the `upsell_product` block definitions and their render loop.
5. Grep `dop-cart-upsell` across `sections/`, `snippets/`, `layout/`, and assets.
   Delete only genuinely unreachable rules.
6. Mutation-survival check: add item, change quantity twice, confirm the manual
   picks persist.
7. Verify the empty state uses the same ordering.

## Success Criteria

- [ ] Manual picks recorded from the live editor before any deletion
- [ ] Picks render from theme-global settings
- [ ] Picks still present in DOM after two consecutive quantity changes
- [ ] Manual picks occupy the first slots; automatic backfills the remainder
- [ ] Combined total never exceeds `dop_cart_recs_max`
- [ ] Manual picks respect in-cart dedup and SP exclusion
- [ ] `upsell_product` blocks absent from the drawer schema
- [ ] No unreachable `.dop-cart-upsell*` CSS left behind
- [ ] `shopify theme check` clean; JSON schema parses

## Risk Assessment

- **Merchant picks lost on block deletion.** Irreversible if not recorded first.
  Step 1 exists solely for this and must not be skipped.
- **Deleting CSS still in use.** Grep `sections/`, `snippets/`, and `layout/`
  before removing any rule — reachability in this theme is not obvious from the
  filename.
- **Manual picks crowd out relevance entirely.** Three picks means zero automatic
  results, permanently. Accepted; documented in the setting `info`.
- **Dedup removes a manual pick.** If a merchant picks a product a shopper already
  has in cart, the slot silently drops and the automatic source backfills. Correct
  behaviour, but it will look like the pick "didn't work" — worth the `info` note.
- **Phase 02 not yet merged.** This phase depends on the Phase 02 settings block
  existing. Do not start until it does.
