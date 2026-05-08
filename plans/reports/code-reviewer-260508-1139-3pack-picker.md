# Code Review — 3-pack picker (Phase 04)

**Date:** 2026-05-08
**Branch:** `feat/bundle-function` (uncommitted)
**Repo:** `D:\github local\pod-tee-theme`
**Plan:** `plans/260507-1636-pod-bundle-function/phase-04-3pack-picker-and-cart-grouping.md`

## Scope

Files reviewed:
- `templates/page.three-pack.json`
- `sections/dopamiles-3pack-picker.liquid` (174 LOC)
- `snippets/dopamiles-3pack-slot.liquid` (49 LOC)
- `snippets/dopamiles-3pack-browse-card.liquid` (41 LOC)
- `assets/dopamiles-3pack.js` (360 LOC)
- `assets/dopamiles-3pack.css` (354 LOC)
- `layout/theme.liquid` (5-line conditional CSS load — diff)

Cross-referenced for contract drift:
- `sections/dopamiles-cart-drawer.liquid`, `sections/dopamiles-cart-main.liquid`, `snippets/dopamiles-cart-line-item.liquid` (drawer parent/child grouping)
- `snippets/dopamiles-bundle-banner.liquid`, `snippets/dopamiles-bundle-cart-headline.liquid`, `snippets/dopamiles-bundle-collection-pill.liquid` (tier-parse logic)
- `extensions/bundle-discount/src/cart_lines_discounts_generate_run.{graphql,rs}` in `D:\github local\dopamiles-bundle-app` (Function contract)
- `assets/dopamiles-cart.js` (drawer API + refresh flow)

## Overall Assessment

The picker's own logic is well-built: tier-parse is correctly inlined (lesson from yesterday), product JSON uses the `| json` filter end-to-end, JS escapes user-controlled strings before innerHTML, localStorage is versioned with TTL + stale-variant validation, and the Function contract (tag, metafield namespace/key, qty-sum) matches the picker exactly.

But the line-property contract collides with the existing drawer's parent/child convention. **The 3 ATC lines will misrender as 3 separate "Bundle parent" cards in both the cart drawer and the cart page** — exactly the kind of silent feature failure the user warned to scrutinize for. There is also a stale-drawer issue: after ATC, the drawer opens but is not refreshed, so the just-added lines don't appear until the user navigates.

These are landing-page-conversion-path bugs. Picker code is otherwise solid; fixing them is small surface area.

**Code Quality: 7/10** (would be 9/10 without the two production-breaking integration bugs).

---

## CRITICAL

### C1. `_bundle_id` payload collides with existing parent/child grouping → 3 misrendered "Bundle parent" cards

**Files:**
- `assets/dopamiles-3pack.js:382-395` (ATC payload)
- `sections/dopamiles-cart-drawer.liquid:105-150` (parent detection)
- `sections/dopamiles-cart-main.liquid:38-80` (parent detection)
- `snippets/dopamiles-cart-line-item.liquid:10-22` (same predicate, currently unused)

**Bug.** The ATC payload sets `_bundle_id: <uuid>` on all 3 lines and never sets `_bundle_parent`. The drawer's predicate at `dopamiles-cart-drawer.liquid:107-114` is:

```liquid
{%- if item.properties._bundle_parent != blank -%}
  {%- assign is_child = true -%}
{%- endif -%}

{%- unless is_child -%}
  {%- assign bid = item.properties._bundle_id -%}
  {%- if bid != blank -%}
    {%- comment -%} Bundle parent — render grouped card {%- endcomment -%}
    <div class="dop-bundle" ...>
      <b>{{ item.product.title | escape }} &middot; bundle</b>
      ...
      <button type="button" class="dop-rm" data-line-key="{{ item.key }}">Remove bundle</button>
```

Each picker line passes `_bundle_parent != blank` → false → `_bundle_id != blank` → true → renders as its own "Bundle parent" card titled `"<Product title> · bundle"` with an empty children list (no child satisfies `child.properties._bundle_parent == bid`) and a `Remove bundle` button that only deletes that one line.

User sees 3 separate "Acme Tee · bundle / Remove bundle" cards instead of one bundle group. The "Remove bundle" button is also misleading — it removes one line, leaving the other two and breaking the qty-sum tier (drops from 3 → 2, discount changes).

`sections/dopamiles-cart-main.liquid:38-80` has the identical predicate and the same regression on `/cart`.

The plan's docstring at `dopamiles-3pack-picker.liquid:13-17` claims "cart-drawer ignores [`_bundle_kind` and `_bundle_id`]" — that is incorrect; the drawer reacts to `_bundle_id`.

**Fix.** Drop `_bundle_id` from the picker's ATC payload. Keep only `_bundle_kind: '3-pack'` for analytics. The Function discount path is independent of grouping (qty-sum on tagged lines), and the Phase 03 cart-headline already announces the bundle visually based on `eligible_qty`.

```js
// dopamiles-3pack.js
properties: {
  _bundle_kind: '3-pack'
  // remove _bundle_id — collides with kit-picker parent/child grouping in cart drawer
}
```

If a unique grouping ID is needed for analytics, rename the key to avoid collision (e.g. `_3pack_session_id`). Update the section's docstring to remove the misleading claim that the drawer ignores `_bundle_id`.

**Severity rationale.** Primary conversion path of the cold-traffic landing page. Passes schema validation, looks fine in dev, breaks on first real customer add.

---

### C2. Cart drawer is not refreshed after batch ATC → just-added lines invisible

**Files:**
- `assets/dopamiles-3pack.js:415-429`
- `assets/dopamiles-cart.js:74-99` (`refreshDrawer`), `:343-346` (correct usage in upsell), `:360` (`cart:open` event handler)

**Bug.** After `/cart/add.js` succeeds, the picker calls `window.dopCart.open()` directly:

```js
if (window.dopCart && typeof window.dopCart.open === 'function') {
  window.dopCart.open();
}
```

`openDrawer` only toggles classes (`dopamiles-cart.js:133-147`). It does **not** call `refreshDrawer()`. The drawer's content is server-rendered Liquid frozen at page load — the 3 just-added lines do not appear in the drawer until the user navigates or triggers a separate cart mutation. The header bubble count is also stale.

The existing upsell ATC path (`dopamiles-cart.js:343-346`) does it right: `await refreshDrawer(); openDrawer();`. The picker bypasses that and calls `open` only.

The fallback `cart:open` event handler at `dopamiles-cart.js:360` also only opens, not refreshes — both paths are broken.

**Fix options.**

1. (Preferred) Expose `refreshDrawer` on `window.dopCart` and call it from the picker:
   ```js
   // dopamiles-cart.js:404
   window.dopCart = { open: openDrawer, close: closeDrawer, refresh: refreshDrawer };
   ```
   ```js
   // dopamiles-3pack.js
   if (window.dopCart && window.dopCart.refresh) {
     await window.dopCart.refresh();
   }
   window.dopCart.open();
   ```
   Make `addBundleToCart` `async` and `await`.

2. Change the `cart:open` event to also refresh:
   ```js
   // dopamiles-cart.js:360
   document.addEventListener('cart:open', async () => { await refreshDrawer(); openDrawer(); });
   ```
   Then the picker can dispatch the event and trust the drawer to handle both. This is more robust because every other future feature gets refresh-on-open for free.

**Severity rationale.** User taps "Add 3-pack to bag", the drawer slides in showing the cart from before they added. Looks like the ATC silently failed. They tap again → 6 lines in cart → tier still 3+ but visual chaos.

---

## HIGH

### H1. All-slots-full silent overwrite

**File:** `assets/dopamiles-3pack.js:328-333`

```js
var slotIdx = findFirstEmptySlot();
if (slotIdx === -1) {
  // all slots full — replace slot 3 (last)
  slotIdx = 2;
}
```

When all 3 slots are full and the user clicks a 4th browse card, slot 3 is silently overwritten with no visual feedback or undo. Easy mis-click on mobile. User just expressly listed this in "Edge cases."

**Fix.** Either ignore the click when full (and visually pulse/disable browse cards), or show a brief toast/inline hint above the slots ("3-pack is full — clear a slot to swap"). At minimum, animate the replaced slot so the change is visible.

### H2. Sold-out variant restored from localStorage clears late

**File:** `assets/dopamiles-3pack.js:58-78` (`loadFromStorage`), `:117-124` (`renderSlot` stale-variant drop), `:382-435` (ATC error path)

`loadFromStorage` validates that the variant exists in the catalog (`variantById[String(vid)]`) but does not check `variant.available`. A variant that was available 7 days ago but is now sold out gets restored to the slot. The user may not notice; they hit ATC; Shopify rejects with 422; the picker shows generic "Couldn't add bundle — try again" and never identifies which slot is the problem.

**Fix.** In `loadFromStorage`, also verify `variantById[String(vid)].variant.available`; drop unavailable variants the same way stale ones are dropped. Or in the ATC error path, if the response includes `{ status: 422, items: [...] }` or item-level errors, mark the offending slot visually.

### H3. Focus management lost on slot fill / slot clear

**Files:**
- `assets/dopamiles-3pack.js:321-345` (`pickProduct`, `clearSlot`)
- `snippets/dopamiles-3pack-slot.liquid:34-48`

After `pickProduct` fills a slot, focus stays on the browse card. Keyboard / SR users have no anchor pointing to the slot they just filled. After `clearSlot`, focus is on the now-`hidden` clear button — focus falls back to body, breaking the keyboard tab order.

**Fix.** After `pickProduct(productId)` fills slot N, move focus to the cleared slot's first picker (or the slot card itself if no pickers). After `clearSlot`, move focus back to the originating browse card or the next empty slot.

---

## MEDIUM

### M1. `aria-live="polite"` scope is too broad

**File:** `sections/dopamiles-3pack-picker.liquid:85`

```liquid
<div class="dop-3pack-summary" role="region" aria-label="Bundle summary" aria-live="polite">
```

The whole sticky bar (text + button) is marked live. Every `updateSummary()` call (which fires on every option-change in any picker) re-reads the entire region to SR users including the button label. That's noisy.

**Fix.** Move `aria-live="polite"` to just the text span (`<div class="dop-3pack-summary-text">`). Drop `role="region"` from the live region or keep it on the outer container only (without `aria-live`).

### M2. Tier-parse drift risk — 4 inline copies, no shared comment cross-link

**Files:**
- `sections/dopamiles-3pack-picker.liquid:20-33`
- `snippets/dopamiles-bundle-banner.liquid:20-34`
- `snippets/dopamiles-bundle-cart-headline.liquid:25-39`
- `snippets/dopamiles-bundle-collection-pill.liquid:18-30`

All four blocks parse `shop.metafields.bundles.tiers` identically (correct decision per yesterday's lesson — `{% render %}` is scope-isolated). Right now they're in sync. Future change to the metafield schema (e.g., adding tier 4) requires updating all four. The doc comment in each notes "keep in sync" but no enforcement.

**Recommendation.** Add a one-line sentinel comment `{%- comment -%} BUNDLE-TIER-PARSE — keep in sync with banner/headline/pill {%- endcomment -%}` at the top of each block so a `git grep BUNDLE-TIER-PARSE` lists all callsites. (Cheap; still YAGNI-friendly.)

### M3. Theme-editor double-init on multiple instances

**File:** `assets/dopamiles-3pack.js:17-25`

The IIFE `querySelector('.dop-3pack')` finds the first instance only. If the theme editor renders two picker sections on the same page (unlikely but possible since the schema has presets), the second init reuses the first's DOM and double-binds click handlers on the browse rail → every click adds 2 items. The duplicate `id="dop-3pack-products-data"` also breaks `getElementById` for the second.

**Fix.** Either (a) scope all DOM lookups to the section element (already the case for slots/browse — extend to dataEl + summary + atc); (b) guard `init()` with `section.dataset.init === 'true'`. Keep it simple — one-line guard at top of `init()`.

### M4. Empty-state copy hardcodes admin instruction

**File:** `sections/dopamiles-3pack-picker.liquid:78-80`

```liquid
<p>No bundle-eligible products yet. Tag a product <code>bundle-eligible</code> in admin to get started.</p>
```

This message will ship to a customer if a Smart Collection is mis-configured. Customers don't know what `admin` means. The current Phase 03 banner snippet handles "no eligible product" by rendering nothing — same pattern would apply: render the page heading + browse-empty placeholder ("New 3-packs coming soon — sign up for restock alerts") instead of dev instructions.

### M5. Sticky-bar reserve-padding mismatch

**File:** `assets/dopamiles-3pack.css:11`, `:421-422`

```css
.dop-3pack { padding-bottom: calc(var(--dop-s-9) + 88px); }
@media (max-width: 768px) {
  .dop-3pack { padding-bottom: calc(var(--dop-s-7) + 96px); }
}
```

Hardcoded 88/96px guesses sticky-bar height. With user font-size scaling or large `env(safe-area-inset-bottom)` (iPhone Pro Max in portrait), the bar can grow past 96px and overlap the last row of browse cards. Customers can scroll past the issue, but on small viewports the last card is partially obscured.

**Fix.** Measure sticky-bar height at runtime once and set `--dop-3pack-sticky-h` as a CSS var on `.dop-3pack`; or use `padding-bottom: max(96px, ...)` with `env()` accounted-for explicitly:
```css
padding-bottom: calc(env(safe-area-inset-bottom) + 88px + var(--dop-s-7));
```

### M6. Generic error swallows actionable info

**File:** `assets/dopamiles-3pack.js:431-434`

```js
.catch(function (err) {
  console.error('[dop-3pack] ATC failed', err);
  setBusy(false, "Couldn't add bundle — try again");
});
```

Shopify `/cart/add.js` returns useful errors (`description`, `message`) for sold-out, throttled, etc. The `.then` chain at line 408-411 *does* throw with `err.description`, but the `.catch` ignores `err.message` and shows a static string. Logged to console but not user-visible.

**Fix.** `setBusy(false, err.message || "Couldn't add bundle — try again")`.

---

## LOW

### L1. Dead `data-product-handle` attribute

**File:** `snippets/dopamiles-3pack-browse-card.liquid:15`

`data-product-handle="{{ product.handle }}"` is never read in the JS (only `data-product-id`). Either remove or wire up if you intend a `?picked=<handle>` deep-link in the future.

### L2. Inlined product data is ~180KB on first paint

**File:** `sections/dopamiles-3pack-picker.liquid:104-141`

24 products × ~15 variants = ~360 variants × ~500 bytes JSON ≈ 180KB inline JSON in the HTML. Acceptable for a landing page where interactivity is the page, but worth noting for SEO/LCP. If browse_limit is bumped past 24 it scales linearly. Consider lazy-loading variant data on first browse-card click.

### L3. `getCurrentSelections` ignores its `count` argument

**File:** `assets/dopamiles-3pack.js:215-220`

```js
function getCurrentSelections(container, count) {
  var selects = container.querySelectorAll('select');
  var sel = [];
  selects.forEach(function (s) { sel.push(s.value); });
  return sel;
}
```

`count` parameter is unused. Drop it.

### L4. UUID fallback doesn't respect crypto-failure path

**File:** `assets/dopamiles-3pack.js:349-359`

`Math.random()`-based UUIDs are fine for this use (informational ID, not security-critical). No action; just noting that if C1 is fixed by removing `_bundle_id`, the whole `generateBundleId` becomes dead.

### L5. Slot-clear button uses `&#215;` (multiplication sign) for visual ✕

**File:** `snippets/dopamiles-3pack-slot.liquid:40`

The character renders fine, but `aria-label="Clear slot N"` (already present) covers SR users — good. No change needed.

---

## Edge Cases Found by Scout

Scouting `git diff --name-only` against integration points:

1. **Cart-drawer parent-detection collision** — see C1 (the headline finding).
2. **Drawer-refresh missing after batch ATC** — see C2.
3. **`window.dopCart.open()` exists** at `assets/dopamiles-cart.js:404`. ✓ API contract honored.
4. **Tier-parse logic identical to banner** — verified line-for-line against `dopamiles-bundle-banner.liquid:20-34`. ✓
5. **Function tag/metafield contract** — verified against `D:\github local\dopamiles-bundle-app\extensions\bundle-discount\src\cart_lines_discounts_generate_run.rs`:
   - Tag `bundle-eligible` ✓
   - Metafield namespace `bundles`, key `tiers` ✓
   - Qty rule `saturating_add(line.quantity)` ✓ (matches headline's `eligible_qty | plus: item.quantity`)
6. **Function returns `Vec<Tier>` JSON shape `[{min, pct}]`** — picker parses identically. ✓
7. **Same-variant-3-times merge** — `/cart/add.js` will merge into one line with qty=3. Function still discounts (qty-sum). Headline still announces (qty-sum). C1 bug still triggers (single line carries `_bundle_id`).

---

## Positive Observations

- Tier-parse inlined with explicit cross-reference comment — yesterday's lesson applied correctly.
- All Liquid output filtered (`| escape` on text, `| json` on JSON-script values). No XSS sinks.
- JS uses `textContent` and `escapeHtml` consistently before any `innerHTML` write.
- localStorage versioned (`v: 1`), TTL-bounded (7 days), stale-variant validated on load, JSON-parse wrapped in try/catch, quota-exceeded silently no-ops.
- Recursion in `renderSlot` for stale-variant cleanup is bounded — terminates on `vid == null` early-return.
- ATC button disabled during in-flight request → no double-submit race.
- Section name 23 chars (≤ 25 limit), no `filter-in-for-iterable`, schema validates with `shopify theme check` (zero warnings on the new files).
- CSS gated on `template == 'page.three-pack'` so only loads on the picker page — good for site-wide CLS budget.
- `prefers-reduced-motion` handled.
- `aria-busy` set on the ATC button during the network call.
- Function/Theme contract perfectly aligned (tag, metafield, qty-sum).

---

## Recommended Actions (priority order)

1. **C1**: Remove `_bundle_id` from picker ATC payload, update docstring. ~5 min fix; unblocks landing page.
2. **C2**: Expose `dopCart.refresh` (or refresh-on-open via `cart:open`) and await it before `open()`. ~10 min.
3. **H1**: Block re-click when full, or animate slot-3 swap. ~15 min.
4. **H2**: Validate `variant.available` in `loadFromStorage`. ~5 min.
5. **H3**: Move focus to filled slot / next slot after fill / clear. ~10 min.
6. **M1**: Tighten `aria-live` to text span. ~2 min.
7. **M3**: Guard `init()` against double-call. ~2 min.
8. **M4**: Customer-facing empty-state copy. ~5 min.
9. **M6**: Surface `err.message` to user. ~1 min.
10. **L1, L3**: Drop dead attr / unused param. ~1 min.

Defer: M2 (sentinel comment), M5 (CSS measure), L2 (lazy-load), L4 (post-C1).

## Metrics

- Theme-check (Shopify CLI): **0 errors / 0 warnings on new files**
- Liquid scope traps avoided: ✓ (tier-parse inlined, no `{% render %}` for assigns)
- XSS sinks: 0
- Auth/CSRF: handled by Shopify session cookies (same-origin)
- File sizes: section 174 LOC ✓, JS 360 LOC (over 200, justifiable — single concern, single page, would split into render/state/atc modules if growing further)

## Unresolved Questions

1. **`_bundle_kind` analytics consumer.** The plan keeps it as informational. Is anything actually reading it? If not, drop the property entirely (YAGNI) and let the cart-headline serve as the only "this came from a bundle" signal.
2. **Same-variant 3-pack pricing.** If a customer picks 3× black-medium, Shopify merges into one line qty=3. Function discounts correctly (qty-sum), but the cart visual shows one row. Is that the intended display? Plan says "3 separate lines" — but `/cart/add.js` merges automatically. May need `properties._slot_index: 1|2|3` to defeat merging if separate lines matter for analytics.
3. **Browse-rail collection ordering.** Currently uses default `collections[handle].products` order (collection settings). Should the picker sort by best-seller / hand-pick? Out-of-scope for this review but worth confirming with Meta-ads team.
4. **Sticky-bar height on iOS Safari with bottom-bar.** Visual QA owner per acceptance criteria — flagging as untested.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Picker code is clean and correctly avoids the Liquid scope trap, but two integration bugs will break the landing page in production (C1: 3 misrendered "bundle parent" cards in cart; C2: stale drawer after ATC). Both are 5-15 min fixes.
**Concerns:** C1 + C2 must land before this hits cold traffic. C1 in particular contradicts a docstring claim that the cart-drawer ignores `_bundle_id` — the drawer does react to it. Grep showed `_bundle_id` is exactly the marker the existing kit-picker uses for parent identification.

---

## Fixes Applied — 2026-05-08 11:50

| ID | Status | Change |
|---|---|---|
| C1 | ✅ Fixed | `dopamiles-3pack.js:382-396` — dropped `_bundle_id` from payload (kept `_bundle_kind`); removed dead `generateBundleId`; section docstring (`:1-19`) updated to document drawer collision; section JS docstring corrected. |
| C2 | ✅ Fixed | `dopamiles-cart.js:404` — exposed `refresh: refreshDrawer` on `window.dopCart`. `dopamiles-3pack.js:412-426` — wraps refresh in `Promise.resolve(...).then(open, open)` so success and rejection both proceed to open the drawer (refresh is best-effort). |
| H1 | ✅ Fixed | `dopamiles-3pack.js:317-326` — when all slots full, click is blocked, `flashSlots()` adds `is-flash` class to slots row for shake animation, focus moves to first clear button. CSS `.dop-3pack-slots.is-flash` keyframes + reduced-motion override added. |
| H2 | ✅ Fixed | `dopamiles-3pack.js:65-70` — `loadFromStorage` now requires `entry.variant.available === true`. Sold-out variants from prior session no longer rehydrate. |
| H3 | ✅ Fixed | `dopamiles-3pack.js:328-345` — `pickProduct` calls `focusFilledSlot(idx)` (focuses first picker, falls back to clear button); `clearSlot(index, originatingEl)` parameter receives the clear button ref so focus follows back to it (or programmatically focuses empty-state container with tabindex="-1" if button now hidden). `wireSlotClears` passes the clicked element. |
| M1 | ✅ Fixed | `dopamiles-3pack-picker.liquid:85-87` — `aria-live="polite"` moved from outer summary div to `dop-3pack-summary-text` only; button label updates no longer announced. |
| M3 | ✅ Fixed | `dopamiles-3pack.js:454-461` — `init()` guards on `section.dataset.init === 'true'` to prevent double-bind across DOMContentLoaded races and theme editor re-renders. |
| M4 | ✅ Fixed | `dopamiles-3pack-picker.liquid:78-81` — replaced dev-facing copy ("Tag a product `bundle-eligible`") with customer-friendly "New 3-packs are coming soon" + browse-catalog CTA. |
| M6 | ✅ Fixed | `dopamiles-3pack.js:404-406, 433-435` — error path surfaces `err.message` (which now includes `description || message` from Shopify API) to button label instead of generic string. |
| L1 | ✅ Fixed | `dopamiles-3pack-browse-card.liquid:15` — dead `data-product-handle` removed. |
| L3 | ✅ Fixed | `dopamiles-3pack.js:215-220` — unused `count` param dropped from `getCurrentSelections`; caller updated. |

**Deferred (per reviewer recommendation):** M2 (sentinel comments), M5 (sticky-bar CSS measure), L2 (lazy-load product JSON).

### Re-validation

- `node --check assets/dopamiles-3pack.js` → JS OK
- `shopify theme check` filtered for `3pack|three-pack` → 0 hits (clean)

### Files Touched This Round (2)

- `assets/dopamiles-cart.js` (1-line API surface change at `:404`)
- `assets/dopamiles-3pack.js`, `assets/dopamiles-3pack.css`, `sections/dopamiles-3pack-picker.liquid`, `snippets/dopamiles-3pack-browse-card.liquid` (picker fixes)

**Post-fix Status:** DONE
**Post-fix Summary:** All 2 CRITICAL + 3 HIGH + 4 MEDIUM + 2 LOW addressed. M2/M5/L2 deferred. Re-validation clean. Ready for commit + Path A QA.
