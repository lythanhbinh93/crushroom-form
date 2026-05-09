# Code Review — Round-3c Perception (G+F) + CLS (R3-1)

**Verdict:** APPROVED_WITH_CONCERNS — ship to preview, but expect 1 known empty-cart edge case to surface in screen recording.

**Scope:** 4 files, +256 / -22 LOC (under ~110 budget for additions; deletions are wrapper move). Diff stats:
- `layout/theme.liquid` +13
- `sections/dopamiles-product-hero.liquid` +57 net (wrap + island + reveal timer)
- `assets/dopamiles-cart.js` +151 / -2 (helpers + wiring)
- `assets/dopamiles-cart.css` +35

**LOC concern (informational):** 151 LOC added to cart.js exceeds the planned ~50; mostly comments + escapeHtml + dual-helper pair. Acceptable; comments are load-bearing for the next reviewer.

---

## CRITICAL — must fix before deploy

### C1. Empty-cart first-add → optimistic line silently skipped

**Where:** `dopamiles-cart.js:164-165` + `dopamiles-cart-drawer.liquid:101 vs 298`.

`#dop-cart-lines` is rendered ONLY in the `{%- if cart.item_count > 0 -%}` branch of the drawer template. When cart is empty, that ID does not exist in the DOM at all — the empty-state `.dop-cart-empty` lives in the sibling `else` branch directly under `#dop-cart-drawer-content`.

Consequence: on first ATC into an empty cart (the headline G demo), `lines = document.getElementById('dop-cart-lines')` returns null → silent return. Optimistic line never appears. User screen-records "ATC didn't work" *again* — same convergence-failure pattern as round-3b, but for a different reason.

**Patch (5 LOC):**
```js
let lines = document.getElementById('dop-cart-lines');
if (!lines) {
  // Empty-cart path: drawer renders .dop-cart-empty under #dop-cart-drawer-content.
  // Replace the empty state shell with a <div id="dop-cart-lines"> so we have a host.
  const content = document.getElementById('dop-cart-drawer-content');
  const emptyShell = content && content.querySelector('#dop-cart-empty, .dop-cart-empty');
  if (!content || !emptyShell) return; // drawer markup not present at all
  lines = document.createElement('div');
  lines.className = 'dop-cart-lines';
  lines.id = 'dop-cart-lines';
  emptyShell.replaceWith(lines);
}
```

(The subsequent `applyCartMutation` swap of `#dop-cart-drawer-content` innerHTML cleans this up after the fetch lands.)

---

## MAJOR

### M1. `data.url` injected unescaped into two `href` attributes

**Where:** `dopamiles-cart.js:173,177`.

`data.url` comes from `product.url | json` (server-emitted, sanitized URL path). In normal Shopify operation it is safe, but it is concatenated raw into `href="..."`. If a future code path ever feeds a non-Shopify URL (e.g. metafield-overridden), an attacker-controlled string with `"><script>` would break out. Title and variant are escaped — be consistent.

**Patch:** `'href="' + escapeHtml(data.url) + '"'` in both places.

### M2. `variant.image` injected unescaped into `src`

**Where:** `dopamiles-cart.js:174`. Same defense-in-depth concern. Shopify CDN URLs are safe; pass through `escapeHtml` for symmetry. Single-line change.

### M3. Build-tag preview gate has known false-positive

**Where:** `theme.liquid:434`.

Confirmed via Shopify docs: `template.suffix` returns the merchant's custom suffix string in production. If anyone ever creates `product.preview.liquid` (a perfectly normal A/B-template name), `contains 'preview'` matches and the badge leaks to prod for that template. Path/url checks are fine alone.

**Patch (drop the third clause):**
```liquid
{%- if request.path contains 'preview_theme_id' or request.url contains 'preview_theme_id' -%}
```

The plan's "Risk Assessment" already calls this risk Low/Low and accepts visual nuisance, but YAGNI: the third clause adds nothing because preview-theme URLs always carry `preview_theme_id` query param. Remove it.

### M4. JSON island `</script>` premature-close — verified safe but worth a one-line guard

**Where:** `dopamiles-product-hero.liquid:203-221`.

Liquid `| json` does NOT escape forward slashes. If a product/variant title legitimately contains `</script>` (rare but possible — POD designers paste arbitrary strings), the JSON island closes early and HTML follows as if it were body content. JSON parsing then fails → `showInjectError` fires (good, surfaces the bug) BUT the page may render visible garbage before that.

**Patch (idiomatic, 0 LOC change to logic):** wrap each title in `replace: '</', '<\/'` filter:
```liquid
"title": {{ product.title | json | replace: '</', '<\\/' }},
```

Defer if you want — `showInjectError` will catch the parse failure and you can ship as-is. But the Shopify community standard for JSON-in-script is the `<\/` escape.

---

## MINOR

### m1. Spinner role/aria
`<span class="dop-li-price-pending" aria-label="Updating price">` on a non-button is fine for AT but won't be announced as a status. Add `role="status"` so screen readers polite-live-region announce it. 1 attribute.

### m2. CSS: spinner uses `--dop-line` (panel border) and `--dop-ink` (full black). Verified tokens exist in `snippets/dopamiles-tokens.liquid`. No collision with existing `.dop-spinner`. OK.

### m3. `style="display:contents"` + parent `visibility:hidden` interaction
`<product-info style="display:contents">` + parent `<div data-dawn-vs style="visibility:hidden">` — `visibility:hidden` propagates to children regardless of display:contents. Verified safe with Dawn's `<product-info>` lifecycle: the custom element's connectedCallback fires on parse (DOM insertion is what matters, not CSS), so form/variant-selects wiring is preserved. R7 risk (variant-change DOM swap nukes wrapper) — Dawn replaces inner content of `<product-info>` only; the `[data-dawn-vs]` wrapper is the parent and survives. OK.

### m4. Reveal-timer race on Globo-late-injection
If Globo arrives between 1500ms-3000ms (slow 3G), Dawn becomes visible at 1500ms, then Globo paints over it — small CLS for the rare-tail case. Plan calls this acceptable. OK; no action.

### m5. `applyCartMutation` clears optimistic placeholder — verified
`dst.innerHTML = newContent.innerHTML` on `#dop-cart-drawer-content` (cart.js:480). Optimistic node is a descendant of `#dop-cart-lines` which is a descendant of `#dop-cart-drawer-content` → wiped on swap. Confirmed.

### m6. `handleQtyChange` rollback on newQty === 0 — verified safe
`rollback` only set when `newQty > 0` (cart.js:390). Removal flow's catch path doesn't call rollback (variable stays null, `if (rollback) rollback()` no-ops). OK.

### m7. Round-3b dead-code grep — verified clean
`scaleMoneyText|gallery-active-image|dop-product-title.*querySelector` returns 0 hits in cart.js. ✓

---

## POSITIVE

- `escapeHtml` covers the 5-char OWASP set including `'`. Solid.
- Error overlay uses `textContent` not `innerHTML` — XSS-safe by construction. Good.
- JSON island disclosure review: `available`, `price_money`, `image`, `title` — all already public on PDP. No PII, no `inventory_quantity`, no internal IDs. ✓
- Rollback closure pattern in `optimisticLineUpdate` is clean; no shared mutable state across the qty handler.
- `data-line-key="optimistic"` won't collide with Shopify's real keys (which are 32-char hex). Swap removes it.
- Comments explicitly cite round-3b root cause + verification rationale — future reviewer will not have to rediscover the why.

---

## Edge cases scout flagged

1. **Empty-cart first ATC** (C1 above) — high-impact, blocks G demo.
2. **Recommendation-card ATC on /collections/** — `#dop-product-data` not present → silent skip via `dataEl` null check. Good.
3. **Variant-change between ATC tap and swap (~500ms window)** — Dawn re-renders variant-selects; our `[data-dawn-vs]` wrapper survives (parent), island stays intact. Edge: user changes variant after island serialization but before ATC. Hidden form input was updated by syncVariant → `variantId` lookup hits new variant, `data.variants.find` succeeds. ✓
4. **`product.featured_media` null on a variant** — `image_url` filter on null returns empty string; image element renders broken-image icon for ~500ms then real swap arrives. Acceptable; could fall back to `product.featured_image` in the island for safety. Defer.

---

## Recommended Actions (priority order)

1. **C1 patch** — empty-cart fallback for `#dop-cart-lines`. 5 LOC. Blocking.
2. **M1+M2** — wrap `data.url` and `variant.image` in `escapeHtml`. 2 lines. Defense-in-depth, low effort, do it.
3. **M3** — drop `template.suffix contains 'preview'` clause. 1 line.
4. **M4** — `</script>` escape in JSON island via `| replace: '</', '<\/'`. Optional; surface-level safety.
5. **m1** — add `role="status"` to spinner span. 1 attribute.

Total patch: ~10 LOC, ~5 min. Ship after.

---

## Unresolved Questions

1. Should round-3c also defensively render `#dop-cart-lines` empty in the cart-drawer Liquid template (replacing the if/else-branch split)? That would be the architectural fix for C1 vs the JS-side workaround. Defer to user — JS workaround unblocks ship; Liquid fix is cleaner long-term.
2. If user's iPhone has the recommendation-card ATC pattern on the home/collection pages, the silent-skip path leaves them with no optimistic line on those surfaces. By design, but worth confirming the user only expects G to work on PDP.
3. Build-tag epoch resolution: `'now' | date: '%s'` is in seconds — two reloads within the same second produce the same digits (rare but happens during fast-refresh testing). User may interpret "same digits = cache stale" incorrectly. Consider appending milliseconds via `request.id` instead. Defer.
