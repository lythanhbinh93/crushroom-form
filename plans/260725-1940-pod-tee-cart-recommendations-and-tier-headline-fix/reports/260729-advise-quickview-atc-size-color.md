# Advice — in-drawer ATC with size/colour quick-view

Date: 2026-07-29
Input: "add the atc button to upcart, what is the best solution for size/color pick (UX UI)"
Mockup: [260729-quickview-atc-mockup.html](./260729-quickview-atc-mockup.html) (interactive, real data)

## Confirmed reframing

Drawer strip is a dead end — cards link to PDP, acting on a rec costs the shopper
their place in checkout. Goal: drawer as upsell lane, raise AOV, without POD's
wrong-size tax (bad add = reprint eaten + exchange thread).

Decisions locked by user during interview:

| Decision | Value |
|---|---|
| Why | Raise AOV generally (impulse add-ons), not tier progression specifically |
| Interaction | ATC on card → quick-view popup to choose size AND colour |
| Placement | **Slide-over inside the drawer** — not a stacked modal, not inline card expand |
| Opening state | **D — nothing preselected; cart size outlined + named as a nudge** |
| Card body | Still links to PDP |

Non-goals: dialog above drawer; variant controls on card face; removing PDP link;
collection-grid quick-add (out of scope this round, but see Risk 1).

## Verified facts (scout, not belief)

- `Am I Fast`: Color 8 × Size 6 = **48 variants**, all available.
- **Price ladder is size-dependent**: S/M/L $29.99 · XL $30.99 · 2XL $31.99 · 3XL $33.99.
  Card says "From $29.99". Add button must show live price or it misleads.
- **8 distinct variant images**, one per colourway. Colour is visually decidable;
  size is not. Justifies artwork swap on swatch tap.
- `snippets/dopamiles-product-card.liquid:163` already renders `data-dop-quick-add`;
  `assets/dopamiles-collection.js:107` adds `selected_or_first_available_variant`
  with **no size prompt**. The silent-default failure mode is already live on collection.
- Swatch rendering already solved in `dopamiles-product-card.liquid:129-158`
  (`cv.swatch.color` / `cv.swatch.image` / `--dop-swatch-{handle}` fallback). Reuse.
- Theme ships unused Dawn `quick-add.js`, `quick-add-bulk.js`, `swatch-input.liquid`.
- `sections/dopamiles-cart-recs-shopify.liquid` is an existing fetch-target-only
  section — precedent for the quick-view section.
- Cart JS already has `addToCart`, `addToCartMulti`, `refreshDrawer`, `openDrawer`.

## The two structural traps

### 1. The swap boundary

`sections/dopamiles-cart-drawer.liquid:96-364` is `#dop-cart-drawer-content`.
`refreshDrawer()` calls `swapSection(html, 'dop-cart-drawer-content')` on **every**
cart mutation. Anything inside that wrap is destroyed and rebuilt.

The panel must be a **sibling of `#dop-cart-drawer-content`, inside `#dop-cart-drawer`**
(line 62). Otherwise: shopper taps Add → refresh → swap → panel annihilated
mid-transition, and any failed add leaves them staring at a rebuilt cart with no
error context.

Consequence for binding: `bindDrawerSurface()` documents a scope invariant —
all bind targets live inside the swap so `dataset.bound` dedupe stays correct.
A panel outside the swap keeps `dataset.bound=1` forever. Fine for a static shell,
wrong for controls injected fresh on each open.

**Use event delegation on the panel shell** (bound once at init), not per-element
binding. Sidesteps the dedupe question entirely.

### 2. The rec card is a bare `<a>`

`snippets/dopamiles-cart-rec-card.liquid:18-44` wraps the entire card in one anchor.
A `<button>` inside `<a>` is invalid HTML and behaves unpredictably.

Collection card already solved this: `.dop-pcard-quick` is a **sibling** of the
anchor, absolutely positioned, inside an `<article>` wrapper. Rec card has no
wrapper — it needs one.

Migration note: the wrapper becomes the carousel slide. `width` / `scroll-snap-align`
currently on `.dop-rec-card` (`assets/dopamiles-cart.css:785-831`) must move to the
wrapper, and `recsStep()` measures `slides[1].offsetLeft - slides[0].offsetLeft`
from `row.children` — still correct, but the children change identity.

## Verdict

Worth building, and the chosen shape is the right one. Slide-over beats a stacked
modal on the surface that carries 65-75% of traffic — one overlay, one scroll-lock,
one Escape, and the drawer stays mounted behind it. Opening state D matches what
was actually asked for (they choose both) while making the right size obvious.

Caveat, stated once and then respected: **D is not the AOV-maximising choice.**
C (both prefilled) converts faster. D trades some conversion for not shipping sizes
nobody read. On POD with reprint-not-restock economics that is a defensible trade,
but it IS a trade, and it is the user's call.

The real risk is not the picker. It is that the quick-view is a second product
surface with its own variant state, availability logic, and money rendering —
and this codebase just spent a phase collapsing money down to one source. Do not
let the panel compute price independently.

## What to do

1. **Fetch the panel on tap, do not inline it.** New
   `sections/dopamiles-cart-quickview.liquid`, fetch target only, same pattern as
   `dopamiles-cart-recs-shopify.liquid`. Fetch
   `/products/{handle}?section_id=dop-cart-quickview`.
   Rationale: drawer re-renders on every cart mutation via `/cart/change.js?sections=`.
   Inlining 16 products × 48 variants would multiply that payload on every quantity
   change. Fetch-on-tap keeps drawer payload flat, keeps availability fresh at tap
   time, and lets Liquid render swatches with the logic that already exists.
2. **Prefetch on intent.** `pointerenter` / `touchstart` on the ATC button, one
   in-flight request, cache per handle for the session. Turns a ~300ms tap into a
   near-instant open in the common case.
3. **Real loading state, not a fake one.** If prefetch missed, show a skeleton with
   the card's own artwork already in place. Do not animate a fake delay.
4. **Artwork swaps with colour.** This is the whole justification for the panel.
   Preload the selected colour's image; the other seven can be lazy.
5. **Price lives on the Add button and moves with size.** `Add · $29.99` →
   `Add · $33.99` on 3XL. Render money from the variant, formatted the same way
   the rest of the drawer does.
6. **Disabled button teaches.** "Choose a color and size" → "Pick a color" →
   "Select a size" → `Add · $X`. The button is the error message; no separate
   validation text.
7. **Handle unavailable combinations.** All 48 are available today. Do not assume
   it stays true — disable size buttons not available in the chosen colour, with a
   visible treatment, not just `pointer-events: none`.
8. **Focus and keys.** Move focus to the panel heading on open; return it to the
   originating ATC button on close. Escape closes the panel first, drawer second.
   `role="radiogroup"` + `aria-checked` on both rows; arrow keys move within a row.
9. **After add: return to the bag.** They see the line land and the tier bar move —
   that is the reinforcement loop the strip exists for.
10. **Size guide link in the panel.** The size decision is the risky one; the guide
    is already built. Put it where the decision happens.

## What not to do

- **Do not stack a dialog above the drawer.** Two scroll-locks and two focus traps
  on mobile is a bug factory. Already decided against — stay decided.
- **Do not put the panel inside `#dop-cart-drawer-content`.** See Trap 1.
- **Do not inline variant JSON into the strip.** It rides along on every cart
  mutation payload.
- **Do not reuse `product-variant-picker.liquid`.** It is the PDP picker, coupled to
  `variant-selects` and `dopamiles-pdp-variant-sync.js`. Too heavy for a drawer panel
  and it drags PDP behaviour into a checkout surface.
- **Do not let the panel compute the bundle saving.** If the panel shows any savings
  copy, it reads `dopamiles-bundle-tier-resolve`, like everything else.
- **Do not add quantity stepping in the panel.** One tap adds one. They can adjust in
  the cart list they are returned to.
- **Do not silently drop the product from the strip without thought** — the strip
  excludes in-cart products, so the card they just added vanishes on refresh. Correct
  behaviour, but land them on the cart list so the disappearance is never observed.

## Cheaper alternatives, ranked by effort-to-impact

1. **Colour-only quick-add, size inherited** (~40% of the effort). Only viable if
   size is prefilled — user rejected that. Listed for completeness.
2. **Panel without artwork swap** (~75%). Saves the image-preload work. Not
   recommended: the swap is the reason a picker beats a PDP link.
3. **Ship at 1-up only first** (~85%). Panel width assumptions get simpler. Marginal
   saving; the panel is drawer-width regardless of card density.

None of these change the shape enough to be worth taking. Build it properly.

## Route

1. Restructure `dopamiles-cart-rec-card.liquid` — wrapper element, ATC button as
   anchor sibling. Move width/snap CSS to the wrapper. Verify carousel stepping and
   the 8px/2px card spacing survive.
2. New `sections/dopamiles-cart-quickview.liquid` — fetch target, renders panel
   markup from `product`, reusing swatch logic from `dopamiles-product-card.liquid`.
3. Panel shell in `dopamiles-cart-drawer.liquid` as a sibling of
   `#dop-cart-drawer-content`, empty, `hidden`.
4. JS in `dopamiles-cart.js`: `openQuickView(handle, cardEl)`, prefetch cache,
   delegated swatch/size handlers, `addFromQuickView()` → existing `addToCart` →
   `refreshDrawer` → close panel → focus back.
5. CSS: panel, swatch row, size row, disabled/nudge states, slide transition with
   `prefers-reduced-motion` opt-out.
6. Tests: panel renders for a real product; size buttons carry correct variant ids;
   unavailable combos disabled; price matches variant; nothing preselected; nudge
   marks cart size without selecting it.

## Benefits

- Recommendation becomes actionable without losing checkout context.
- Colour chosen against the real artwork, not a name.
- Price surprise removed — size-dependent price shown before commit.
- No silent size default, so no reprint liability created by the new surface.
- Reuses existing swatch Liquid, existing cart JS, existing fetch-section pattern.

## Trade-offs

- **Two taps, not one.** D costs conversion versus C. Accepted deliberately.
- **A second variant surface to maintain.** Colour/size/availability/price logic now
  exists in the drawer as well as the PDP.
- **~300ms fetch on tap** unless prefetch lands.
- **Card restructure touches the carousel** — the slide element changes identity, so
  width, snap, and step measurement all need re-verifying.
- **Scope grows against a plan that is not shipped.** The drawer work is committed but
  still preview-only, and Phase 04 steps 4-5 (checkout parity) are open. This adds
  surface before the existing surface is verified against a real checkout.

## Work checklist

- [ ] Wrap rec card; move `width` / `scroll-snap-align` to the wrapper
- [ ] Add ATC button as anchor sibling, absolutely positioned
- [ ] Re-verify carousel step, per-view widths, and the 8px/2px card spacing
- [ ] Create `sections/dopamiles-cart-quickview.liquid` (fetch target only)
- [ ] Reuse swatch rendering from `dopamiles-product-card.liquid`
- [ ] Add panel shell as sibling of `#dop-cart-drawer-content`, `hidden`
- [ ] `openQuickView` + prefetch-on-intent cache
- [ ] Delegated swatch/size handlers on the panel shell
- [ ] Artwork swap on colour select; preload selected colourway
- [ ] Live price on Add button per size
- [ ] Progressive disabled labels
- [ ] Disable unavailable colour/size combinations
- [ ] Cart-size nudge: outline + "you bought L", not selected
- [ ] Size-guide link in panel
- [ ] `addFromQuickView` → `addToCart` → `refreshDrawer` → close → return focus
- [ ] Focus management, Escape ordering, radiogroup semantics, arrow keys
- [ ] Reduced-motion opt-out on the slide transition
- [ ] Tests per Route step 6
- [ ] Verify CHECKOUT above fold at 360px still holds
- [ ] `shopify theme check` clean, `node --test` green

## Success metrics

| Metric | Target | How verified |
|---|---|---|
| Add without size selected | **0 possible** | Button `disabled` until both chosen; asserted in test |
| Price shown = price charged | exact match at all 6 sizes | Compare button label to variant price, all sizes |
| Panel open latency, prefetch hit | < 100ms | `performance.mark` around open |
| Panel open latency, cold | < 500ms | Same, prefetch disabled |
| Panel survives cart mutation | never destroyed mid-open | Add item with panel open; panel still in DOM |
| CHECKOUT above fold at 360px | still true | Same harness as Phase 04 step 6 |
| Drawer payload growth | ~0 bytes | Compare `/cart/change.js?sections=` response size before/after |
| Keyboard-only complete add | possible | Tab/arrow/Enter through open → colour → size → add |
| `theme check` / `node --test` | 0 offenses / 0 fail | CI commands |

## Open questions

1. Should the collection-grid quick-add (`dopamiles-collection.js:107`) be migrated
   to the same panel? It has the silent-default problem **today, in production**.
   Deliberately out of scope; recommend a follow-up.
2. Does this ship before or after Phase 04 steps 4-5 (checkout money parity)? Adding
   surface to an unverified drawer increases what has to be re-verified.
3. Six sizes wrap to two rows at drawer width. Wrap, or shrink the buttons?
