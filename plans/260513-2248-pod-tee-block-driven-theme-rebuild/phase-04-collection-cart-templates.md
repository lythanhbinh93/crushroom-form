# Phase 04 — Collection + cart templates

**Status:** pending
**Owner:** code
**Effort:** 2-4h
**Depends on:** Phase 03
**Gate:** Automated mobile QA (P0) + desktop informational (P1). Run `node qa/phase-04.mjs`.

## Goal
Add `@theme` block accept to collection-grid header area + cart drawer + cart-main. Convert more-from-niche + niche-favorites (both currently hardcoded) to block-driven for the merch-cross-sell sections.

## Sections in scope

| Section | Current state | Plan |
|---|---|---|
| `dopamiles-collection-grid.liquid` | 33 settings + 2 blocks | Extend header zone with @theme; product grid stays product-driven |
| `dopamiles-cart-drawer.liquid` | 3 settings + 1 block (upsell) | Extend with @theme for above-products copy; keep upsell block |
| `dopamiles-cart-main.liquid` | 3 settings + 1 block | Same pattern as cart-drawer |
| `dopamiles-more-from-niche.liquid` | 5 settings, 0 blocks | Convert to block-driven |
| `dopamiles-niche-favorites.liquid` | 6 settings, 0 blocks | Convert to block-driven |

## Implementation steps
1. Extend collection-grid header schema with @theme — merchant can add hero text / badge-row above filter toolbar
2. Extend cart-drawer + cart-main schemas with @theme — copy above line items
3. Convert more-from-niche + niche-favorites (similar to home-newsletter pattern)
4. Theme check + theme editor test
5. iPhone QA

## Todo
- [ ] Extend `dopamiles-collection-grid.liquid` schema (@theme in header zone only)
- [ ] Extend `dopamiles-cart-drawer.liquid` schema
- [ ] Extend `dopamiles-cart-main.liquid` schema
- [ ] Convert `dopamiles-more-from-niche.liquid`
- [ ] Convert `dopamiles-niche-favorites.liquid`
- [ ] Theme check pass
- [ ] Code-reviewer pass
- [ ] Push to preview
- [ ] iPhone QA: collection filter + cart drawer + cart page

## Success criteria
- Collection toolbar still filters/sorts; new header zone accepts blocks
- Cart drawer renders blocks above line items without breaking ATC flow
- Cart-main same
- iPhone QA pass
- The 2 flagged JS issues from QA report are STILL flagged (not regressed; Phase 07 fixes)

## Risk assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Cart drawer JS hooks break if DOM shifts above line items | Medium | Don't change selectors `#dop-cart-lines`, `#dop-ship-bar` |
| Collection-grid filter drawer (already extracted to snippet) breaks | Low | No JS changes |

## QA assertions (Phase 04)

**Script:** `qa/phase-04.mjs`
**Viewports:** iPhone 14 Chromium (P0), iPhone 14 WebKit (P0), iPhone SE (P1), Desktop 1280 (P1)

**P0 — fail → halt:**
- `/collections/all` returns 200, theme served
- Filter button "Filter ▼" renders with whitespace gap ≥3px between text and chevron (today's verified pattern)
- Filter drawer opens on click (`#doc-open-filters` click → drawer visible)
- Sort dropdown changes URL `?sort_by=...` and reloads
- `/cart` returns 200 with 3 items in cart (use `/cart/add.js` × qty 3)
- Cart-main MET shipbar renders with gap ≥3px (today's verified pattern)
- Cart-drawer MET shipbar renders with gap ≥3px when triggered via bag icon click
- Cart drawer reopens after page navigation if items present
- more-from-niche + niche-favorites sections render with block-driven defaults

**P1 — flag:**
- Cart qty +/- buttons work (this depends on `dopCartHelpers loaded` — pre-existing flagged issue; phase 07 fixes it. If still broken in Phase 04, EXPECTED.)
- Remove-item button works

**P2 — log only:**
- Filter result count
- Sort dropdown options

## Halt rule
1 iteration max. P0 fail → halt.

## Next phase
Phase 05 — Misc pages (contact, page, search, blog).
