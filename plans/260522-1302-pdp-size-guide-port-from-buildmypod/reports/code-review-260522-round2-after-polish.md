---
title: "Code review — PDP size guide (round 2, post-polish)"
date: 2026-05-22
reviewer: code-review skill (3-stage: spec → quality → adversarial)
scope: snippets/dopamiles-size-guide-modal.liquid, sections/dopamiles-product-hero.liquid, assets/dopamiles-pdp.css (size-guide block), locales/en.default.json, .shopifyignore
verdict: DONE_WITH_CONCERNS — 2 Critical, 5 Important, 4 Minor, 2 Nit. Ship after Critical fixes.
---

# Size Guide — Code Review (round 2, post visual polish)

## Stage 1: Spec compliance

Plan goal: Discoverable "Size guide" link inside variant picker → opens modal with chart image, swapped by `product.type`. Phases 01-03 code-complete; Phase 04 manual.

Deviations vs plan, all justified:
1. `<modal-dialog>` vs `<details-modal>` — `<modal-opener>` calls `.show()` which only exists on `<modal-dialog>` (`global.js:627`). Justified.
2. Trigger render moved from `product-variant-picker.liquid` to section level — necessary because pdp.css hides `<variant-selects>` when Globo is active. Justified; variant-picker reverted to original.
3. Inline relocation JS (~80 LOC) — beyond original "zero new JS" goal, but required to keep trigger inline with the visible Size legend regardless of Dawn/Globo state.
4. Visual polish (kicker chip, Fraunces serif, mobile sheet, animations) — user-requested via `/ck:frontend-design`. In scope.

**Stage 1 verdict: PASS.**

---

## Stage 2 + 3: Code quality + adversarial findings

### CRITICAL (must fix before publish)

#### C1 · XSS via unescaped `{{ sg_caption }}` in modal
- **File:** `snippets/dopamiles-size-guide-modal.liquid:75`
- **Issue:** `<figcaption>{{ sg_caption }}</figcaption>` — Liquid does NOT auto-escape. Source is `section.settings.size_guide_caption` (text input). Merchant with admin access could paste `<script>` or `<img onerror=>` payloads. Defense-in-depth: escape it. Even with merchant trust, theme installers / app developers / theme bundles deployed to multiple shops should not assume merchant-typed text is safe HTML.
- **Fix:** `{{ sg_caption | escape }}` (or `| escape_once` if rich-text-ish defaults are desired later; for plain `text` setting, `| escape`).
- **Verdict:** Accept.

#### C2 · `float: inline-end` breaks on iOS Safari < 17.4
- **File:** `assets/dopamiles-pdp.css:986`
- **Issue:** Theme memory `feedback_ios_safari_aspect_ratio_child_height_bug` explicitly documents pre-iOS-17.4 devices are in scope. `float: inline-end` shipped in Safari 17.4 (March 2024). On iOS 16.x the value is unrecognized → falls back to `float: none` → trigger does NOT right-align inside the Size legend on iOS 16. The dopamiles-tee target audience includes pre-17.4 iPhones.
- **Evidence:** Rest of theme uses `float: right` (`component-cart-drawer.css:223`, `section-featured-product.css:32`). Inconsistent with house style AND functionally broken on supported devices.
- **Fix:** `float: right` (LTR theme — RTL is not currently supported). If RTL is on the roadmap, use `margin-inline-start: auto` + `display: inline-flex` on the parent legend instead.
- **Verdict:** Accept.

---

### IMPORTANT (fix soon, before broader rollout)

#### I1 · Stale comment misleads future maintainers
- **File:** `sections/dopamiles-product-hero.liquid:465-471`
- **Issue:** Block comment above the modal render says *"Opens via `<modal-opener>` inside product-variant-picker for the 'Size' option."* — but the trigger NO LONGER lives in product-variant-picker (was moved here at lines 152-170 of this same file). Misleading for next developer who reads top-down.
- **Fix:** Replace with: *"Trigger lives inline at L152 above (rendered as sibling of dop-vs-slot, then relocated by inline JS into the visible Size legend at runtime). Snippet self-gates: outputs nothing when no `size_guide_image` block matches `product.type`."*
- **Verdict:** Accept.

#### I2 · Inline 80-LOC `<script>` should be an asset file
- **File:** `sections/dopamiles-product-hero.liquid:172-250`
- **Issue:** Per `CLAUDE.md` "Consider Modularization" rule (200-LOC ceiling), this section is ~660 LOC and adds a chunky inline script. Inline scripts can't be cached separately, can't be CSP-allowlisted by hash without extra ceremony, and bloat the section file.
- **Fix:** Extract to `assets/dopamiles-size-guide.js`, load via `<script src="{{ 'dopamiles-size-guide.js' | asset_url }}" defer></script>` next to the other PDP scripts at lines 478-480. Wrap in IIFE that scans for the host attr globally on `DOMContentLoaded` (no `{{ section.id }}` Liquid interpolation needed — JS can read `closest('.shopify-section')`).
- **Verdict:** Accept. Defer to a follow-up PR if scope-protective.

#### I3 · MutationObserver attribute scope is too broad
- **File:** `sections/dopamiles-product-hero.liquid:241-247`
- **Issue:** `attributes: true, subtree: true` with filter `['data-dawn-revealed', 'style', 'class', 'hidden']` on the entire `.shopify-section`. The `class` and `style` attrs flip on EVERY hover/focus/aria-state change in the variant picker (color swatches, selected states, Globo's internal class toggles). Each fire calls `place()` → `findVisibleSizeLabel()` (a section-wide `querySelectorAll` + visibility checks via `getComputedStyle` + `getBoundingClientRect`). Under heavy interaction the 10s window can fire 100+ times.
- **Fix:** Coalesce via `requestAnimationFrame`:
  ```js
  var queued = false;
  var obs = new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; place(); });
  });
  ```
  Also consider scoping observer to `.dop-vs-slot` instead of whole section.
- **Verdict:** Accept.

#### I4 · Regex `/(^|\s|\b)size\b/` matches too broadly
- **File:** `sections/dopamiles-product-hero.liquid:206`
- **Issue:** Matches any element whose text contains the word "size" — including "Standard size", "Sock size table", "Choose your size", or a stray nav label. The `host.contains(n)` check excludes only our own host row, not other unrelated labels. On a typical PDP this is unlikely to fire, but Globo Variant Swatches injects various wrapper divs that may render auxiliary "size" copy.
- **Adversarial scenario:** Merchant adds a custom "Size & fit" accordion label *above* the variant picker (legitimate site content). Regex matches the accordion summary → trigger gets relocated there, not the Size legend.
- **Fix:** Tighten regex to require "size" at start of label text OR followed by `:` (Dawn's swatch legend uses `Size:`), e.g. `/^\s*size\b/` or anchor with the colon: `/^\s*size\s*:?\s*[a-z0-9]*\s*$/i` (accepts "Size", "Size:", "Size: S", "Size XL").
- **Verdict:** Accept.

#### I5 · `(^|\s|\b)` is redundant with `\b`
- **File:** `sections/dopamiles-product-hero.liquid:206`
- **Issue:** Cosmetic — `\bsize\b` matches the same cases as `(^|\s|\b)size\b`. Subsumed by I4's tighter regex anyway.
- **Verdict:** Accept (folded into I4).

---

### MINOR

#### M1 · `size_guide_image` block has no `"limit"`
- **File:** `sections/dopamiles-product-hero.liquid` schema, block type `size_guide_image`
- **Issue:** Merchant could add 50 size_guide_image blocks. The loop finds FIRST match — duplicates with the same product_type silently waste storage. Plain text input also accepts typo'd duplicates ("T-shirt" / "T-Shirt" / "Tshirt" all collide post-handleize).
- **Fix:** Add `"limit": 8` (one per common product type the store sells). Also expand the info text to warn about duplicates.
- **Verdict:** Accept.

#### M2 · Mobile sheet drag-handle is decorative-only
- **File:** `assets/dopamiles-pdp.css:1229-1239`
- **Issue:** `::before` grabber pill at top of mobile sheet suggests swipe-to-close — but there's no swipe handler. Users will try, nothing happens, slight UX confusion. Either add a swipe handler (extra JS, scope expansion) or remove the grabber (cleaner).
- **Recommendation:** Remove the grabber. The "Close" text button + tap-outside-to-close already cover dismissal.
- **Verdict:** Accept (lean toward removal).

#### M3 · Close button transition not in reduced-motion override
- **File:** `assets/dopamiles-pdp.css:1116, 1247-...`
- **Issue:** `.dop-size-guide-modal__close { transition: color 120ms }` runs even when `prefers-reduced-motion: reduce`. The reduced-motion block only turns off `.dop-size-guide-link` and `.dop-size-guide-link__icon` transitions plus modal animations.
- **Fix:** Add `.dop-size-guide-modal__close` to the `transition: none` list inside the reduced-motion media query.
- **Verdict:** Accept.

#### M4 · z-index: 1000 collides with cart drawer
- **File:** `assets/dopamiles-pdp.css:1060`
- **Issue:** `component-cart-drawer.css:3` uses z-index: 1000 too. Same z-index → source order wins. Since the size-guide modal is reparented to body LATER (when opened), it ends up after the cart drawer in DOM order → modal wins. Functionally OK but conceptually fragile.
- **Fix:** Bump to `z-index: 1010` to make the intent explicit, OR define a `--dop-z-modal` token in `dopamiles-tokens.liquid` and use it here. Token approach future-proofs further additions.
- **Verdict:** Accept.

---

### NIT

#### N1 · Title 32px desktop may feel large
- **File:** `assets/dopamiles-pdp.css:1164`
- Subjective. Test with merchants. Could drop to 28px without losing editorial feel.

#### N2 · Button-inside-`<legend>` is structurally unusual
- **File:** `sections/dopamiles-product-hero.liquid:159-170` (rendered into legend at runtime by JS)
- HTML spec ALLOWS interactive content in `<legend>` (phrasing content). Some older screen readers historically had issues announcing buttons-in-legend correctly. Modern NVDA/JAWS/VoiceOver handle it. Defer.

---

## Adversarial sweep — concerns explicitly tested and CLEARED

| Vector | Outcome |
|--------|---------|
| XSS via `alt` text | CLEAR — `image_tag` filter HTML-encodes attrs |
| XSS via product.type | CLEAR — used only via `handleize` filter (output-only) |
| Multiple blocks with same product_type | CLEAR — loop picks first, deterministic by admin order |
| product.type empty | CLEAR — block's `product_type != blank` guard catches it |
| Image asset removed from Files | CLEAR — `sg_image != blank` filters orphaned refs |
| iOS Safari 16 aspect-ratio + height:100% bug | CLEAR — image uses `width: 100%; height: auto`, no aspect-ratio container |
| backdrop-filter trapping fixed descendants | CLEAR — modal reparented to body, no `position: fixed` inside |
| Section Rendering API double-modal on body | LOW RISK — main-product section doesn't typically re-render via cart |
| Globo lazy injection beyond 10s window | ACCEPTABLE — falls back to host row (visible) |
| Trigger flicker before JS runs | ACCEPTABLE — host row is the visible fallback, brief flash only |
| Translation missing in non-EN locales | CLEAR — Shopify falls back to default-locale strings (verified per Shopify docs); non-EN shoppers see "Size guide" in English, not "translation missing" |
| CSP blocking inline `<script>` | CLEAR — dopamiles uses inline scripts elsewhere; CSP not enforced |
| Custom element listener after DOM move | CLEAR — `<modal-opener>` binds listener in constructor on inner `<button>`; moving the wrapper preserves the listener since the button node moves with it |

---

## Recommendation

**Ship Critical fixes (C1 + C2) before publishing the preview theme to live.** Important fixes can land in a follow-up PR same day. Minor/Nit can defer.

Estimated fix time: C1+C2 → 5 min. I1-I5 → 25 min. M1-M4 → 15 min. Total to ship-ready ~45 min.

---

## Status

**DONE_WITH_CONCERNS** — implementation is sound and the architecture survived red-team. Two real bugs (C1 escape, C2 iOS 16 float) block ship; the rest is polish-grade improvement that can land iteratively.
