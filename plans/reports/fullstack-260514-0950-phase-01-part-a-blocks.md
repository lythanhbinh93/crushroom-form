# Phase 01 Part A — Block Library Implementation Report

**Date:** 2026-05-14  
**Branch:** feat/bug-fix-sprint (pod-tee-theme repo)  
**Status:** DONE_WITH_CONCERNS

---

## Files Created

| File | Lines |
|---|---|
| `blocks/dop-spacer.liquid`      | 65 |
| `blocks/dop-text.liquid`        | 123 |
| `blocks/dop-heading.liquid`     | 169 |
| `blocks/dop-cta.liquid`         | 126 |
| `blocks/dop-cta-pair.liquid`    | 179 |
| `blocks/dop-image.liquid`       | 137 |
| `blocks/dop-stat.liquid`        | 113 |
| `blocks/dop-badge-row.liquid`   | 150 |
| `blocks/dop-icon-card.liquid`   | 158 |
| `blocks/dop-feature-row.liquid` | 161 |
| `assets/dopamiles-blocks-base.css` | 160 |

All block files ≤ 200 LOC (project rule satisfied).

## Files Edited

| File | Change |
|---|---|
| `sections/dopamiles-home-hero.liquid` | Added `{"type": "@theme"}` to schema `blocks` array (Step 6 render-test gate) |
| `layout/theme.liquid` | Conditional load of `dopamiles-blocks-base.css` (always-on, 8 KB) |
| `config/settings_schema.json` | Added "Dopamiles Color Schemes" group with 9 flat color settings (3 per scheme × 3 schemes) |

---

## @theme Accept Gate — PASSED

Step 6 executed first per instructions:
1. Created `blocks/dop-spacer.liquid` only
2. Added `{"type": "@theme"}` to `dopamiles-home-hero.liquid` schema
3. Ran `shopify theme check` → **11 errors / 38 warnings** (baseline match)

`@theme` block accept works on Dawn 15.x. Confirmed: block schema must NOT include `"target": "section"` (that was the one false-start — removed immediately, theme check re-ran clean).

---

## shopify theme check Results

| Checkpoint | Files | Errors | Warnings |
|---|---|---|---|
| Baseline (pre-work)         | 226 | 11 | 38 |
| After spacer + @theme gate  | 227 | 11 | 38 |
| After batch 1 (3 blocks)    | 229 | 11 | 38 |
| After batch 2 (3 blocks)    | 232 | 11 | 38 |
| After all 10 blocks         | 236 | 11 | 38 |
| After CSS + theme.liquid + settings_schema | 236 | **11** | **38** |

**Zero new errors introduced.**

---

## DONE_WITH_CONCERNS

### 1. CSS payload at exactly 8 KB
`dopamiles-blocks-base.css` is 8,192 bytes — exactly at the 8 KB target after one compaction pass. Currently loaded unconditionally in theme.liquid (site-wide) rather than template-conditional. Rationale: blocks can appear on any template; the 8 KB adds ~3 KB gzipped which is acceptable. If perf regression is flagged in Phase 08 re-check, switch to `{% if template.suffix contains 'blocks' %}` gate or move to a separate `<link media="print" onload>` deferred load.

### 2. color_scheme_group rejected by Dawn validator
The phase doc specifies a `color_scheme_group` with id `dop_color_schemes` and a `"default"` map. On Dawn 15.4.1, `color_scheme_group` in settings_schema requires ALL Dawn role fields (primary_button, on_primary_button, primary_button_border, secondary_button, on_secondary_button, secondary_button_border, links, icons) AND does not accept a `"default"` property. Adding the full role spec would expose Dawn's button/shadow colors mixed with Dopamiles brand tokens — that creates a confusing editor UX and color conflicts.

**Resolution chosen:** Replaced with a flat "Dopamiles Color Schemes" settings group holding 9 individual `color` pickers (3 schemes × bg/text/accent). Block CSS schemes are hardcoded in `dopamiles-blocks-base.css` using the brand values from `dopamiles-tokens.liquid`. Merchant can adjust these color pickers but blocks consume `--blk-*` vars set in CSS class definitions, not inline Liquid. If Phase 02 requires live merchant-adjustable block colors, wire the 9 pickers into `dopamiles-tokens.liquid` inline style overrides.

### 3. Icon card uses inline SVGs (not dopamiles-icon.liquid snippet)
The existing `dopamiles-icon.liquid` snippet only has check/chevron-down/check-bold icons. The icon-card block needs 9 icons (star, check, heart, truck, leaf, bolt, shield, award, map-pin). Icons are inlined directly in the block. If the icon library grows, consider extending the snippet in a future phase.

---

## Block Architecture Summary

All 10 blocks follow this pattern:
- CSS scheme class: `dop-scheme--{brand-light|brand-dark|brand-accent|neutral}`
- Spacing via CSS custom properties: `--block-pad-top`, `--block-pad-bot`, `--block-mar-top`, `--block-mar-bot` set inline from range sliders
- Alignment: `dop-align--{left|center|right}` utility classes
- Mobile: `dopamiles-blocks-base.css` reduces padding/margin to 60% at ≤767px
- Colors: consume `--blk-accent`, `--blk-text`, `--blk-bg` from scheme class; fall back to `--dop-accent`, `--dop-ink` from tokens

---

## Next Steps

- Part B (QA pipeline) — separate subagent scope
- Phase 02: Homepage template conversion using these blocks (replace hard-coded hero with block composition)
- Commit + push to preview theme 158279991548 (controller coordinates after Part B completes)
- If merchant-adjustable block schemes needed: wire `dop_scheme_*` settings into tokens snippet
