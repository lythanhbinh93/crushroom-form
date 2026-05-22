---
title: "PDP Size Guide port from BuildMyPOD"
status: in_progress
priority: P2
created: 2026-05-22
updated: 2026-05-22
work_context: d:/github local/pod-tee-theme
reports_path: d:/github local/crushroom-form/plans/260522-1302-pdp-size-guide-port-from-buildmypod/reports/
blockedBy: []
blocks: []
---

# PDP Size Guide — Port from BuildMyPOD Spirituality v1.1.4

## Goal

Add a discoverable "Size Guide" link inside the PDP variant picker (next to Size option label) that opens a Dawn `<details-modal>` containing a sizing chart image, swapped automatically by `product.type`.

## Context

- Brainstorm summary: [brainstorm-summary.md](./brainstorm-summary.md)
- Reference theme source (pulled): `d:/github local/_temp-buildmypod-inspect`
- Live preview: https://dopamiles.co/ with `?preview_theme_id=156076146940`

## Phases

| # | Phase | Status | Priority | Effort | Depends on |
|---|---|---|---|---|---|
| 01 | [Liquid and schema](./phase-01-liquid-and-schema.md) | complete | P2 | ~1h | — |
| 02 | [Styles](./phase-02-styles.md) | complete | P2 | ~30m | 01 |
| 03 | [Shopifyignore push protection](./phase-03-shopifyignore-push-protection.md) | complete | P1 | ~10m | — |
| 04 | [Merchant config and ship](./phase-04-merchant-config-and-ship.md) | pending | P2 | ~45m | 01, 02, 03 |

## Key dependencies

- `sections/dopamiles-product-hero.liquid` already wires the variant picker via `{% render 'product-variant-picker' %}` at line 124.
- Dawn `<details-modal>` element is already loaded site-wide (used in `header.liquid`, `card-product.liquid`, `header-search.liquid`).
- pod-tee-theme push workflow currently has no `.shopifyignore` — needs creation.

## Success criteria (whole plan)

- "Size Guide" link visible on tee PDPs (product.type matches a configured block)
- Link hidden on products with no matching configured image
- Modal opens with correct image; closes via ESC, backdrop, and close button
- Image survives 3 consecutive `shopify theme push` cycles
- Lighthouse a11y score on PDP not regressed
- iOS Safari 16 + modern Chrome/Safari verified

## Out of scope

- cm/inches toggle, per-product overrides, /pages/size-guide, Theme Blocks 2.0

## Open questions

None. Design locked per brainstorm + validated 2026-05-22.

---

## Validation Log

### Session 1 — 2026-05-22

**Tier:** Standard (4 phases → Fact Checker + Contract Verifier)

#### Verification Results
- Claims checked: 8
- Verified: 4 — `<details-modal>` JS exists (`assets/details-modal.js`); `<modal-opener>` registered at `assets/global.js:692`; `snippets/product-variant-picker.liquid` exists with render args (product, block, product_form_id); section.blocks accessible via `block` (block === section per hero L126)
- Failed: 3 (see decisions below)
- Unverified: 1 → resolved via interview (trigger placement)

#### Failures + decisions

**F1 — CSS file name**
- Plan claim: Phase 02 styles go in `assets/pdp.css`
- Reality: Pod-tee uses `assets/dopamiles-pdp.css` (loaded as critical preload at `layout/theme.liquid:86`); convention is each PDP section adds `{{ 'dopamiles-pdp.css' | asset_url | stylesheet_tag }}` (verified: dopamiles-bundle.liquid:101, dopamiles-fbt.liquid:189, dopamiles-faqs.liquid:53, dopamiles-mobile-sticky-atc.liquid:56, dopamiles-reviews-placeholder.liquid:91, dopamiles-reasons.liquid:84)
- Decision: **Add size-guide CSS to existing `assets/dopamiles-pdp.css`**. Phase 02 updated.

**F2 — `.shopifyignore` already exists**
- Plan claim: Phase 03 creates `.shopifyignore`
- Reality: File present at theme root (`.shopifyignore:1-24`) already protects `config/settings_data.json`, `sections/*.json`, `templates/*.json`, `templates/customers/*.json`, `templates/metaobject/*.json` — fully covers our use case
- Decision: **Reduce Phase 03 to verification-only**. (a) confirm patterns cover size-guide, (b) optionally add one-line plan-reference comment, (c) run 3-push test. Effort 20m → 10m.

**F3 — Liquid variable names**
- Plan claim: trigger sketch uses `product_option.name == 'Size'`
- Reality: variant picker iterates `for option in product.options_with_values` (verified line 33: `{{ option.name }}:`) — must be `option.name`
- Decision: **Phase 01 trigger sketch corrected** to use `option.name`.

**F4 — Variable shadowing (surfaced during fact-check)**
- Plan claim: trigger sketch uses `for block in section.blocks`
- Reality: Inside `product-variant-picker.liquid`, `block` is already bound (render arg from hero L126: `block: section`). A `for block in ...` loop would shadow the snippet's `block` arg
- Decision: **Phase 01 loop variable renamed** to `sg_block` to avoid shadow.

#### Design decisions

**D1 — Trigger placement**
- Decision: Inside the `<legend>` after the "Size:" label, before picker controls. Mirrors BuildMyPOD pattern exactly. Highest discoverability ("Size: M | Size guide" on one line). Works across button/swatch/dropdown picker types.

**D2 — iOS 16 testing**
- Decision: Real iOS 16 device access confirmed. Phase 04 step #5 stays as critical-blocking real-device QA.

#### Outcome

All findings resolved without scope change. Phase files updated. **Proceed to implementation.**

### Whole-Plan Consistency Sweep — 2026-05-22

Re-read plan.md + phase-01..04 after validation edits.

- Phase 01 trigger sketch: `option.name` ✓, `sg_block` ✓ — consistent
- Phase 02 CSS location: `assets/dopamiles-pdp.css` ✓ — consistent w/ brainstorm summary's `assets/pdp.css OR section {% stylesheet %}` line (brainstorm permits either; chose existing pdp.css file)
- Phase 03 scope: reduced to verify+test ✓ — plan.md effort cell updated ✓
- Phase 04 iOS 16 step: unchanged, real-device QA stays ✓
- Brainstorm summary `brainstorm-summary.md` `assets/pdp.css` reference: stale but non-blocking (brainstorm is a one-time artifact, plan supersedes)
- Trigger placement detail (legend vs after picker) was not specified in brainstorm; now resolved in plan only — no contradiction

No unresolved contradictions. **Plan is implementation-ready.**
