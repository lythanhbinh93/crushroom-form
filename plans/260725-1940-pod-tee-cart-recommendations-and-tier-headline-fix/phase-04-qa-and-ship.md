---
phase: 4
title: "QA and ship"
status: pending
priority: P1
effort: "2-3h"
dependencies: [1, 2, 3]
---

# Phase 4: QA and ship

## Overview

Verify every headline state against a real checkout total, confirm the strip
survives cart mutations in both states, then push to the live theme with
pulled-source verification.

**Hard gate:** Phase 01 must be complete and its Step 1 verification recorded.
The strip must not ship on top of a wrong savings number.

## STOP — human gate before the live push

Steps 1-8 (all checks, preview-theme QA) are safe to run unattended.

**Steps 9-12 push to the live production theme `#158620516604` on a store taking
real orders. An automated or looped run must STOP after Step 8** and report
results for human review. Do not run `shopify theme push --allow-live`
unattended.

If running unattended:
- Complete Steps 1-8 against a **preview/unpublished** theme.
- Record every money-truth row result in this file.
- Stop and report. Leave Steps 9-12 unchecked.

## Requirements

**Functional**

- Every headline state's stated savings equals the discount checkout actually
  applies. Zero tolerance — this is a money promise.
- Strip renders correctly in items and empty states, and after mutations.
- No regression to tier selection, cart recount, Shipping Protection auto-add /
  opt-out, or the PDP Stack & Save CTA.

**Non-functional**

- CHECKOUT above the fold at 360px.
- `shopify theme check` clean; `node --test` green.
- Live push verified by pulled-source diff, never the CLI success banner.

## Architecture

### Money-truth matrix

Each row: build the cart, open checkout, compare the drawer's stated savings to
the applied discount. Both columns must match exactly.

| # | Cart | Expect stated == applied |
|---|---|---|
| 1 | 1 tee, no SP | $0 |
| 2 | 1 tee + SP | per Phase 01 Step 1 result |
| 3 | 2 tees, no SP | $4 |
| 4 | 2 tees + SP | per Step 1 result |
| 5 | 3 tees | $9 |
| 6 | **4 tees** | **$12** — currently renders $9 |
| 7 | 4 tees + SP | per Step 1 result |
| 8 | 5 tees | $25 |
| 9 | **6 tees** | **$30** — currently renders "$25+" |
| 10 | 1 tee at line qty 3 | $9 — confirms `cart.item_count` counts units, not lines |

Rows 6 and 9 are the regression proofs for Bug 1. Rows 2, 4, 7 are the proofs for
Bug 2 and depend on the Step 1 result.

### Mutation-survival matrix

| Action | Assert |
|---|---|
| Add item | headline, bar, strip, manual picks all render |
| Quantity + | all four still correct, savings recomputed |
| Quantity − | all four still correct |
| Remove to empty | empty-state strip appears, items strip gone |
| Two consecutive quantity changes | manual picks still present (the Phase 03 fix) |
| Opt out of SP | tier and savings recompute per the verified basis |
| Re-check SP | tier and savings recompute back |
| Quick-view open, then a cart mutation behind it | panel survives and keeps its selection. It is a SIBLING of `#dop-cart-drawer-content`, which `applyCartMutation` replaces wholesale — this row exists to prove that placement holds under a real swap, not just in the source |
| SP auto-add arriving mid-session | headline, bar and strip all recompute. An app-initiated line add is a different path into the same re-render than a user-initiated one |

### Push discipline

Live theme `#158620516604` on `rfeixb-dd.myshopify.com`. Pushes hit
**production**.

- `--allow-live` with a single `--only` per file.
- `.shopifyignore` blocks `templates/*.json` — do not fight it.
- After each push, `shopify theme pull` and diff the pulled source against local.
  The CLI success banner is not evidence; Shopify caches storefront HTML and a
  curl can show stale markup.
- `config/settings_schema.json` changes: verify the new settings actually appear in
  the theme editor, and that existing merchant settings were not reset.

## Related Code Files

Verify only, no edits expected in this phase:

- `snippets/dopamiles-bundle-cart-headline.liquid`
- `snippets/dopamiles-cart-recs.liquid`
- `sections/dopamiles-cart-drawer.liquid`
- `assets/dopamiles-stack-save.js`
- `config/settings_schema.json`
- `snippets/dopamiles-stack-save.liquid` — confirm the PDP CTA is untouched

## Progress — 2026-07-25 unattended run

Steps 1-3 done. Steps 4-8 need a browser against a preview theme and were not
run. Steps 9-12 are the live push and are **not** to be run unattended.

- [x] 1 — Phase 01 Step 1 result recorded: NOT VERIFIED, shipped on safe default
- [x] 2 — `shopify theme check`: 232 files, 0 offenses
- [x] 3 — `node --test`: 70 pass, 0 fail
- [ ] 4 — money-truth rows on a preview theme. All 10 rows were verified by
      *rendering the Liquid* (see `tests/cart-headline.test.js`), which
      confirms the drawer's arithmetic but NOT that checkout applies the same
      discount. Rows 2, 4 and 7 remain gated on the Step 1 observation.
- [ ] 5 — mutation-survival matrix
- [ ] 6 — 360px viewport check. Reasoned statically: CHECKOUT cannot be pushed
      below the fold (the strip is `flex-shrink: 0` between a `flex: 1`
      scrolling line-items area and a `flex-shrink: 0` footer in a
      `position: fixed; bottom: 0` column), and 3 cards fit 316px of usable
      width. Marker-label collision at 360px is still unobserved and the
      numbers are now wider ($30 vs $25).
- [x] 7 — PDP Stack & Save CTA unchanged: `snippets/dopamiles-stack-save.liquid`
      is untouched in the diff
- [x] 8 — Shipping Protection auto-add/opt-out unaffected:
      `snippets/dopamiles-cart-shipping-protection.liquid` and
      `assets/dopamiles-cart.js` are untouched in the diff
- [ ] 9-12 — live push. **STOP. Human gate.**

### Preview push — 2026-07-25 14:00 UTC

Pushed to **#160174997756 `stack-save-price-preview-260725`** (UNPUBLISHED),
7 files, explicit `--only` each, no `--allow-live`. Auth via Theme Access token.

Verified by Admin API checksum, not the CLI banner — all 7 remote `checksumMd5`
match the local files byte for byte.

Untouched and confirmed by timestamp: `snippets/dopamiles-stack-save.liquid`
(the overlapping plan's PDP work, deliberately excluded from the push),
`config/settings_data.json`, `sections/header-group.json`,
`templates/product.json`, `templates/index.json`. The push step's "Cleaning
your remote theme" phase removed nothing.

**Pre-push collision check.** This preview theme belongs to
`plans/260725-1737-pod-tee-stack-and-save-effective-per-unit-price`. Before
pushing, every target file's remote checksum was compared against git HEAD:
five matched exactly, so the changes applied cleanly on top.
`config/settings_schema.json` looked like a conflict (different md5, +1603
bytes) but normalising line endings showed it content-identical to HEAD —
the theme's copy was CRLF from a Windows upload, HEAD is LF. The one genuine
difference, `snippets/dopamiles-stack-save.liquid`, was excluded.

Preview: https://rfeixb-dd.myshopify.com?preview_theme_id=160174997756
Editor: https://rfeixb-dd.myshopify.com/admin/themes/160174997756/editor

**Still required before the strip is visible:** set Theme settings → Cart →
Cart recommendations → Curated collection to `bundle-eligible` on this theme
(Phase 02 Step 7). Until then the strip renders nothing by design and the
legacy upsell blocks continue to show.

Full write-up: [reports/260725-phases-01-02-implementation.md](./reports/260725-phases-01-02-implementation.md).

**Note for step 2:** `shopify theme check` parses Liquid but never evaluates
it. During Phase 01 it reported 0 offenses on a snippet with an unclosed
`{% if %}`. Treat a clean theme-check as necessary, not sufficient.

## Progress — 2026-07-29 run (Phase 05 work included)

Re-run after the cart-drawer redesign (money resolver, 1-up carousel, compact
line items, related-products arm, Phase 03 block deletion). Two previously
recorded results were **stale and had to be re-derived**, noted below.

- [x] 1 — Phase 01 Step 1 unchanged: still NOT VERIFIED, still shipped on the
      safe `eligible` default. No copy claims the larger number.
- [x] 2 — `shopify theme check`: **235 files, 0 offenses** (was 232).
- [x] 3 — `node --test`: **153 pass, 0 fail** (was 70). Adds the resolver
      contract + equality suite, carousel/end-card, per-view, related-source,
      and the line-item DOM-contract guard.
- [ ] 4 — money-truth rows: **still not discharged.** All 10 rows pass by
      rendering the Liquid (`tests/cart-headline.test.js`, `tests/bundle-tier-resolve.test.js`),
      and the resolver refactor added a 24-case equality suite proving the
      headline figure and the strip figure are the same number at eligible
      qty 1-6, with and without SP, on both bases. That is arithmetic
      agreement, NOT checkout parity. Rows 2, 4, 7 remain gated on Step 1.
- [ ] 5 — mutation-survival matrix: not run. Needs a real cart session in a
      browser; no store session available to this run.
- [x] 6 — **360px viewport: measured, not reasoned.** The previous entry's
      static argument is void — it assumed the strip was a `flex-shrink: 0`
      sibling above the footer, and Phase 05 moved it INSIDE `.dop-cart-lines`.
      Re-measured against the real stylesheets in a 360px drawer, 3 compact
      line items, 1-up strip, top-tier headline:

      | Check | Result |
      |---|---|
      | CHECKOUT above the fold | yes, 49px headroom at a 566px-tall viewport (stricter than iPhone 15's 852px) |
      | Compact line item height | 100px (target was <= 105) |
      | Line-items scroll area | 307px |
      | Strip visible at 3 items | 0px — reached by scrolling, the accepted scroll-reward trade |
      | Marker label collision | **none**; labels abut at 0px clearance |
      | Marker labels vs bar width | 233px of 301px at current values |
      | Horizontal page overflow | none |

      Marker collision was flagged unobserved by the overlapping plan. Now
      measured: no collision at the current $12/$18/$30, and none at
      three-digit (257px) or four-digit (281px) figures against a 301px bar.
      The labels are edge-anchored, so they do not push each other.
- [x] 7 — PDP Stack & Save CTA unchanged: `snippets/dopamiles-stack-save.liquid`
      still untouched in the diff.
- [x] 8 — **Shipping Protection re-derived, not inherited.** The previous entry
      concluded SP was safe *because* `assets/dopamiles-cart.js` was untouched.
      It is now modified (carousel, related fetch, upsell handler removed), so
      that argument no longer holds. Checked directly instead: `git diff` shows
      **no change to any SP line**; the only removed SP-adjacent line was the
      spinner markup inside the deleted `handleUpsellAdd`. The toggle binding,
      opt-out reconcile and `handleSPToggle` are intact.
- [ ] 9-12 — live push. **STOP. Human gate.** Not run.

### Not discharged by this run

- Checkout parity (Step 4) — needs a real checkout on the store.
- Mutation survival (Step 5) — needs a browser with a cart session.
- Real-device spot check (Step 12).

### Blocking the live push, beyond the human gate

- All work is **uncommitted**, on branch `fix/codebase-audit-batch-260613`.
- No `phase-05-*.md` exists. Phase 05 broke Phase 02's "curated mode ships zero
  new JS" criterion twice — the carousel, then the related-products fetch — and
  that supersession is recorded nowhere.
- `locales/en.default.json` is not in `.shopifyignore`. The preview push sent
  the repo copy wholesale; doing that to live would clobber any admin language
  editor changes. Pull-merge-push instead.

## Implementation Steps

1. Confirm Phase 01 Step 1 result is recorded. Stop if not.
2. Run `shopify theme check`. Zero new offenses.
3. Run `node --test`. Green.
4. Walk all 10 money-truth rows on a preview theme. Record stated vs applied for
   each.
5. Walk the mutation-survival matrix.
6. 360px viewport: CHECKOUT above the fold with the strip rendered. Check marker
   label collision at this width — the overlapping plan flagged it as accepted, but
   the numbers are now wider ($30 vs $25).
7. Confirm the PDP Stack & Save collection CTA renders unchanged.
8. Confirm Shipping Protection auto-add and opt-out still behave.
9. Push to live: `--allow-live`, single `--only` per file.
10. `shopify theme pull` and diff every pushed file.
11. Verify new settings present in the theme editor; confirm no merchant settings
    were reset.
12. Spot-check the live storefront on a real device, not only emulation.

## Success Criteria

- [ ] All 10 money-truth rows: stated savings == applied discount, exactly
- [ ] Row 6 renders $12; row 9 renders $30
- [ ] Row 10 confirms unit-based counting on a single line with qty 3
- [ ] Full mutation-survival matrix passes
- [ ] Manual picks survive two consecutive quantity changes
- [ ] Empty-state strip appears when the cart empties
- [ ] CHECKOUT above the fold at 360px; no marker label collision regression
- [ ] PDP Stack & Save CTA unchanged
- [ ] Shipping Protection auto-add and opt-out unaffected
- [ ] `shopify theme check` clean; `node --test` green
- [ ] Pulled source matches local for every pushed file
- [ ] New settings visible in the theme editor; no merchant settings reset

## Risk Assessment

- **Shipping the strip on a wrong number.** The reason Phase 01 gates this phase.
  Do not reorder.
- **Live pushes are customer-visible immediately.** Single `--only` per file limits
  blast radius; pulled-source diff is the only trustworthy verification.
- **Section Rendering API resets merchant JSON.** Every push can wipe
  `settings_data` and section/template JSON. `.shopifyignore` is the guard; verify
  merchant settings after pushing `settings_schema.json`.
- **Shopify caches storefront HTML.** Post-push curl can show stale markup and
  ignores unknown cache-bust params. Verify via pulled source, not a fetch.
- **Checkout totals include Shipping Protection.** When comparing stated vs
  applied, read the *discount* line, not the order total — SP's $2.95 will
  otherwise look like a mismatch.
- **Overlapping plan's QA still open.**
  `plans/260520-1010-pod-tee-cart-drawer-offer-revamp` Phase 05 is a pending manual
  QA of this same drawer. This phase covers the states this plan touches; it does
  not discharge that phase.

---

## Mutation-survival matrix — run 2026-07-30, preview #160174997756

Driven through the real UI controls in a browser session, not raw fetches, so
the app's own mutation path is what was exercised. `window.Shopify.theme.id`
checked before and after: the session silently jumped to another store
mid-run (beachnapclub.com, theme #143719432276) and one step executed against
it. Every step now guards on `Shopify.shop` before touching anything.

| Row | Result |
|---|---|
| Add item | headline, strip, 8 cards + end card, manual picks all render |
| Quantity + | recomputes; `$4` at 2 tees, `$9` at 3 |
| Quantity − | recomputes back to `$4` |
| Two consecutive quantity changes | same 8 card handles in the same order across all four snapshots — the Phase 03 fix holds |
| Remove to empty | **see finding below** — clean on a truly empty cart, wrong on an SP-only cart |
| Opt out of SP | SP line removed, headline unchanged at `Saved $9`, applied discount unchanged at `$9` |
| Re-check SP | SP line back, total returns to `$83.92`, discount still `$9` |
| Quick-view open, cart mutation behind it | panel survives; see the sibling proof below |
| SP auto-add mid-session | fires on drawer open; headline, strip and subtotal all recompute |

Steppers carry `data-bound="1"` on the fresh nodes after every swap, and the
panel keeps `data-bound="1"` throughout — nothing double-binds, nothing goes
dead.

### The sibling placement is load-bearing, proven not argued

A probe element was appended INSIDE `#dop-cart-drawer-content`, then a real
stepper click was fired:

- `probeDestroyed: true` and the `.dop-li` node identity changed — the wrap's
  contents really are replaced on every mutation.
- `panelSameNode: true`, still `data-bound="1"` — the panel, being a sibling,
  is untouched.

A panel rendered inside that wrap would have been destroyed mid-interaction by
the shopper's own Add. This is the first empirical confirmation; before it, the
claim rested on reading the source.

### Money truth, cross-checked against Shopify

The headline was compared against `/cart.js` `total_discount` rather than
against arithmetic on paper:

| Cart | headline states | Shopify applied |
|---|---|---|
| 2 tees + SP | Saved $4 | `total_discount: 400` |
| 3 tees + SP | Saved $9 | `total_discount: 900` |
| 3 tees + 3 SP | Saved $9 | `total_discount: 900` |
| 1 tee + SP | Add 1 more · save $4 | `total_discount: 0` |

Exact agreement in every case. These same carts answer Phase 01 Step 1 — see
that phase file.

### Finding: an SP-only cart is a self-contradicting drawer

Reachable by the ordinary path — SP auto-adds on drawer open, then the shopper
removes their only tee. State observed:

- header reads **"Bag · empty"** (the customer-facing count correctly excludes SP)
- zero line items, no headline, and **no empty-state message**
- the recommendation strip stays in `--items` mode rather than `--empty`
- **CHECKOUT is enabled and reads "Checkout · $2.95"**

So the drawer says the bag is empty and simultaneously offers to charge $2.95
for Shipping Protection on nothing.

A genuinely empty cart is correct: empty-state copy renders and the strip
switches to `--empty`.

Attribution: the "empty" label and the SP widget both predate this plan and are
live today, so the contradiction is very likely pre-existing; the strip staying
in `--items` mode is new. Not fixed here — the sensible repair is a product
decision (drop SP automatically when the last eligible item goes, disable
checkout, or render the empty state), and it reaches
`snippets/dopamiles-cart-shipping-protection.liquid`, which this plan has
otherwise left untouched.
