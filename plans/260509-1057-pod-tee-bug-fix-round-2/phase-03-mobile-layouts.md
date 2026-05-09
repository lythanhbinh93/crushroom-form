# Phase 03 — Mobile Layouts

## Context Links

- iPhone walkthrough findings (Issues A, B, C) — see plan.md root section
- Source: `D:\github local\pod-tee-theme\assets\dopamiles-collection.css` (lines 485-560, 900-965)
- Source: `D:\github local\pod-tee-theme\assets\dopamiles-footer.css` (lines 155-172)

## Overview

**Priority:** P1 (mobile UX)
**Status:** completed (2026-05-09)
**Effort:** ~45 min
**Owner:** code

Surgical CSS fixes to three mobile layout problems found in iPhone walkthrough. No JS, no markup. Only `dopamiles-collection.css` + `dopamiles-footer.css` touched.

**Red-team caveat (Issue B):** `auto-flow: dense` interacts with `.doc-ad-card { grid-column: span 2 }` to backfill orphan slots — but it ALSO reorders subsequent product cards visually. With editorial card mid-grid, the "5th newest" product may appear in the 4th visual slot. SEO + "newest first" semantics are visual-only affected; DOM order preserved (focus + screen-reader order intact).

## Key Insights

- **Issue A:** `.doc-toolbar` at ≤960px goes `flex-direction: column` (line 917). Reset to row at 560px (line 951), but iPhone widths between 560-960 sit in the gap → Filter+Sort stack vertically.
- **Issue B:** `.doc-ad-card { grid-column: span 2; }` (line 497) on mobile causes orphan empty cells when total products before the ad card is odd. CSS Grid auto-flow forces a row break.
- **Issue C:** Footer at ≤599px collapses to single column (line 168). 3 menu cols + newsletter wastes half the viewport vertically.

## Requirements

**Functional:**
- Collection toolbar: Filter button + Sort dropdown on one row at all mobile widths.
- Collection grid: no orphan empty cells regardless of editorial card position.
- Footer: balanced 2-column layout on phone, no excessive vertical scroll.

**Non-functional:**
- No layout shift (CLS budget unchanged).
- No JS.
- No regression to desktop layouts (≥961px untouched).

## Architecture

**Issue A fix:** Move toolbar `flex-direction: row` from 560px breakpoint to 960px breakpoint. Drop column flex-direction. Drop `flex-wrap: wrap` if present. Hide `.doc-count-pill` at <600px to save horizontal space.

**Issue B fix:** Add `grid-auto-flow: dense` to `.doc-grid` at mobile breakpoint (≤960px). CSS Grid backfills empty cells with later items, eliminating orphans. No markup change.

**Issue C fix:** Replace `1fr` single-column footer at ≤599px with `1fr 1fr` two-column. Newsletter spans full row (`grid-column: 1 / -1` already set at 899px breakpoint, inherits).

## Related Code Files

**Modify:**
- `D:\github local\pod-tee-theme\assets\dopamiles-collection.css`
  - Lines 902-923: `@media (max-width: 960px)` block — toolbar fix + grid auto-flow
  - Lines 951-952: `@media (max-width: 560px)` — keep count-pill hide, remove redundant row reset
  - Line 497: `.doc-ad-card { grid-column: span 2; }` — keep (renders correctly with auto-flow: dense)
- `D:\github local\pod-tee-theme\assets\dopamiles-footer.css`
  - Lines 166-172: `@media (max-width: 599px)` — change `1fr` to `1fr 1fr`

**Read for context:**
- `D:\github local\pod-tee-theme\sections\dopamiles-collection-grid.liquid` (line 198 — verify `.doc-ad-card` placement at `editorial_after`)

**Create:** none
**Delete:** none

## Implementation Steps

### Step 1 — Issue A: Collection toolbar row at all mobile widths

Edit `dopamiles-collection.css` lines 916-922 (in `@media (max-width: 960px)`):

```css
/* BEFORE */
.doc-toolbar {
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}
.doc-toolbar-right { width: 100%; justify-content: space-between; }

/* AFTER */
.doc-toolbar {
  flex-wrap: nowrap;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
.doc-toolbar-right {
  flex: 1;
  justify-content: flex-end;
  gap: 10px;
}
```

In the `@media (max-width: 560px)` block (line 951), remove the now-redundant `flex-direction: row` (already row by default). Keep `.doc-count-pill { display: none }`.

```css
/* BEFORE (line 951-952) */
.doc-toolbar { flex-direction: row; justify-content: space-between; padding: 14px 0; }
.doc-count-pill { display: none; }

/* AFTER */
.doc-count-pill { display: none; }
/* toolbar already row from 960px breakpoint above */
```

### Step 2 — Issue B: Collection grid auto-flow dense on mobile

In the same `@media (max-width: 960px)` block, update `.doc-grid` rule (line 912):

```css
/* BEFORE */
.doc-grid { grid-template-columns: repeat(2, 1fr); gap: 24px 16px; }

/* AFTER */
.doc-grid {
  grid-template-columns: repeat(2, 1fr);
  gap: 24px 16px;
  grid-auto-flow: dense;
}
```

Same addition in `@media (max-width: 560px)` block (line 954) — apply to nested 1fr 1fr grid:

```css
/* BEFORE */
.doc-grid { grid-template-columns: 1fr 1fr; gap: 20px 12px; }

/* AFTER */
.doc-grid {
  grid-template-columns: 1fr 1fr;
  gap: 20px 12px;
  grid-auto-flow: dense;
}
```

### Step 3 — Issue C: Footer 2-col on phone

Edit `dopamiles-footer.css` lines 166-172:

```css
/* BEFORE */
@media (max-width: 599px) {
  .dop-footer-inner {
    grid-template-columns: 1fr;
    gap: 24px;
    padding-top: 40px;
  }
}

/* AFTER */
@media (max-width: 599px) {
  .dop-footer-inner {
    grid-template-columns: 1fr 1fr;
    gap: 24px 18px;
    padding-top: 40px;
  }
  /* Newsletter already spans 1/-1 from 899px breakpoint (line 161-163) */
}
```

(Newsletter `grid-column: 1 / -1` declared in 899px breakpoint at line 162 inherits — no change needed.)

### Step 4 — Smoke test on iPhone preview (HEAD-confirmed)

Pre-condition: Phase 00 Step 6 deploy verified — preview reflects branch HEAD.

1. Collection page at **320px (iPhone SE 1st gen)**, 375px (iPhone SE 2nd/3rd), 414px (iPhone Pro Max):
   - Toolbar: Filter button + Sort dropdown on one row, no wrap. If 320px wraps, hide Sort label text and keep icon (note for follow-up).
   - Grid: scroll past mid-grid editorial card → no empty cells before/after.
   - Note: 5th newest product may visually appear 4th due to `auto-flow: dense` — acceptable.
2. Footer at 375px: 2-col menu layout, newsletter full-width above. No half-empty viewport.
3. Tablet (768px landscape phone): toolbar still row, grid 2-col, footer 2-col.
4. Desktop (1024px+): no regression — toolbar pre-960 desktop layout untouched.

## Todo Checklist

- [x] Toolbar 960px block: column → row, no wrap
- [x] Toolbar 560px block: redundant row reset removed, count-pill hide kept
- [x] Grid 960px block: `grid-auto-flow: dense` added
- [x] Grid 560px block: `grid-auto-flow: dense` added
- [x] Footer 599px block: `1fr` → `1fr 1fr`
- [x] Smoke 320px: toolbar single row (or graceful icon-only) — Gate 1 Playwright probe confirmed via computed styles
- [x] Smoke 375px: toolbar single row — verified
- [x] Smoke 375px: no orphan grid cells — verified
- [x] Smoke 375px: footer 2-col balanced — verified
- [x] Smoke 1024px: no desktop regression — verified
- [x] Document `auto-flow: dense` reorder caveat in code comment near rule
- [x] **COMPLETED** 2026-05-09 12:40 — commit `b830337` (pure CSS, no regression to desktop layouts)

## Success Criteria

- Lighthouse mobile collection: CLS unchanged or improved.
- iPhone screenshot: toolbar shows Filter + Sort side-by-side at all mobile widths.
- iPhone screenshot: collection grid has no orphan empty cells past editorial card.
- iPhone screenshot: footer shows 2 menu columns + newsletter row.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `auto-flow: dense` reorders product cards visually (later items move up to fill orphan slot) | Med | Low | Acceptable trade-off vs. empty cells; if jarring, fallback to hiding `.doc-ad-card` on mobile |
| Toolbar items overflow narrow phones (320px iPhone SE 1st gen) | Low | Med | `gap: 12px` + `flex: 1` on right group keeps items compact; test at 320px |
| Footer 2-col with single tall menu wraps awkwardly | Low | Low | Existing menu items are short ("About", "Help", etc.) — visual check |
| Sort dropdown still wraps on 320px viewport | Low | Med | If wrap occurs, hide button label text on <360px, keep icon |
| `auto-flow: dense` not supported on iOS Safari <11 | Very Low | Low | iOS 11+ has full support; Dopamiles target is iOS 14+ |

## Security Considerations

- CSS-only changes. No JS, no input handling, no network.
- No accessibility regression — focus order unchanged (DOM order preserved by `auto-flow: dense`; only visual order changes).

## Next Steps

- Phase 04 (sweep regressions) also touches `dopamiles-collection.css` but at different lines (eyebrow color rule line 54). No conflict; either can run first.
- Phase 05 verification covers visual diff via Lighthouse + iPhone screenshot.
