# Phase 02 — Homepage template conversion

**Status:** pending
**Owner:** code
**Effort:** 4-6h
**Depends on:** Phase 01 (block library)
**Gate:** iPhone QA on home page

## Goal
Convert 3 hardcoded homepage sections (home-hero, home-manifesto, home-newsletter) to block-driven schemas. Add `@theme` accept to the 4 already-blocked home-* sections so merchant can intersperse theme blocks. Auto-migrate existing settings to default block presets so live preview keeps current content.

## Context
- Phase 01: `phase-01-theme-block-foundation-library.md`
- Brainstorm: [`brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md`](../reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md)

## Key insights
- 7 sections power the homepage template; 3 are currently hardcoded (home-hero, manifesto, newsletter); 4 already have blocks (pillars, marquee, reviews, shop-grid)
- home-hero is the highest-edit-frequency section. Conversion here delivers most merchant value
- Auto-migration pattern: section.settings.heading → default preset block `dop-heading` with text=section.settings.heading

## Requirements

### Functional
- 3 sections converted to block-driven (home-hero, manifesto, newsletter)
- 4 already-blocked sections accept `@theme` so theme blocks can be added
- Each section has a sensible default preset that mirrors current hardcoded content
- Merchant can: add/remove/reorder blocks within home-hero, swap stat panel for video, add 3rd CTA, etc.

### Non-functional
- LCP on homepage ≤ phase-08 baseline (per earlier funnel-reset)
- No CLS regression from block re-rendering
- Section IDs preserved (existing live theme settings carry over)

## Architecture

### Hardcoded → block-driven conversion plan

#### home-hero (currently 18 settings, 0 blocks)
- KEEP existing settings as fallback during transition
- ADD `blocks: [{"type": "@theme"}, {"type": "stat"}]` — `stat` is a section-specific block for hero stats panel
- ADD preset default: `[dop-heading (heading), dop-text (lede), dop-cta-pair (primary+secondary), stat × 3]`
- Liquid: render blocks if any exist; fall back to old hardcoded markup if `section.blocks.size == 0` (transition fallback, deleted in cleanup phase later)

#### home-manifesto (15 settings, 0 blocks)
- ADD `blocks: [{"type": "@theme"}, {"type": "column"}]` — `column` for 2-3 column copy layouts
- Preset: `[dop-heading, column × 2 (column has text richtext + optional cta)]`

#### home-newsletter (7 settings, 0 blocks)
- ADD `blocks: [{"type": "@theme"}]` — theme blocks above/below the form
- Form itself stays hardcoded (Shopify form integration)
- Preset: `[dop-heading, dop-text, <form>, dop-text (privacy line)]`

#### home-pillars, home-marquee, home-reviews, home-shop-grid (already have blocks)
- ADD `{"type": "@theme"}` to existing `blocks` array — merchant can intersperse theme blocks among section-specific ones
- No content changes

### Settings migration

Each converted section's `presets` array seeds default blocks on FIRST add. For ALREADY-PUBLISHED sections with existing settings (rfeixb-dd.myshopify.com preview), settings stay accessible via `section.settings.*` AND a one-time admin action ("Use new block layout") rebuilds blocks from settings.

This migration UX: ship the converted section, merchant sees a banner in theme editor → click → blocks auto-created from settings. Simple, low-risk.

## Related code files

### Edit (sections)
- `sections/dopamiles-home-hero.liquid` — add blocks rendering, preserve settings fallback
- `sections/dopamiles-home-manifesto.liquid` — full convert
- `sections/dopamiles-home-newsletter.liquid` — block accept + preset
- `sections/dopamiles-home-pillars.liquid` — extend blocks to accept @theme
- `sections/dopamiles-home-marquee.liquid` — extend
- `sections/dopamiles-home-reviews.liquid` — extend
- `sections/dopamiles-home-shop-grid.liquid` — extend

### Reference (no edit)
- `templates/index.json` — confirm section IDs unchanged (preserves live theme settings)

## Implementation steps

1. **home-hero conversion** (highest value, do first)
   - Add `{% for block in section.blocks %}` loop
   - Settings fallback: `{% if section.blocks.size == 0 %}<old markup>{% endif %}`
   - Schema: add blocks array + preset
   - iPhone screenshot before/after
2. **home-manifesto conversion** — similar pattern
3. **home-newsletter conversion** — keep form intact
4. **Already-blocked sections @theme accept** (4 sections) — one-line schema changes
5. **shopify theme check** — zero new errors
6. **Theme editor test** — log in to Admin → Customize → add/remove/reorder blocks on home page → verify renders
7. **Push to preview theme** — full push (no --only)
8. **iPhone QA gate** — user verifies on real device

## Todo

- [ ] Convert `dopamiles-home-hero.liquid` (largest change)
- [ ] Convert `dopamiles-home-manifesto.liquid`
- [ ] Convert `dopamiles-home-newsletter.liquid`
- [ ] Extend `dopamiles-home-pillars.liquid` with @theme accept
- [ ] Extend `dopamiles-home-marquee.liquid` with @theme accept
- [ ] Extend `dopamiles-home-reviews.liquid` with @theme accept
- [ ] Extend `dopamiles-home-shop-grid.liquid` with @theme accept
- [ ] Theme check pass
- [ ] Theme editor manual test (add blocks, reorder, screenshot)
- [ ] Code-reviewer subagent pass
- [ ] Commit + push to preview
- [ ] iPhone QA: real device test of homepage on preview URL

## Success criteria
- All 7 home sections accept theme blocks
- 3 converted sections have working presets
- iPhone QA pass: homepage renders identically to current preview when no blocks added
- Theme editor: merchant can drag blocks into home-hero, save, render correctly
- No CLS / LCP regression

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Settings → block migration breaks existing live theme settings | High | Settings stay accessible as fallback; explicit one-time migration action |
| Theme blocks render at unexpected widths/positions | Medium | CSS containment in blocks-base.css; test in editor |
| home-hero conversion regresses LCP (hero is above-the-fold) | Medium | Profile with Lighthouse before/after; defer non-critical block CSS |
| Newsletter form integration breaks on Shopify form schema | Low | Form markup unchanged; only surroundings become blocks |

## Halt rule
1 iteration max. iPhone QA failure → snapshot + halt + scope next iteration in a separate phase doc.

## Next phase
Phase 03 — PDP template conversion.
