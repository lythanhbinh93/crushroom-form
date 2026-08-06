---
phase: 1
title: "Settle the mutation question"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Settle the mutation question

## Overview

Answer one question with evidence before any code is written: does a
theme-global setting survive a `/cart/change.js?sections=` re-render? Its answer
decides this plan's default layout. While the browser is open, close the two
checks the footer trim shipped without.

## Requirements

**Functional**
- A recorded, reproducible answer to the `?sections=` question
- The already-shipped `a84c6a3` copy fix seen rendering correctly on preview
- The outstanding 375×500 measurement from the predecessor plan, taken

**Non-functional**
- No code written in this phase
- No live push
- No repeated automated requests against the production storefront

## Architecture

Every `/cart/change.js?sections=dopamiles-cart-drawer` response re-renders the
section server-side. Shopify re-renders it with **schema defaults** for
*section*-level settings, which is why the cart-drawer widgets were deliberately
promoted to theme-global — theme-global `settings.*` resolves from the
merchant's saved `settings_data.json` instead.

That reasoning is sound and completely unverified. It is also already load-bearing
for `dop_cart_show_stack_save_bar`, which shipped on it.

**The test needs no new code.** `dop_cart_show_stack_save_bar` is a theme-global
boolean already wired to a visible element (`.dop-bundle-cart-bar`). Toggling it
and mutating the cart answers the question for every theme-global setting,
including the one this plan proposes.

## Related Code Files

- Read-only. This phase writes no code.
- Under observation: `dop_cart_show_stack_save_bar`, `.dop-bundle-cart-bar`,
  `snippets/dopamiles-bundle-cart-headline.liquid`

## Implementation Steps

### Step 1 — establish browser access, or stop

```bash
chrome-profile doctor
```

This has reported `bridge=none` in every session so far, and the DevTools MCP
reports no `DevToolsActivePort`. MCP servers attach at session start, so a
mid-session fix does not take effect — **restart the session** after configuring.

Setup: Chrome on `--remote-debugging-port=9222`, or `chrome-devtools-mcp` with
`--autoConnect --channel=stable`. Approve the remote-control prompt if shown. Use
the profile matching this store, `lythanhbinh1102` (Default) — a real profile is
what clears Cloudflare; a fresh automation profile is what triggered a block on
2026-08-05.

**If the bridge cannot be established, stop the phase and report.** Do not
substitute an offline mockup: that was tried on 2026-08-05, was wrong twice, and
was deleted. Fonts, merchant tokens and three separately-loaded stylesheets make
it unrepresentative.

Open the preview via `/admin/themes/160174997756/editor`. The
`myshopify.com?preview_theme_id=…` form 301s and drops cookies. Never curl —
unauthenticated curl ignores `preview_theme_id` and silently serves **live**.

### Step 2 — the mutation test

Preview `#160174997756` already carries `a84c6a3`.

1. Theme editor → gear (Theme settings) → **UpCart** → *Cart drawer widgets* →
   uncheck **Show Stack & Save tier progress bar**. Save.
2. Open the drawer with 2+ bundle-eligible tees. Confirm:
   ```js
   document.querySelector('.dop-bundle-cart-bar')   // → null
   ```
3. **The measurement.** Tap `+` on a line. Wait for the drawer to settle. Re-query:
   ```js
   document.querySelector('.dop-bundle-cart-bar')   // → null still?
   ```
4. Re-check the box, save, confirm the bar returns.

| Outcome | Meaning | Effect on this plan |
|---|---|---|
| Still `null` after the tap | Theme-global survives `?sections=` | Decision 2 stands; default `below_items`; proceed to Phase 02 |
| Bar reappears | Theme-global reverts to schema default mid-session | **Stop.** Default must become `top`, and the switch needs a mechanism that survives — likely a `data-` attribute on a node outside the swapped wrap, or a body class. Re-open the brainstorm before Phase 02 |

Record the raw result, not a summary. If the bar reappears, capture the section
response too — `/cart/change.js` returns the re-rendered section HTML, and
whether it contains `.dop-bundle-cart-bar` distinguishes a server-side default
from a client-side reconcile artifact.

### Step 3 — verify the copy fix that is already on preview

`a84c6a3` is on preview and deliberately not on live. Confirm in a browser what
the tests assert in Node:

- With **5+ eligible tees**: the headline reads
  `✓ Saved $25 · $5 off every extra tee`, and a CTA is present
- Nowhere does it say **Max savings**
- `Saved $25` renders **green** (`--dop-good #2d7a4f`), not accent orange —
  this is the `.success` descendant selector fix, which no Node test can prove
  renders
- With **2 tees**: `✓ Saved $4 · Add 1 more to save $9`, `Saved $4` also green

The green is the part worth looking at: it has never rendered correctly on any
theme, so there is no "before" to compare against from memory.

### Step 4 — take the outstanding footer-trim measurements

The predecessor plan shipped to live with these unmeasured. The browser is open;
take them.

Reference cart: 3 bundle-eligible tees + Shipping Protection.

At 375×800, 375×500 and 375×470:

```js
const h = document.querySelector('.dop-drawer-head').getBoundingClientRect().height;
const b = document.querySelector('.dop-bundle-cart-headline')?.getBoundingClientRect().height ?? 0;
const f = document.querySelector('.dop-drawer-foot').getBoundingClientRect().height;
const l = document.getElementById('dop-cart-lines').getBoundingClientRect().height;
const btn = document.getElementById('dop-cart-checkout-btn').getBoundingClientRect();
({ head:h, band:b, foot:f, chrome:h+b+f, lines:l, btnInView: btn.bottom <= innerHeight });
```

Gate: ≥1 full line item visible at 375×500, checkout button in viewport at
375×470. Take the same numbers on **live** `#158620516604` for a true
before/after — live and preview now differ only by `a84c6a3`.

Also check `/cart` on both: the trust line must be correctly sized, not an
unsized ~150px padlock. That was trap T1 and it shipped live today.

## Success Criteria

- [ ] `chrome-profile doctor` reports a reachable bridge, or the phase stopped and reported
- [ ] The `±`-tap result recorded verbatim, with the section response if it failed
- [ ] A decision recorded for decision 2: default stays `below_items`, or changes to `top`
- [ ] `a84c6a3` confirmed rendering on preview: correct copy, CTA present, no "Max savings"
- [ ] `Saved $X` confirmed **green** in an earned-tier state
- [ ] 375×500 and 375×470 measurements taken on preview **and** live
- [ ] `/cart` trust line confirmed correctly sized on live
- [ ] Nothing pushed anywhere in this phase

## Results

| Check | Result |
|---|---|
| `chrome-profile doctor` | |
| Bar hidden on load when unchecked | |
| **Bar still hidden after a `±` tap** | |
| Bar returns when re-checked | |
| Decision 2 — default stays `below_items`? | |
| `a84c6a3` copy correct on preview | |
| `Saved $X` renders green | |
| `#dop-cart-lines` @375×500 — preview / live | |
| Checkout button in viewport @375×470 | |
| `/cart` trust line sized correctly | |

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The bridge cannot be established again | Step 1 stops the phase rather than substituting a mockup or hammering the storefront. Three sessions have now failed here; if it fails again, the blocker is environmental and needs solving outside a plan |
| Cloudflare blocks cart mutations | Use a real Chrome profile, not a fresh automation profile. On the first challenge, stop — a repeat block costs more than the measurement |
| The `±` tap answer is ambiguous | Step 2 captures the raw `/cart/change.js` section response, which separates a server-side schema default from a client-side reconcile artifact |
| Measuring preview and calling it live | Preview and live differ by `a84c6a3`. Step 4 measures both. `.dop-cart-taxnote` is on both now, so it no longer distinguishes them — check `Max savings` instead: present on live, absent on preview |
| The phase is skipped as "obviously fine" | The whole point is that it is only obviously fine by reasoning. `dop_cart_show_stack_save_bar` already shipped on that reasoning, unverified |
