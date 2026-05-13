# 260513 — pod-tee Phase 10 Deferred Burndown Shipped

**Date:** 2026-05-13 (15:25 → 22:00 ICT)
**Plan:** [`plans/260511-1132-pod-tee-funnel-reset/phase-10-tail-cleanup.md`](../../plans/260511-1132-pod-tee-funnel-reset/phase-10-tail-cleanup.md)
**Repo:** `D:\github local\pod-tee-theme` · branch `feat/bug-fix-sprint`
**Outcome:** Phase 10 fully code-complete. 6 commits shipped to preview theme `158279991548`. Two non-obvious bugs caught by adversarial review (only one was caught by first-pass review).

## What shipped

| Commit | Type | Summary |
|---|---|---|
| `4480727` | refactor | Extract 13 SVG call sites → new `dopamiles-icon.liquid` snippet |
| `c33b194` | chore | Delete deprecated `dopamiles-chrome.css` stub + fix BRAND-ASSETS.md stale refs |
| `89b362a` | docs | Add README `.dawn-backup.json` rollback policy *(superseded by `e68c16d`)* |
| `c99e14a` | chore | Delete dead `dopamiles-cart-line-item.liquid` (pivot from #48 plan) |
| `e68c16d` | fix | Relocate 7 `templates/*.dawn-backup.json` → `docs/templates-dawn-backup/*.json` |
| `3a56d52` | fix | Restore whitespace between icon snippet and adjacent inline text (9 sites) |

Net diff: ~55 insertions, ~158 deletions. Dead code purged: 127 LOC (113 cart-line-item snippet + 14 chrome.css stub). 13 inline SVG duplicates consolidated to one snippet.

## Pivots from the original phase plan

### #48 cart-line-item refactor → snippet deletion

Phase plan called it as "REFACTOR (DRY) — promote snippet to canonical, refactor cart-drawer + cart-main to use it." On inspection the snippet had **zero callers** anywhere (sections, JS, JSON templates). cart-drawer + cart-main render line items inline with intentional server-side bundle-child rendering inside the parent block — the snippet expected JS to populate children. Refactor would have **regressed SSR for bundle children**.

Decision: delete the dead snippet instead. DRY achieved by removing duplicate, not by consolidating into a snippet whose semantics didn't match the call sites. Phase plan's recommendation was made without inspecting both sides.

## Two bugs caught by adversarial review

### Bug 1 — Shopify alt-template footgun (caught in round-2 code review)

Commit `89b362a` (README) was BLOCKed by code-reviewer with the finding: files named `templates/*.SUFFIX.json` are **not ignored by Shopify** — they register as live **alternate templates** with suffix `SUFFIX`, selectable via Admin → Theme template dropdown and reachable at `?view=SUFFIX`. The 7 `.dawn-backup.json` "rollback" files had been live alternate templates on the preview theme since the original Wave-1 port. Merchant misclick or bot crawler would regress the storefront to Dawn defaults at any time.

Fix (`e68c16d`): relocated all 7 files out of `templates/` into `docs/templates-dawn-backup/`. Shopify CLI only uploads from `templates/`, `sections/`, `snippets/`, `assets/`, `layout/`, `config/`, `locales/`, `blocks/` — files under `docs/` are inert. Subsequent `shopify theme push` (default behavior deletes remote files not in local) auto-cleaned the 7 alt-templates from preview theme `158279991548` during the "Cleaning your remote theme" phase.

Memory saved: `shopify_dawn_backup_alt_template_footgun.md`.

### Bug 2 — Liquid whitespace strip (caught in adversarial ultrathink review)

Round-2 reviewer passed commit `4480727` (icon snippet) with "PASS_WITH_NOTES — semantically identical to inline originals" after verifying snippet param values matched original SVG attributes (size, stroke, class, aria). That check did **not trace Liquid whitespace control**.

My snippet refactor used `{%- render -%}` (whitespace strip on both sides). In the original code the SVG and adjacent inline text (`<b>`, plain text) sat on separate lines — the newline+indent HTML-collapses to a single rendered space. Stripping the whitespace glued the SVG directly to the next inline child:

| Site | Rendered before | Rendered after my refactor |
|---|---|---|
| cart-drawer free-ship row | ✓ Free shipping unlocked. | ✓Free shipping unlocked. |
| cart-main summary row | ✓ Free shipping unlocked. | ✓Free shipping unlocked. |
| collection-grid filter button | Filter ▼ | Filter▼ |
| gift-card copy success | ✓ Copied! | ✓Copied! |
| password submit success | ✓ You're in. | ✓You're in. |
| bundle-cart-headline × 4 | ✓ $X off each | ✓$X off each |

9 of 13 call sites regressed. 4 sites were safe (accordion chevrons positioned via CSS `.chev` class, contact success icon as sole child of its container).

Fix (`3a56d52`): switched the 9 affected sites to non-stripping `{% render %}`. Lesson: **"semantically identical attributes" ≠ "renders identically"** — whitespace control is a separate audit axis. Memory saved: `feedback_liquid_whitespace_strip_inline_text.md`.

## What the first-pass review missed and why

The round-1 sweep-style code reviews on phases 06-10 (5 commits before today) were attribute-matching reviews. They verified call sites preserved every attribute of the original. The cost of that focus: whitespace was treated as cosmetic noise.

The round-2 review caught the dawn-backup bug because the reviewer thought about *what Shopify does with files* (architectural awareness) rather than just diff equivalence. The whitespace bug only surfaced when I did my own ultrathink trace through Liquid's `{%- -%}` semantics — neither reviewer caught it because both were operating in attribute-equivalence mode.

Takeaway: refactors of inline-render extractions deserve a dedicated "rendered-output" pass, not just attribute matching. Could be as simple as a real-device check of one representative site before bulk-replace. Cheaper than catching it in user QA after live ship.

## Pre-publish blockers remaining

1. **User iPhone QA** on preview theme `158279991548` covering phases 06-10 + today's whitespace fix → unblocks publish to `dopamiles.co` live.
2. No other code blockers identified by reviewers or theme check (11 errors / 38 warnings baseline preserved — all pre-existing, none from today's commits).

## Tomorrow's plan

- Wait on iPhone QA result. If PASS → ready to publish (theme swap from BuildMyPOD to pod-tee on live store).
- If FAIL → triage specific issues, halt 1-iteration rule applies.
- Parallel work options while waiting: pod-dashboard P2 phase-07 soak-and-ship (3-4h) or bundle-admin Remix PROD smoke (<1h).

## References

- Code review reports: `plans/reports/code-reviewer-260511-1842-phase-10-tail-sweep.md` (round 1), `plans/reports/code-reviewer-260513-1530-phase-10-deferred-burndown.md` (round 2)
- Memory updates: `shopify_dawn_backup_alt_template_footgun.md`, `feedback_liquid_whitespace_strip_inline_text.md`
- Shopify docs traced today: https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates · https://shopify.github.io/liquid/basics/whitespace/
