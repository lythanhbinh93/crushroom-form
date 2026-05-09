# Phase 03 — CLS via min-height Slot Reservation

## Context Links

- Halt journal lesson #2 ("CSS cascade is a 3p regression surface"): [../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md](../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md)
- Round-3c CLS fix (rejected approach): [../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md](../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md)
- Variant picker snippet: `D:\github local\pod-tee-theme\snippets\product-variant-picker.liquid`
- Product hero section: `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`

## Overview

**Priority:** P0 (R3-1 publish blocker)
**Status:** pending
**Effort:** ~45 min code + spot-test
**Owner:** code

Replace the rejected `[data-dawn-vs] visibility:hidden` wrapper with CSS `min-height` space reservation on the variant-picker container. Neither Dawn nor Globo paint should cause reflow regardless of paint order.

## Key Insights

- **Root cause (already known from round-3c Gate 2 reviewer):** Dawn `<variant-selects>` paints first → Globo asynchronously injects `.globo-color-swatch` row → vertical layout collapses or expands → 0.313 CLS.
- **Why round-3c approach failed:** wrapping `<product-info>` in `<div data-dawn-vs style="visibility:hidden">` cascaded the hidden state to Globo's async-injected children. CSS cascade 101 — parent `visibility:hidden` silently hides every descendant, including DOM nodes injected after page load.
- **Why min-height works regardless of paint order:** if the container reserves enough vertical space upfront, neither Dawn's variant-selects (paints first) nor Globo's swatches (paints later) cause the surrounding layout to shift. Both children paint INSIDE the reserved slot, and the slot doesn't grow.
- **Critical sizing question:** what `min-height` value covers BOTH Dawn's variant-select rendered height AND Globo's typical 4-color swatch row height? Need a measurement, not a guess. Both heights observable from existing screenshots; if not, take new screenshots from current preview pre-edit.
- **YAGNI:** no JS reveal timer, no `MutationObserver`, no per-product configuration. CSS-only fix. Survives Globo enabled, disabled, app outage, slow 3G load — all paint inside the reserved slot.
- **Trade-off:** if user toggles Globo OFF for a product, the reserved space contains only Dawn's variant-selects with empty space below it (height: reserved-min - dawn-actual). Cosmetic-only — UX still functional.

## Requirements

**Functional:**
- PDP first paint with Globo ENABLED → no layout reflow when Globo's swatches inject. CLS contribution from this surface = 0.
- PDP first paint with Globo DISABLED (user toggles app off) → Dawn variant-selects renders normally; container has reserved space; visible empty area below variant-selects acceptable; PDP fully usable.
- Globo loads after slow 3G delay (e.g. 3-5s) → swatches paint inside reserved slot; no reflow when they arrive.
- Lighthouse mobile CLS <0.1 on PDP under both conditions.

**Non-functional:**
- CSS-only mechanism. No JS timer, no observer, no scripts.
- Net LOC: ~10 LOC CSS + ~1 LOC class addition in Liquid.
- No interference with Globo's DOM injection — no parent-level `visibility`, `display:none`, `overflow:hidden` (the last would clip swatches if reserved height too small).
- No effect on Dawn's `<product-info>` custom element form binding.

## Architecture

```
PDP HTML structure (after phase 03):

<div class="dop-variant-picker-slot">    ← min-height reserves space
  <product-info ...>
    <product-variant-picker>
      <!-- Dawn variant-selects renders here on first paint -->
      <variant-selects>...</variant-selects>
    </product-variant-picker>
  </product-info>
  <!-- Globo asynchronously injects .globo-color-swatch INSIDE this slot -->
  <!-- (Globo's selector is inside <product-variant-picker> per Globo's app config) -->
</div>

CSS:
.dop-variant-picker-slot {
  min-height: <measured-value>px;
  /* No visibility, no display:none, no overflow:hidden on parent */
}
```

**The slot wrapper is OUTSIDE `<product-info>` (or wraps it tightly), but it does NOT cascade visibility to children.** Only `min-height` is set. Children (Dawn variant-selects, Globo swatches) paint inside the reserved area, and the area is sized to fit the larger of the two.

**Failure-mode coverage:**

| Failure | Detection | Mitigation |
|---|---|---|
| `min-height` too small → Globo swatches overflow → still some reflow | Spot-test Globo ON, measure CLS | Increase min-height; iterate until 0 reflow |
| `min-height` too large → empty space below variant-selects when Globo OFF | Spot-test Globo OFF | Cosmetic only; acceptable |
| Globo injects ABOVE the variant-selects (sibling, not replacement) | Inspect Globo DOM in screenshot | Reserve enough height to fit BOTH simultaneously visible |
| Globo height varies by product (4 colors vs 8 colors) | Audit current Dopamiles products | Use the maximum across products, OR set min-height per swatch count if Globo exposes count via Liquid (Q1) |
| `<product-info>` custom element relies on direct parent for shadow DOM / form binding | Test variant click → cart price updates → submit form | If breakage, wrap `min-height` rule on a sibling/inner div instead of wrapping `<product-info>` |
| Reserved slot height blocks scroll on small viewports | Test on iPhone SE 320px width | Use `min-height` not `height`; container can still grow if children exceed |
| Some PDPs don't have variant picker (single-variant products) | Conditional reservation in Liquid | Only render the slot wrapper when `product.has_only_default_variant == false` |

## Related Code Files

**Modify (mandatory):**

- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`
  - Wrap `<product-info>` block (or whichever block contains `product-variant-picker` snippet) in `<div class="dop-variant-picker-slot">` — but ONLY when product has variants (`product.has_only_default_variant == false`)
  - This wrapper is purely structural — no inline style, no `visibility`, no `display:none`
  - Net: ~3 LOC (open/close div + Liquid `if` guard)
- `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css`
  - Add `.dop-variant-picker-slot { min-height: <measured>px; }` rule
  - Optional: media query for small viewports if reserved height feels too tall on mobile (likely not needed since Globo+Dawn are similar heights both)
  - Net: ~5 LOC

**Read for context:**

- `D:\github local\pod-tee-theme\snippets\product-variant-picker.liquid` — confirm where Globo injects relative to Dawn
- Existing PDP screenshots from round-2 sweep: `plans/reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/` — measure Dawn variant-selects + Globo swatch heights (alternative to live measurement)

**Create:** none
**Delete:** none (round-3c `[data-dawn-vs]` already removed in phase 01)

## Implementation Steps

### Step 1 — Measure current heights

Two options (pick one):

**Option A — DevTools live measurement:**
1. Load Dopamiles PDP in Chrome desktop with mobile device emulator (iPhone 12 Pro, 390x844).
2. With Globo ENABLED: inspect `.globo-color-swatch` row → record `offsetHeight` (e.g. 56px).
3. Disable Globo (theme settings or app toggle): inspect Dawn `<variant-selects>` → record `offsetHeight` (e.g. 84px).
4. Pick the LARGER as `min-height` baseline. Add 4-8px buffer for browser font-size variance.

**Option B — Screenshot pixel measurement (if no dev access):**
1. Open existing PDP screenshots (round-2 sweep visuals).
2. Pixel-measure variant-picker block height in both Globo ON / OFF states.
3. Convert to CSS px (account for screenshot DPR).
4. Use larger + 8px buffer.

Document the measured value in commit message: e.g. `min-height: 92px (Dawn 84px + 8px buffer; Globo 56px fits within)`.

### Step 2 — Add Liquid wrapper

In `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`:

Locate the existing `<product-info>` block (around line 88-101 per round-3c phase plan).

Wrap with conditional slot:

```liquid
{%- comment -%}
  Round-4 R3-1 fix — reserve vertical space so neither Dawn nor Globo
  paint causes layout reflow. Pure min-height; no visibility/display
  tricks (those cascade to Globo's async-injected children — round-3c
  regression).
{%- endcomment -%}
{%- if product.has_only_default_variant -%}
  {%- comment -%} Single-variant product — no picker, no reservation needed. {%- endcomment -%}
  <product-info ...>
    {%- render 'product-variant-picker', ... -%}
  </product-info>
{%- else -%}
  <div class="dop-variant-picker-slot">
    <product-info ...>
      {%- render 'product-variant-picker', ... -%}
    </product-info>
  </div>
{%- endif -%}
```

Adjust the `<product-info ...>` opening tag attributes to match what's currently in the file — do NOT change product-info's existing markup, only wrap.

### Step 3 — Add CSS rule

In `D:\github local\pod-tee-theme\assets\dopamiles-pdp.css`:

```css
/* Round-4 R3-1 — reserve vertical space for variant picker so neither
   Dawn nor Globo paint causes CLS. Sized to the larger of Dawn variant-
   selects (~84px) + Globo color swatch row (~56px) + 8px buffer. */
.dop-variant-picker-slot {
  min-height: 92px; /* TUNE based on Step 1 measurement */
}
```

If measurement comes back materially different (e.g. 120px or 60px), use that value. Document the value in the CSS comment.

### Step 4 — Spot-test matrix

**Mandatory spot tests (do BOTH before commit):**

1. **Globo ENABLED:**
   - Hard-refresh PDP on mobile (Chrome DevTools or real device)
   - Throttle to Slow 3G
   - Watch first paint frame-by-frame: variant area should be stable
   - Tap a color swatch: cart price/image should update via existing `syncVariant` (not affected by this phase)
   - Lighthouse mobile audit: CLS <0.1 expected
2. **Globo DISABLED:**
   - Toggle Globo app off in Shopify admin (or per-product disable if available)
   - Reload PDP
   - Variant-selects renders; reserved space below variant-selects empty (cosmetic)
   - PDP fully usable: variant click → form submits
   - Lighthouse mobile audit: CLS <0.1 still

If either condition fails CLS<0.1, iterate `min-height` value (single tuning iteration; halt rule applies).

### Step 5 — Theme check + commit

```powershell
shopify theme check --section sections/dopamiles-product-hero.liquid

git add sections/dopamiles-product-hero.liquid assets/dopamiles-pdp.css
git commit -m "fix(theme): R3-1 CLS via min-height slot reservation

Replaces round-3c visibility:hidden wrapper (broke Globo cascade) with
pure CSS min-height reservation on variant-picker slot. Neither Dawn
nor Globo paint causes reflow regardless of paint order. No JS timer,
no MutationObserver, no parent-level visibility tricks.

min-height: <measured>px (Dawn ~Xpx + Globo ~Ypx + buffer).
Spot-tested Globo ON + OFF; CLS <0.1 in both."
```

### Step 6 — Deploy + Lighthouse verify

```powershell
shopify theme push --theme 158279991548
```

Run Lighthouse mobile audit on preview URL. Capture CLS score in commit message or follow-up note.

## Todo Checklist

- [ ] Step 1 — Dawn + Globo heights measured (recorded in commit message)
- [ ] Step 2 — Liquid wrapper added with `product.has_only_default_variant` guard
- [ ] Step 3 — CSS `min-height` rule added with measured value
- [ ] Step 4a — Spot-test Globo ENABLED → CLS <0.1
- [ ] Step 4b — Spot-test Globo DISABLED → variant picker usable, CLS <0.1
- [ ] Step 5 — theme check pass + single commit
- [ ] Step 6 — Lighthouse mobile audit logged

## Success Criteria

- Lighthouse mobile PDP CLS < 0.1 with Globo ENABLED
- Lighthouse mobile PDP CLS < 0.1 with Globo DISABLED
- 0 grep hits for `data-dawn-vs|visibility:hidden` near variant-picker (verify phase 01 revert held)
- 0 JS reveal timers, 0 MutationObservers added
- Variant click still updates cart price/image (no regression of round-2 phase 01 syncVariant)
- Single-variant products skip the wrapper (no empty reserved space on those PDPs)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `min-height` value mismatches Globo's actual rendered height | Med | Med | Step 1 explicit measurement; spot-test both conditions; one tuning iteration allowed |
| Globo varies swatch height by product (4 vs 8 colors, multi-row) | Med | Med | Audit Dopamiles products; use max. If multi-row variance is large (e.g. 56px vs 112px), accept worst-case + cosmetic empty space on small-swatch products |
| Wrapping `<product-info>` breaks Dawn's custom element behavior | Low | High | Spot-test variant-click → price update post-edit; if broken, move wrapper INSIDE `<product-info>` around the picker snippet only |
| Reserved space too tall on iPhone SE (320px) — eats viewport | Low | Low | Globo + Dawn heights are <100px typical; viewport is ~568px; not a concern. Test if reserved >150px |
| `min-height` value drift over time as Globo updates → CLS regression | Low | Med | Add CSS comment with rationale; flag in changelog if Globo redesigns swatches |
| Phase 04 measurements show min-height needs adjustment AFTER deploy | Low | Low | Single line CSS edit; cheap to revisit |
| User toggles Globo OFF for a product → user sees ~30-40px empty space | Low | Low | Cosmetic only; PDP usable. Acceptable trade vs CLS |

## Security Considerations

- Pure CSS + Liquid wrapper. No new JS, no new attack surface.
- No data exposure; no auth surface change.
- No third-party API calls.

## Next Steps

- Phase 04 (latency profile) consumes this clean baseline
- Phase 05 (real iPhone) verifies CLS in user screen recording

## Unresolved Questions

1. Does Globo expose a Liquid metafield/setting like `shop.metafields.globo.enabled_for_product`? If yes, we could conditionally not-render the wrapper when Globo's not active per-product (saves the cosmetic empty space). Defer; current fix is acceptable.
2. What's the actual height variance across Dopamiles products? Quick audit: count products with 2/4/6/8 color variants × Dawn variant-select count. If max-height case is rare, accept; if common, scope per-product min-height (likely YAGNI).
3. Does Globo inject the swatches as a sibling of `<product-info>` or inside `<product-variant-picker>`? Round-3c journal says "Globo asynchronously replaces this block with .globo-color-swatch DOM" — confirm via DOM inspection. Affects whether wrapper is at `<product-info>` level or `<product-variant-picker>` level.
4. Is `product.has_only_default_variant` the correct guard, or should we use `product.variants.size > 1`? Both should equal — verify with Liquid docs / single-variant test PDP.
