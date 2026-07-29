# Phases 01-02 — implementation report

Date: 2026-07-25
Repo: `D:\github local\pod-tee-theme`, branch `fix/codebase-audit-batch-260613`
Status: **uncommitted working tree, nothing pushed to any theme**

## What shipped

**Phase 01 — tier counting truth.** Bug 1 fixed: savings are now
`tier amount × actual eligible quantity`, not `× tier threshold`. Qty 4 renders
$12 (was $9); qty 6 renders $30 (was "$25+"). The five hardcoded quantity
branches collapsed into a resolver plus one render block, so adding the second
count did not multiply the branch count.

Bug 2 is implemented but **left off**, per the phase's safe-default path.
`settings.dop_bundle_tier_basis` picks the counting basis; default `eligible`
preserves today's under-promising behaviour exactly.

**Phase 02 — recommendation strip.** `snippets/dopamiles-cart-recs.liquid` plus
`dopamiles-cart-rec-card.liquid`, rendered in both drawer states. Pure Liquid,
theme-global settings only, hard cap 3 cards, cards link to PDP.

## Files

| File | Change |
|---|---|
| `snippets/dopamiles-bundle-cart-headline.liquid` | rewritten — two counts, resolver, computed markers |
| `snippets/dopamiles-cart-recs.liquid` | new — strip source, dedup, manual-first, empty guard |
| `snippets/dopamiles-cart-rec-card.liquid` | new — one card |
| `sections/dopamiles-cart-drawer.liquid` | total-units marker; strip in both states; legacy upsell demoted to else-branch |
| `assets/dopamiles-stack-save.js` | count split (`eligibleCount` / `totalCount`), `tierBasis` gate |
| `assets/dopamiles-cart.css` | `.dop-cart-recs*` (§08b) |
| `config/settings_schema.json` | `dop_bundle_tier_basis` + 7 recs settings |
| `tests/liquid-harness.js` + 3 test files | new |
| `package.json`, `package-lock.json`, `.gitignore` | liquidjs devDependency |

Untouched, as required: `snippets/dopamiles-stack-save.liquid` (PDP card),
`snippets/dopamiles-cart-shipping-protection.liquid`, `assets/dopamiles-cart.js`.

## Verification

- `shopify theme check` — 232 files, 0 offenses.
- `node --test` — 70 pass, 0 fail.

`theme check` parses Liquid but does not evaluate it, and it did **not** catch
an unclosed `{% if %}` introduced during Phase 01. Rendering the snippets did.
liquidjs was therefore added as a devDependency and the snippets are now
rendered in tests: 26 cases on the headline (every row of the plan's table,
both bases, marker labels, bar fill, tier-table edge cases) and 21 on the strip
(dedup, substring-id collision, SP exclusion, ordering, cap, all four
empty-guard paths).

`node_modules/` is gitignored and is never uploaded — `shopify theme push` only
sends recognised theme directories. `npm install` is now a prerequisite for
`npm test`.

## Decisions taken, with reasons

**1. `dop_cart_recs_source` was not shipped.** Phase 02 Step 10 gates the
Shopify `related` B-arm on curated already being live, which it is not.
Shipping the radio without the arm would have put a control in the theme editor
that blanks the strip when selected. The adapter seam is marked in the snippet.
The phase's "source is swappable" criterion is therefore **not met**.

**2. Manual-pick consumption pulled forward from Phase 03.** Phase 02's
settings table defines `dop_cart_recs_manual_1..3` but leaves consumption to
Phase 03 — which would have shipped three dead pickers. Ordering is implemented;
Phase 03 keeps its destructive half (record merchant picks, delete the
`upsell_product` blocks, CSS sweep).

**3. Legacy upsell row demoted, not deleted.** With Phase 03 unrun, the blocks
still render on the initial server render, which would have put two "You might
also like" headings on screen at once. The drawer buffers the strip and falls
through to the blocks only when the strip produced nothing.

**4. `resolveTier` JS mirror removed after review.** It was written to make the
resolver unit-testable, then deleted: it shipped ~35 lines of dead JS to every
PDP visitor, and it tested a hand-written *copy* of the Liquid that could
silently diverge from it. The liquidjs tests exercise the real snippet instead.

**5. Empty state is additive.** The plan said "replacing the illustration CTA".
The strip can legitimately render nothing, and removing "Continue shopping"
would have left an empty drawer with no way out of it.

## Risks assessed

**CHECKOUT below the fold — not a risk, by construction.** `.dop-drawer` is
`position: fixed; bottom: 0` and a flex column; `.dop-cart-lines` is
`flex: 1; overflow-y: auto` and `.dop-drawer-foot` is `flex-shrink: 0`. The
strip is also `flex-shrink: 0`, so its height comes out of the *scrollable*
line-items area, never out of the footer. The real cost is ~175px less visible
line-item area — a UX trade, not a conversion bug. At 360px: drawer 360px,
316px inside padding, 3 × 96px cards + 2 × 10px gaps = 308px, fits without
scrolling.

**Live geometry and mutation survival are unverified.** Both need a browser
against a preview theme (Phase 04 steps 5-6). The mutation-survival property is
structural — theme-global settings, zero section schema, zero JS — but it has
not been observed.

## Open items

1. **Phase 01 Step 1 is unclosed.** 1 tee + SP in a live cart → read the
   *discount* line at checkout. $2 applies → flip `dop_bundle_tier_basis` to
   "All cart items". No discount → Bug 2 does not exist, leave it. Do not flip
   without that observation.

2. **Flipping the basis will desync the PDP widget.** `snippets/dopamiles-stack-save.liquid`
   emits neither `data-tier-basis` nor `data-total-units`, so the PDP Stack &
   Save card keeps counting `eligible` while the drawer counts `total`. Two
   attributes fix it. Left untouched deliberately — that file is owned by
   `plans/260725-1737-pod-tee-stack-and-save-effective-per-unit-price`.

3. **Step 2 (SP not in `bundle-eligible`) not independently confirmed.** Does
   not gate the shipped code; 30-second check during Phase 04.

4. **Merchant setup required before the strip appears.** Set
   `dop_cart_recs_collection` to `bundle-eligible` in the theme editor. Until
   then the strip renders nothing and the legacy upsell blocks continue to show.

5. **The heading is not translatable** — it reads from a text setting rather
   than a locale key, per the plan's settings table.
