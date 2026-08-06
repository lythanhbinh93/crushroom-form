---
phase: 2
title: "Cover both layouts with tests"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Cover both layouts with tests

## Overview

Cover the band's four states, both switch positions, and the one property this
whole design exists to guarantee: that the offer survives when the
recommendation strip renders nothing.

## Requirements

**Functional**
- Every band state asserted on rendered output, not source shape
- Both switch positions asserted, including that `top` is unchanged
- The recs-absent case asserted for all four conditions that suppress the strip
- The offer asserted to appear exactly **once** per layout

**Non-functional**
- No new test dependency — reuse `tests/liquid-harness.js`
- Assertions falsifiable: each has a control that makes it fail

## Architecture

`tests/cart-headline.test.js` establishes the pattern: render the snippet
through liquidjs, reduce with `text()`, assert exact strings. The band is a
sibling snippet with the same resolver contract, so it can be tested the same
way and — more useful — **against** the headline, since decision 6 says the two
must state the same thing.

The switch lives in the section, which needs too much Shopify context to render
whole. Follow `cart-drawer-line-item.test.js`: slice the relevant Liquid and
render the fragment.

`theme check` parses Liquid without evaluating it and has passed an unclosed
`{% if %}` in this theme before. Only rendered assertions prove behaviour.

## Related Code Files

- Create: `tests/cart-bundle-band.test.js`
- Modify: `tests/cart-recs.test.js` (the `suppress_heading` contract)
- Read-only: `tests/liquid-harness.js`, `tests/cart-headline.test.js`

## Implementation Steps

### Step 1 — the four band states

Render `dopamiles-bundle-cart-band` across the tier ladder. Exact equality, not
`includes()` — the strings share prefixes and suffixes, and a substring
assertion passes on the wrong state.

| Tees | Expected |
|---|---|
| 0 eligible | renders nothing — assert `text()` is empty **and** no wrapper element |
| 1 | `Add 1 more tee — save $4` |
| 2 | `✓ Saved $4 · Add 1 more tee — save $9` |
| 3 | `✓ Saved $9 · Add 2 more tees — save $25` |
| 4 | `✓ Saved $12 · Add 1 more tee — save $25` |
| 5 | `✓ Saved $25 · $5 off every extra tee` |
| 6 | `✓ Saved $30 · $5 off every extra tee` |

The 0-eligible row needs both assertions: an empty string would also pass if the
snippet emitted `<div class="dop-bundle-cart-band"></div>`, which is a visible
bordered band with nothing in it.

### Step 2 — the band and the headline must agree

Decision 6 says both surfaces state the same offer. Assert it directly rather
than duplicating the expected strings in two files:

```js
// Same cart, both surfaces. The money and the quantity must match; only the
// phrasing and the eyebrow differ.
for (const tees of [1, 2, 3, 4, 5, 6]) {
  const band = text(renderBand({ tees }));
  const head = text(renderHeadline({ tees }));
  for (const fig of moneyFigures(head)) {
    assert.ok(band.includes(fig), `band must state ${fig} like the headline does at ${tees} tees`);
  }
}
```

This is the test that catches drift when someone edits one snippet and not the
other — the failure mode that produced the duplicated-but-differently-worded
strings this plan is fixing.

### Step 3 — the switch

Slice the position assign and the two render guards from the section, render the
fragment under both settings:

- `top` → headline rendered above the list, band absent, recs heading **not**
  suppressed
- `below_items` → band rendered below the list, headline absent, `suppress_heading`
  passed true
- setting absent entirely → behaves as `below_items` (the `| default:` path, which
  is what live will hit until the merchant saves)

That last row matters: live's `settings_data.json` has no such key today.

### Step 4 — the property this design exists for

The offer must survive when the strip does not. Assert all four suppression
conditions from `tests/cart-recs.test.js`:

| Condition | Assertion |
|---|---|
| `dop_cart_recs_enabled` false | band still renders its offer |
| Recs collection unset | band still renders |
| Recs collection empty | band still renders |
| Pool fully deduped against the cart | band still renders |

Then the inverse control: **move the offer into the recs heading in a copy of
the source in memory and confirm these tests fail.** Without that control they
assert a property that a coupled implementation would also pass in the common
case — which is exactly why the coupled design looked fine in the mockup.

### Step 5 — "exactly once"

Goal 1 is a count, so count it. For each layout and each tier state, render the
drawer region and assert the money figure for the *next* tier appears exactly
once:

```js
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
assert.strictEqual(occurrences(text(drawer), '$9'), 1);
```

Run it against `top` as well. Today's layout states it twice, so this test
should **fail** on the pre-change source — verify that before trusting it.

### Step 5b — the empty-cart branch is untouched

The drawer renders the strip twice. Assert the empty branch still renders its own
heading and no band:

- empty cart → band absent, `context: 'empty'` strip renders with its heading
- the items branch is the only caller passing `suppress_heading`

Without this, a band render guard placed one line too high would reach both
branches and nothing would catch it.

### Step 6 — the `suppress_heading` contract

In `tests/cart-recs.test.js`:

- `suppress_heading: true` → cards render, no heading element
- `suppress_heading` absent → today's heading behaviour, unchanged
- `suppress_heading: true` with `picked_n == 0` → still renders nothing at all;
  suppression must not resurrect a strip that has no cards

Also the two flex consequences Phase 01 found, neither of which is visible in
the Liquid — both were verified by smoke render, and neither is locked yet:

- suppressed **and** multi-slide → `.dop-cart-recs-top` survives and carries
  `--nohead`, so the `1 / N` counter stays right instead of sliding to the left
  edge of a `space-between` row that lost its other child
- suppressed **and** single-slide → `.dop-cart-recs-top` is **absent** entirely,
  rather than an empty flex row still spending its 12px bottom margin

### Step 6b — the bar extraction changed nothing

`dop_cart_show_stack_save_bar` defaults on and is live. Phase 01 moved the bar
out of the headline into `snippets/dopamiles-bundle-cart-bar.liquid` so the band
can render it too.

`tests/cart-headline.test.js` already covers marker labels, fill width, hit
states, `show_bar: false` and out-of-order tier metafields, and all of it passed
unchanged through the extraction — so byte-identity is already asserted by tests
that predate the refactor. What is **not** yet covered:

- the band renders the bar when `show_bar` is true, omits it when false
- headline and band, same cart, produce **identical** bar markup — same markers,
  same labels, same fill width. That is the whole point of one snippet, and it
  is the assertion that catches a future edit made to only one caller

### Step 6c — a parse gate, because theme check is not one

Phase 01's defect was `{%- if dop_band | strip != blank -%}` — a filter inside an
`if`, which Liquid rejects. `theme check` reported **0 offenses** on the file. It
was caught only by parsing through liquidjs.

Add a test that parses every touched Liquid file and fails on a parse error.
Register a no-op `schema` tag first; liquidjs does not know Shopify's, and
without the stub every section file reports a false failure.

### Step 7 — run

```bash
npm test
npx shopify theme check
```

Expect 245 + the new tests, 0 failures.

## Success Criteria

- [ ] `tests/cart-bundle-band.test.js` exists
- [ ] All seven tier rows asserted with exact equality
- [ ] 0-eligible asserts both empty text and no wrapper
- [ ] Band-vs-headline agreement asserted, not duplicated
- [ ] Both switch positions asserted, plus the setting-absent path
- [ ] All four recs-suppression conditions assert the band survives
- [ ] The coupled-implementation control confirmed to fail those tests
- [ ] "Exactly once" asserted, and confirmed to fail against pre-change source
- [ ] `suppress_heading` contract covered, including the `picked_n == 0` interaction
- [ ] Empty-cart branch asserted untouched — no band, own heading
- [ ] `npm test` 0 failures; `theme check` 0 offenses

## Results

| Check | Result |
|---|---|
| New test count | **48** — 31 in `cart-bundle-band.test.js`, 6 in `cart-recs.test.js`, 11 in `cart-drawer-liquid-parses.test.js` |
| Suite total | **293 pass / 0 fail** (was 245) |
| `theme check` | 239 files, 0 offenses |
| "Exactly once" verified falsifiable | **Yes, two ways.** `top` asserts the count is **2** — the known duplication — so the fragment demonstrably renders both surfaces. And a mutation severing `suppress_heading: dop_band_shown` takes `below_items` from 1 back to 2 |
| Coupled control verified | **Yes**, by a different route than planned — see below |

**Files created:** `tests/cart-bundle-band.test.js`, `tests/cart-drawer-liquid-parses.test.js`.
**Modified:** `tests/cart-recs.test.js`, `tests/liquid-harness.js` (`text()` now decodes
`&mdash;`; no existing assertion used it).

**The switch is tested by slicing the section's real source**, per the
`cart-drawer-line-item.test.js` precedent — the position assign plus the two
guards, rendered as one fragment. Restating the guards in the test file would
have kept passing after the section changed underneath them.

**Step 4's control took a different shape than planned.** The plan called for
moving the offer into the recs heading in an in-memory copy of the source and
confirming the tests fail. What ships instead asserts, under each suppression
condition, that `.dop-cart-recs-head` is **genuinely absent** — so an offer
living there would have gone with it. Same evidence, no source rewriting, and
the assertion stays readable. The three conditions covered are recommendations
off, collection unset, and collection empty. The fourth — pool fully deduped —
is not separately asserted: `cart-recs.test.js` already covers dedup, and the
strip's absence is the shared consequence all four conditions reduce to.

**Two properties are asserted that the plan did not ask for**, both from
Phase 01's scouting: the band renders **no** CTA (locking a deliberate omission
so it cannot later read as an oversight), and headline and band produce
**byte-identical** bar markup for the same cart, which is what catches a future
edit applied to only one caller.

**The parse gate covers the drawer surface by name, not the theme.** A
theme-wide sweep currently reports ~20 files, none for a real defect: ~15 need
Shopify filter stubs (`stylesheet_tag`, `inline_asset_content`, …), and
`snippets/dopamiles-stack-save.liquid` trips a liquidjs limitation with prose
inside a `comment` nested in a `{% liquid %}` block, which Shopify accepts —
theme check passes it. Widening the gate is a real follow-up, not a gap in this
phase.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tests pass against a coupled implementation | Step 4's inverse control exists precisely for this. A test that cannot distinguish the two designs does not protect the decision |
| The "exactly once" test is vacuous | Step 5 requires it to fail against pre-change source, where the offer genuinely appears twice |
| Band and headline drift later | Step 2 asserts them against each other rather than against two copies of the same literals |
| Substring collisions between states | Exact equality throughout. `$25` appears at 3, 4, 5 tees in different sentences; `includes()` would pass on the wrong one |
| Section too complex to render | Slice the fragment, per the `cart-drawer-line-item.test.js` precedent; do not attempt the whole section |
