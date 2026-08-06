---
title: "Phase 2: Cover the meter with tests"
status: todo
phase: 2
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Cover the meter with tests

## Overview

Assert the meter's arithmetic and its edge states on rendered output, and lock
the two properties that would otherwise regress silently: the band's existing
copy contract, and the fact that none of this reached fixed chrome.

## Requirements

**Functional**
- Segment count and lit count asserted across the tier ladder
- The `met` flip asserted on the segments, with the band tint asserted constant
- The 10-segment cap and its scaled lit count asserted on a wide tier table
- Absent and zero tier tables asserted to render nothing
- Step counter asserted at every state

**Non-functional**
- Reuse `tests/liquid-harness.js`; no new dependency
- Every assertion falsifiable — a control that makes it fail
- No existing test in `tests/cart-bundle-band.test.js` is edited to accommodate
  the meter. If one breaks, the meter broke the copy contract

## Architecture

`tests/cart-bundle-band.test.js` already renders this snippet through liquidjs
and asserts copy with exact equality. The meter is new markup in the same
snippet, so it extends that file rather than starting another.

The existing suite is the regression net that matters here. It already locks:

- six exact copy strings across the tier ladder
- exactly one accented figure per state, and the banked figure green
- verb agreement, so `2 more tees saves` cannot come back
- no em dash anywhere in shopper-visible output
- no CTA, no eyebrow, no rules on the band
- the band is emitted once, by the section, adjacent to the strip

**Those tests must stay green untouched.** A restructure that needs them edited
has changed the copy contract, which is not what this plan is for.

## Related Code Files

- Modify: `tests/cart-bundle-band.test.js`
- Read-only: `tests/liquid-harness.js`, `snippets/dopamiles-bundle-cart-band.liquid`

## Implementation Steps

### Step 1 — segments

Render across the ladder and count. Against the default table (2/3/5, top
threshold 5):

| Eligible | Segments | Lit | Met |
|---|---|---|---|
| 1 | 5 | 1 | no |
| 2 | 5 | 2 | yes |
| 3 | 5 | 3 | yes |
| 4 | 5 | 4 | yes |
| 5 | 5 | 5 | yes |
| 6 | 5 | 5 | yes |

The 6-tee row is the one worth writing carefully: lit must **clamp** at the
segment count rather than emit a sixth segment or overflow the track.

Then the cap, on a tier table whose top threshold exceeds 10. Against a table
topping out at 50:

| Eligible | Segments | Lit | Why |
|---|---|---|---|
| 0 | — | — | renders nothing |
| 1 | 10 | 1 | rounds **up** — a shopper who has started never sees an empty meter |
| 5 | 10 | 1 | `ceil(5x10/50)` |
| 6 | 10 | 2 | `ceil(60/50)` |
| 50 | 10 | 10 | full |
| 60 | 10 | 10 | clamped |

The 1-tee row is the one that fails under truncation, and the 60-tee row is the
one that fails without the clamp. Both are the point of the cap.

Also assert the boundary: a table topping out at exactly 10 emits 10 segments
lit per-unit, identical to the uncapped path. The cap must not change behaviour
one unit before it engages.

### Step 2 — the met flip comes from one condition

Assert the wrapper modifier is present exactly when a tier is earned, and that
the segment markup carries no second, independent condition. Two conditions is
how a green segment ends up in an unearned state.

Do this by asserting the modifier's presence, not by inspecting colour — the
colour is a CSS fact and belongs to the CSS assertion in Step 5.

Assert the inverse too: the band's **tint** does not change with `met`. The
wrapper's class list should differ between the two states by the modifier alone.

### Step 3 — the step counter

Exact equality, not `includes()`. `2 / 3` and `2 / 5` share a prefix, and a
substring assertion passes on the wrong one.

At or past the top threshold there is no next tier, so the counter states the
count instead. Assert that arm separately at 5 and at 6.

### Step 4 — the states that must render nothing

- zero eligible items: no wrapper, no track, empty `text()`
- a cart of Shipping Protection alone: same
- an **absent** tier metafield: same
- a tier table that parses to a top threshold of zero: same, and specifically
  no empty `<div class="dop-bundle-cart-track">`

The last is the `(1..0)` and `divided_by: 0` guard from Phase 01 Step 3. Assert
the absence of the track element, not just empty text — an empty track still
paints a 5px grey rule across the band. A `divided_by: 0` in liquidjs surfaces
as a thrown error or `Infinity` depending on the operand types, so this test
also has to pass without the harness throwing.

### Step 5 — the CSS contract

Read `assets/dopamiles-bundle.css` and assert:

- `.dop-bundle-cart-band` is `flex-direction: column`
- the full-bleed margin is still `-18px` on both sides, and the bottom margin
  that joins the band to the strip is unchanged
- the band's background is the wash token and **no rule anywhere changes it
  under `.met`** — the tint is constant by construction, not by convention
- no `transition` on the segments, and no `prefers-reduced-motion` block in the
  file's new rules

The margin assertions are the important ones. They are coupled by number to
`.dop-cart-lines`' padding and to the adjacent-sibling join, both documented in
place, and a restructure is exactly when someone retunes them by eye.

The last two are negative assertions, which are weak on their own — they pass
vacuously against a file that was never edited. Pair each with a positive
assertion in the same test (the wash token is present; the segment colour rules
exist) so the test fails if the rules were never written at all.

Read `snippets/dopamiles-tokens.liquid` and assert `--dop-accent-wash` reads
`settings.dop_accent` — a literal hex there is the drift this decision exists to
prevent, and it is the single most likely thing to be "simplified" later.

### Step 6 — fixed chrome did not move

The whole reason the meter is in the band is that it costs scroll area and not
the gate. Assert it against the source: the head and footer rules in
`dopamiles-cart.css` and `dopamiles-cart-drawer-ui.css` are unchanged, and no
`.dop-bundle-cart-band` rule sets `position`.

A source-shape assertion is weak evidence on its own. It is here because the
strong evidence — measuring at 375x500 — needs a browser, and that measurement
belongs to `260806-1245` Phase 03.

### Step 7 — run

```bash
npm test
npx shopify theme check
```

Baseline measured during validation on 2026-08-06: **303 pass, 0 fail**. Expect
303 plus the new tests, still 0 failures. Any pre-existing band test that fails
is a signal the copy contract broke, not a test to update.

<!-- Updated: Validation Session 1 - cap rows, constant-tint assertions, token contract; transition/reduced-motion assertions dropped -->

## Todo

- [ ] Segment count and lit count across six rows, including the clamp at 6
- [ ] Cap rows on a 50-threshold table, including round-up at 1 and clamp at 60
- [ ] Boundary row: a top threshold of exactly 10 behaves per-unit
- [ ] Met flip asserted from one condition, and the tint asserted constant
- [ ] Step counter, exact equality, both arms
- [ ] Four render-nothing states, including the absent track element
- [ ] CSS contract: column, margins, constant wash, no transition
- [ ] Token contract: `--dop-accent-wash` reads the setting, not a literal
- [ ] Fixed-chrome source-shape assertion
- [ ] Both gates clean

## Success Criteria

- [ ] Every ladder row asserted for segment count, lit count and met
- [ ] Lit count clamps at the top threshold
- [ ] Cap asserted: 10 segments above a 10-unit threshold, lit rounded up, never zero for a non-empty cart
- [ ] A top threshold of exactly 10 asserted identical to the uncapped path
- [ ] Step counter exact at 1, 2, 3, 4, 5, 6
- [ ] Zero eligible, SP-only, absent metafield and zero top threshold all render nothing
- [ ] No empty track element in any render-nothing state, and no thrown division
- [ ] Band margins and the strip join asserted unchanged
- [ ] Band tint asserted identical in the met and unmet states
- [ ] No transition and no reduced-motion block asserted, each paired with a positive assertion
- [ ] `--dop-accent-wash` asserted to read `settings.dop_accent`
- [ ] **Every pre-existing band test still passes, unedited**
- [ ] `npm test` 0 failures (baseline 303), `theme check` 0 offenses

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tests are written to match whatever Phase 01 produced | The ladder table in Step 1 and the counter strings in Step 3 are specified here, before implementation, and derive from the resolver's documented fields rather than from rendered output |
| A copy test is "fixed" to accommodate new markup | Called out in Requirements, in Architecture and in Success Criteria. Those tests are the regression net; editing them removes the net |
| The fixed-chrome assertion reads as proof | Step 6 states plainly that it is source shape, and that the real measurement is Phase 03 of the sibling plan |
| Segment assertions pass vacuously on a snippet that renders nothing | Each render-nothing state asserts the **absence** of specific elements, and the ladder rows assert exact counts rather than presence |
