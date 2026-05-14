# Phase 01 — Header search CSS cleanup

**Status:** pending
**Owner:** code
**Effort:** ~30 min
**Depends on:** none
**Gate:** Manual visual verification on preview 158279991548

## Goal
Three CSS rule groups added to `dopamiles-header.css` to fix the user-reported "ugly" symptoms on the expandable header search.

## Context
- File: `D:\github local\pod-tee-theme\assets\dopamiles-header.css` — existing `.dop-search-*` block lives at lines 115-161
- Markup: `D:\github local\pod-tee-theme\sections\dopamiles-header.liquid` lines 67-96 (form + outer toggle)
- JS: `D:\github local\pod-tee-theme\assets\dopamiles-header.js` already toggles `aria-expanded` on `#dop-search-toggle` and `aria-hidden` on `#dop-search-wrapper` in lockstep — no JS changes needed
- Brand tokens used: `--dop-ink` (#1A1A1A), `--dop-ink-3` (#737373), `--dop-line` (#E8E8E8), `--dop-surface` (#fff)

## Key insights
- `<input type="search">` WebKit cancel button needs both `::-webkit-search-cancel-button` AND `::-webkit-search-decoration` selectors zeroed out
- Firefox doesn't render a native cancel button, so the WebKit pseudo-element rules are no-ops outside WebKit/Chromium — no Firefox regression risk
- Existing `.dop-icon-btn` class in the same CSS file is the visual template for "flat icon button on hover ink color" — match its hover/focus pattern
- Submit button kept in DOM (not removed) so non-keyboard users can still submit via click; styled to look like a flat icon, not a bordered control

## Requirements

### Functional
- Submit button continues to submit the form (Enter key OR click both work)
- Esc-key collapse continues to work (already wired in dopamiles-header.js)
- No regression on input focus state (the existing `:focus-within` border darkening on `.dop-search-form` must still fire)

### Non-functional
- ~20 LOC added in `dopamiles-header.css`
- Theme check baseline preserved: 11 errors / 38 warnings
- No new asset files, no new JS

## Architecture

### CSS additions (append to existing `.dop-search-*` block in dopamiles-header.css)

```css
/* Kill WebKit's native search cancel — surrendered to brand × discipline.
   Users clear via Esc, Backspace, or mobile-keyboard gesture. */
.dop-search-form input[type="search"]::-webkit-search-cancel-button,
.dop-search-form input[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

/* Submit button as flat icon — matches .dop-icon-btn aesthetic.
   Border/bg stripped so the magnifier reads as an inline accent, not a control. */
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

/* Hide outer toggle while form is expanded — eliminates the two-magnifier
   redundancy. dopamiles-header.js toggles aria-expanded in lockstep with
   the wrapper's aria-hidden, so this single rule is the only gate needed. */
#dop-search-toggle[aria-expanded="true"] {
  display: none;
}
```

## Related code files

### Edit
- `D:\github local\pod-tee-theme\assets\dopamiles-header.css` — append three rule groups inside the existing `/* ── Search expand area ── */` block

### Read for context
- `D:\github local\pod-tee-theme\sections\dopamiles-header.liquid` — confirm `aria-expanded` is on `#dop-search-toggle` (it is)
- `D:\github local\pod-tee-theme\assets\dopamiles-header.js` — confirm JS toggles `aria-expanded` (it does)

## Implementation steps
1. Read existing `.dop-search-*` CSS block to find the right append point (after `.dop-search-wrapper[aria-hidden="true"] .dop-search-form { display: none; }`)
2. Append the three rule groups inside the same block (before the `/* ── Hamburger ── */` divider)
3. `shopify theme check` — must show 11/38 baseline
4. Push only `assets/dopamiles-header.css` to preview 158279991548
5. Manual verify in browser on preview:
   - Open search → outer toggle hides
   - Type → no blue ×
   - Hover magnifier → flat icon, darkens
   - Esc → closes, toggle reappears
   - Enter → submits

## Todo
- [ ] Read CSS append point
- [ ] Add WebKit cancel-button suppression rules
- [ ] Add flat-icon submit button rules
- [ ] Add aria-expanded toggle-hide rule
- [ ] shopify theme check baseline preserved
- [ ] Push to preview 158279991548
- [ ] Manual verify: outer toggle hides on expand
- [ ] Manual verify: no native × on input
- [ ] Manual verify: submit reads as flat icon, hover darkens
- [ ] Manual verify: Esc and Enter still work

## Success criteria
All three defects resolved. Theme check baseline preserved. No JS or markup changes. Form submission paths (click + Enter) both functional.

## Halt rule
1 iteration max. If the CSS edit somehow breaks the form layout or toggle JS state → snapshot + revert the file + report BLOCKED with the failure mode.

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| WebKit pseudo-element rules ignored in Firefox | Low | Firefox doesn't render a native cancel anyway; rule is no-op. No regression. |
| Submit button hard to discover (no border) | Low | Enter submits as primary path; cursor + hover darken provides discoverability. Matches `.dop-icon-btn` precedent. |
| `aria-expanded` ever flipped without form actually opening | Low | dopamiles-header.js toggles aria-expanded and aria-hidden in lockstep — single source of truth. |
| User loses ability to clear the input by clicking | Low | Trade-off accepted in brainstorm. If usage data later flags it, add a styled × button. |

## Security
Visual-only. No new user input handling. No HTML attributes that carry XSS risk.

## Next phase
None. Plan complete after this phase ships.
