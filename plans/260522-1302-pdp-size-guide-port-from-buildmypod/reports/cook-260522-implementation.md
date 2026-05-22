---
title: "PDP Size Guide — Cook implementation report"
date: 2026-05-22
phases: [01, 02, 03]
status: code complete, awaiting Phase 04 manual QA
---

# PDP Size Guide Port — Implementation Report

## Status

**DONE_WITH_CONCERNS** — code phases 01-03 shipped to repo. Phase 04 (Theme Editor config + real-device QA + 3-push test + publish) is manual and pending merchant action.

## Files

### Created
- `pod-tee-theme/snippets/dopamiles-size-guide-modal.liquid` (~50 LOC) — self-gating modal snippet; renders `<modal-dialog>` only when `size_guide_image` block matches `product.type | handleize`.

### Modified
- `pod-tee-theme/snippets/product-variant-picker.liquid` — added `sg_has_chart` lookup at top + `size_guide_trigger` capture; injected trigger into all 3 picker_type branches (swatch / button / dropdown legend or label), gated by `option.name == 'Size'`.
- `pod-tee-theme/sections/dopamiles-product-hero.liquid` — added `size_guide_image` block to schema (3 settings: product_type / image / alt); rendered modal once after `</div>{# .dop-container #}`.
- `pod-tee-theme/assets/dopamiles-pdp.css` — appended ~140 LOC for `.dop-size-guide-opener`, `.dop-size-guide-link`, `.dop-size-guide-modal` and modifiers. Hard-gated visibility on `[open]` attribute.
- `pod-tee-theme/locales/en.default.json` — added `products.product.size_guide` + `products.product.size_guide_image_alt` keys.
- `pod-tee-theme/.shopifyignore` — added 2-line comment under `templates/*.json` noting protection now extends to size-guide image bindings.

## Architecture deviations from plan

**Modal pattern: `<modal-dialog>` not `<details-modal>`** — plan said `<details-modal>` but the trigger uses `<modal-opener>` which calls `modal.show(button)` — only `<modal-dialog>` defines `.show()` (verified `assets/global.js:627`). `<details-modal>` would require a JS shim. Switched to `<modal-dialog>` (matches Dawn's quick-add pattern in `card-product.liquid:444`). Zero new JS, both classes loaded site-wide via `global.js`.

**Trigger injection: capture-and-inject across 3 picker_type branches** — plan implied single insertion in legend. Reality: legend differs per picker_type (swatch has selected-value span; button has bare name; dropdown uses `<label>` not `<legend>`). Captured trigger once at snippet top, injected in 3 places under `is_size_option` guard. Only one branch fires per option, so no duplicate render.

**Liquid filter restriction** — plan's trigger sketch put `| handleize` filter inline in `if` condition. Liquid parser rejects this. Refactored to pre-assign `sg_block_type_h` and `sg_product_type_h` before comparison.

## Code-review findings addressed in-flight

Per reviewer report `reports/code-reviewer-260522-pdp-size-guide-port.md`:

| ID | Finding | Action |
|---|---|---|
| H2 | Hardcoded "Size guide" English strings | **Fixed**: added i18n keys to `en.default.json`; uses `\| t` in 2 places + existing `accessibility.close` for close button aria-label |
| M2 | Missing `aria-controls` on trigger button | **Fixed**: added `aria-controls="{{ sg_modal_id }}"` |
| H1 | 51 unrelated `locales/*.json` files dirty in working tree | **Not addressed (out-of-scope)** — pre-existing drift from Shopify-Admin auto-prepended headers; recommend separate hygiene commit or `git checkout HEAD -- locales/` before commit |
| M1 | `block.blocks` fragile naming | Comment block already present in snippet explaining the contract |
| M3 | `product_type` text field accepts typos silently | Already acknowledged in plan; defer to v2 |

## Validation

**Shopify theme check (`shopify theme check`):**
- Pre-implementation: 57 offenses, 9 errors
- Post-implementation: 56 offenses, 9 errors
- **0 errors in modified files** — all 9 remaining errors are pre-existing in unrelated files (gift-card template, blog/cart-drawer translation keys, ImgWidthAndHeight in other sections).

**Smoke test status:** not run locally (no `shopify theme dev` invoked from this session — deferred to Phase 04 real-device QA).

## Phase 04 (deferred — manual)

Phase 04 stays `pending`. Owner must:
1. Source/optimize sizing chart image (≤200KB, ≥800px wide).
2. Open Theme Editor → Customize → Default product → `dopamiles-product-hero` → Add block → "Size guide image" → fill product_type (`T-shirt` etc.), upload image, set alt text.
3. Verify on Chrome / Safari desktop + iOS 16 real device + Android Chrome.
4. Run `shopify theme push --theme=<PREVIEW_THEME_ID>` 3× consecutively; confirm size-guide block bindings survive (Phase 03's 3-push protection test).
5. Run Lighthouse against baseline (`plans/260518-1833-pdp-lighthouse-perf-pareto/reports/baseline-summary.json`); accept ≤2pt a11y / ≤5% perf regression.
6. Publish via Theme Editor or atomic-swap per memory[`project_pod_tee_wave_1_shipped`].

## Acceptance criteria status

- [x] Snippet `dopamiles-size-guide-modal.liquid` created, passes theme-check
- [x] `size_guide_image` block in `dopamiles-product-hero` schema
- [x] Trigger gated by `option.name == 'Size'` AND `sg_has_chart`
- [x] Zero new JS files
- [x] Modal opens via Dawn modal-dialog/modal-opener (`assets/global.js:627`)
- [x] `aria-controls` + `aria-haspopup` + `aria-labelledby` + focus trap inherited from ModalDialog
- [x] `.shopifyignore` covers `templates/*.json` (verified pre-existing)
- [ ] Real-device iOS 16 QA — **Phase 04 manual**
- [ ] 3-push protection test — **Phase 04 manual**
- [ ] Lighthouse a11y not regressed — **Phase 04 manual**
- [ ] Theme published — **Phase 04 manual**

## Unresolved questions

1. **i18n in non-English locales** — added keys only to `en.default.json`; 50+ other locale files will fall back to translation-missing string. Acceptable for v1 English-primary stores; future locale expansion needs `products.product.size_guide` translated.
2. **Should locale-file drift be cleaned in same commit as size-guide port?** — recommend separate hygiene commit; user decision.

## Status keyword

DONE_WITH_CONCERNS — code complete; Phase 04 manual QA + ship pending; locale-file drift untouched per H1 scope.
