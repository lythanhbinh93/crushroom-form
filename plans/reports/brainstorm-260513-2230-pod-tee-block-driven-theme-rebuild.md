# pod-tee theme — block-driven rebuild (next phase brainstorm)

**Date:** 2026-05-13 22:30 ICT
**Author:** brainstorm session w/ user
**Source plan:** ends `260511-1132-pod-tee-funnel-reset` (Phase 10 code-complete)
**Successor plan target:** new dir `plans/260513-2230-pod-tee-block-driven-theme-rebuild/`

## Problem statement

Pod-tee-theme sections render hardcoded content. 24 of 38 dopamiles-* sections have **no `blocks` array** in their schema → merchant can edit section.settings (heading, eyebrow, CTAs) but cannot add/remove/reorder repeatable content elements in the Shopify theme editor.

Example: `dopamiles-home-hero.liquid` allows editing the 1 hero heading + 1 lede + 2 CTAs. Merchant cannot:
- Add a 3rd CTA
- Swap the stats panel for a video block
- Drop in a custom icon-row above the heading
- Reorder hero elements vertically

Live BuildMyPOD theme (currently on dopamiles.co) has more editor flexibility. Replacing it with the current pod-tee theme would feel like a downgrade for merchant editing.

## Requirements (locked via questions)

| # | Requirement | Locked |
|---|---|---|
| 1 | Architecture: hybrid — theme blocks for cross-section reusables + section-specific blocks for tightly-coupled content | ✅ |
| 2 | Sequencing: phase by template (homepage → PDP → collection/cart → misc) | ✅ |
| 3 | Publish timing: blocked until full retrofit ships — avoids settings-reset loop per phase | ✅ |
| 4 | Migration: auto-migrate existing section.settings to default block instances on first render | ✅ |
| 5 | Fold in the 2 flagged JS bugs from today's QA (`amount is not defined` + cart-main script-order) before publish | ✅ |
| 6 | No timeline pressure | ✅ |
| 7 | Halt rule: 1 iteration per phase (carried over from funnel-reset) | implicit |
| 8 | **Customization tier: Tier 2** — content + size selects + padding/margin sliders + alignment + token-bound color scheme. NOT free font/color pickers, NOT animations. ~10-15 settings per block. | ✅ |

## Approaches considered + rejected

### Rejected: Section blocks only (KISS)
Each section defines its own block types. Pattern: 1 schema per section. Less DRY — `heading`, `text`, `cta` schemas duplicated across 20+ sections. Easy to start but creates maintenance debt — adding a new setting to "text" block requires editing N section files.

### Rejected: Pure theme blocks
Move ALL block types under `blocks/dop-*.liquid`. Maximum DRY but forces awkward fit for tightly-coupled content (FAQ Q&A pair, accordion row, review card) where the block only makes sense in one section. Theme block schema is more rigid than section block schema for these cases.

### Rejected: All-at-once mega-phase
Convert all 38 sections in a single phase. Higher coordination + review risk. All-or-nothing ship. Loses the halt-rule safety net.

### Rejected: Top-5 sections only
Convert 5 sections, defer the other 33. Inconsistent merchant editor experience. Half-customized theme is worse than fully-hardcoded one.

### Rejected: Publish now, retrofit on live
Each phase resets merchant Admin config. Merchant rebuilds homepage 6 times across phases. Brand experience degrades on live during retrofit.

## Final recommended solution

**"Block-driven theme rebuild"** — 7-phase plan, hybrid block architecture, phased by template, publish-gated.

### Architecture

#### Theme blocks (cross-section reusables) — `blocks/dop-*.liquid`

Each block ships with **Tier 2 controls**: content settings + visual controls (size, alignment, spacing, color scheme via theme tokens). ~10-15 settings per block, ~60-100 LOC each.

| Block file | Purpose | Content settings | Visual settings (Tier 2) |
|---|---|---|---|
| `blocks/dop-heading.liquid` | H1/H2/H3 with eyebrow + accent | text, level (h1/h2/h3), eyebrow, accent_word | size (XS/S/M/L/XL/XXL), weight (light/regular/medium/bold), case (default/upper), alignment (left/center/right), color_scheme, padding_top/bottom, margin_bottom |
| `blocks/dop-text.liquid` | Paragraph / richtext | content (richtext) | size (S/M/L), alignment, color_scheme, padding_top/bottom, margin_bottom, max_width (narrow/normal/wide/full) |
| `blocks/dop-cta.liquid` | Single CTA button | label, url | style (primary/secondary/ghost), size (S/M/L), full_width (bool), alignment, color_scheme, margin_top/bottom |
| `blocks/dop-cta-pair.liquid` | Two CTAs side-by-side | primary {label,url}, secondary {label,url} | style each, size, layout (inline/stacked), alignment, gap, margin_top/bottom |
| `blocks/dop-image.liquid` | Image with alt + sizes | image, alt | aspect_ratio (auto/square/4:3/16:9/3:4), object_fit (cover/contain), corner_radius (none/sm/md/lg/full), alignment, max_width, padding_top/bottom |
| `blocks/dop-stat.liquid` | Big-number stat | number, label, caption | size (S/M/L), alignment, color_scheme, padding_top/bottom |
| `blocks/dop-icon-card.liquid` | Icon + heading + text | icon (select from dopamiles-icon library), heading, text | layout (icon-top/icon-left), icon_size, alignment, color_scheme, padding |
| `blocks/dop-feature-row.liquid` | Image + text side-by-side | image, heading, text, cta | side (left/right), image_width (40/50/60%), vertical_align (top/center/bottom), gap, padding |
| `blocks/dop-badge-row.liquid` | Inline pills/badges | text items (repeating) | size (S/M/L), color_scheme, alignment, gap, padding_top/bottom |
| `blocks/dop-spacer.liquid` | Vertical whitespace | — | height (XS=16px/S=32/M=64/L=96/XL=128/XXL=192), show_divider (bool) |

Total: 10 reusable block types. Visual settings exposed via select dropdowns + range sliders → brand-safe (no free font/color pickers).

**Color scheme tokens** — each block's `color_scheme` setting maps to predefined schemes in `config/settings_schema.json`:
- `brand-light` — `--dop-bg` background, `--dop-ink` text, `--dop-accent` accent
- `brand-dark` — `--dop-ink` background, `--dop-bg` text, `--dop-accent` accent
- `brand-accent` — `--dop-accent` background, white text
- `neutral` — system default
- `inherit` — uses parent section's scheme

This means merchants can recolor blocks via the scheme dropdown but cannot pick neon green. Brand-consistent flexibility.

**Mobile responsiveness:** single value per setting; theme CSS auto-scales on viewport `<768px` (e.g., `padding * 0.6`). Avoids schema-doubling complexity of Tier 3 separate mobile values. Risk: some layouts may need manual mobile tweaks during QA. Mitigation: iPhone QA gate at end of each phase.

#### Section-specific blocks (stay where they are)

These already have or need blocks tightly coupled to section logic — don't extract:
- `dopamiles-faqs.liquid` → `question` blocks (Q&A pairs)
- `dopamiles-product-hero.liquid` → `accordion` blocks (PDP-specific UX)
- `dopamiles-home-pillars.liquid` → `pillar` blocks (icon + title + body, structured)
- `dopamiles-home-reviews.liquid` → review blocks (star_rating, body, author, source)
- `dopamiles-fbt.liquid` → product reference blocks (Shopify product picker)
- `dopamiles-home-marquee.liquid` → text-item blocks (ticker)
- `dopamiles-home-shop-grid.liquid` → tab blocks (collection picker)
- `dopamiles-trust-trio.liquid` → trust-item blocks (3-up icons)
- `dopamiles-bundle.liquid` → bundle-tier blocks
- `dopamiles-reasons.liquid` → reason blocks
- `dopamiles-collection-grid.liquid` → filter blocks (likely)
- `dopamiles-footer.liquid` → menu/text/social blocks

Both kinds of blocks can coexist via Shopify's `"type": "@theme"` block declaration — sections accept reusable theme blocks PLUS section-specific blocks.

### Phases

| # | Phase | Sections touched | Effort | Gate |
|---|---|---|---|---|
| 01 | Theme-block foundation library | NEW `blocks/dop-*.liquid` × 10 | 4-6h | Render-test in 1 sample section (home-hero) |
| 02 | Homepage template | home-hero, home-manifesto, home-newsletter (+ accept-theme-blocks on existing 4 already-blocked home-* sections) | 4-6h | iPhone QA |
| 03 | PDP template | product-hero (beyond accordion), reasons, trust-trio (extend), bundle, 3pack-picker | 3-5h | iPhone QA |
| 04 | Collection + cart | collection-grid header, cart-drawer settings, cart-main, more-from-niche, niche-favorites | 2-4h | iPhone QA |
| 05 | Misc pages | contact, page, search, blog-article, blog-index | 3-5h | spot-check |
| 06 | System pages (DEFERRABLE) | 404, password, gift-card, customer-* | 2-3h | low priority |
| 07 | Publish-prep + ship | Fix `amount is not defined` + cart-main script-order, theme check pass, rollback runbook, real-iPhone full-funnel QA, theme swap on dopamiles.co | 2-4h | LIVE |

**Total estimated effort:** 20-33h. Phase 06 is deferrable if calendar tight.

### Settings auto-migration pattern

For each retrofitted section, the new schema includes a `default` block array that seeds blocks from existing settings on first load:

```liquid
{% schema %}
{
  "name": "Home Hero",
  "blocks": [
    {"type": "@theme"},
    {"type": "stat"}
  ],
  "presets": [
    {
      "name": "Home Hero",
      "category": "Header",
      "blocks": [
        {"type": "dop-heading", "settings": {"text": "Run for the dopamine."}},
        {"type": "dop-text",    "settings": {"content": "Tees built for slow runners."}},
        {"type": "dop-cta-pair","settings": {"primary_label":"Shop tees","primary_url":"/collections/all"}}
      ]
    }
  ],
  ...
}
{% endschema %}
```

Existing live theme settings stay accessible via `section.settings.{heading,lede,cta_*}` as a transition fallback — sections render blocks if present, fall back to settings if not. Then after merchant rebuilds in editor (auto-prompted via preset), settings can be deprecated in a cleanup phase.

### Naming conventions

- Block files: `blocks/dop-{kebab}.liquid` (matches existing `dopamiles-*` pattern, just shorter)
- Block types: kebab-case matching filename
- Section schema names: ≤25 chars (Shopify limit per memory)
- Block schema names: keep short for editor sidebar readability

### Halt rule + iPhone QA gate

Same as funnel-reset:
- 1 iteration max per phase. If iPhone QA fails, snapshot + halt + plan next iteration.
- iPhone QA on preview theme between every phase. No `--only` shortcuts — full re-push so deletions sync.
- Code-review subagent before push, adversarial review on schema PRs.

## Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Shopify theme block API drift between Dawn 15 versions | Medium | Pin to current Dawn baseline (BASELINE.md commit 9ccdacf8). Test in theme editor after each phase. |
| Merchant settings reset on phase pushes | High → mitigated | Don't publish until all phases ship. Preview-only iteration. |
| Section liquid breaks if block schema malformed | High | `shopify theme check` pre-commit. Render in theme editor before push. |
| Theme editor "Add block" UX overwhelms merchant (10+ block types) | Medium | Group via `info` strings, use `tag` field for categorization, presets prefilled |
| Phase 07 publish itself fails (theme swap downtime) | Medium | Rollback runbook (memorized from earlier session). `.dawn-backup.json` files now under `docs/templates-dawn-backup/` (relocated 2026-05-13). |
| Block render perf regression | Low | Each block = 1 Liquid render call. 5-10 blocks per section ≈ negligible. Profile with Lighthouse mobile if suspect. |
| The 2 flagged JS issues block publish in Phase 07 | Low | Pre-allocated time in Phase 07. ~40-90 min total fix. |
| Existing app blocks (Globo) conflict with new `@theme` accept | Low-Medium | Test Globo's PDP integration after Phase 03. Globo uses `@app` block declarations which coexist. |

## Success criteria

- Every dopamiles-* section in scope (Phases 01-05) accepts AT LEAST 3 theme blocks via theme editor "Add block" UI
- 10 `blocks/dop-*.liquid` files exist + render correctly in test section
- Merchant can build the homepage end-to-end in theme editor without touching code
- iPhone QA passes after each phase
- Theme check: zero new errors vs current baseline (11 errors / 38 warnings — pre-existing)
- Phase 07 ships pod-tee to dopamiles.co live, BuildMyPOD retired

## Dependencies + ordering

- Phase 01 (foundation) blocks everything else
- Phases 02-05 are template-scoped and CAN run in parallel if multiple contributors — recommend sequential for solo work to keep iPhone-QA gates clean
- Phase 06 (system pages) optional, can be deferred forever
- Phase 07 depends on all prior phases + iPhone QA passes + 2 JS bug fixes

## Out of scope

- Refactoring existing section blocks (FAQ, accordion, pillar, review, etc.) — they already work
- Migrating to a different theme base (still Dawn 15.x)
- Removing app blocks (Globo, FB Pixel) — they stay
- Mobile-app theme editing — Shopify mobile app limitations apply
- A/B testing the block layouts — merchant-driven decision, not theme

## Next steps

1. User decides: proceed to `/ck:plan` to create implementation plan dir with 7 phase files
2. If yes — plan dir: `plans/260513-2230-pod-tee-block-driven-theme-rebuild/`
3. If no — design doc stands alone, can be picked up later

## Unresolved questions

1. **Block taxonomy validation** — is the 10-block library actually sufficient? Need a dry-run mapping of the 24 hardcoded sections' content → which blocks they'd use. Should be done in Phase 01 before locking the library.
2. **Theme editor UX** — does Shopify let us hide rarely-used block types under a "More" group? If not, 10 blocks in a flat list may overwhelm. Need to test in Theme Editor early.
3. **Globo / FB Pixel coexistence** — preview shows Globo metafield empty (per memory). Will the test reflect production behavior with Globo installed? Worth checking Phase 03.
4. **`@theme` declaration in older Dawn** — Dawn 15.4.1 baseline. Need to verify `"type": "@theme"` in section schema works without errors. (Shopify docs confirm OS 2.0 + Dawn 15+; should be fine.)
5. **Localization** — current theme has locale strings. Should new blocks default to keys in `locales/*.json` or hardcode preset defaults? Preset defaults are simpler but bake English. Probably keys for shipped blocks.
