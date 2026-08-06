---
title: "pod-tee Cart Drawer Bundle CTA Placement"
description: >-
  Move the cart drawer's bundle offer below the line items, merged into the
  recommendation strip's heading row so it is stated once instead of twice, on a
  theme-global switch that keeps today's top-band layout available. Preview
  first, live once verified.
status: in-progress
priority: P1
effort: "6.5h"
repo: D:\github local\pod-tee-theme
plans_repo: D:\github local\crushroom-form
branch: feat/cart-drawer-chrome-260806
store: dopamiles.co / rfeixb-dd.myshopify.com
themes: "preview #160174997756 · live #158620516604"
blockedBy: []
blocks: [260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix, 260806-1625-pod-tee-cart-drawer-v2-tier-meter-port]
carries: >-
  Added 2026-08-06. Plan 260806-1625 ports a segmented tier meter into the band
  this plan created, and deliberately has no ship phase of its own — its
  verification and live push ride THIS plan's Phase 03. If 01625 lands before
  Phase 03 runs, Phase 03's push list gains nothing (same files) but its
  verification gains the meter: segment count, the green flip, and the fact that
  none of it reached fixed chrome. Two ship phases for one drawer is how a
  half-pushed file happens, which is why it has none.
related:
  - brainstorm: ../reports/pod-tee-cart-drawer-bundle-cta-placement-260806-brainstorm.md (contract, 6 decisions, evidence)
  - mockup: https://claude.ai/code/artifact/72e0b763-a587-4096-a83a-bcd544e8ea4a
  - predecessor: plans/260806-0932-pod-tee-cart-drawer-footer-trim-and-bar-toggle-verify (same branch; its Phase 04 browser checks are still open and Phase 03 here closes them)
  - overlaps: plans/260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix (owns both files this plan edits)
tags: [shopify, theme, pod-tee, dopamiles, cart-drawer, bundle, upsell, copy]
created: 2026-08-06
---

# pod-tee Cart Drawer Bundle CTA Placement

Accepted contract, six decisions and the evidence behind them:
[brainstorm report](../reports/pod-tee-cart-drawer-bundle-cta-placement-260806-brainstorm.md).
Interactive design review: [mockup](https://claude.ai/code/artifact/72e0b763-a587-4096-a83a-bcd544e8ea4a).

## Overview

The drawer states the same bundle offer twice, ~200px apart, and both strings
come from the same resolver:

| Source | String | Position |
|---|---|---|
| `dopamiles-bundle-cart-headline.liquid` | *"Add {N} more · save {$X}"* + CTA | above `.dop-cart-lines` |
| `dopamiles-cart-recs.liquid:322` | *"Pick {N} more to save {$X}"* | inside the scroll area |

**This is visible on production.** Live's `settings_data.json` holds
`dop_cart_recs_source`, `_collection`, `_per_view` and `_atc`, and
`dop_cart_recs_enabled` is absent with a schema default of `true` — so the strip
renders and the duplication is what shoppers see today.

The fix moves the offer into the recommendation strip's **heading row**, below
the line items: one row, stated once. It renders from the drawer section rather
than from inside the recs snippet, so it survives when the strip does not.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | The bundle offer appears exactly once, in every tier state | P1 |
| 2 | It sits below the line items, merged into the strip's heading row | P1 |
| 3 | A theme-global switch keeps today's top-band layout available | P1 |
| 4 | The offer still renders when the recommendation strip renders nothing | P1 |
| 5 | The switch survives a `±` cart mutation | P1 |
| 6 | Both layouts hold at 375×500 with ≥1 line item visible | P2 |

## Non-goals

- **Not deleting the top-band layout.** It stays behind the switch.
- **Not touching** recs product selection, the mutation path, or the parked
  reconcile work from `plans/260805-1848-...`.
- **No new tier arithmetic.** The band reuses resolver output verbatim.
- **No new locale keys.** These strings are hardcoded English in the existing
  snippets; this plan follows that, it does not start a migration.
- **No change to SP counting.** dopamiles *includes* Shipping Protection in the
  bundle count; BNC *excludes* it. Never cross-apply.

## Decisions

Carried from the brainstorm. Numbers match that report.

| # | Decision | Value |
|---|---|---|
| 1 | Structure | Band occupies the recs-strip heading slot; top headline not rendered in this mode |
| 2 | Default | **`below_items`** — the new layout is what ships |
| 3 | Edge states | No eligible items renders **nothing**. ~~Top tier shows "Max savings", no CTA~~ — superseded, that was a defect, fixed in `a84c6a3` |
| 4 | Coupling | **Decoupled.** The band renders from the drawer section, never from inside the recs snippet |
| 5 | Merge | The band **fills the heading slot** — one row, not two. Visual merge only |
| 6 | Copy | `✓ Saved $X · Add N more tees — save $Y`; banked green, on-the-table accent. At/past the top threshold: `✓ Saved $X · $Y off every extra tee` |
| 7 | Mutation risk | ~~Phase 01 blocking gate~~ — **superseded by validation 2026-08-06.** Already proven; confirmed cheaply in Phase 03 Step 3 |
| 8 | Ship gate | Preview, then live once verified |
| 9 | Branch | Continue on `feat/cart-drawer-chrome-260806` — it already carries the live-shipped footer trim and the unpushed copy fix |
| 10 | Empty cart | The band never renders there. The `context: 'empty'` strip keeps its own heading, untouched |

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Build the band and the switch](./phase-01-build-the-band-and-the-switch.md) | **Done** 2026-08-06 | 3.5h |
| 2 | [Cover both layouts with tests](./phase-02-cover-both-layouts-with-tests.md) | **Done** 2026-08-06 | 2h |
| 3 | [Verify on preview and ship](./phase-03-verify-on-preview-and-ship.md) | Pending | 2.5h |

**Scope added in Phase 01, carried into 02 and 03.** Scouting found the tier
progress bar living *inside* `dopamiles-bundle-cart-headline.liquid`. Hiding the
headline under `below_items` would therefore have deleted the bar from the
default layout, regardless of `dop_cart_show_stack_save_bar` — a merchant
setting that defaults **on** and is live today. The bar is now its own snippet,
rendered by whichever surface carries the offer, so the two settings are
genuinely orthogonal rather than nominally so. Two extra files, and Phase 02
gains the extraction's byte-identity assertion.

**No browser is needed until Phase 03.** The original Phase 01 was a blocking
gate on whether a theme-global setting survives a `?sections=` re-render;
validation found that already proven empirically (see § Validation Log), so it
was dropped and its still-useful browser work folded into Phase 03.

## Starting state

Branch `feat/cart-drawer-chrome-260806`, 5 commits:

| Commit | What | Where it is |
|---|---|---|
| `f186f2b` | line endings → LF | — |
| `3e40da0` `8a5d67c` | footer trim | **live** + preview |
| `68ce666` | footer tests + 2 cross-check fixes | **live** + preview |
| `a84c6a3` | tier copy: top tier is a rate, not a ceiling | **preview only** — held for verification per decision 8 |

- `npm test` 245 pass, 0 fail. `theme check` 237 files, 0 offenses.
- The branch is on **0 remotes**. Live is serving code whose only copy is one machine.
- Working tree carries unrelated uncommitted `new-arrival` WIP in two section
  files. **Every push must use `--only`**; a full push ships it.

## Verified evidence

| Claim | Evidence | Status |
|---|---|---|
| The duplication is live-visible | Live `settings_data.json` has 5 `dop_cart_recs_*` keys; `dop_cart_recs_enabled` absent, schema default `true` | ✅ |
| Both strings derive from one resolver | `dopamiles-bundle-tier-resolve` feeds both snippets | ✅ |
| The recs strip can render nothing, heading included | `cart-recs.liquid:75` and `:220`; 4 passing tests in `tests/cart-recs.test.js` name the cases | ✅ |
| The reference design is not shipped anywhere | All 5 `tytkwe-qe-theme` branches searched: no `BUNDLE` eyebrow, no "Add 1 more tee" | ✅ new work, not a port |
| Precedent for a position setting | PDP `stack_save` anchors `below_accordions` / `above_atc` | ✅ |
| The top tier is a rate, not a ceiling | `tier-resolve.liquid:68` — `savings_now = current_cents × eligible_qty` | ✅ fixed in `a84c6a3` |
| Theme-global survives `?sections=` | **Measured** — mutation matrix 2026-07-30, merchant-saved theme-global values survived two consecutive quantity changes (`260725-1940`/phase-04) | ✅ residual: proven for a product picker, not a `select`; confirmed in Phase 03 |
| ≥1 line visible at 375×500 | Outstanding from the footer trim, which shipped live unmeasured | ❌ **Phase 03 Step 5** |

## The coupling constraint

The single most important structural rule in this plan, and the one most likely
to be "simplified" away by someone who has not read this section.

`snippets/dopamiles-cart-recs.liquid` gates **the whole strip, heading
included**, on `{%- if picked_n > 0 -%}` (line 220), inside
`{%- if settings.dop_cart_recs_enabled -%}` (line 75). If the offer text lived in
that heading it would vanish whenever:

| Condition | Consequence |
|---|---|
| `dop_cart_recs_enabled` unchecked | Offer gone store-wide, from one checkbox |
| Recs collection unset or empty | Gone store-wide, silently |
| **Pool fully deduped** — everything recommendable already in the cart | Gone **for the shopper closest to the next tier** |

Live's recs collection is `"new"`. A shopper holding several of a small
collection hits the last row, and that is the largest cart in the store.

**Therefore:** the band is emitted by `sections/dopamiles-cart-drawer.liquid`.
The recs snippet is *told* a band exists and suppresses its own heading. It is
never the other way round.

## Success criteria

- [ ] `dop_cart_bundle_cta_position` exists, theme-global, default `below_items`
- [ ] `below_items`: band renders below the line items and fills the strip's heading slot
- [ ] `top`: byte-identical drawer to today, band absent
- [ ] The offer string appears **once** in every tier state, in both layouts
- [ ] Band renders when the recs strip renders nothing (all four conditions)
- [ ] Band absent when there are no bundle-eligible items
- [ ] Empty-cart branch untouched — no band, recs keeps its own heading
- [ ] Copy matches decision 6 in all states, including at and past the top threshold
- [ ] `npm test` exits 0; `theme check` clean
- [ ] Preview verified at 375×500 with ≥1 line visible, and the switch survives a `±` tap
- [ ] Live pushed with `--only`; the uncommitted `new-arrival` WIP verified absent afterwards

## Cross-plan relationships

**This plan `blocks` `260725-1940`.** That plan owns
`dopamiles-cart-recs.liquid` and `dopamiles-bundle-cart-headline.liquid`, and
this plan edits both. Its Phase 04 steps 9-12 remain on a human checkout gate;
once this lands, that gate covers a changed heading and a changed headline and
must re-run over the combined result.

**Correction owed to `260725-1940`.** Its plan.md states that live's
`settings_data.json` holds none of the new keys, so the strip renders hidden and
the quick-view is not rendered — verified 2026-07-30. That is **no longer true**:
five `dop_cart_recs_*` keys are now saved on live. Phase 01 Step 0 updates it.

## Open questions

1. ~~**Does a theme-global setting survive `/cart/change.js?sections=`?**~~
   **Closed by validation, 2026-08-06.** Proven empirically on 2026-07-30 — see
   § Validation Log. One residual: the proof used a product picker, this is a
   `select`. Confirmed cheaply in Phase 03 Step 3 rather than gated on.
2. **Should `a84c6a3` go live?** Held on preview per decision 8. Phase 03 Step 4b
   verifies it in a browser; Step 6 carries it to live in the same push.
3. **Should the branch be pushed to origin?** Production is currently served from
   code that exists on one machine. Outside this plan's scope but overdue.

## Validation Log

### Session 1 — 2026-08-06

**Verification pass.** Tier: Standard (3-4 phases → Fact Checker + Contract
Verifier). Claims checked: 14. **Verified 12 · Failed 0 · Unverified 0 ·
Superseded 2.**

| Claim | Result |
|---|---|
| `cart-drawer.liquid:152` renders the headline | ✅ exact |
| `cart-recs.liquid:75` = `dop_cart_recs_enabled` gate | ✅ exact |
| `cart-recs.liquid:220` = `picked_n > 0` gate | ✅ exact |
| `.dop-cart-lines` padding `0 18px` (`cart.css:144`) | ✅ — the `-18px` bleed margin is correctly coupled |
| `.shopifyignore` blocks `settings_data.json`, not `settings_schema.json` | ✅ — Phase 03 Step 1's distinction holds |
| Live holds 5 `dop_cart_recs_*` keys; `_enabled` absent, default `true` | ✅ the strip renders on production |
| `tier-resolve.liquid:68` — savings is per-unit × eligible qty | ✅ |
| `dop_cart_recs_manual_1..3` are theme-global | ✅ same settings group as the proposed setting |
| Branch state: 5 commits, 245 tests, 0 remotes | ✅ |
| `cart-recs` takes render args (`context:`) | ✅ `suppress_heading` fits the existing pattern |

**Finding 1 — the Phase 01 gate was redundant.** *(Superseded a decision.)*

The mutation-survival matrix in
`plans/260725-1940-.../phase-04-qa-and-ship.md` already answers it:

> `| Two consecutive quantity changes | manual picks still present |` — run
> 2026-07-30 via agent-browser, **all rows pass**.

`dop_cart_recs_manual_1..3` are theme-global and merchant-saved, so a saved
theme-global value demonstrably survived two consecutive `?sections=`
re-renders. The drawer's own comment (`cart-drawer.liquid:269-276`) records the
converse: *section-block* picks "silently vanished mid-session", which is why
they were migrated to theme-global in the first place.

Residual gap: the proof used a `product` picker; this plan adds a `select`. Same
resolution path, so it is confirmed in Phase 03 Step 3 rather than gated on.

**Effect:** Phase 01 dropped, phases renumbered 4 → 3, effort 7h → 6.5h, and the
plan no longer needs a browser before Phase 03. Its `a84c6a3` and 375×500 checks
moved into Phase 03 Step 4b.

**Finding 2 — the empty-cart branch was unhandled.** *(Filled a gap.)*

`dopamiles-cart-recs` is rendered **twice**: `context: 'items'` at `:278` and
`context: 'empty'` at `:423`. The plan only described the items branch, so
whether the band appeared on an empty cart would have been decided by where the
render guard happened to land.

Resolved as decision 10: the band never renders on an empty cart — there are no
eligible items, so the resolver returns nothing anyway — and the empty-state
strip keeps its own heading. Added to Phase 01 Step 3b and Phase 02 Step 5b.

Also confirmed: `context` currently affects only a CSS modifier class
(`cart-recs.liquid:77`, `:317`), so `suppress_heading` is a genuinely new
argument rather than an overload.

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, all three `phase-*.md`
- Decisions propagated: 2 (findings 1 and 2)
- Reconciled stale references: 7 — phase numbering in three frontmatter blocks
  and three headings; `dependencies` chains; the phases table; decision 7 marked
  superseded rather than deleted; open question 1 closed with its evidence;
  Phase 03's "Phase 01 answered this for a boolean" rewritten to cite the real
  source; effort totals
- Files renamed: 3 (`phase-02/03/04` → `phase-01/02/03`); `phase-01-start.md` removed

**Second pass — the first sweep declared itself clean too early.** Three stale
references survived it and were caught only on re-reading the rendered file:

| Stale | Fixed to |
|---|---|
| `related.predecessor` said "Phase 01 here closes them" | Phase 03 |
| Evidence row *"Theme-global survives `?sections=` — never measured ❌ Phase 01"* | Now marked measured, citing the 2026-07-30 matrix |
| Evidence row *"≥1 line visible ❌ Phase 01 / 04"* | Phase 03 Step 5 |
| Decision rows ordered 7, 10, 8, 9 | Re-ordered 7, 8, 9, 10 |

The second row is the one that mattered: it asserted the opposite of the finding
that restructured the plan, three sections below the finding itself. Renumbering
phases invalidates every cross-reference to them, and a table of evidence
statuses is the easiest place for that to hide.

**Third and fourth passes.** Four more stale cross-references, all created by the
renumbering and all missed by the first two sweeps:

| Stale | Fixed to |
|---|---|
| `plan.md` "Phase 02 Step 0 updates it" (the sibling-plan correction) | Phase 01 Step 0 |
| Phase 01 "clean before Phase 03 adds coverage" | Phase 02 |
| Phase 01 "Phase 03 asserts them against each other" | Phase 02 |
| Phase 03 "the six files Phase 02 touched" | Phase 01 |

The first three sweeps each grepped for the phase numbers I *expected* to be
wrong — `Phase 01`, `Phase 04` — and so kept missing references to `Phase 02`
and `Phase 03` that had also shifted. The pass that worked enumerated **every**
`Phase 0N` occurrence in every file and checked each against the new numbering,
rather than searching for the ones I already suspected.

Recorded because renumbering phases is cheap and its cross-reference debt is
not: a plan that points at the wrong phase reads as authoritative and sends the
implementer to the wrong file.

- **Unresolved contradictions after the fourth pass: 0**
