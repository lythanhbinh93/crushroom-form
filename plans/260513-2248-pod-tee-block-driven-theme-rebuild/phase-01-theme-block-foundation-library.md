# Phase 01 — Theme-block foundation library

**Status:** pending
**Owner:** code
**Effort:** 4-6h
**Depends on:** funnel-reset iPhone QA pass (cross-plan blocker)
**Gate:** render-test in 1 sample section (home-hero) + theme editor "Add block" UI shows all 10 types

## Goal
Create 10 reusable theme blocks under `blocks/dop-*.liquid` with Tier 2 customization (content + size + spacing + alignment + token-color). Establish color-scheme tokens in `config/settings_schema.json`. Foundation for Phases 02-05.

## Context
- Brainstorm: [`brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md`](../reports/brainstorm-260513-2230-pod-tee-block-driven-theme-rebuild.md)
- Shopify theme blocks docs: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks
- Existing block conventions: see `sections/dopamiles-home-pillars.liquid` (pillar block), `sections/dopamiles-faqs.liquid` (question block)

## Key insights
- Dawn 15.x supports `"type": "@theme"` block declaration in section schemas — required for theme blocks to be accepted.
- `blocks/*.liquid` files have their own schema with `{% schema %}` block; preset rendering is automatic in editor.
- Color schemes must live in `config/settings_schema.json` under a `color_scheme_group` setting to appear as picker options.
- Tier 2 visual controls (size selects, padding/margin range, alignment) require corresponding CSS — each block ships `<style>` block OR appends to a shared `blocks-base.css`.
- Settings sliders use Shopify's `"type": "range"` with min/max/step + unit.

## Requirements

### Functional
- 10 block files created with schemas
- Each block renders correctly in isolation
- Each block exposes Tier 2 settings as specced in brainstorm
- Block presets defined for theme editor "Add block" UI discovery
- Color-scheme tokens defined in `config/settings_schema.json` mapping to existing `--dop-*` CSS vars

### Non-functional
- Total block CSS payload under 8 KB (conditional load OK)
- Each block file ≤200 LOC per project modularization rule
- Theme check: zero new errors

## Architecture

### 10 theme blocks

| Block | Content settings | Visual settings |
|---|---|---|
| `dop-heading` | text, level (h1/h2/h3), eyebrow, accent_word | size (XS-XXL), weight, case, alignment, color_scheme, padding_top/bottom, margin_bottom |
| `dop-text` | content (richtext) | size (S/M/L), alignment, color_scheme, padding_top/bottom, margin_bottom, max_width (narrow/normal/wide/full) |
| `dop-cta` | label, url | style (primary/secondary/ghost), size (S/M/L), full_width (bool), alignment, color_scheme, margin_top/bottom |
| `dop-cta-pair` | primary {label,url}, secondary {label,url} | style each, size, layout (inline/stacked), alignment, gap, margin_top/bottom |
| `dop-image` | image, alt | aspect_ratio (auto/square/4:3/16:9/3:4), object_fit, corner_radius, alignment, max_width, padding_top/bottom |
| `dop-stat` | number, label, caption | size (S/M/L), alignment, color_scheme, padding_top/bottom |
| `dop-icon-card` | icon (select from dopamiles-icon library), heading, text | layout (icon-top/icon-left), icon_size, alignment, color_scheme, padding |
| `dop-feature-row` | image, heading, text, cta | side (left/right), image_width (40/50/60%), vertical_align, gap, padding |
| `dop-badge-row` | text items (repeating up to 6) | size (S/M/L), color_scheme, alignment, gap, padding_top/bottom |
| `dop-spacer` | — | height (XS=16/S=32/M=64/L=96/XL=128/XXL=192), show_divider (bool) |

### Color-scheme tokens (config/settings_schema.json addition)

```json
{
  "name": "Color schemes",
  "settings": [{
    "type": "color_scheme_group",
    "id": "color_schemes",
    "definition": [
      {"type": "color", "id": "background", "label": "Background"},
      {"type": "color", "id": "text", "label": "Text"},
      {"type": "color", "id": "accent", "label": "Accent"}
    ],
    "role": {"text": "text", "background": "background"},
    "default": {
      "brand-light":  {"background": "#FBFAF8", "text": "#1A1A1A", "accent": "#F26419"},
      "brand-dark":   {"background": "#1A1A1A", "text": "#FBFAF8", "accent": "#F26419"},
      "brand-accent": {"background": "#F26419", "text": "#FFFFFF", "accent": "#FBFAF8"},
      "neutral":      {"background": "#FFFFFF", "text": "#1A1A1A", "accent": "#1A1A1A"}
    }
  }]
}
```

### Mobile scaling
Single value per spacing setting. CSS in `blocks-base.css`:
```css
@media (max-width: 767px) {
  .dop-block { padding-top: calc(var(--block-pad-top) * 0.6); padding-bottom: calc(var(--block-pad-bot) * 0.6); }
}
```

## Related code files

### Create
- `blocks/dop-heading.liquid`
- `blocks/dop-text.liquid`
- `blocks/dop-cta.liquid`
- `blocks/dop-cta-pair.liquid`
- `blocks/dop-image.liquid`
- `blocks/dop-stat.liquid`
- `blocks/dop-icon-card.liquid`
- `blocks/dop-feature-row.liquid`
- `blocks/dop-badge-row.liquid`
- `blocks/dop-spacer.liquid`
- `assets/dopamiles-blocks-base.css` — shared base CSS for blocks (mobile scaling, CSS-var consumption)

### Edit
- `config/settings_schema.json` — add color_scheme_group
- `layout/theme.liquid` — load `dopamiles-blocks-base.css`
- `sections/dopamiles-home-hero.liquid` — add `"blocks": [{"type": "@theme"}]` to schema for render-test (full conversion in Phase 02)

## Implementation steps

1. **Block schema design pass** — draft the 10 schemas in a single Liquid spike file, validate via `shopify theme check`.
2. **Color-scheme tokens** — add `color_scheme_group` to `config/settings_schema.json`; verify Theme Editor → Theme Settings shows scheme picker.
3. **Create 10 block files** — one at a time, smallest first (dop-spacer, dop-text, dop-heading, then progressively richer).
4. **Shared base CSS** — `dopamiles-blocks-base.css` with CSS-var consumption pattern + mobile scaling.
5. **Wire conditional load** — `layout/theme.liquid` loads blocks-base.css when any block is in use (via `{% if template == 'index' or template contains 'product' %}` for now; refine in later phases).
6. **Render-test** — drop `{"type": "@theme"}` into `dopamiles-home-hero.liquid` schema, manually add a `dop-heading` + `dop-cta` via theme editor, screenshot result.
7. **Theme check pass** — `shopify theme check`, zero new errors.
8. **Code-review subagent pass** on the 10 block files + base CSS.

## Todo

- [ ] Draft 10 block schemas (spike + validate)
- [ ] Add `color_scheme_group` to `config/settings_schema.json`
- [ ] Create `blocks/dop-spacer.liquid` (simplest)
- [ ] Create `blocks/dop-text.liquid`
- [ ] Create `blocks/dop-heading.liquid`
- [ ] Create `blocks/dop-cta.liquid`
- [ ] Create `blocks/dop-cta-pair.liquid`
- [ ] Create `blocks/dop-image.liquid`
- [ ] Create `blocks/dop-stat.liquid`
- [ ] Create `blocks/dop-badge-row.liquid`
- [ ] Create `blocks/dop-icon-card.liquid`
- [ ] Create `blocks/dop-feature-row.liquid` (most complex)
- [ ] Create `assets/dopamiles-blocks-base.css`
- [ ] Wire conditional load in `layout/theme.liquid`
- [ ] Render-test in `dopamiles-home-hero.liquid` (temporary @theme accept)
- [ ] Screenshot proof in theme editor
- [ ] `shopify theme check` pass
- [ ] Delegate to code-reviewer subagent
- [ ] Commit + push to preview theme
- [ ] iPhone smoke (block renders correctly on real device)

## Success criteria
- 10 `blocks/dop-*.liquid` files created, schemas validate
- Theme editor "Add block" UI lists all 10 block types
- Block previews render correctly when added to test section
- Color-scheme picker shows 4 brand schemes
- Theme check baseline preserved (11 errors / 38 warnings, no new)
- Code-reviewer DONE or DONE_WITH_CONCERNS

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Shopify theme block schema spec drift between Dawn versions | Medium | Pin to Dawn 15.4.1 baseline (BASELINE.md commit 9ccdacf8); test in editor live |
| `@theme` block accept doesn't work on Dawn 15 | High | Verify on a test section before locking — fallback plan: section blocks per Approach 1 |
| Block CSS payload regression (>8 KB) | Medium | Conditional load; defer loading per template |
| Schema validation errors block push | Low | Theme check pre-commit; iterate locally |
| Icon-card block depends on dopamiles-icon.liquid which I just added today | Low | Already exists at `snippets/dopamiles-icon.liquid` |

## Security considerations
- No user input processing in blocks. All settings are merchant-supplied via Admin (trusted).
- Color tokens use `{{ scheme.colors.accent }}` style output — escape via Liquid default for safety.

## Next phase
Phase 02 — Homepage template conversion using these blocks.
