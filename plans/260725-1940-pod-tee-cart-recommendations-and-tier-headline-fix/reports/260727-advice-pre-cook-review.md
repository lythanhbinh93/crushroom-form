# Advice: pre-cook review of the cart-drawer strip redesign

Date: 2026-07-27
Input: the accumulated mockup + decisions, checked before implementation.
Mockup: `docs/mockups/cart-drawer-recs-redesign.html` (pod-tee-theme)
Supersedes nothing; extends `260727-advice-tier-aware-heading-and-16-card-carousel.md`.
Status: advisory. Nothing implemented.

## Decisions (user)

| # | Question | Decision |
|---|---|---|
| 1 | Mobile fold, strip invisible from 3 items | Accept as scroll-reward |
| 2 | Compact line items | Keep, justified as cart UI, NOT as a fold fix |
| 3 | Ship order | 3 batches: money, then carousel, then line items |
| 4 | Plan docs | New **Phase 05**; leave 01-02 as completed history |

## Defects found in review (would have shipped)

1. **`cart:refreshed` does not exist.** Theme fires `cart:change`
   (`assets/dopamiles-cart.js:202`). Mockup JS listens for the wrong event, so
   the carousel scroll listener never rebinds after a cart mutation. Symptom:
   counter freezes and chevron disabled-state goes stale after any quantity
   change.
2. **Rapid chevron presses under-advance.** `scrollBy` measures from the
   in-flight smooth-scroll position, so presses compound into less than one
   slide each. Measured: 20 presses advanced 11 slides of 17. Fixed in the
   mockup by tracking the target index and using absolute `scrollTo`, with a
   120ms debounce that resyncs after a manual swipe. **Carry this fix over.**
3. **Wrong binding pattern.** Mockup uses document delegation. `scroll` does
   not bubble, so the row listener cannot be delegated at all. The theme
   already has `bindDrawerSurface()` with `dataset.bound === '1'` dedupe and a
   documented invariant that all targets sit inside `#dop-cart-drawer-content`.
   Hook into that.

## Verified

- Artwork 96px -> 296px, 9.5x pixel area. Peek 48px. Counter 1/17.
- Card markup 470 bytes; 16 cards = 7.0 KB raw, **0.4 KB brotli**. Payload is
  not a constraint.
- Compact line item measures **102px vs 137px**, saving 35px/line.
- Mobile (iPhone 15, 393x852): strip visible 87px at 2 items, **0px at 3, 4, 5**.
  Compact lines make the heading visible at 3 items only. 4 and 5 stay at zero.
- Dedup holds at every cart depth. No page overflow 320-414px. No console errors.
- Both themes render; `data-theme` overrides the media query both directions.

## Verdict

Ready to cook. Decisions are internally consistent and the three defects above
are cheap to fix before writing production code.

Two honest caveats, neither blocking.

**The mobile ceiling.** With the strip invisible from 3 items, the full design
lands on desktop and 1-2 item mobile carts. Mobile is 65-75% of sessions, so
most sessions see the heading at best. The tier-aware money heading, which is
the feature that justified the resolver refactor, is therefore largely a
desktop win. Worth knowing before paying for it, not a reason to stop.

**Scope.** This has grown from a Phase 02 tweak into a three-batch programme
touching money-critical Liquid, new drawer JS, a carousel, and core cart UI.
That is the largest single chunk of work in the plan. Deliberate is fine;
accidental would not be.

## Do

Batch 1, money. Resolver snippet emitting cents; both headings consume it;
equality test. Nothing visual.

Batch 2, carousel. 1-up sizing, counter, chevrons, end card, JS wired through
`bindDrawerSurface`, a11y, image attrs, settings raised to 16.

Batch 3, line items. Compact variant, justified on its own terms.

Preview-verify each by Admin API checksum before starting the next.

## Do not

- Put money on a third surface (cards, marker labels).
- Rely on document delegation for the carousel. `scroll` does not bubble.
- Let the end card be anywhere but last, after manual picks and backfill both.
- Count the end card inside `dop_cart_recs_max`. That setting means product
  cards: 16 products + 1 end card = 17 slides. Relabel it accordingly.
- Ship compact line items in the same push as the resolver. Different blast
  radius, different justification.
- Mark Phase 05 complete before the equality test exists. It is the only thing
  containing the two-money-surfaces decision.

## Better / more efficient, ranked

1. **Resolver + equality test.** Highest return: permanently removes a class of
   money bug, and is the precondition for everything else.
2. **Carousel + end card.** The visible win, no money risk.
3. **a11y attributes + `decoding="async"`.** Minutes of work.
4. **Compact line items.** Most effort, least strip benefit. Correctly
   re-justified as cart UI.

The declined count-only heading remains the fallback if the resolver refactor
turns hairy: counts carry no money risk, so it needs no shared resolver.

## Trade-offs

- Strip is invisible on mobile from 3 items. Accepted.
- One resolver guarantees the **number**, not the **sentence**. Two locale
  strings can still be edited apart.
- New JS in the drawer breaks Phase 02's "curated mode ships zero new JS"
  property. Phase 05 supersedes that criterion explicitly.
- Compact line items change the cart for every shopper, including the majority
  who never reach the strip.
- Three batches means three preview cycles.

## Work checklist

**Batch 1: money**
- [ ] `snippets/dopamiles-bundle-tier-resolve.liquid`, pipe-delimited cents,
      all-zeros on empty cart
- [ ] Node test: field count + order contract
- [ ] Refactor `dopamiles-bundle-cart-headline.liquid` onto the resolver; all 26
      existing tests green with no assertion changes
- [ ] Locale strings for the three heading states under `sections.cart.*`
- [ ] Consume resolver in `dopamiles-cart-recs.liquid`; render tier / saved / fallback
- [ ] Heading restyle: 12px, `--dop-ink`, sentence case, figure in accent;
      `.muted` keeps the old label treatment for the fallback
- [ ] **Equality test**: headline figure == strip figure, eligible qty 1-6, with
      and without SP, both `tier_basis` values
- [ ] theme check + node --test; push to preview; verify by checksum

**Batch 2: carousel**
- [ ] `dop_cart_recs_max` range 1-16 default 12; Liquid clamp 16; rewrite the
      obsolete `info` string; relabel "Maximum product cards"
- [ ] Pool `limit` to `cap * 2`, clamped 32
- [ ] 1-up CSS: `width:min(calc(100% - 60px), calc(100dvh * 0.38))`, 48px peek,
      2-line title reserve, contain artwork, hover + focus states
- [ ] Counter markup + end card, end card last, gated on
      `products_count > rendered`
- [ ] Carousel JS: absolute `scrollTo` stepping, 120ms settle resync, wired via
      `bindDrawerSurface()` + `dataset.bound`, `cart:change` not `cart:refreshed`
- [ ] `role="group"` + `aria-roledescription="carousel"` + label
- [ ] `decoding="async"`; confirm `image_url: width: 600`
- [ ] `prefers-reduced-motion` sets `scroll-behavior:auto`
- [ ] theme check + node --test; preview; checksum

**Batch 3: line items**
- [ ] Compact `.dop-li` variant, ~102px: 56px thumb, qty + Remove on one row
- [ ] Verify qty stepper and Remove still bind (they live inside the swap)
- [ ] 44px touch targets preserved
- [ ] preview; checksum

**Docs**
- [ ] New `phase-05-*.md`; note it supersedes Phase 02's zero-JS criterion
- [ ] Update `plan.md` phase table

## Success metrics

| Metric | Target |
|---|---|
| Headline figure == strip figure | equal at qty 1-6, with and without SP, both bases. Primary anti-drift guard |
| Resolver contract test | fails if field order or count changes |
| `node --test` | green; 26 prior tests unchanged + contract + equality |
| `shopify theme check` | 0 offenses |
| Chevron stepping | 17 presses reaches slide 17/17, next disabled. No under-advance |
| Counter after a quantity change | still tracks, proving the rebind works |
| Slides | 16 products + 1 end card; never exceeds cap + 1 |
| End card | absent when `products_count <= rendered` |
| Compact line item | <= 105px measured, qty/Remove still functional |
| Preview push | Admin API `checksumMd5` matches local for every pushed file |
| Page overflow | none at 320 / 360 / 375 / 393 / 414 |
