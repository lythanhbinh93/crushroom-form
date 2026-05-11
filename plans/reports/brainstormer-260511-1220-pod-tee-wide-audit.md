# pod-tee-theme Wide Audit (read-only)

Branch: `feat/bug-fix-sprint` @ `2ab9b30`. Scope: every dopamiles-* file across layout, sections, snippets, assets, templates. 88 findings total.

---

## 1. TL;DR

### Top 5 P0 (ship-blocker)
1. **Round-3c rejected optimistic-UI code still present** — `injectOptimisticAtcLine` + `optimisticLineUpdate` + CSS — must be ripped out (user halt journal).
2. **`[data-dawn-vs]` wrapper hides Dawn picker forever when Globo present** — but Globo CSS loads after ours; relies on 3 setTimeout hacks at 400/1500/4000ms. Brittle, racy. Source of Bug B (CLS + perception).
3. **Collection page card uses `product.variants.first.featured_media`** (`sections/dopamiles-collection-grid.liquid:245`) — Shopify Liquid `variants` order is **not** stable across edits/imports, and `variants.first` is NOT the merchant's first-variant intent on many products. This is the root of Bug C ("wrong first photo").
4. **`dopamiles-cart.js` is 754 LOC** (4× the 200-LOC guideline) and tangles drawer, cart-page, ATC, qty, upsell, optimistic UI, pubsub, surface-rebind, error overlay — all in one IIFE. Strangle/split needed before any further patch.
5. **3 setTimeout calls hiding Globo race** (`product-hero.liquid:498-500`) re-run `muteNativeWhenGlobo` at 400/1500/4000ms — Globo can inject after 4s (the bounded "patch" window), leaving double-render on slow networks.

### Top 5 P1 (high pre-publish)
1. **`sections/dopamiles-product-hero.liquid` is 741 LOC** with ~290 LOC inline `<script>`. Schema-driven liquid + JS variant logic + Globo mute + ATC fallback toast + Dawn reveal timer all in one file. Move JS to `dopamiles-pdp.js` or new `dopamiles-pdp-variant-sync.js`.
2. **`sections/dopamiles-collection-grid.liquid` 720 LOC** — full hero + tabs + grid + filter drawer + pagination + inline `<script>` for drawer open/close. Split filter drawer to snippet.
3. **No CLS reservation for variant picker area** — `[data-dawn-vs]` `visibility:hidden` does NOT reserve height (visibility yes; takes space). But Globo replaces the *contents*, so swatch height changes (round circles vs text pills) cause measurable layout shift. PDP CSS reserves gallery aspect-ratio but not buy-column slots.
4. **Two `dop-li-qty-dec/inc` binders attached every swap** without dedupe guard. `bindDrawerSurface()` re-runs after each drawer mutation; if the swap fails partway, listener leak resumes (round-1 bug pattern). No `dataset.bound` flag.
5. **`dopamiles-pdp.js:23` ships `console.log` in production** — and `dopamiles-pdp.js:15` logs container-not-found. Plus 8 `console.error` calls elsewhere. Acceptable for `error`, leaky for `log`.

### Severity totals
- **P0:** 8
- **P1:** 22
- **P2:** 38
- **P3:** 20
- **Total backlog:** 88

---

## 2. File-size & modularization map (>200 LOC)

### JS

| Path | LOC | Suggested split |
|------|-----|------|
| assets/dopamiles-cart.js | **754** | cart-core (open/close/setLoading) · cart-mutations (add/change/refresh) · cart-bindings (surface rebind) · cart-pubsub (publish/cartUpdate) · cart-error-overlay (`showInjectError`/`showProductFormError`). DELETE optimistic helpers. |
| assets/dopamiles-3pack.js | 551 | 3pack-state, 3pack-cart-actions, 3pack-render |
| assets/dopamiles-search.js | 542 | search-input, search-results-render, search-store |

### CSS

| Path | LOC | Notes |
|------|-----|------|
| assets/dopamiles-utility.css | 1036 | Likely fine (Tailwind-style utilities) |
| assets/dopamiles-collection.css | 985 | Split into collection-hero / collection-grid / collection-drawer |
| assets/dopamiles-journal.css | 845 | Article + index separation |
| assets/dopamiles-search.css | 803 | Defer non-critical (panel-only) to media print onload pattern |
| assets/dopamiles-pdp.css | 792 | Hero, gallery, accordion, FBT, bundle, sticky — split by component |
| assets/dopamiles-home.css | 761 | Per-section files (hero, marquee, pillars, reviews, newsletter) |
| assets/dopamiles-cart.css | 742 | Already split (drawer-ui, page); §12 round-3c block to be deleted |
| assets/dopamiles-account.css | 704 | OK; account is rare path |
| assets/dopamiles-feedback.css | 681 | OK |
| assets/dopamiles-components.css | 676 | OK (shared UI primitives) |
| assets/dopamiles-3pack.css | 660 | OK |
| assets/dopamiles-journal-article.css | 606 | OK |
| assets/dopamiles-gift-card.css | 600 | OK |
| assets/dopamiles-pages-static.css | 521 | OK |

### Liquid

| Path | LOC | Notes |
|------|-----|------|
| sections/dopamiles-product-hero.liquid | **741** | Extract inline `<script>` (~290 LOC, lines 241-534) to `dopamiles-pdp-variant-sync.js` |
| sections/dopamiles-collection-grid.liquid | **720** | Extract filter drawer (lines 391-541) to snippet `dopamiles-collection-filter-drawer.liquid` |
| layout/theme.liquid | 443 | Mostly Dawn stock; OK |
| sections/dopamiles-blog-article.liquid | 405 | OK |
| sections/dopamiles-customer-addresses.liquid | 394 | OK |
| sections/dopamiles-contact.liquid | 379 | OK |
| sections/dopamiles-blog-index.liquid | 360 | OK |
| sections/dopamiles-cart-drawer.liquid | 342 | Extract line-item rendering loop to snippet (already have `dopamiles-cart-line-item.liquid` but it's unused — see #C4) |
| sections/dopamiles-customer-order.liquid | 324 | OK |
| sections/dopamiles-gift-card.liquid | 299 | OK |
| sections/dopamiles-cart-main.liquid | 268 | OK |
| sections/dopamiles-customer-login.liquid | 264 | OK |
| sections/dopamiles-customer-account.liquid | 251 | OK |
| sections/dopamiles-search.liquid | 228 | OK |
| sections/dopamiles-header.liquid | 225 | OK |
| sections/dopamiles-3pack-picker.liquid | 223 | OK |
| sections/dopamiles-404.liquid | 211 | OK |
| sections/dopamiles-home-hero.liquid | 207 | OK |
| sections/dopamiles-home-reviews.liquid | 206 | OK |
| snippets/dopamiles-tokens.liquid | 215 | OK (tokens are densely written; not "code") |

---

## 3. Ranked backlog table

### P0 — Ship-blockers

| # | Sev | Area | File:Line | Issue | Fix shape | Effort | Depends on |
|---|-----|------|-----------|-------|-----------|--------|------------|
| 1 | P0 | dead-code | assets/dopamiles-cart.js:105-114 | `showInjectError` red banner (preview-debug aid for rejected optimistic flow) | Delete fn + all callers | S | — |
| 2 | P0 | dead-code | assets/dopamiles-cart.js:145-207 | `injectOptimisticAtcLine` — rejected optimistic flow | Delete fn + line 678 caller | S | #1 |
| 3 | P0 | dead-code | assets/dopamiles-cart.js:222-237 | `optimisticLineUpdate` — rejected optimistic flow | Delete fn + line 411 caller; in `handleQtyChange` drop `rollback` plumbing | S | — |
| 4 | P0 | dead-code | assets/dopamiles-cart.css:710-754 | §12 round-3c CSS (`.dop-li-price-pending`, `.dop-li-optimistic`, `@keyframes dop-spin`, `@keyframes dop-li-enter`) | Delete §12 block | XS | #1-3 |
| 5 | P0 | dead-code | sections/dopamiles-product-hero.liquid:202-231 | `<script type="application/json" id="dop-product-data">` JSON island (fed rejected `injectOptimisticAtcLine`) | Delete entire script island + surrounding comments | S | #2 |
| 6 | P0 | bug | sections/dopamiles-collection-grid.liquid:245 | `product.variants.first.featured_media` — `variants.first` order is merchant-input-driven AND not guaranteed stable; first variant may be the wrong color | Use `product.featured_image` (canonical Shopify "featured image" = merchant's editor pick) OR `product.media.first` (first media in the merchant's media list). Mirror Sloth pattern (1 img/card, `product.featured_image`) | S | — |
| 7 | P0 | bug | sections/dopamiles-product-hero.liquid:94,498-500,525-532 | Globo-mute relies on 3 setTimeout retries at 400/1500/4000ms; CLS visible until last retry; Globo on slow connections can paint after 4s leaving double-render | Replace polling with `MutationObserver` on the section subtree watching for `.globo-swatch-product-detail` insertion → fire once, disconnect. Keep 1500ms "reveal Dawn if no Globo" timer as fallback (acceptable degradation). | M | #5 |
| 8 | P0 | perf/modularize | assets/dopamiles-cart.js entire file | 754 LOC mixing 5+ concerns; new bugs hard to scope | Strangler: keep file, extract pure helpers (`escapeHtml`, `updateBubbleCount`, `publishCartUpdate`) to `dopamiles-cart-helpers.js`. Then extract `swapSection`/`applyCartMutation` to `dopamiles-cart-mutations.js`. Verification: ATC works, qty+/− works, drawer opens. | L | #1-5 |

### P1 — High pre-publish

| # | Sev | Area | File:Line | Issue | Fix shape | Effort | Depends |
|---|-----|------|-----------|-------|-----------|--------|---------|
| 9 | P1 | modularize | sections/dopamiles-product-hero.liquid:241-534 | ~290 LOC inline `<script>` block: variant sync, ATC fallback toast, Globo mute, Dawn reveal timer | Move to `assets/dopamiles-pdp-variant-sync.js`, pass per-section data via `data-` attrs OR a small inline JSON island (kept) | L | #5,#7 |
| 10 | P1 | a11y | sections/dopamiles-product-hero.liquid:94 | `[data-dawn-vs]` with `visibility:hidden` keeps element in tab order — screen readers may still see radios when Globo is "winning" | Add `aria-hidden="true"` + `inert` to data-dawn-vs wrapper while visibility hidden; remove both on reveal | XS | #7 |
| 11 | P1 | perf | sections/dopamiles-product-hero.liquid:241-244 | Inline `<script>` for variant sync runs synchronously in mid-body; blocks parser ~5-10ms × #PDPs in carousels (not relevant for PDP but bad pattern) | Same as #9 (move to deferred external) | inc | #9 |
| 12 | P1 | bug | sections/dopamiles-cart-drawer.liquid:243 | `up.first_available_variant.id` — silent `null` if sold out → button stays enabled, ATC throws | Wrap in `{% if up.first_available_variant %}` and render disabled state otherwise | XS | — |
| 13 | P1 | perf | layout/theme.liquid:80-85 | 6 Dawn JS files loaded site-wide with `defer` even on pages that don't need product-form / details-modal / search-form (e.g. blog index, account pages) | Conditional load via Liquid `{% if template contains 'product' %}` for product-form/info; details-disclosure stays site-wide (used in footer accordions) | M | — |
| 14 | P1 | perf | layout/theme.liquid:78 | Google Fonts `<link>` blocking — single CSS request with 4 families × multiple weights | Use `media="print" onload` swap OR `font-display:swap` is already on, but the `<link>` itself is render-blocking. Preconnect is good; add `media=print onload` swap | S | — |
| 15 | P1 | perf | layout/theme.liquid:37-67 | 7 dopamiles CSS files loaded synchronously in `<head>` site-wide (components, feedback, shared, search, cart, cart-drawer-ui, bundle, 3pack) — ~50KB+ unminified | Bundle into 1-2 critical files + lazy-load non-critical (3pack, journal). Or use Section Render-only includes (most sections already do this for their own CSS). | M | #16 |
| 16 | P1 | dead-code | layout/theme.liquid:67 | `dopamiles-3pack.css` (660 LOC) loaded site-wide because `?view=three-pack` preview test failed | Move back into `sections/dopamiles-3pack-picker.liquid` (already in `page.three-pack.json`, only renders on /pages/3-pack). Use `{% if template contains 'three-pack' %}` gate in head OR the asset_url tag inside the section file. | S | — |
| 17 | P1 | modularize | sections/dopamiles-collection-grid.liquid:391-541 | Filter drawer + inline JS for open/close is 150 LOC | Extract to `snippets/dopamiles-collection-filter-drawer.liquid` + add JS to `assets/dopamiles-collection.js` (does not exist yet — could be combined with niche-tabs JS if any) | M | — |
| 18 | P1 | bug | sections/dopamiles-collection-grid.liquid:138 | Inline `onchange="window.location = '{{ collection.url }}?sort_by=' + this.value + window.location.search.replace(...)"` — regex hack to strip existing `sort_by`, race-conditions with filter form submit | Move to `assets/dopamiles-collection.js`. Use `URLSearchParams`. | S | #17 |
| 19 | P1 | bug | sections/dopamiles-collection-grid.liquid:228 | `product.variants.first.inventory_quantity <= 5` — same `variants.first` instability as #6. Also: `inventory_quantity` is undefined when `inventory_management != 'shopify'` — risks "Low" ribbon on every product. | Iterate all variants OR use `product.selected_or_first_available_variant.inventory_quantity` AND gate on `inventory_management == 'shopify'`. | S | #6 |
| 20 | P1 | bug | sections/dopamiles-collection-grid.liquid:419-447 | `onchange="this.form.submit()"` on EVERY checkbox — submits the empty `#doc-filter-form` (no real fields in it). User intent: post all checked filters via Shopify's facet system | Either give each filter checkbox `name=value.param_name` inside the visible form (which is the hidden `#doc-filter-form`) — but params live on the inputs already. Verify in live test: clicking a checkbox needs to GET `/collections/X?filter.v.option.color=black`. Current code does so via the form attr — check that submit picks up checkbox name/value pairs correctly. **Audit verdict: works but fragile; needs live verification.** | S | — |
| 21 | P1 | a11y | sections/dopamiles-collection-grid.liquid:200-214 | `.doc-ad-card` (mid-grid editorial) is rendered as div inside `<a>` siblings — but the card itself has a CTA link, so the grid contains anchor + div + anchor + anchor. Tab order is correct, but visually adjacent product cards being links means screen-reader users hear the editorial card differently. Add `role="complementary"` or `<aside>`. | Change `<div class="doc-ad-card">` → `<aside class="doc-ad-card" aria-label="Editorial card">` | XS | — |
| 22 | P1 | a11y | sections/dopamiles-collection-grid.liquid:233-317 | `<a class="doc-pcard">` wrapping `<h3>` + price + `<button class="doc-quick">` — nested interactive: button inside link is invalid HTML | Move quick-add button OUTSIDE the `<a>` (positioned absolute over it). Or change `<a>` to wrapper `<div>` with `<a>` only around the image/title. | S | — |
| 23 | P1 | a11y | snippets/dopamiles-product-card.liquid:12 | Same nested-interactive issue: card is `<a>` but no inner button — OK here, but the snippet has no `<h3>` (uses `<h4>`); heading hierarchy questionable when used inside section with `<h2>` heading | Change `<h4>` → `<h3>` OR document why h4 is correct (depends on whether parent section uses h2) | XS | — |
| 24 | P1 | bug | sections/dopamiles-product-hero.liquid:256-258 | `fmtMoney()` hardcodes `$` prefix — breaks for non-USD merchants if multi-currency is enabled | Use Shopify's `Shopify.formatMoney(cents, format)` (provided by Shopify global) OR pre-format on server and inject locale-aware variant prices into `data-dop-variants-json`. Current approach also strips `.00` which may not be desired in EUR/JPY contexts. | M | — |
| 25 | P1 | bug | sections/dopamiles-product-hero.liquid:74 | `id="price-{{ section.id }}"` — section.id is unique per section but the `#price-` selector is not used by JS (queries use `.dop-price` class). Confirmed unused. | Drop the ID OR use it (JS targets class — keep as-is for now). Low priority but if dropping, do it for clarity. | XS | — |
| 26 | P1 | perf | sections/dopamiles-product-hero.liquid:486-500 | 4 setTimeout calls + DOMContentLoaded for `muteNativeWhenGlobo` — last fires at 4000ms | Replace with MutationObserver (see #7). Or, simpler: load Globo's script with `<link rel=preload>` so it executes before our reveal timer. **Cannot control Globo loading order from the theme — MutationObserver is correct fix.** | M | #7 |
| 27 | P1 | bug | assets/dopamiles-cart.js:582-608 | `bindDrawerSurface()` / `bindPageSurface()` re-attach without dedupe — if swap leaves duplicate nodes due to partial response, listeners stack | Add `if (btn.dataset.bound) return; btn.dataset.bound = '1';` before each `addEventListener` OR use event delegation on stable parent (`.dop-cart-lines`) | S | #8 |
| 28 | P1 | bug | assets/dopamiles-cart.js:316-342 | `refreshDrawer()` swallows fetch errors silently (line 319: `if (!res.ok) return`) — drawer can show stale state with no user signal | Show banner via existing `#dop-cart-err-banner` element (line 63 in section) when refresh fails | S | — |
| 29 | P1 | perf | sections/dopamiles-product-hero.liquid:239 | `{{ product.variants | json }}` outputs full variant list including all metafields — could be 50KB for high-SKU products | Project a slim JSON: only `id, title, options, price, compare_at_price, available, inventory_quantity, inventory_management, featured_image, featured_media, sku`. ~5KB instead. | S | — |
| 30 | P1 | bug | sections/dopamiles-fbt.liquid:88-98 | FBT form posts `items[][id]` — Shopify supports multi-item `/cart/add` but only via `cart.js` API (POST form fallback works but does NOT redirect to /cart per Shopify docs) | Verify behavior live OR convert to JS-driven POST via fetch (consistent with rest of theme's AJAX cart) | S | — |

### P2 — Polish

| # | Sev | Area | File:Line | Issue | Fix shape | Effort | Depends |
|---|-----|------|-----------|-------|-----------|--------|---------|
| 31 | P2 | bug | sections/dopamiles-product-hero.liquid:121-125 | Stock indicator low-stock copy hardcoded "Ships in 7 days" — same string in 3 places. Locale-bound. | Section setting `low_stock_text` + `in_stock_text` with placeholder OR move to locales/en.default.json | S | — |
| 32 | P2 | bug | sections/dopamiles-product-hero.liquid:330,357,370 | "Add to cart" / "Sold out" / "Unavailable" string literals in JS — already exposed as `window.variantStrings` (layout/theme.liquid:387-392) | Use `window.variantStrings.addToCart` etc | S | — |
| 33 | P2 | hardcoded | sections/dopamiles-product-hero.liquid:536 | `<p class="dop-ship-line">30-day returns. No questions, no restocking.</p>` hardcoded | Section setting | XS | — |
| 34 | P2 | bug | sections/dopamiles-product-hero.liquid:174 | `data-type='add-to-cart-form'` should be `data-type="add-to-cart-form"` — single-quote in Liquid `form` filter generates HTML; verify output is valid | Live verify only; likely OK | XS | — |
| 35 | P2 | perf | sections/dopamiles-product-hero.liquid:582-586 | CSS+JS loaded inside section body (not head) — `dopamiles-pdp.css` + `component-product-variant-picker.css` + `product-info.js` + `product-form.js` + `dopamiles-pdp.js` | OK pattern but CSS-in-body causes minor flash. Move CSS to head via `{% stylesheet %}` block OR layout-side conditional load (#13) | S | #13 |
| 36 | P2 | dead-code | sections/dopamiles-product-hero.liquid:111-117 | `stock_class` assign + variable substitution — works but tortured Liquid (assign `dop-stock`, conditionally rewrite to `dop-stock low`) | Direct conditional `<div class="dop-stock{% if low %} low{% endif %}">` | XS | — |
| 37 | P2 | a11y | snippets/dopamiles-gallery.liquid:17 | `aria-hidden` via `{{ forloop.first \| json \| replace: 'true', 'false' \| replace: 'false', 'true' }}` — convoluted negation hack | Direct `{% if forloop.first %}false{% else %}true{% endif %}` | XS | — |
| 38 | P2 | bug | snippets/dopamiles-gallery.liquid:25 | `loading="eager" fetchpriority="high"` on first image — good for LCP, but if user navigates via variant change before main loads, fetchpriority gets confused. Minor. | None; acceptable | — | — |
| 39 | P2 | dead-code | snippets/dopamiles-product-card.liquid:1-47 | Snippet exists with 47 LOC, ONLY used by `dopamiles-niche-favorites.liquid` and `dopamiles-more-from-niche.liquid` — collection-grid does NOT use it (inline `<a class="doc-pcard">` instead). Inconsistent. | Refactor: collection-grid card markup → use this snippet (DRY) OR delete snippet and inline in the 2 places. Decision: keep snippet, migrate collection-grid to use it (per existing pattern, easier). Adds bestseller/sold-out/low ribbons param. | M | #22 |
| 40 | P2 | bug | sections/dopamiles-product-hero.liquid:179-184 | `price-tail` `<span style="margin-left:auto;font-weight:700">` — inline style. Hardcoded inside button. | Move to CSS class `.dop-btn-cta .price-tail` | XS | — |
| 41 | P2 | a11y | sections/dopamiles-product-hero.liquid:183 | Empty `<span class="price-tail">` when sold-out — screen readers read empty span. | Add `aria-hidden="true"` or omit when empty | XS | — |
| 42 | P2 | bug | assets/dopamiles-pdp.js:15,23 | `console.log` ships in production | Wrap in `if (window.dopDebug)` OR delete | XS | — |
| 43 | P2 | bug | assets/dopamiles-cart.js:107-114 | `showInjectError` red banner is ALSO a debug surface; if it survives the round-3c deletion (#1) by accident, end-users see red banners | Delete (#1) | XS | #1 |
| 44 | P2 | hardcoded | sections/dopamiles-cart-drawer.liquid:75-77 | "Free shipping unlocked." | Move to locales | XS | — |
| 45 | P2 | hardcoded | sections/dopamiles-cart-drawer.liquid:305-307 | "Bag's empty." / "That's a perfectly fine state to be in." / "Shop all tees →" | Locales + section settings | S | — |
| 46 | P2 | bug | sections/dopamiles-cart-drawer.liquid:127-141 | Nested `cart.items` loop inside outer `cart.items` loop — O(n²) on cart size. For carts <20 items this is fine but unnecessary. | Build a `bundle_groups` map in a single pass with Liquid `assign` + capture, OR accept O(n²) (carts >20 items rare) and document. | S | — |
| 47 | P2 | bug | sections/dopamiles-cart-drawer.liquid:212-215 | `has_upsell` set via for-loop scan; if any block has `product != blank` we render upsell. OK. | None | — | — |
| 48 | P2 | dead-code | snippets/dopamiles-cart-line-item.liquid:1-113 | Snippet exists but `dopamiles-cart-drawer.liquid` and `dopamiles-cart-main.liquid` render line items INLINE rather than `{% render 'dopamiles-cart-line-item' %}`. Inconsistent / dead code. | Refactor to use the snippet OR delete snippet | M | — |
| 49 | P2 | bug | assets/dopamiles-cart.js:60-69 | `updateBubbleCount(0)` adds `hidden` attribute — but if the bubble was already styled via CSS (display:none), the attribute toggle could fight CSS | Verify in CSS that `[hidden]` wins. Standard CSS: `[hidden] { display: none }` is in user-agent stylesheet; should be fine. | XS | — |
| 50 | P2 | perf | assets/dopamiles-cart.js:32-40 | `new DOMParser().parseFromString` on every section swap — could parse twice in `applyCartMutation` (lines 496 + 512) | Parse once per response, pass parsed doc to helper | XS | #8 |
| 51 | P2 | perf | sections/dopamiles-collection-grid.liquid:138 | Inline `onchange` regex over `window.location.search` — runs per-click, fine. | None | — | — |
| 52 | P2 | a11y | sections/dopamiles-collection-grid.liquid:263-269 | Quick-add button has `aria-label` but no actual quick-add functionality (no JS handler in section nor `dopamiles-collection.js`) — clicking does nothing | Either wire up (delegates to `/cart/add`) or remove button | S | #17 |
| 53 | P2 | a11y | sections/dopamiles-collection-grid.liquid:294-313 | `.doc-color-dots` rendered inside `<a class="doc-pcard">` with `aria-hidden="true"` — fine. But `title=` on each dot is the swatch name; redundant with `aria-hidden`. | OK pattern | — | — |
| 54 | P2 | bug | layout/theme.liquid:436 | `request.path contains 'preview_theme_id'` — `preview_theme_id` is a QUERY param, never in path. Should use `request.url contains` (which the OR clause does cover). The `request.path` check is dead. | Drop the `request.path` half | XS | — |
| 55 | P2 | bug | snippets/dopamiles-tokens.liquid:14-18 | `{{ settings.dop_ink \| default: '#1A1A1A' }}` — if settings.dop_ink is empty string (user cleared it), `default` does NOT trigger (only on `nil`). Risk of `var(--dop-ink: ;)` invalid CSS. | `{% if settings.dop_ink != blank %}{{ settings.dop_ink }}{% else %}#1A1A1A{% endif %}` | S | — |
| 56 | P2 | a11y | snippets/dopamiles-3pack-slot.liquid:42 | Empty `alt=""` on a meaningful product image (preview slot) | If presentational, OK. Verify context. | XS | — |
| 57 | P2 | hardcoded | sections/dopamiles-product-hero.liquid:159 | `data-type: 'add-to-cart-form'` — Dawn convention; OK as-is | None | — | — |
| 58 | P2 | bug | sections/dopamiles-fbt.liquid:13-23 | `total_cents = total_cents \| plus: bp.price` per loop with `multiplier = 100 - discount` — math is fine. But `(total * multiplier) / 100` truncates cents. | Acceptable for visual-only; real discount runs via Function | — | — |
| 59 | P2 | a11y | sections/dopamiles-fbt.liquid:97 | Submit button "Add 3 to cart →" — no aria-describedby for the savings line | Add `aria-describedby="dop-fbt-saving"` to the button (add ID to saving line) | XS | — |
| 60 | P2 | bug | sections/dopamiles-niche-favorites.liquid:59, more-from-niche:56 | `{{ 'dopamiles-pdp.css' \| asset_url \| stylesheet_tag }}` — loads PDP CSS on home page (these sections are home-page sections per `index.json` ref) for product-card styles | Move .dop-pcard rules to dopamiles-shared.css (already loaded site-wide) OR create dopamiles-product-card.css | S | — |
| 61 | P2 | bug | sections/dopamiles-niche-favorites.liquid:34 | `{%- for product in col.products limit: limit -%}` — `col.products` is paginated to 50 by Shopify; for collections >50 products this still works for limit:8 but documents the limit | None; OK | — | — |
| 62 | P2 | bug | sections/dopamiles-product-hero.liquid:46-50 | Eyebrow renders metafield first, falls back to product.type — but metafield `custom.eyebrow` may not exist in store, returns blank string, `!= blank` check works. OK. | None | — | — |
| 63 | P2 | perf | sections/dopamiles-product-hero.liquid:212-231 | JSON island serializes ALL variants including image URL. Cost per PDP: ~1-3KB. | Once #5 is deleted, this islands goes too | XS | #5 |
| 64 | P2 | a11y | sections/dopamiles-cart-drawer.liquid:33 | `<div role="dialog" aria-modal="true">` but no focus trap implemented in JS (only ESC handler) | Add focus trap when drawer is open (cycle Tab through drawer focusables only) | M | #8 |
| 65 | P2 | bug | assets/dopamiles-cart.js:262-274 | `changeCartItem` POSTs to `/cart/change.js` — if quantity > available stock, Shopify returns 422. Current catch just logs. | Surface inventory error via `dop-cart-err-banner` (already exists in markup) | S | — |
| 66 | P2 | a11y | layout/theme.liquid:438-440 | Build-tag div has `pointer-events:none` (good) but no `aria-hidden` | Add `aria-hidden="true"` | XS | — |
| 67 | P2 | a11y | sections/dopamiles-product-hero.liquid:553 | `<details class="dop-acc" open>` — open by default. SR users get content but no visual signal. OK pattern. | None | — | — |
| 68 | P2 | bug | sections/dopamiles-product-hero.liquid:560 | `{{ product.description }}` — raw HTML output. If merchant injects untrusted HTML via product description, XSS risk. **But** product.description is Shopify-admin-controlled, so threat model is internal. | Document threat model; consider `\| strip_html \| escape` if any PWA/headless feed | XS | — |

### P3 — Nice-to-have (one-line items)

| # | Sev | Area | File:Line | Issue |
|---|-----|------|-----------|-------|
| 69 | P3 | dead-code | layout/theme.liquid:34 | Comment `dopamiles-chrome.css removed` — remove the comment line itself |
| 70 | P3 | hardcoded | sections/dopamiles-cart-drawer.liquid:222-224 | "Add for free shipping →" / "You might also like →" — locale-bind |
| 71 | P3 | hardcoded | sections/dopamiles-product-hero.liquid:719 | Preset content "Ships in 7 business days..." — fine for preset |
| 72 | P3 | style | sections/dopamiles-product-hero.liquid:556-559 | SVG chevron repeated in every accordion + main section — extract to icon snippet |
| 73 | P3 | style | snippets/dopamiles-gallery.liquid:38-46 | SVG arrow icons inline — same icon family as #72 |
| 74 | P3 | a11y | snippets/dopamiles-gallery.liquid:10 | `<div tabindex="0">` on gallery main — keyboard-focusable container with arrow-key handler, no role attribute |
| 75 | P3 | docs | sections/dopamiles-collection-grid.liquid:1-21 | Header comment is good — keep |
| 76 | P3 | dead-code | templates/*.dawn-backup.json | 6 `.dawn-backup.json` template files — confirm these are preserved snapshots not used in production. Audit verdict: kept intentionally for rollback. |
| 77 | P3 | style | sections/dopamiles-product-hero.liquid:160 | `<input type="hidden" name="id" data-dop-variant-id value="...">` — `data-dop-variant-id` value-less attribute OK |
| 78 | P3 | perf | layout/theme.liquid:76-78 | Google Fonts requests Fraunces with `9..144` optical-size axis — large download |
| 79 | P3 | a11y | sections/dopamiles-collection-grid.liquid:484-490 | Drawer apply button "Show {{ products_count }} tees" — count is stale (cache) until page reload. Minor UX. |
| 80 | P3 | docs | sections/dopamiles-fbt.liquid:8 | TODO: "FBT metafield wiring (custom.fbt_products) comes in phase 05" — track |
| 81 | P3 | style | assets/dopamiles-cart.js:10-21 | Block of ALL_CAPS consts — fine |
| 82 | P3 | bug | sections/dopamiles-product-hero.liquid:373-381 | `dop:variant-media-change` event detail includes full `variant` object — leaks ~2KB JSON to any listener; OK for internal use |
| 83 | P3 | style | sections/dopamiles-product-hero.liquid:486-500 | 3 setTimeout calls duplicated — extract `retryUntilGloboMuted()` |
| 84 | P3 | docs | snippets/dopamiles-tokens.liquid | 215-line tokens file — well-commented, no action |
| 85 | P3 | a11y | sections/dopamiles-collection-grid.liquid:124-126 | SVG icons in toolbar — no `<title>` element; `aria-hidden="true"` is correct here |
| 86 | P3 | style | sections/dopamiles-cart-drawer.liquid:18 | `assign upsell_products = ''` — unused variable |
| 87 | P3 | bug | sections/dopamiles-product-hero.liquid:439 | `var spinner = atc.querySelector('.loading__spinner, .loading-overlay__spinner')` — second selector likely never matches in this theme |
| 88 | P3 | dead-code | sections/dopamiles-product-hero.liquid:74 | `id="price-{{ section.id }}"` not referenced anywhere |

---

## 4. Round-3c leftover sweep

Grep terms: `injectOptimisticAtcLine`, `optimisticLineUpdate`, `dop-li-optimistic`, `dop-li-price-pending`, `data-dawn-vs`.

| File | Line | Token | Status |
|------|------|-------|--------|
| assets/dopamiles-cart.js | 145 | `injectOptimisticAtcLine(form, qty)` (definition) | **DELETE** |
| assets/dopamiles-cart.js | 192 | `<div class="dop-li dop-li-optimistic" data-line-key="optimistic">` | **DELETE** |
| assets/dopamiles-cart.js | 222 | `optimisticLineUpdate(li, prevQty, newQty)` (definition) | **DELETE** |
| assets/dopamiles-cart.js | 231 | `<span class="dop-li-price-pending" aria-label="Updating price"></span>` | **DELETE** |
| assets/dopamiles-cart.js | 411 | `rollback = optimisticLineUpdate(liEl, currentQty, newQty);` | **DELETE** (also drop `rollback` plumbing in `handleQtyChange` lines 409-422) |
| assets/dopamiles-cart.js | 678 | `injectOptimisticAtcLine(form, qty);` (call site in interceptor) | **DELETE** |
| assets/dopamiles-cart.css | 714 | comment `.dop-li-price-pending — inline spinner during qty +/- fetch (F fix).` | **DELETE** |
| assets/dopamiles-cart.css | 716 | comment `.dop-li-optimistic — entrance animation for ATC line (G fix).` | **DELETE** |
| assets/dopamiles-cart.css | 722 | `.dop-li-price-pending` rule | **DELETE** |
| assets/dopamiles-cart.css | 736 | `.dop-li-optimistic` rule | **DELETE** |
| sections/dopamiles-product-hero.liquid | 88-92 | Comment block about `data-dawn-vs` strategy | **KEEP-WITH-EDIT** — strategy itself stays (CLS fix), but rewrite comment to mention MutationObserver replacement (post #7) |
| sections/dopamiles-product-hero.liquid | 94 | `<div data-dawn-vs style="visibility:hidden">` | **KEEP** (Globo race wrapper) until #7 ships MutationObserver |
| sections/dopamiles-product-hero.liquid | 196 | comment `Read by dopamiles-cart.js injectOptimisticAtcLine().` | **DELETE** (alongside #5 — entire JSON island) |
| sections/dopamiles-product-hero.liquid | 530 | `var dawn = document.querySelector('[data-dawn-vs]');` (Dawn reveal timer) | **KEEP** until #7 |

**Bonus leftovers (showInjectError is round-3c only):**
- assets/dopamiles-cart.js:105 `function showInjectError(msg)` — **DELETE**
- assets/dopamiles-cart.js:154,159 — `showInjectError(...)` call sites — **DELETE** with #2

**Also delete the entire JSON island** (sections/dopamiles-product-hero.liquid:202-231) — this exists only to feed `injectOptimisticAtcLine`.

---

## 5. Bug A/B/C verification

### Bug A — `dopamiles-cart.js` perf (754 LOC inventory)

| Fn (line) | Feature | Stock Dawn equivalent | Load-bearing | Verdict |
|-----------|---------|------|--------------|---------|
| `swapSection` (32) | Section Render API swap helper | `cart-drawer.js` has internal | YES | **KEEP** (cleaner than Dawn) |
| `updateBubbleCount` (60) | Header bag badge update | none (Dawn uses Section Render on cart icon) | YES | **KEEP** — Dawn alternative would require restructuring `dopamiles-header.liquid` |
| `publishCartUpdate` (86) | Pubsub publish wrapper | Dawn's `product-form.js` publishes natively | YES (because we intercept submit) | **KEEP** |
| `showInjectError` (105) | **Round-3c debug red banner** | none | NO | **DELETE** (#1) |
| `escapeHtml` (123) | Defense-in-depth attr escape | none | YES if `injectOptimisticAtcLine` kept; NO once deleted | **DELETE** with #2 |
| `injectOptimisticAtcLine` (145) | **Round-3c rejected optimistic flow** | none | NO | **DELETE** (#2) |
| `optimisticLineUpdate` (222) | **Round-3c rejected qty optimistic** | none | NO | **DELETE** (#3) |
| `fetchCart` (243) | /cart.js fetch wrapper | Dawn fetches inside product-form.js | YES | **KEEP** |
| `changeCartItem` (261) | /cart/change.js + bundled sections | Dawn's `cart.js` (Cart custom element) | YES (bundled sections eliminate reload) | **KEEP** |
| `addToCart` (289) | /cart/add.js + bundled sections | Dawn's `product-form.js` | YES (drives interceptor) | **KEEP** |
| `refreshDrawer` (316) | Standalone drawer reload | none | YES — used by `window.dopCart.refresh()` | **KEEP** (defensive fallback) |
| `setLoading` (345) | Dim drawer body | Dawn's loading-overlay | YES | **KEEP** |
| `openDrawer` (357) / `closeDrawer` (373) | Drawer slide in/out | Dawn's `cart-drawer.js` `<cart-drawer>` custom element | YES — we don't use Dawn's drawer | **KEEP** |
| `handleQtyChange` (395) | Qty stepper | Dawn `cart.js` updates | YES | **KEEP** (drop `rollback` plumbing after #3) |
| `handleRemove` (430) | Remove line | Dawn `cart.js` | YES | **KEEP** |
| `handleUpsellAdd` (449) | Drawer upsell card | none (Dawn has cart-notification recommendations) | YES | **KEEP** |
| `applyCartMutation` (484) | Post-mutation swap + bubble + pubsub | Dawn fragments via Cart custom element | YES (load-bearing for all 3 mutation paths) | **KEEP** (extract to cart-mutations.js per #8) |
| `refreshPageTotals` (547) | Cart-page-only Section Render reload | Dawn's `cart.js` updates | YES (legacy fallback) | **KEEP** |
| `bindDrawerSurface` (579) / `bindPageSurface` (596) | Surface-specific listener attach | Dawn does Custom Elements + connectedCallback | YES | **KEEP** (add dedupe per #27) |
| `rebindSurface` (616) | Dispatcher | none | YES | **KEEP** |
| `bindDrawerEvents` (623) | Back-compat alias | none | NO (no external caller in tree) | **DELETE** as part of #8 |
| `showProductFormError` (631) | Inline ATC error banner | Dawn renders into `.product-form__error-message-wrapper` (already in DOM via product-hero.liquid:149) | PARTIAL — we still use this inside the interceptor's catch | **STRANGLE**: replace with writes into the existing `.product-form__error-message-wrapper` element (free of inline style/cssText) |
| `bindAddToCartInterceptor` (653) | Site-wide submit intercept | Dawn's `product-form.js` does this for product forms only | YES (extends to all cart-add forms incl FBT, upsell, 3pack) | **KEEP** — but drop `injectOptimisticAtcLine` call at line 678 |
| `bindKeyboardHandlers` (711) | ESC closes drawer | Dawn's cart-drawer handles | YES (since we don't use Dawn's drawer) | **KEEP** |
| `init` (723) | Bootstrap | Dawn uses connectedCallback | YES | **KEEP** |
| `window.dopCart` (753) | Public API | none | YES (used by header bag click; check `dopamiles-header.js`) | **KEEP** |

**Strangler-vs-big-bang verdict:** STRANGLER.

Reasons:
1. 16 of 22 functions are load-bearing for live ATC/cart paths — big-bang rewrite is multi-day with high regression risk.
2. The dead-code surface (`showInjectError`, `injectOptimisticAtcLine`, `optimisticLineUpdate`, `escapeHtml` once #2 lands) is removable in ~100 LOC delete (#1-3,#5). That alone brings file to ~640 LOC.
3. Post-delete: extract `escapeHtml` (kept as defensive helper) + 3 pure helpers (`swapSection`, `updateBubbleCount`, `publishCartUpdate`) to `dopamiles-cart-helpers.js` (~80 LOC). Brings main to ~560 LOC.
4. Then extract `applyCartMutation` + `swapSection` + bundled section parsing into `dopamiles-cart-mutations.js` (~150 LOC). Brings main to ~410 LOC.
5. Final shape: 3 files, none >400 LOC, each load-bearing, no behavior change. Verifiable per-step via "drawer opens / qty changes / ATC works" smoke.

**Verification gate after deletion:** open PDP → click ATC → drawer opens with real line item (no flash of "optimistic" line) → qty +/− works → remove works. If all pass, the optimistic UI was truly dead.

### Bug B — Globo PDP swatches

**File-level references to `[data-dawn-vs]` + reveal timers + parent-visibility tricks:**

| File:Line | Reference |
|-----------|-----------|
| sections/dopamiles-product-hero.liquid:94 | `<div data-dawn-vs style="visibility:hidden">` — the wrapper |
| sections/dopamiles-product-hero.liquid:530 | `var dawn = document.querySelector('[data-dawn-vs]');` — reveal-on-no-Globo |
| sections/dopamiles-product-hero.liquid:486-500 | `muteNativeWhenGlobo()` polling: DOMContentLoaded + 400ms + 1500ms + 4000ms setTimeout |
| sections/dopamiles-product-hero.liquid:525-532 | 1500ms `setTimeout` for reveal-Dawn-if-no-Globo |
| sections/dopamiles-product-hero.liquid:487 | Globo detection selector: `.globo-swatch-product-detail, [class*="globo-swatch-product"]` |
| sections/dopamiles-product-hero.liquid:526-528 | Globo detection (reveal-side): `.globo-swatch-product-detail, [data-globo], [class*="globo-color-swatch"]` (inconsistent with line 487 — see #B5) |

**Min-height candidate slots in `dopamiles-product-hero.liquid` + `dopamiles-pdp.css`:**

The buy column (`.dop-buy`) is a flex column with `gap:18px` (pdp.css:139). The variant picker slot sits between `.dop-price-row` and `.dop-stock`. With `visibility:hidden` on `[data-dawn-vs]`, the wrapper still occupies space — BUT Globo's swatch DOM replaces that wrapper's children, and Globo paints with `display:block` on its own container which has a different intrinsic height than Dawn's `<variant-selects>` (text pills are ~32px tall; color circles are ~36px; size pills another row at ~32px = combined ~70-80px for Dawn vs ~60-70px for Globo). Net delta: ~10-20px shift on injection.

**Recommended min-height anchors:**
1. **Wrap `[data-dawn-vs]` and `.globo-swatch-product-detail` in a shared slot** `<div class="dop-vs-slot">` with `min-height: 80px` (mobile) / `100px` (desktop). Bounded reservation eliminates CLS regardless of which picker wins.
2. Apply in `dopamiles-pdp.css` after line 218 (`.dop-stock` block) — add new `.dop-vs-slot { min-height: 80px; }` + `@media (min-width: 750px) { .dop-vs-slot { min-height: 100px; } }`.
3. Liquid change in product-hero: wrap `data-dawn-vs` div and the Globo injection target in a sibling `.dop-vs-slot` parent.

**Verification:** Lighthouse CLS pass on /products/X with Globo enabled — target CLS < 0.1.

**MutationObserver replacement strategy (per #7):**
```
const slot = section.querySelector('.dop-vs-slot');
const obs = new MutationObserver(() => {
  if (slot.querySelector('.globo-swatch-product-detail, [class*="globo-color-swatch"]')) {
    muteNativeNow();
    obs.disconnect();
  }
});
obs.observe(slot, { childList: true, subtree: true });
setTimeout(() => obs.disconnect(), 5000); // safety; fall through to reveal Dawn
```
Replaces 4 setTimeout calls with a single deterministic observer.

### Bug C — Collection card "wrong first photo"

**Card render paths in this theme:**

| Route | Section | Card markup | Image expression |
|-------|---------|-------------|------------------|
| `/collections/all` (and any /collections/X) | `sections/dopamiles-collection-grid.liquid` | **INLINE** `<a class="doc-pcard">` block (lines 233-317) | `product.variants.first.featured_media \| default: product.featured_image` (line 245) |
| Home → "Niche favorites" 8-up grid | `sections/dopamiles-niche-favorites.liquid` | `{% render 'dopamiles-product-card' %}` (line 35) | snippet uses `card_product.featured_image` (line 18 — clean 1-img) |
| Home → "More from niche" 4-up | `sections/dopamiles-more-from-niche.liquid` | `{% render 'dopamiles-product-card' %}` (line 33) | same snippet — clean |
| Home → "Shop by niche" tabbed 4-up | `sections/dopamiles-home-shop-grid.liquid` | `{% render 'dopamiles-product-card' %}` (line 83) | same snippet — clean |
| PDP → "Related products" | `sections/related-products.liquid` (stock Dawn) | `{% render 'card-product' %}` (line 47) | stock Dawn `card-product.liquid` uses `card_product.featured_media` |
| PDP → "Niche favorites" (also rendered on product page per templates/product.json) | `sections/dopamiles-niche-favorites.liquid` | same snippet | clean |
| PDP → "More from niche" | `sections/dopamiles-more-from-niche.liquid` | same snippet | clean |

**Verdict on Bug C:**

User said the SNIPPET `snippets/dopamiles-product-card.liquid` was verified clean (renders 1 img using `card_product.featured_image`). That is correct.

**But `/collections/all` does NOT use that snippet.** It uses inline markup in `sections/dopamiles-collection-grid.liquid:233-317`. The image expression there (line 245) is:

```liquid
{%- assign card_img = product.variants.first.featured_media | default: product.featured_image -%}
```

This is the bug source. `product.variants.first` is the merchant's FIRST variant by their stored order in the Shopify admin, which is **not** semantically "the variant whose photo should be on the card." Three failure modes:

1. **Variants reordered after creation:** Shopify allows merchants to drag-reorder variants in admin. `variants.first` then changes. If the merchant has reordered to sort by size or alphabetic, the "first variant" is no longer the color they intended as the card hero.
2. **First variant has no per-variant image:** Falls back to `product.featured_image` — the merchant's deliberate choice. Inconsistent: some products show variant-image, others show featured_image.
3. **First variant's featured_media is a video, alt image, or wrong angle:** Per-variant `featured_media` is whatever media the merchant tagged to that variant; it's not necessarily the "card hero" angle.

**Fix:** Use `product.featured_image` directly (matches the snippet, matches Sloth benchmark, matches merchant intent). This also matches what the niche-favorites snippet does on the same site — internal consistency.

```liquid
{%- if product.featured_image -%}
  <img
    src="{{ product.featured_image | image_url: width: 600 }}"
    alt="{{ product.featured_image.alt | default: product.title | escape }}"
    width="300" height="300" loading="lazy">
{%- endif -%}
```

This kills #6 and unifies the 5 home-page card paths with the collection-grid path.

**Round-2 fix history note** (Round-2 commit `e07578c` deliberately re-applied `variants.first`). Indicates round-2 thought variants.first was the fix vs. some other regression — but it became Bug C. Verify with merchant: do they have any product where they intentionally rely on variant-first photo? If yes, scope this fix per-product via tags or default to product.featured_image.

---

## 6. Cross-cutting checks

### Hardcoded values that should be tokens
- 16 hex colors in `dopamiles-pdp.css`, 82 in `dopamiles-cart.css` — mostly `var(--dop-X, #fallback)` pattern which is correct. Concern: fallbacks inside `var()` calls are LARGE in cart.css. Audit suggests 80% are intentional defaults — OK pattern.
- Hardcoded copy: "Add to cart" / "Sold out" / "30-day returns. No questions, no restocking." / "Bag's empty." / "Free shipping unlocked." — see #31-#33, #44-#45.
- Inline `style="..."` (50+ instances mostly in liquid sections for one-off positioning) — acceptable for sections; not worth refactoring.

### A11y coverage
- ARIA on drawer/dialog: present (cart-drawer `role="dialog" aria-modal="true"`); focus trap NOT implemented (#64).
- `aria-hidden` toggling on overlays: correct.
- Nested interactive: cards have button inside `<a>` (#22). Invalid HTML.
- Empty `<span>` for price-tail when sold out (#41).
- Heading hierarchy: card uses `<h4>` (#23) — verify against parent section heading.
- Color-only state: `.dop-stock.low` uses dot color only + text — text is the carrier, OK.
- Keyboard: gallery arrow keys yes (pdp.js:44); cart drawer ESC yes (cart.js:711). Filter drawer ESC yes (collection-grid:537). Good.

### Dead code
- Snippet `dopamiles-cart-line-item.liquid` (113 LOC) exists but unused — both cart-drawer + cart-main inline their own line item markup (#48).
- Snippet `dopamiles-product-card.liquid` used by 3 home sections but NOT by collection-grid (which inlines) — inconsistent (#39).
- Comment in layout/theme.liquid:34 about removed `dopamiles-chrome.css` — but `assets/dopamiles-chrome.css` (14 LOC) still exists.
- `bindDrawerEvents` back-compat alias (cart.js:623) — no external caller in tree.
- Build-tag `request.path contains 'preview_theme_id'` (theme.liquid:436) — preview_theme_id is query, not path; half-clause is dead (#54).
- `assign upsell_products = ''` (cart-drawer.liquid:18) — unused.
- `id="price-{{ section.id }}"` (product-hero.liquid:74) — unreferenced.

### Third-party app touchpoints (render-blocking? defer-able?)
- **Globo**: app embed (not in theme code). Triggers Bug B. Theme accommodates via #7 strategy.
- **Klaviyo**: only mentioned in section comment (`dopamiles-blog-index.liquid:19`); newsletter form posts to Shopify (`/contact#contact_form` pattern). No Klaviyo JS in theme.
- **Hotjar, GA, FB Pixel**: NOT found in theme code. Loaded via `{{ content_for_header }}` (theme.liquid:91) which is the Shopify admin → app slot. Themes can't reorder these.
- **Shop Pay / Apple Pay**: rendered via Shopify checkout — section copy refs `dop-cart-secure` (cart-drawer.liquid:289).

### Preservation check (build-tag, error overlay, JSON product data island)
- **Build tag**: layout/theme.liquid:436-441 — preserved, preview-gated. (Bug #54 partial.)
- **Error overlay**: `showInjectError` (cart.js:105) — round-3c only; **delete** (#1). Production-safe inline error UI is `showProductFormError` (cart.js:631) which writes into the existing Dawn form error wrapper.
- **JSON product data island**: product-hero.liquid:212-231 — round-3c only; **delete** (#5). Distinct from `data-dop-variants-json` (line 238-240) which is the load-bearing variant-sync data; **keep**.

### Custom-cart.js vs stock-Dawn divergence
| Concern | Custom | Dawn stock |
|---------|--------|------|
| Drawer DOM | `dopamiles-cart-drawer.liquid` (full custom markup) | `cart-drawer.liquid` (kept in tree, NOT rendered) |
| Drawer JS | `dopamiles-cart.js` IIFE, manual DOM swaps | `cart-drawer.js` custom element |
| Site-wide ATC intercept | `bindAddToCartInterceptor` (capture-phase submit listener) | `product-form.js` per-instance |
| Section-render API usage | Bundled sections in /cart/add.js and /cart/change.js bodies | Same pattern; stock Dawn does it inside `cart.js` |
| Bubble update | `updateBubbleCount` manual | Cart custom element |
| Pubsub | Manual `publishCartUpdate` call | Native in stock |
| Empty-state | Custom (`.dop-cart-empty`) | Custom (`.cart__empty-text`) |

**Verdict:** divergence is intentional and load-bearing (custom design language). Stock Dawn `cart-drawer.liquid` and `cart-drawer.js` are dead weight in the theme but harmless. Could be deleted in P2 cleanup.

### Image-rendering patterns
- `product.featured_image | image_url: width: 600` — 5 instances. Width is half the displayed 300×300 retina-2x — correct (2x).
- `variants.first.featured_media | image_url: width: 600` — 1 instance (collection-grid:248). Same width OK, but expression wrong (Bug C).
- `product.media \| image_url: width: 1200` (gallery:21) — width is 2x the displayed ~600px gallery on desktop, reasonable for retina.
- `product.media \| image_url: width: 120` (gallery thumb:67) — 2x the 60×60 thumb size. Correct.
- No mobile-optimized `srcset` in custom cards. The dopamiles-product-card snippet hard-codes `width=600`. Mobile users on 320px viewports still download 600px. Add a `srcset="X 360w, X 600w"` pattern from Sloth benchmark. (P2 add — out of scope for this audit but flag for round-4.)

### Bundle integration
- `_bundle_id` line property: read at `dopamiles-cart-drawer.liquid:112`, `dopamiles-cart-line-item.liquid:18`. Renders bundle parent card grouping children.
- `_bundle_parent` line property: read at `cart-drawer.liquid:107`, `cart-line-item.liquid:11`. Identifies child lines.
- `bundle-eligible` tag: read by `snippets/dopamiles-bundle-collection-pill.liquid` (line 261 in collection-grid) to render bundle pill.
- Free-shipping bar: `cart-drawer.liquid:11-15` — threshold from `section.settings.free_shipping_threshold` (default 6000¢). Independent of bundle logic. ✓

---

## 7. Phase suggestions

### Phase 02 — Round-3c rejection cleanup (PRE-REQUISITE)
- **Items:** #1, #2, #3, #4, #5, #43
- **File ownership:** assets/dopamiles-cart.js, assets/dopamiles-cart.css, sections/dopamiles-product-hero.liquid
- **Effort:** M (3-4h with verification)
- **Gate:** ATC flow + qty stepper smoke pass on real iPhone preview. Build tag bumps. No red error banners ever appear.
- **Why first:** Every other change downstream gets simpler once dead code is gone.

### Phase 03 — Bug C fix (collection card image)
- **Items:** #6, #19
- **File ownership:** sections/dopamiles-collection-grid.liquid
- **Effort:** S (1h)
- **Gate:** `/collections/all` shows merchant's intended featured photo on every card. iPhone live verification.

### Phase 04 — Bug B fix (Globo CLS + perception)
- **Items:** #7, #10, #26, scope of #B (min-height slot)
- **File ownership:** sections/dopamiles-product-hero.liquid, assets/dopamiles-pdp.css
- **Effort:** L (3-5h)
- **Gate:** Lighthouse CLS < 0.1 on PDP with Globo enabled. PDP renders swatches on first paint, no visible double-render flash on iPhone 4G.

### Phase 05 — dopamiles-cart.js strangler
- **Items:** #8, #27, #28, #50, #65
- **File ownership:** assets/dopamiles-cart.js, new files assets/dopamiles-cart-helpers.js, assets/dopamiles-cart-mutations.js
- **Effort:** L (4-6h)
- **Gate:** All cart paths still work; no file >450 LOC. Smoke: ATC, qty +/−, remove, upsell add, discount apply.
- **Depends on:** Phase 02 (dead code removed first)

### Phase 06 — product-hero.liquid extraction
- **Items:** #9, #11, #17, #18, #24, #32
- **File ownership:** sections/dopamiles-product-hero.liquid, new assets/dopamiles-pdp-variant-sync.js, sections/dopamiles-collection-grid.liquid, new snippets/dopamiles-collection-filter-drawer.liquid
- **Effort:** L (4-6h)
- **Gate:** PDP variant sync + collection filter all still work. No file >450 LOC.
- **Depends on:** Phase 04 (don't extract before MutationObserver lands)

### Phase 07 — Card consistency + a11y
- **Items:** #22, #23, #39, #21, #52
- **File ownership:** sections/dopamiles-collection-grid.liquid, snippets/dopamiles-product-card.liquid
- **Effort:** M (2-3h)
- **Gate:** All 5 card render paths use the same snippet. axe-core regression < same as baseline. No button-inside-link.

### Phase 08 — Perf pass (loading, fonts, conditional CSS)
- **Items:** #13, #14, #15, #16, #29, #35, #60
- **File ownership:** layout/theme.liquid, sections/dopamiles-niche-favorites.liquid, sections/dopamiles-more-from-niche.liquid
- **Effort:** L (4-6h)
- **Gate:** Lighthouse perf > 80 on PDP mobile. Initial load CSS payload < 80KB. No FOUC.

### Phase 09 — Copy, tokens, locales
- **Items:** #31, #32, #33, #44, #45, #55, #70
- **File ownership:** sections/* + locales/en.default.json
- **Effort:** M (2-3h)
- **Gate:** No hardcoded UI copy in liquid section template literals (excluding presets/defaults).

### Phase 10 — Tail cleanup
- **Items:** all P3 + remaining P2 (#36-38, #40-42, #46-49, #51, #53-54, #56-59, #62-63, #66-68)
- **File ownership:** mixed (touch ≤ 1 P3 per file at a time)
- **Effort:** L total but parallel-friendly
- **Gate:** none — backlog burndown

---

## 8. Open questions

1. **Merchant data quality:** Does the merchant have any product where they intentionally rely on `variants.first` photo (vs `product.featured_image`)? If yes, scope Bug C fix per-product via tag (e.g., `card-uses-variant-photo`) instead of blanket switch.
2. **Globo metafield exposure:** Is Globo enabled per-product or store-wide? The mute selector `.globo-swatch-product-detail` assumes Globo paints on every PDP. If Globo is disabled on some product types, the 1500ms Dawn-reveal timer carries the load — verify it works.
3. **Globo selector inconsistency:** Mute detection (line 487) uses `.globo-swatch-product-detail, [class*="globo-swatch-product"]`. Reveal detection (line 526-528) uses `.globo-swatch-product-detail, [data-globo], [class*="globo-color-swatch"]`. Different attribute lists. Which is canonical? (Live check Globo DOM on production dopamiles.co.)
4. **Stale preview theme id:** User halt journal mentions round-3c shipped to preview. Preview-only build-tag fires off `preview_theme_id` URL param. Confirm preview theme ID is still the same one being tested; cache-bust is per-deploy.
5. **Dawn version pinned:** Stock Dawn JS files (`product-info.js`, `product-form.js`, `pubsub.js`, etc.) — what version? Dawn upgrades change `<variant-selects>` API; muteNativeWhenGlobo + syncVariant assume current contract.
6. **FBT multi-item POST behavior (#30):** Shopify's `/cart/add` accepting `items[][id]` via form-encoded POST — works for non-AJAX submit but does it currently redirect to /cart or refresh in-place? Verify live before recommending switch to fetch.
7. **`.dawn-backup.json` templates:** 6 files (`article.dawn-backup.json` etc) — keep for rollback or delete? If keeping, document in README.
8. **Bundle metafields seeded:** From prior memory, Shopify metafield seed is two-step (admin UI defines schema, mutation sets value). Has `shop.metafields.bundles.tiers` been set on dopamiles.co? Bundle banner relies on it.
9. **Phase 10 scope decision:** P3s span 20 items across 15 files. Acceptable to defer entirely? Or worth one batch sweep?

---

## Surprises (Top 3)

1. **`sections/dopamiles-collection-grid.liquid` does NOT use `snippets/dopamiles-product-card.liquid`.** The collection page has its own inline `<a class="doc-pcard">` markup. So the "clean snippet" verification was solving the wrong problem — the bug lives in the section, not the snippet. Different class prefix too (`doc-pcard` vs `dop-pcard`), so they don't even share CSS.
2. **`dopamiles-cart.js` has TWO debug surfaces baked in.** `showInjectError` (preview red banner for round-3c iPhone debugging) and `showProductFormError` (production-grade inline error). The former is round-3c-only and must be deleted; the latter is keep-and-strangle. Easy to delete the wrong one.
3. **`snippets/dopamiles-cart-line-item.liquid` (113 LOC) is dead code.** Both `dopamiles-cart-drawer.liquid` and `dopamiles-cart-main.liquid` inline their own (very similar) line-item markup. This is a DRY violation hiding in plain sight — one bug fix in line-item rendering needs to be made in 3 places. Promote the snippet to canonical and refactor the two sections to use it.

---

**Status:** DONE
**Summary:** 88 findings (8 P0 / 22 P1 / 38 P2 / 20 P3) across 50+ files. 14 round-3c leftover citations confirmed for deletion. Bug A (cart.js perf) → strangler split into 3 files. Bug B (Globo CLS) → MutationObserver + min-height slot wrapper. Bug C (wrong photo) → `variants.first.featured_media` in collection-grid:245 is the root; switch to `product.featured_image` to match 5 other card paths. 9 phases proposed.
**Concerns/Blockers:** Open questions #1 (variants.first intentional?), #3 (Globo selector inconsistency), #5 (Dawn version) need user / live-store verification before round-4 phases lock.
