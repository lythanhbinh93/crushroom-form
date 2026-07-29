# Cook prompts — Phase 05, three batches

Self-contained. Each assumes NO conversation context.
Run in order. Preview-verify before starting the next.

Repo: `D:\github local\pod-tee-theme` (branch `fix/codebase-audit-batch-260613`)
Plans: `D:\github local\crushroom-form\plans\260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix\`
Review: `reports/260727-advice-pre-cook-review.md`
Mockup: `docs/mockups/cart-drawer-recs-redesign.html` (in the theme repo)

---

## Batch 1 — shared tier resolver + tier-aware strip heading

```
Implement Batch 1 of Phase 05 in D:\github local\pod-tee-theme.

READ FIRST
- D:\github local\crushroom-form\plans\260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix\reports\260727-advice-pre-cook-review.md
- snippets/dopamiles-bundle-cart-headline.liquid  (the money-critical snippet)
- snippets/dopamiles-cart-recs.liquid
- tests/cart-headline.test.js, tests/liquid-harness.js

GOAL
The cart drawer prints a savings figure in two places: the tier headline at the
top, and (new) the recommendation strip heading. Both MUST come from one
resolver so they can never disagree. No visual carousel work in this batch.

CREATE snippets/dopamiles-bundle-tier-resolve.liquid
- Move the tier maths out of dopamiles-bundle-cart-headline.liquid verbatim.
- Emit ONE pipe-delimited line, all money in INTEGER CENTS (never float
  strings), fields in exactly this order:
    tier_basis|eligible_qty|total_units|current_cents|next_min|next_cents|needed|savings_now_cents|savings_next_cents|max_min
- Empty cart or unparseable tiers: emit all zeros.
- Document the field order in a header comment.

CONSUME IT in both snippets. `{% render %}` is scope-isolated, so each caller
must capture and split:
    {%- capture dop_tier_raw -%}{%- render 'dopamiles-bundle-tier-resolve' -%}{%- endcapture -%}
    {%- assign t = dop_tier_raw | strip | split: '|' -%}

STRIP HEADING (snippets/dopamiles-cart-recs.liquid), three states:
- next tier exists      -> "Pick {needed} more to save {savings_next}"
- eligible >=1, no next -> "You've saved {savings_now}"
- empty cart / no eligible items / no tier data -> settings.dop_cart_recs_heading
Strings go in locales/en.default.json under sections.cart.* (a text setting
cannot interpolate a count). Format cents via money_without_trailing_zeros.

HEADING STYLE (assets/dopamiles-cart.css)
- .dop-cart-recs-head becomes 12px, var(--dop-ink), sentence case, NOT
  uppercase; the figure wraps in <b> at var(--dop-accent).
- Add a .muted modifier that keeps today's 10.5px uppercase --dop-ink-3
  treatment, used for the fallback state only.

TESTS (node --test, liquidjs already a devDependency)
1. Resolver contract: field count and order. Must fail if either changes.
2. EQUALITY TEST (the point of this batch): render both the headline snippet
   and the recs snippet and assert the money figures are EQUAL at eligible
   qty 1..6, with and without Shipping Protection, for both
   settings.dop_bundle_tier_basis values.
3. All 26 existing tests in tests/cart-headline.test.js must pass UNCHANGED.
   If an assertion needs editing, the refactor changed behaviour: stop and report.

CONSTRAINTS
- Do NOT touch snippets/dopamiles-stack-save.liquid (owned by another plan).
- Do NOT change the top headline's copy, position, or the progress bar.
- Do NOT add carousel markup, JS, or change dop_cart_recs_max. Batch 2.
- Do NOT push to any theme. Report when ready and stop.
- Theme-global settings only. No section schema.

DONE WHEN
- shopify theme check: 0 offenses
- node --test: green, 26 prior tests unchanged, contract + equality added
- Money maths exists in exactly one file
```

---

## Batch 2 — 1-up carousel, 16 cards, collection end card

```
Implement Batch 2 of Phase 05 in D:\github local\pod-tee-theme.
Batch 1 (shared tier resolver + heading) is already merged.

READ FIRST
- reports/260727-advice-pre-cook-review.md (in the crushroom-form plans dir)
- docs/mockups/cart-drawer-recs-redesign.html  <- the approved design, and the
  reference implementation of the carousel JS. Match its behaviour.
- assets/dopamiles-cart.js, specifically bindDrawerSurface()

GOAL
Turn the 3-card strip into a one-card-per-view carousel of up to 16 products
plus a final card out to the collection.

SETTINGS (config/settings_schema.json)
- dop_cart_recs_max: range 1-16, default 12, relabel "Maximum product cards".
- Rewrite its info string: the current text claims the cap keeps the strip one
  row and CHECKOUT above the fold. Both reasons are obsolete.
- Liquid-side clamp: 16 (not 3), so a stale settings_data value cannot exceed it.
- Pool limit: cap * 2, clamped 32.

LIQUID (snippets/dopamiles-cart-recs.liquid)
- Card width: min(calc(100% - 60px), calc(100dvh * 0.38)). The drawer is
  top:0;bottom:0 so 100dvh IS the drawer height. 48px of the next card must
  stay visible; that peek is the touch affordance.
- Reserve two lines of title height so prices share one baseline.
- Counter markup "N / M" and prev/next chevrons, rendered ONLY when more than
  one card survives dedup.
- END CARD, always LAST, after manual picks and automatic backfill both:
  links to dop_cart_recs_collection.url (fall back to dop_cart_bundle_cta_url,
  then routes.all_products_collection_url), shows products_count.
  Render it only when products_count > cards rendered.
- The end card is NOT counted by dop_cart_recs_max: 16 products + 1 end card
  = 17 slides. The counter counts slides.
- Images: loading="lazy", decoding="async", image_url: width: 600.
- Carousel container: role="group", aria-roledescription="carousel", aria-label.

JS — three traps, all already solved in the mockup, copy its approach:
1. The theme fires `cart:change`, NOT `cart:refreshed`. There is no
   cart:refreshed event; listening for it silently never fires.
2. `scroll` does not bubble, so the row listener CANNOT be document-delegated.
   Wire it through bindDrawerSurface() using the existing
   dataset.bound === '1' dedupe. Everything must live inside
   #dop-cart-drawer-content per that function's documented invariant.
3. Chevron stepping must track the target slide index and use absolute
   scrollTo. scrollBy measures from the in-flight smooth-scroll position, so
   rapid presses under-advance badly (measured: 20 presses moved 11 of 17
   slides). Debounce ~120ms after scrolling settles to resync the tracked index
   so manual swipes are honoured.
- prefers-reduced-motion: scroll-behavior: auto.

CSS (assets/dopamiles-cart.css) — rewrite the .dop-cart-recs* block to match
the mockup: hairline separator, no tinted slab, contained artwork, hover and
:focus-visible states, 44px touch targets on the chevrons.

CONSTRAINTS
- Do NOT change any money maths or the resolver. Batch 1 owns it.
- Do NOT touch line items. Batch 3.
- Do NOT push to any theme.

DONE WHEN
- shopify theme check: 0 offenses; node --test green
- 17 chevron presses reaches slide 17/17 with next disabled, no under-advance
- Counter still updates after a cart quantity change (proves the rebind)
- End card is last and absent when products_count <= cards rendered
- No horizontal page overflow at 320/360/375/393/414
```

---

## Batch 3 — compact line items

```
Implement Batch 3 of Phase 05 in D:\github local\pod-tee-theme.

CONTEXT
This is a cart-UI density improvement, justified on its own merits. It is NOT
a fix for recommendation-strip visibility: measured, it only makes the strip
heading visible at 3 items on mobile and changes nothing at 4 or 5.

GOAL
A compact cart-drawer line item, ~102px instead of 137px, same information.
See the "Compact line items" section of
docs/mockups/cart-drawer-recs-redesign.html for the approved design.

CHANGES (sections/dopamiles-cart-drawer.liquid + assets/dopamiles-cart.css)
- Thumbnail 64px -> 56px.
- Quantity stepper and Remove move onto ONE row instead of stacking.
- Tighter vertical padding.
- Title 14px, variant 12px, price 14px, struck-through original 11px.

CONSTRAINTS
- The qty stepper and Remove buttons MUST keep working. They bind via
  bindDrawerSurface() and rely on living inside #dop-cart-drawer-content.
- Touch targets stay >= 44px even where the visual is smaller.
- Do NOT touch the strip, the resolver, or any money maths.
- Do NOT push to any theme.

DONE WHEN
- Line item measures <= 105px
- Quantity +/- and Remove still function after a cart mutation
- shopify theme check: 0 offenses; node --test green
- No horizontal overflow at 320-414px
```

---

## After each batch

Push to the preview theme only, never live:

```
shopify theme push --theme 160174997756 --store rfeixb-dd.myshopify.com \
  --only <each changed file>
```

Requires `SHOPIFY_CLI_THEME_TOKEN`. Verify by Admin API `checksumMd5` against
the local files, not the CLI success banner. Live theme is `#158620516604` and
is a human gate.
