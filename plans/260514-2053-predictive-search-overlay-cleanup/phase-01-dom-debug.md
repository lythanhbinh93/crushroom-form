# Phase 01 — DOM debug: confirm what's rendering

**Status:** done — flipped the hypothesis
**Owner:** debugger
**Effort:** ~20 min
**Depends on:** none
**Gate:** Decision recorded: either dop-search panel is injecting (then Phase 02 = re-wire + suppress app UI), or dop-search panel is NOT injecting (then Phase 02 also fixes the init path)

## Goal
Establish ground truth before implementing. The brainstorm noted the custom `dopamiles-search.js` has a 3-tier input lookup that probably still matches the overlay's input. Need to confirm whether the visible Shopify-default UI is a competing injection or a fallback because the custom panel never rendered.

## Context
- Preview URL: https://rfeixb-dd.myshopify.com?preview_theme_id=158279991548
- Mobile viewport reproduces the bug most clearly (use 414×896 for screenshot)
- Custom panel is created by `dopamiles-search.js` and should have id-like classes prefixed `dop-search-` (see `dopamiles-search.css` for the full class list)
- Shopify Search & Discovery app injects a dropdown that includes `predictive-search`, `[data-predictive-search]`, or `.predictive-search__*` class names — and the footer text "Powered by Shopify"

## Key questions to answer

1. **Does the custom `dopamiles-search.js` initialize on page load?**
   - Add a `console.log('[dop-search] init', input)` in the init function (line ~440-450 of dopamiles-search.js, temporarily)
   - Confirm it fires and reports the overlay's input element as found

2. **Does the custom panel get injected into the DOM when input gains focus?**
   - Inspect DOM for any element with `class*="dop-search-"` AFTER focusing the overlay input
   - If yes → custom panel is alive but hidden / overlapped
   - If no → custom JS isn't reaching the injection step

3. **What is the source of the visible default UI?**
   - Inspect the visible dropdown's DOM and screenshot the outer element's class list and parent chain
   - Confirm whether it's Shopify Search & Discovery (look for `predictive-search` custom element tag, `.predictive-search__results` div, or "Powered by Shopify" text node)

4. **Are both panels present simultaneously?**
   - Could be a z-index / positioning conflict where dop panel is *below* the app panel

## Implementation steps
1. Read `dopamiles-search.js` lines ~430-470 to find the init function and confirm anchor element name
2. Add temporary console logs at: init entry, input-resolved-as, focus-handler-fired, panel-injected
3. Push the temp logs to preview 158279991548
4. Spawn a debugger agent to open preview on mobile viewport (414×896), focus the input, screenshot at three moments: focus, after-1-char-typed, after-3-chars-typed. Also dump the console transcript and the relevant DOM subtree (innerHTML of `<header>`)
5. Read the report; record the answer to each of the 4 questions above

## Related code files

### Read
- `D:\github local\pod-tee-theme\assets\dopamiles-search.js` (init function + findHeaderSearchInput)
- `D:\github local\pod-tee-theme\assets\dopamiles-search.css` (panel class names)
- `D:\github local\pod-tee-theme\sections\dopamiles-header.liquid` (current markup)

### Edit (temporary)
- `D:\github local\pod-tee-theme\assets\dopamiles-search.js` — add 4 console.log lines (REVERT before commit)

## Todo
- [ ] Read dopamiles-search.js init function + identify exact anchor selector chain
- [ ] Add 4 temp console.log calls
- [ ] Push to preview
- [ ] Spawn debugger agent for screenshots + console transcript + DOM dump on mobile
- [ ] Record answers to the 4 key questions in a phase report
- [ ] Decide Phase 02 sub-path: (a) re-wire trigger + suppress app, OR (b) fix init AND suppress app
- [ ] REVERT temp console logs before Phase 02 implementation push

## Success criteria
Phase 02's exact scope is determined from concrete evidence, not guess. Console transcript + DOM screenshot saved as artifacts in `screenshots/`.

## Halt rule
If the debug step itself fails (e.g., preview won't load, or console output is empty for unknown reason): document the blocker, snapshot the state, do not blindly proceed to Phase 02.

## Risk assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Console logs left in production | Low | Phase 02 first todo is REVERT temp logs |
| Mobile preview shows different bug than desktop | Low | Check both viewports |
| Browser caching old JS | Low | Append `?cache_bust=<timestamp>` or hard refresh |

## Outcome (260514-2200)
Hypothesis was wrong. Zero Shopify Search & Discovery `<predictive-search>` elements in DOM. The "off-brand UI" was the brand panel — but `injectPanel()` was anchoring it to the wrong parent (promo-bar section first in DOM order matched `.shopify-section-group-header-group`). Single-line selector fix: change to `'sticky-header, #dop-header, header.dop-header'`. Verified panel parent is now `dop-header` and panel sits flush under the nav. Phase 02's planned CSS suppression block is unnecessary — closed as not needed.

## Next phase
[Phase 02 — closed (not needed)](phase-02-rewire-and-suppress.md)
