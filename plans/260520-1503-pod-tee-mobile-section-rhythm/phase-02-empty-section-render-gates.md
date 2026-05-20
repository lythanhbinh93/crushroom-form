---
phase: 2
title: Empty-section render gates
status: completed
priority: P3
effort: 30-45min
dependencies:
  - 1
---

# Phase 2: Empty-section render gates

## Overview

Audit 3 related-product sections for empty-shell rendering. If any of them renders a `<section class="dop-section">…</section>` shell when its content source is empty, gate the render with a Liquid `{% if %}` check so the empty shell collapses to nothing instead of consuming 64-128px (post-Phase-1) of vertical space.

## Requirements

**Functional**
- On a PDP where `dopamiles-fbt`'s product source has zero matching products, the FBT section does NOT render the `dop-section` shell (no border-top, no padding, no eyebrow, no empty grid).
- Same for `dopamiles-more-from-niche` and `dopamiles-reviews-placeholder` per their respective empty-state conditions.
- Sections that DO have content render unchanged.

**Non-functional**
- Liquid edits only. No CSS, no JS.
- Per-section judgement on the right empty-state condition — phase prescribes investigation, not specific Liquid.
- Preserve any existing schema settings, blocks, and presets.
- Preserve `{% schema %}` block exactly.

## Architecture

For each candidate section:

1. Identify the **content source** the section displays:
   - `dopamiles-fbt.liquid` → likely `product.metafields.custom.fbt_products` OR a section-setting collection picker.
   - `dopamiles-more-from-niche.liquid` → likely a collection from product metafield (niche tag) or section setting.
   - `dopamiles-reviews-placeholder.liquid` → likely a hardcoded placeholder (may not actually need gating; verify).

2. Identify the **emptiness predicate**: `collection.products.size > 0`, `metafield.value != blank`, `product.tags contains "niche-X"`, etc.

3. Wrap the OUTER `<section class="dop-section">…</section>` in `{% if predicate %}…{% endif %}`. Keep the schema block OUTSIDE the conditional (Shopify needs the schema to be parseable always).

```liquid
{# Example structure — NOT a prescription, depends on actual content source #}
{%- liquid
  assign source = section.settings.collection
-%}
{% if source != blank and source.products.size > 0 %}
  <section class="dop-section">
    …
  </section>
{% endif %}

{% schema %}
{ … }
{% endschema %}
```

## Related Code Files

**Read first**
- `pod-tee-theme/sections/dopamiles-fbt.liquid` — determine content source + current empty-state behavior.
- `pod-tee-theme/sections/dopamiles-more-from-niche.liquid` — same.
- `pod-tee-theme/sections/dopamiles-reviews-placeholder.liquid` — same. Note: "placeholder" in the name suggests it may always render — verify intent before adding a gate.

**Modify** (only if a section is found to render an empty shell)
- One or more of the three files above. Per-section condition.

**No change**
- Sections that already gate properly (e.g., already wrap shell in `{% if %}`).
- All other files.

## Implementation Steps

1. **Read all three section files** end-to-end. For each, identify:
   - Where the `<section class="dop-section">` element opens and closes.
   - What variable/expression drives the section's content rendering loop.
   - Whether there's already an empty-state guard (e.g., `{% if collection.products.size > 0 %}` somewhere) and what it gates.

2. **Classify each section** into one of:
   - **A — already gated**: empty content source skips the entire shell. No change.
   - **B — renders empty grid placeholders**: content source is empty BUT section renders 1-8 placeholder cards (skeleton). May be intentional for theme editor preview. Decision: gate only on production (`request.design_mode == false`)? Or accept the placeholder rendering? Defer to user.
   - **C — renders empty shell**: content source is empty AND no placeholder cards rendered → shell exists with just header + see-all link + empty grid → adds 128px (or 64px post-Phase-1) of dead space. **Fix needed.**

3. **For sections classified C**: wrap the `<section class="dop-section">…</section>` in an `{% if predicate %}` block. Predicate per-section as documented in classification step. Place the `{% schema %}` block OUTSIDE the conditional (Shopify requires schema parseability).

4. **For sections classified B**: surface decision to user before changing — placeholder skeletons may be intentional for the theme editor's preview-without-data state.

5. **Test in Chrome DevTools** mobile emulation @ 412×823: load PDPs with KNOWN-empty content sources for each gated section (or simulate by removing collection assignment in section settings). Confirm shell does NOT render.

6. **Test theme editor preview**: confirm gated sections still show SOMETHING in the editor's section list and can be re-enabled by assigning a content source. (If the gate suppresses ALL output including in design mode, merchants can't preview the section to configure it — bad UX.)

7. **Combined preview push** with Phase 1's CSS edit:
   ```
   shopify theme push --theme=158279991548 \
     --only=assets/dopamiles-pdp.css,sections/dopamiles-fbt.liquid,sections/dopamiles-more-from-niche.liquid,sections/dopamiles-reviews-placeholder.liquid
   ```
   (Adjust `--only` list to actual files changed.)

## Success Criteria

- [x] All three candidate sections read and classified (A/B/C). FBT=C, more-from-niche=C, reviews-placeholder=B(intentional).
- [x] For C sections: outer `<section class="dop-section">…</section>` wrapped in empty-state `{% if %}`. **FBT gated; more-from-niche NOT gated per user decision (multi-select check left unchecked).** Schema block remains parseable outside the conditional.
- [ ] On a PDP with NO FBT-eligible content: FBT section does not render (no border-top line, no empty header).
- [ ] On a PDP with FBT content: FBT section renders identically to pre-change.
- [ ] Theme editor: each gated section is still configurable (preview state shows something OR `request.design_mode` guard exposes placeholder content).
- [ ] No Liquid syntax errors (`shopify theme check` if configured, else manual `shopify theme push` validates server-side).
- [x] No CSS or JS changes in this phase.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Section renders placeholder cards intentionally for theme editor preview — gating breaks editor UX | Med | Merchant can't see/configure section in editor | Use `request.design_mode` check OR keep placeholder rendering for editor only |
| Empty-state predicate too strict — gates content the merchant DOES want to show | Med | Section disappears unexpectedly | Per-section judgement; conservative predicates (e.g., `size > 0` not `size >= 4`) |
| Empty-state predicate too loose — empty shell still renders | Low | Phase 2 ineffective | Test on a PDP with KNOWN-empty content |
| Schema block placement breaks parsing | Low-Med | Section invisible in theme editor | Always keep `{% schema %}` outside the conditional |
| One of the three sections turns out to already be gated (classification A) — wasted reading time | Low | None — just no edit needed | Accept; Phase 2 may end up touching 0-3 files |
| `reviews-placeholder` is intentionally always-on as a placeholder for future real reviews integration | Med | Gating would defeat its purpose | Surface to user; may exclude this section from Phase 2 entirely |

## Open question to surface during read pass

Before editing any section, REPORT classification (A/B/C) for each of the three files. Then ask user for go/no-go per section. Phase 2's value is in the investigation; the gate write is mechanical once the predicate is settled.
