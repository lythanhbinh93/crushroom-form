# Phase 00 — Pre-Flight Verification

## Context Links

- Red-team review: [../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md](../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md)
- Round-1 stale-preview incident: this session's verification surfaced live ≠ preview
- Source repo: `D:\github local\pod-tee-theme\`

## Overview

**Priority:** P0 (gate — kill assumptions before code)
**Status:** completed (2026-05-09 11:55+)
**Effort:** ~25 min actual
**Owner:** code

**Output:** [verification-notes.md](verification-notes.md) — full findings + decisions + Phase 01-04 inputs.

Verify 8 load-bearing assumptions. Round-1 round-2 plan had 4 critical false assumptions (token file location, cart-icon-bubble DOM target, cartUpdate pubsub publishing, sticky-mobile-ATC coverage). One pass through the codebase + a preview-deploy probe converts assumptions to facts before edits start.

## Key Insights

- Round 1 shipped a fix at `dopamiles-shared.css:181` that uses `var(--dop-accent-text, #C84A2A)`. The fallback hex works, but template-specific files load AFTER shared.css and use `color: var(--dop-accent)` (orange #F26419), winning the cascade. **The fix fired but didn't take effect** — that's the round-1 regression.
- `cart-icon-bubble.liquid` exists as a section file but is NOT used by `header.liquid`. The header inlines the cart icon at line 273 with literal `<a id="cart-icon-bubble">`. Bundled `sections=["cart-icon-bubble"]` cannot swap any DOM in this theme.
- `dopamiles-cart.js:323` intercepts every cart-form submit with `e.preventDefault(); e.stopPropagation();`. Dawn's `product-form.js` never runs on our PDP. **Zero `publish(PUB_SUB_EVENTS.cartUpdate)` calls in the file** — round-1 Bug #3 toast cancellation cannot fire today.
- `templates/product.json:263-276` includes `dopamiles-mobile-sticky-atc`. Section has `<span class="ms-price">` rendered server-side and never updated by JS.

## Requirements

**Functional:**
- All 8 verification items resolved with documented findings.
- Outputs (token line numbers, selector counts, deploy command) inform Phase 01-04 implementation.

**Non-functional:**
- No code edits. Read-only analysis.
- Output captured inline in this phase file or `verification-notes.md` sibling.

## Architecture

```
Phase 00 (verify)
  ├─ 1. tokens.liquid: --dop-low line confirmed
  ├─ 2. CSS sweep: count + classify color: var(--dop-accent) matches
  ├─ 3. product.json: confirm sticky-ATC block + read sticky-ATC source
  ├─ 4. cart.js: count publish() calls (expect 0)
  ├─ 5. sweep harness: confirm path
  ├─ 6. preview deploy: identify mechanism + verify reflects HEAD
  ├─ 7. cart-icon-bubble: confirm header.liquid actual selector
  └─ 8. SKU rendering: confirm exists or doesn't in product-hero.liquid
       └─ output: ready-to-proceed gate, OR list of blockers for Phase 01
```

## Related Code Files

**Read-only (verification targets):**
- `D:\github local\pod-tee-theme\snippets\dopamiles-tokens.liquid`
- `D:\github local\pod-tee-theme\sections\header.liquid`
- `D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid`
- `D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid`
- `D:\github local\pod-tee-theme\templates\product.json`
- `D:\github local\pod-tee-theme\assets\dopamiles-cart.js`
- `D:\github local\pod-tee-theme\assets\dopamiles-*.css` (all)
- `D:\github local\crushroom-form\plans\reports\visuals\web-testing-260508-1904-pod-tee-theme-mobile\comprehensive-sweep.spec.mjs`

**Modify:** none

**Create:** optional — `verification-notes.md` if outputs are large.

## Implementation Steps

### Step 1 — Tokens file truth

```
grep -n "dop-low\|dop-accent-text\|dop-accent " D:\github local\pod-tee-theme\snippets\dopamiles-tokens.liquid
```

Expected: `--dop-low: #C84A2A` at line 32. `--dop-accent: #F26419` at line 27. `--dop-accent-text` undefined.

Decide token strategy:
- **Option A (preferred):** Reuse existing `--dop-low` directly in shared.css `:where()` rule and per-template overrides. No new token. Honors DRY.
- **Option B:** Add `--dop-accent-text: var(--dop-low);` alias in tokens.liquid:33. Adds semantic name without duplicating hex. Honors KISS.

**Pick Option A** unless stakeholder wants the semantic alias. Document choice here.

### Step 2 — CSS audit: color: var(--dop-accent) sweep

```
grep -rn "color:\s*var(--dop-accent)" D:\github local\pod-tee-theme\assets\
```

Expected ~70 matches across 12 CSS files. For each match, classify:
- **TEXT (small):** swap to `--dop-low` (e.g., eyebrow, jnl-eye, breadcrumb-active, .dop-stars, breadcrumb numbers, tab labels).
- **TEXT (large display ≥24px):** keep `--dop-accent` (passes 3:1 large-text contrast).
- **NON-TEXT:** decoration only — `border-color`, `accent-color`, italic display `<em>` accent. Keep as-is. (These are NOT in this grep — grep only catches `color:`.)
- **DECORATIVE TEXT** (italic accent in large headings): keep `--dop-accent`. Italic `<em>` in display headings is not subject to small-text rules.

Output: a table or list of file:line → decision (KEEP / SWAP). Phase 04 consumes this list directly.

Special cases identified by red-team:
- `dopamiles-pdp.css:651` — `.dop-stars` (small icon-text). SWAP candidate but star icons are decorative — verify if the color is for star fill or label text.
- `dopamiles-utility.css:194` (`.dop-404-art-tag`) — currently `background: var(--dop-accent)` with white text. NOT in this grep. Phase 04 covers separately.
- `dopamiles-home.css:417` (`.doh-split-photo-tag`) — already handled in shared.css `:where()` rule per round-1.

### Step 3 — Sticky-mobile-ATC + product.json

```
grep -n "mobile-sticky-atc" D:\github local\pod-tee-theme\templates\product.json
```

Confirm block id `dopamiles-mobile-sticky-atc` is in `block_order`. Read sticky-ATC source:

```
D:\github local\pod-tee-theme\sections\dopamiles-mobile-sticky-atc.liquid
```

Identify variant-dependent surfaces:
- `.ms-price` (line 16) — `{{ product.selected_or_first_available_variant.price }}` — server-rendered, never updated.
- `[data-sticky-atc-btn]` (line 23) — `{{ 'products.product.add_to_cart' | t }}` literal text. Static.
- `aria-label` (line 25) — same literal. Need to update to "Sold out" / "Unavailable" when variant changes.

Output: decide whether sticky-ATC button label needs to change on sold-out (yes — accessibility). Pass spec to Phase 01.

### Step 4 — Cart.js pubsub publish audit

```
grep -n "publish(\|PUB_SUB_EVENTS" D:\github local\pod-tee-theme\assets\dopamiles-cart.js
```

Expected: 0 hits. Confirms Phase 02 must add manual `publish(PUB_SUB_EVENTS.cartUpdate, cart)` after every successful add/change/remove.

Verify import path: open file head, confirm if `pubsub.js` is loaded by theme.liquid before cart.js. If not, ensure `publish` is reachable via `window.publish` and `PUB_SUB_EVENTS` global. Otherwise, Phase 02 imports them.

```
grep -n "pubsub" D:\github local\pod-tee-theme\layout\theme.liquid
grep -n "publish\|PUB_SUB_EVENTS" D:\github local\pod-tee-theme\assets\global.js
```

### Step 5 — Sweep harness path

Confirm:
```
D:\github local\crushroom-form\plans\reports\visuals\web-testing-260508-1904-pod-tee-theme-mobile\comprehensive-sweep.spec.mjs
```

Document the run command (`npx playwright test ...`?). Check the file's first 30 lines for usage.

### Step 6 — Preview deploy mechanism

Round 1 found preview was stale (didn't reflect new code). Phase 05 sweep against stale preview = round 3 regression risk.

Investigate:
1. Is there a `.shopify` config in `D:\github local\pod-tee-theme\` (e.g. `.shopify/preview-theme-id`)?
2. Is there a GitHub Action syncing the branch to a development theme?
3. Does `shopify theme list --json` show a development theme tied to `feat/bug-fix-sprint`?
4. What is the published preview URL (`https://...?preview_theme_id=158279991548`)?

Run a deploy probe:
1. Check current git HEAD on `feat/bug-fix-sprint`.
2. `shopify theme push --development --json` from `D:\github local\pod-tee-theme\` (or whatever the documented mechanism is).
3. `curl https://{preview_url}` and verify a known new selector (e.g., a string only present in last commit) appears in HTML.
4. Document the verified deploy command for Phase 05 to use.

If `shopify` CLI not installed or auth missing: surface to user immediately (BLOCKED status).

### Step 7 — cart-icon-bubble actual selector

Read `D:\github local\pod-tee-theme\sections\header.liquid` lines 270-295. Verify:
- Cart icon is `<a id="cart-icon-bubble">` (anchor, NOT a div).
- Counter is `<div class="cart-count-bubble">` containing `<span aria-hidden>{{ cart.item_count }}</span>`.
- No `{% section 'cart-icon-bubble' %}` reference anywhere — header inlines markup.

**Implication:** Bundling `sections=["cart-icon-bubble"]` returns a `<div id="shopify-section-cart-icon-bubble">` that cannot be swapped into the live `<a id="cart-icon-bubble">`. Phase 02 must drop this from the bundle and update the count manually:

```js
// After successful add/change response (cart.item_count is in the cart JSON):
const bubbleCount = document.querySelector('#cart-icon-bubble .cart-count-bubble span[aria-hidden]');
if (bubbleCount) bubbleCount.textContent = cart.item_count;
const bubbleA11y = document.querySelector('#cart-icon-bubble .cart-count-bubble .visually-hidden');
if (bubbleA11y) bubbleA11y.textContent = `${cart.item_count} items`;
// Toggle the .cart-count-bubble visibility for empty cart
const bubble = document.querySelector('#cart-icon-bubble .cart-count-bubble');
if (bubble) bubble.style.display = cart.item_count > 0 ? '' : 'none';
```

Confirm element selectors against actual header.liquid in Step 7.

### Step 8 — SKU + bundle-banner variance check

```
grep -n "sku\|SKU\|product.selected_or_first_available_variant" D:\github local\pod-tee-theme\sections\dopamiles-product-hero.liquid
grep -n "selected_or_first_available_variant\|current_variant" D:\github local\pod-tee-theme\snippets\dopamiles-bundle-banner.liquid
```

Outputs:
- SKU: confirm if rendered. If not, Phase 01 skips `[data-dop-sku]` hook.
- bundle-banner: confirm if it shows variant-aware copy (e.g., variant title in banner). If yes, Phase 01 must add hook + update.

## Todo Checklist

- [x] Step 1 done — token strategy: **Option A (reuse `--dop-low`)** — see [verification-notes.md#step-1](verification-notes.md#step-1--tokens-done-)
- [x] Step 2 done — CSS sweep: **97 `color:` matches, 51 non-color uses** — classification rules + per-file table in notes
- [x] Step 3 done — sticky-ATC: `.ms-price`, button label, aria-label all variant-dependent. Phase 01 adds `data-sticky-atc-price` + `data-sticky-atc-label` hooks
- [x] Step 4 done — `dopamiles-cart.js` has **0 publish() calls** (confirmed); `pubsub.js` exposes globals, no ES module conversion needed
- [x] Step 5 done — sweep harness path verified, run command: `node comprehensive-sweep.spec.mjs`
- [x] Step 6 done — deploy command: `shopify theme push --theme 158279991548 --nodelete --json` — VERIFIED working (HEAD `07175b6` pushed); shop is `rfeixb-dd.myshopify.com` (= dopamiles.co custom domain)
- [x] Step 7 done — bubble: `<a id="cart-icon-bubble">` with conditionally-rendered `.cart-count-bubble` div; full 4-transition `updateBubbleCount(cart)` snippet in notes
- [x] Step 8 done — SKU: not rendered (skip hook); bundle-banner: not variant-aware (skip hook)
- [x] **COMPLETED** 2026-05-09 11:55 — all 8 verification items resolved, Phase 01-05 ready to proceed

## Success Criteria

- Phase 01-04 can begin without any "unverified" assumption in their plan files.
- Preview-deploy probe (Step 6) succeeded — Phase 05 sweep target is live.
- CSS sweep table (Step 2) lists every text-context `var(--dop-accent)` use; Phase 04 patches all of them.
- Token strategy decision recorded; Phase 04 references it.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `shopify theme push` requires auth not configured | Med | High | Surface to user; defer Phase 05 deploy step until auth resolved |
| CSS sweep classification mistakes (text vs decorative) | Med | Med | When in doubt, use DevTools to inspect rendered element on iPhone preview before deciding |
| Phase 00 outputs grow large; clutter phase file | Low | Low | Move detailed notes to `verification-notes.md` sibling, link from this phase |
| Pubsub `publish` not on `window` — needs `import` | Low | Med | Step 4 verifies; if module-only, add `import { publish, PUB_SUB_EVENTS } from './pubsub.js'` to cart.js |

## Security Considerations

- Read-only audit. No code, no network, no credentials.
- `shopify theme push` (Step 6) writes to a dev theme — does not affect production.

## Next Steps

- Phase 01 begins after Step 8 done.
- Phase 02 cannot start until Step 7 (cart bubble selector) and Step 4 (pubsub) resolved.
- Phase 05 sweep depends on Step 6 (preview deploy).
- All 4 implementation phases (01-04) consume Phase 00 outputs as ground truth.
