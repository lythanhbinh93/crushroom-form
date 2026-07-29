---
phase: 5
title: "Drawer redesign and money single-source"
status: built — on preview, unverified against checkout
priority: P1
effort: "unbudgeted — grew from a defect loop"
dependencies: [2, 3]
written: 2026-07-29 (retroactively — the work was built first)
---

# Phase 5: Drawer redesign and money single-source

## Why this document exists

Phases 01-04 were written before any of this was built. Phase 05 was not planned:
it accumulated across a screenshot-driven defect loop and a run of direct user
requests after Phase 02 shipped to preview. It is recorded here because two of
its changes **invalidate criteria in earlier phase docs**, and an undocumented
phase that silently voids an earlier acceptance criterion is worse than a late
one.

Everything below is already implemented and on the preview theme
`stack-save-price-preview-260725`. This doc is a record, not a work order —
except for the "Not verified" section, which is real outstanding work.

## What it supersedes

| Earlier claim | Where | Now |
|---|---|---|
| "Curated mode ships zero new JS" | Phase 02 non-functional requirement | **False.** Broken twice: the carousel (`recsStep`/`syncRecs`/`stepRecs`) runs in curated mode, and `loadRelatedRecs` runs in related mode |
| "Hard cap 3 cards" | Phase 02, plan.md locked decisions | Cap is **16**, set by the user on 2026-07-27. The row scrolls sideways and never wraps, so the cap bounds payload, not drawer height |
| "One row, manual-first" | Phase 02 strip layout | Still manual-first, but a **snap carousel** at 1/2/3 cards per view, not a static row |
| Step 6's CHECKOUT-above-fold argument | Phase 04 | Void. It reasoned from the strip being a `flex-shrink:0` sibling of the scroller; the strip now lives **inside** `.dop-cart-lines`. Re-measured — see Phase 04's 2026-07-29 progress section |
| Step 8's Shipping-Protection argument | Phase 04 | Void. It concluded SP was safe *because* `assets/dopamiles-cart.js` was untouched. That file is now modified. Re-derived from the diff instead |

## What was built

### 1. Money single-source (the reason this phase is P1)

Two surfaces state the bundle saving: the tier headline above the line items and
the recommendation-strip heading. They computed it independently. Any future edit
to one would silently drift from the other, and a drawer that contradicts itself
about money is worse than one that says nothing.

- **`snippets/dopamiles-bundle-tier-resolve.liquid`** (203 lines, new) — the only
  place the saving is computed. Emits one pipe-delimited line, ten fields, all
  money in **integer cents**:

  ```
  tier_basis|eligible_qty|total_units|current_cents|next_min|next_cents|needed|savings_now_cents|savings_next_cents|max_min
  ```

  Emits **all zeros** when there is nothing truthful to say: empty cart, no
  bundle-eligible items, or an absent/unparseable tier table. Callers treat
  all-zeros as "say nothing", never as "$0.00 saved".

- **`snippets/dopamiles-bundle-tier-table.liquid`** (63 lines, new) — normalises
  the tiers metafield to `MMM:CENTS|MMM:CENTS`, thresholds zero-padded so a
  lexicographic sort orders them numerically, amounts converted to cents once.
  Consumed by the resolver **and** by the headline's progress-bar marker loop, so
  tier parsing exists in exactly one place too.

  This was a declared deviation: the spec asked for one new snippet. Two exist
  because the headline needs the parsed table for markers, and having it re-parse
  the metafield would have reintroduced the drift the phase was written to kill.

- `money_without_trailing_zeros` is applied only at the consumer. Cents never
  become a float string anywhere in the chain.

- `snippets/dopamiles-bundle-cart-headline.liquid` refactored onto the resolver.
  Copy, position, CTA and progress-bar output are **byte-identical** to before —
  the 26 pre-existing tests in `tests/cart-headline.test.js` pass unchanged, which
  is what proves it.

### 2. Carousel

`.dop-cart-recs` became a scroll-snap carousel. Chevrons, a live counter, and an
end card. Step distance is measured from `slides[1].offsetLeft -
slides[0].offsetLeft` rather than a hardcoded gap, so it stays correct at every
per-view setting without the CSS and JS having to agree on a number.

### 3. Cards per view

`settings.dop_cart_recs_per_view` — `1` | `2` | `3`. Validated against that
literal set **before** it is interpolated into a class name. Widths are written
longhand per view (`(100% − 60)/1`, `(100% − 72)/2`, `(100% − 84)/3`), derived
from `reserved = gap × cards + peek`, with a 48px peek at every setting so it is
visibly scrollable.

1-up is the default because these tees *are* the graphic — at 3-up the artwork is
back to thumbnail size and the card stops selling anything.

### 4. Related-products arm

`settings.dop_cart_recs_source` was dead since Phase 02. Now built:

- `sections/dopamiles-cart-recs-shopify.liquid` (40 lines, new) — a fetch target
  only, never placed on a page. Renders the same strip snippet with
  `pool: recommendations.products`, gated on `recommendations.performed and
  recommendations.products_count > 0`.
- `loadRelatedRecs` in `assets/dopamiles-cart.js` fetches
  `/recommendations/products?section_id=…&product_id=…&limit=…&intent=related`,
  anchored on the last non-Shipping-Protection cart line.
- **Shopify caps that endpoint at 10.** The limit is clamped to 10 before the
  request, and the `dop_cart_recs_max` range (up to 16) cannot raise it. Stated in
  the setting's `info` text so a merchant who sets 16 and counts 10 cards is not
  surprised.
- Curated is the fallback in three cases, not one: the empty cart (nothing to
  relate to), zero matches, and a failed request.

**The related arm does not bootstrap without a curated collection.** The fetch
attribute is emitted inside the `picked_n > 0` guard, so if
`dop_cart_recs_collection` is empty the strip never renders and the fetch never
starts. This is load-bearing and non-obvious; the setting's `info` says the
curated collection is required in **both** modes.

### 5. End card destination

`settings.dop_cart_recs_end_collection` — its own collection picker, falling back
to the curated collection when empty. It is a merchandising link, so it shows
under both sources and can point anywhere the merchant wants the traffic. Hidden
when the destination holds no more products than the strip already showed
(`recs_end_total > picked_n`), so it never promises a "View all" that reveals
nothing new.

This exists because related mode has no collection behind it — the honest options
were "no end card in related mode" or "let the merchant name one". The merchant
names one.

### 6. Compact line items

`.dop-li--compact`, drawer-only. **Zero DOM change** — the two controls were
already siblings, so the whole thing is CSS. Compact line height measures 100px
against a 105px target.

An earlier framing of this work carried a risk about rebinding the quantity
stepper after a DOM change. Not mitigated — *removed*, by not changing the DOM.

### 7. Mockup diff

`docs/mockups/cart-drawer-recs-redesign.html` is the reference. A systematic rule
-by-rule diff against it closed a run of defects the eyeball pass had missed:
title clamped to one line at **every** density, price pinned to the card bottom
with `margin-top: auto`, `line-height: 1` on the price so the gap above it does
not move with the font, image placeholder + inset hairline, hover `scale(1.03)`
with a reduced-motion opt-out.

## Files

**Created**

- `snippets/dopamiles-bundle-tier-resolve.liquid` (203)
- `snippets/dopamiles-bundle-tier-table.liquid` (63)
- `sections/dopamiles-cart-recs-shopify.liquid` (40)
- `tests/bundle-tier-resolve.test.js` (277)
- `tests/cart-drawer-line-item.test.js` (79)

**Modified**

- `snippets/dopamiles-bundle-cart-headline.liquid` — refactored onto the resolver
- `snippets/dopamiles-cart-recs.liquid` — heading states, cap 16, per-view, end
  card, `pool` argument, related handoff
- `assets/dopamiles-cart.js` — carousel + related fetch added; `handleUpsellAdd`
  and its binding removed (Phase 03)
- `assets/dopamiles-cart.css` — strip moved inside the scroller, per-view widths,
  card rules, `.dop-li--compact`; 97 lines of `§ 08 · UPSELL ROW` deleted
- `sections/dopamiles-cart-drawer.liquid` — strip moved inside `.dop-cart-lines`,
  compact class, `upsell_product` blocks removed (Phase 03)
- `config/settings_schema.json` — `dop_cart_recs_per_view`,
  `dop_cart_recs_end_collection`
- `locales/en.default.json` — six `sections.cart.dop_recs_*` strings
- `snippets/dopamiles-icon.liquid` — `chevron-left` / `chevron-right`
- `tests/liquid-harness.js` — two fidelity fixes (below)

## Test-harness fidelity fixes

Both were found by the harness lying, not by reading it.

1. **Nested renders saw an empty scope.** liquidjs does not expose a render's
   scope to a nested `{% render %}`. Every snippet returned empty after the
   refactor. Fixed by passing scope as liquidjs `globals` in
   `createEngine(globals)` — which is also *more* faithful to Shopify, where
   `cart`, `settings` and `shop` are globals that survive render isolation.
2. **`t` was a stub.** Now reads `locales/en.default.json` for real and
   interpolates `{{ name }}`. liquidjs hands named filter args to the filter as
   `[key, value]` pairs, which the stub had not accounted for.

**Standing limitation:** the harness renders with fallback fonts. Anything
font-dependent — the title clamp, the title→price gap, marker label widths —
cannot be validated here. Those were measured in a real browser instead.

## Verified

- `node --test` — **153 pass, 0 fail** (re-run 2026-07-29). Was 70 before this
  phase.
- `shopify theme check` — **235 files, 0 offenses**.
- The 26 pre-existing headline tests pass **unchanged**, which is the evidence
  that the resolver refactor altered no output.
- A 24-case equality suite (eligible qty 1-6 × ±Shipping Protection × both tier
  bases) asserts the headline and the strip heading state the same figure. They
  cannot drift.
- `recs_per_view` validated against `1|2|3` before class interpolation — no
  arbitrary string reaches a class name.
- 360px drawer measured against both real stylesheets: CHECKOUT above the fold
  with 49px headroom at a 566px viewport, compact line 100px, no marker-label
  collision, no horizontal overflow. Full numbers in Phase 04's progress section.

## Not verified

- **Checkout parity.** The 24 equality assertions prove the two surfaces agree
  with each other. They prove **nothing** about whether checkout applies that
  discount. Phase 04 steps 4-5 still own this, and they still need a real cart
  session.
- **Tier basis.** Phase 01 Step 1 remains unverified. Shipped on the safe
  `eligible` default, which under-states — no copy claims the larger number.
- **Related mode end to end.** The fetch path has never run against a real
  storefront session with items in cart.
- **Real-device.** Measurements are a scripted 360px viewport, not a phone.

## Risks introduced by this phase

| Risk | Why it matters | State |
|---|---|---|
| Related mode silently dead if the curated collection is unset | Merchant switches source, sees nothing, has no way to know why | Documented in `info`; **not** enforced in code — the strip cannot warn, it can only not render |
| `limit` clamp is invisible to the merchant | Sets 16, counts 10, assumes a bug | Documented in `info` |
| Two new JS paths in the drawer | Phase 02 promised zero | Both bound through `bindDrawerSurface()` with `dataset.bound` dedupe, so a Section Rendering API re-render cannot double-bind |
| Font-dependent CSS unvalidated locally | The defect loop that produced this phase was entirely font-dependent | Accepted — the harness cannot do this. Browser measurement is the only check |
| `locales/en.default.json` is not in `.shopifyignore` | A live push sends the repo copy wholesale and clobbers admin language-editor edits | **Open.** Must be pull-merge-push, or add it to `.shopifyignore` first |

## Success criteria

- [x] One snippet computes the bundle saving; both money surfaces read it
- [x] All money crosses the boundary as integer cents
- [x] Resolver emits all zeros rather than a misleading `$0.00`
- [x] Headline output byte-identical — 26 pre-existing tests pass unchanged
- [x] Equality asserted across qty 1-6 × ±SP × both bases
- [x] Carousel, per-view (1/2/3), end card, related arm all functional on preview
- [x] Compact line items with no DOM change
- [x] `shopify theme check` clean; `node --test` green
- [ ] Related mode exercised against a real storefront session
- [ ] Money verified against a real checkout total (Phase 04 steps 4-5)
- [ ] `locales/en.default.json` handled before any live push
