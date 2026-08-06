---
phase: 3
title: "Cover the trim with tests"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Cover the trim with tests

## Overview

Phase 02's changes are all in the drawer footer. The existing suite does not
reach it, so `npm test` going green after Phase 02 currently proves nothing
about Phase 02. Add the coverage, then cross-check the fresh rebuild against
the rolled-back implementation.

## Requirements

**Functional**
- Every deletion in Phase 02 has a source-shape assertion
- All 8 tax-note branches are *rendered*, not just parsed
- Negative controls prove the deletion assertions can fail

**Non-functional**
- No new test dependency — reuse `tests/liquid-harness.js`
- The slice under test is verified non-empty before anything is asserted against it

## Architecture

`tests/cart-drawer-line-item.test.js` slices the drawer source from
`<div class="dop-li{{ li_density }}"` to `<div class="dop-li-price">` — the line
item only. Everything Phase 02 touches is hundreds of lines outside that slice.

`theme check` parses Liquid without evaluating it, and has previously passed an
unclosed `{% if %}` in this repo. Only a rendered test proves the eight branches
emit text.

`tests/cart-shipping-protection.test.js:26` establishes the `renderSnippet`
precedent for rendering Liquid through liquidjs under `node --test`.

## Related Code Files

- Create: `tests/cart-drawer-footer.test.js`
- Read-only: `tests/liquid-harness.js`, `tests/cart-shipping-protection.test.js`
- Under test: `sections/dopamiles-cart-drawer.liquid`

## Implementation Steps

### Step 1 — slice the footer, and prove the slice is real

Anchor the end of the slice on `<div class="dop-cart-empty"`.

**Do not anchor on `{%- else -%}`.** That was the first draft last time and it
matched the `{% case %}` inside the discount row, truncating the slice *before*
the tax note. Every assertion then passed against an empty string. The bug
surfaced only because the render tests failed loudly — the source-shape tests
were perfectly happy.

Assert the slice length and its landmarks before any other test runs:

```js
const foot = footerBlock();
assert.ok(foot.length > 3000, 'footer slice must not be truncated');
assert.match(foot, /dop-cart-taxnote/);
assert.match(foot, /id="dop-cart-checkout-btn"/);
assert.match(foot, /dop-tot-row total/);
```

### Step 2 — source-shape assertions

- no `Subtotal &middot;` / `Subtotal ·`
- no `Calc&rsquo;d at checkout`
- no `<div class="dop-cart-secure">`
- `.dop-cart-taxnote` present, and its index is **before** `id="dop-cart-checkout-btn"`
- `#dop-cart-disc` and the `.dop-tot-row.disc` loop still present

Beware substring collisions. The eight locale keys are not mutually exclusive as
substrings — `taxes_at_checkout_shipping_at_checkout_without_policy` is a suffix
of `duties_included_taxes_at_checkout_shipping_at_checkout_without_policy`, and
`taxes_included_…_without_policy` relates the same way to the duties-and-taxes
arm. A naive `includes()` check passes on the wrong key. Match on a delimited
pattern (`'sections.cart.<key>' | t`) rather than a bare substring.

### Step 3 — render all eight tax-note branches

Drive the `duties_included × taxes_included × shipping_policy.body` matrix
through `renderSnippet`. For each of the eight:

- output is non-empty after `strip`
- output does not contain the literal key name (an unresolved key renders as
  itself — this is the assertion that catches a missing locale entry)
- the four `_html` arms contain an `<a` whose `href` is the policy URL passed in

### Step 4 — negative controls

A deletion assertion that cannot fail is decoration. Re-inject the deleted
markup into a copy of the source string in-memory and confirm each assertion
trips:

- re-added Subtotal row → the Subtotal assertion fails
- re-added Shipping row → the `Calc'd at checkout` assertion fails
- re-added `.dop-cart-secure` div → the wallet-line assertion fails

Nothing is written to disk.

### Step 5 — cross-check against the rolled-back implementation

The user chose a fresh rebuild over cherry-picking `7e4fe7c e823eea 9557bfb
4b2c0e2`. Those commits still exist on `rescue-260805` and were code-reviewed.
Diffing against them costs one command and is the cheapest available check that
the rebuild did not lose something the review had already secured:

```bash
git diff rescue-260805 -- sections/dopamiles-cart-drawer.liquid \
  snippets/dopamiles-cart-shipping-protection.liquid \
  assets/dopamiles-cart.css assets/dopamiles-cart-drawer-ui.css \
  assets/dopamiles-bundle.css
```

Expected differences, and only these:

| Difference | Why it is expected |
|---|---|
| `.dop-cart-lines .dop-li:not(.dop-li--compact)` vs `.dop-cart-lines .dop-li` | This plan fixes T2 at the point of writing; `rescue-260805` fixed it later, in `4b2c0e2` — compare against that commit's final state, not `7e4fe7c` |
| Comment wording | Rewritten, not transcribed |
| Anything else | **Investigate before proceeding.** A hunk present there and absent here is a candidate regression |

This is a read-only comparison. Do not merge or cherry-pick from it — the
rebuild decision stands.

### Step 6 — run

```bash
npm test
npx shopify theme check
```

Expect 218 + the new footer tests, 0 failures.

## Success Criteria

- [x] `tests/cart-drawer-footer.test.js` exists
- [x] Slice non-vacuousness asserted before any content assertion
- [x] Source-shape assertions cover all three deletions and the note's position
- [x] All 8 tax-note branches rendered; each non-empty and each resolving its key
- [x] Locale-key assertions are delimited, not bare substrings
- [x] Three negative controls confirmed to trip their assertions
- [x] `git diff rescue-260805` reviewed; every difference explained in § Results
- [x] `npm test` exits 0; `theme check` 0 offenses

## Results — DONE 2026-08-06

| Check | Result |
|---|---|
| Commit | `68ce666` — 5 files |
| Footer slice length | 4,979 chars; guard asserts >3000 plus three landmarks |
| New tests | 21 in `cart-drawer-footer.test.js`, 3 added to `cart-shipping-protection.test.js` |
| Suite total | 210 → **234 pass, 0 fail** |
| `theme check` | 237 files, 0 offenses |
| Unexpected hunks vs `rescue-260805` | **None.** All deltas explained below |

### The eight branches yield only four distinct strings

Measured, not assumed. `text()` strips tags, so each `_with_policy_html` string
and its `_without_policy` sibling collapse to identical text — 8 renders, 4
distinct outputs.

That means exact-equality on text covers the **duties × taxes** dimension (4
states) and the link assertion covers the **policy** dimension (2 states). 4 × 2
= 8. Both halves were mutation-tested rather than reasoned about:

| Mutation | Result |
|---|---|
| Duties-included arm swapped for the plain taxes arm | text equality fails ✅ |
| No-policy arm pointed at the `_html` key | link `doesNotMatch` fails ✅ |

Dropping either assertion leaves half the matrix unguarded.

**The suffix collision is real.** `"Taxes, discounts and shipping calculated at
checkout."` is an exact suffix of the duties-included variant, so `includes()`
passes on the wrong branch. Confirmed in-place; assertions use `strictEqual`.

The first mutation attempt was itself defeated by that collision — a
`String.replace` on the bare key hit the *duties* key first and corrupted a
different branch than intended. The retry anchored on the `'sections.cart.`
prefix. Worth recording: the hazard bites the person testing for it too.

### Two real gaps the cross-check found, both adopted

Step 5 said an unexplained hunk is a candidate regression. Two were, and neither
was cosmetic. Adopting them is not a reversal of the rebuild decision — deriving
the port fresh is what the user chose; shipping a known-inferior variant after
the cross-check surfaced a better one was never part of it.

**1. The trust-line CSS was in the wrong stylesheet.** Phase 02 kept
`.dop-cart-secure` in `dopamiles-cart-drawer-ui.css`, reasoning that the file is
loaded site-wide so `/cart` stays styled. It is loaded site-wide — but
**asynchronously**, `media="print" onload="this.media='all'"`
([theme.liquid:106](../../../pod-tee-theme/layout/theme.liquid#L106)). So `/cart`
would flash the unsized ~150px padlock until it arrived: the same defect T1
exists to prevent, transient instead of permanent.

`dopamiles-cart-page.css` is a **blocking** link inside the cart section itself
([cart-main.liquid:8](../../../pod-tee-theme/sections/dopamiles-cart-main.liquid#L8)),
and the block sits inside `.dop-cart-summary`. Rules moved there and scoped.
The test now asserts the load mechanism, not just the rule's existence.

**2. The SP subtitle was an unescaped merchant-controlled sink.** The `| escape`
fix exists as `51de695` on branch `fix/sp-subtitle-escape` — **not an ancestor
of this branch**, so it was never here. The superseded plan's log recorded it as
"recovered", which was true of the commit but not of the working branch.

It became load-bearing rather than optional: holding the subtitle to one line
required a `title` attribute so truncated text stays readable, which turns one
text-node sink into a text-node **and attribute** sink. An unescaped attribute is
the more direct injection of the two. Both now escaped, with a test.

Its first assertion failed — correctly. liquidjs encodes `"` as `&#34;`;
Shopify's `escape` emits `&quot;`. The code was right and the test was wrong.
Rewritten to assert the property (the attribute cannot be broken out of) rather
than one engine's entity spelling.

### Cross-check ledger

| File | Delta vs `rescue-260805` | Verdict |
|---|---|---|
| `dopamiles-bundle.css` | none | identical |
| `dopamiles-cart-page.css` | comment wording | expected |
| `dopamiles-cart-shipping-protection.liquid` | comment wording | expected |
| `dopamiles-cart-drawer-ui.css` | comment wording | expected |
| `dopamiles-cart-drawer.liquid` | comment wording + indentation | expected |
| `dopamiles-cart.css` | comment wording **+ `.dop-cart-loading` opacity** | expected — traced to `bf8f0c8`, the parked reconcile-prerequisites commit, not chrome-trim work |

Zero unexplained hunks.

### One test caught its own author

After the CSS move, `the wallet line CSS survives for the cart page` failed —
it still asserted the rules were in `drawer-ui.css`. The correct failure is
evidence the assertion was never vacuous. Rewritten to assert the stronger
property: rules present in the blocking stylesheet, absent from the async one,
and the cart section loading its sheet synchronously.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The slice truncates and every assertion passes vacuously | Step 1 asserts length and three landmarks first; this exact bug happened last time |
| A locale assertion passes on the wrong key by substring | Step 2 mandates delimited matching and names the two prefix collisions |
| Deletion assertions are unfalsifiable | Step 4 proves each one can fail |
| The rebuild silently drops a reviewed fix | Step 5 diffs against `rescue-260805` and requires every difference to be explained |
| Rendered tests need a browser | They do not — liquidjs under `node --test`, per the `cart-shipping-protection.test.js` precedent. No DOM, no layout |
