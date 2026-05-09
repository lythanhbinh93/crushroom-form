# Phase 04 — Sweep Regressions (Bug #13, #14)

## Context Links

- Pre-flight outputs (Step 1, Step 2): [phase-00-pre-flight.md](phase-00-pre-flight.md)
- Red-team review (token+specificity finding): [../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md](../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md)
- Round-1 Bug #13 (review stars `role="img"`) — only fixed `doh-stars`, not `dop-stars`
- Round-1 Bug #14 (eyebrow contrast) — round-1 wrote `:where()` rule at `dopamiles-shared.css:181` with `var(--dop-accent-text, #C84A2A)` fallback; failed because per-template files load AFTER shared.css and use `color: var(--dop-accent)` (orange) winning the cascade
- Source: `D:\github local\pod-tee-theme\snippets\dopamiles-stars.liquid` (line 15)
- Sources (eyebrow): `D:\github local\pod-tee-theme\assets\dopamiles-shared.css:175-185`, `dopamiles-pdp.css:140`, `dopamiles-collection.css:54+`, `dopamiles-journal.css:62+`, `dopamiles-utility.css:194`, `dopamiles-home.css:417`, plus 60+ more matches in 12 files
- Round-1 sweep findings: [../reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json](../reports/visuals/web-testing-260508-1904-pod-tee-theme-mobile/sweep/findings.json)

## Overview

**Priority:** P1 (a11y, axe-core)
**Status:** completed (2026-05-09)
**Effort:** ~45 min
**Owner:** code

Fix two round-1 regressions (fixes that didn't take effect). **Source-level fixes — kill cascade conflict at the rule level, not via specificity hacks or new tokens.**

## Key Insights

- **Bug #13:** Round-1 added `role="img"` to `doh-stars` (home reviews) but missed `dop-stars` snippet (used by PDP testimonials, blog snippets). 4 axe-core violations remain.
- **Bug #14 root cause:** Round-1 wrote a low-specificity `:where()` rule at `shared.css:181` with `color: var(--dop-accent-text, #C84A2A)`. The fallback `#C84A2A` activates because `--dop-accent-text` is undefined. **But** per-template files (`pdp.css`, `collection.css`, `journal.css`, `home.css`, `utility.css`) load AFTER shared.css and contain rules like `.dop-eyebrow { color: var(--dop-accent); }` — same specificity, later in cascade → they win → orange returned to text → contrast fails.
- **Fix strategy:** edit ALL text-context `color: var(--dop-accent)` rules at source to `var(--dop-low)`. The existing `--dop-low: #C84A2A` token (Phase 00 Step 1 confirmed at `dopamiles-tokens.liquid:32`) already has the WCAG-AA-passing hex. **No new token needed.** Apply DRY by reusing `--dop-low` directly. Round-1's `:where()` rule in shared.css can stay (it's harmless background fallback) but its existence isn't load-bearing once per-template rules are corrected at source.
- Phase 00 Step 2 produces the full audit table — Phase 04 walks every TEXT-classified row.
- Bug #14 sub-cases:
  - **Orange-on-white text:** `.dop-eyebrow`, `.doc-hero-eye`, `.dop-jnl-eye`, plus 50+ similar rules in account/components/feedback/etc. Use `--dop-low`.
  - **White-on-orange:** `.dop-404-art-tag` is white on orange — change bg to `var(--dop-ink)` (dark) keeping white text.
  - **Photo overlay:** `.doh-split-photo-tag` is `rgba(255,255,255,.45)` over photo — change to solid white + text-shadow scrim.

## Requirements

**Functional:**
- `dop-stars` snippet outputs accessible markup (`role="img"` + aria-label).
- All eyebrow/tag text elements pass axe-core color-contrast (4.5:1 normal text, 3:1 large).
- No specificity hacks (`!important`, multi-selector cascades).
- Token strategy: reuse `--dop-low` (existing). No new token created. Honors DRY.

**Non-functional:**
- Visual brand identity preserved (orange accent retained for non-text uses, large display headings, italic accent `<em>`).
- No layout shift.

## Architecture

**Bug #13 fix:** add `role="img"` to existing `<span class="dop-stars">` in snippet. Single-line. All consumers automatically inherit.

**Bug #14 fix strategy (revised per red-team):**

1. **No new token.** Use existing `--dop-low: #C84A2A` directly.
2. **Audit table from Phase 00 Step 2** drives the work. For every row classified TEXT (small):
   - Replace `color: var(--dop-accent)` with `color: var(--dop-low)` at source rule.
3. Leave NON-TEXT uses (`border-color`, `accent-color`, italic display `<em>` accent, large headings) on `--dop-accent`.
4. Special cases:
   - `.dop-404-art-tag` (utility.css:194): change `background: var(--dop-accent)` → `background: var(--dop-ink)`. Keep white text.
   - `.doh-split-photo-tag` (home.css:417): change to `color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.55), 0 0 1px rgba(0,0,0,.4);`.
5. **Round-1 `:where()` rule at `shared.css:175-181` can stay** as a safety-net, but is no longer load-bearing. Optional: simplify the `var(--dop-accent-text, #C84A2A)` to direct `var(--dop-low)` to remove dead-token reference — recommended for clarity.

## Related Code Files

**Modify (mandatory):**
- `D:\github local\pod-tee-theme\snippets\dopamiles-stars.liquid`
  - Line 15: add `role="img"` to outer span
- `D:\github local\pod-tee-theme\assets\dopamiles-shared.css`
  - Line ~175-181: simplify `var(--dop-accent-text, #C84A2A)` to `var(--dop-low)` (clarity; not load-bearing)
- `D:\github local\pod-tee-theme\assets\dopamiles-utility.css`
  - Line 194 area (`.dop-404-art-tag`): change background to `var(--dop-ink)`
- `D:\github local\pod-tee-theme\assets\dopamiles-home.css`
  - Line 417 area (`.doh-split-photo-tag`): solid white + text-shadow scrim

**Modify (per Phase 00 Step 2 audit table — TEXT classified rows):**

Files with text-context `color: var(--dop-accent)` matches per Phase 00 grep:
- `dopamiles-3pack.css:462`
- `dopamiles-account-order.css:79, 250`
- `dopamiles-account.css:42, 67, 120, 172, 192, 216, 268, 302, 457, 505, 525, 583`
- `dopamiles-collection.css:59, 88, 368, 527, 547`
- `dopamiles-components.css:150, 155, 569`
- `dopamiles-feedback.css:228`
- `dopamiles-home.css:52, 84, 120, 152, 263, 303, 414, 443, 492, 550, 628`
- `dopamiles-journal-article.css:25, 52, 344, 400, 482`
- `dopamiles-journal.css:62, 89, 353, 433, 463, 579, 597, 678, 709`
- `dopamiles-pages-static.css:45, 63, 149, 180, 328, 362, 398, 491`
- `dopamiles-pdp.css:145, 532, 596, 651`
- `dopamiles-utility.css:30, 72, 113, 314, 436, 489, 505, 556, 612, 809, 857, 884, 969`

For each match: open the rule, classify (TEXT-small / TEXT-large / DECORATIVE-italic-em). For TEXT-small only, swap `var(--dop-accent)` → `var(--dop-low)`.

**Keep on `--dop-accent`:**
- Italic em accents in display headings: `*.css :is(h1,h2,h3,h4) em { color: var(--dop-accent); }` (large text, decorative).
- `.dop-stars` icon fill at `pdp.css:651` if it's the star glyph color (visual brand, not text-readable info).
- Border, underline, accent-color, decoration-color uses (not in this grep, but flagged for completeness).

**Read for context:**
- `D:\github local\pod-tee-theme\snippets\dopamiles-tokens.liquid` — confirm `--dop-low` and `--dop-ink` exist (Phase 00 Step 1)

**Create:** none
**Delete:** none

## Implementation Steps

### Step 1 — Consume Phase 00 audit table

Open `phase-00-pre-flight.md` Step 2 outputs. For each TEXT-classified row, queue an edit. Walk in file order to keep diffs reviewable.

If audit table absent or incomplete: HALT. Run Phase 00 Step 2 to completion before proceeding.

### Step 2 — Bug #13: dop-stars role=img

`snippets/dopamiles-stars.liquid` line 15:

```liquid
<!-- BEFORE -->
<span class="dop-stars" aria-label="{{ stars_value }} out of {{ star_max }} stars">

<!-- AFTER -->
<span class="dop-stars" role="img" aria-label="{{ stars_value }} out of {{ star_max }} stars">
```

### Step 3 — Bug #14: clean up shared.css safety-net rule

`assets/dopamiles-shared.css` line ~175-181:

```css
/* BEFORE */
.dop-eyebrow,
.dop-eyebrow-sm,
.doc-hero-eye,
.dop-jnl-eye,
.dop-jnl-masthead .dop-jnl-eye,
.dop-404-art-tag,
.doh-split-photo-tag {
  color: var(--dop-accent-text, #C84A2A);
}

/* AFTER */
/* Brand orange #F26419 fails 4.5:1 for small text. Use --dop-low (#C84A2A,
   AA on white). This rule is a safety-net — per-template files now use
   --dop-low directly at source (Phase 04). */
.dop-eyebrow,
.dop-eyebrow-sm,
.doc-hero-eye,
.dop-jnl-eye,
.dop-jnl-masthead .dop-jnl-eye {
  color: var(--dop-low);
}
/* .dop-404-art-tag handled at utility.css:194 (background change). */
/* .doh-split-photo-tag handled at home.css:417 (text-shadow scrim). */
```

### Step 4 — Bug #14: per-file source-level swap

Walk every TEXT row from Phase 00 Step 2 audit. Pattern:

```css
/* BEFORE */
.dop-eyebrow { color: var(--dop-accent); ... }

/* AFTER */
.dop-eyebrow { color: var(--dop-low); ... }
```

Concrete file walk (verify each file:line via grep first):
- `dopamiles-pdp.css:145` — `.dop-eyebrow` → swap
- `dopamiles-collection.css:59` — eyebrow → swap
- `dopamiles-collection.css:88` — verify selector → swap if text
- `dopamiles-collection.css:368, 527, 547` — verify each → swap if text
- `dopamiles-journal.css:62, 89` — `.dop-jnl-eye` family → swap
- `dopamiles-journal.css:353, 433, 463, 579, 597, 678, 709` — verify each → swap if text
- `dopamiles-home.css:52, 84, 120, 152, 263, 303, 414, 443, 492, 550, 628` — verify each → swap if text
- `dopamiles-account*.css`, `dopamiles-components.css`, `dopamiles-feedback.css`, `dopamiles-3pack.css`, `dopamiles-pages-static.css`, `dopamiles-utility.css`, `dopamiles-journal-article.css` — walk each per Phase 00 audit

For DECORATIVE-italic-em rows (e.g., `dopamiles-pdp.css:516 em`, `dopamiles-journal-article.css:316 h2 em`): leave on `--dop-accent`.

For `.dop-stars` at `dopamiles-pdp.css:651`: if star icon is rendered as a glyph color, KEEP `--dop-accent` (visual brand). If it's text reading "★★★★☆" then SWAP. Inspect rendered DOM in DevTools to decide.

### Step 5 — Bug #14b: 404 art tag (white-on-orange)

`assets/dopamiles-utility.css` (line 194):

```css
/* BEFORE */
.dop-404-art-tag {
  background: var(--dop-accent);
  color: #fff;
}

/* AFTER */
.dop-404-art-tag {
  background: var(--dop-ink);  /* dark bg, white text passes 4.5:1 */
  color: #fff;
}
```

### Step 6 — Bug #14c: split photo tag (rgba over photo)

`assets/dopamiles-home.css` (around line 417):

```css
/* BEFORE */
.doh-split-photo-tag {
  color: rgba(255,255,255,.45);
  /* ... */
}

/* AFTER */
.doh-split-photo-tag {
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,.55), 0 0 1px rgba(0,0,0,.4);
  /* ... */
}
```

### Step 7 — Re-run axe sweep (against deploy-confirmed preview)

Pre-condition: Phase 00 Step 6 deploy command ran; preview reflects HEAD.

After edits, re-run sweep harness on the affected pages:
- `/` (home)
- `/products/{any}` (PDP)
- `/collections/all` (collection)
- `/blogs/journal` (journal)
- `/404` (utility)
- Account pages if reachable in preview (login required)

Target: 0 axe color-contrast violations on these selectors. 0 axe missing-role on `.dop-stars`.

### Step 8 — Verify newly-flagged audit items

Per round-1 plan note, also audit `.dop-footer-col__heading` and `.dop-btn` contrast. If they fail axe, add to this phase or note for round-3-or-future.

## Todo Checklist

- [x] Phase 00 Step 2 audit table consumed
- [x] `dop-stars` snippet has `role="img"` — Bug #13 FIXED; Gate 1.4 axe confirms 0 role-aria violations
- [x] `dopamiles-shared.css` safety-net rule simplified to `var(--dop-low)`; dead-token reference removed
- [x] `dopamiles-pdp.css:145` `.dop-eyebrow` → `var(--dop-low)` — and all per-template text rows (51 lines across 12 files)
- [x] `dopamiles-collection.css:59` and other text rows → `var(--dop-low)`
- [x] `dopamiles-journal.css` text rows → `var(--dop-low)`
- [x] `dopamiles-home.css` text rows → `var(--dop-low)`
- [x] `dopamiles-account*.css` text rows → `var(--dop-low)`
- [x] `dopamiles-components.css`, `dopamiles-feedback.css`, `dopamiles-3pack.css`, `dopamiles-pages-static.css`, `dopamiles-utility.css`, `dopamiles-journal-article.css` text rows → `var(--dop-low)`
- [x] Italic display em accents preserved on `--dop-accent` — verified Gate 2 code-reviewer spot-checks
- [x] `.dop-404-art-tag` (utility.css) bg → `var(--dop-ink)`
- [x] `.doh-split-photo-tag` (home.css) solid white + scrim
- [x] Grep sweep — 0 remaining `color: var(--dop-accent)` on small-text elements — Bug #14 FIXED
- [x] axe-core re-sweep on 5+ affected pages — **0 contrast violations** (down from 46) — Gate 1.4 PASS
- [x] axe-core re-sweep on PDP — **0 missing-role** on `.dop-stars` (down from 10 role-aria) — Gate 1.4 PASS
- [x] `.dop-footer-col__heading` + `.dop-btn` contrast checked, fixed or noted — no new failures; carried forward observation
- [x] **COMPLETED** 2026-05-09 13:15 — commits `47177bf` + `ae141f8` (reviewer nits fixed; full sweep verified -100%)

## Success Criteria

- 0 axe-core violations on the 5 round-1-flagged selectors (post-fix).
- Visual: orange accent still recognizable on home + PDP `<em>` italic accents.
- Visual: large display headings keep warmer accent (no over-darkening).
- 404 page tag still visible/readable on dark bg.
- Home photo split tag readable on any photo background.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `--dop-low` (#C84A2A) too dark on some surfaces | Low | Low | A/B with stakeholder; tune toward #D4501F if needed (still passes AA) |
| Some `var(--dop-accent)` text uses missed in audit | Med | Med | Phase 00 Step 2 produces complete table; re-sweep harness catches strays; iterate |
| 404 tag dark bg clashes with surrounding orange artwork | Low | Low | Visual check; if jarring, use `#7A2D17` (darker accent) instead of `--dop-ink` |
| Text-shadow on `.doh-split-photo-tag` looks heavy on light photos | Low | Low | Tune shadow opacity; readability > flat aesthetic |
| Removing dead-token `var(--dop-accent-text, #C84A2A)` reveals reliance elsewhere | Low | Low | Grep `--dop-accent-text` across repo before deletion (expect 0 hits outside shared.css) |
| Footer column heading + .dop-btn contrast fails — adds scope | Low | Med | If failures found, fix in this phase or branch follow-up |
| Per-template file edits create rebase conflicts in parallel work | Low | Low | Phase 04 runs after Phase 03 (file ownership) and serially; no conflict |

## Security Considerations

None — visual/CSS-only changes. No content, no input, no data.

## Next Steps

- Phase 05 verification depends on this phase done.
- Follow-up: post-publish, audit all `var(--dop-accent)` text uses across theme to standardize on `--dop-low` for consistency (this phase covers the immediate axe failures; full sweep can run as cleanup).
- Follow-up: consider renaming `--dop-low` to `--dop-accent-text` token alias for semantic clarity (cosmetic, not load-bearing).
