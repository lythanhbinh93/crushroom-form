---
title: pod-tee collection CLS fix shipped — 1-char change kills desktop CLS=0.45
date: 2026-05-20
branch: feat/pdp-perf-pareto
plan: 260520-1600-pod-tee-collection-perf-pareto
shipped:
  - "pod-tee-theme 2f46304: font-display swap -> optional in theme.liquid"
  - "pod-tee-theme 583f4f5: same fix in gift_card.liquid (parity catch from review)"
  - "pod-tee-theme 416abc0: predecessor — grid-auto-flow dense + stats toggle (committed pre-session as cleanup)"
  - "crushroom-form: full plan + 4 reports + 12 Lighthouse raw JSONs"
---

# pod-tee collection CLS fix — what shipped, what was surprising

## What

Started session intending to execute all 4 phases of plan `260520-1600-pod-tee-collection-perf-pareto` (CLS fix + CSS route-split + JS route-split + re-measure). User explicitly chose "all 4 phases this session" + automated investigation.

**Net code change: 2 characters.** `&display=swap` → `&display=optional` in `layout/theme.liquid` Google Fonts URL (×2 references — main + noscript fallback) and the same in `templates/gift_card.liquid` (layout-bypass parity).

**Net metrics change** on `/collections/all` desktop: Perf 74 → 91 (+17), CLS **0.454 → 0.0002** (-99.96%). Bundle-eligible collection desktop: 93 median. Both URLs hit the ≥90 target on desktop.

## The plan author was wrong about root cause — and so were we

The Pareto baseline doc (260520-1547) hypothesized that adding `grid-auto-flow: dense` to `.doc-grid` in Phase 2 of the predecessor plan caused the 0.45 desktop CLS. The plan offered three fix options, all targeting grid-density or aspect-ratio reservations on product card images.

All three were red herrings. Real cause: web-font swap reflow when Fraunces, Inter, and Inter Tight load asynchronously via the `media="print"` defer trick. Under Lighthouse `--throttling-method=simulate`, the simulator stretches the font-load window enough that the swap event lands well after the initial paint, reflowing `div.dop-container` (whole content area).

**How we figured out the real cause:** dual-instrumented the page.
- Lighthouse `simulate` reproduced the 0.45 CLS reliably (consistent with baseline).
- Puppeteer `PerformanceObserver({type: 'layout-shift', buffered: true})` on real-time desktop Chrome showed CLS = **0.032**.
- 14× gap between the two = "the simulator is amplifying something." The "something" turned out to be the font-swap window.
- Lighthouse `audits['layout-shifts'].details.items[0].subItems` explicitly listed 3 URLs on `fonts.gstatic.com` with `cause: "Web font loaded"`. That was the smoking gun.

Lesson: when Lighthouse and DevTools disagree, the disagreement IS the signal. And the `layout-shifts` audit subitems are the authoritative source for CLS attribution — beats any code-review hypothesis, even from informed eyes.

## Phase 2 + 3 were no-ops — and that was the right call

The plan estimated 180KB unused CSS + 170KB unused JS could be route-gated. Inventory showed otherwise:
- `dopamiles-feedback.css` looks like it's only customer-pages, but `.dop-li` (line items) actually renders inside the cart drawer's DOM on every page (drawer is always present, just hidden).
- `dopamiles-bundle.css` is referenced by `.dop-bundle-pill` (every product card across home/search/collection/PDP recs) + `.dop-bundle-cart-headline` (in the always-present drawer).
- `predictive-search.js` defines a Web Component used by the header search icon on every page — gating breaks it everywhere.
- The Lighthouse "Reduce unused CSS" audit counts selector-level dead code inside loaded files, not file-level. Route-gating files we can't gate doesn't move the audit.

We wrote audit reports (`phase-02-css-route-split.md`, `phase-03-js-route-split.md`) documenting why each candidate was rejected. Useful for future devs who might re-attempt this without re-doing the inventory.

## What about mobile?

Mobile median Perf dropped 3 points on `/collections/all` (69 → 66) with LCP +860ms. Attributed to `display=optional`'s 100ms FOIT block under simulated slow 4G + 4× CPU throttle — simulator stretches that 100ms into a much larger LCP penalty than real-world.

Trade-off accepted because:
- Mobile baseline was 69 (also failing ≥90), so going to 66 doesn't change "failing" status.
- The desktop CLS fix is real-user-impactful via Core Web Vitals reporting (CrUX uses real device data, not simulator).
- Production CDN drops TTFB ~1200ms vs `theme dev` localhost, so real mobile LCP will be lower than the simulator suggests.

Plan to verify with production CrUX 7-14 days after deploy.

## Process notes

- **`shopify auth logout` + `shopify theme dev`** was the right path through the Shopify CLI auth flow. Earlier verification-code OAuth went interactively in the user's browser; once authenticated, the dev server stayed alive for the remainder of the session.
- **Existing dev server on port 9292** was stuck in a "Failed to Upload Theme Files" state (left over from a 3-hour-old session); killing PID and restarting fresh resolved.
- **Lighthouse via `npx lighthouse@13.3.0`** has a known Windows tmp-cleanup permission error on exit, but the JSON output is written before the error — `ls` confirmed, then read normally.
- **Code review caught one parity miss**: `gift_card.liquid` is a layout-bypass template (memory `[[shopify_layout_bypass_templates_quirk]]`) and didn't inherit the theme.liquid font-display change. Fixed in 583f4f5. `password.liquid` was inspected and left alone — its `font_face` calls serve merchant-selected fonts, not Dopamiles brand fonts.

## What's deferred to a future plan

- **Mobile perf ≥90** is gated by TTFB and aggregate payload (~4.8MB). Requires a build pipeline (esbuild/Rollup) to tree-shake `global.js` (45KB Dawn core utils) and srcset/sizes audit on product images.
- **Production CrUX validation** of the desktop CLS fix. Should land within 28 days of next live deploy. If CLS improvement doesn't materialize in real user data, the fix theory was wrong.
- **`templates/gift_card.liquid` + `layout/password.liquid` font_face audits** — layout-bypass templates that don't inherit theme.liquid. Gift card got the parity fix; password.liquid intentionally left for merchant-side font handling.

## Unresolved questions

- Whether to also preload Fraunces 400 woff2 directly (to give it a head start within the 100ms `optional` block). Brittle (Google Fonts URLs are version-stamped) but would reduce slow-3G mobile fallback rate. Defer to RUM data review.
- Whether `display=fallback` (100ms block + 3s swap window) would be a better middle ground than `optional` — would re-introduce some swap shift on mobile but cap LCP impact. Defer to RUM.
