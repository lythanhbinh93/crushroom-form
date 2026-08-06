---
title: "pod-tee Cart Drawer Reconcile and Chrome Trim"
description: >-
  Stop the dopamiles cart drawer tearing itself down on every mutation, and
  trim its fixed chrome so the line-item list stops starving on short
  viewports. Two jobs on one branch: a port of the BNC chrome fix shipped
  2026-08-05, and a keyed reconcile replacing the wholesale innerHTML swap.
  Preview only — no live push.
status: rolled-back
priority: P1
effort: "2d"
outcome: >-
  ROLLED BACK 2026-08-05 by user decision. All 9 commits were removed from
  feat/cart-recs-and-tier-truth-260729 (reset to e57f20f) and preserved on
  branch `rescue-260805` / `backup/cart-drawer-session-260805`, both now on
  origin. The phase files below describe work that is NOT on the working
  branch — read them as a record, not as current state.

  If resumed: re-land ONLY Phase 01 (7e4fe7c e823eea 9557bfb 4b2c0e2 — the
  chrome trim, reviewed and production-proven on the BNC sibling theme) and
  verify it manually in a real browser. Phases 02-04 stay parked; the reconcile
  delivered ~none of its goal and its cost was misjudged. See § Decision
  reversal for the Idiomorph conclusion if it ever returns.
repo: D:\github local\pod-tee-theme
plans_repo: D:\github local\crushroom-form
branch: feat/cart-recs-and-tier-truth-260729
store: dopamiles.co / rfeixb-dd.myshopify.com
themes: "preview #160174997756 · live #158620516604 (untouched by this plan)"
blockedBy: []
blocks: [260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix]
supersededBy: 260806-0932-pod-tee-cart-drawer-footer-trim-and-bar-toggle-verify
related:
  - advice: ./advice.md (confirmed reframing, locked decisions, rejected alternatives)
  - successor: plans/260806-0932-pod-tee-cart-drawer-footer-trim-and-bar-toggle-verify — re-does Phase 01 only, rebuilt fresh from BNC source rather than cherry-picked (user decision 2026-08-06). Phases 02-04 of this plan stay parked
  - source: tytkwe-qe-theme@ae6fb4d + e6ad2fd (BNC, live 2026-08-05) — the port reference
  - overlaps: plans/260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix (same branch, same drawer; Phase 04 QA absorbs this plan's manual matrix)
  - constraint: BNC excludes Shipping Protection from Stack & Save, dopamiles includes it — chrome and spacing port only, never counting rules
tags: [shopify, theme, pod-tee, dopamiles, cart-drawer, reconcile, performance, spacing]
created: 2026-08-05
revised: 2026-08-05 (restructured 6 phases → 4 after red team; see ## Red Team Review)
---

# pod-tee Cart Drawer Reconcile and Chrome Trim

Advisory record with the interview trail and rejected alternatives:
[advice.md](./advice.md). Red-team adjudication: [§ Red Team Review](#red-team-review).

## Overview

Two defects in the dopamiles cart drawer.

**1. The drawer tears itself down on every mutation.**
`dstContent.innerHTML = newContent.innerHTML` on `#dop-cart-drawer-content`
([dopamiles-cart-mutations.js:95](../../../pod-tee-theme/assets/dopamiles-cart-mutations.js#L95))
destroys and rebuilds the tier headline, every line item and its `<img>`, the
recommendation carousel and the footer — on a `+` tap. Images re-decode, scroll
position resets, the carousel snaps to slide 1.

**2. The fixed chrome is untrimmed.** Header + tier bar + footer never shrink;
`.dop-cart-lines` is the only flex child that can. BNC had the identical defect
and fixed it this morning — chrome 515px → 343px, live in `ae6fb4d` + `e6ad2fd`.

**The reconcile is not a drop-in.** Red team established that the current
innerHTML teardown is *load-bearing*: at least six behaviours in the theme are
correct only because the DOM is destroyed on every mutation. Those dependencies
have to be dismantled deliberately, before any reconcile lands — which is why
Phase 02 exists and why this plan is 1.5d, not 1d.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | No visible teardown on a mutation: line `<img>` nodes survive, scroll position holds | P1 |
| 2 | Fixed chrome reduced; line-item list non-zero and ≥1 line visible at 375×500 | P1 |
| 3 | Nothing the reconcile preserves is left in a broken state — no stranded spinner, no stale money figure, no swallowed error | P1 |
| 4 | Recs carousel holds its slide across a mutation | P2 |
| 5 | Reconcile guarded by tests and reversible without a code revert | P2 |

## Non-goals

- **No live push.** Commits on `feat/cart-recs-and-tier-truth-260729`, verified on preview `#160174997756`. Live `#158620516604` untouched.
- ~~**No morph library.**~~ **REVERSED 2026-08-05** — see § Decision reversal. Phase 04 uses Idiomorph.
- **No optimistic UI.** Standing user decision — reserved for sub-100ms swaps.
- **No change to tier arithmetic.** `dopamiles-bundle-tier-resolve.liquid` untouched.
- **No change to bundle counting.** BNC excludes SP from Stack & Save; dopamiles includes it.
- **Focus preservation is NOT a goal.** `handleQtyChange` sets `disabled = true` on the tapped button synchronously before the fetch ([cart.js:270-271](../../../pod-tee-theme/assets/dopamiles-cart.js#L270-L271)), which blurs it. No reconcile can recover focus lost before it runs. Changing the lock to `aria-disabled` would fix it and is deliberately out of scope.
- **Add-path round-trip collapse is NOT in scope.** See § Cut scope.

## Locked decisions

| Decision | Value | Source |
|---|---|---|
| What "hide the bundle processing" means | Eliminate the loading/recalc churn, not hide the widget | User |
| Approach | Keyed reconcile, not a CSS mask | User |
| Port scope | Full parity with BNC, including content removals | User |
| Ship gate | Commit on branch, preview verification only | User |
| Response to red team | Apply all 15 findings, restructure | User |

## Phases

> **All rows below describe commits that are NOT on the working branch.** They
> live on `rescue-260805` (= `48aa127`), pushed to origin. The working branch
> `feat/cart-recs-and-tier-truth-260729` is back at `e57f20f`.

| # | Phase | Status |
|---|-------|--------|
| 1 | [Chrome trim port](./phase-01-chrome-trim-port.md) | **Rolled back.** Was code-complete and reviewed — `7e4fe7c` `e823eea` `9557bfb` `4b2c0e2`. Steps 5-6 (measure, fixtures) never ran. **This is the only phase worth re-landing** |
| 2 | [Reconcile prerequisites](./phase-02-reconcile-prerequisites.md) | **Rolled back.** Was done + reviewed — `bf8f0c8` `f7cd745`. Only the `| escape` fix was recovered, as `51de695` |
| 3 | [Region reconcile](./phase-03-region-reconcile.md) | **Rolled back.** Was `866eca4` `6b9ac59`, flag default-off. Delivered ~none of Goal 1 — see § corrections |
| 4 | [Keyed line reconcile and QA](./phase-04-keyed-line-reconcile-and-qa.md) | Not started — **cannot complete without preview access** (fixtures + QA matrix) |

### Progress log

| Date | Event |
|---|---|
| 2026-08-05 | P01 code + tests landed. Review found 1 High (deleted `.dop-cart-secure` CSS still rendered on `/cart` → unsized ~150px padlock) + 2 Medium (new row rule out-specified `.dop-li--compact`, the LIVE default, making rows *taller*; tax-note test passed by substring where two strings are prefixes of two others). All fixed in `4b2c0e2` |
| 2026-08-05 | P02 landed. Review found 1 High (queued the section fetch but not the trailing cart read) + 3 Medium (two false comments: the `opacity` dim never rendered under `display:contents`, and the input lock is not total; `refreshPageTotals` returned `undefined` off its early exit). All fixed in `f7cd745` |
| 2026-08-05 | P03 landed behind the flag. Review found 1 **Critical** — the removal pass keyed on `id`, and the tier headline has none, so it could never be removed: a stale "Saved $15" survived onto an empty cart and onto a cart that had lost its last eligible unit. Plus 2 High (id-less/class-less child would accumulate unbounded; recs strip defeats the skip on the `shopify` source) and 4 Medium. Critical + 4 fixed in `6b9ac59`; the recs-strip limitation is deferred to Phase 04 Step 5, which already owns that strip |
| 2026-08-05 | Blocked: Shopify CLI in this session has no access to `rfeixb-dd.myshopify.com`, so nothing can be pushed to preview `#160174997756`. Measurement, fixtures and every browser-only QA row are stalled behind that |
| 2026-08-05 | `@kongming` advisory. Established that Phase 03 alone delivers ~none of Goal 1, and that all three approach-attributable defects were diff-algorithm bugs a morph library provides natively. User reversed the "no morph library" decision and approved `linkedom`. See § Decision reversal |
| 2026-08-05 | `linkedom` added — and within minutes it exposed that **the reconcile was completely inert**. The no-stable-identity bail was ordered before the count-marker skip, and the markers have neither id nor class, so `reconcileRegions` returned `false` on the first child of every mutation. Silently disabled since the tier-headline fix; the innerHTML fallback made it indistinguishable from working. Fixed in `48aa127` with 9 executable tests, 4 of them regression locks on already-shipped defects. Suite 227 → **236** |
| 2026-08-05 | **Carried into Phase 04:** (a) the reconcile has zero test coverage — review established it needs no jsdom, `linkedom` suffices since the code touches no layout or events, which reopens the Phase 04 test-dep question with a cheaper answer; (b) the recs strip must become its own region; (c) the `disabled`-attribute-reflection invariant from P02 |

Strictly sequential. Phase 02 is a gate, not a suggestion: every one of its steps
removes a dependency on the teardown that Phase 03 eliminates.

## Decision reversal — morph library, 2026-08-05

**Original decision (user-confirmed):** no morph library. Reasoning, from
`advice.md`: *"every line already carries `data-line-key`… a general diff
algorithm buys nothing and adds a blocking asset."*

**New evidence that falsified the premise.** Sorting every self-inflicted defect
across Phases 01-03 by cause: three were CSS/port hygiene, one was async
sequencing — a library prevents none of those. The remaining three were **all**
diff-algorithm bugs, and all three are machinery a morph library provides:

| Defect | Phase | Library-provided? |
|---|---|---|
| Removal keyed on `id`; the id-less tier headline could never be removed | 03 | Yes — id-set matching |
| Unkeyed child inserted every mutation, accumulating unbounded | 03 | Yes — ordered insert/remove |
| Equality skip dead on arrival (`data-bound` on live nodes only) | 03 | Yes — attribute-normalised compare |

Three of Phase 04's four known hazards are native behaviour too: clearing
`disabled` from attribute *absence*, morphing `.dop-li-price`'s conditional
`.dop-li-was` strike, and `.dop-bundle` cards having no enumerable leaves. The
fourth (recs-strip keep) needs a hook either way.

The keys cited as the reason to skip a library are precisely what makes id-set
morphing work well. Matching was never the hard part; update semantics was —
which is exactly where the Critical landed.

**Also corrected:** an earlier claim that this codebase already used Idiomorph
was wrong. Grep finds no morph library in `pod-tee-theme` or `tytkwe-qe-theme`.
The provenance argument is external — Idiomorph is the morph engine in htmx and
Turbo 8 — not internal precedent.

**Noted for the record:** when asked mask-or-eliminate, the user answered
*"Eliminate it (morph)"*. Excluding a morph **library** was the implementer's
economy, not a user requirement.

**Trade-off accepted:** ~3KB gz and a third-party dependency in the theme,
against deleting most of Phase 04's implementation and test matrix and removing
the defect class responsible for every approach-attributable bug so far.

**Decided by the user, 2026-08-05:** adopt Idiomorph; add `linkedom` as a
devDependency so the reconcile is testable without preview access.

## Two corrections from advisory review (2026-08-05)

**1. "Flag off" is not a no-op.** `dop_cart_reconcile_enabled` gates
`reconcileRegions`, and that gating is sound — but three changes on this branch
run unconditionally: the section parse moved from `DOMParser` to a `<template>`
fragment (with `querySelector('[id=…]')` replacing `getElementById`), the button
busy/disabled restore moved into `finally`, and `refreshDrawer` is now queued
and returns its trailing cart read. Phase 02 *had* to be flag-independent, so
this is by design — but nobody should read "default off" as "branch is
behaviourally inert", and none of the three has been run in a browser.

**2. Phase 03 alone delivers ~none of Goal 1.** On a `±` tap the quantity
changes, so `#dop-cart-lines` differs from the incoming markup and is
`replaceChild`-ed wholesale — every `<img>` recreated, and the scroll container
itself replaced. The footer (total changed) and headline (savings changed) go
the same way. The equality skip only fires for regions that did not change, and
on a mutation the regions the shopper is watching always change. What Phase 03
*does* buy: the discount input and a live error banner survive, the count
markers stay fresh, and genuinely-unchanged regions are left alone. The
no-flicker outcome is entirely Phase 04's.

## Cut scope

**Mutation round-trip collapse — cut.** The former Phase 05 targeted
`await fetchCart()` after the mutation. It does not apply to the reported defect:
`changeCartItem` — the `±` path — makes exactly **one** round-trip and returns
`{ cart: data, sections }` directly ([cart.js:95-107](../../../pod-tee-theme/assets/dopamiles-cart.js#L95-L107)).
The second fetch exists only on the **add** paths, and the reason is already
documented in the source: *"/cart/add.js returns line item, not full cart — one
extra /cart.js fetch needed"* ([cart.js:124](../../../pod-tee-theme/assets/dopamiles-cart.js#L124)).
`displayCount` needs `cart.item_count` **and** `cart.items`, and `dropOrphanSP`
branches on `cart.items.length` to *delete a line* — so narrowing that object
risks silently removing a shopper's Shipping Protection. Closed as
not-applicable, not as unmeasured.

If add-path latency is ever worth attacking it is a separate plan with its own
defect report. The one lead worth recording: `dropOrphanSP` issues a second full
`changeCartItem` + `applyCartMutation` after decrement-to-empty
([cart.js:1080-1102](../../../pod-tee-theme/assets/dopamiles-cart.js#L1080-L1102)) —
collapsible into one `/cart/update.js`.

## Verified evidence

Every row re-verified after the red team falsified three of the originals.

| Claim | Evidence | Status |
|---|---|---|
| Full innerHTML teardown on every mutation | `cart-mutations.js:95` | ✅ |
| Every line carries a reconcile key | `data-line-key="{{ item.key }}"`, `drawer.liquid:217` | ✅ |
| Content wrap is `display:contents` | `drawer.liquid:112` | ✅ |
| Recs carousel is inside `#dop-cart-lines` | `drawer.liquid:278`, container opens `:157` | ✅ |
| Quick-view is *outside* the swapped wrap | `#dop-cart-qv` is a sibling — never was at risk | ✅ |
| All 8 tax-note locale keys exist | `locales/en.default.json` + all 37 non-schema locale files | ✅ |
| dopamiles has **no** free-shipping bar | no `ship_qualifies` / `dop_cart_show_shipping_bar` anywhere | ✅ |
| Test harness cannot execute DOM | `tests/cart-drawer-line-item.test.js:16` | ✅ |
| ~~`dop-cart-loading` has no CSS~~ | **FALSE.** `dopamiles-cart.css:1200-1204` — `opacity:.55; pointer-events:none`. 8 call sites. It is the drawer's only global input lock | ❌ retracted |
| ~~Region map complete~~ | **FALSE.** Omitted `[data-dop-eligible-qty]` + `[data-dop-total-units]` (`drawer.liquid:121-122`) — read as authoritative by `stack-save.js:300-307` | ❌ retracted |
| ~~Spinner restored on success~~ | **FALSE.** Restore is `catch`-only. `cart.js:272-274`: *"Success path discards DOM… so no restore needed there"* | ❌ retracted |
| ~~`#dop-cart-disc` holds live shopper state~~ | **FALSE.** `dop_cart_show_discount_input` defaults `false`, *"Off until the handler is wired"*; zero JS handlers exist | ❌ retracted |

## Behaviours that depend on the teardown

The load-bearing list. Each is handled in Phase 02 or 03; none may be skipped.

| # | Depends on teardown | Evidence | Handled |
|---|---|---|---|
| 1 | `.dop-cart-loading` is the only global input lock during SP toggle / SP auto-add | `cart.css:1200`; `cart.js:1128,1146,1221,1236` | P02 S1 |
| 2 | Stepper `disabled` + spinner glyph are never restored on success | `cart.js:270-291` | P02 S2 |
| 3 | `.dop-rm` disabled + spinner, same pattern | `cart.js:293-313` | P02 S2 |
| 4 | Count markers refreshed for free by the wholesale swap | `drawer.liquid:121-122`; `stack-save.js:300-307` | P03 S2 |
| 5 | `#dop-cart-err-banner` re-created by the swap on empty→items | `drawer.liquid:124-131`; `cart.js:41-47` | P03 S3 |
| 6 | `refreshDrawer` / `refreshPageTotals` are unqueued; teardown makes stale renders uniformly stale rather than mixed | `cart.js:68-88`, `:172-210`, `:318-342` | P02 S3 |

## Success criteria

- [ ] Line-item `<img>` node identity holds across a `±` tap
- [ ] `#dop-cart-lines.scrollTop` unchanged across a `±` tap
- [ ] Both steppers and `.dop-rm` usable after a **successful** mutation — no stranded spinner, no stuck `disabled`
- [ ] `[data-dop-eligible-qty]` matches the post-mutation cart after every mutation
- [ ] Error banner present and functional after an empty→items transition
- [ ] `.dop-li-was` strike appears/disappears correctly across a tier crossing
- [ ] `.dop-bundle` card price matches the footer Total after a mutation on an unrelated line
- [ ] Recs carousel holds its slide across a `±` tap, on **both** `dop_cart_recs_source` values
- [ ] Line-item list ≥1 full line visible at 375×500; checkout button fully in viewport at 375×470
- [ ] Reconcile disableable via a theme setting without reverting a commit
- [ ] `npm test` exits 0; `shopify theme check` clean
- [ ] Live theme `#158620516604` unchanged

## Cross-plan relationship

This plan `blocks`
[260725-1940](../260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix/plan.md).
Both live on `feat/cart-recs-and-tier-truth-260729` and modify the same drawer
and JS. That plan's Phase 04 steps 9-12 are open on a human checkout gate; once
this plan's commits land, that gate covers a changed footer and a changed
mutation path, so it must re-run over the combined result. Not blocked from
*starting* — blocked from *closing*.

Per red-team finding #15, this plan does **not** run its own parallel manual
matrix. Phase 04's QA rows are contributed to that plan's existing Phase 04
matrix, which already ran and passed on 2026-07-30 with `agent-browser`.

## Open questions

1. **Input lock** (Phase 02 Step 1) — deleting `.dop-cart-loading` removes `pointer-events:none` across the drawer during SP-path mutations, which disable only the checkbox. Keep the lock, replace it, or accept the exposure? Phase 02 Step 1 presents the three options; it is a user decision, not an implementer's.
2. **jsdom devDep** (Phase 04) — recommended. If declined, the reconcile ships guarded only by the manual matrix; record that as accepted rather than implied.
3. **SP subtitle metafield** (Phase 01 Step 5) — if `custom.subtitle` is set on the live SP product, the default-string edit is a no-op and the saving comes only from the ellipsis rule. Needs one read against the store.

## Red Team Review

### Session — 2026-08-05
**Findings:** 15 after dedup (36 raw, 4 reviewers) — 15 accepted, 0 rejected
**Severity breakdown:** 4 Critical, 9 High, 2 Medium
**Verification tier:** Full (all 4 roles). All findings carried `file:line` evidence; all Criticals independently re-verified by the orchestrator before acceptance.

| # | Finding | Sev | Disposition | Applied To |
|---|---------|-----|-------------|------------|
| 1 | `dop-cart-loading` has live CSS incl. `pointer-events:none`; plan's grep evidence was false | Critical | Accept | plan.md, Phase 02 S1 |
| 2 | Region map omits the two count markers feeding Stack & Save | Critical | Accept | Phase 03 S2 |
| 3 | Spinner/`disabled` ownership inverted — no success-path restore exists; reconcile strands both steppers | Critical | Accept | Phase 02 S2 |
| 4 | `outerHTML` equality-skip unreachable — `data-bound` written to live nodes only | Critical | Accept | Phase 03 S4 |
| 5 | `#dop-cart-err-banner` never inserted on empty→items; errors silently swallowed | High | Accept | Phase 03 S3 |
| 6 | `.dop-li-price` is not a leaf — conditional `.dop-li-was` strike destroyed by `textContent` | High | Accept | Phase 04 S3 |
| 7 | `.dop-bundle` cards contain no `.dop-li-*` leaves → stale bundle price | High | Accept | Phase 04 S4 |
| 8 | Phase 05 targeted a path the defect never touches; `addToCart` and `dropOrphanSP` omitted | High | Accept | Cut — see § Cut scope |
| 9 | `loadRelatedRecs` async-replaces the strip after reconcile, discarding preserved `scrollLeft`; unguarded re-fetch | High | Accept | Phase 04 S5 |
| 10 | Focus criterion unattainable — `disabled` blurs the button pre-fetch | High | Accept | plan.md non-goals |
| 11 | `DOMParser` node adoption ≠ innerHTML fragment-parse; unescaped SP subtitle sink | High | Accept | Phase 02 S4, S5 |
| 12 | `refreshDrawer`/`refreshPageTotals` bypass `queueCartMutation` → mixed-state reconcile | High | Accept | Phase 02 S3 |
| 13 | Discount-input P1 goal built on an unwired, default-off feature; SP checkbox is the real survivor | High | Accept | plan.md goals, Phase 03 S5 |
| 14 | No kill switch; try/catch cannot detect silent staleness; `replaceWith` cannibalizes the parsed source | Medium | Accept | Phase 02 S6, Phase 04 S6 |
| 15 | Process: Phase 01 tests don't cover its own changes; fixture capture unwired; duplicate QA matrix; ≥120px gate coin-flip; latency regex over-matches | Medium | Accept | Phase 01 S4/S5/S6, Phase 04 S7/S8 |

**Structural outcome:** 6 phases → 4. Former Phase 05 cut. Former Phase 02
(measurement) folded into Phase 01. Former Phase 06 (tests + QA) folded into
Phase 04, with its manual rows contributed to the sibling plan's existing matrix
rather than run twice. New Phase 02 created to dismantle the six teardown
dependencies before any reconcile lands.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, advice.md, phase-01-chrome-trim-port.md, phase-02-reconcile-prerequisites.md, phase-03-region-reconcile.md, phase-04-keyed-line-reconcile-and-qa.md
- Decision deltas checked: 15
- Reconciled stale references: 13 — retracted 4 evidence rows; removed the focus goal and its 3 criteria; removed the discount-code criteria; replaced the ≥120px absolute gate with the relative one (≥1 line visible at 375×500); removed all Phase 05/06 references from the phases table, dependencies, criteria and open questions; renumbered every phase cross-reference; folded the parallel QA matrix into the sibling's; corrected `advice.md`'s rejected-alternatives row, its "believed not verified" section, and its trade-off list; raised the effort estimate 1d → 2d to match the four phases' declared 14h
- Unresolved contradictions: 0
- Open questions carried forward: 3 (input lock, jsdom, SP metafield) — all are decisions awaiting input, not internal contradictions

<!-- slug: pod-tee-cart-drawer-reconcile-and-chrome-trim -->
