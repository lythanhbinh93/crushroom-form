# Advice — ATC control on the recommendation card

Date: 2026-07-29
Input: "the best UX UI for the atc button. I think bottom/bottom right is better, should use button atc instead of plus icon"
Mockup: [260729-atc-button-placement-mockup.html](./260729-atc-button-placement-mockup.html)
Supersedes the overlay `+` shown in [260729-quickview-flow-prototype.html](./260729-quickview-flow-prototype.html)

## Decisions

| Question | Answer |
|---|---|
| What was wrong with `+` | **Ambiguity** — nobody knows what it does |
| Label | **"Add"** — accept the convention |
| Placement | **B — full-width button below the price** |

## Verified

- Card = **144.5px** at 2-up in the 400px drawer (live preview measurement).
- `recsInsideLines: true`, lines box scrolls → **card height does not push CHECKOUT below the fold.**
  The usual veto on a below-card button does not apply.
- `.dop-pcard-quick` (`assets/dopamiles-collection.css:595-598`) is `right:12px; bottom:12px` — bottom-right
  precedent exists, but it is `opacity:0` until `:hover`, so it is **invisible on touch**. Do not copy that part.
- Rec card is a bare `<a>` (`snippets/dopamiles-cart-rec-card.liquid:18-44`) — button cannot go inside it.

## Verdict

Right call, and the diagnosis was the valuable half: the problem was the missing **word**, not the corner.
Position was a symptom. A labelled control fixes the ambiguity wherever it sits.

The instinct to move it down was also right — just one step further than described. Below the artwork rather
than on it, because these tees are sold by the graphic and any overlay is a permanent crop on the product
photography. B is still "bottom"; it costs ~43px of card height, and that height is free.

One caveat: **"Add" opens a picker, it does not add.** That is the convention and shoppers tolerate it, but the
promise only holds if the panel opens fast. A slow panel turns "Add" into a button that appears broken. The
prefetch-on-intent in the flow prototype is what pays for this label.

## What to do

1. **Button after the `</a>`, inside the card wrapper.** Not inside the anchor — invalid HTML.
   Choosing B removes the need for `position:absolute`, `backdrop-filter`, and any z-index question. The
   overlay variants all needed them; this one needs none.
2. **Visible label "Add", accessible label complete.**
   `aria-label="Add Am I Fast — choose size and color"`. Short on screen, honest to a screen reader. This is
   the correct answer to "Add doesn't add" — do not lengthen the visible label to fix it.
3. **40px minimum height.** 34-36px looks right but sits under the 44×44 WCAG 2.5.5 target. Full width already
   satisfies the horizontal axis; height is the one that needs raising.
4. **Secondary styling, not solid accent.** The accent is owned by CHECKOUT and the savings figure. Sixteen
   solid-orange buttons in the strip and CHECKOUT stops being the loudest thing in the drawer. Outline —
   `1px solid var(--dop-ink)` on white, inverting on hover — is enough at this size.
5. **Gap belongs to the card, not the price.** The title→price gap is deliberately 2px because they are one
   label. The button is a separate object; give it ~10px so it does not read as part of the price.
6. **Busy state on the button itself** while the panel fetches — it is the element that was tapped, so it is
   where the feedback belongs. Not a spinner elsewhere.
7. **Verify at 3-up (105px).** "Add" fits, but the button and clamped title in a 105px column need a look.
8. **Leave the end card alone.** It is a link, not a product; no ATC.

## What not to do

- **Do not use solid accent.** See 4.
- **Do not reveal on hover.** Your collection card does this and it is invisible on touch, which is 65-75% of
  traffic. The button ships visible at all times.
- **Do not put the button inside the anchor.**
- **Do not add a second control.** One button, one destination. No "quick view" alongside "Add".
- **Do not vary button height by card.** All cards must stay the same height or the price alignment that the
  one-line title clamp buys you goes away.

## Cheaper / better alternatives considered

1. **A — overlay pill bottom-right** (~same effort). Keeps cards compact, matches existing pattern. Rejected:
   covers the graphic, and at 2-up the pill occupies ~30% of the card's bottom edge.
2. **D — bar across the artwork bottom** (~same effort). Strongest affordance for the space. Rejected: crops
   the hem of every mockup on every card, permanently.
3. **C — inline on the price row** (slightly cheaper). Rejected: three elements in a 144px column, smallest
   tap target.

None are cheaper in a way that matters. B is the same work with a better result.

## Route

1. Add wrapper to `dopamiles-cart-rec-card.liquid`; move `width` / `scroll-snap-align` from `.dop-rec-card`
   to the wrapper (`assets/dopamiles-cart.css:785-831`).
2. Render `<button class="dop-rec-add" data-dop-qv="{{ product.handle }}" aria-label="…">Add</button>` after
   the anchor.
3. CSS: full width, 40px, outline style, 10px top margin, hover invert, `:focus-visible` accent ring, busy state.
4. Re-verify carousel step (`recsStep` measures `slides[1].offsetLeft - slides[0].offsetLeft`), per-view widths,
   and the 8px/2px card spacing.
5. Locale string for the label; `aria-label` composed with the product title.
6. Tests: button present per card, outside the anchor, one per product, not on the end card; accessible name
   contains the product title; height ≥ 40px in the CSS contract.

## Benefits

- Removes the ambiguity that prompted this, which was the actual complaint.
- Zero artwork covered — the graphic is the product.
- Largest tap target of the four options; full width at every density.
- Simpler CSS than any overlay: no absolute positioning, no backdrop-filter, no stacking context.
- Reads as a deliberate control rather than a floating default.

## Trade-offs

- **Card ~43px taller.** Free with respect to CHECKOUT, not free with respect to scroll distance — Shipping
  Protection and totals sit further down the scroller.
- **"Add" opens a picker.** Accepted convention; leans on prefetch to stay honest.
- **One more focusable element per slide.** Up to 17 slides means a longer tab order through the strip.
- **Diverges from the collection card**, which keeps the hover pill. Two surfaces, two patterns, until that
  one is migrated.

## Work checklist

- [ ] Wrapper element on the rec card; move width/snap rules onto it
- [ ] `Add` button rendered after `</a>`, inside the wrapper
- [ ] Visible label "Add"; `aria-label` includes product title and names the picker
- [ ] Full width, ≥40px tall, outline style, ~10px above
- [ ] Hover invert, `:focus-visible` accent ring, busy state during fetch
- [ ] Always visible — no hover-reveal
- [ ] No ATC on the end card
- [ ] Re-verify carousel step, per-view widths, 8px/2px spacing
- [ ] Check 3-up at 105px
- [ ] Locale string for the label
- [ ] Tests per Route step 6
- [ ] `shopify theme check` clean, `node --test` green

## Success metrics

| Metric | Target | How verified |
|---|---|---|
| Artwork pixels covered by the control | **0** | Visual diff of card image region before/after |
| Button height | ≥ 40px | `getBoundingClientRect().height` on the live preview |
| Button width | = card width at 1/2/3-up | Same, all three densities |
| Accessible name | contains product title | `agent-browser` accessibility snapshot |
| CHECKOUT above fold at 360px | still true | Phase 04 step 6 harness |
| Card heights equal across strip | 1 distinct value | `new Set(heights).size === 1` |
| Visible without hover | true | Read computed `opacity` with no pointer over the card |
| `theme check` / `node --test` | 0 offenses / 0 fail | CI commands |

## Open

1. Collection-grid `.dop-pcard-quick` still hover-reveal + silent default size. Same two bugs, live today.
2. Does the label need translating beyond `en.default`? Only `en` exists now.
