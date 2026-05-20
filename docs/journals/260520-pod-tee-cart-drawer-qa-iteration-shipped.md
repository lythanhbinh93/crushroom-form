---
date: 2026-05-20
project: pod-tee-theme
branch: feat/pdp-perf-pareto
commits:
  - 38ed6a2 feat(cart): drawer offer revamp (original 4-phase plan ship)
  - 7342466 fix(cart): SP auto-add silently skipped + toggle-off errored
  - d3d7f9b feat(cart): bundle SP into ATC so drawer opens with total already including SP
  - 3fa6813 fix(cart): SP widget + filter survive variant becoming unavailable
  - 82731ff chore(deploy): add .shopifyignore so theme push preserves merchant settings
  - 8545d41 fix(cart): SP settings → theme-global so they survive Section Rendering API re-renders
  - dda052c fix(cart): reconcile SP checkbox state after re-render so uncheck doesn't auto re-check
  - 13d0273 fix(cart): stack & save tier bar lays out on its own row inside flex headline
  - 0f9b312 copy(cart): drop "+ FREE SHIPPING" from bundle headline state copy
  - 024f5dd fix(cart): gate totals "Shipping FREE" label on show_shipping_bar toggle
  - 9dbb25c refactor(bundle): eligibility check tag → `bundle-eligible` collection
  - 6f70cc3 copy(cart): bundle headline + tier bar use tier TOTALS not per-unit amounts
  - b772169 copy(cart): standardize bundle headline + tier markers on save / saved tone
  - f4b4f59 copy(pdp): stack & save tier copy + markers → save tone (matches cart drawer)
  - 2a1e18d copy(bundle): align PDP banner, stack-save header, collection pill on save/tier-totals tone
plan: plans/260520-1010-pod-tee-cart-drawer-offer-revamp/
rca-report: plans/reports/sp-widget-disappears-on-cart-mutation.md
related-journals:
  - 260520-pod-tee-cart-drawer-offer-revamp-shipped.md (original 4-phase ship summary)
tags: [shopify, theme, pod-tee, cart-drawer, shipping-protection, qa-iteration, bundle-discount, section-rendering-api, memory-bank, copy-revision, architecture-pivot]
---

# Pod-tee cart drawer Phase 4 + bundle discount pivot — 14-commit QA iteration

## Outcome

The 4-phase cart drawer offer revamp shipped + every Phase 5 QA finding fixed live, plus a meta-decision: bundle discount architecture pivoted from the custom Shopify Function (in `dopamiles-bundle-app`) to native Shopify automatic discounts gated by collection membership. The cart drawer + PDP + collection cards now read end-to-end with a single tone (tier totals × "save / saved"), and the merchant's app dependency is removed.

## What I shipped

### Block 1 — Shipping Protection bugs (commits 7342466 → dda052c, 6 commits)

The Phase 4 SP feature had three coupled bugs that all surfaced together in QA:

| Commit | Bug | Fix |
|---|---|---|
| 7342466 | SP auto-add silently skipped + toggle-off errored | snippet emits `data-sp-in-cart`; JS reads that instead of conflating with `checkbox.checked` |
| d3d7f9b | Brief flash of pre-SP total on first ATC | bundle SP into multi-item `/cart/add.js` (drawer opens with both lines present) |
| 3fa6813 | SP widget vanishes + duplicates as line item when variant inventory drops | switch from `first_available_variant` to `variants.first` for both filter and widget lookup |
| 82731ff | `shopify theme push` wipes merchant theme-editor JSON every deploy | add `.shopifyignore` listing `config/settings_data.json` + `sections/*.json` + `templates/*.json` |
| 8545d41 | SP widget vanishes from drawer after every cart mutation (the big one) | promote SP settings from section schema to theme-global `settings_schema.json` (Cart group) |
| dda052c | After uncheck, checkbox auto re-checks on re-render | JS reconciles checkbox state against `data-sp-in-cart` + sessionStorage opt-out flag after every bind |

### Block 2 — Layout + copy polish (commits 13d0273 → 024f5dd, 3 commits)

| Commit | What |
|---|---|
| 13d0273 | Tier progress bar was squished inline with copy + CTA; needed `flex-wrap: wrap` on the headline + `width: 100%` on the bar to lay out on its own row |
| 0f9b312 | "+ FREE SHIPPING" mention removed from qty 2/3/4 bundle headline copy (free-shipping campaign muted everywhere) |
| 024f5dd | Totals "Shipping FREE" label gated on `show_shipping_bar` toggle for consistency with bar-muting |

### Block 3 — Architecture pivot (commit 9dbb25c)

User asked: "can swap shopify function in my app to theme function?" — sparked a decision conversation about bundle-discount architecture. Options laid out: (A) keep the custom Function in `dopamiles-bundle-app`, (B) replace with native Shopify automatic discounts gated by collection, (C) third-party app. User picked B.

| Commit | What |
|---|---|
| 9dbb25c | Migrate eligibility check across 4 snippets (PDP banner, PDP stack-save, cart-drawer headline, collection card pill) from `product.tags contains 'bundle-eligible'` to `product.collections contains 'bundle-eligible'`. The 3-pack picker section already worked via collection setting — no change. |

Merchant side (no code from me):
1. Created smart collection `bundle-eligible` with condition `Product tag is equal to bundle-eligible`. Auto-populates from already-tagged products — no product re-tagging.
2. Created 3 automatic discounts (Tier 2 / 3 / 5) with min-quantity gates + per-unit amounts + "applies to each item, not once per order". All 3 active.
3. Verified end-to-end: qty 2 cart → $4 off applied; qty 3 → $9 off; qty 5+ → $25 off. Shopify auto-picks highest-savings tier.

### Block 4 — Copy unification (commits 6f70cc3 → 2a1e18d, 4 commits)

User flagged: marker labels show per-unit `$2/$3/$5 OFF` but should show tier-total `$4/$9/$25 OFF` for a more meaningful number. Then asked "save or off?" → picked "save / saved" tone everywhere. Then asked to align PDP block, banner, and collection pill to the same convention.

| Commit | What |
|---|---|
| 6f70cc3 | Cart-drawer headline + tier bar markers switched from per-unit to tier totals ($4/$9/$25). New Liquid assigns: `bundle_tier_X_total = amount × qty`. |
| b772169 | Cart-drawer copy tone standardized: "save / saved" everywhere. Past tense for current-state confirmation, imperative for next-tier hooks. |
| f4b4f59 | PDP Stack & Save tier cards, status line, and bar markers aligned on the same tone. Updated both Liquid (initial render) and the picker JS (`dopamiles-stack-save.js`) which mutates the status line on qty change. |
| 2a1e18d | PDP bundle banner + collection card pill + Stack & Save header all aligned. Heading "More tees, more off." → "More tees, more savings." Header description `max-width: 46ch` dropped so the copy fills the row (closes a visible gap). Collection pill switched from "Save up to $5 each" (per-unit cap) to "Save up to $25" (top-tier total). |

## The four systemic gotchas (saved to memory)

These will bite anyone doing similar Shopify work. Saved to memory bank for future sessions:

### 1. `shopify theme push --nodelete` overwrites merchant-editable JSON

`--nodelete` means "don't delete missing-locally files", not "don't overwrite". Every push uploads my local `sections/*.json`, `config/settings_data.json`, `templates/*.json` — clobbering merchant theme-editor choices saved in those files.

**Cost**: ~2 hours of misdiagnosis. User re-saved settings 3+ times because every code push reset them.

**Memory**: `shopify_theme_push_overwrites_merchant_json.md`

### 2. Shopify Section Rendering API renders with schema defaults, not saved settings

When JS does `fetch('/cart/change.js', { body: JSON.stringify({…, sections: ['my-section-filename'] }) })`, Shopify renders that section STANDALONE with schema defaults. Section-level settings + section-group-saved settings are NOT applied.

Direct Shopify docs quote: *"If a requested section exists in a template, or is statically rendered, then the existing section settings apply. Otherwise, any default values are used."* — https://shopify.dev/docs/api/ajax/section-rendering

Symptom: a `type: product` / `type: collection` / `type: url` setting (anything without a schema default) renders correctly on initial page load, then disappears after every cart mutation. Looks like a JS bug. It's not — it's the API.

**Cost**: ~1.5 hours before delegating to a debugger subagent which dug up the authoritative docs quote in <5 minutes.

**Memory**: `shopify_section_rendering_api_schema_defaults.md`

### 3. Liquid can't read sessionStorage — server-rendered HTML can't honor client state

When SP got toggled off, the snippet still rendered the checkbox `checked` because `default_checked=true`. The shopper's opt-out flag is in sessionStorage — server has no idea. Need to reconcile checkbox state in JS after every section swap.

**General rule** (added to my mental checklist): for any UI element whose state crosses server-render + client mutation, always reconcile to data sources after every re-render bind. Server-rendered HTML can't honor sessionStorage/localStorage state.

### 4. Inline `product.first_available_variant` vs `product.variants.first`

`first_available_variant` returns nil when the variant becomes unavailable (e.g., inventory drops to 0 with tracking on, no continue-when-OOS). For a "service" product like Shipping Protection where the merchant might price-track but not inventory-track, this caused the widget to vanish + duplicate as a line item. `variants.first` always returns the first variant (regardless of availability) and is the more resilient choice for stable JS-linked data attrs.

## What worked

- **Gated execution + same-session iteration**: caught every bug through live preview testing. If I'd shipped + handed off to user-only QA, half these bugs would've leaked.
- **Debugger subagent delegation** (Section Rendering API gotcha): the docs citation came from the subagent in ~5 min vs my 1.5 hr of misdiagnosis. Report at `plans/reports/sp-widget-disappears-on-cart-mutation.md`.
- **`AskUserQuestion` with concrete options + previews** (copy tone decision, gap-fill decision): user picks in seconds with no ambiguity. Used 4× this session.
- **Memory writes mid-iteration**: caught gotchas while context was hot. The future-me reading those notes will save hours.
- **Pulling live JSON before re-diagnosing**: the moment I pulled `header-group.json` and saw the SP product setting was wiped, the root cause was obvious. Lesson worth keeping: when merchant says "I saved it" and symptom suggests "the setting is missing," pull the live JSON before assuming code bug.

## What didn't work / what I'd change

- **Iteration count was high** (15 commits including the original feature, for what was a 1-1.5h Phase 4 estimate). The estimate didn't account for the Section Rendering API behavior, the theme-push-wipes-JSON gotcha, or the architecture pivot conversation that emerged mid-QA. Both gotchas would've shown up in any reasonable QA pass; Phase 4 estimating at 1-1.5h was wrong.
- **I should've pulled live `settings_data.json` + `header-group.json` earlier**. Assumed the theme-editor save persisted when actually each push was wiping it. ~2 hrs lost.
- **`product.first_available_variant` vs `variants.first`** — used the former by convention, but it's the wrong choice for service-style products. Caught only via live QA.
- **Architecture pivot mid-iteration**: the bundle-app-Function → native-discounts migration was a great call but emerged from user questioning during QA, not from my upfront planning. Worth noting for next bundle/discount project: ask early whether the merchant actually wants a custom Function vs the cheaper native automatic discounts path.

## Patterns to remember (cross-cutting)

- **`.shopifyignore` is the first thing to set up** on any Shopify theme repo, before first push. Prevents class of merchant-settings-wiped bugs.
- **Audit section settings for "no schema default" pickers** when JS will re-render via Section Rendering API. Anything `type: product` / `type: collection` / `type: url` / `type: blog` / `type: page` / `type: linklist` without a `default` resolves to blank on re-render. Promote to theme-global or use metafields.
- **`data-attr` on always-present wrapper > section-local data attrs** when JS needs config the section snippet might not be rendering at that moment (e.g., empty cart). Drawer wrapper `#dop-cart-drawer` always exists; emit SP variant ID + default-checked there for ATC bundling reads.
- **Reconcile UI state to data sources after every re-render bind**. Server-rendered HTML can't honor client-side session state.
- **For tier-based discount UX**, show tier-total savings ($4/$9/$25) for shopper-facing copy and per-unit amounts ($2/$3/$5) only in the discount math layer. Shoppers care about "how much do I save total at this tier," not "what's the unit multiplier."
- **Multi-surface copy revisions need coordinated commits**. Cart drawer copy ≠ PDP banner copy ≠ collection pill copy were all using slightly different language conventions before this session. Now all four read consistently.

## What's next

- **Phase 5 manual QA matrix** ([phase-05-qa-theme-editor.md](../../plans/260520-1010-pod-tee-cart-drawer-offer-revamp/phase-05-qa-theme-editor.md)) is still pending. Most of those 24 scenarios were spot-tested live during the bug-fix iteration; the matrix should be run end-to-end one more time before deploy to live theme.
- **Bundle app retirement**: user can disable / uninstall `dopamiles-bundle-app` now that the 3 Shopify Admin automatic discounts are doing the work. No code dependency.
- **Push the branch**: 14 commits unpushed to remote `feat/pdp-perf-pareto`. Awaiting user confirmation before push.
- **No code-side follow-ups planned**. If Phase 5 surfaces anything, follow-up commit. The bundle discount surfaces are unified across cart + PDP + collection card and all read off the same `shop.metafields.bundles.tiers` source of truth.
