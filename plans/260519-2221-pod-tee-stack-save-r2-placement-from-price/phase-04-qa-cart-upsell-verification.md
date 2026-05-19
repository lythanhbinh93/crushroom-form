---
phase: 4
title: "QA + Cart Upsell Verification"
status: complete
priority: P1
effort: "45m-1h"
dependencies: [1, 2, 3]
note: "Visual QA confirmed by user 2026-05-19. Lighthouse mobile re-baseline + theme-editor `bundle_cta_url` picker live test deferred to follow-up."
---

# Phase 4: QA + Cart Upsell Verification

## Overview

Live walkthrough on the Shopify dev preview to verify the four Round 2 changes plus regression-check the already-shipped cart-drawer bundle headline. Halt before commit if any check fails. Lighthouse mobile re-baseline to confirm no perf regression.

## Requirements

- Functional: every Success Criterion from Phases 1–3 verified end-to-end.
- Functional: `dopamiles-bundle-cart-headline.liquid` renders correctly in the cart drawer at qty 1/2/3/4/5+ states.
- Non-functional: Lighthouse mobile PDP score ≥90 (parent perf floor).
- A11y: radiogroup keyboard nav, screen-reader announcement of "From $X" totals, focus-visible on tier focus.

## Test Matrix

### PDP placement + banner removal (Phase 1)

| # | Scenario | Pass criterion |
|---|---|---|
| 1.1 | Open bundle-eligible PDP | Slim banner is NOT rendered. Full Stack & Save card sits directly under ATC button. |
| 1.2 | Mobile 360px viewport | Card header visible without scrolling past ATC. |
| 1.3 | Theme editor → `bundle_style = "kit"` | Legacy kit widget renders at the new slot. |
| 1.4 | Theme editor → `bundle_enabled = false` | No bundle widget rendered at all. |

### Configurable CTA URL (Phase 2)

| # | Scenario | Pass criterion |
|---|---|---|
| 2.1 | Theme editor → unset `bundle_cta_url` | CTA links to `/collections/all`. |
| 2.2 | Theme editor → pick `/collections/bundle-eligible` | CTA reflects the chosen URL after save + reload. |
| 2.3 | Click tier 5 with custom URL set | `syncCta` outputs the chosen URL in `.cta` href. Inspect via DevTools. |
| 2.4 | Pick external URL (e.g. `https://example.com`) | URL accepted; CTA href updated. |

### From-$X variant-aware pricing (Phase 3)

| # | Scenario | Pass criterion |
|---|---|---|
| 3.1 | Open PDP, do NOT pick a size | SSR shows `From $X` on totals, savings, per-tier totals. Default middle tier active. |
| 3.2 | Click first size variant | All `From` prefixes drop; totals snap to exact picked-size price. <16ms transition. |
| 3.3 | Switch size variants (S → 2XL) | Totals re-snap; per-tier totals reflect new unit price. |
| 3.4 | Click another tier after picking size | New tier's totals use exact (no `From`) pricing. |
| 3.5 | Hard reload, do NOT pick size, click tier 2 | Tier 2 totals show `From $X` (SSR state preserved across tier swaps when no size picked). |
| 3.6 | Screen reader on SSR initial state | Announces "from sixty-four dollars" naturally; no awkward parsing of `From`. |

### Cart upsell (already shipped — verify only)

| # | Scenario | Pass criterion |
|---|---|---|
| 4.1 | Empty cart → open drawer | Bundle headline hidden. |
| 4.2 | Add 1 bundle-eligible product | Headline: "Add 1 more · save $X each" + CTA. |
| 4.3 | Add 2 (cart = 2) | Headline: "✓ $X off each · Add 1 more for $Y each + FREE SHIPPING". |
| 4.4 | Add 3 (cart = 3) | Headline: "✓ $Y off each + FREE SHIPPING · Build a 5-pack for $Z each". |
| 4.5 | Add 5 (cart = 5+) | Headline: "✓ Max savings: $Z off each tee". |
| 4.6 | Remove items back to qty 1 | Headline reverts through states correctly. |

### Cross-phase regression

| # | Scenario | Pass criterion |
|---|---|---|
| 5.1 | Radiogroup keyboard (Arrow / Home / End / Space / Enter) | All keys behave per v1 spec. |
| 5.2 | `PUB_SUB_EVENTS.cartUpdate` from PDP add-to-cart | Bar advances; counter updates. (C1 fix from v1 review still works.) |
| 5.3 | Add 2 separate bundle-eligible products | Counter reads `2 / 3`, not `1 / 3` (verifies `/cart.js` fallback still works). |
| 5.4 | `shopify theme check` | Zero new offenses on modified files. |
| 5.5 | DevTools Lighthouse mobile PDP (3 cold runs) | Median Performance ≥90. |
| 5.6 | Git diff review | No accidental changes to bundle-banner.liquid, bundle-inline.liquid, dopamiles-pdp.js, gallery, sticky-ATC, or variant-sync. |

## Related Code Files

- Read: `assets/dopamiles-stack-save.{css,js}`, `snippets/dopamiles-stack-save.liquid`, `sections/dopamiles-product-hero.liquid`, `snippets/dopamiles-bundle-cart-headline.liquid`.
- Tools: Shopify CLI `theme check`, Chrome DevTools Lighthouse, NVDA / VoiceOver.

## Implementation Steps

1. **Dev preview live** — confirm http://127.0.0.1:9292 is responsive; hard-reload after each phase merge.
2. **Phase 1 sweep** — run scenarios 1.1–1.4 in order.
3. **Phase 2 sweep** — set up theme-editor session: open `/admin/themes/{id}/editor?hr=9292`; navigate to Product page → Bundle widget; run 2.1–2.4.
4. **Phase 3 sweep** — run 3.1–3.6. Use DevTools Elements to verify `data-has-picked-size` flips from `false` to `true` after first variantChange.
5. **Cart upsell sweep** — run 4.1–4.6. Watch DevTools Network: each cart-update should re-render the headline server-side (Dawn `/cart/update.js` returns the section HTML).
6. **Cross-phase regression** — run 5.1–5.6.
7. **Lighthouse baseline** — DevTools → Lighthouse → Mobile → Performance. Run 3 cold loads (incognito + clear cache between runs). Compare median to baseline in `plans/260519-1215-pdp-perf-round-2/reports/p2-after-report.md` (perf-round-2 final report). Halt if mobile Performance score drops below 90 OR delta < -2 points.

<!-- Updated: Validation Session 1 - fix non-existent baseline-summary.json citation; point to actual p2-after-report.md -->

8. **Diff review** — `git diff` over the three modified files. Confirm scope locked to placement + schema + from-$X.
9. **Conventional commit** — `feat(pdp): stack & save R2 — placement under atc, configurable cta, from-$X variant pricing`.

## Success Criteria

- [ ] All test-matrix items pass (24 total).
- [ ] Lighthouse mobile median ≥90.
- [ ] Cart-drawer bundle headline verified across 5 states.
- [ ] No new theme-check offenses.
- [ ] No regression in dopamiles-pdp.js / variant-sync / gallery / sticky-ATC.
- [ ] Clean conventional commit, no AI references.

## Risk Assessment

- **Cart-headline regression** — the cart-drawer headline is plumbed via `dopamiles-cart-helpers.js` + Dawn `cart.js`. We didn't touch either, but the v1 stack-save card subscribes to `PUB_SUB_EVENTS.cartUpdate`. Confirm both subscribers fire on add; neither suppresses the other.
- **Lighthouse perf** — Round 2 doesn't add new CSS/JS bytes (in-place edits). Risk is minimal. Largest concern is whether the new card slot triggers extra layout work above the fold. Mitigation: card sits below ATC (already-rendered region), shouldn't disrupt LCP.
- **Theme-editor `type: "url"` setting interaction** — confirm URL picker doesn't render with required-asterisk; setting must be optional. Test by clearing the picker and re-saving.
- **Plural copy edge cases** — `From $0.50` rounding, `From $0` (impossible since min variant > 0), savings of `$0` (impossible at qty ≥ 2). All defensive checks unnecessary in practice; flag if QA surprises.

## Unresolved questions

- **A/B between R1 and R2 placement?** — out of scope this round; if conversion drops post-R2, revert by moving the branch block back to L306 (1-line cherry-pick).
