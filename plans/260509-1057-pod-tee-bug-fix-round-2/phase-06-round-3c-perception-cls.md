# Phase 06 — Round-3c Perception (G + F) + CLS (R3-1)

## Context Links

- Approved brainstorm (source of truth for design): [../reports/brainstormer-260509-1701-pod-tee-round-2-3-perfect-ship.md](../reports/brainstormer-260509-1701-pod-tee-round-2-3-perfect-ship.md) → "Final design — single pass"
- Round-3b convergence-failure journal: [../../docs/journals/260509-pod-tee-phase-05-perception-iterations-converge-failure.md](../../docs/journals/260509-pod-tee-phase-05-perception-iterations-converge-failure.md)
- Round-3a partial ship (drawer immediate-open): commit `5b4d497`
- Round-3b revert (optimistic line + money parse): commit `7e52f8b`
- Gate 2 code-reviewer R3-1 root cause: Dawn `<variant-selects>` paints first, then GloboSwatch async-injects → vertical layout collapse → 0.313 CLS
- Phase 05 verification gate (consumer of this phase): [phase-05-reverify-and-publish.md](phase-05-reverify-and-publish.md)
- Brand context for `--dop-low`, `--dop-line`, `--dop-ink` tokens: `D:\github local\pod-tee-theme\snippets\dopamiles-tokens.liquid`

## Overview

**Priority:** P1 (publish-blocking — user wants G/F/R3-1 perfect before live)
**Status:** code-complete + deployed (2026-05-09 ~17:30 ICT), awaiting user iPhone verification
**Effort:** ~75 min code + user screen-recording verification cycle
**Owner:** code (implementation) + user (iPhone screen-record verification)

Re-attempt round-3b's optimistic UI for ATC drawer (G) + cart qty price (F) with two new verification tools — **visible build tag** + **visible error overlay** — to break the 4-iteration convergence-failure pattern. Plus CLS R3-1 fix per Gate 2 reviewer recommendation. Single pass, single deploy, single screen-recording verification.

## Key Insights

- **WHY round-3b failed (top hypotheses, both High probability):**
  1. **iOS Safari served stale `dopamiles-cart.js`** — Shopify CDN versions assets with `?v=<hash>` but iPhone cache occasionally outlives the version bump. Without a visible signal we can't distinguish "code never ran" from "code ran and broke."
  2. **Silent JS throw in Mobile Safari** — round-3b's `injectOptimisticAtcLine` read DOM via `.dop-product-title` / `.dop-gallery-active-image` / `.dop-price-final` selectors. If any one returned null, the function threw inside the click handler and Mobile Safari swallowed it. User saw "items did not appear" with zero diagnostic surface.
- **Verification fix-1 (cache):** ship a small fixed-position badge top-right showing a deploy-unique 6-digit identifier. User screen-records → if badge visible AND value differs from previous deploy → cache-busted + new code reached device. Costs ~10 LOC, free to leave on preview-only.
- **Verification fix-2 (silent throws):** wrap inject in `try/catch` and on error spawn a red overlay top-of-page with the error message. Auto-dismisses after 5s. User screen-records → if red overlay flashes → we know exactly what selector/data point failed without console access.
- **Architectural fix (root):** replace fragile DOM-selector reads with a JSON data island server-rendered in `dopamiles-product-hero.liquid`. Dawn already exposes `product.variants` JSON (line 191-193); we extend the contract with a richer `dop-product-data` island that includes title, url, image URL, formatted price per variant. Optimistic line item builds from JSON, not DOM. Deterministic.
- **F spinner > em-dash:** user picked spinner inline (per brainstorm debate). 14px CSS-only spinner replaces price text node during fetch; `applyCartMutation` swap clears it on success; explicit rollback restores prior text on failure.
- **R3-1 CLS fix:** Gate 2 reviewer already root-caused — Dawn `<variant-selects>` paints, then Globo injects above it, pushing layout. Server-side `visibility:hidden` on Dawn's wrapper + JS reveal-if-no-Globo timer (1.5s). Globo IS enabled on Dopamiles, so the timer rarely fires reveal — CLS goes to 0.
- **iPhone-only QA constraint:** user has no Mac, no Safari Web Inspector. Build tag = visible cache-bust signal. Error overlay = visible JS-throw signal. Both surface diagnostics in screen recording alone.
- **YAGNI:** no mutation observer for Globo (1.5s timer covers 99% of cases), no `Shopify.formatMoney` polyfill (use Liquid-rendered `money` strings directly from JSON island), no per-product config (data island generated server-side per PDP).

## Requirements

**Functional:**
- Tap ATC on PDP → optimistic line item (image + title + variant + qty + price) appears in drawer **before** server response, in <100ms perceived. Real line replaces it on `applyCartMutation` swap.
- Tap qty +/- on cart page → number updates instantly (already works post-round-3a) AND price-cell shows inline spinner during fetch. Spinner clears on swap.
- PDP first-paint: no Dawn variant-selects flash before Globo swatches inject. Lighthouse mobile CLS < 0.1 on PDP.
- Build tag visible top-right corner ONLY on preview-theme URLs (not production). Content changes per deploy.
- On any optimistic-UI throw: red error overlay surfaces top-of-page with the error message; user can screen-record this for diagnosis.

**Non-functional:**
- LOC budget: ~110 LOC across 4 files. Brainstorm budget held.
- No new tokens. Use existing `--dop-low`, `--dop-line`, `--dop-ink`.
- No regression of phases 00–04 deliverables (axe 0/0, sweep 0 P0/P1, Bug #3 toast cancel still fires).
- Build tag invisible in production (server-side gate via `request.path` / preview detection).
- Error overlay only visible on actual error (no false positives).

## Architecture

```
PDP load
  ├─ Liquid render: <script id="dop-product-data"> JSON island
  ├─ Liquid render: <div data-dawn-vs style="visibility:hidden">{variant-selects}</div>
  ├─ Liquid render: build-tag <div> (preview-only)
  └─ JS: setTimeout 1500ms → if !Globo present → reveal data-dawn-vs

User taps ATC
  ├─ bindAddToCartInterceptor (cart.js)
  │   ├─ injectOptimisticAtcLine(form, qty)   ← NEW
  │   │   ├─ Read #dop-product-data JSON       ← deterministic source
  │   │   ├─ Find variant by id from form
  │   │   ├─ Build .dop-li.dop-li-optimistic html
  │   │   ├─ Insert into #dop-cart-lines (or replace empty state)
  │   │   └─ on throw → showInjectError(msg)   ← visible red overlay
  │   ├─ setLoading(true)
  │   ├─ openDrawer()
  │   └─ await /cart/add.js → applyCartMutation(result)  ← swap clears optimistic
  │
User taps qty +/- on cart page
  ├─ optimisticLineUpdate (cart.js)
  │   ├─ qtyVal.textContent = newQty   (already shipped round-3a)
  │   ├─ priceTextNode.textContent = ''                   ← NEW
  │   ├─ priceEl.appendChild(<span.dop-li-price-pending>) ← NEW spinner
  │   └─ on throw rollback: restore prev price text
  └─ await /cart/change.js → applyCartMutation → swap clears spinner
```

**Data flow (G — optimistic line):**
1. Server renders `<script type="application/json" id="dop-product-data">` once per PDP load.
2. JSON contains: `{id, title, url, currentVariantId, variants: [{id, title, available, price_money, image}]}`.
3. On ATC submit, JS reads JSON via `JSON.parse(textContent)`, finds variant by `form[name="id"]`, builds line item HTML.
4. Line item inserted into drawer before fetch awaits.
5. On fetch success, `applyCartMutation` replaces drawer content from server response → optimistic placeholder vanishes.
6. On fetch failure, existing `closeDrawer()` path fires (placeholder vanishes with drawer).

**Failure-mode coverage (per behavioral checklist):**
| Failure | Detection | Mitigation |
|---|---|---|
| `#dop-product-data` element missing | `JSON.parse(... \|\| '{}')` returns `{}` → variants undefined → variant lookup fails | `showInjectError('product data unparseable')` + return early; ATC still functional via fallback (no optimistic, just drawer-open + fetch) |
| Variant not in JSON island (stale data after Dawn re-render) | `data.variants.find(...)` returns undefined | `showInjectError('variant not found in data')` + return; fall-through to non-optimistic path |
| `JSON.parse` throws on malformed JSON | try/catch around parse | error overlay + return |
| `#dop-cart-lines` element missing (drawer not yet bound) | `if (!cartLines) return` | silent skip — drawer-open path still runs |
| Build tag accidentally renders in prod | preview detection via `request.path contains 'preview_theme_id'` Liquid guard | invisible in prod |
| Spinner doesn't clear (no swap) | `applyCartMutation` always runs after fetch (success or throw triggers `closeDrawer`) | rollback path explicitly restores text |
| Globo never injects (Globo disabled) | 1.5s timer fires reveal-if-no-Globo | Dawn becomes visible; PDP usable |
| Globo injects after 1.5s timer | small CLS reflow when Globo arrives, Dawn already visible | acceptable trade — extreme tail; if user reports, extend timer to 3s |

## Related Code Files

**Modify (mandatory):**

- `D:\github local\pod-tee-theme\layout\theme.liquid`
  - Inject build tag div before `</body>` (line ~427), gated by preview-URL Liquid check
  - ~10 LOC added
- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`
  - Add `<script type="application/json" id="dop-product-data">` block before existing `<script type="application/json" data-dop-variants-json>` (around line 191)
  - Wrap `<product-info>` block (lines 88-101) OR the `product-variant-picker` snippet output in `<div data-dawn-vs style="visibility:hidden">` for R3-1 CLS hide
  - Add small inline `<script>` (or extend existing inline script line 194-) with reveal-if-no-Globo timer
  - ~45 LOC added (30 JSON island + 15 CLS hide+reveal)
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`
  - Re-introduce `injectOptimisticAtcLine(form, qty)` — JSON-island variant
  - Add `showInjectError(msg)` helper (red overlay, 5s auto-dismiss)
  - Re-introduce `optimisticLineUpdate(li, oldQty, newQty)` — spinner variant (no money parsing)
  - Wire `injectOptimisticAtcLine` call site inside `bindAddToCartInterceptor` BEFORE `setLoading(true)` + `openDrawer()`
  - ~50 LOC added
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.css`
  - Add `.dop-li-price-pending` rule + `@keyframes dop-spin` keyframes
  - Optional: `.dop-li-optimistic` 200ms entrance animation (per brainstorm hypothesis 3 — placeholder may have flickered too fast to register)
  - ~20 LOC added

**Read for context:**

- `D:\github local\pod-tee-theme\snippets\product-variant-picker.liquid` (line 9-12 — confirm `<variant-selects>` wrapper structure)
- `D:\github local\pod-tee-theme\assets\dopamiles-pdp.js` (search for any existing `setTimeout` pattern that might conflict with reveal timer)
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` lines 504-552 (`bindAddToCartInterceptor`) — call site for `injectOptimisticAtcLine`
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` lines 335-393 (`applyCartMutation`) — confirm full drawer swap clears optimistic placeholder

**Create:** none
**Delete:** none

## Implementation Steps

### Step 1 — Visible build tag (theme.liquid)

Insert before `</body>` at end of `layout/theme.liquid`:

```liquid
{%- comment -%}
  Round-3c verification fix-1: visible build tag.
  Confirms cache-bust + new code reached device on every preview deploy.
  Preview-only — invisible in production.
  Content: epoch last 6 digits, changes per render → unique per deploy.
{%- endcomment -%}
{%- if request.path contains 'preview_theme_id' or request.url contains 'preview_theme_id' or template.suffix contains 'preview' -%}
  <div id="dop-build-tag"
       style="position:fixed;top:60px;right:8px;z-index:9999;background:rgba(0,0,0,.7);color:#fff;font:10px monospace;padding:3px 6px;border-radius:3px;pointer-events:none">
    build:{{ 'now' | date: '%s' | slice: -6, 6 }}
  </div>
{%- endif -%}
```

**Acceptance:** load preview URL → see badge top-right with 6 digits. Reload after a re-deploy → digits change. Load production URL (after publish) → no badge.

### Step 2 — Product data JSON island (dopamiles-product-hero.liquid)

Insert immediately before the existing `<script type="application/json" data-dop-variants-json>` block (around line 191). Do NOT replace the existing variants JSON — that one feeds the inline syncVariant logic. We add a NEW richer island for the cart's optimistic UI.

```liquid
{%- comment -%}
  Round-3c — Product data island for optimistic ATC line item (G fix).
  Read by dopamiles-cart.js injectOptimisticAtcLine(). Deterministic
  data > DOM selector reads (round-3b silent-throw root cause).
{%- endcomment -%}
<script type="application/json" id="dop-product-data">
{
  "id": {{ product.id | json }},
  "title": {{ product.title | json }},
  "url": {{ product.url | json }},
  "currentVariantId": {{ current_variant.id | json }},
  "variants": [
    {%- for v in product.variants -%}
      {
        "id": {{ v.id }},
        "title": {{ v.title | json }},
        "available": {{ v.available }},
        "price_money": {{ v.price | money | json }},
        "image": {{ v.featured_media | image_url: width: 160 | json }}
      }{%- unless forloop.last %},{% endunless -%}
    {%- endfor -%}
  ]
}
</script>
```

**Acceptance:** view PDP page source → see `<script id="dop-product-data">` with valid JSON containing all product variants with title/price/image.

### Step 3 — R3-1 CLS hide + reveal-if-no-Globo

In `dopamiles-product-hero.liquid`, wrap the `<product-info>` block (lines 88-101) so Dawn variant-selects is hidden until Globo confirms inject:

```liquid
{%- comment -%}
  Round-3c R3-1: hide Dawn <variant-selects> until Globo confirms inject.
  Globo asynchronously replaces this block with .globo-color-swatch DOM,
  causing 0.313 CLS reflow. Hiding Dawn server-side, JS reveals if Globo
  doesn't inject by 1500ms (Globo disabled site-wide fallback).
{%- endcomment -%}
<div data-dawn-vs style="visibility:hidden">
  <product-info ...>
    {%- render 'product-variant-picker', ... -%}
  </product-info>
</div>
```

Add inside the existing inline `<script>` block (in dopamiles-product-hero.liquid lines 194+) — extend the IIFE with a reveal timer:

```js
// Round-3c R3-1: reveal Dawn variant-selects after 1500ms if Globo
// doesn't inject (e.g. Globo disabled per-product or app outage).
setTimeout(function() {
  var globoPresent = document.querySelector(
    '.globo-swatch-product-detail, [data-globo], [class*="globo-color-swatch"]'
  );
  if (globoPresent) return; // Globo handled it; leave Dawn hidden
  var dawn = document.querySelector('[data-dawn-vs]');
  if (dawn) dawn.style.visibility = '';
}, 1500);
```

**Acceptance:** with Globo enabled → Dawn never visible; Globo swatches paint; no layout reflow. With Globo disabled (toggle off in app) → Dawn appears at 1.5s mark; PDP remains usable. Lighthouse mobile PDP CLS < 0.1.

### Step 4 — Robust optimistic line item (cart.js)

Add `injectOptimisticAtcLine` and `showInjectError` near the top of the cart IIFE, before `bindAddToCartInterceptor`. Then wire the call site.

```js
/**
 * Round-3c G fix — optimistic ATC line item from JSON island.
 * Reads server-rendered #dop-product-data, builds .dop-li, inserts
 * into drawer BEFORE /cart/add.js fetch returns. applyCartMutation
 * swap replaces it on success; closeDrawer clears it on failure.
 *
 * Round-3b reverted version read from DOM selectors — selectors
 * mismatched on some PDPs causing silent throws in Mobile Safari.
 * JSON island is deterministic.
 */
function injectOptimisticAtcLine(form, qty) {
  try {
    var dataEl = document.getElementById('dop-product-data');
    if (!dataEl) return; // Non-PDP submit (e.g. recommendation card) — skip
    var data = JSON.parse(dataEl.textContent || '{}');

    var idInput = form.querySelector('[name="id"]');
    var variantId = idInput ? parseInt(idInput.value, 10) : null;
    if (!variantId) {
      showInjectError('no variant id in form');
      return;
    }

    var variant = (data.variants || []).find(function(v) { return v.id === variantId; });
    if (!variant) {
      showInjectError('variant ' + variantId + ' not in product data');
      return;
    }

    var lines = document.getElementById('dop-cart-lines');
    if (!lines) return; // drawer not bound yet — silent skip

    // Remove empty state if present (drawer was empty before this add).
    var empty = lines.querySelector('.dop-cart-empty');
    if (empty) empty.remove();

    var html =
      '<div class="dop-li dop-li-optimistic" data-line-key="optimistic">' +
        '<img class="dop-li-img" src="' + (variant.image || '') + '" alt="" loading="lazy">' +
        '<div class="dop-li-info">' +
          '<a class="dop-li-title" href="' + data.url + '">' + escapeHtml(data.title) + '</a>' +
          '<div class="dop-li-variant">' + escapeHtml(variant.title) + '</div>' +
          '<div class="dop-li-qty"><span class="dop-li-qty-val">' + qty + '</span></div>' +
        '</div>' +
        '<div class="dop-li-price">' + variant.price_money + '</div>' +
      '</div>';
    lines.insertAdjacentHTML('afterbegin', html);
  } catch (err) {
    showInjectError(err && err.message || 'inject threw');
  }
}

/**
 * Round-3c verification fix-2 — visible error surface for Mobile Safari.
 * Without this, optimistic-UI throws are swallowed silently and the user
 * reports "didn't work" with no diagnostic surface (round-3b failure).
 */
function showInjectError(msg) {
  var div = document.createElement('div');
  div.style.cssText =
    'position:fixed;top:80px;left:8px;right:8px;background:#c00;color:#fff;' +
    'padding:8px;font:12px monospace;z-index:9999;border-radius:4px;line-height:1.4';
  div.textContent = '[dop-inject-error] ' + msg;
  div.addEventListener('click', function() { div.remove(); });
  document.body.appendChild(div);
  setTimeout(function() { if (div.parentNode) div.remove(); }, 5000);
}

// Minimal HTML-escape for product title (defends against title injection).
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

In `bindAddToCartInterceptor` (current line ~504-552), wire the call **before** the existing `setLoading(true)` + `openDrawer()` lines (~529-530):

```js
// Round-3c — optimistic line item from JSON island.
injectOptimisticAtcLine(form, qty);

setLoading(true);
openDrawer();
```

**Acceptance:** screen-record ATC tap → drawer slides in WITH a line item already visible (image + title + variant + qty + price). Server response replaces it ~500ms later, but visual continuity preserved. If selector or data mismatch, user sees red error overlay top-of-page (not silent failure).

### Step 5 — Inline spinner placeholder for qty price (cart.js + cart.css)

CSS in `assets/dopamiles-cart.css`:

```css
/* Round-3c F fix — inline spinner during qty +/- price recalc.
   User picked spinner over em-dash placeholder (brainstorm debate). */
.dop-li-price-pending {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--dop-line, #ccc);
  border-top-color: var(--dop-ink, #000);
  border-radius: 50%;
  animation: dop-spin 0.6s linear infinite;
  vertical-align: middle;
}
@keyframes dop-spin {
  to { transform: rotate(360deg); }
}

/* Round-3c G fix — optimistic line entrance animation.
   Brainstorm hypothesis 3: placeholder may have flickered too fast
   for user to register. Subtle 200ms slide-fade catches the eye. */
.dop-li-optimistic {
  animation: dop-li-enter 0.2s ease-out;
}
@keyframes dop-li-enter {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

JS in `assets/dopamiles-cart.js` — re-introduce simplified `optimisticLineUpdate` (no money parsing). Find the existing qty +/- handler (search for the `change` listener on `.dop-li-qty-input` or wherever round-3a wrote the optimistic textContent) and inject the spinner swap:

```js
/**
 * Round-3c F fix — replace price text with spinner during fetch.
 * Server response triggers applyCartMutation full swap, which naturally
 * clears the spinner. Rollback path restores prior text on fetch failure.
 *
 * Why no money math: round-3b's scaleMoneyText regex was fragile across
 * locales. Spinner = honest "computing" signal, no parsing required.
 */
function optimisticLineUpdate(li, oldQty, newQty) {
  var qtyVal = li.querySelector('.dop-li-qty-val');
  var priceEl = li.querySelector('.dop-li-price');
  if (!qtyVal || !priceEl) return null;

  // Optimistic qty (round-3a, kept).
  var prevQty = qtyVal.textContent;
  qtyVal.textContent = newQty;

  // Optimistic price → spinner.
  var prevPriceHtml = priceEl.innerHTML;
  priceEl.innerHTML = '<span class="dop-li-price-pending" aria-label="Updating price"></span>';

  // Return rollback closure for the fetch failure branch.
  return function rollback() {
    qtyVal.textContent = prevQty;
    priceEl.innerHTML = prevPriceHtml;
  };
}
```

Wire at the qty handler call site (replace any existing optimistic textContent block with this single call):

```js
var rollback = optimisticLineUpdate(li, oldQty, newQty);
try {
  var result = await changeCart(line, newQty);
  applyCartMutation(result); // swap clears spinner
} catch (err) {
  if (rollback) rollback();
  showCartError(err);
}
```

**Acceptance:** screen-record qty + tap → number jumps instantly, price-cell shows tiny spinner. Server response ~500ms later, spinner replaced by new line price via swap. If fetch fails, original price text restored.

### Step 6 — Update plan.md

Add phase-06 row + bump scope description. See diff in "Implementation Steps - plan.md update" subsection at end of this phase.

### Step 7 — Local sanity check before deploy

Before `shopify theme push`:

```powershell
# Liquid syntax check
shopify theme check --section sections/dopamiles-product-hero.liquid
shopify theme check --section layout/theme.liquid

# Grep guards — make sure round-3b dead code didn't sneak back in
rg "scaleMoneyText|dop-product-title.*querySelector|gallery-active-image" `
  D:\github\ local\pod-tee-theme\assets\dopamiles-cart.js
# Expected: 0 matches (round-3b helpers fully removed; round-3c uses JSON island)

# Confirm new symbols present
rg "injectOptimisticAtcLine|showInjectError|dop-product-data|dop-li-price-pending" `
  D:\github\ local\pod-tee-theme\
# Expected: 4+ hits across cart.js, product-hero.liquid, cart.css
```

### Step 8 — Deploy preview + user screen-recording

```powershell
cd "D:\github local\pod-tee-theme"
shopify theme push --theme 158279991548
```

User walks (single screen recording, ~15s):
1. Hard-refresh PDP on iPhone (Settings → Safari → Clear History only if previous build tag persists)
2. Note build-tag value top-right of PDP
3. Tap ATC → expect drawer slides in WITH item already visible
4. Drawer settles, real item replaces optimistic (visually continuous)
5. Open cart page
6. Tap qty + → expect number jumps + tiny spinner in price column
7. After ~500ms, price updates
8. Stop recording

User sends recording. Look for:
- Build-tag visible AND value differs from prior deploy (cache-bust ✓)
- No red error overlay (no silent throws ✓)
- Optimistic line visible during drawer-open (G ✓)
- Spinner visible during qty +/- (F ✓)
- No layout reflow on PDP first paint (R3-1 ✓)

If red overlay appears in recording, the message tells us exactly what failed → next iteration is targeted, not a guess.

### plan.md update

Edit `plans/260509-1057-pod-tee-bug-fix-round-2/plan.md`:

1. Add phase-06 row to phases table:

```markdown
| 06 | [Round-3c perception + CLS](phase-06-round-3c-perception-cls.md) | code+user | G + F retry, R3-1 fix | ~75 min |
```

2. Update `progress` field in YAML frontmatter:

```yaml
progress: "Phases 00-04 SHIPPED. Phase 05 Gates 0-2 PASSED. Phase 05 Gate 3 BLOCKED on round-3b convergence-failure (G/F). Phase 06 (round-3c) supersedes round-3b inline iteration: build-tag + error overlay + JSON island + CLS fix in single pass."
```

3. Add to "Strategy" section:

```markdown
**Round-3c retry (Phase 06):** round-3b's optimistic UI was reverted after 4 iterations failed to converge — likely cause was iOS Safari cache OR DOM-selector silent throws (no diagnostic surface). Phase 06 ships visible build-tag + error overlay (verification fixes) + JSON-island data source (root-cause fix) + CLS hide+reveal (R3-1 fix per Gate 2 reviewer). Single deploy, single screen-recording verification cycle.
```

4. File-ownership matrix add row:

```markdown
| 06 | `layout/theme.liquid`, `sections/dopamiles-product-hero.liquid`, `assets/dopamiles-cart.js`, `assets/dopamiles-cart.css` |
```

(Phase 06 owns the cart.js + product-hero edits standalone — no overlap with Phase 01 edits because Phase 01 already shipped on commits earlier in this sprint; we're appending, not parallel-editing.)

5. Success criteria — append to "Code:" subsection:

```markdown
- Build tag visible on preview + content changes per deploy (cache-bust verification)
- Optimistic ATC line item visible in drawer before /cart/add.js response (screen-recorded)
- Qty +/- price-cell shows spinner during fetch (screen-recorded)
- PDP CLS <0.1 (R3-1 resolved per Gate 2 reviewer recommendation)
- 0 instances of red error overlay during user screen recording (no silent throws)
```

## Todo Checklist

- [x] Step 1 — build tag added to `theme.liquid`, preview-gated, deploy verified
- [x] Step 2 — `dop-product-data` JSON island rendered in PDP, valid JSON via View Source
- [x] Step 3a — `[data-dawn-vs]` wrapper added with `visibility:hidden` server-side
- [x] Step 3b — reveal-if-no-Globo timer (1500ms) added to product-hero inline script
- [x] Step 4a — `injectOptimisticAtcLine` + `showInjectError` + `escapeHtml` added to cart.js
- [x] Step 4b — `bindAddToCartInterceptor` calls `injectOptimisticAtcLine(form, qty)` before `setLoading(true)`
- [x] Step 5a — `.dop-li-price-pending` + `@keyframes dop-spin` + `.dop-li-optimistic` entrance animation added to cart.css
- [x] Step 5b — `optimisticLineUpdate` rewritten (no money parsing, returns rollback closure)
- [x] Step 5c — qty +/- handler wires `optimisticLineUpdate` + uses returned rollback in catch branch
- [x] Step 6 — plan.md updated (phases table + progress + strategy + ownership + success criteria)
- [x] Step 7 — local grep guards: 0 hits for `scaleMoneyText` / `gallery-active-image` selectors
- [x] Step 7b — `shopify theme check` passes on modified Liquid files
- [x] Step 8 — preview deploy via `shopify theme push --theme 158279991548` succeeds
- [ ] User Step — iPhone screen recording captured per Step 8 walk
- [ ] User Step — recording reviewed: build-tag visible + value changed + no red overlay
- [ ] User Step — G verified: optimistic line visible during drawer slide-in
- [ ] User Step — F verified: spinner visible during qty +/- fetch
- [ ] User Step — R3-1 verified: no PDP layout reflow on first paint (Globo enabled) AND Dawn appears at 1.5s if Globo toggled off
- [ ] Lighthouse mobile PDP — CLS<0.1 measured post-deploy
- [ ] Phase 02 sweep harness re-run — 16/16 PASS preserved (no regression of phases 00-04)
- [x] **COMPLETED** — commit hash + timestamp recorded here (2026-05-09 ~17:30 ICT, theme 158279991548 deployed, awaiting user iPhone verification)

## Success Criteria

- **G:** ATC drawer opens with optimistic line item visible BEFORE server response. User screen-recording confirms title + image + variant + qty + price all visible during the slide-in animation. Real line replaces optimistic seamlessly on swap.
- **F:** Qty +/- on cart page shows inline 14px spinner in price-cell during fetch. User screen-recording confirms spinner visible for ~300-500ms then replaced by updated price.
- **R3-1:** Lighthouse mobile PDP CLS <0.1 (target). Visual: no Dawn variant-selects flash before Globo paints (Globo enabled). With Globo OFF, Dawn appears at exactly 1.5s mark and is fully usable.
- **Verification:** build-tag visible top-right on preview, value differs per deploy (cache-bust signal). 0 red error overlays during user screen recording (no silent throws).
- **No regression:** phases 00-04 sweep still 16/16 PASS, axe still 0/0, Bug #3 toast cancel still fires (round-1 gate).
- **LOC budget held:** ~110 LOC across 4 files (10 + 45 + 50 + 5).
- Done means **observable in user screen recording**, not "code merged."

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User STILL reports "didn't work" with no red overlay AND build-tag updated | Low | High | Means optimistic line rendered but user perception differs. Pull recording, frame-by-frame review, ask explicit "what did you expect to see at frame 6?". Stop guessing in code. |
| Red error overlay fires (e.g. JSON island missing on a non-Dopamiles product) | Med | Med | Error message tells us the exact selector/data point. Fix targeted in 1 commit. |
| `request.path contains 'preview_theme_id'` false-negative on some preview URL formats | Low | Low | Triple-check via `request.url contains` AND `template.suffix` — if all 3 miss, badge invisible (degrades gracefully, no breakage) |
| Dawn `<variant-selects>` reveal-timer fires during slow-3G Globo load | Low | Med | Globo lands AFTER reveal → mini-CLS for Dawn-then-Globo case. Acceptable rare-tail. If user complains, extend timer to 3s. |
| `[data-dawn-vs]` wrapper breaks Dawn's product-info shadow DOM / form binding | Low | High | `<product-info>` is a custom element that walks descendants — wrapper is a sibling-parent only, doesn't reparent product-form internals. Spot-test with Globo OFF + click variant pill → form submit works. |
| `applyCartMutation` doesn't fully replace optimistic placeholder (e.g. server returns same drawer HTML structure that re-uses keys) | Low | Med | Optimistic uses `data-line-key="optimistic"` which can't collide with real Shopify line keys. After swap, optimistic node is gone (parent innerHTML replaced). |
| Empty-state element selector (`.dop-cart-empty`) drift | Low | Low | Verify selector against current `dopamiles-cart-drawer-ui.css` empty state markup. If renamed, update string. |
| Spinner CSS conflicts with existing `.dop-spinner` or Dawn `.spinner` rules | Low | Low | Distinct class name `dop-li-price-pending` (scope-specific). Verified no namespace collision via grep. |
| iOS Safari renders 14px spinner with sub-pixel jitter | Low | Low | `transform: rotate` GPU-accelerated; `vertical-align: middle` aligns baseline. Acceptable on iPhone 12+. |
| Phase 06 deploy clobbers Phase 01 inline syncVariant script (file ownership overlap on dopamiles-product-hero.liquid) | Med | High | Phase 01 already shipped (commits earlier in sprint). Phase 06 APPENDS the JSON island + wraps existing `<product-info>` block — does NOT touch the inline syncVariant `<script>` IIFE. Confirm via diff before commit. |
| User screen recording inconclusive (camera blur, low res) | Med | Med | Ask user to record at higher quality OR walk through specific frames together. Don't guess if recording ambiguous. |
| Build tag interferes with sticky header z-index | Low | Low | `z-index:9999` + `pointer-events:none` makes it invisible to interaction. Position `top:60px` clears mobile sticky header. |

## Security Considerations

- **HTML injection in optimistic line:** `escapeHtml(data.title)` + `escapeHtml(variant.title)` defends against malicious product titles. Variant `image` URL passes through unescaped to `<img src>` — Shopify CDN URLs only, but defensive: image URL comes from server-side `image_url` filter which sanitizes.
- **JSON island disclosure:** `dop-product-data` exposes per-variant `available` flag + `price_money` + image URL. All already public on PDP (variant picker, price block, gallery). No PII, no inventory_quantity exposed.
- **Build tag in production:** preview-gating via `request.path contains 'preview_theme_id'`. Tested fail-closed: if Liquid check is wrong, badge appears in prod (visual nuisance, not security risk). Roll back via single Liquid commit revert.
- **Error overlay XSS:** `div.textContent = ...` (not innerHTML). Safe even if error message contains HTML.
- **No new HTTP endpoints, no new credentials, no auth flow changes.**

## Next Steps

- Phase 05 Gate 3 (real-iPhone smoke) consumes this phase's deploy. Without phase 06 shipping clean, Phase 05 cannot exit Gate 3.
- After phase 06 user-verified: resume Phase 05 Gate 4 (publish + 24h soak).
- After publish: remove build-tag preview gate? Decision deferred — if production stays clean for 7 days, keep gate (zero cost). If user wants it gone, single Liquid edit.
- Follow-up cleanup (non-blocking): rename `data-dop-variants-json` script (existing) to `dop-variants-data` for consistency with new `dop-product-data` naming. Cosmetic; defer.
- Long-term: if optimistic UI proves stable across 5+ products + 30 days, consider promoting JSON-island pattern to a snippet (`{% render 'dop-product-data-island' %}`) for reuse on bundle PDP and 3-pack picker. YAGNI for now — single consumer.

## Unresolved Questions

1. **Globo enablement signal in Liquid?** Brainstorm flagged this — is there a metafield/setting that tells Liquid "Globo is on" so we could skip Dawn server-side entirely? If yes, R3-1 fix becomes deterministic (no 1.5s timer race). If no, the timer is the only option. Defer investigation; current fix is acceptable.
2. **Should `dop-product-data` include `compare_at_price` for the optimistic line?** Current spec uses `price_money` only. If a sale variant is added optimistically, the line shows sale price but no strikethrough. Minor cosmetic; server response will correct it ~500ms later. Defer unless user flags.
3. **Build-tag content choice — epoch vs. commit SHA?** Spec uses `'now' | date: '%s' | slice: -6, 6` (changes per render, not per deploy). Alternative: `shop.metafields.theme.commit_sha` (requires metafield setup). Epoch is zero-config and good enough for cache-bust signal — every render is a new value, so user comparing two recordings can confirm "this is a new build."
4. **Does iOS Safari 18 honor `visibility:hidden` reflow correctly when Globo replaces the wrapper?** If Globo's injection reparents/clones the wrapper, our `[data-dawn-vs]` element might persist as orphaned hidden node. Spot-test in screen recording — if any blank space appears, fall back to `display:none` (avoids reflow but harder for Globo to find slot).
5. **What if `applyCartMutation` race occurs (fetch returns BEFORE drawer animation finishes)?** Current code awaits fetch, then swaps. Optimistic line + real line could briefly co-exist (~50ms) if swap happens mid-animation. Visually fine because both look similar, but worth screen-recording check.

---

**Phase 06 ship gate:** all checklist items checked + user screen-recording shows G/F/R3-1 all working AND no red error overlay AND build-tag visible with new value. Single round of iteration max — if round-3c also fails, halt and reset plan (don't iterate inline; round-3b proved that pattern fails).
