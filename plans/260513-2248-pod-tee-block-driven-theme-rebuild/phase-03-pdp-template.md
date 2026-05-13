# Phase 03 — PDP template conversion

**Status:** pending
**Owner:** code
**Effort:** 3-5h
**Depends on:** Phase 02 (homepage validates the pattern)
**Gate:** Automated mobile QA (P0) + desktop informational (P1). Run `node qa/phase-03.mjs`. See `## QA assertions` below.

## Goal
Extend the PDP (product page) sections with `@theme` block accept so merchant can add USPs, trust badges, feature rows, etc. without code. Convert 3pack-picker (currently fully hardcoded) to block-driven. Preserve existing accordion / pillar block types.

## Context
- Phase 01 + 02 deliver foundation + homepage pattern
- PDP is conversion-critical surface — Meta ads land here

## Sections in scope

| Section | Current state | Plan |
|---|---|---|
| `dopamiles-product-hero.liquid` | 24 settings + accordion blocks | Extend blocks with `@theme` accept; accordion stays |
| `dopamiles-reasons.liquid` | 11 settings + 2 blocks | Extend with @theme accept |
| `dopamiles-trust-trio.liquid` | 7 settings + 2 blocks | Extend with @theme accept |
| `dopamiles-bundle.liquid` | 10 settings + 2 blocks | Extend with @theme accept |
| `dopamiles-3pack-picker.liquid` | 10 settings, 0 blocks | Convert to block-driven + preset |
| `dopamiles-fbt.liquid` | 8 settings + 2 product-ref blocks | Keep blocks (product picker), no @theme (tightly coupled) |

## Architecture
Same pattern as Phase 02. Section-specific blocks stay; `@theme` added to schemas; presets seeded from current hardcoded content.

product-hero accordion blocks remain because they have PDP-specific UX (open/close, summary highlighting).

3pack-picker becomes block-driven: heading, tier descriptions (3 default blocks), CTA. Allows merchant to test different bundle pitches without code.

## Implementation steps
1. Extend `dopamiles-product-hero.liquid` schema with `@theme` accept (1-line)
2. Extend `dopamiles-reasons.liquid`, `dopamiles-trust-trio.liquid`, `dopamiles-bundle.liquid` similarly
3. Convert `dopamiles-3pack-picker.liquid` to block-driven (largest task here)
4. Theme editor test: add icon-card to PDP between accordion + reasons
5. iPhone QA: PDP renders, ATC still works, variant sync still works
6. Code-reviewer pass

## Todo
- [ ] Extend product-hero schema (@theme + accept)
- [ ] Extend reasons schema
- [ ] Extend trust-trio schema
- [ ] Extend bundle schema
- [ ] Convert 3pack-picker to block-driven + preset
- [ ] Theme check pass
- [ ] Theme editor manual test
- [ ] Code-reviewer pass
- [ ] Push to preview
- [ ] iPhone QA: PDP rendering + ATC + variant change + accordion expand

## Success criteria
- PDP merchant can add icon-card, feature-row, etc. between existing PDP blocks via editor
- 3pack-picker fully block-customizable
- ATC + variant sync + accordion + bundle headline still work
- iPhone QA pass
- No JS errors on PDP (note: pre-existing `amount is not defined` still in scope, addressed in Phase 07)

## Risk assessment
| Risk | Severity | Mitigation |
|---|---|---|
| product-hero is largest section (~600 LOC, complex variant sync + Globo + accordion) — adding blocks regresses something | High | Tightly scoped @theme accept; render blocks in a single new container only |
| Globo PDP swatch integration breaks if blocks shift DOM | Medium | Don't change positioning of `[data-product-form]` or `[data-variant-id]` |
| 3pack-picker conversion changes page URL behavior | Low | Same URL `/pages/3-pack`, just block-driven render |

## QA assertions (Phase 03)

**Script:** `qa/phase-03.mjs`
**Viewports:** iPhone 14 Chromium (P0), iPhone 14 WebKit (P0), iPhone SE (P1), Desktop 1280 (P1)

**P0 — fail → halt:**
- PDP `/products/5k-route-t-shirt` returns 200, theme served correctly
- Product hero renders (selectors: `.dop-hero` PDP wrapper, `.dop-buy`, variant picker, ATC button)
- Accordion blocks render + expand/collapse works (Playwright clicks summary, asserts `[open]` attribute toggles)
- Reasons + trust-trio sections render
- Bundle headline renders when cart has 2+ items (use `/cart/add.js` to populate)
- 3pack-picker block-driven default preset renders
- ATC click → drawer opens (selector check: `#dop-cart-drawer.dop-drawer-open` or equivalent)
- Variant change updates price (assertion: price element textContent changes after select.dispatchEvent('change'))
- Zero new pageerrors vs Phase 02 baseline (pre-existing `amount is not defined` × 4 is the SAME baseline — anything beyond fails)

**P1 — flag → ask user:**
- Globo swatch element present if `[data-globo]` exists in DOM
- FBT section renders product cards (if FBT metafield wired)
- LCP < 2.5s on PDP

**P2 — log only:**
- Variant sync console messages (informational)
- Image lazy-loading behavior

## Halt rule
1 iteration max. P0 fail → halt + scope next iteration.

## Next phase
Phase 04 — Collection + cart templates.
