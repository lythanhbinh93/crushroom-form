# Phase 02 Report — Homepage Section Block Conversion

**Date:** 2026-05-14  
**Branch:** feat/bug-fix-sprint (pod-tee-theme)  
**Status:** DONE_WITH_CONCERNS

---

## Files Modified

| File | LOC | Change |
|------|-----|--------|
| `sections/dopamiles-home-hero.liquid` | 138 | Full conversion: stat block + blocks loop + settings fallback |
| `sections/dopamiles-home-manifesto.liquid` | 127 | Full conversion: column block + blocks loop + settings fallback |
| `sections/dopamiles-home-newsletter.liquid` | 148 | Added `@theme` blocks + preset; form preserved intact |
| `sections/dopamiles-home-pillars.liquid` | 168 | No change (see concern #1) |
| `sections/dopamiles-home-marquee.liquid` | 59 | No change (see concern #1) |
| `sections/dopamiles-home-reviews.liquid` | 206 | No change (see concern #2) |
| `sections/dopamiles-home-shop-grid.liquid` | 175 | No change (see concern #1) |

## Snippets Created

| File | LOC | Purpose |
|------|-----|---------|
| `snippets/dopamiles-home-hero-stat.liquid` | 18 | Renders `stat` section-local block for home-hero |
| `snippets/dopamiles-home-manifesto-column.liquid` | 38 | Renders `column` section-local block for home-manifesto; includes javascript:/data:/vbscript: URL guard on cta_url |

---

## Per-Section Status

### dopamiles-home-hero
- Blocks: section-local `stat` type (number, label, caption) — NO `@theme` (see concern #1)
- Preset: 3× `stat` blocks with seeded defaults ($32 / 4.9★ / 7 days)
- Fallback: full hardcoded markup preserved in `{%- else -%}` branch
- `block.shopify_attributes` on stat wrapper via snippet

### dopamiles-home-manifesto
- Blocks: section-local `column` type (heading, richtext body, optional CTA)
- Preset: 2× `column` blocks
- Fallback: full hardcoded settings markup preserved in `{%- else -%}` branch
- URL guard in snippet strips `javascript:` / `data:` / `vbscript:` from cta_url

### dopamiles-home-newsletter
- Blocks: `{"type":"@theme"}` only — no local blocks (compliant)
- Preset: `[dop-heading, dop-text, dop-text]`
- Fallback: eyebrow + heading + lede rendered from settings when `section.blocks.size == 0`
- Form markup untouched, always rendered in right panel

### dopamiles-home-pillars / home-marquee / home-reviews / home-shop-grid
- NOT modified (see concern #1 — platform constraint prevents `@theme` addition)

---

## `shopify theme check` Result

```
238 files inspected with 49 total offenses found across 21 files.
11 errors.
38 warnings.
```

**Exact match of Phase 01 baseline (11 errors / 38 warnings). Zero new offenses.**

---

## Concerns

### Concern #1 — BLOCKING SPEC DEVIATION: `@theme` cannot mix with local blocks (Shopify platform constraint)

**Spec required:** Add `{"type":"@theme"}` to all 7 sections including pillars, marquee, reviews, shop-grid.

**Platform reality:** Shopify enforces `ValidLocalBlocks` — a section can accept *either* theme blocks (`@theme`) *or* locally-scoped blocks, **never both simultaneously**. This is a hard API-level constraint with no workaround. Attempting to mix causes a `ValidLocalBlocks` error (severity: error, non-disableable).

**What was done:**
- `home-newsletter`: only `@theme`, no local blocks → compliant, `@theme` accepted
- `home-hero` / `home-manifesto`: have local `stat`/`column` blocks → `@theme` removed to stay compliant
- `home-pillars` / `home-marquee` / `home-reviews` / `home-shop-grid`: have existing local block types (`pillar`, `phrase`, `review`, `tab`) → `@theme` cannot be added without migrating those types to `/blocks/` theme block files

**Resolution options for Phase 03 (controller must decide):**
1. Migrate `pillar`, `phrase`, `review`, `tab` to theme block files in `/blocks/` — then those 4 sections become fully `@theme`-only and can accept theme blocks
2. Keep sections local-block-only (current state) — merchant cannot intersperse theme blocks among section-specific blocks
3. For hero/manifesto: convert `stat`/`column` to theme block files in `/blocks/` — enables `@theme` on those sections too

### Concern #2 — `dopamiles-home-reviews.liquid` at 206 LOC (pre-existing)

Original file was 207 LOC before Phase 02 (dense preset with 3 full review blocks). Phase 02 made no content changes to reviews. 6 lines over the 200-LOC target is pre-existing, not introduced here. Recommend trimming preset inline settings in a housekeeping pass.

---

## Next Steps

- Controller: decide migration path for Concern #1 before Phase 03 proceeds
- If option 1 chosen: Phase 03 scope expands to include moving `pillar`/`phrase`/`review`/`tab` to `/blocks/` theme block files
- Phase 03 should also plan removal of settings-fallback branches once merchant migration is complete

---

**Status:** DONE_WITH_CONCERNS  
**Summary:** 3 sections converted to block-driven with settings fallback; 2 snippets created; theme check holds at 11 errors / 38 warnings baseline. `@theme` accept on 4 already-blocked sections is blocked by Shopify platform constraint (cannot mix local + theme block types).  
**Concerns:** Platform constraint prevents `@theme` on 6 of 7 sections as specced; controller must decide migration strategy before Phase 03.
