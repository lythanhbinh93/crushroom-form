---
title: Third-party script audit (for Shopify-admin action)
created: 2026-05-20
preview-theme: dopamiles-bundle-prod-260508 (158279991548)
source: rendered HTML on dopamiles.co (live theme, mirror of preview)
---

# Third-party script audit — Shopify admin actions for further perf gains

After Phase 1 (CLS fix) + Quick Wins (LCP image priority + image srcset), mobile Perf landed at **80**. Remaining ≥90 target is gated by **848 KiB of unused JavaScript** that lives outside theme code — Shopify-injected scripts the merchant controls via the Admin.

## Identified 3rd-party scripts on every page

| Script | Size | Source | Required? | Action |
|---|---|---|---|---|
| `portable-wallets.en.js` | **385 KB** | Shopify Pay / Shop Pay / Apple Pay / Google Pay button library | Yes for product/cart pages; NO for home/collection | Can't remove easily — Shopify auto-injects for accelerated checkout. The bulk of unused-JS comes from here. |
| `shopify-perf-kit-3.5.0.min.js` | 66 KB | Shopify Web Performance Kit | Optional | Check: Admin → Online Store → Preferences → Web Performance. If unused, disable. |
| `globoswatch.js` | 6 KB | Globo Color Swatch app | **No** — theme has its OWN `.dop-color-dot` swatch implementation in `dopamiles-product-card.liquid` | **Uninstall the Globo app**: Admin → Settings → Apps → "Globo Color Swatch" → Uninstall. ~6 KB direct + any associated CSS/CSS variables. |
| `storefront-bf1cdb70.js` (shopify_pay) | small | Shopify Pay baseline | Yes | Required. |
| `load_feature-*.js` | small | Shopify storefront internals | Yes | Required. |
| `preloads.js` (shop.app) | small | Shop App preloads | Yes if Shop App enabled | Optional — disable Shop App promotion if not using. |
| `trekkie`, `monorail`, `analytics`, `pixel` (inline) | varies | Shopify Customer Events / GA / Meta Pixel etc. | Depends on tracking needs | **Audit list at:** Admin → Settings → Customer Events. Disable any pixel/tag you're not actively reading data from. |

## Recommended Shopify admin actions (in order of effort vs gain)

### 1. Uninstall the Globo Color Swatch app (5 minutes)
- **Where:** Admin → Settings → Apps and sales channels → "Globo Color Swatch" → Uninstall
- **Risk:** None — the dopamiles theme uses its own `.dop-color-dot` implementation in the product card snippet. Confirmed via grep of theme code; no references to `globoswatch` exist outside the Shopify CDN load.
- **Expected gain:** ~6 KB JS + any CSS the app injects (typically 5-15 KB) + cleaner DOM. Maybe +1-2 perf points.

### 2. Audit Customer Events / pixels (15-30 minutes)
- **Where:** Admin → Settings → Customer Events
- **Action:** List every pixel/tag currently installed. For each: (a) confirm someone reads the data from it (Klaviyo, Meta Ads Manager, GA4 dashboards), (b) if no one does, disable.
- **Expected gain:** highly variable, ~30-200 KB per disabled tag. If 2-3 unused tags found, potentially +5-10 perf points.

### 3. Disable Web Performance Kit if not used (5 minutes)
- **Where:** Admin → Online Store → Preferences → look for "Web performance" or "Shop App" promotion toggles
- **Action:** Most stores have this on by default. If you're not consuming the perf kit's data, toggle off.
- **Expected gain:** ~66 KB JS. Maybe +2-3 perf points.

### 4. Cannot remove without breaking commerce flow
- `portable-wallets.en.js` (385 KB) — Shop Pay accelerated checkout buttons. Removing breaks Shop Pay.
- Trekkie / monorail / Shopify analytics — Shopify's own commerce analytics. Required.

## Out-of-scope for theme code

These remaining gaps require admin work, not code changes. The theme is doing its part — it's already optimally route-split (Phase 2+3 audits), all scripts are deferred, fonts are non-blocking, images are now responsive + LCP-prioritized.

## Expected ceiling

If items 1-3 are completed and 2-3 unused pixels are dropped, mobile Perf should land in the **85-90** range on Lighthouse simulate. Real-user CrUX (which weighs core web vitals over throttle-simulated metrics) should be much closer to 90+ on most devices because real desktop / fast mobile won't suffer the simulated payload penalty.
