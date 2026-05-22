# Code Review — PDP Size Guide Port

**Date:** 2026-05-22
**Reviewer:** code-reviewer (Staff Engineer pass)
**Scope:** size-guide port (Liquid + CSS + schema), 4 modified files + 1 new snippet
**Verdict:** **DONE_WITH_CONCERNS** — feature is sound; surface non-blocking medium/low issues + 1 unrelated working-tree noise

---

## Critical (blocking)

None.

---

## High

### H1 — Locale JSON files: 51 unrelated files in PR diff [out-of-scope noise]

**Severity:** High (PR hygiene), Low (functional)
**Files:** `locales/*.json` (51 files)
**Issue:** Working tree has every locale file modified to prepend a Shopify-Admin-style `/* ... auto-generated ... */` header. Standard `JSON.parse` rejects (`Unexpected token '/'`). Shopify's runtime parser accepts the Shopify-flavored extension, so `shopify theme check` passes — but:
- The PR claim "5 files changed" understates by 51.
- These weren't intended by the size-guide port; they look like a `shopify theme pull` artifact.
- They violate the memory rule `shopify_theme_push_overwrites_merchant_json` — `locales/*.json` is NOT in `.shopifyignore`, so committing the Shopify-pulled version then pushing back is fine; but any merchant edits via Admin language editor since the last pull will be clobbered.

**Action:** Either `git checkout HEAD -- locales/` before commit (recommended) OR move them to a separate hygiene commit so the size-guide PR diff is reviewable.

### H2 — Hardcoded English strings ("Size guide", "Sizing chart") in i18n codebase

**Severity:** High (consistency), Medium (functional)
**Files:** `snippets/dopamiles-size-guide-modal.liquid:55`, `snippets/product-variant-picker.liquid:41`, default values in `sections/dopamiles-product-hero.liquid` schema (`alt` default)
**Issue:** Sibling PDP strings use `{{ 'products.product.add_to_cart' | t }}` / `'products.product.sold_out' | t` (sections/dopamiles-product-hero.liquid:179, 232). The new size-guide trigger button text and modal h2 title are hardcoded English. Theme ships 50 locale files; this feature is en-only.

**Action:** Add translation keys (e.g., `products.product.size_guide`, `products.product.size_guide_chart_alt`) to all 51 `locales/*.json` schemas + reference via `| t` filter. Schema default for `alt` could fall back to a `t:` translation handle.

---

## Medium

### M1 — Picker-snippet's `block.blocks` is fragile naming

**Severity:** Medium (maintainability)
**Files:** `snippets/product-variant-picker.liquid:27`
**Issue:** The snippet was originally Dawn's, where `block: block` is a block object (no `.blocks`). The dopamiles hero passes `block: section`, so `block.blocks` works *only* because of the unusual call site. A future maintainer porting this snippet back to Dawn-style or adding a second call site with a real block argument will silently get an empty `for sg_block in block.blocks` (no error, no rendered trigger — silent feature loss).
**Mitigation already present:** Comment block at line 13-23 explains the contract.
**Action (optional):** Compute `sg_has_chart` in the **section** file (where `section.blocks` is unambiguous), pass `sg_has_chart` + `sg_modal_id` into the snippet as render args. Snippet becomes call-site-agnostic. Trade-off: 6 more LOC in the section, 6 fewer in the snippet.

### M2 — `aria-controls` + `aria-expanded` missing on size-guide trigger button

**Severity:** Medium (a11y)
**File:** `snippets/product-variant-picker.liquid:40`
**Issue:** `<button type="button" class="dop-size-guide-link" aria-haspopup="dialog">` declares it opens a dialog but does not point to which (`aria-controls="SizeGuide-{id}"`) nor expose open state (`aria-expanded="false"`). The `<modal-opener>` custom element handles the click but does not set these ARIA properties.
**Action:** Add `aria-controls="{{ sg_modal_id }}"` to the inner button. `aria-expanded` toggling would need a JS shim (out of scope; acceptable to skip given Dawn's pattern doesn't toggle it either).

### M3 — Image-picker block setting accepts product types with no validation

**Severity:** Medium (merchant-foot-gun)
**File:** `sections/dopamiles-product-hero.liquid:399-403` (schema)
**Issue:** `product_type` is a free-text field. Merchant typos ("Tshirts" vs Shopify product type "T-shirt") silently produce no match, no warning. `handleize` normalizes case + separators but not typos. The plan's brainstorm called out this limitation; accepted as v1 trade-off. No action required, but consider adding `info` text "Tip: copy the exact value from Products > Product organization > Type" or a `select` populated from a metafield list for v2.

---

## Low

### L1 — Modal duplication on `<product-info>` URL-swap (combined listings only)

**Severity:** Low (only fires for combined-listing PDPs)
**Files:** `assets/global.js:620-625` (Dawn), `assets/product-info.js:88-114`
**Issue:** `ModalDialog.connectedCallback` reparents to `<body>` on first connect (`this.moved = true` guards re-entry). The modal lives OUTSIDE `<product-info>`, so normal variant changes don't touch it. But for combined listings / linked-variant swaps, the section's `<product-info>` subtree fetch could re-deliver fresh modal markup if the swap returns the full section. Verified: hero renders modal OUTSIDE `<product-info>` (line 352), and product-info.js swaps only replace the `<product-info>` element itself, not its siblings. Modal stays singleton. **No bug. Low-priority concern resolved by architecture choice.**
**Action:** None. Architecture already mitigates.

### L2 — Modal `<h2>` uses `<h2>` not `<h2 id="...">` inside scrolling body

**Severity:** Low (a11y polish)
**File:** `snippets/dopamiles-size-guide-modal.liquid:55`
**Issue:** `<h2 id="SizeGuideTitle-...">` is correct. But if modal body content overflows and user scrolls past the title, focus management is fine because Dawn's `trapFocus` keeps focus inside the dialog. No action.

### L3 — `.dop-size-guide-opener` `display: inline-block` may break flexbox legend layout

**Severity:** Low (cosmetic)
**File:** `assets/dopamiles-pdp.css:949` (new block)
**Issue:** The trigger is injected inside `<legend>` (fieldset) or `<label>`. Browser default `legend` is a `block` context. `margin-inline-start: 0.75rem` should produce expected spacing. **Not a real defect — flagged for visual QA.**
**Action:** Phase 04 visual QA on all 3 picker_types (swatch, button, dropdown).

---

## Verified claims

| Claim | Status |
|-------|--------|
| Modal opens via Dawn `<modal-opener>` → `<modal-dialog>.show()` | Verified at `assets/global.js:679-691` and `:627-635` |
| `<modal-dialog>` uses `[open]` attribute for state | Verified at `:631` / `:640` — CSS `[open]` gate is correct |
| ModalDialog reparents to `<body>` on first connect | Verified at `:620-625`, `this.moved` re-entry guard works |
| Backdrop click closes via `event.target === this` | Verified at `:614-616` |
| `<modal-opener>` queries `[data-modal]` selector at click time | Verified at `:686-688` (NOT at constructor time) — works even if modal exists before opener |
| Trigger renders ≤1 time per Size option | Verified — only one `picker_type` branch fires per option, guarded by `is_size_option` |
| No `block` shadowing in snippet | Verified — snippet `block` is render-arg-local, accordion loop at section scope (line 328) is post-snippet-render |
| `icon-info.svg` + `icon-close.svg` assets exist | Verified via `ls assets/` |
| `shopify theme check`: 9 errors, all pre-existing | Verified — 4× `ImgWidthAndHeight` in blog files, 1× `MissingTemplate` in gift_card, 1× `TranslationKeyExists` in cart-drawer, 3× `UnknownFilter` in reviews+search. ZERO errors in `snippets/dopamiles-size-guide-modal.liquid`, `snippets/product-variant-picker.liquid`, `sections/dopamiles-product-hero.liquid`, `assets/dopamiles-pdp.css`. |
| `<modal-dialog>` Dawn pattern used over `<details-modal>` | Justified — `details-modal.js` exposes different API (`open`/`close` via `<details>` element), incompatible with `<modal-opener>` which expects `.show(button)`. Switch was correct. |

---

## Behavioral checklist results

- [x] Concurrency: N/A (no JS state mutation)
- [x] Error boundaries: snippet self-gates on `blank` settings; never throws
- [x] API contracts: snippet contract documented in comment header; only one caller verified
- [x] Backwards compatibility: `product-variant-picker.liquid` snippet retains original render path when `is_size_option=false` — Dawn legacy callers unaffected (and there are none in this repo)
- [x] Input validation: `image_url` + `image_tag` filters auto-escape; `handleize` normalizes user text
- [x] Auth/authz: N/A (public PDP feature)
- [x] N+1 / query efficiency: single `for sg_block in block.blocks` per snippet render with `break` on match — O(blocks) where blocks ≤ Shopify's section block limit (50)
- [x] Data leaks: no PII; alt text + image are merchant-controlled in Theme Editor
- [x] Fact-checked: file paths + symbol names verified via grep, NOT assumed from plan text

---

## Recommended actions (prioritized)

1. **Before commit:** `git checkout HEAD -- locales/` to keep the size-guide PR diff scoped to 5 files. Open a separate hygiene PR for locale `/* */` header sync if intentional.
2. **Before ship:** Add translation keys for "Size guide" trigger label + modal title. Even if just `en.default.json` for now, the `| t` filter call sites enable future locale work.
3. **Phase 04 visual QA:** Confirm trigger placement doesn't break legend layout in all 3 picker_types.
4. **v2 (deferred):** Snippet-API hardening — promote `sg_has_chart` + `sg_modal_id` computation from snippet into the section to decouple from `block: section` quirk.

---

## Unresolved questions

- Should the `alt` schema default reference a `t:` translation handle (Shopify schema-locale convention) instead of literal "Sizing chart"? Convention varies across Dawn — some defaults are literals, some are `t:` handles. Confirm with project convention before changing.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Size-guide port is correctly architected — Dawn `<modal-dialog>` choice over `<details-modal>` is justified, backdrop-trap rule respected via body-reparent, snippet contract is documented, theme check clean for modified files. Two non-blocking gaps (locale sync noise + missing i18n on new strings) + three medium polishes (a11y aria-controls, snippet API fragility, schema validation gap).
**Concerns/Blockers:** H1 (51 unrelated locale-file modifications muddying PR diff) — recommend de-scope before commit.
