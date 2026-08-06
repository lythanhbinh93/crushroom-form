---
phase: 2
title: "Port the BNC footer trim"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Port the BNC footer trim

## Overview

Rebuild `tytkwe-qe-theme@ae6fb4d + e6ad2fd` against the dopamiles theme as two
mirroring commits. Pure Liquid and CSS — no JS, no change to the mutation path,
no change to any money figure.

## Requirements

**Functional**
- Subtotal row gone; the item count still readable in `#dop-cart-count-label`
- Shipping row gone; its disclosure carried by a tax/shipping note above Checkout
- Wallet/secure line gone **from the drawer**, still rendering on `/cart`
- Shipping Protection subtitle held to one line, ellipsised not wrapped
- Discount rows and `#dop-cart-disc` untouched

**Non-functional**
- Zero new locale strings
- Compact drawer rows do not grow (trap T2)
- No `bnc-` string, no `--bnc-` custom property, no `*/` inside a ported comment

## Architecture

Three drawer children never shrink — `.dop-drawer-head`, the tier bar wrapper
and `.dop-drawer-foot` — while `.dop-cart-lines` carries `flex: 1; overflow-y:
auto`. Every pixel taken off the fixed three is a pixel the list gains. The flex
model does not change; only the fixed heights do.

BNC measured 515px → 367px in `ae6fb4d`, then 367px → 343px in `e6ad2fd`.

## Related Code Files

- Modify: `sections/dopamiles-cart-drawer.liquid`
- Modify: `snippets/dopamiles-cart-shipping-protection.liquid`
- Modify: `assets/dopamiles-cart.css`
- Modify: `assets/dopamiles-cart-drawer-ui.css`
- Modify: `assets/dopamiles-bundle.css`
- Reference (read-only): `D:\github local\tytkwe-qe-theme` @ `ae6fb4d`, `e6ad2fd`
- **Do not modify**: `sections/dopamiles-cart-main.liquid` — it is the reason T1 exists

## Implementation Steps

### Step 1 — commit A, mirroring `ae6fb4d`

**`sections/dopamiles-cart-drawer.liquid`**

1. Delete the Subtotal row — the first `.dop-tot-row` inside `#dop-cart-totals`
   at **line 312-315**. Leave a comment saying why: it printed the same
   `cart.total_price` as the Total row below, and the count already sits in the
   drawer heading. `dop_display_count` stays in use at lines 92-99, so nothing
   is orphaned.

2. **Delete the Shipping row at lines 331-334 outright — trap T3.** BNC gated a
   FREE branch on `settings.dop_cart_show_shipping_bar and ship_qualifies`.
   Neither identifier exists anywhere in pod-tee (verified: zero matches
   repo-wide). Porting the conditional would add a branch that can never be
   true. The row can only ever say "Calc'd at checkout" — precisely the state
   BNC removed.

3. Insert `<p class="dop-cart-taxnote">…</p>` directly above
   `#dop-cart-checkout-btn`, copying BNC's `cart.duties_included` /
   `cart.taxes_included` branch, each arm branching again on
   `shop.shipping_policy.body == blank`. Eight paths:

   | duties | taxes | policy body | key |
   |---|---|---|---|
   | ✓ | ✓ | blank | `duties_and_taxes_included_shipping_at_checkout_without_policy` |
   | ✓ | ✓ | set | `duties_and_taxes_included_shipping_at_checkout_with_policy_html` |
   | ✗ | ✓ | blank | `taxes_included_shipping_at_checkout_without_policy` |
   | ✗ | ✓ | set | `taxes_included_shipping_at_checkout_with_policy_html` |
   | ✓ | ✗ | blank | `duties_included_taxes_at_checkout_shipping_at_checkout_without_policy` |
   | ✓ | ✗ | set | `duties_included_taxes_at_checkout_shipping_at_checkout_with_policy_html` |
   | ✗ | ✗ | blank | `taxes_at_checkout_shipping_at_checkout_without_policy` |
   | ✗ | ✗ | set | `taxes_at_checkout_shipping_at_checkout_with_policy_html` |

   All under the `sections.cart.` namespace. The `_html` arms take
   `link: shop.shipping_policy.url`.

4. **Delete only the `<div class="dop-cart-secure">` block at lines 350-353.**
   **Trap T1: do not delete its CSS.** BNC could, because nothing rendered it
   there any more. In pod-tee `sections/dopamiles-cart-main.liquid:167` still
   renders `.dop-cart-secure`, and `dopamiles-cart-drawer-ui.css` is loaded
   site-wide from `layout/theme.liquid` — so `.dop-cart-secure` and
   `.dop-cart-secure svg` (drawer-ui.css:96-111) are the cart page's **only**
   definition. Removing them leaves an unsized inline SVG, a ~150px padlock, on
   `/cart`.

**`snippets/dopamiles-cart-shipping-protection.liquid`**

5. Shorten the default subtitle to `Covers loss, damage &amp; theft`. This is
   the `default:` fallback behind `product.metafields.custom.subtitle`. That
   metafield read back `null` on the live SP product
   (`gid://shopify/Product/9339829256444`, handle `shipping-protection`) on
   2026-08-05, so the default is what renders and the ~18px saving is real. If
   the merchant has set it since, the saving comes only from the ellipsis rule
   in Step 13 — re-read before claiming the pixels.

**`assets/dopamiles-cart.css`**

6. `.dop-drawer-head` (line 57): padding `18px 22px` → `14px 18px`
7. `.dop-cart-lines` (line 144): padding `0 22px` → `0 18px`
8. **Trap T2.** BNC added `.bnc-cart-lines .bnc-li { padding: 14px 0 }`, which
   is unambiguous there. pod-tee has `.dop-li--compact { padding: 12px 0 }`
   (line 180-184) and `dop_cart_line_density` defaults to `"compact"` — the
   live value. A descendant selector `.dop-cart-lines .dop-li` scores (0,2,0)
   and beats `.dop-li--compact` at (0,1,0), so the naive port takes the default
   row from 12px to **14px**: taller, in a change whose entire purpose is to
   make the drawer shorter. Write it so compact is excluded:

   ```css
   /* Drawer rows only. `.dop-li` is shared with the cart page, which has the
      full viewport and keeps the roomier 18px rhythm. `.dop-li--compact` is
      the drawer's default density and already sets its own 12px — this rule
      must not out-specify it. */
   .dop-cart-lines .dop-li:not(.dop-li--compact) {
     padding: 14px 0;
   }
   ```

**`assets/dopamiles-cart-drawer-ui.css`**

9. `.dop-drawer-foot` (line 14, 17): padding `18px 22px 22px` → `12px 18px 14px`;
   gap `14px` → `8px`
10. Add, before the existing `.dop-cart-totals .dop-tot-row.total` rule:
    ```css
    /* With Subtotal and Shipping gone, a no-discount cart leaves Total as the
       only row, and its separator would land under the protection card's own
       border. A discount cart still gets the divider. */
    .dop-cart-totals .dop-tot-row.total:first-child {
      padding-top: 0;
      border-top: 0;
    }
    ```
11. **Add** `.dop-cart-taxnote` rules — do **not** replace `.dop-cart-secure`
    (T1):
    ```css
    .dop-cart-taxnote {
      margin: 0 0 -2px;
      text-align: center;
      font-size: 11px;
      line-height: 1.4;
      color: var(--dop-ink-3, #737373);
    }
    .dop-cart-taxnote a {
      color: var(--dop-ink-2, #3a3a3a);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    ```
    Confirm `--dop-ink-2` is defined in `snippets/dopamiles-tokens.liquid`; if it
    is not, the fallback still renders but the link stops following a merchant
    palette change. Record the answer in § Results.
12. `.dop-cart-shipping-protect` (line 194): padding `12px 14px` → `10px 12px`;
    `.dop-sp-row` grid gap `12px` → `10px`
13. `.dop-sp-sub` (line 236) gains `white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis`

**`assets/dopamiles-bundle.css`**

14. `.dop-bundle-cart-headline` (line 96-97): padding `10px 12px` → `9px 12px`;
    margin `0 0 12px` → `0 0 8px`
15. `.dop-bundle-cart-bar` (line 148): margin `14px 0 22px` → `11px 0 18px`

```
fix(cart-drawer): keep the line-item list visible on short viewports
```

### Step 2 — commit B, mirroring `e6ad2fd`

16. `.dop-drawer-foot` gap `8px` → `0`
17. `.dop-cart-taxnote` margin `0 0 -2px` → `0 0 6px`
18. `.dop-bundle-cart-headline` gap `8px` → `6px 8px` — the row gap survives
    because below ~360px the message and its CTA wrap onto separate lines and
    it is the only thing separating them; at wider widths they share a line and
    it never applies
19. `.dop-bundle-cart-bar` margin `11px 0 18px` → `5px 0 18px` — pays back the
    row gap, so message-to-bar distance is unchanged

```
style(cart-drawer): drop the vertical gaps in the footer and tier bar
```

### Step 3 — rename and hygiene sweep

Every value above was transcribed from BNC's `bnc-` source.

```bash
grep -rn "bnc-\|--bnc-\|dataset\.bnc\|window\.bnc" assets/ sections/ snippets/
```

Must return nothing. A hyphen-scoped find/replace misses camelCase dataset keys
(`dataset.bncX`) and `window.`-scoped globals, so grep those shapes separately
rather than trusting the replace.

Then check every comment added in Steps 1-2 for a literal `*/` inside the body.
One stray occurrence makes the Shopify CDN minifier parse **zero** rules from
the file — silently, and while passing `theme check`.

### Step 4 — confirm the locale keys before trusting the note

```bash
for k in duties_and_taxes_included_shipping_at_checkout_without_policy \
         duties_and_taxes_included_shipping_at_checkout_with_policy_html \
         taxes_included_shipping_at_checkout_without_policy \
         taxes_included_shipping_at_checkout_with_policy_html \
         duties_included_taxes_at_checkout_shipping_at_checkout_without_policy \
         duties_included_taxes_at_checkout_shipping_at_checkout_with_policy_html \
         taxes_at_checkout_shipping_at_checkout_without_policy \
         taxes_at_checkout_shipping_at_checkout_with_policy_html; do
  n=$(grep -l "\"$k\"" locales/*.json 2>/dev/null | grep -vc "schema" )
  echo "$n  $k"
done
```

All eight must be present in `en.default.json` at minimum. A key missing from a
non-default locale degrades to the key name for that language, not to an error —
which is exactly the kind of failure that ships unnoticed. Record the counts.

### Step 5 — static verification

```bash
npm test                # must still be 0 failures (Phase 03 adds the new coverage)
npx shopify theme check
```

`theme check` parses Liquid without evaluating it, so a green run here proves
syntax, not that the eight branches produce text. That proof is Phase 03.

## Success Criteria

- [x] Two commits, mirroring BNC's split
- [x] Zero `Subtotal ·`, zero `Calc'd at checkout`, zero `<div class="dop-cart-secure">` in the drawer section
- [x] **T1** `.dop-cart-secure` CSS still present in `drawer-ui.css`; `/cart` markup untouched
- [x] **T2** the new row rule excludes `.dop-li--compact`; compact stays 12px
- [x] **T3** no `ship_qualifies` conditional introduced
- [x] `.dop-cart-taxnote` sits between `#dop-cart-totals` and `#dop-cart-checkout-btn`
- [x] Discount rows and `#dop-cart-disc` unmodified
- [x] All 8 locale keys confirmed in `en.default.json`
- [x] Sweep clean: no `bnc-`, no `--bnc-`, no `*/` inside added comments
- [x] `npm test` 0 failures; `theme check` 0 offenses

## Results — DONE 2026-08-06

| Check | Result |
|---|---|
| Commit A | `3e40da0` — 5 files, +114/−23 |
| Commit B | `8a5d67c` — 2 files, +17/−3 |
| `--dop-ink-2` defined in tokens? | **Yes** — `snippets/dopamiles-tokens.liquid:14`, merchant-settable via `settings.dop_ink_2`, fallback `#3A3A3A`. The note's policy link follows a palette change. Open question 1 closed |
| SP `custom.subtitle` still null? | Not re-read this session; carried from the 2026-08-05 Admin API read. The ellipsis rule (Step 13) holds the height either way |
| Locale keys | All 8 present in `en.default.json` **and in all 31 non-schema locale files**. Zero gaps |
| CSS parse sanity | `cart.css` 168 rules, `drawer-ui.css` 32, `bundle.css` 21 — braces balanced, no orphan `*/` after comment-stripping |
| `npm test` | 210 pass, 0 fail |
| `theme check` | 237 files, 0 offenses |

### Correction — the locale-file count is 31, not 37

Both this phase and the superseded plan asserted "all 37 non-schema locale
files". The repo has **31**. The claim that matters — all eight keys present in
every one of them — holds; the denominator was wrong and is now measured rather
than inherited.

### A hazard this phase created, then removed

The Step 1.2 comment originally explained the deletion by naming the sibling
theme's `ship_qualifies` predicate. That put the identifier back into the repo
as a comment, so this phase's own T3 verification — a repo-wide grep expecting
**zero** matches — began returning 1. A future audit would have read that as
"pod-tee has a free-shipping mechanism".

Reworded to "its free-shipping predicate". The explanation survives; the grep is
clean again. Same class of problem as the substring collisions Phase 03 Step 2
guards against, and worth remembering: prose that names an absent identifier
defeats absence checks.

**Consequence for Phase 03.** `.dop-cart-secure` is still named in a comment at
`cart-drawer.liquid:395` — deliberately, because T1 is subtle and the next
person to touch this needs to know why the CSS stays. So the deletion assertion
must target the markup (`<div class="dop-cart-secure">`), not the bare class
name. A bare-substring test would fail against a correct implementation.

### Green tests here prove nothing about this phase

`npm test` is 210/210, but the existing suite's drawer coverage stops at the
line item. Every change above is in the footer, hundreds of lines outside that
slice. The pass is a no-regression signal only; the coverage is Phase 03's job.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| T1 recurs and `/cart` gets an unsized padlock | Step 1.4 names the file, the line and the consequence; the criterion is checked separately from the markup deletion |
| T2 recurs and compact rows grow | Step 8 ships the `:not()` form as the literal rule to write, with the specificity arithmetic spelled out |
| A ported comment carries `*/` and silently voids a stylesheet | Step 3 greps added comment bodies specifically |
| The trim under-delivers on height | Remedy stays in this phase: `.dop-cart-taxnote` to 10.5px/1.3, or zero `.dop-tot-row.disc` padding. Do not carry a shortfall into Phase 04 |
| A locale key is missing in a non-default file | Step 4 counts per key across all locale files; a missing key degrades silently to the key name |
