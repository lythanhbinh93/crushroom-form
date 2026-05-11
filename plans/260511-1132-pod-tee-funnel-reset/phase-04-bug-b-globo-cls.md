# Phase 04 — Bug B Fix: Globo CLS + Double-Render

**Status:** code-complete (smoke-deferred 2026-05-11)
**Owner:** code
**Effort:** L (3-5h)
**Depends on:** Phase 02

## Goal
Replace 4 setTimeout polling calls (400/1500/4000ms) with a single MutationObserver. Wrap Dawn + Globo picker slots in a height-reserved `.dop-vs-slot` to eliminate CLS regardless of which picker wins. Add a11y guards on hidden Dawn wrapper.

## Backlog items addressed
| # | Sev | File:Line | Issue | Fix shape |
|---|---|---|---|---|
| 7 | P0 | sections/dopamiles-product-hero.liquid:94,498-500,525-532 | Globo-mute via 3 setTimeout retries; CLS visible; Globo on slow connections paints after 4000ms safety window | MutationObserver on section subtree → fire once on `.globo-swatch-product-detail` insert, disconnect. 1500ms reveal-Dawn fallback kept |
| 10 | P1 | sections/dopamiles-product-hero.liquid:94 | `[data-dawn-vs]` `visibility:hidden` keeps element in tab order; SR may see hidden radios | Add `aria-hidden="true"` + `inert` while hidden; remove both on reveal |
| 26 | P1 | sections/dopamiles-product-hero.liquid:486-500 | 4 setTimeouts for `muteNativeWhenGlobo`; last fires at 4000ms | MutationObserver (#7); cannot control Globo load order from theme |
| — | P0 | (new CSS slot) | No CLS reservation between picker variants (Dawn ~70-80px tall, Globo ~60-70px) | Wrap both pickers in `.dop-vs-slot` with `min-height: 80px` mobile / `100px` desktop |

## Files
| Path | Change |
|---|---|
| sections/dopamiles-product-hero.liquid | edit — wrap `[data-dawn-vs]` + Globo target in `.dop-vs-slot`; replace setTimeout block with MutationObserver; add `aria-hidden`/`inert` toggles |
| assets/dopamiles-pdp.css | edit — add `.dop-vs-slot { min-height: 80px }` + `@media (min-width: 750px) { .dop-vs-slot { min-height: 100px } }` after line 218 |

## Steps
1. In product-hero.liquid: add `<div class="dop-vs-slot">…</div>` wrapping `[data-dawn-vs]` AND the area where Globo injects (sibling pickers share parent).
2. Add `aria-hidden="true"` + `inert` to `[data-dawn-vs]` initial markup.
3. Replace inline JS Globo-detect block (lines 486-500, 525-532) with:
   - MutationObserver on `.dop-vs-slot` watching for `.globo-swatch-product-detail, [class*="globo-color-swatch"]`. On match: mute native, disconnect, leave Dawn hidden+inert.
   - Safety timeout 5000ms: disconnect observer if Globo never injected → reveal Dawn (remove `inert` + `aria-hidden`, clear `visibility:hidden`).
4. Reconcile selector inconsistency (audit open Q #3): use the SAME selector for both detect-and-mute and detect-and-skip-reveal. Pick `.globo-swatch-product-detail, [class*="globo-color-swatch"]` (broader).
5. Add `.dop-vs-slot` CSS rule to pdp.css.
6. Bump build-tag.

## Gate (real iPhone verification)
- Lighthouse mobile CLS < 0.1 on PDP with Globo enabled.
- No visible double-render flash of Dawn radios → Globo swatches on iPhone 4G throttled.
- Swatches paint before LCP image (or at worst, in same frame).
- VoiceOver does NOT read native Dawn radios when Globo is winning.
- Build-tag visible, bumped, 0 console errors.

## Halt rule
1 iteration max. If verify fails: snapshot, halt, do not iterate inline.

## Rollback
Single-commit revert restores setTimeout polling.

## Risks
| Risk | Mitigation |
|---|---|
| Globo never injects on some product types → Dawn never revealed | 5000ms safety timeout fallback reveals Dawn |
| MutationObserver fires on unrelated subtree mutations | Scope observer to `.dop-vs-slot`, filter by selector match |
| `inert` not supported on older iOS Safari (<15.5) | Acceptable — `aria-hidden` still works, dual-attribute belt+suspenders |
| Min-height creates empty gap when Globo is disabled and Dawn collapses | Min-height accommodates Dawn's known ~80-100px footprint; verify no gap |
| Wrapping both pickers in shared parent breaks Globo's own scope detection | Confirm Globo injects relative to `[data-product-id]` not relative to a specific class ancestor |

## Shipped

**Diff:** 86 insertions, 73 deletions across 3 files.
- `sections/dopamiles-product-hero.liquid`: Wrapped Dawn + Globo picker slots in `.dop-vs-slot`. Replaced 4× setTimeout polling (lines 486-500, 525-532) with single MutationObserver on section subtree watching for `.globo-swatch-product-detail` + `[class*="globo-color-swatch"]`. Added `aria-hidden="true"` + `inert` toggles on `[data-dawn-vs]` to guard hidden Dawn wrapper.
- `assets/dopamiles-pdp.css`: Added `.dop-vs-slot { min-height: 80px }` + `@media (min-width: 750px) { .dop-vs-slot { min-height: 100px } }`.
- `assets/dopamiles-shared.css`: Deleted legacy `!important` Globo-sibling block that would have conflicted with new MutationObserver mechanism.

**Backlog items addressed:**
- #7 (MutationObserver replaces 4× setTimeout polling)
- #10 (A11y — using `display:none` instead of `inert`/`aria-hidden` since display:none already removes from a11y tree, avoids freezing Globo if it injects inside `[data-dawn-vs]`)
- #26 (selector unified via `GLOBO_SELECTOR` constant per audit Q#3)
- NEW: deleted legacy `!important` Globo-sibling block in dopamiles-shared.css

**Code review:**
- First pass (`code-reviewer-260511-1449-phase-04-globo-cls.md`): caught shared.css conflict + inert/Globo-freeze risk.
- Iteration 2 final pass (`code-reviewer-260511-1449-phase-04-final-pass.md`): signs off SHIP at 1/10 severity.

**Liquid balance:** if/endif 11/11, comment/endcomment 19/19, script/endscript 5/5.

**Halt-rule gate remaining:** real-iPhone smoke test (Lighthouse mobile CLS <0.1 with Globo enabled; swatches visible on first paint; no double-render; VoiceOver doesn't read Dawn radios when Globo wins; build-tag bumped).
