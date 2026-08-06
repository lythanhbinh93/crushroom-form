---
title: "pod-tee Cart Drawer Footer Trim and Bar Toggle Verify"
description: >-
  Re-land the BNC cart-drawer footer trim on dopamiles, rebuilt fresh from the
  BNC source rather than cherry-picked, and verify the already-shipped
  Stack & Save bar toggle end to end. Branch + preview only; live untouched.
status: pending
priority: P1
effort: "6h"
repo: D:\github local\pod-tee-theme
plans_repo: D:\github local\crushroom-form
base: sync/live-collection-header-260731 @ d54412d
branch: feat/cart-drawer-chrome-260806
store: dopamiles.co / rfeixb-dd.myshopify.com
themes: "preview #160174997756 · live #158620516604 (untouched)"
source: tytkwe-qe-theme @ ae6fb4d + e6ad2fd (BNC, live 2026-08-05)
blockedBy: []
blocks: [260725-1940-pod-tee-cart-recommendations-and-tier-headline-fix]
related:
  - supersedes: plans/260805-1848-pod-tee-cart-drawer-reconcile-and-chrome-trim (rolled back; this plan re-does its Phase 01 only)
  - cross-check: pod-tee-theme branch `rescue-260805` holds the rolled-back implementation
tags: [shopify, theme, pod-tee, dopamiles, cart-drawer, spacing, line-endings]
created: 2026-08-06
---

# pod-tee Cart Drawer Footer Trim and Bar Toggle Verify

## Overview

Two asks, and scouting changed the shape of both.

**Ask 1 — trim the drawer bottom using BNC as the reference.** Real work. BNC's
footer drops a duplicate Subtotal row, a permanently-"Calc'd at checkout"
Shipping row and the payment-wallet line, replacing the disclosure with the
stock Shopify tax note. Fixed chrome went 515px → 343px. dopamiles still has all
three. Ported fresh from `tytkwe-qe-theme@ae6fb4d + e6ad2fd`.

**Ask 2 — build an option to hide `.dop-bundle-cart-bar`.** Already built.
`dop_cart_show_stack_save_bar` is a theme-global merchant checkbox
([`config/settings_schema.json:1589`](../../../pod-tee-theme/config/settings_schema.json#L1589),
default `true`) wired straight through to the bar:

```
settings_schema.json:1589   checkbox dop_cart_show_stack_save_bar
        ↓
cart-drawer.liquid:153      show_bar: settings.dop_cart_show_stack_save_bar
        ↓
bundle-cart-headline.liquid:89   {%- if show_bar -%}  →  .dop-bundle-cart-bar
```

`tests/cart-headline.test.js:192` already asserts the bar is absent when
`show_bar` is false. **User decision: no new code — verify the existing control
end to end instead.** That verification is Phase 04, and it is not a formality:
the setting is deliberately theme-global rather than section-level, and that
choice only pays off if it survives a Section Rendering API mutation. Nobody has
confirmed it does.

**And one blocker neither ask predicted.** The suite is red on the working
branch right now — 206/218, 12 failing — and none of it is drawer-related.
`git reset --hard` during yesterday's rollback re-materialized the working tree
through `core.autocrlf=true`, so `assets/*.js` is now CRLF on disk while the
index is LF. Twelve source-shape tests match on `\n  \}\n`, which `\r\n  }\r\n`
cannot satisfy. Phase 01 fixes this first, because a red baseline makes every
later "the tests pass" claim worthless.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Test suite green before any drawer edit, and stays green after | P1 |
| 2 | Drawer footer at full BNC parity: no Subtotal, no Shipping row, no wallet line, tax note present | P1 |
| 3 | Line-item list shows ≥1 full line at 375×500; checkout button in viewport at 375×470 | P1 |
| 4 | Neither known sibling-port trap recurs — `/cart` trust line intact, compact rows not taller | P1 |
| 5 | `dop_cart_show_stack_save_bar` verified to hide the bar *and* survive a cart mutation | P2 |

## Non-goals

- **No live push.** Preview `#160174997756` only. Live `#158620516604` untouched.
- **No cherry-pick.** User chose a fresh rebuild from BNC source over re-landing
  `7e4fe7c e823eea 9557bfb 4b2c0e2`. Recorded as a decision, not an oversight —
  see § Decisions.
- **No reconcile work.** The `innerHTML` teardown stays. Phases 02-04 of the
  superseded plan remain parked.
- **No new setting for the bar.** Ask 2 resolved to verification.
- **No change to tier arithmetic or bundle counting.** BNC excludes Shipping
  Protection from Stack & Save, dopamiles includes it. Chrome and spacing port
  only, never counting rules.

## Decisions

| Decision | Value | Source |
|---|---|---|
| Ask 2 scope | Existing checkbox is the answer; verify, don't build | User |
| Re-land method | Rebuild fresh from BNC source | User |
| Ship gate | Branch + preview push; no live | User |
| Footer parity | Full — drop Subtotal, Shipping row and wallet line; add tax note | User |
| Base branch | `sync/live-collection-header-260731` @ `d54412d` — a superset of `e57f20f` and the closest thing to what live serves | Planner |

**On the fresh rebuild.** It discards a passing 16-test suite and a completed
code review that had already found and fixed 1 High + 2 Medium. The concern was
raised and the user chose rebuild anyway. Mitigation, not reversal: the two
defects that review caught are promoted to explicit guard steps in Phase 02
(T1, T2), and Phase 03 Step 4 diffs the fresh result against `rescue-260805` as
a cross-check. The rebuild stands; it just does not get to rediscover the same
two bugs.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Green the baseline](./phase-01-start.md) | **Done** — `f186f2b`, suite 198→210 pass | 0.5h |
| 2 | [Port the BNC footer trim](./phase-02-port-the-bnc-footer-trim.md) | **Done** — `3e40da0` + `8a5d67c` | 2h |
| 3 | [Cover the trim with tests](./phase-03-cover-the-trim-with-tests.md) | **Done** — `68ce666`, suite 210→234 | 1.5h |
| 4 | [Preview verification and bar toggle](./phase-04-preview-verification-and-bar-toggle.md) | **Blocked** — no browser bridge, no store access | 2h |

### Progress log

| Date | Event |
|---|---|
| 2026-08-06 | P01 done. All 12 test failures were CRLF, not code. Plan's Step 4 had the two routes backwards — `--renormalize` fixes the index, and the index was already LF, so it staged zero changes and fixed nothing; the forced re-checkout was required. Baseline is 210 not 218 because 8 tests are in `stash@{0}` |
| 2026-08-06 | P02 done, two commits. `--dop-ink-2` confirmed defined (open question 1 closed). All 8 locale keys present in **31** locale files — the "37" figure both plans carried was wrong. A comment naming `ship_qualifies` briefly defeated T3's own absence grep; reworded |
| 2026-08-06 | P03 done. Suite 210 → 234. The `rescue-260805` cross-check earned its place: it found the trust-line CSS sitting in an **async** stylesheet (moved to the cart page's blocking one) and an **unescaped** merchant-controlled SP subtitle whose fix had never reached this branch. Both adopted. Cross-check ledger now has zero unexplained hunks |
| 2026-08-06 | P04 **blocked at its own Step 1 gate.** `chrome-profile doctor` → `bridge=none`; DevTools MCP → no `DevToolsActivePort`; `shopify theme list` → no access to `rfeixb-dd`. Nothing pushed, no storefront requests made. The measurement gate and the bar-toggle mutation check remain **unproven** |

Strictly sequential. Phase 01 is a gate: until the suite is green, Phase 03
cannot distinguish a bug it introduced from the twelve already failing.

## Verified evidence

Everything below was checked against the working tree on 2026-08-06, not
inherited from the superseded plan.

| Claim | Evidence | Status |
|---|---|---|
| `dop_cart_show_stack_save_bar` exists and gates the bar | `settings_schema.json:1589` → `cart-drawer.liquid:153` → `bundle-cart-headline.liquid:89` | ✅ |
| A test already covers `show_bar: false` | `tests/cart-headline.test.js:192` | ✅ |
| Suite is red before any edit | `npm test` → tests 218, pass 206, fail 12 | ✅ |
| Cause is CRLF, not code | `file assets/dopamiles-cart.js` → "with CRLF line terminators"; `core.autocrlf=true`; failing regexes end `\n  \}\n` | ✅ |
| `bindDrawerSurface` is present in source | `assets/dopamiles-cart.js:819` — the test's regex, not the function, is what fails | ✅ |
| **T1** `.dop-cart-secure` has a second caller in pod-tee | `sections/dopamiles-cart-main.liquid:167` — BNC had none | ✅ |
| **T2** `.dop-li--compact { padding: 12px 0 }` exists and is the live default | `dopamiles-cart.css:180-184`; `dop_cart_line_density` default `"compact"` | ✅ |
| **T3** pod-tee has no free-shipping mechanism | zero matches for `ship_qualifies` / `dop_cart_show_shipping_bar` repo-wide | ✅ |
| `dop_display_count` survives Subtotal removal | still used at `cart-drawer.liquid:92-99` for the drawer heading | ✅ |
| Every pod-tee CSS baseline matches BNC's pre-state | head `18px 22px`, lines `0 22px`, foot `18px 22px 22px`/gap `14px`, headline `10px 12px`/`0 0 12px`, bar `14px 0 22px`, SP `12px 14px` | ✅ |
| Tax-note locale keys present | `locales/en.default.json` — 4 hits on the two sampled key families | ⚠️ all 8 keys × 37 locale files re-checked in Phase 02 Step 4 |

## The three port traps

Carried from `.claude/agent-memory/code-reviewer/feedback_sibling_theme_port_css_deletion.md`.
A `bnc-` → `dop-` rename is not enough: the themes share a lineage but not a
state, and both theme-check and the Node suite stayed green through both of the
defects below.

| # | Trap | What BNC did | What pod-tee needs |
|---|------|--------------|--------------------|
| T1 | `.dop-cart-secure` | Deleted the CSS — no caller left | Delete the **drawer markup only**; keep the CSS. `dopamiles-cart-main.liquid:167` still renders it and `drawer-ui.css` loads site-wide, so deleting the rules leaves an unsized ~150px padlock on `/cart` |
| T2 | `.bnc-cart-lines .bnc-li { padding: 14px 0 }` | Unambiguous — no compact modifier | The descendant selector (0,2,0) out-specifies `.dop-li--compact` (0,1,0), the live default, taking rows 12px → **14px**. Taller, not shorter — the opposite of the goal |
| T3 | Shipping row gated on `ship_qualifies` | Kept a FREE branch | Neither `ship_qualifies` nor `dop_cart_show_shipping_bar` exists here. The conditional is dead code; delete the row outright |

## Success criteria

- [ ] `npm test` exits 0 with 218+ passing, **before** the first drawer edit
- [ ] Zero `Subtotal ·`, zero `Calc'd at checkout`, zero `<div class="dop-cart-secure">` in `sections/dopamiles-cart-drawer.liquid`
- [ ] `.dop-cart-taxnote` renders above `#dop-cart-checkout-btn`; policy link resolves
- [ ] All 8 tax-note branches render non-empty and resolve their locale key
- [ ] **T1** `/cart` still renders a correctly-sized trust line
- [ ] **T2** compact drawer rows stay at 12px; roomy rows get 14px; cart page unchanged
- [ ] Discount rows and `#dop-cart-disc` present and unmodified
- [ ] Zero `bnc-` / `--bnc-` / `dataset.bnc` / `window.bnc` introduced; zero `*/` inside ported comment bodies
- [ ] `#dop-cart-lines` shows ≥1 full line at 375×500 and the checkout button is fully in viewport at 375×470
- [ ] Unchecking **Show Stack & Save tier progress bar** removes `.dop-bundle-cart-bar`, and it stays removed after a `±` tap
- [ ] `npm test` exits 0; `shopify theme check` clean
- [ ] Live theme `#158620516604` unchanged

## Risks

| Risk | Mitigation |
|---|---|
| Line-ending fix churns the whole repo into one giant diff | The index is already LF, so `git add --renormalize .` should produce **zero** diff. Phase 01 Step 4 verifies that before committing anything; if the diff is non-empty, stop and fall back to the local-only `core.autocrlf=false` route |
| Destructive git op eats the uncommitted WIP | Two modified sections plus two untracked files are in the tree. Phase 01 Step 1 commits or stashes them **first**, on its own. Selective `git add` does not protect against `reset --hard` — 231 lines were lost that way before |
| The trim does not recover enough height | The tax note adds back ~22px (one line) to ~37px (wrapped at 375px). Net lands ~105-125px. The gate is therefore relative (≥1 line visible at 375×500), not a pixel count. If it fails, the remedy stays inside Phase 02: drop `.dop-cart-taxnote` to 10.5px/1.3, or zero the `.dop-tot-row.disc` padding |
| Cloudflare blocks preview cart mutations again | This is what stalled the last attempt. Phase 04 Step 1 checks the `chrome-profile` bridge **before** any measurement work, and stops if it is unavailable rather than burning the session on retries against a production store |
| Removing the wallet line weakens a trust cue | BNC shipped it live 2026-08-05; precedent exists. Reversible in one commit. Accepted by the user under Full BNC parity |
| Preview push destroys the pre-change baseline | Phase 04 Step 2 measures the baseline **before** pushing. `.dop-cart-taxnote` is absent pre-change and present post-change — use it to confirm which state is on screen |

## Open questions

1. ~~**Does the tax note need the `--dop-ink-2` token?**~~ **Closed 2026-08-06.**
   Defined at `snippets/dopamiles-tokens.liquid:14`, merchant-settable via
   `settings.dop_ink_2`, fallback `#3A3A3A`. The link follows a palette change.
2. **Theme Access token.** Still needed, and Phase 04 stopped without one. The
   previous session's was pasted into chat and must be treated as burned. Supply
   the replacement via the environment, never through the conversation.
3. **Does a theme-global setting survive the Section Rendering API?** Open, and
   it is the real residual risk here. `dop_cart_show_stack_save_bar` is
   theme-global *specifically* so a `/cart/change.js?sections=` re-render — which
   resets section-level values to schema defaults — cannot flip it back on. That
   reasoning is inspection, not evidence. If it is wrong, the bar reappears on
   the first `±` tap and ask 2's answer changes from "already built" to "built
   and broken". Phase 04 Step 5.3.
4. **Should `fix/sp-subtitle-escape` be retired?** Commit `51de695` on that
   branch is the same escape fix this plan landed independently in `68ce666`.
   Two branches now carry it; one should be closed to stop it looking unfixed.

## Residual risk

Phases 01-03 are committed, tested and cross-checked, and **none of that proves
the change achieves its purpose.** The whole point is vertical room on a short
viewport, and the only instrument for that is a browser on a preview theme.
What is committed is a well-covered change whose central claim is still
unmeasured. It should not be pushed live on the strength of a green suite.
