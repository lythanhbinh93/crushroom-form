# Predictive Search UX — Fix Options
Date: 260514-1912 | Theme: pod-tee-theme | Scope: header predictive dropdown

## Premise check (read first)
User's diagnosis: "dropped `data-dop-search-trigger`, so custom JS can't find input." Verified in code: `findHeaderSearchInput()` at `dopamiles-search.js:433-447` has a **3-tier fallback** — Dawn `predictive-search`, then `header input[type="search"]` (line 439), then `[data-dop-search-trigger]`. The overlay input IS inside `<header>`, so tier-2 matches. Custom dop-search is **probably still initializing**.

If Shopify default UI is visible, real cause is more likely: **Search & Discovery app is auto-injecting its own dropdown onto `input[name="q"]`**, competing with (or stacking on top of) dop-search. Or dop-search's panel is being injected but hidden behind/below the app's dropdown. **Confirm via DOM inspect before picking a path.** A 5-min debug saves picking the wrong fix.

---

## Path A — Re-wire dop-search to overlay
- Touches: `dopamiles-header.liquid:127` (add `data-dop-search-trigger` on `<form>`), maybe nothing else if tier-2 fallback already works.
- Effort: 1 LOC + 30 min DOM verify + style polish for overlay context.
- Pros: Keeps 542-LOC brand UI; recent + suggested + preview cards preserved.
- Cons: If app's injected UI is the visible thing, this alone won't fix it — must also style-suppress (see D).
- Risk: Low. Tier-2 already matches → real bug is elsewhere.

## Path B — Embrace Shopify Search & Discovery, restyle
- Touches: delete `dopamiles-search.js` (542 LOC) + `dopamiles-search.css` (803 LOC); add ~150 LOC CSS overrides targeting app's injected classes (`.predictive-search__*` etc.); update `dopamiles-header.liquid` to remove dop-search script tag.
- Effort: -1345 LOC + ~150 LOC = net -1195 LOC. 4-6h (selector spelunking, brittle).
- Pros: Native synonyms, analytics, merchandising rules; less code to own.
- Cons: App CSS class names are **undocumented + unstable** — Shopify can rename anytime; no recent searches or preview-card idle state out of the box; you lose the offline localStorage feature.
- Risk: Medium-high (CSS targets unstable internals).

## Path C — Dawn `predictive-search` custom-element pattern
- Touches: write new `<predictive-search>` custom element (~200 LOC) + matching Liquid partial that renders `predictive-search.liquid` server-side from `/search/suggest.json` response; rewire overlay markup; delete dop-search JS+CSS.
- Effort: ~250 LOC new + ~50 LOC Liquid section + delete 1345 LOC. 8-12h.
- Pros: Idiomatic Shopify pattern; server-rendered rows (SEO + styling control); brand-controlled markup.
- Cons: Biggest rewrite; reimplements idle state from scratch; need to copy Dawn's section file too.
- Risk: Medium. Well-trodden path but full reimplementation.

## Path D — Hybrid: keep dop-search + suppress app UI
- Touches: `dopamiles-header.liquid:127` add trigger attr; `dopamiles-search.css` add `predictive-search, .predictive-search__results, [data-predictive-search] { display:none !important; }` and any app wrapper selectors.
- Effort: 1 + ~10 LOC. 1-2h.
- Pros: Cheapest real fix; keeps brand UI; explicitly defeats the competing injection.
- Cons: CSS suppression is whack-a-mole if app updates class names; no native synonyms/analytics.
- Risk: Low-medium.

## Path E — Disable predictive entirely
- Touches: delete dop-search JS+CSS; remove app's predictive in Search & Discovery settings; overlay just submits to `/search`.
- Effort: -1345 LOC + 0. 1h.
- Pros: Zero UX bug surface; fastest perceived performance; mobile-friendliness.
- Cons: Loses a feature users expect on commerce sites in 2026; suggested queries + preview cards gone.
- Risk: Very low technical. UX regression — measurable conversion impact possible.

---

## Comparison

| Path | LOC delta | Time | UX | Maint | Brand | Risk |
|------|----------:|-----:|----|-------|-------|------|
| A    | +1        | 1h   | Same as before refactor | Same | High | Low |
| B    | -1195     | 5h   | App-native | Lower | Medium (CSS hack) | Med-Hi |
| C    | -1095     | 10h  | Server-rendered, ideal | Lower long-term | High | Med |
| D    | +11       | 2h   | Same as before + clean | Same | High | Low-Med |
| E    | -1345     | 1h   | Degraded | Lowest | Neutral | Very low (tech) |

---

## Recommendation: **Path D**, with debug-first

1. Spend 15 min inspecting DOM — confirm whether dop-search panel **is injecting** but losing z-index/positioning to app's dropdown, or whether tier-2 fallback fails for some reason.
2. If dop-search injects: ship Path D (add `data-dop-search-trigger` for explicitness + CSS-suppress app's UI).
3. If dop-search fails to init: fix root cause (likely script load order vs overlay markup) — still Path D class, just adjusted.

Path D respects YAGNI/KISS: 542 LOC of custom UX already exists, already styled to brand, and the regression is **not** that it's broken — it's that a second dropdown is competing. Delete the competition, don't rewrite the world. Revisit Path C only if Search & Discovery features become a business requirement.

---

## Unresolved questions
- Is Search & Discovery app actually installed on this store? (Confirm via Admin → Apps. If not, default UI source is different and Path D doesn't apply as written.)
- Did tier-2 selector actually match after refactor? (5-min `console.log` in `init()` settles it.)
- Are recent searches + preview cards in the idle state still business-valuable, or is user fine losing them? (Decides whether B/E are viable.)
- Any analytics/merchandising rules currently configured in Search & Discovery that we'd lose by suppressing its UI?

**Status:** DONE
