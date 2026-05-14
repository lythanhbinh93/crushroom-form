# Phase 02 — Re-wire trigger + suppress competing UI

**Status:** closed — not needed (Phase 01 root-cause flipped the diagnosis)
**Owner:** code
**Effort:** ~1.5h
**Depends on:** Phase 01 outcome
**Gate:** Custom dop-search panel renders inside overlay on focus + type; no off-brand UI visible; theme check baseline preserved; manual mobile + desktop verification

## Goal
Make the brand-styled custom `dopamiles-search.js` panel the only predictive UI visible when the overlay search input is focused or typed into. Eliminate the Shopify Search & Discovery app's competing default dropdown via targeted CSS suppression.

## Context
Phase 01 will determine which sub-path applies:

- **Sub-path A** — dop-search panel IS injecting (just hidden / behind app's panel): primary fix is CSS suppression of app UI + an explicit `data-dop-search-trigger` attribute for robustness.
- **Sub-path B** — dop-search panel is NOT injecting: also fix the init failure (e.g., script load order vs overlay markup, focus listener not bound, or anchor lookup mismatch).

Update this phase doc with the chosen sub-path before implementing.

## Key insights
- Custom panel anchor is `[data-dop-search-trigger]` (preferred) but tier-2 fallback is `header input[type="search"]` per dopamiles-search.js:439
- App's injected UI uses class names like `.predictive-search`, `.predictive-search__results`, `[data-predictive-search]`. These are app-internal and may change in future Shopify updates — comment the CSS rule with date + reason
- The overlay's input keeps id `dop-header-search-input`, so any logic keyed on that id still works
- The custom panel is positioned relative to the trigger wrap — when the wrap is inside an `absolute`-positioned overlay, panel placement may need a z-index bump or position tweak

## Requirements

### Functional
- Custom panel opens below overlay input on focus (idle state: recent + suggested + preview cards)
- Custom panel updates with `/search/suggest.json` results as user types (220ms debounce, ~8 results)
- Keyboard nav (↑ ↓ Enter Esc) works within the panel
- Esc closes the overlay (which auto-closes the panel)
- × close button still closes the overlay
- Outside-click still closes the overlay
- Enter inside the input still submits to `/search?q=…`

### Non-functional
- No off-brand UI ever visible — no spinning loaders, no "Powered by Shopify", no query echo
- Mobile viewport (≤480px) and desktop viewport both clean
- Theme check baseline 11/38 preserved
- ≤30 LOC net delta (Path D scope)

## Architecture

### Markup change (sub-path A)
Add `data-dop-search-trigger` attribute on the overlay's form so the custom JS anchor is explicit (no reliance on the tier-2 header-selector fallback):

```liquid
<form
  action="{{ routes.search_url }}"
  method="get"
  class="dop-search-overlay-form"
  role="search"
  data-dop-search-trigger
>
```

### CSS suppression rule
Append to `dopamiles-header.css` or to `dopamiles-search.css` (whichever already loads on every page). Target the Shopify Search & Discovery injected dropdown:

```css
/* 260514: Suppress Shopify Search & Discovery's auto-injected predictive UI.
   Custom dop-search panel is the brand-controlled replacement.
   These class names are app-internal — revisit if the app updates. */
predictive-search,
.predictive-search,
.predictive-search__results,
[data-predictive-search],
[data-predictive-search-status] {
  display: none !important;
}
```

### JS init fix (sub-path B only)
If Phase 01 shows the custom JS isn't initializing for the overlay input:
- Check: script `<script src="…dopamiles-search.js" defer></script>` is still present after the markup refactor (it was — line 173 of header section)
- Check: the input is in the DOM at the moment init runs (defer + DOMContentLoaded should make this safe)
- Check: focus listener registers on the resolved input element, not a stale reference
- Likely fix: move the trigger-attribute approach in (sub-path A) AND ensure the init uses the resolved element from `[data-dop-search-trigger]`

### Z-index check
Custom panel must layer above the overlay's backdrop (z-index 1) but below the close button. Add `z-index: 2` on the panel root if needed.

## Related code files

### Edit
- `D:\github local\pod-tee-theme\sections\dopamiles-header.liquid` (add trigger attribute on overlay form)
- `D:\github local\pod-tee-theme\assets\dopamiles-search.css` OR `dopamiles-header.css` (append CSS suppression block — choose whichever file already loads globally)
- `D:\github local\pod-tee-theme\assets\dopamiles-search.js` (only if sub-path B: fix init path; otherwise revert temp logs from Phase 01)

### Read for context
- `D:\github local\pod-tee-theme\assets\dopamiles-search.js` (focus + init handlers)
- `D:\github local\pod-tee-theme\assets\dopamiles-search.css` (panel z-index + positioning rules)

## Implementation steps
1. Revert Phase 01 temp console logs from `dopamiles-search.js`
2. Add `data-dop-search-trigger` attribute on overlay form in `dopamiles-header.liquid`
3. Append CSS suppression block (with date comment) to the appropriate stylesheet
4. (If sub-path B) Fix the init path issue identified in Phase 01
5. Run `shopify theme check` — baseline 11/38
6. Push edited files to preview 158279991548
7. Spawn debugger agent: open preview at desktop (1280×800) AND mobile (414×896); focus input, type 3 chars, screenshot each state; report panel-rendered + no-app-UI checks
8. If app UI still bleeds: inspect DOM for new selectors, add to suppression block, re-push (max 2 iterations)

## Todo
- [ ] Revert temp console logs (from Phase 01)
- [ ] Add `data-dop-search-trigger` attribute on overlay form
- [ ] Append CSS suppression block with date comment
- [ ] (Conditional) Fix init path per Phase 01 findings
- [ ] `shopify theme check` — 11/38 preserved
- [ ] Push to preview 158279991548
- [ ] Debugger agent screenshots desktop + mobile, 3 states each
- [ ] Confirm panel-rendered + no-app-UI on both viewports
- [ ] If app UI still bleeds: iterate selectors (≤2 rounds)

## Success criteria
- Custom panel visible on focus and on type
- No `.predictive-search`-class element rendered or visible
- "Powered by Shopify" text not present in DOM during search interactions
- Mobile + desktop both clean
- Keyboard nav functional within custom panel
- All existing close paths (×, Esc, outside-click) still work

## Halt rule
2 iterations max on CSS suppression. If after 2 rounds the app UI still bleeds through → snapshot + report BLOCKED + escalate: either Path E (disable predictive entirely via Search & Discovery admin settings + delete custom panel) or Path C (Dawn `<predictive-search>` element rewrite).

## Risk assessment
| Risk | Severity | Mitigation |
|---|---|---|
| App class names change in future Shopify updates | Med | Date-stamp the CSS comment; document selector list in this phase doc |
| `!important` rules elsewhere in the theme conflict | Low | Suppression rules are scoped to app's specific class names; no cascade collision expected |
| Custom panel still misaligned in overlay context | Low | Z-index + position checked manually during verification |
| Mobile keyboard pushes overlay off-screen | Low | Test with mobile viewport screenshot; overlay is sticky-header-anchored so should stay in place |

## Security
None — visual change + CSS suppression of a third-party app's UI. No user input handling alterations.

## Next steps after ship
- Sync-back plan checkboxes
- Journal entry capturing the iteration cycle (overlay refactor → predictive search regression → debug-first Path D)
- If app UI bleeds through again after a Shopify update: revisit Path C as a more durable fix
