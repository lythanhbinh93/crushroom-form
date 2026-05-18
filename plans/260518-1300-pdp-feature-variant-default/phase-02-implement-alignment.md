---
phase: 2
title: Implement Alignment
status: completed
priority: P1
effort: ~30 min
dependencies:
  - 1
---

# Phase 2: Implement Alignment

## Overview

Ship the surgical fix: server emits the feature color, JS forces Globo to highlight + select the matching swatch on init. ~30 LOC added across one Liquid file and one JS file. Uses selectors and click behavior captured in Phase 01.

## Requirements

- **Functional:** Globo swatch matching `selected_or_first_available_variant.options[0]` is selected on PDP load on every multi-option product.
- **Non-functional:** No regression to existing Globo coexistence logic; no new pageerrors; works inside the existing `MutationObserver` block (no new observer instances).

## Architecture

```
Server (Liquid)
  └─ dopamiles-product-hero.liquid emits data-dop-preferred-color="{{ color }}" on section root

Client (JS)
  └─ dopamiles-pdp-variant-sync.js
       └─ initSection()
            └─ (existing) Globo MutationObserver at lines 322-342
                 └─ (NEW) on Globo present → alignGloboToPreferredColor()
                      ├─ Read preferred color from section dataset
                      ├─ Normalize color string (lowercase, strip spaces/hyphens)
                      ├─ Find Globo swatch with matching normalized color
                      ├─ If found AND not already selected → .click()
                      └─ Set section.dataset.dopGloboAligned = '1' (once-per-init guard)
```

Server is source of truth. JS enforces alignment downstream. Existing observer infrastructure is the host; no new event listeners or polls.

## Related Code Files

- **Modify:** `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid` (~3 lines: add `data-dop-preferred-color` attr on section root or hero wrapper)
- **Modify:** `D:\github local\pod-tee-theme\assets\dopamiles-pdp-variant-sync.js` (~30 LOC: add `alignGloboToPreferredColor()` function, call from inside existing Globo observer block at lines 322-342)
- **Read for context:** Phase 01 findings report (`qa/reports/debug-globo-default-color-260518.md`)

## Implementation Steps

1. **Liquid: emit preferred color attribute**
   - In `sections/dopamiles-product-hero.liquid`, locate the section's root element (the outer `<div class="dop-container">` or section wrapper).
   - Add `data-dop-preferred-color="{{ current_variant.options[0] | escape }}"` to that element.
   - `current_variant` is already assigned at line 20 (`product.selected_or_first_available_variant`), so no new Liquid variable needed.
   - Single-option products without a color: `options[0]` returns the only option value; guard in JS by checking attribute presence + non-empty.

2. **JS: add `alignGloboToPreferredColor(section)` function**
   - New function inside the IIFE/module body of `dopamiles-pdp-variant-sync.js`.
   - Reads `section.dataset.dopPreferredColor` — bail if missing/empty.
   - Reads `section.dataset.dopGloboAligned` — bail if `'1'` (already aligned this init).
   - Normalizes preferred color: `String(value).toLowerCase().replace(/[\s_-]/g, '')`.
   - Queries Globo swatches using the selector identified in Phase 01.
   - For each swatch: extract its color name from the attribute identified in Phase 01, normalize, compare.
   - On match: check if swatch is already "selected" (using the state selector from Phase 01). If already selected, set `dopGloboAligned = '1'` and return (no-op). If not selected, `.click()` it, then set `dopGloboAligned = '1'`.
   - On no match: log a console warning (`'[dop] Globo swatch not found for preferred color: ' + preferred`), set `dopGloboAligned = '1'` (don't retry forever), return.

3. **Wire into existing Globo observer block (lines 322-342)**
   - Inside the existing `if (!globoPresent())` block where the MutationObserver waits for Globo injection: after the existing fallback logic, call `alignGloboToPreferredColor(section)` when `globoPresent()` becomes true.
   - Also call `alignGloboToPreferredColor(section)` at the top-level (right after the `if (!globoPresent())` check) for the case where Globo is already present on initial DOMContentLoaded.

4. **Race-condition handling**
   - Phase 01 may reveal Globo swaps its own DOM AFTER our click. If so, extend the existing observer to re-run align for ~2s after the first Globo injection, gated by `dopGloboAligned !== '1'`.
   - If Phase 01 reveals click is idempotent and stable, skip this extension — keep the fix minimal.

5. **Compile / lint**
   - No build step; Shopify serves Liquid + JS as-is. Manually verify JS syntax with `node -c` or just by loading the preview theme.
   - Existing JS in `dopamiles-pdp-variant-sync.js` uses ES5-style `var` and `function` declarations — match the existing style.

## Todo List

- [ ] Add `data-dop-preferred-color` to section root in `dopamiles-product-hero.liquid`
- [ ] Write `alignGloboToPreferredColor(section)` function in `dopamiles-pdp-variant-sync.js`
- [ ] Wire into existing Globo MutationObserver block (lines 322-342)
- [ ] Add `dopGloboAligned` dataset guard
- [ ] Push to preview theme 158279991548 via `shopify theme push --theme 158279991548`
- [ ] Spot-check 1 PDP in browser: feature color highlighted on load

## Success Criteria

- [ ] `data-dop-preferred-color` rendered correctly on PDP HTML (verify via curl + grep)
- [ ] `alignGloboToPreferredColor()` runs once per init (verified via console log + `dopGloboAligned` dataset value)
- [ ] On preview theme, manually open 2 PDPs (with different admin-ordered feature colors) and confirm Globo highlights the expected color on load
- [ ] User-tap-to-switch still works (no infinite loop, no double-selection)
- [ ] No new console errors / pageerrors

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Globo re-renders after our click | `dopGloboAligned` guard prevents loop; if needed extend observer for 2s (Phase 01 decides) |
| Color-name format mismatch | Normalization `toLowerCase().replace(/[\s_-]/g, '')` handles common variants; warn-only if no match found |
| `current_variant.options[0]` is blank | Liquid `| escape` outputs empty string; JS bails on empty attr — graceful no-op |
| Existing observer block accidentally broken | Add new logic AFTER existing reveal-Dawn logic; do not modify `globoObserver.disconnect()` or `revealDawn()` calls |
| Click triggers Dawn change → variant-sync.js syncs → infinite loop | One-shot `dopGloboAligned` guard; Dawn's sync reads checked radios, not our trigger source |

## Security Considerations

- Color name is user-facing product data, not user input — `| escape` in Liquid is sufficient.
- No data leaves the client.

## Notes

If Phase 01 reveals Globo exposes a programmatic API (e.g. `window.GloboColorSwatches.select(color)`), prefer that over `.click()` for stability. Default to `.click()` if no public API exists.
