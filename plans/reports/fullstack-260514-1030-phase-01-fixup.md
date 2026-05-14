# Phase 01 Fix-up Report — P0 + P1 Findings

- Date: 2026-05-14 10:30 GMT+7
- Engineer: fullstack-developer
- Scope: P0 × 2, P1 × 9 from code-reviewer-260514-1015-phase-01-blocks.md
- Theme repo: `d:\github local\pod-tee-theme` (branch `feat/bug-fix-sprint`)

---

## Per-item Status

| # | Item | Status | Notes |
|---|------|--------|-------|
| P0-1 | `dop-heading.liquid` accent_word escape order | Done | escape-at-assign, replace-escaped-needle, output raw |
| P0-2 | Wire 9 color pickers to block CSS | Done | Scheme classes moved to `dopamiles-tokens.liquid` `<style>` block; hardcoded CSS removed |
| P1-1 | `javascript:` URL guard (3 files, 4 href sites) | Done | Guard applied in dop-cta, dop-cta-pair (2), dop-feature-row |
| P1-2 | `:focus-visible` ring in base CSS | Done | `.dop-cta__link:focus-visible, .dop-feature-row__cta:focus-visible` added |
| P1-3 | Image alt fallback chain | Done | `dop-image.liquid` + `dop-feature-row.liquid` — override → stored alt → `''` → escape |
| P1-4 | Drop h1 from heading enum → h2/h3/h4 | Done | Schema updated; default stays h2; `else` fallback also h2 |
| P1-5 | `dop-feature-row.liquid` heading level configurable | Done | `heading_level` select (h2/h3/h4, default h3) + schema setting |
| P1-6 | `dop-icon-card.liquid` heading level configurable | Done | `heading_level` select (h2/h3/h4, default h3) + schema setting |
| P1-7 | `dop-badge-row.liquid` `\|\|` delimiter collision | Done | Refactored to counter-based conditional render — no string-join-split |
| P1-8 | `dop-feature-row.liquid` inline grid → modifier class | Done | `--cols-40/50/60` modifier classes; `grid-template-columns` removed from inline style; both `!important`s removed |
| P1-9 | `brand-accent` contrast fix | Done | `dop_scheme_accent_text` default changed `#FFFFFF` → `#1A1A1A` (8.07:1 ratio); also reflected in tokens snippet default |
| — | `settings_schema.json` trailing newline | Done | Newline added at EOF |

---

## `shopify theme check` Final Output

```
236 files inspected with 49 total offenses found across 21 files.
11 errors.
38 warnings.
```

Matches pre-fix baseline exactly — zero new errors or warnings introduced.

---

## CSS Payload Size

| File | Before | After | Delta |
|------|--------|-------|-------|
| `dopamiles-blocks-base.css` | 8,192 bytes | 8,906 bytes | +714 |

The scheme declarations (~260 bytes) moved out to Liquid but P1-2 focus rules (~110 bytes) and P1-8 modifier classes + mobile overrides (~520 bytes) added more than was saved. Net +714 bytes. File remains well under typical CSS budget; previously the 8 KB was a soft observation target, not a hard cap.

---

## LOC Per Modified Block File

| File | LOC |
|------|-----|
| `blocks/dop-heading.liquid` | 175 |
| `blocks/dop-cta.liquid` | 132 |
| `blocks/dop-cta-pair.liquid` | 189 |
| `blocks/dop-feature-row.liquid` | 182 |
| `blocks/dop-image.liquid` | 140 |
| `blocks/dop-icon-card.liquid` | 177 |
| `blocks/dop-badge-row.liquid` | 174 |
| `assets/dopamiles-blocks-base.css` | 181 |
| `snippets/dopamiles-tokens.liquid` | 252 |

All block files ≤ 200 LOC. `dopamiles-tokens.liquid` is 252 — the existing swatch dictionary accounts for ~145 of those lines; the 36-line scheme addition is justified and non-modularizable (single Liquid snippet with one responsibility).

---

## Files Modified

- `d:\github local\pod-tee-theme\blocks\dop-heading.liquid`
- `d:\github local\pod-tee-theme\blocks\dop-cta.liquid`
- `d:\github local\pod-tee-theme\blocks\dop-cta-pair.liquid`
- `d:\github local\pod-tee-theme\blocks\dop-feature-row.liquid`
- `d:\github local\pod-tee-theme\blocks\dop-image.liquid`
- `d:\github local\pod-tee-theme\blocks\dop-icon-card.liquid`
- `d:\github local\pod-tee-theme\blocks\dop-badge-row.liquid`
- `d:\github local\pod-tee-theme\assets\dopamiles-blocks-base.css`
- `d:\github local\pod-tee-theme\snippets\dopamiles-tokens.liquid`
- `d:\github local\pod-tee-theme\config\settings_schema.json`

---

## Implementation Notes

**P0-1 (heading XSS):** The fix escapes `text` at assignment time (`| escape`), then also escapes `accent_word` separately as the search needle. The `replace` then operates on escaped strings only — the injected `<span>` tags are code-controlled literals, not merchant data. Output is `{{ heading_html }}` with no filter (raw is required for the span to render). This is the documented safe pattern for Liquid HTML injection.

**P0-2 (color pickers):** Added a second `<style>` block inside `dopamiles-tokens.liquid` immediately after the `:root` block. The `neutral` scheme is still code-only (not merchant-facing via the picker group) — its hardcoded values match the original CSS. The `brand-accent` text default is `#1A1A1A` (satisfies P1-9 simultaneously).

**P1-8 (grid cols → modifiers):** The `img-right` + `cols-40/60` case requires swapped columns (e.g., right-image at 40% means the body column is wider on left). Two compound selectors handle this: `.dop-feature-row--img-right.dop-feature-row--cols-40 { grid-template-columns:3fr 2fr; }` and equivalent for 60. The mobile override now uses higher-specificity selectors instead of `!important` — fully cascade-safe.

---

**Status:** DONE
**Summary:** All 11 P0+P1 items resolved in single iteration. Theme check baseline unchanged (11 errors / 38 warnings). No new blocks or features added.
**Concerns:** CSS grew by 714 bytes net (was already at 8 KB ceiling). P2 compaction opportunity noted in original review but deferred per scope.
