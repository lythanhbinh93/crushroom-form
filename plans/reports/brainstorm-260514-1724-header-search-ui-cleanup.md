# Brainstorm — Header search UI cleanup

**Date:** 2026-05-14 17:24 GMT+7
**Scope:** Visual cleanup of dopamiles-header expandable search form
**Effort:** ~30 min (CSS-only, no markup/JS changes)
**Status:** Design approved, ready to implement

## Problem

Header search form, when expanded, shows three visual defects:

1. **Native WebKit `×` clear button** rendered with browser default (visible blue X) — never styled
2. **Submit `<button>`** rendered with browser default bordered-rectangle button styling — inherits nothing from Dopamiles design tokens
3. **Outer toggle circle** (`#dop-search-toggle`) remains visible alongside the expanded pill form → two magnifier icons on screen at once, visual redundancy

`dopamiles-header.css` styles the `.dop-search-form` pill (border, padding, height) but never restyles the children. Defaults leak through.

## Approaches evaluated

| # | Approach | Effort | Verdict |
|---|---|---|---|
| A | Surgical CSS cleanup | ~30 min | ✅ Chosen |
| B | Header dropdown panel (reuses dopamiles-search.css patterns) | ~90 min | Park for later if richer search UX desired |
| C | Full-width slide-in sheet (top banner) | ~60 min | Overkill for current symptom |

Picked A — fixes user-reported "ugly" symptoms without restructuring markup or wiring new JS state. B/C remain available as follow-ups if conversion data later warrants the bigger UI investment.

## Design

CSS-only edits in [dopamiles-header.css](D:/github%20local/pod-tee-theme/assets/dopamiles-header.css). Three rule groups:

### 1. Suppress WebKit native cancel
```css
.dop-search-form input[type="search"]::-webkit-search-cancel-button,
.dop-search-form input[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}
```
Removes the blue ×. Users clear via Esc, Backspace, or iOS keyboard gesture. No explicit clear button reintroduced — KISS, no JS needed. If usage data later shows users hunting for a clear control, add a styled × button as a follow-up.

### 2. Style submit button as flat icon
```css
.dop-search-form button[type="submit"] {
  background: transparent;
  border: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--dop-ink-3, #737373);
  cursor: pointer;
  transition: color 120ms ease;
}
.dop-search-form button[type="submit"]:hover,
.dop-search-form button[type="submit"]:focus-visible {
  color: var(--dop-ink, #1A1A1A);
}
```
Submit button stays in the DOM (form fallback for non-keyboard submit), but reads as a flat icon — no border, no background, ink color on hover. Matches the existing `.dop-icon-btn` aesthetic in `dopamiles-header.css`.

### 3. Hide outer toggle when form is expanded
```css
#dop-search-toggle[aria-expanded="true"] {
  display: none;
}
```
`dopamiles-header.js` already toggles `aria-expanded` on the button — single CSS rule kills the redundancy.

## Files touched

- [assets/dopamiles-header.css](D:/github%20local/pod-tee-theme/assets/dopamiles-header.css) — ~20 LOC added near the existing `.dop-search-*` block (line 115+)

No changes to:
- `sections/dopamiles-header.liquid` (markup is already correct)
- `assets/dopamiles-header.js` (aria-expanded toggling already wired)

## Definition of done

- No blue native × visible in any browser on the expanded search
- Submit magnifier renders flat (no border/background), darkens on hover
- Outer toggle disappears when form is expanded; reappears when collapsed
- Theme check baseline preserved (11 errors / 38 warnings)
- Manual spot-check on preview 158279991548: open search, type "test", hover the magnifier, hit Esc to close

## Risk

| Risk | Severity | Mitigation |
|---|---|---|
| `::-webkit-search-cancel-button` style not honored in Firefox | Low | Firefox doesn't render a native cancel anyway; rule is no-op outside WebKit. No regression. |
| Submit button becomes hard to discover (no border) | Low | Pressing Enter submits — primary path. Icon visible on hover via cursor. Most users won't click; they'll type + Enter. |
| Outer toggle hiding breaks if `aria-expanded` ever flipped without form actually opening | Low | JS toggles `aria-expanded` and `aria-hidden` in lockstep (read `dopamiles-header.js`). Single source of truth. |

## Security
None — visual-only change, no user input handling alterations.

## Next steps

Two execution paths:

- **A) Direct execution via /ck:cook** — single 20-LOC edit, doesn't really need a multi-phase plan. Hand this report to cook and ship.
- **B) Formal /ck:plan** — overkill for the scope, but available if the user wants the same plan→cook discipline as other recent work.

## Unresolved questions

None — design is final.
