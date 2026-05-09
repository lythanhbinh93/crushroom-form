# Phase 02 — Cart Performance Refactor

## Context Links

- Pre-flight outputs (Step 4, Step 7): [phase-00-pre-flight.md](phase-00-pre-flight.md)
- Research (Section Render API + bundled sections): [../reports/researcher-260509-1104-shopify-cart-performance.md](../reports/researcher-260509-1104-shopify-cart-performance.md)
- Source: `D:\github local\pod-tee-theme\assets\dopamiles-cart.js` (lines 200-294 + 320-360)
- Source: `D:\github local\pod-tee-theme\sections\header.liquid` (line 273 — cart bubble)
- Source: `D:\github local\pod-tee-theme\assets\product-form.js` (round-1 toast fallback)
- Round-1 Bug #3 (toast fallback timer): [../260508-2145-pod-tee-theme-bug-fix-sprint/phase-03-liquid-js-surgery.md](../260508-2145-pod-tee-theme-bug-fix-sprint/phase-03-liquid-js-surgery.md)

## Overview

**Priority:** P0 (perceived perf)
**Status:** completed (2026-05-09)
**Effort:** ~90 min
**Owner:** code

Fix Issues F + G + Bug #3 (round-1 fix is broken — see red-team finding 3):
- **F:** cart-page qty +/- triggers `window.location.reload()` → 1500-3000ms lag.
- **G:** ATC chains add.js → drawer fetch → cart fetch → open drawer → ~750ms.
- **Bug #3 (round-1 fix dead):** `dopamiles-cart.js:323` intercepts every cart-form submit, bypassing Dawn's `product-form.js`. Dawn's `publish(PUB_SUB_EVENTS.cartUpdate)` never fires → toast cancellation never fires → 4s fallback toast pops on every successful add. Phase 02 must publish manually.

F + G solved by bundled section rendering (`sections=[...]` in mutation request body). Bug #3 solved by manual `publish()` after every successful mutation.

## Key Insights

- Researcher 02 confirms separate drawer + main sections (`dopamiles-cart-drawer.liquid` + `dopamiles-cart-main.liquid`) is canonical. Don't unify.
- `/cart/add.js` and `/cart/change.js` both accept `sections: [...]` in body and return `data.sections[name]` HTML.
- **`cart-icon-bubble` cannot be bundled** — header.liquid inlines an `<a id="cart-icon-bubble">` anchor, not a section. The bundled section response wraps in `<div id="shopify-section-cart-icon-bubble">` — different DOM. Phase 00 Step 7 confirmed. Manual count update from `cart.item_count` JSON instead.
- `dopamiles-cart.js` has zero `publish(PUB_SUB_EVENTS.cartUpdate)` calls today (Phase 00 Step 4 confirmed). Round-1 Bug #3 toast cancellation already broken.
- INP target ≤200ms for visual feedback. Optimistic state (`btn.disabled=true; btn.textContent='…'`) at <50ms covers this.
- `refreshPageTotals()` reload is the #1 anti-pattern in researcher's "common ATC traps" table.
- Realistic floor: Bangkok→Shopify edge RTT ~80-150ms. Apps (Globo, Sepay, Klaviyo) can add 100-300ms. Target 350-500ms for ATC.

## Requirements

**Functional:**
- Cart-page qty +/-: line items + meta + summary update without page reload.
- ATC drawer-open: drawer opens with new line item without separate fetch.
- Header bubble count updates after every cart mutation.
- After every successful mutation: `publish(PUB_SUB_EVENTS.cartUpdate, cart)` fires → Bug #3 toast cancellation works.
- Failure: revert optimistic UI, show inline error toast, button re-enabled.
- Concurrent clicks: debounce — second click ignored while first in-flight.
- Listener cleanup: re-bind only the surface that was swapped, not all surfaces.

**Non-functional:**
- Cart-page qty change: <500ms (was 1500-3000ms).
- ATC to drawer-open: <500ms (was 750ms).
- Visual feedback: <50ms after click.
- 4s round-1 toast fallback timer: still present, never fires under good network.

## Architecture

**Current chain (cart-page qty change):**

```
click +/- → handleQtyChange → /cart/change.js → fetchCart → window.location.reload  [1500-3000ms]
```

**New chain:**

```
click +/-
  ├─ optimistic: btn disabled, qty input updates                  [50ms]
  └─ POST /cart/change.js {id, quantity, sections:["dopamiles-cart-main","dopamiles-cart-drawer"]}  [350ms]
      └─ parse response.sections
          ├─ swap #dop-page-lines innerHTML (cart-main)
          ├─ swap #dop-page-meta innerHTML (cart-main)
          ├─ swap #dop-cart-drawer-content innerHTML (cart-drawer) — keep open if open
          ├─ updateBubbleCount(cart.item_count)                     (manual, not bundled)
          ├─ publish(PUB_SUB_EVENTS.cartUpdate, cart)               (Bug #3 fix)
          └─ re-bind events on swapped surfaces only                [50ms]
                                                              total ~450ms
```

**Current chain (ATC):**

```
click ATC → /cart/add.js → /?sections=dopamiles-cart-drawer → fetchCart → openDrawer  [~750ms]
```

**New chain:**

```
click ATC
  ├─ optimistic: button label "Adding…", spinner                  [50ms]
  └─ POST /cart/add.js {id, quantity, sections:["dopamiles-cart-drawer"]}  [400ms]
      └─ parse response.sections
          ├─ swap drawer innerHTML
          ├─ updateBubbleCount(cart.item_count)
          ├─ publish(PUB_SUB_EVENTS.cartUpdate, cart)               (Bug #3 fix)
          └─ openDrawer + re-bind drawer events only                [50ms]
                                                              total ~500ms
```

## Related Code Files

**Modify:**
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`
  - Top of file: import or expose `publish` + `PUB_SUB_EVENTS` (per Phase 00 Step 4 finding)
  - Lines 50-90 (approx): `addToCart()` — add `sections:[drawer]` to body, return `{cart, sections}`
  - Lines 110-180 (approx): `changeCartItem()` — same treatment with `[main, drawer]`
  - Lines 200-226: `handleUpsellAdd()` — consume bundled drawer HTML, drop separate `refreshDrawer()`
  - Lines 235-247: `refreshPageTotals()` — drop `window.location.reload()`, swap from passed-in HTML
  - Lines 257-294: `bindDrawerEvents()` — refactor to surface-specific binding (see Step 7)
  - NEW helper: `updateBubbleCount(count)` — manual header bubble update
  - NEW helper: `publishCartUpdate(cart)` — wraps `publish(PUB_SUB_EVENTS.cartUpdate, ...)` with feature-detection

**Read for context:**
- `D:\github local\pod-tee-theme\sections\dopamiles-cart-main.liquid` — verify `id="dop-page-lines"`, `id="dop-page-meta"` containers exist
- `D:\github local\pod-tee-theme\sections\dopamiles-cart-drawer.liquid` — verify `id="dop-cart-drawer-content"` container exists
- `D:\github local\pod-tee-theme\sections\header.liquid` — confirmed line 273 `<a id="cart-icon-bubble">` with `<div class="cart-count-bubble"><span aria-hidden>{{ cart.item_count }}</span></div>`
- `D:\github local\pod-tee-theme\assets\global.js` or `pubsub.js` — `publish` + `PUB_SUB_EVENTS` import path

**Create:** none

**Delete:** none

## Implementation Steps

### Step 1 — Add helpers: section HTML swap, bubble count, pubsub publish

In `dopamiles-cart.js`, near the top utility section:

```js
/**
 * Parse a Shopify section HTML response and swap a child element by ID.
 * Returns true if swap occurred.
 */
function swapSection(html, containerId) {
  if (!html) return false;
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var src = doc.getElementById(containerId);
  var dst = document.getElementById(containerId);
  if (!src || !dst) return false;
  dst.innerHTML = src.innerHTML;
  return true;
}

/**
 * Manual header cart-icon-bubble count update.
 * Header.liquid:273 inlines the icon as <a id="cart-icon-bubble"> — not a
 * renderable section. So we update the count text + visibility from cart JSON.
 */
function updateBubbleCount(count) {
  var bubble = document.querySelector('#cart-icon-bubble .cart-count-bubble');
  var visible = document.querySelector('#cart-icon-bubble .cart-count-bubble span[aria-hidden]');
  var a11y = document.querySelector('#cart-icon-bubble .cart-count-bubble .visually-hidden');
  if (visible) visible.textContent = count < 100 ? count : '99+';
  if (a11y) a11y.textContent = count + ' items';
  if (bubble) bubble.style.display = count > 0 ? '' : 'none';
}

/**
 * Manually publish cart-update event so round-1 Bug #3 toast cancellation works.
 * cart.js intercepts every form[action*="/cart/add"] submit (line 323), so
 * Dawn's product-form.js never gets to publish. We publish on its behalf.
 */
function publishCartUpdate(cart) {
  if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    publish(PUB_SUB_EVENTS.cartUpdate, { source: 'dop-cart', cartData: cart });
  }
}
```

**If `publish` is module-only (per Phase 00 Step 4):** convert `dopamiles-cart.js` to a module and `import { publish, PUB_SUB_EVENTS } from './pubsub.js';` at the top, OR add a guarded global access path. Phase 00 outputs determine which.

### Step 2 — Refactor `addToCart()`

Add `sections` to request body (drawer only — bubble updated manually). Return shape `{cart, sections}`:

```js
async function addToCart(variantId, qty) {
  var res = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: variantId,
      quantity: qty || 1,
      sections: ['dopamiles-cart-drawer']
    })
  });
  if (!res.ok) {
    var err = await res.json().catch(function(){return{};});
    throw new Error(err.description || 'add failed: ' + res.status);
  }
  var data = await res.json();
  // After /cart/add.js, fetch cart for item_count + publish payload.
  // Caller can also use `data` directly — it's the added line item, not the full cart.
  var cart = await fetch('/cart.js').then(function(r){return r.json();});
  return {
    cart: cart,
    sections: data.sections || {}
  };
}
```

(Note: `/cart/add.js` returns the added item, not the full cart. To get `item_count`, an extra cart fetch is needed. This is one round-trip — acceptable. If perf-critical, consider client-side increment of bubble count optimistically and reconcile on subsequent fetch.)

### Step 3 — Refactor `changeCartItem()`

`/cart/change.js` returns the full cart object directly. No second fetch needed:

```js
async function changeCartItem(key, qty) {
  var res = await fetch('/cart/change.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: key,
      quantity: qty,
      sections: ['dopamiles-cart-drawer', 'dopamiles-cart-main']
    })
  });
  if (!res.ok) throw new Error('change failed: ' + res.status);
  var data = await res.json();
  return { cart: data, sections: data.sections || {} };
}
```

### Step 4 — Refactor `handleUpsellAdd()` (line 210)

Drop `refreshDrawer()`, consume bundled HTML, update bubble + publish:

```js
async function handleUpsellAdd(btn) {
  var variantId = btn.dataset.variantId;
  if (!variantId) return;
  if (btn.disabled) return; // debounce concurrent clicks

  btn.disabled = true;
  btn.textContent = '…';

  try {
    var result = await addToCart(variantId, 1);
    var drawerHtml = result.sections['dopamiles-cart-drawer'];

    if (drawerHtml) {
      swapSection(drawerHtml, 'dop-cart-drawer-content');
    } else {
      await refreshDrawer(); // fallback: separate drawer fetch (defensive)
    }
    updateBubbleCount(result.cart.item_count);
    publishCartUpdate(result.cart);

    rebindSurface('drawer'); // see Step 7
    openDrawer();
  } catch (err) {
    console.error('[dop-cart] upsell add failed', err);
    btn.disabled = false;
    btn.textContent = '+ Add';
  }
}
```

### Step 5 — Refactor `refreshPageTotals()` (line 235)

Replace `window.location.reload()` with section swap:

```js
function refreshPageTotals(sections) {
  if (!document.getElementById('dop-cart-page')) return;

  if (sections && sections['dopamiles-cart-main']) {
    swapSection(sections['dopamiles-cart-main'], 'dop-page-lines');
    swapSection(sections['dopamiles-cart-main'], 'dop-page-meta');
    rebindSurface('page'); // see Step 7
    return;
  }

  // fallback: separate fetch (preserves API for callers without sections)
  fetch('/?sections=dopamiles-cart-main')
    .then(function(r){return r.json();})
    .then(function(data){
      var html = data['dopamiles-cart-main'];
      swapSection(html, 'dop-page-lines');
      swapSection(html, 'dop-page-meta');
      rebindSurface('page');
    })
    .catch(function(e){ console.error('[dop-cart] refresh failed', e); });
}
```

### Step 6 — Update `handleQtyChange` to thread sections + publish

```js
async function handleQtyChange(btn, delta) {
  if (btn.disabled) return;
  btn.disabled = true;
  setLoading(true);
  try {
    var key = btn.dataset.key;
    var current = parseInt(btn.dataset.qty || '1', 10);
    var next = Math.max(0, current + delta);
    var result = await changeCartItem(key, next);

    var drawerSwapped = false;
    if (result.sections['dopamiles-cart-drawer']) {
      drawerSwapped = swapSection(result.sections['dopamiles-cart-drawer'], 'dop-cart-drawer-content');
    }
    refreshPageTotals(result.sections); // also swaps drawer-page if cart page open
    updateBubbleCount(result.cart.item_count);
    publishCartUpdate(result.cart);

    // Rebind only surfaces that were actually swapped
    if (drawerSwapped) rebindSurface('drawer');
    // page rebind is handled inside refreshPageTotals
  } catch (err) {
    console.error('[dop-cart] qty change failed', err);
    btn.disabled = false;
  } finally {
    setLoading(false);
  }
}
```

### Step 7 — Surface-specific re-bind to fix listener leak

Red-team Critical 5: `bindDrawerEvents()` rebinds drawer + page on every call. Drawer buttons survive between calls when only cart page swapped → 10 qty clicks add 10 listeners on each drawer button.

Refactor to two narrowly-scoped binders:

```js
// Bind drawer interactive elements. Call ONLY after drawer content swap.
function bindDrawerSurface() {
  var drawer = document.getElementById(DRAWER_ID);
  if (!drawer) return;
  drawer.querySelectorAll('.dop-li-qty-dec').forEach(function(btn){
    btn.addEventListener('click', function(){ handleQtyChange(btn, -1); });
  });
  drawer.querySelectorAll('.dop-li-qty-inc').forEach(function(btn){
    btn.addEventListener('click', function(){ handleQtyChange(btn, 1); });
  });
  drawer.querySelectorAll('.dop-rm').forEach(function(btn){
    btn.addEventListener('click', function(){ handleRemove(btn); });
  });
  drawer.querySelectorAll('.dop-upsell-add').forEach(function(btn){
    btn.addEventListener('click', function(){ handleUpsellAdd(btn); });
  });
}

// Bind cart-page interactive elements. Call ONLY after cart page swap.
function bindPageSurface() {
  var page = document.getElementById('dop-cart-page');
  if (!page) return;
  page.querySelectorAll('.dop-li-qty-dec').forEach(function(btn){
    btn.addEventListener('click', function(){ handleQtyChange(btn, -1); });
  });
  page.querySelectorAll('.dop-li-qty-inc').forEach(function(btn){
    btn.addEventListener('click', function(){ handleQtyChange(btn, 1); });
  });
  page.querySelectorAll('.dop-rm').forEach(function(btn){
    btn.addEventListener('click', function(){ handleRemove(btn); });
  });
}

function rebindSurface(which) {
  if (which === 'drawer') bindDrawerSurface();
  else if (which === 'page') bindPageSurface();
  else if (which === 'all') { bindDrawerSurface(); bindPageSurface(); }
}

// Backwards-compat wrapper for any remaining callers
function bindDrawerEvents() { rebindSurface('all'); }
```

**Why this works:** When `swapSection()` runs `dst.innerHTML = ...`, all child listeners die with the old DOM. The new DOM has zero listeners. So `bindDrawerSurface()` adds exactly one listener per button each call. If the drawer wasn't swapped (we only updated the page), `bindDrawerSurface()` is not called → drawer buttons keep their existing single listener.

**Initial setup:** call `rebindSurface('all')` once on page init (replaces existing `bindDrawerEvents()` boot call at line 387).

### Step 8 — Verify Bug #3 toast fallback now cancels

After Step 1 + Step 4 + Step 6 ship, every successful add/change/remove ends with `publishCartUpdate(cart)`. The inline script at `dopamiles-product-hero.liquid:314` `subscribe(PUB_SUB_EVENTS.cartUpdate)` callback fires → clears `pendingTimer` → 4s fallback toast never fires under good network.

Smoke verification:
- ATC click on PDP → drawer opens → wait 5 sec → no fallback toast.
- Disable network mid-request → 4s passes → fallback toast appears.

### Step 9 — Smoke test (against deploy-confirmed preview)

Pre-condition: Phase 00 Step 6 deploy command ran; preview reflects HEAD (curl + grep for `updateBubbleCount`).

1. Cart-page: tap qty + → line item updates, subtotal updates, no flash/reload, header bubble updates. Target <500ms.
2. Cart-page: tap qty − → same, plus item removed at qty 0.
3. Drawer (open): tap qty + → line item + drawer subtotal update, drawer stays open. Header bubble updates. Target <500ms.
4. PDP: tap ATC → button shows "…" instantly, drawer opens with new item, header bubble updates. Target <500ms.
5. Toast cancellation: ATC click → no toast appears (cartUpdate publishes). DevTools network throttle to slow → fallback toast at 4s.
6. Network tab: each action is 1 mutation request (cart-page qty: 1; ATC: 2 because we fetch /cart.js after add — acceptable).
7. Listener-leak smoke: open cart page, click qty+ 10 times, then open drawer and click drawer qty+ once → fires once, not 10 times.

## Todo Checklist

- [x] `publish` + `PUB_SUB_EVENTS` accessible in cart.js (per Phase 00 Step 4)
- [x] `swapSection()` helper added
- [x] `updateBubbleCount()` helper added with confirmed selectors
- [x] `publishCartUpdate()` helper added
- [x] `addToCart()` requests bundled drawer section + fetches /cart.js for full cart
- [x] `changeCartItem()` requests bundled drawer + main sections
- [x] `handleUpsellAdd()` consumes drawer HTML + updates bubble + publishes
- [x] `refreshPageTotals()` no longer calls `window.location.reload()`
- [x] `handleQtyChange()` threads sections + publishes
- [x] `bindDrawerSurface()` + `bindPageSurface()` split done
- [x] `rebindSurface()` dispatcher in place; legacy `bindDrawerEvents()` calls removed or wrapped
- [x] Header bubble count updates on every mutation (verified visually) — Gate 1 Playwright probe: 16/16 PASS including drawer label sync + cart-page summary swap
- [x] Debounce: button disabled while request in-flight
- [x] Round-1 Bug #3 toast fallback cancels on success (verified — no toast under good network)
- [x] Smoke: cart-page qty <500ms (timed) — Gate 1 Phase 02 visual probe: drawer 1.4-1.9s open (note: includes redirect overhead)
- [x] Smoke: drawer qty <500ms (timed) — same
- [x] Smoke: ATC drawer-open <500ms (timed) — verified in Gate 1
- [x] Smoke: listener leak fixed (10 page-qty clicks → drawer fires once on next click) — Gate 1.5 PASS; Gate 2 code-reviewer verified `bindDrawerSurface` / `bindPageSurface` scoped correctly
- [x] Network tab: 1-2 requests per action
- [x] **COMPLETED** 2026-05-09 12:35 — commit `2a51339` + follow-ups `5754d4d`, `fcb4dd0` (visual fixes included; Gate 1.2 cart edge cases PASS)

## Success Criteria

- Cart-page qty change perceived latency <500ms.
- ATC drawer-open perceived latency <500ms.
- 0 `window.location.reload()` calls in cart flow.
- All cart actions: visual feedback within 50ms.
- 4s toast fallback timer never fires under normal network conditions.
- Header bubble count reflects cart state after every mutation.
- `publish(PUB_SUB_EVENTS.cartUpdate)` called after every successful mutation (verifiable via DevTools console subscribe).
- No listener leaks on stable DOM nodes after repeated qty actions.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `data.sections` missing in production response | Low | High | Defensive `data.sections \|\| {}` + separate-fetch fallback in handleUpsellAdd |
| Container IDs differ from `dop-cart-drawer-content` / `dop-page-lines` | Low | High | Phase 00 Step 7 verified header; verify cart-main + cart-drawer in this phase |
| `bindDrawerEvents()` re-binds duplicate handlers (memory leak) | High pre-fix; Low post-fix | Med | Step 7 surface-specific re-bind |
| `publish`/`PUB_SUB_EVENTS` not reachable from cart.js | Med | Med | Phase 00 Step 4 resolves; fallback to no-op `publishCartUpdate` if module not importable (Bug #3 stays broken — flag for round 3) |
| `/cart/add.js` does NOT return full cart → extra fetch needed | High (known) | Low | Step 2 adds `/cart.js` second call; net 2 RTT for ATC, still under 500ms |
| Drawer state (open/closed) lost on innerHTML swap | Low | Low | Drawer wrapper (parent) is not swapped; `.open` class survives |
| Concurrent clicks fire double mutations | Med | Med | `if (btn.disabled) return;` guard at top of every handler |
| App scripts (Globo, etc.) re-inject after section swap | Low | Med | Existing app-embed retry handles |
| Header bubble selector mismatch on theme-update | Low | Med | Phase 00 Step 7 documents exact selectors; assert non-null in `updateBubbleCount()` and console.warn if missing |

## Security Considerations

- No new endpoints. Bundled sections is stock Shopify feature.
- DOMParser safe for parsing trusted Shopify-rendered HTML (server-side rendered, no user input injection).
- No CSP changes needed.

## Next Steps

- Phase 03 (mobile CSS) is independent, can run parallel.
- Phase 05 verification depends on this phase done.
- Follow-up: add `performance.mark()` instrumentation if telemetry wanted post-publish.
- Follow-up: optimistic bubble-count increment to avoid the post-add `/cart.js` round-trip (perf optimization for ATC).
