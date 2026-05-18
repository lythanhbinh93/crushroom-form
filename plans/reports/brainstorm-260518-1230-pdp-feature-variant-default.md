# Brainstorm — PDP defaults to wrong color (feature variant not respected)

**Date:** 2026-05-18
**Repo affected:** `D:\github local\pod-tee-theme` (preview theme 158279991548)
**Scope:** PDP only (hero + gallery + ATC + price)
**Status:** Approach approved → handoff to `/ck:plan`

---

## Problem

PDP lands on the wrong color variant on every product. Merchant reorders variants via drag-and-drop in Shopify admin expecting the top-listed color to be the default on PDP. Liquid's `product.selected_or_first_available_variant` resolves correctly server-side, but the rendered swatch + (suspected) variant state shows a different color.

Preferred variant confirmed in stock. Bug appears on every multi-option (Color × Size) product.

## Root cause (high confidence)

Theme hides Dawn's native `<variant-selects>` via CSS (`[data-dawn-vs] variant-selects { display:none }`, [assets/dopamiles-pdp-variant-sync.js:12-13](../../d:/github local/pod-tee-theme/assets/dopamiles-pdp-variant-sync.js#L12-L13)) and exposes **Globo Color Swatches** as the visible picker.

Globo:
- Has no admin setting to "respect Shopify variant order" (verified by merchant)
- Picks its own default selection (alphabetical / install-order / Globo-config-order)
- Either highlights the wrong swatch (cosmetic) or programmatically clicks it on init (programmatic) → fires Dawn change → variant-sync.js swaps everything to the wrong variant

Liquid is correct. Globo overrides on the client.

## Evaluated approaches

| # | Approach | Pros | Cons | Verdict |
|---|----------|------|------|---------|
| **A** | **Theme-side JS intercept** — read server-resolved feature color into a `data-dop-preferred-color` attribute; inside the existing Globo MutationObserver block, find the matching Globo swatch and select it programmatically | Surgical (~30 LOC in existing observer); PDP-scoped; works for cosmetic AND programmatic override; no app dependency; matches in-flight Gate 3 iPhone QA | Race condition (Globo may re-swap DOM); color-name normalization required; needs once-per-init guard | **CHOSEN** |
| B | Drop Globo, polish Dawn's native picker | Removes app dependency; native picker respects admin order automatically; faster page | 3-5h CSS rewrite; loses Globo per-color image features; out of "PDP only, fix today" scope | Deferred — separate initiative |
| C | Metafield-driven explicit variant override (`custom.feature_variant_id`) | Merchant explicit control; supports specific size+color combos | Adds per-product friction merchant explicitly didn't want; doesn't fix Globo's visual mismatch | Rejected |

## Chosen solution — Approach A

### What changes

1. **`sections/dopamiles-product-hero.liquid` (~3 lines added)**
   Emit `data-dop-preferred-color="{{ current_variant.options[0] | escape }}"` on the section root (or hero wrapper) so JS can read the server-resolved color without re-parsing variants JSON.

2. **`assets/dopamiles-pdp-variant-sync.js` (~30 LOC added inside Globo observer block at lines 322-342)**
   - After Globo injects swatches (existing MutationObserver detects this), find the Globo swatch whose label matches the preferred color (normalized: lowercase, strip spaces/hyphens)
   - Programmatically `.click()` it
   - Guard with `section.dataset.dopGloboAligned = '1'` so we only align once per init (avoids click→change→re-align loop)
   - Keep listening for ~2s of Globo DOM mutations in case Globo swaps its own DOM after our click

### Why this is right

- Surgical fix inside infrastructure that already exists (Globo MutationObserver block)
- Server is the source of truth — JS just enforces alignment downstream
- Matches scope choice (PDP only)
- No metafield friction, no design rewrite, no app dependency change

### Risks + mitigations

| Risk | Mitigation |
|------|------------|
| Globo swaps its DOM after our click | Re-run align on observer's mutation events for ~2s after first injection |
| Color name format mismatch (`"Forest Green"` vs Globo's `"forest-green"`) | Normalize: `value.toLowerCase().replace(/[\s_-]/g, '')` before comparing |
| Click→change→re-align loop | `dopGloboAligned` dataset flag, set on first successful align |
| Real-device variance (Globo may render differently on iPhone Safari) | Existing Gate 3 iPhone QA recording already includes "tap a color → variant sync" — explicitly verify default-color match in the recording |
| Existing Globo coexistence logic in lines 322-342 mutated unintentionally | Add new logic AFTER the existing reveal-Dawn fallback; do not modify the existing observer disconnect logic |

## Success criteria

1. On every multi-option PDP, the Globo swatch highlighted on initial load matches `product.selected_or_first_available_variant.options[0]` (the color value of the server-resolved feature variant)
2. Price block, gallery hero image, and ATC button state all reflect the feature variant on initial load
3. No regression: tapping a different Globo swatch still updates variant + price + image + ATC normally
4. iPhone Safari real-device pass: feature color is visually highlighted on PDP load, before any user interaction
5. No console errors / pageerrors introduced

## Validation

- Local: hit 3 PDPs on preview theme 158279991548 (`/products/5k-route-t-shirt` + 2 others), verify Globo highlight matches admin variant #1
- QA bot: extend or piggyback `qa/phase-01.mjs` (or add a new `qa/feature-variant-default.mjs`) — Playwright assertion that the Globo swatch with `[aria-pressed="true"]` (or equivalent active class) matches a server-emitted expected color
- Real iPhone: rolled into the existing Gate 3 6-step recording (step 2 — PDP color tap); add explicit pre-tap assertion: "Globo swatch X highlighted on initial load"

## Out of scope

- Dropping Globo (Approach B — defer)
- Metafield-driven per-product overrides (Approach C — rejected)
- Other 14 files using `selected_or_first_available_variant` (cart, FBT, cards, etc.) — merchant scope = PDP only
- Specific size defaulting (only color is in scope)

## Unresolved questions

- **Globo's selected-swatch class name** — need to read Globo's runtime DOM to confirm the exact selector for "currently selected swatch" (likely `.globo-color-swatch--selected` or `[aria-pressed="true"]`, but unverified). First implementation phase should `qa/debug-globo-state.mjs` to dump Globo swatch attributes before writing the align logic.
- **Globo click handler vs direct state set** — does Globo respond to a native `.click()` event, or does it need a Globo-specific API call? Will be answered in same debug step.
- **Multiple Globo widgets per page** (e.g., quick-view modal) — not currently in scope; assume one Globo instance per section.
