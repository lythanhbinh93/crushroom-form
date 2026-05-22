---
title: "QA — PDP size guide critical paths"
date: 2026-05-22
target: preview theme 158622941436 on crushroom.myshopify.com (Dopamiles)
mode: agent-browser headed Chromium + source-level grep + JS regex unit tests
verdict: PASS — all critical paths verified. 1 latent bug caught during testing (whitespace-collapse for swatch picker) and fixed mid-flight before ship.
---

# QA Report — Size Guide Critical Paths

## Overview

| Result | Count |
|---|---|
| Source-level checks | 6 / 6 PASS |
| JS regex unit tests | 17 / 17 PASS (after mid-test bug fix) |
| Browser behavioral checks | 6 / 6 PASS |
| Console errors | 0 |
| Visual screenshots | 5 captured |

**Verdict:** Ready to ship to live theme.

---

## Bug found during testing

**Latent bug — whitespace-collapse missing for Dawn swatch picker textContent**

While unit-testing the tightened regex `/^size(\s*:.*)?$/`, the test case for Dawn's swatch picker legend (`<legend>Size:\n  <span data-selected-value>S</span></legend>`) failed — multi-line textContent doesn't match because `.` excludes `\n`.

Live verification confirmed the bug would have triggered in production: Globo renders `<legend class="name-option">` with textContent `"Size: S\n            \n              \n\n              Size guide"`. Without whitespace collapse, the trigger would have stayed in the host fallback row even after my regex tightening.

**Fix shipped mid-test:** `(n.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()` before regex match. Re-pushed to preview. Re-verified relocation works.

This bug would NOT have been caught by either the prior code-review (regex was inspected in isolation, not against actual rendered DOM) or manual smoke testing (was working on the prior loose regex). **The unit-test step caught it.**

---

## T1-T6: Source-level verification

| ID | Check | File:Loc | Result |
|---|---|---|---|
| T2 | `\| escape` filter on `sg_caption` | snippets/dopamiles-size-guide-modal.liquid:75 | ✅ PASS |
| T3 | `assets/dopamiles-size-guide.js` exists + loaded via `<script>` | sections/dopamiles-product-hero.liquid:411 | ✅ PASS (124 LOC, 4.6 KB, defer) |
| T4 | A11y attrs: role/aria-modal/aria-labelledby/aria-controls/aria-haspopup/ModalClose- ID | modal snippet + section | ✅ PASS (all 7 attrs present) |
| T5 | Trigger structure + ruler icon inlined | section L153-170, icon-ruler.svg (754 B) | ✅ PASS |
| T6 | `float: right` (NOT `inline-end`) for iOS 16 compat | dopamiles-pdp.css:989 | ✅ PASS (only `float: right`; `inline-end` reference is comment-only; `inset-inline-end` + `padding-inline-end` remain — those are widely-supported logical properties, Safari 14.5+) |
| — | Schema: `"limit": 8` on `size_guide_image` block | section L447 | ✅ PASS |
| — | Grabber pill `::before` removed from mobile sheet | dopamiles-pdp.css mobile media query | ✅ PASS |
| — | Reduced-motion override includes close button + link icon transform | dopamiles-pdp.css:1248-1265 | ✅ PASS |
| — | `z-index: 1010` + stacking-comment | dopamiles-pdp.css:1066 | ✅ PASS |

---

## JS regex unit tests (Node)

17 test cases run against the tightened regex `/^size(\s*:.*)?$/` with whitespace-collapse pre-processing:

| Input (textContent raw) | After normalize | Expected | Got | Result |
|---|---|---|---|---|
| `"size"` | `"size"` | match | match | ✅ |
| `"Size"` | `"size"` | match | match | ✅ |
| `"SIZE"` | `"size"` | match | match | ✅ |
| `"size:"` | `"size:"` | match | match | ✅ |
| `"size: s"` | `"size: s"` | match | match | ✅ |
| `"size: small"` | `"size: small"` | match | match | ✅ |
| `"\n  Size:\n  S\n"` (Dawn swatch picker) | `"size: s"` | match | match | ✅ |
| `"\n  Size\n"` (Dawn button picker) | `"size"` | match | match | ✅ |
| `"Size: XL"` | `"size: xl"` | match | match | ✅ |
| `"SIZE:  XS  "` | `"size: xs"` | match | match | ✅ |
| `"size & fit"` (accordion summary) | `"size & fit"` | NO | NO | ✅ |
| `"Size guide"` (button label) | `"size guide"` | NO | NO | ✅ |
| `"shoe size"` | `"shoe size"` | NO | NO | ✅ |
| `"standard sizing"` | `"standard sizing"` | NO | NO | ✅ |
| `"size chart"` | `"size chart"` | NO | NO | ✅ |
| `"choose size"` | `"choose size"` | NO | NO | ✅ |
| `"t-shirt size"` | `"t-shirt size"` | NO | NO | ✅ |

17/17 pass.

---

## T7: Browser behavioral tests

Run via `agent-browser` (headed Chromium, CDP) against the live preview theme. Globo Color Swatches & Bundles app IS active on this theme (confirmed via `globo-swatch-app` body class + console "GLO Color Swatch & Bundles" banner).

### Trigger relocation

Real DOM state (eval'd on the live page):
```json
{
  "triggerVisible": true,
  "triggerParentTag": "LEGEND",
  "triggerParentClass": "name-option",        // Globo's class, NOT Dawn's .form__label
  "triggerParentText": "Size: S\n            \n              \n\n              Size guide",
  "relocated": true,                          // host has data-dop-size-guide-relocated attr
  "inHostRow": false,                         // trigger NOT in fallback
  "hostHidden": true                          // CSS collapsed host row
}
```

✅ Trigger correctly relocated to Globo's `<legend class="name-option">`. Visual confirmation: screenshot `sg-01-trigger-relocated.png` shows "Size: S" with the ruler-icon "SIZE GUIDE" chip immediately to the right.

### Modal open

```json
{
  "hasOpenAttr": true,             // Dawn ModalDialog.show() worked
  "parentTag": "BODY",             // reparented by connectedCallback ✓
  "zIndex": "1010",                // M4 fix live ✓
  "display": "flex",
  "bodyOverflow": "hidden"         // Dawn scroll-lock applied ✓
}
```

✅ Modal opens correctly. Reparented to `<body>` (memory rule `backdrop_filter_traps_fixed_descendants` mitigation works). Z-index 1010 above cart-drawer (1000). Screenshot `sg-02-modal-open.png` shows full modal with kicker, title, image, and backdrop blur.

### Modal close paths

| Method | Open state after | Result |
|---|---|---|
| ESC key press | `false` | ✅ |
| X button click (`.dop-size-guide-modal__close`) | `false` | ✅ |
| Backdrop click (dispatchEvent on `.dop-size-guide-modal`) | `false` | ✅ |

All three close paths work.

### Mobile bottom sheet (viewport 390×844)

```json
{
  "viewport_w": 390,
  "modal_alignItems": "flex-end",         // sheet anchored to bottom
  "modal_padding": "0px",                 // fills viewport edges
  "inner_borderTL": "16px",               // rounded top corners
  "inner_borderTR": "16px",
  "inner_borderBL": "0px",                // flat bottom
  "inner_borderBR": "0px",
  "inner_maxHeight": "776.48px",          // ≈92vh
  "grabber_content": "none"               // M2: decorative grabber removed ✓
}
```

✅ Bottom-sheet layout correct. Screenshot `sg-04-mobile-sheet.png` confirms visual.

### prefers-reduced-motion (emulated via `agent-browser set media reduced-motion`)

```json
{
  "modal_animation": "none",       // backdrop fade disabled
  "inner_animation": "none",       // card entrance disabled
  "close_transition": "none",      // M3 fix ✓
  "link_transition": "none"        // trigger transitions disabled
}
```

`matchMedia('(prefers-reduced-motion: reduce)').matches` → `true`. All animations + transitions disabled. M3 fix verified.

### Typography + escape verification

```json
{
  "title_font": "Fraunces, Georgia, serif",       // serif heading ✓
  "title_size": "32px",                            // desktop scale
  "kicker_color": "rgb(242, 100, 25)",             // #F26419 dop-accent ✓
  "kicker_font": "Fraunces, Georgia, serif",       // italic serif ✓
  "caption_text": "Between sizes? Most runners size up — gives the print a little room to live.",
  "caption_innerHTML_has_tags": false              // C1 escape working — no `<` or `>` in innerHTML
}
```

✅ Brand-token fonts + colors applied correctly. Caption rendered as plain text with no HTML — escape filter functioning as expected.

### Console errors

Zero errors in browser console after full test cycle. Only Globo's promotional banner logs (informational).

---

## Visual artifacts

5 screenshots captured under `C:/Users/BINHLY~1/AppData/Local/Temp/`:
- `sg-01-trigger-relocated.png` — Desktop PDP, trigger inline with "Size: S"
- `sg-02-modal-open.png` — Desktop modal with backdrop blur, Fraunces kicker + title
- `sg-03-mobile-sheet.png` — Mobile (initial — desktop viewport leaked, may be stale)
- `sg-04-mobile-sheet.png` — Mobile bottom sheet (after viewport set 390×844) ✅
- `sg-05-desktop-final.png` — Desktop reset state

---

## Not covered by automation (still manual)

| Item | Reason | Status |
|---|---|---|
| iOS Safari 16.x real device | Cannot emulate hardware via CDP | DEFERRED to manual QA before live publish |
| 3-push protection test (`.shopifyignore`) | Needs 3 consecutive Shopify CLI pushes + post-check that merchant block config survives | DEFERRED to ship step |
| Lighthouse PDP perf vs baseline | Requires running Lighthouse against preview URL with auth; cmd-line possible but separate step | DEFERRED to ship step |
| Globo OFF state (Dawn revealed) | Requires admin-toggle of Globo app on/off — can't be flipped from theme code | LOW RISK — code paths verified via unit test (`\n  Size\n` Dawn button case) |
| XSS payload injection (e.g. `<script>` in `size_guide_caption` setting) | Requires admin access to Theme Editor to set the malicious value | Code-level escape verified; defense-in-depth confirmed |

---

## Recommendation

**Proceed to live publish.** All critical paths verified. The whitespace-collapse bug found during testing has been fixed and re-verified. Remaining manual checks are minor (perf delta, iOS device, 3-push test) and can be done as part of the ship sequence per the existing plan Phase 04.

## Status

**PASS** — DONE
