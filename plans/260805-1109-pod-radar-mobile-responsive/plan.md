# POD Radar — mobile responsive

**Status:** phase 01 complete, verified, uncommitted
**Code repo:** `D:/github local/pod-research` (branch `master`)
**Created:** 2026-08-05

## Outcome

The dashboard is usable on a phone. Today it is not: the nav's 7 tabs sit in a
`flex: none` row ~1090px wide and run off-screen with no way to reach them, and
the card grid is hard-coded to 5 columns so cards render ~60px wide.

Scope here is **part 1 of 2** — the nav and the card grids. The `st.columns`
sweep and the Movers dataframe are deliberately deferred (see Non-goals).

## Constraints

1. Two breakpoints only: **640px** and **1024px**. No others. Both are
   `max-width`; a `min-width` block is a desktop rule in disguise and is
   rejected by test.
2. Every page-level media query lives in `design_system.inject_theme()`.
   `GRID_CSS` is the one exception — it renders inside the clickable-grid
   component iframe, which page CSS cannot reach.
3. No new custom components.
4. **Desktop at 1500px must be pixel-identical.** This is the regression that
   matters; a base rule may not change, only be overridden below a breakpoint.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 01 | [Nav wrap + card grid reflow](phase-01-nav-and-grid-reflow.md) | complete |

## Verification

Every acceptance criterion was measured in headless Chrome, not argued from
source. Five revisions; each of the first four passed its own test suite and was
still wrong in a way only a browser could see.

| | result |
|---|--------|
| Desktop 1500px vs baseline | identical to two decimals — card `256.00×310.25`, art and img `254×254`, offset `(0,0)`, bar 39.00, all five badge states |
| 3-column band (host 736) | bar 39.00, worded pill 10.5px, nothing clipped |
| Phone 320–428px | uniform one-line bar 31.00 at every width, 23% → 17% cover, nothing clipped |
| Nav | 3 declared rows at 375px, 2 at 768/1024px, stable across all three status strings; all 7 tabs reachable |
| Mood board | identical to Design finder in every measured cell; `.pr-wf` overlay unaffected |
| Click delegation | `closest([data-ck])` resolves to the card in all 22 frames measured |
| Tests | 304 passing (278 existing + 26 new); 18/18 mutations caught |

## Acceptance criteria

1. At ≥1025px every changed selector computes identically to `master`. Measured
   two ways: the page stylesheet's desktop rule set is unchanged (51 → 51
   rules), and `design_finder`'s changes exactly one rule — `.pr-art img`, whose
   old and new forms were measured pixel-identical at 5, 3 and 2 columns.
2. All 7 nav tabs are reachable at 375px **and at 768/1024px** — the row wraps
   and the tab strip scrolls horizontally.
3. Design finder and Mood board render 5 / 3 / 2 columns as the content column
   narrows.
4. `.pr-art img` is absolutely positioned, so an iOS 16 Safari card is square
   rather than viewport-tall.
5. The freshness chip still reads `updated N …` at 375px. Only the username
   chip is hidden, and its identity survives in the ⏻ tooltip.
6. Exactly two `@media` widths exist across all three rendering contexts — the
   page stylesheet, `GRID_CSS`, and the component frontend — and both are
   `max-width`.
7. A two-column card renders its evidence badge in full. Clipping `· 128d` to
   `· 12` is a wrong number, not a cosmetic defect.
8. Full suite passes: 278 existing + 20 new.

## Non-goals

- The 18 `st.columns` call sites (part 2). Whether Streamlit 1.56 stacks them
  natively is unknown and cannot be settled statically — it needs a phone.
- The bottom paginator's `[8]` side gutters (part 2, same reason).
- Movers' dense `st.dataframe`. Horizontal scroll is the honest answer there;
  a card rewrite is out of scope.
- Any Python behaviour change. This is CSS plus one HTML class attribute.

## Deviations from the request

Detail and reasoning in the phase file.

1. **`repeat(auto-fill, minmax(150px, 1fr))` rejected.** It resolves to ~8
   columns inside the 1500px container, breaking constraint 4. Replaced with
   explicit breakpoint overrides on top of the untouched `repeat(5, 1fr)` base.
2. **`.pr-chip .t` is not collapsed.** That element holds `updated N days ago`;
   hiding it would undo the freshness chip shipped in `d600a64`. The username
   chip is hidden instead, and its identity moves to the ⏻ tooltip.
3. **The nav wrap fires at ≤1024px, not ≤640px.** Measured, the nav row's
   minimum width is ~1049px, so a phone-only breakpoint left the original bug
   intact on every tablet — at iPad portrait the sign-out sat ~313px outside
   the viewport. Still two breakpoints; they are just each used by both
   concerns rather than one each. User decision, taken at the review gate.

## Known residuals

Not defects introduced here — measured limits of what part 1 covers.

| # | Residual | Why not fixed |
|---|----------|---------------|
| R1 | **Every iPad released since 2021, in landscape**, keeps 15–129px of nav overflow (1080/1133/1180/1194px devices; band is 1025–1208px) | The nav's physical minimum is 1049px of container, which the container only reaches at 1208px device. Closing it needs either a third breakpoint or moving the grid's 1024 too — the latter would push the 5→3 column flip from 1184px to 1368px, re-columning far more desktops. Offered at the review gate; user kept two breakpoints. iPad **portrait** (768/820/834) is fixed. |
| R2 | The freshness chip is unreadable from ~1025px to ~1410px — so rotating an iPad from portrait to landscape makes it disappear, and 1366×768 laptops never show it | `.pr-refresh` has `width: 32px` but no `flex: none`, so both icon buttons squeeze 32→14px and eat the chip's room. A one-line fix, verified a no-op at 1500px, was offered at the review gate and not taken. |
| R3 | Below ~729px the active tab can start scrolled out of view (tab 3 of 7 at 320px, tab 5 at 375px) | Tabs are `<a href>` page loads, so `scrollLeft` resets each navigation, and `st.markdown`/`st.html` both sanitize `<script>`. Two CSS-only routes were tested: `position: sticky` on the active tab **does not work** (sticky pins an element leaving the scrollport; it cannot pull in one that starts 512px right). `order: -1` on `.pr-tab.on` **does** work — declined because it reshuffles the tab sequence on every navigation, which is worse than the problem on a 7-tab strip. A declined trade-off, not an impossibility. |
| R4 | `no runs yet` (~91px) rejoins row 1 at ≤640px instead of taking its own | It is the only chip branch with no status dot, so it alone falls under the ~94px break threshold. Cosmetic, empty-database state only. Closing it needs either a full-width pill or a markup wrapper. |
| R5 | Dragging a desktop window across exactly 640px reorders the chip relative to the buttons | `order: 2` lives in the 640 block while the wrap lives in the 1024 block, so the two never align. Visible only mid-drag. |
| R6 | On a phone the `new` state compresses to a lone `•` of 4.16px, which at a glance is hard to tell from a card with **no** evidence badge at all | `cell_badge` returns the glyph alone for `new` — correct in the Brands and Movers tables, thin at the right edge of a card bar. The collapse is toward `none`, not merely toward small, which is the sharper way to state it. Judged acceptable because `new` is already the design system's fallback (shown only when no status badge applies), it has its own view and sort key, so the information is one tap away. Remedy if wanted: keep the mini form worded for that one state — `• NEW` measures ~63px at 12px against a 117px bar at 320px, so it fits easily. |
