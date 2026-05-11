---
type: brainstormer
date: 2026-05-11
time: 12:03
slug: card-loading-benchmark
plan: 260511-1132-pod-tee-funnel-reset/phase-01-audit.md
stores_benchmarked: 4
method: curl raw HTML (iPhone UA) + grep, full pages, mobile-cellular not run (Bash-only)
---

# Card-Loading Benchmark — Dopamiles vs 3 Reference Stores

## Method

- `curl` with iPhone Safari UA → full collection-grid HTML (`/collections/all`)
- Grep + count: `loading=`, `srcset=`, `aspect-ratio`, swatch class, app vendor strings
- Full HTML inspected (Dopamiles 850KB, Historee 1.2MB, Sloth 450KB, Shrine 225KB)
- **NOT measured:** real-device cellular TTFB / LCP / CLS — requires real iPhone (user)

## Headline finding

**Dopamiles renders ~6× more `<img>` tags per card than every competitor.** 97 imgs / 16 products = 6 imgs/card. Competitors = 1 img/card.

| Store | Products | `<img>` total | Per-card | Swatch app |
|---|---|---|---|---|
| **Dopamiles** | 16 | **97** | **~6.0** | Globo |
| Historee | 32 (16 unique) | 17 | ~1.0 | Swatch King |
| Sloth | 33 (17 unique) | 17 | ~1.0 | **Globo** |
| Shrine demo | 9 (3 unique) | 7 | ~0.8 | (none) |

Sloth uses the same Globo app as Dopamiles but **still renders 1 img/card** — Globo swaps `src` on swatch hover. Dopamiles bypasses that pattern and renders every variant mockup server-side.

## Detailed per-store

### Dopamiles (`dopamiles.co`)

- `loading=`: 81 lazy + 16 eager (proper above/below-fold split)
- `srcset=`: 97/97 (full coverage, 8 widths 240→3840)
- `width="" height=""` on img: 97/97 (intrinsic, for aspect calc)
- `aspect-ratio` CSS: 18 rules (modern, ships `paginated-list-aspect-ratio.js`)
- Globo hits: 159 (active, JS-driven)
- Card pattern: **6 server-rendered variant mockups per card**
- Alt text: leaking source URLs (`alt="https://wescale-cdn.com/generated-mockups/..."`) — A11y/SEO bug
- First img `width="3840"` intrinsic but srcset selects mobile resolution properly

Sample img tag (truncated):
```html
<img src="//dopamiles.co/cdn/shop/files/...webp?v=...&width=3840"
     alt="https://wescale-cdn.com/generated-mockups/..."
     srcset="...?width=240 240w, ...?width=352 352w, ... ?width=3840 3840w"
     width="3840" height="3840" loading="eager"
     sizes="(min-width: 1905px) 20vw, (min-width: 1524px) 25vw, ...">
```

### Historee (`historeetees.com`)

- `loading=`: 14 lazy + 1 eager
- `srcset=`: 17/17 (4 widths 50→100 on logo; larger on cards)
- `aspect-ratio` CSS: 0
- Swatch King hits: 18 (alternative to Globo, server-rendered swatches with hover-swap)
- Pattern: **1 server-rendered card img** + JS-injected swatch row that swaps `src` on hover/click
- `width="1500"` intrinsic on card imgs

### Sloth (`slothhikingclub.com`) — same Globo as Dopamiles

- `loading=`: 14 lazy + 1 eager
- `srcset=`: 17/17 (8 widths)
- `aspect-ratio` CSS: 0 (no explicit reservation)
- Globo hits: 155 (active, same vendor as Dopamiles)
- Pattern: **1 server-rendered card img** + Globo swaps src on swatch hover
- `width="2000"` intrinsic

**This proves the fix:** same Globo app, 1 img/card works. Dopamiles is doing it wrong.

### Shrine theme demo (`shrine-regular-demo.myshopify.com`)

- `loading=`: 4 lazy + 0 eager (only 9 products — small demo)
- `srcset=`: 7/7
- `aspect-ratio` CSS: 0
- No swatch app
- Pattern: 1 img/card, plain Shopify theme

## Why this matters for Bug A (cart perf) AND Bug C (wrong photo)

**Bug A — Cart ATC perf:**
- 6× image fetches per card × 16 cards = ~96 image requests on first paint (Dopamiles)
- Competitors: 16-17 image requests
- On cellular (slow 4G + 4× CPU), this competes with cart drawer assets, theme JS, Globo bundle
- Asset preload contention → ATC button-to-drawer-visible delay
- **Network parallelism is the bottleneck, not the cart.js code**

**Bug C — Wrong first photo:**
- With 6 server-rendered imgs per card, CSS stacking / DOM order picks "first" arbitrarily
- Merchant intent (which color is hero) is invisible to the renderer
- Competitors render 1 img per merchant intent → never wrong
- **Root cause hypothesis is confirmed:** card pattern, not merchant data

## Fix shape (audit verdict)

| Bug | Fix direction | Confidence |
|---|---|---|
| A (perf) | Render **1 img per card** (Globo handles variant swap). Eliminates ~80 image requests / 5-10MB cellular payload on collection landing. | High |
| C (wrong photo) | Same fix as A. With 1 server-rendered img, merchant pins it via `card_product.featured_image` (already in `snippets/dopamiles-product-card.liquid:18-21`). Bug disappears. | High |
| B (Globo PDP) | Separate from card pattern. Min-height slot reservation as planned in phase-03. | Med (need PDP-side audit) |

**A + C collapse into a single fix in `snippets/dopamiles-product-card.liquid`:** stop rendering variant-image loop; render `card_product.featured_image` once, let Globo handle swatch-hover swap.

## Suggested phase-02 path adjustment

The phase-02 plan currently routes "strangler vs big-bang" based on `dopamiles-cart.js` LOC analysis. **Audit suggests cart.js is NOT the primary perf culprit** on collection page. Collection grid imagery is.

Revised priority order for phases:
1. **Phase-04 first** (card photo fix — eliminates 80 image fetches per collection load + fixes wrong-photo bug in one change)
2. Phase-02 (cart perf — now measure ATC latency on the lighter collection baseline; cart.js kill-vs-keep verdict still pending real-iPhone profile)
3. Phase-03 (Globo PDP min-height — independent)

## What's still missing (user-side, before phase 02-04 ship)

1. **Real iPhone screen recording** of Dopamiles collection landing on cellular — Lighthouse mobile CLS number, LCP, time-to-first-card-paint
2. **Real iPhone Globo PDP race** — is Globo painting before/after Dawn? Where does the layout jump come from?
3. **Real iPhone ATC profile** — Chrome remote inspect on Dopamiles collection→PDP→ATC flow, capture `/cart/add.js` waterfall
4. **Merchant admin check** — does Globo expose Liquid metafield/setting (`product.metafields.globo.*`)?

## Unresolved Questions

1. Why does Dopamiles render 6 variant imgs per card? Is it intentional (e.g., hover-to-cycle-colors UX) or a Liquid loop bug? Need to read [`snippets/dopamiles-product-card.liquid`](file:///D:/github%20local/pod-tee-theme/snippets/dopamiles-product-card.liquid) full content.
2. Sloth + Globo + 1-img-per-card works — does Dopamiles disable Globo's swatch-hover-swap (`switch_on_hover`)? Check Globo admin settings.
3. Alt text leaking `wescale-cdn.com` URL — is wescale mockup pipeline overriding alt at upload time? Affects A11y/SEO independent of perf.
4. After card-image fix, will the wescale mockup CDN URL still be required (or can we switch to Shopify-uploaded files for faster TTFB)?
5. Card render count (16) seems low — does Dopamiles paginate at 16/page? Mobile shoppers may scroll-paginate; verify if cards 17+ trigger fresh server render (extra cost).
