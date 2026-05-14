# Brainstorm — PDP Features (Story / Accordion / Bundle / Sticky ATC)

- **Date:** 2026-05-14 14:49 ICT
- **Scope:** 4 PDP enhancement candidates surfaced by user
- **Theme repo:** D:\github local\pod-tee-theme
- **Branch:** feat/bug-fix-sprint

## Outcome summary

| # | Feature | Decision | Approach |
|---|---|---|---|
| 1 | Story line dynamics by collection/tag | **DEFERRED (optional)** | — |
| 2 | Hide/unhide accordion tab | **QUEUED** | Global per-block `hidden` checkbox |
| 3 | Bundle 1/2-product UX | **BLOCKED** | Wire bundle discount logic first |
| 4 | Compare-at price on sticky ATC | **NEXT** | Add struck-through price + JS sync |

---

## Feature 1 — Story line by collection/tag (DEFERRED)

**Current state:** Story has 3-tier fallback (product metafield → section setting → truncated description). Single global fallback string, no collection/tag awareness.

**Approaches considered:**
- A: 5 section blocks `story_by_tag` — Theme-Editor driven
- B: Metaobject `niche_story` — reusable across PDP/collection/story page
- C: Per-collection `custom.story` metafield

**User decision:** Optional for now. Existing single-fallback is sufficient until/unless brand needs niche-specific PDP storytelling.

**Revisit when:** Product catalog grows past ~20 SKUs with strong tribe segmentation, or merchant requests per-tribe voice in PDP.

---

## Feature 2 — Hide/unhide Detail accordion tab (QUEUED)

**Current state:** Accordion blocks are section blocks (sizing/care/shipping defaults). Deleting a block removes it globally. No per-instance hide.

**Locked approach: Global per-block `hidden` checkbox.**

**Implementation sketch:**
```liquid
# in dopamiles-product-hero.liquid schema, accordion block:
{
  "type": "checkbox",
  "id": "hidden",
  "label": "Hide this accordion tab",
  "default": false
}

# in render loop:
{%- if block.type == 'accordion' and block.settings.hidden != true -%}
  ... render accordion ...
{%- endif -%}
```

**Effort:** ~10 min. ~5 LOC change.

**Trade-off:** Hide is GLOBAL across all PDPs. If per-product variation needed later → add metafield override in a v2.

---

## Feature 3 — Bundle 1/2-product UX (BLOCKED)

**Current state:** `dopamiles-bundle.liquid` is **visual-only** per its own file comment — discount logic is NOT WIRED ("Add kit" button shows tooltip "applies at checkout" as placeholder). 3 product rows, first locked. No 1/2-state feedback.

**Approaches considered:**
- A: Signal value prop (live total + savings preview)
- B: Enforce minimum (disable ATC until 3 selected)
- C: Tiered reward (1=full, 2=5%, 3=10%)
- D: Progressive disclosure (hide bundle until ATC, modal upsell)

**User decision:** Skip — wire the discount logic first. UX for partial-selection states only makes sense once the actual discount mechanism exists.

**Prerequisite work:** Build a Shopify Discount Function (or similar) that applies a real bundle discount on cart submit. Existing `plans/260507-1636-pod-bundle-function/` may have prior work — verify before greenfield.

**Revisit when:** Bundle discount is functionally live on test cart.

---

## Feature 4 — Compare-at price on sticky ATC (NEXT)

**Current state:** `dopamiles-mobile-sticky-atc.liquid` (56 LOC) renders title + current price + ATC button. No compare-at price (struck-through "was $X").

**Locked approach (Option A from brainstorm):**

1. **Liquid edit** in section file:
```liquid
{%- if current_variant.compare_at_price > current_variant.price -%}
  <span class="ms-compare" data-sticky-atc-compare>
    {{- current_variant.compare_at_price | money_without_trailing_zeros -}}
  </span>
{%- endif -%}
<span class="ms-price" data-sticky-atc-price>
  {{- current_variant.price | money_without_trailing_zeros -}}
</span>
```

2. **CSS** (dopamiles-pdp.css):
- `.ms-compare`: text-decoration line-through, color var(--dop-ink-3), font-size 13px, margin-right 6px
- Hide on very narrow viewports if cramping (`@media (max-width: 380px) { .ms-compare { display: none; } }`)

3. **JS sync** in `dopamiles-product-hero.liquid` `syncVariant()`:
- Find `[data-sticky-atc-compare]`, update text or hide based on variant's compare_at_price

**Effort:** ~30 min total (10 LOC Liquid + 8 LOC CSS + 10 LOC JS).

**Risk:** Low. Compare-at price is standard Shopify; pattern likely already used in main PDP hero.

**Conversion rationale:** Mobile users (60-80% of traffic) see savings inline with ATC button → reduces friction at decision point. Direct ROI signal.

---

## Recommended sequence

1. **Now (30 min):** Implement compare-at sticky ATC (Feature 4)
2. **Next session, ~15 min:** Implement accordion hide (Feature 2)
3. **Future plan, separate effort:** Bundle discount wiring (prerequisite for Feature 3)
4. **Optional:** Niche story dynamics (Feature 1) — only if brand explicitly requests

## Unresolved questions

- Does the main PDP hero already show compare-at price with a specific CSS pattern? (Likely yes — implementation should match it so sticky ATC stays consistent.)
- Should the savings be shown as % off badge instead of (or in addition to) struck-through compare-at? Not in scope unless user asks.
