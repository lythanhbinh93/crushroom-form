---
phase: 3
title: "Verify on preview and ship"
status: pending
priority: P1
effort: "2.5h"
dependencies: [2]
---

# Phase 3: Verify on preview and ship

## Overview

Push both layouts to preview, verify what only a browser can, then push to live
with `--only`. Carries `a84c6a3` — the tier copy fix held on preview per
decision 8 — to live in the same push.

## Requirements

**Functional**
- Both layouts verified rendering on preview at real viewports
- The band verified surviving a `±` cart mutation
- The band verified rendering with recommendations turned off
- Live updated with the placement work and the copy fix

**Non-functional**
- Every push uses `--only`; the uncommitted `new-arrival` WIP never ships
- Live `settings_data.json` and section/template JSON never overwritten
- No `-p`, no `--live`, no `theme publish`

## Architecture

Preview `#160174997756` and live `#158620516604` currently differ only by
`a84c6a3`. After this phase they should differ by nothing.

The setting is absent from live's `settings_data.json`, so the `| default:`
path decides the layout on first render. Verifying the setting-absent path on
preview is therefore verifying what live will actually do — the merchant does
not have to touch anything for `below_items` to take effect.

## Related Code Files

- No code changes. This phase pushes and observes.
- Pushed: the **eight** runtime files Phase 01 touched. `a84c6a3`'s two files
  (`dopamiles-bundle-cart-headline.liquid`, `dopamiles-bundle.css`) are already
  inside that set — it rides along rather than needing its own push.
- Not pushed: `tests/` is not a theme directory and never ships.

## Implementation Steps

### Step 1 — push both to preview

```bash
npx shopify theme push --theme 160174997756 \
  --only config/settings_schema.json \
  --only sections/dopamiles-cart-drawer.liquid \
  --only snippets/dopamiles-bundle-cart-band.liquid \
  --only snippets/dopamiles-bundle-cart-bar.liquid \
  --only snippets/dopamiles-bundle-cart-headline.liquid \
  --only snippets/dopamiles-cart-recs.liquid \
  --only assets/dopamiles-bundle.css \
  --only assets/dopamiles-cart.css
```

**Eight files, not the six this step originally listed.** Phase 01 added two
after this phase was written, and both are load-bearing:

- `snippets/dopamiles-bundle-cart-bar.liquid` — the extracted tier progress bar.
  Omit it and **both** surfaces render a `{% render %}` of a snippet that does
  not exist on the theme, so the bar vanishes from a layout where it currently
  works. This is the worst file to leave behind, because the failure is silent.
- `assets/dopamiles-cart.css` — carries `.dop-cart-recs-top--nohead`. Omit it
  and the `1 / N` counter sits at the **left** edge under `below_items`, the
  default layout.

Verify the count before running: `--only` is a list, and a short list is how a
half-shipped drawer happens.

`config/settings_schema.json` is **not** `settings_data.json` — the schema is
theme code and must be pushed, the data is merchant state and is
`.shopifyignore`d. Confirm that distinction before running: pushing the wrong one
wipes merchant configuration.

Verify by pulling the files back and diffing, not by trusting the push output.

### Step 2 — verify `below_items`, the default

Do **not** set the setting. The point is to confirm the absent-key path, which is
what live will hit.

Reference cart: 2 bundle-eligible tees + Shipping Protection.

- The band renders below the last line item
- It heads the recommendation cards — **one row**, no "You might also like"
- Copy matches decision 6 for 1, 2, 3, 5 and 6 tees
- `Saved $X` renders green; the next-tier figure renders accent
- The old top band is **absent**
- The offer appears **once** — search the rendered drawer for the next-tier
  money figure and count

### Step 3 — the two properties that cannot be unit-tested

**The mutation.** Tap `+`. The band must survive with updated figures, and the
layout must not flip to `top`.

This is a confirmation, not a discovery. The mutation-survival matrix in
`plans/260725-1940-.../phase-04-qa-and-ship.md` already proved theme-global
settings survive a `?sections=` re-render — *"two consecutive quantity changes,
manual picks still present"*, run 2026-07-30 via agent-browser, passed.
`dop_cart_recs_manual_1..3` are theme-global, merchant-saved, and live in the
same settings group as `dop_cart_bundle_cta_position`. The one gap that
assurance does not close is **type**: those are product pickers, this is a
`select`. Same resolution mechanism, so the risk is small — but set the value to
`top`, tap `+`, and confirm it is still `top`. Two minutes inside work the
browser is already doing.

**Recommendations off.** Uncheck `dop_cart_recs_enabled` in the theme editor,
save, reload. The band must still render its offer. This is the property the
whole decoupled design exists for, and it has only ever been asserted in Node.
Re-check the box afterwards.

### Step 4 — verify `top` is genuinely unchanged

Set the setting to `top`, save, reload. The drawer must match today's live
layout: headline above the list, recs strip with its own offer heading, no band.

Compare against live directly — live is still on the old layout at this point,
which makes it the reference. That reference disappears the moment Step 6 runs,
so do this first.

### Step 4b — the checks inherited from the footer trim

Folded in from this plan's original Phase 01, which was dropped once the
mutation question turned out to be already answered. These are outstanding from
`plans/260806-0932-...`, which shipped to live without them.

**`a84c6a3` rendering.** It is on preview and, until Step 6, not on live:

- With 5+ eligible tees the headline reads `✓ Saved $25 · $5 off every extra tee`
  and a CTA is present
- Nowhere does the rendered drawer say **Max savings**
- `Saved $25` renders **green** (`--dop-good #2d7a4f`), not accent orange

The green is the one worth looking at. It has never rendered correctly on any
theme — the `.success` rule only existed in compound form and so never matched
the earned-tier states — so there is no remembered "before" to compare against,
and no Node test can prove a colour.

**`/cart` trust line** on live: correctly sized, not an unsized ~150px padlock.
That was port trap T1 and it shipped live today unverified.

### Step 5 — measurements

At 375×800, 375×500, 375×470, both layouts:

```js
const h = document.querySelector('.dop-drawer-head').getBoundingClientRect().height;
const f = document.querySelector('.dop-drawer-foot').getBoundingClientRect().height;
const l = document.getElementById('dop-cart-lines').getBoundingClientRect().height;
const btn = document.getElementById('dop-cart-checkout-btn').getBoundingClientRect();
({ chrome: h + f, lines: l, btnInView: btn.bottom <= innerHeight });
```

Gate: ≥1 full line visible at 375×500; checkout button in viewport at 375×470.

`below_items` should measure **better** than `top` — it removes a fixed-chrome
element and puts the band in the scroll area. If it does not, something is wrong
with the band's placement, not with the gate.

### Step 6 — push to live

Only after Steps 2-5 pass. Same file list as Step 1, plus `--allow-live`:

```bash
npx shopify theme push --theme 158620516604 --allow-live --only …
```

Never `-p`, never `--live`, never `theme publish` — all three reach production
without `--allow-live`.

This push carries `a84c6a3` to live, which closes open question 2 and fixes the
"Max savings" defect on production.

### Step 7 — verify live, then close out

Pull the pushed files back from live and confirm:

- Band markup present; `Max savings` absent
- `new-arrival` absent from `sections/dopamiles-collection-grid.liquid` — the
  WIP must not have ridden along
- `config/settings_data.json` on live still holds its 124 merchant keys

Then fill the Results table, and record whether the branch was pushed to origin.
Live serving code that exists on one machine is a standing exposure, not a
detail.

## Success Criteria

- [ ] Both layouts pushed to preview and verified by pulling back
- [ ] `below_items` verified **without setting the key** — the absent-key path
- [ ] Copy correct at 1, 2, 3, 5, 6 tees; green/accent split correct
- [ ] Offer appears exactly once in the rendered drawer
- [ ] Band survives a `±` tap, layout does not flip
- [ ] **Band still renders with `dop_cart_recs_enabled` unchecked**
- [ ] `top` verified identical to today's live layout, compared before live changes
- [ ] ≥1 line visible at 375×500; button in viewport at 375×470, both layouts
- [ ] Live pushed with `--only` + `--allow-live`; `-p`/`--live`/`publish` never used
- [ ] `new-arrival` WIP verified absent from live
- [ ] Live `settings_data.json` still holds its merchant keys

## Results

| Measurement | `top` | `below_items` |
|---|---|---|
| Chrome @375×800 | | |
| `#dop-cart-lines` @375×500 | | |
| Button in viewport @375×470 | | |

| Check | Result |
|---|---|
| Offer count, `below_items` | |
| Offer count, `top` | |
| Band survives `±` tap | |
| Band renders with recs off | |
| `top` matches today's live | |
| WIP absent from live | |
| Branch pushed to origin | |

## Risk Assessment

| Risk | Mitigation |
|---|---|
| No browser, again | This is the first phase that needs one, and it has failed to attach in three sessions. Phases 01-02 are complete and committed by this point, so a block here costs verification, not work. Do not substitute an offline mockup — that was tried on 2026-08-05 and was wrong twice |
| A full push ships the uncommitted WIP | Every push in this phase is `--only` with an explicit file list, and Step 7 verifies absence on live afterwards |
| `settings_schema.json` confused with `settings_data.json` | Step 1 calls out the distinction explicitly. One is code, the other is merchant state |
| The `top` reference is destroyed before it is used | Step 4 runs before Step 6 for exactly this reason — live is the reference for "unchanged" |
| The default changes the layout for every shopper at once | Deliberate (decision 2). Steps 2-5 are the mitigation; the switch is the rollback |
| Rollback needed after the live push | Setting `dop_cart_bundle_cta_position` to `top` in the theme editor reverts the layout with no code change — which is the main reason the switch exists |
