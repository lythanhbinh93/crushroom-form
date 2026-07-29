# Advice: tier-aware strip heading + 16-card carousel

Date: 2026-07-27
Scope: `snippets/dopamiles-cart-recs.liquid`, `snippets/dopamiles-bundle-cart-headline.liquid`,
`config/settings_schema.json`, `locales/en.default.json`, `tests/`
Status: advisory. Nothing implemented.

## Decisions taken (user)

| # | Question | Decision |
|---|---|---|
| 1 | Strip's job | **Discovery / raise AOV**, not tier completion |
| 2 | Heading copy | **Tier + money**, repeated from the top headline |
| 3 | Sync strategy | **Shared resolver snippet**, one source of truth |
| 4 | No-next-tier state | **Restate savings earned** ("You've saved $30") |
| 5 | Empty cart | merchant setting ("Start here") |
| 6 | Card cap | 16 |

## Verified during this session

- Per-card markup: **470 bytes** raw (measured, real CDN url length included).
- 16 cards: **7.0 KB raw, 0.4 KB brotli**. 8 cards: 3.5 KB raw, 0.3 KB brotli.
  **Payload delta between 8 and 16 is ~0.1 KB compressed.** The
  "payload on every cart mutation" objection raised earlier does not survive
  measurement and was withdrawn.
- `dop_cart_recs_max` currently range 1-3, default 3. Its `info` string still
  claims the cap exists "so the strip stays one row and CHECKOUT stays above
  the fold" — both reasons are obsolete since the strip became a horizontal
  scroller inside the scroll container.
- Locale precedent exists: `sections.cart.dop_you_might_also_like`.

## Verdict

Sound, with one self-inflicted risk. Discovery framing plus a tier nudge is
coherent: tier supplies the motive, carousel supplies the choice. 16 cards is
justified now that the layout cannot wrap and payload is measured as free.

The risk is decision 2. Money in two places is exactly the failure Phase 01
existed to remove. Decision 3 contains it (one resolver guarantees one number)
but does **not** contain copy drift: two locale strings can still be edited
apart. Mitigation is a test asserting the two rendered figures are equal at
every quantity, not merely that each is individually correct.

## Architecture

New `snippets/dopamiles-bundle-tier-resolve.liquid`. Emits pipe-delimited
**cents** (integers, never float strings) so both consumers format identically:

```
tier_basis|eligible_qty|total_units|current_cents|next_min|next_cents|needed|savings_now_cents|savings_next_cents|max_min
```

Consumers capture and split:

```liquid
{%- capture dop_tier_raw -%}{%- render 'dopamiles-bundle-tier-resolve' -%}{%- endcapture -%}
{%- assign t = dop_tier_raw | strip | split: '|' -%}
```

Positional fields are unreadable by nature. Guard with a Node test asserting
field count and order, so a reordering fails a test rather than the storefront.
Empty cart emits all zeros.

## Copy

Recommend "Pick", not "Add". Same information, points at the cards below,
reduces the parroting of the top headline's "Add 1 more".

| State | Heading |
|---|---|
| eligible >=1, next tier exists | `Pick {{ needed }} more to save {{ savings_next }}` |
| eligible >=1, no next tier | `You've saved {{ savings_now }}` |
| eligible 0, cart non-empty | merchant setting |
| empty cart | merchant setting |

Strings go in `locales/`, not settings: a text setting cannot interpolate
`needed`. `dop_cart_recs_heading` becomes the no-tier fallback; say so in its
`info` or merchants will wonder why their text rarely appears.

**Visual weight must move with the copy.** Currently 10.5px uppercase
`--dop-ink-3`, the quietest text in the drawer. Correct for a passive label,
wrong for a money message. Go to ~12px `--dop-ink`, sentence case, figure in
`--dop-accent`. Dropping uppercase is deliberate: it is no longer a label.

## Card count

- `dop_cart_recs_max`: range 1-16, **default 12**. Liquid clamp `if cap > 16`.
- Pool `limit: cap | times: 2`, clamped 32. `collection.products` returns max
  50 unpaginated, so safe.
- Default 12 is a judgement call with **no supporting evidence** — analytics are
  out of scope, so nobody can see how deep shoppers swipe. Raising to 16 is a
  one-setting change.
- Real remaining cost is image requests, not markup: 16 x ~600px. Keep
  `loading="lazy"`, add `decoding="async"`, hold at `image_url: width: 600`.
  Lazy genuinely defers here (off-screen in a horizontal scroller, drawer
  translated off-screen until opened), so expect 3-5 initial loads, not 16.
- At 16, add `role="group"` + `aria-roledescription="carousel"` + label. At 3
  that was noise; at 16 a screen reader user needs to know what they entered.

## Do not

- Put money in a third surface (cards, bar labels).
- Add a progress bar to the strip. Two meters dilute both.
- Make cards add-to-cart. Locked decision, ~30 variants each.
- Make the empty-cart heading tier-aware. No cart, no tier.
- Raise the cap past 16. Image cost becomes real, swipe depth pointless.
- Skip the resolver extraction to save time. It is the only thing making
  decision 2 safe.

## Cheaper path if time-boxed

Ship the count-only heading first (`Pick 1 more for the 3-pack`) with no
resolver refactor, since counts carry no money risk. Add the money once the
resolver lands. Two-step, de-risked, and the visual work is identical.

## Trade-offs

- One resolver guarantees the **number**, not the **sentence**. Two locale
  strings can still be edited apart.
- "Pick 1 more to save $4" sits ~400px below "Add 1 more, save $4". Still
  repetitive. Accepted by decision 2.
- Restating savings at max tier is a third money surface, all fed by one
  resolver but still three places to read.
- The extraction touches money-critical code mid-plan. 26 tests mitigate it;
  the risk is not zero.
- Default 12 is a guess.

## Work checklist

- [ ] Create `snippets/dopamiles-bundle-tier-resolve.liquid` emitting the
      10-field cents string; all-zeros on empty cart
- [ ] Node test: field count + order contract
- [ ] Refactor `dopamiles-bundle-cart-headline.liquid` to consume the resolver;
      all 26 existing tests still green with no assertion changes
- [ ] Add locale strings under `sections.cart.*` for the three heading states
- [ ] Consume the resolver in `dopamiles-cart-recs.liquid`; render the
      tier/saved/fallback heading
- [ ] Restyle the heading: 12px, `--dop-ink`, sentence case, figure in accent
- [ ] Node test: headline figure == strip figure at eligible qty 1-6, with and
      without Shipping Protection, both `tier_basis` settings
- [ ] `dop_cart_recs_max` to range 1-16 default 12; Liquid clamp to 16; rewrite
      the obsolete `info` string
- [ ] Pool `limit` to `cap * 2` clamped 32
- [ ] Card `decoding="async"`; confirm `width: 600`
- [ ] Carousel `role="group"` + `aria-roledescription` + label
- [ ] `shopify theme check` + `node --test`
- [ ] Push to preview #160174997756, verify by Admin API checksum

## Success metrics

| Metric | Target |
|---|---|
| Headline figure == strip figure | equal at qty 1-6, with and without SP, both bases. This is the primary anti-drift guard |
| `node --test` | green; >=26 prior tests unchanged + resolver contract + equality tests |
| Resolver field contract test | fails if field order or count changes |
| `shopify theme check` | 0 offenses |
| Cards rendered | never exceeds `dop_cart_recs_max`, hard ceiling 16 |
| Counter | reads `1 / N` where N == rendered card count |
| CHECKOUT | remains pinned and reachable at 360px with 16 cards |
| Preview push | Admin API `checksumMd5` matches local for every pushed file |
| Empty/unset collection | strip renders nothing, no orphan heading |
