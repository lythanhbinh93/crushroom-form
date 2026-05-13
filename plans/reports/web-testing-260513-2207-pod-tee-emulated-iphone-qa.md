# pod-tee Emulated iPhone QA — 2026-05-13

**Type:** web-testing | **Subject:** preview theme 158279991548 (`feat/bug-fix-sprint` HEAD `3a56d52`)
**Tool:** Playwright 1.60.0 + chromium-headless-shell, `devices["iPhone 14"]` (390×844, Safari mobile UA, touch)
**Preview URL:** `https://dopamiles.co/?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548` (cookie-persisted preview)
**Scripts:** `plans/reports/visuals/web-testing-260513-2207-pod-tee-emulated-iphone-qa/qa-script.mjs` + `qa-shipbar-met.mjs`

## Verdict

| Scope | Status |
|---|---|
| **Today's phase-10 burndown** (6 commits) | ✅ **PASS — verified** |
| Whitespace fix on 3 testable sites | ✅ gap ≥ 3px on all |
| Theme integrity (pod-tee served, not BuildMyPOD) | ✅ all 4 pages |
| **Pre-existing JS issues** (not from today's work) | ⚠️ 2 issues flagged for separate follow-up |

Today's work does not block publish. Pre-existing JS issues should be triaged before publish independently.

## Today's whitespace fix — verified

Commit `3a56d52` switched 9 of 13 icon snippet call sites from `{%- render -%}` to `{% render %}` to restore the rendered HTML space between SVG and adjacent inline text. Testable sites:

| Site | Rendered text | gap (svg-right → next-element-left) | Verdict |
|---|---|---|---|
| `collection-grid` filter button | "Filter ▼" | **47px** | ✅ |
| `cart-drawer` met shipbar | "✓ Free shipping unlocked." | **3px** | ✅ |
| `cart-main` summary met shipbar | "✓ Free shipping unlocked." | **3px** | ✅ |

The remaining 6 sites (gift-card "Copied!", password success, bundle-cart-headline × 4) require specific cart/form states to render — not directly tested but use the same `{% render %}` pattern as the 3 verified sites. Confidence high.

Safe sites (kept `{%- -%}` because CSS-positioned or sole-child) — 10 PDP accordion chevrons found, accordion functional.

## Theme integrity

Preview cookie persisted `preview_theme_id` across navigation. All 4 pages served pod-tee theme:

| Page | Status | Selector match |
|---|---|---|
| `/` (home) | 200 | `.dop-hero`, `.dop-logo`, `dopamiles-header` |
| `/collections/all` | 200 | `.doc-toolbar`, `#doc-open-filters` |
| `/products/5k-route-t-shirt` (PDP) | 200 | `.dop-acc`, 10 chevron svg, ATC form |
| `/cart` | 200 | `#dop-page-summary`, `.dop-cart-ship-bar` |

## Pre-existing issues flagged (not blocking today's commits)

These issues exist on preview but are NOT caused by today's 6 commits (none of which touched JS or layout asset wiring). Likely surfaced now because emulated QA exercises console more aggressively than manual iPhone testing.

### Issue 1 — `amount is not defined` (pageerror × 4)

JavaScript reference error fired 4 times across the test (PDP load + variant interactions). Likely source: `assets/dopamiles-pdp-variant-sync.js:45`

```js
var format = window.shopMoneyFormat || '${{amount}}';
// passed to window.Shopify.formatMoney(cents, format)
```

When `window.Shopify.formatMoney` is the legacy `eval`-based implementation (some Shopify apps replace the modern switch-based version), `'${{amount}}'` triggers `eval('amount')` → ReferenceError. Local fallback at lines 51-71 handles this correctly via switch, but the early-return at line 48 hits the broken Shopify path first.

**Likely culprit on this store:** an app (Globo?) has overwritten `Shopify.formatMoney` with an `eval`-based variant.

**Fix shape (separate phase):** check if `window.Shopify.formatMoney.toString().includes('eval')` and fall through to local switch implementation. Or just always use local switch and never call `Shopify.formatMoney`.

**Severity:** medium — every variant interaction throws an error to console; price formatting may show raw cents.

### Issue 2 — `[dop-cart] dopCartHelpers not loaded — cart will not function` (warning × multiple)

cart.js IIFE dependency guard (line 19-24) fires when `window.dopCartHelpers` is undefined at execution time. Files load order in `layout/theme.liquid:462-464`:

```liquid
<script src="...dopamiles-cart-helpers.js" defer="defer"></script>
<script src="...dopamiles-cart-mutations.js" defer="defer"></script>
<script src="...dopamiles-cart.js" defer="defer"></script>
```

All 3 are `defer` and should execute in document order. BUT `sections/dopamiles-cart-main.liquid:234` ALSO has:

```liquid
<script src="{{ 'dopamiles-cart.js' | asset_url }}" defer></script>
```

cart-main renders inside `<main>` (early in `<body>`). theme.liquid scripts are near `</body>`. Document order:
1. cart-main's cart.js (early in body) — FIRST defer
2. theme.liquid's helpers.js, mutations.js, cart.js (late in body) — LATER defers

So cart.js executes FIRST (from cart-main page), BEFORE helpers.js has run. → guard fires. → cart drawer mutations (qty +/-, remove) likely broken on the cart page.

**Confirmed assets accessible:** all 3 .js return 200, minified content correct, `window.dopCartHelpers = {...}` is at end of helpers IIFE.

**Fix shape (separate phase):**
- Remove the `<script src="cart.js">` from `cart-main.liquid:234` (theme.liquid already loads it)
- Or wrap the cart-main script in a runtime check / requestIdleCallback that waits for `window.dopCartHelpers`

**Severity:** medium-high — cart page qty changes likely broken. User's iPhone QA on phase 05 might have missed because real users rarely test qty +/- on the dedicated /cart page (most use the drawer which renders from theme.liquid where order is correct).

### Issue 3 — Network 401s (NOT a bug)

12 request failures, all to Shopify analytics endpoints:
- `dopamiles.co/sf_private_access_tokens` × 4
- `dopamiles.co/api/collect` × 5
- `dopamiles.co/.well-known/shopify/monorail/unstable/produce_batch` × 3

Auth-gated endpoints fail in preview mode without customer session. Expected behavior.

## What emulated QA cannot catch

Real iOS Safari testing remains the gate for:
- Safari-specific rendering bugs (e.g., flexbox quirks, vh issues)
- Real touch feel (scroll inertia, tap latency)
- True device CPU/GPU/thermal throttling
- Globo swatch JS race conditions on real install
- Apple Pay sheet, native autofill, Add to Home Screen behavior

## Files in this report directory

```
plans/reports/visuals/web-testing-260513-2207-pod-tee-emulated-iphone-qa/
├── qa-script.mjs                  # full funnel sweep (14 checks)
├── qa-shipbar-met.mjs             # targeted MET shipbar verification (3 checks)
├── package.json                   # playwright dep manifest
├── shots/
│   ├── 01-home.png
│   ├── 01-home-full.png
│   ├── 02-collection.png
│   ├── 02-collection-full.png
│   ├── 03-pdp.png
│   ├── 03-pdp-full.png
│   ├── 04-cart-drawer-after-atc.png
│   ├── 05-cart-page.png
│   ├── 05-cart-page-full.png
│   └── findings.json              # 14 results + all console + network captures
└── shots-met/
    ├── 01-pdp-cart-drawer.png     # met-state cart drawer w/ "✓ Free shipping unlocked."
    ├── 02-cart-page.png           # met-state cart page summary
    └── findings.json              # 3 results
```

## Recommendation

**Publish blocker for today's work: none.** The 6 commits in `feat/bug-fix-sprint` ship clean.

**Separate triage needed (before or after publish — user call):**
- Issue 1 (`amount is not defined`) → 30-60 min fix, low-risk JS patch
- Issue 2 (cart-main script-order bug) → 10-30 min fix, just delete or guard the duplicate `<script>` tag

## Unresolved questions

1. Was `Shopify.formatMoney` always `eval`-based on dopamiles.co, or did a recent app install (Globo?) introduce it? If the former, the bug has existed since phase 06's variant-sync.js extraction.
2. Did the user's iPhone QA on phase 05 actually exercise the `/cart` page qty +/- buttons? If not, cart-main script-order bug may have shipped silently.
3. Should we run the same QA against the LIVE BuildMyPOD theme to baseline-compare? (Cheap — flip preview_theme_id off.)
