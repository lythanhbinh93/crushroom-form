---
phase: 4
title: "Preview verification and bar toggle"
status: in-progress
priority: P1
effort: "2h"
dependencies: [3]
---

# Phase 4: Preview verification and bar toggle

## Overview

Measure the trim on a real preview theme, and verify the already-shipped
`dop_cart_show_stack_save_bar` control does what ask 2 wanted. Both need a
browser; neither can be simulated.

This is the phase that killed the previous attempt — Cloudflare blocked cart
mutations on the production store from an automation-fresh browser profile.
Step 1 checks that path is open **before** any other work.

## Requirements

**Functional**
- `#dop-cart-lines` shows ≥1 full line at 375×500
- `#dop-cart-checkout-btn` fully in viewport at 375×470
- Unchecking the bar setting removes `.dop-bundle-cart-bar`, and it stays removed
  after a cart mutation
- The cart **page** keeps its roomier row rhythm (the T2 scoping check)

**Non-functional**
- Live theme `#158620516604` unchanged throughout
- No Theme Access token in chat, in a file, or in a commit

## Architecture

The drawer's fixed chrome is header + tier band + footer; `.dop-cart-lines` is
the only flex child that can shrink, so it absorbs the entire deficit. BNC
measured 515px → 343px. dopamiles' starting values were verified identical to
BNC's pre-state, so a comparable result is expected — but the tax note adds back
one to two lines and dopamiles' tier band differs, so the gate is the relative
one (≥1 line visible), not a pixel target.

`dop_cart_show_stack_save_bar` is theme-global rather than section-level
specifically so it survives the Section Rendering API: every
`/cart/change.js?sections=` call re-renders the section with **schema defaults**,
which wipes section-level values. Theme-global `settings.*` reads from
merchant-saved data and should be immune. Step 5 is what turns "should be" into
"is".

## Related Code Files

- Read-only: everything. This phase measures and configures; it does not edit code.
- Theme setting: **Show Stack & Save tier progress bar** (`dop_cart_show_stack_save_bar`)

## Implementation Steps

### Step 1 — gate: confirm browser access before anything else

```bash
chrome-profile doctor
```

The previous session stopped here with `bridge=none`. MCP servers load at
session start, so if the bridge is missing, **restart the session** rather than
retrying — and approve Chrome's remote-control prompt if shown.

Root cause of the earlier failure was browser identity, not credentials: a fresh
automation profile scores badly with Cloudflare, while a real Chrome profile
carries the history and cookies that clear it. The account profile matching this
store is `lythanhbinh1102` (Default).

**If the bridge cannot be established, stop this phase.** Do not fall back to
repeated automated hits on a live production store; the last attempt put the
whole storefront behind a challenge for that session. Report the block and leave
Phases 01-03 committed and green.

Auth: supply the Theme Access token through the environment. The previous
token was pasted into chat and must be treated as burned and rotated.

Use `agent-browser` or the Chrome DevTools MCP — **not curl**. Unauthenticated
curl ignores `?preview_theme_id` and silently serves **live**. Open the preview
via `/admin/themes/160174997756/editor`; the
`myshopify.com?preview_theme_id=…` form 301s and drops cookies.

### Step 2 — baseline, before the push destroys it

Preview `#160174997756` currently holds pre-trim markup. That is the baseline,
and pushing overwrites it. Measure first.

State check, so there is no ambiguity about which build is on screen:
`.dop-cart-taxnote` is **absent** pre-trim and **present** post-trim.

Reference cart, identical for both passes: 3 bundle-eligible tees + Shipping
Protection.

At 375×800:

```js
const h = document.querySelector('.dop-drawer-head').getBoundingClientRect().height;
const b = document.querySelector('.dop-bundle-cart-headline')?.getBoundingClientRect().height ?? 0;
const f = document.querySelector('.dop-drawer-foot').getBoundingClientRect().height;
const l = document.getElementById('dop-cart-lines').getBoundingClientRect().height;
({ head: h, bar: b, foot: f, chrome: h + b + f, lines: l });
```

Repeat at 375×500 and 375×470, recording `lines` height and whether
`document.getElementById('dop-cart-checkout-btn').getBoundingClientRect().bottom
<= innerHeight`.

### Step 3 — push to preview

```bash
npx shopify theme push --theme 160174997756
```

Never `-p`, never `--live`, never `theme publish` — all three reach production
without `--allow-live`.

`.shopifyignore` must still be blocking `config/settings_data.json` and
`templates/*.json`; a push that carries them wipes merchant settings, and
`--nodelete` does not prevent it.

### Step 4 — re-measure, and check the spill-over surfaces

Repeat Step 2's measurements. Then:

- **T2 check** — the cart **page** (`/cart`) still renders roomy `.dop-li`
  rhythm, and the drawer's compact rows are still 12px, not 14px
- **T1 check** — `/cart` still shows a correctly-sized trust line, not an
  unsized padlock
- SP-only cart: footer height is sane, Total row has no orphaned top border
- Cart with a cart-level discount applied: the discount row renders and the
  Total row **does** get its divider back

### Step 5 — verify the bar toggle (ask 2)

In the theme editor for `#160174997756`, uncheck **Show Stack & Save tier
progress bar**.

1. Reload the drawer. `document.querySelector('.dop-bundle-cart-bar')` → `null`
2. The headline message and CTA still render, correctly spaced with no bar
   beneath them — the `6px 8px` row gap from Phase 02 Step 18 should not leave a
   dangling gap
3. **The mutation check.** Tap `+` on a line, wait for the drawer to settle, and
   re-query. Still `null`.

   This is the whole point of the setting being theme-global. Every
   `/cart/change.js?sections=` response re-renders the drawer with **schema
   defaults**, and `dop_cart_show_stack_save_bar` has `"default": true`. If the
   theme-global read does not survive, the bar reappears the moment the shopper
   changes a quantity, and the control is broken in the one situation it matters.
4. Re-check the box and confirm the bar returns.

Record all four results. If step 3 fails, that is a real defect and it needs its
own report — it is not in this plan's scope to fix, but it changes the answer to
ask 2 from "already built" to "built and broken".

### Step 6 — close out

- Fill the measurement table in § Results
- Confirm live `#158620516604` is untouched: `npx shopify theme list` and check
  its updated timestamp
- Push the branch to origin. No live push.

## Success Criteria

- [x] Phase stopped cleanly at the browser gate; store half completed after a token arrived
- [ ] Baseline captured **before** the preview push
- [x] Preview `#160174997756` updated; live `#158620516604` verified still pre-trim by pulling both
- [ ] `#dop-cart-lines` shows ≥1 full line at 375×500
- [ ] Checkout button `rect.bottom <= innerHeight` at 375×470
- [ ] **T1** `/cart` trust line correctly sized
- [ ] **T2** cart page roomy; drawer compact rows still 12px
- [ ] SP-only and discount-applied carts both render a sane footer
- [ ] Bar toggle: hides on load, **stays hidden after a `±` mutation**, returns when re-checked
- [x] Nothing pushed live; `.shopifyignore` verified to have protected merchant settings

## Results — PARTIAL 2026-08-06. Pushed and verified; measurement still open

A Theme Access token was supplied mid-session, which unblocked the store half.
The browser half is still blocked, so Steps 3 and 4's static verification ran
but Steps 2/4's measurements and Step 5's mutation check did not.

**⚠ The token was pasted into the conversation and must be rotated.** Same leak
as 2026-08-05. It was never written to a file and never committed — passed as an
inline `SHOPIFY_CLI_THEME_TOKEN` per command — but it is in the transcript.

### Pushed

`shopify theme push --theme 160174997756`. No `-p`, no `--live`, no `publish`.

Checked before pushing, because the target preview is another plan's QA build
(`stack-save-price-preview-260725`, holding `260725-1940`'s work):

| Check | Result |
|---|---|
| Is the cart-recs tip `e57f20f` an ancestor of this branch? | **Yes** — this branch is a superset; nothing of that work is lost |
| Does this branch carry the rolled-back reconcile commits? | **No** — `866eca4` absent, reconcile stays parked |

### Verified by pulling both themes back, not by assuming

The strongest check available without a browser: pull
`sections/dopamiles-cart-drawer.liquid` from **both** themes and compare.

| Theme | `dop-cart-taxnote` | `Subtotal ·` | `Calc'd at checkout` | `<div class="dop-cart-secure">` |
|---|---|---|---|---|
| Preview `#160174997756` | **1** | 0 | 0 | 0 |
| Live `#158620516604` | 0 | **1** | **1** | **1** |

The trim is on preview. Live is untouched and still pre-trim.

CSS confirmed on preview too: `.dop-drawer-foot` padding `12px 18px 14px`,
`.dop-cart-taxnote` rules present, and `.dop-cart-secure` correctly **absent**
from the drawer stylesheet (it moved to `dopamiles-cart-page.css`).

### Correction — the push did not destroy the baseline

Both this plan and the superseded one treated the preview's pre-trim state as an
irreplaceable baseline, and the 2026-08-05 session declined to push partly on
that basis: *"with no baseline obtainable, pushing would have made the gate
permanently unmeasurable against a before-state."*

That was wrong. **Live `#158620516604` is the pre-trim baseline**, it is
untouched, and the table above proves it still carries all three removed
elements. Before/after is measured by comparing live against preview — no
sequencing constraint, and nothing was lost by pushing first.

### `.shopifyignore` held

| | bytes |
|---|---|
| `config/settings_data.json` on preview after push | 14,020 |
| local copy that would have clobbered it | 6,251 |

Different, so merchant configuration survived. The local copy is the stale
2026-05-06 file; had it uploaded, every merchant setting on that preview would
have reverted.

### Ask 2 — a finding from the merchant config

`dop_cart_show_stack_save_bar` is **absent** from the merchant's
`settings_data.json`. The merchant has never toggled it, so the schema default
(`true`) applies and the bar renders today.

Consequence for the open question: unchecking the box in the theme editor is
what first *writes* the key, as `false`. Theme-global settings are read from
`settings_data.json` on every render, including Section Rendering API renders —
which is the whole reason this setting is theme-global rather than section-level.
That remains **inspection, not evidence**; the `±`-tap check still needs a browser.

### Still blocked — browser only

**Confirmed by read-only probe, neither touching the storefront:**

| Probe | Result |
|---|---|
| `chrome-profile doctor` | `bridge=none`, `ok=false`, `cdp_endpoint.ok=false` |
| `mcp__chrome-devtools__list_pages` | `Could not find DevToolsActivePort` — Chrome is not running with remote debugging |


Neither probe touches the storefront, so neither risks the Cloudflare challenge
that ended the 2026-08-05 attempt. The store-access failure is the *same* one
that session hit on its first try, before a Theme Access token was supplied.

**To unblock, both are needed:**

1. **Browser** — start Chrome with `--remote-debugging-port=9222`, or configure
   `chrome-devtools-mcp` with `--autoConnect --channel=stable`, then **restart
   the agent session** (MCP servers attach at session start, so a mid-session
   fix cannot take effect). Approve Chrome's remote-control prompt if shown.
   The profile matching this store is `lythanhbinh1102` (Default). A real
   profile is what clears Cloudflare; a fresh automation profile is what
   triggered the block last time.
2. **Store** — a Theme Access token supplied **through the environment**, or CLI
   auth as an account with access to `rfeixb-dd`. The token used on 2026-08-05
   was pasted into chat, is in that transcript, and must be treated as burned.

### What is proven without a browser, and what is not

Being precise about this matters more than the phase being incomplete, because
the gap is easy to overstate in either direction.

| Claim | Status |
|---|---|
| The snippet omits `.dop-bundle-cart-bar` when `show_bar` is false | **Proven** — `tests/cart-headline.test.js:192` |
| The setting is wired schema → section → snippet | **Proven** by inspection — `settings_schema.json:1589` → `cart-drawer.liquid:153` → `bundle-cart-headline.liquid:89` |
| The three removals are absent and the tax note renders in all 8 branches | **Proven** — Phase 03, 234 tests |
| `.dop-li--compact` keeps 12px; the cart page keeps its rhythm | **Proven at the selector level**, not visually |
| **≥1 full line visible at 375×500** | **UNPROVEN** — needs a browser |
| **Checkout button in viewport at 375×470** | **UNPROVEN** — needs a browser |
| **The bar stays hidden after a `±` mutation** | **UNPROVEN** — this is the one that matters. A theme-global setting *should* survive a `?sections=` re-render where a section-level one would revert to its schema default of `true`. "Should" is inspection, not evidence |

The last row is the actual open risk of this plan. If theme-global reads do not
survive the Section Rendering API, the bar reappears the instant a shopper
changes a quantity, and ask 2's answer changes from "already built" to "built
and broken". Nothing committed here depends on the outcome, but the question is
genuinely open.

## Results table — unfilled, blocked

| Measurement | Baseline (pre-trim) | After trim | Delta |
|---|---|---|---|
| Chrome @375×800 | | | |
| `#dop-cart-lines` @375×800 | | | |
| `#dop-cart-lines` @375×500 | | | |
| `#dop-cart-lines` @375×470 | | | |
| Checkout button in viewport @470 | | | |
| SP-only cart chrome | | | |
| Discount-applied cart chrome | | | |

**Bar toggle (ask 2)**

| Check | Result |
|---|---|
| Bar absent on load when unchecked | |
| Headline spacing correct without the bar | |
| **Still absent after a `±` mutation** | |
| Returns when re-checked | |

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Cloudflare blocks cart mutations again | Step 1 gates on the bridge before any other work and forbids retry-spamming a production store. This is exactly what stalled the previous attempt |
| The push destroys the baseline before it is read | Step 2 measures first; `.dop-cart-taxnote` presence disambiguates which build is on screen |
| A CLI flag reaches production | Step 3 names the three flags that bypass `--allow-live` |
| A push wipes merchant settings | Step 3 re-checks `.shopifyignore` coverage of `settings_data.json` and `templates/*.json`; `--nodelete` is not protection |
| The bar reappears after a mutation | Step 5.3 tests for it explicitly. If it fails, ask 2's answer changes and the defect gets its own report |
| The gate fails on height | Remedy is in Phase 02, not here: shrink `.dop-cart-taxnote` to 10.5px/1.3 or zero `.dop-tot-row.disc` padding, then re-push |
| An offline mockup is attempted instead | Do not. It was tried and deleted last time: self-hosted General Sans metrics, merchant-set tokens, three stylesheets loaded from `theme.liquid` and hand-written DOM all make it wrong. The preview theme is the only source of truth |
