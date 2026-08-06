# pod-tee cart drawer — bundle CTA placement

**Date:** 2026-08-06
**Status:** Contract accepted, ready to plan
**Repo:** `D:\github local\pod-tee-theme` · store dopamiles.co / `rfeixb-dd.myshopify.com`
**Live theme:** `#158620516604` (footer trim shipped earlier today)

---

## The trigger

The drawer states the same bundle offer twice, ~200px apart:

| Source | String | Position |
|---|---|---|
| `snippets/dopamiles-bundle-cart-headline.liquid` | *"Add {N} more · save {$X}"* + CTA link | above `.dop-cart-lines` |
| `snippets/dopamiles-cart-recs.liquid:322` | *"Pick {N} more to save {$X}"* | inside the scroll area |

Both read the same resolver (`dopamiles-bundle-tier-resolve`), so the numbers
always agree — only the wording differs. The user called this "overlap"; it is
duplicated messaging, not a z-index collision.

**Moving the CTA below the line items makes the duplication worse, not better** —
it lands the two strings adjacent. Any placement change has to decide which one
speaks.

## Contract

**Outcome.** The bundle offer is stated **once**, in a compact band below the
line items, in the slot the recs heading occupies today. A merchant setting
switches between that and the current top band.

**Constraints.**
- No change to tier arithmetic or Shipping Protection counting. dopamiles
  *includes* SP in the bundle count; BNC *excludes* it — never cross-apply.
- The switch must be **theme-global**, not section-level: every
  `/cart/change.js?sections=` re-renders the drawer with schema defaults, so a
  section-level value reverts after the first cart mutation.
- Must not regress the footer trim shipped to live earlier today, whose
  short-viewport gate is *still unmeasured*.
- The offer must not depend on product availability.

**Non-goals.**
- Not deleting the current top-band layout — it stays behind the switch.
- Not touching recs product selection, the mutation path, or the reconcile work
  (still parked from `plans/260805-1848-...`).
- No new edge-state copy. Existing states are reused verbatim.

**Acceptance criteria.**
- One offer string in the drawer at a time, in every tier state.
- The setting switches layouts **and survives a `±` cart mutation**.
- The band still renders when the recs strip renders nothing.
- Both layouts hold at 375×500 with ≥1 line item visible.
- Tests cover both layouts and the recs-absent case.

## Decisions

| # | Decision | Value |
|---|---|---|
| 1 | Structure | Band occupies the recs-heading slot; recs heading demoted to "You might also like"; top headline hidden in this mode |
| 2 | Default | **`below_items`** — the new layout ships live on deploy |
| 3 | Edge states | Mirror today's behaviour exactly — no eligible items renders **nothing**; top tier reached shows "Max savings · Saved $X" with no CTA |
| 4 | Coupling | **Decoupled.** The band renders from the drawer section, not from inside the recs snippet |
| 5 | Merge | The band **fills the recs strip's heading slot** — one row, not two. Visual merge only; it is still emitted by the section, so it survives when the strip does not |
| 6 | Copy | Band states both halves: `✓ Saved $X · Add N more tees — save $Y`. Banked amount green (`--dop-good`), money on the table accent. At/past the top threshold: `✓ Saved $X · $Y off every extra tee` |

Decision 4 reverses the first answer to the structure question, on evidence
surfaced after it. Recorded as a correction, not as the original choice.

## Why decision 4 exists

The first-chosen approach was to restyle the existing recs heading into the band
— zero new DOM, DRY by construction. Inspection killed it.

`snippets/dopamiles-cart-recs.liquid` gates **the entire strip, heading
included**, on `{%- if picked_n > 0 -%}` (line 220), inside
`{%- if settings.dop_cart_recs_enabled -%}` (line 75). Four confirmed ways it
renders nothing, each covered by a passing test in `tests/cart-recs.test.js`:

| Condition | Effect if the offer lived in the heading |
|---|---|
| `dop_cart_recs_enabled` unchecked | Offer gone **store-wide**, from one checkbox |
| Recs collection unset | Gone store-wide, silently |
| Recs collection empty | Gone store-wide, silently |
| Pool fully deduped — everything recommendable already in cart | Gone **for the shopper closest to the next tier** |

The last row is the disqualifying one: the offer would disappear exactly when it
is most actionable, on the largest cart. Combined with decision 2 shipping this
as the default, the exposure would reach production immediately.

The offer and the product strip are different concerns — one depends on the tier
resolver and the cart, the other on collection configuration. Coupling them lets
a data condition on the second silently suppress the first.

## Evidence

| Claim | Evidence | Status |
|---|---|---|
| Image 2 is **not** shipped code anywhere | Searched all 5 `tytkwe-qe-theme` branches: no `BUNDLE` eyebrow, no "Add 1 more tee". BNC's drawer has the *same* structure as dopamiles — headline at `:178`, list at `:183` | ✅ It is a target design, not a port |
| Both strings derive from one resolver | `dopamiles-bundle-tier-resolve` feeds both snippets | ✅ |
| Recs strip can render nothing, heading included | `cart-recs.liquid:75` and `:220`; 4 passing tests name the cases | ✅ |
| Precedent exists for a position setting | PDP `stack_save` block anchors `below_accordions` / `above_atc` | ✅ |
| Theme-global survives the Section Rendering API | `dop_cart_show_stack_save_bar` is theme-global *for this reason* — but the `±`-tap check has **never been run** | ⚠️ inspection, not evidence |

## Proposed shape

New theme-global setting, alongside the existing cart-drawer widgets:

```
dop_cart_bundle_cta_position   select
  "below_items"  (default)   band below the line items, top headline hidden
  "top"                      today's layout, band not rendered
```

- `below_items` → drawer section renders the band after the line-item loop and
  before the recs strip; passes a flag so `dopamiles-cart-recs` uses its muted
  default heading; `dopamiles-bundle-cart-headline` not rendered.
- `top` → exactly today: headline above the list, recs keeps its offer heading.
- `dop_cart_show_stack_save_bar` continues to gate the progress bar and is
  orthogonal to this setting.

The band reuses the resolver output and the existing tier states, so no new
locale keys and no new arithmetic.

## Open risks

1. **The `±`-tap check is still unrun.** Whether a theme-global setting survives
   a `/cart/change.js?sections=` re-render is reasoned, not measured. It affects
   this setting *and* `dop_cart_show_stack_save_bar`. If it fails, both controls
   revert to their schema defaults mid-session — and this one's default is the
   new layout, so a shopper mid-mutation could see the layout change under them.
   **This should be settled before the plan, not during it.**
2. **The drawer's short-viewport gate remains unmeasured** from the footer trim
   shipped earlier today. This change alters the same fixed-chrome budget —
   removing the top band frees height, so the direction is favourable, but the
   baseline it moves from was never measured.
3. **No browser access all session** (`chrome-profile doctor` → `bridge=none`;
   DevTools MCP → no `DevToolsActivePort`), which is what blocked both checks
   above.

## Handoff

Next: the plan skill, then `/ak:cook`. Phases should carry the four contract
fields verbatim, and risk 1 belongs in phase 01 as a gate rather than in a
verification phase at the end.

## Found defect — fixed separately, 2026-08-06

Surfaced while modelling the band's states, and independent of the placement
work. Committed as `a84c6a3`, **not yet pushed anywhere**.

**The top tier is a rate, not a ceiling.** `dopamiles-bundle-tier-resolve.liquid`
computes `savings_now = current_cents × eligible_qty`, and `current_cents` is the
**per-unit** amount of the best tier reached. So at $5/unit: 5 tees save $25,
6 save $30, 7 save $35.

The headline's top-threshold arm read **"Max savings · Saved $25"** and rendered
**no CTA** — telling the largest cart in the store there was nothing left to
gain, and removing the means to act. Now: `✓ Saved $25 · $5 off every extra tee`,
CTA retained.

**The figure was never wrong.** `tests/cart-headline.test.js` has carried a test
named *"6 eligible tees saves $30, not the hedged $25+"* since the multiplier was
corrected. Someone fixed the arithmetic and left the words. Worth remembering:
a passing test asserting the right number said nothing about the sentence
wrapped around it.

**Second defect, found in the same read.** Only the compound selector
`.dop-bundle-cart-msg.success` existed — it matches when the whole message *is*
the confirmation, which is the top-threshold arm alone. Every earned-tier state
renders the confirmation as a `<span class="success">` inside a longer sentence,
where that rule never matched. So `Saved $12` has never been green and its check
icon never aligned; the generic `.dop-bundle-cart-msg b` rule painted the banked
figure accent-orange, making money already earned read like money still on offer.
Both forms are now styled, and the figure inside a confirmation inherits.

This had to be fixed as part of the same change rather than deferred: the new
markup reshapes the top-threshold arm to the sentence form, which would
otherwise have *lost* the green that arm already had.

| Check | Result |
|---|---|
| `npm test` | 245 pass, 0 fail (was 242 — 3 regression locks added) |
| `theme check` | 237 files, 0 offenses |
| Pushed | **No** — local commit only |
