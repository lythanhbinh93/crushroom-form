# Phase 01 — nav wrap + card grid reflow

**Status:** complete, measured clean, uncommitted

## The lesson worth keeping

A CSS change verified by string assertions is unverified. Five revisions, and
revisions 1–4 each passed their own complete test suite while still being wrong:

1. shipped a nav that broke every tablet, and a badge that rendered a wrong number
2. shipped a badge fix that hid 47% of the artwork
3. shipped a scaled badge that still wrapped at 375px
4. shipped a wrapper that silently shortened every desktop card's bar by 3px

Source-level tests cannot see a line box, an ellipsis, or a scroll offset. They
are still worth having — they caught 18 of 18 mutations — but they guard
*intent*, not *rendering*. The rendering needs a browser.

One case is especially instructive: wrapping the pill in a `<span>` looked
inert. It turned the pill from a blockified flex child into a true inline box,
where vertical padding stops contributing to line-box height, so the bar lost
3px on every desktop card while the pill still *painted* its full 24px. No
string assertion could ever have seen that.

## Review outcome (headless-Chrome measurement, not source reading)

The first implementation passed all 12 of its own tests and was still wrong in
three ways that only a browser could see. Recorded because the lesson
generalises: a CSS change verified by string assertions is unverified.

| Found | Severity | Action |
|-------|----------|--------|
| Nav row's minimum width is 1049px, so a 640px breakpoint left every tablet broken — iPad portrait had the sign-out 313px off-screen | high | fixed, breakpoint moved to ≤1024 (user decision) |
| The wrapped nav produced 2 or 3 rows depending on the status string's length, with ↻/⏻ orphaned left-aligned on a row of their own | high | fixed, rows now declared |
| A 2-column card clipped `▲ NEW WINNER · 128d` to `· 12` — a wrong number on the primary evidence signal | medium | fixed on the third attempt, see below |
| `@media (min-width: 1200px) { .pr-grid { repeat(8, 1fr) } }` rendered 8 columns at 1500px with the whole suite green | medium-high | fixed, breakpoints counted by feature |
| Rules moved below a block's closing brace kept their tests green while the desktop nav wrapped | medium-high | fixed, balanced-brace extraction |
| Freshness chip ellipsises 1050–1410px; `.pr-refresh` lacks `flex: none` | medium-high | R2, offered and declined |
| Active tab scrolls out of view at ≤640px | medium | R3, unreachable without JS |

### The evidence badge took three attempts, each defeated by measurement

Worth keeping, because each attempt looked correct and only a browser disproved
it. The card is ~162px at two columns; `.pr-bar` is pinned `left:0/right:0` so it
cannot grow, and `.pr-card { overflow: hidden }` clips the excess — off the
*right* end, which is where the day count lives.

| attempt | result | why rejected |
|---------|--------|--------------|
| let `.pr-bar` wrap, pill breaks its text | number correct, nothing clipped | bar grew to 76px over a 160px art square — **47% of the artwork hidden**, and 23/39/47% by evidence state, so a two-column scan came out ragged |
| scale the pill to 9px | less ragged | **still wrapped**: 2 of 5 states at 375px, 4 of 5 at 320px. 8px is the largest that clears 375px, with ~2px to spare, and it still wraps at 360px (a very common Android width) |
| swap to `cell_badge` at ≤640 | uniform one line, ~20% cover, readable | shipped |

The third works because it drops the *words* rather than shrinking them —
`▲ NEW WINNER · 128d` becomes `▲ 128` at roughly 35px, which fits a 135px card
with room to spare instead of ~2px. It reuses `ds.cell_badge()`, already the
form used in the Brands and Movers tables, so it is an existing compression
rather than a new one.

Cost, stated plainly: on a phone the `RUN` qualifier is gone and `nw`/`win`/
`ended` are distinguished by glyph and colour alone. That was visible in the
option the user accepted.

CSS cannot swap text, and the cards render inside a component iframe so there is
no server-side viewport to branch on either — hence `ds.evidence_badges()`
emitting both forms for the media query to choose between. This is the one part
of the phase that is not CSS-only.

One reviewer finding was refuted rather than applied: the `<div style="flex:1">`
spacer was named as the cause of the broken wrap, but `flex: 1` is
`flex: 1 1 0%`, so its outer hypothetical main size is 0 and it cannot break a
line. The chip's `auto` basis (~156px) is the real cause. The spacer stays —
it right-aligns ↻/⏻ exactly as on desktop.

## Files

| File | Change |
|------|--------|
| `dashboard/components/design_system.py` | add two `@media` blocks to `inject_theme()`; add one class in `top_nav()` |
| `dashboard/views/design_finder.py` | `GRID_CSS`: two `@media` blocks + the `.pr-art img` fix |
| `tests/test_responsive_css.py` | new |

`dashboard/views/mood_board.py` is **not** edited — `MB_CSS = GRID_CSS + …`
(line 23) so it inherits both changes.

## Why not `auto-fill` / `minmax`

The request asked for `repeat(auto-fill, minmax(150px, 1fr))`. Measured against
this codebase it breaks the desktop:

- `.block-container { max-width: 1500px }` (design_system.py:152), so the
  component iframe is roughly 1450px wide.
- `auto-fill` fits `floor((1450 + 14) / (150 + 14))` = **8 columns**.

Desktop goes 5 → 8 and every card shrinks. That is the exact regression the
request named as the one that matters.

Sizing the floor to preserve 5 columns is possible — 6 columns need
`M ≤ 233px`, 5 need `M ≤ 283px`, so any `M` in `(233, 283]` holds 5 at 1450px.
But it depends on an iframe width nobody has measured, and it silently
re-columns the moment Streamlit changes container padding. Explicit breakpoints
are provably identical above 1024px because the base rule is not touched at all.

The media query is evaluated against the **iframe's** width, which tracks the
content column rather than the device. That is the better signal here anyway.

## Steps

### 1. `GRID_CSS` — grid reflow (design_finder.py:24)

Keep the base rule exactly as it is. Append after the existing rules:

```css
/* the iframe is as wide as the content column, so these track the grid's own
   room rather than the device */
@media (max-width: 1024px) { .pr-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px)  { .pr-grid { grid-template-columns: repeat(2, 1fr); } }
```

Two columns rather than one below 640px: this is a visual scanning tool, and
one card per screen turns a 60-card sweep into 60 scrolls. At 375px that is
~165px per card, which the `.pr-bar` overlay (heat number + badge,
`space-between`, 10px padding) still fits.

`GRID_CSS` is an f-string — the `{` in `@media { … }` must be doubled.

### 2. `GRID_CSS` — iOS 16 fix (design_finder.py:31)

```css
.pr-art img { position: absolute; inset: 0; width: 100%; height: 100%;
              object-fit: cover; display: block; }
```

`.pr-art` is already `position: relative`, and the sibling `.pr-noimg` on the
next line already uses `position:absolute; inset:0`. On iOS 16 an in-flow child
with `height:100%` inside an `aspect-ratio` box resolves against the viewport,
not the box, so the card inflates to screen height. Absolute positioning
resolves against the padding box instead. Desktop rendering is unchanged: both
forms fill the same square exactly.

### 3. `inject_theme()` — nav (design_system.py, after the `.pr-refresh` rules)

```css
@media (max-width: 640px) {
  .pr-nav { flex-wrap: wrap; height: auto; gap: 10px 12px; padding: 8px 6px; }
  /* tabs take their own full-width row below the brand and status row */
  .pr-tabs { order: 3; flex: 1 0 100%; height: 40px; overflow-x: auto;
             scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .pr-tabs::-webkit-scrollbar { display: none; }
  .pr-nav a.pr-tab { padding: 0 10px; }
  /* the name is already in the chip's title=; the freshness chip is not */
  .pr-chip.pr-who .t { display: none; }
  .pr-chip.pr-who { padding: 5px 9px; }
}
```

`.pr-tabs` keeps `flex: none` at every width above 640px, so the desktop rule
that stops a long status chip from wrapping the tab labels is untouched.

The scrollbar is hidden because a visible one eats the 40px row on desktop-class
browsers at a narrow window; the strip still scrolls by touch and by trackpad.

The existing `<div style="flex:1">` spacer stays. With `flex-wrap`, row 1
becomes brand → spacer → chip → ↻ → user, which is the desired arrangement.

### 4. `top_nav()` — make the username chip targetable (design_system.py:340)

```python
who = (f'<span class="pr-chip pr-who" title="Signed in as …
```

One added class. No other markup change.

### 5. Second breakpoint

1024px is used by the grid (step 1). The nav needs no 1024px rule — 7 tabs plus
brand and chip total ~1090px, which fits a 1024px content column once
`.block-container` padding is accounted for, and wraps cleanly below 640px.
Adding an unused breakpoint would violate constraint 1 for no gain.

## Tests — `tests/test_responsive_css.py`

Source-level assertions, matching the existing style in `test_pagination.py`.
CSS cannot be executed here, so the tests guard the *invariants* that a future
edit would break silently:

1. `.pr-grid`'s base rule is still `repeat(5, 1fr)` — the mechanical form of
   "desktop is pixel-identical".
2. Exactly two distinct `@media` widths repo-wide, and they are 640 and 1024.
3. No `@media` in any `views/*.py` other than `design_finder.GRID_CSS` — the
   single-CSS-home rule.
4. `.pr-art img` carries `position: absolute` and `inset: 0`.
5. `MB_CSS` contains the grid media queries, i.e. Mood board still inherits
   them. Guards against a future split that would silently un-responsive it.
6. The freshness chip's `.t` is not hidden; only `.pr-who .t` is.
7. `top_nav` renders `pr-who` on the username chip (render-level, via the
   existing `st.markdown` capture pattern).

## Validation

```
python -m pytest tests/ -q          # 278 existing + new must pass
```

Manual, after deploy — this is CSS, so a real device is the only real proof:

- 1500px desktop: 5 columns, nav on one row. Compare against `master`.
- 375px iPhone Safari: all 7 tabs reachable by scrolling the strip; 2 columns;
  cards square, not viewport-tall; freshness chip still legible.

## Risks

| Risk | Handling |
|------|----------|
| Iframe clips a taller grid | Retired — `ResizeObserver` reports height (index.html:63) |
| f-string brace error in `GRID_CSS` | Caught immediately: the module fails to import, so every test errors |
| Streamlit's own CSS-in-JS overrides the nav media query | `.pr-nav` is our markup inside `stMarkdownContainer`; nothing Streamlit ships targets it |
| 2 columns at 375px feels cramped | Reversible one-line change to 1; decide on the device, not in review |

## Rollback

`git revert` the single commit. No data, schema, or contract touched.
