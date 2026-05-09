# Sloth Hiking Club ATC pattern vs pod-tee-theme — why theirs feels fast

**Source:** https://slothhikingclub.com/products/blowing-wishes-t-shirt
**Platform:** Shopify Dawn (lightly customized; same theme family as pod-tee-theme)
**Investigation date:** 2026-05-09

## TL;DR

SLC opens the drawer **AFTER** `/cart/add.js` returns. Pod-tee opens it **BEFORE**. That single ordering difference is why SLC reads as "real performance" and our round-3a/b/c reads as "fake animation."

No optimistic UI on SLC. No placeholder. No pre-rendered drawer content waiting for swap. Just: button spinner → wait for fetch → drawer slides in with real content.

## SLC ATC flow (traced from minified `product-form.js` + `cart-drawer.js`)

1. User taps ATC
2. `product-form.js onSubmitHandler`:
   - `evt.preventDefault()`
   - `submitButton.classList.add("loading")` + show inline `.loading__spinner` — instant button feedback (<50ms)
   - `fetch('/cart/add.js')` with `sections=[cart-drawer, cart-icon-bubble]` (2 sections only)
3. On response:
   - `cart.renderContents(response)` → `CartDrawer.renderContents`
4. `CartDrawer.renderContents`:
   - Swap `#CartDrawer` innerHTML with response section HTML
   - Swap `cart-icon-bubble` innerHTML
   - **Then** `this.open()` — drawer slides in with real content already in place
5. Drawer animation runs once, with truth. No swap visible to user.

**Visual events the user perceives:** 2 (button-spinner-on, drawer-slides-in-with-content).

## Pod-tee-theme ATC flow (current, post-round-3c)

1. User taps ATC
2. `bindAddToCartInterceptor`:
   - `e.preventDefault()`
   - submit button → "…"
   - **`injectOptimisticAtcLine(form, qty)`** ← writes placeholder DOM
   - **`setLoading(true)`** ← dims drawer body
   - **`openDrawer()`** ← drawer slides in showing placeholder
3. `await fetch('/cart/add.js')`
4. `applyCartMutation(result)` ← swaps drawer content (placeholder → real)
5. `setLoading(false)` ← un-dim

**Visual events the user perceives:** 5+ (button-text-flicker, optimistic-line-enters, drawer-slides-in, dim, swap-from-placeholder-to-real, un-dim).

The user reported "fake animation" because step 4 IS a visible swap. The optimistic line and the real line look slightly different (server-rendered HTML differs from our client-built HTML — different escaping, different image URLs at different widths, different price formatting). Even if pixel-identical, the swap is detectable as a flash.

## Why SLC feels faster (despite doing MORE actual work between click and drawer-visible)

SLC user waits ~500ms with button spinner → drawer arrives WITH content. One coherent event: "I clicked, system worked, here's the result."

Pod-tee user waits ~50ms → drawer arrives empty/optimistic → ~500ms placeholder → swap to real. Three events. The middle event has no information — just a placeholder to look at while waiting. That's the "fake animation" — the slide-in fires before the cart is actually changed.

**Key insight:** the drawer slide-in is the visual signal that "cart changed." Don't fire it before the cart actually changed.

## What round-4 should do (5-LOC inversion)

Replace this block in `assets/dopamiles-cart.js bindAddToCartInterceptor`:

```js
// CURRENT (round-3c) — drawer opens before fetch
injectOptimisticAtcLine(form, qty);
setLoading(true);
openDrawer();
try {
  const result = await addToCart(varId, qty);
  applyCartMutation(result);
} catch (err) { ... }
```

With:

```js
// PROPOSED (round-4) — SLC-style: drawer opens after fetch
// Submit button already shows spinner from existing code.
try {
  const result = await addToCart(varId, qty);
  applyCartMutation(result); // swap content while drawer is still hidden
  openDrawer();              // animate in with real content
} catch (err) { ... }
```

Net: button-spinner gives <50ms click feedback (already exists). Drawer slide-in is the "cart updated" signal and only fires when cart IS updated. No optimistic line. No placeholder. No middle-event with no information.

## Qty +/- on cart page (parallel issue)

SLC's `cart-drawer-items` extends a base `CartItems` class (loaded from another script we didn't fetch). Pattern is similar: button shows spinner, fetch, swap. No optimistic textContent write.

For pod-tee `handleQtyChange`: remove `optimisticLineUpdate(liEl, currentQty, newQty)`. Replace with: button.classList.add('loading') → show inline spinner ON THE BUTTON, not in price column. fetch. applyCartMutation swaps the line. button spinner goes away with the swap.

## Where the actual ms go (the second part of "real performance")

Once we stop faking, the user still waits ~500-1500ms on cellular. To shrink that:

1. **Trim section bundle.** SLC bundles only `[cart-drawer, cart-icon-bubble]`. Pod-tee may bundle more (verify before changing).
2. **Pre-warm DNS/TLS** to `/cart/add.js` on PDP load via `<link rel="preconnect">` for the shop domain (likely already there — verify).
3. **Lazy-load Globo + non-critical apps** so they don't compete with cart-add fetch for main thread time.
4. **Defer Klaviyo / Vitals / CookieYes** until after first interaction. Currently they load with the page and contend for bandwidth + main thread on cellular.
5. **Section render server time.** `/cart/add.js?sections=cart-drawer` runs the full drawer Liquid (shipping bar, upsells, totals) on every add. Smaller drawer = faster server time. Worth measuring.

LOC budget for ATC inversion alone: ~10 lines net delete (mostly removing optimistic helpers we won't need). Followed by perf measurement to decide whether items 1-5 are needed.

## Files SLC uses (Dawn stock filenames)

| File | Bytes | Purpose |
|------|-------|---------|
| product-form.js | 3,489 | ATC submit handler |
| cart-drawer.js | 3,401 | Drawer open/close + renderContents |
| cart.js | 7,867 | CartItems base class (qty +/- handler) |
| cart-notification.js | 1,914 | Alternative small-bubble surface (not used here, but available) |

All are stock Dawn. SLC didn't write custom cart code — they just trust Dawn's ordering.

## Unresolved questions

1. **Why does pod-tee-theme have a custom `dopamiles-cart.js` (599 lines) at all?** The original motivation (round-1 Bug #3 pubsub) is fixed. Could we delete it and use Dawn's stock cart-drawer.js + product-form.js + cart.js? That would simplify maintenance massively. Need to check what custom features actually require the override (sticky header bag count, bundle handling, upsell drawer item, error banner, custom totals row, shipping bar).
2. **Is Dawn's `cart-notification` a better surface for ATC than the drawer entirely?** Smaller, faster to render, less to swap. Drawer remains for bag-icon-click. Worth A/B-comparing against drawer-after-fetch pattern.
3. **What's actual cellular ms breakdown?** Need real iPhone over throttled cellular (Network Link Conditioner equivalent on Mac, or Chrome DevTools "Slow 3G" as proxy). Without numbers, we're guessing whether section bundle vs server render vs network is the biggest lever.
4. **Did pod-tee's `setLoading(true)` + `openDrawer()` ordering exist BEFORE round-3a, or did round-3a introduce it?** If pre-existing, removing it is a regression to whoever wanted the immediate-open. If introduced by round-3a, removing it is a clean revert.
