---
phase: 4
title: "Live-DOM test gate and ship"
status: complete
priority: P1
effort: "2-3h"
dependencies: [3]
---

# Phase 4: Live-DOM test gate and ship

## Overview
Mandatory verification gate on a real rendered theme (agent-browser, cookies carried), then ship to the live BeachNapClub V1.0 theme with a rollback path. No code reaches the live theme until every acceptance check passes on preview.

## Requirements
- Functional: all whole-plan success criteria verified on a live-rendered preview before push.
- Non-functional: zero customer impact during verification; reversible deploy.

## Architecture / Test matrix
Verify on preview (theme dev or unpublished preview theme) using `agent-browser` (carries admin/preview cookies — curl/unauthenticated fetch silently serves the LIVE theme and must NOT be used for verification):

| Case | URL | Expected |
|------|-----|----------|
| Pin + variant | `/collections/sale?first=H&variant=V` | H is card #1; shows V color image; link has `?variant=V` |
| Pin no variant | `/collections/sale?first=H` | H is card #1; default image; no error |
| Dormant | `/collections/sale` | grid identical to baseline; no network from module; no console output |
| Bad handle | `/collections/sale?first=does-not-exist` | no-op; no error |
| Product off-page / paginate | pin + scroll to load more | no duplicate of H; H stays #1 |
| Locale | `/en/collections/sale?first=H` (if locale active) | handle resolves; pin works |
| Reduced motion / mobile | mobile viewport | image swap still correct; no layout break |

Capture screenshots + `getBoundingClientRect`/DOM assertions for each. Record results in `reports/phase-04-verification.md`.

## Related Code Files
- Modify (only if tests surface fixes): `tytkwe-qe-theme/assets/curated-pin.js`, `sections/main-collection.liquid`
- Create: `reports/phase-04-verification.md`

## Implementation Steps
1. Start `shopify theme dev` or push to an unpublished preview theme; get authenticated preview URL.
2. Run the full test matrix via agent-browser; fix any failures (loop back to Phase 2/3 as needed). If variant-image swap can't be made reliable on real products → **ship reorder-only v1** (correct product #1 + `?variant=` link, default image) and file variant-image as a fast-follow; do not block the pin. <!-- Updated: Validation Session 1 - reorder-only fallback ship -->
3. **Pre-push prerequisite:** create `.shopifyignore` (theme currently has none) listing `config/settings_data.json`, `sections/*.json`, `templates/*.json`, `locales/*.json` so the push never overwrites merchant theme-editor settings. <!-- Updated: Validation Session 1 - add .shopifyignore first -->
4. `git add` + commit the changed files with a clean conventional message (no AI refs, no plan/phase refs in code or commit) on a feature branch.
5. Push code **direct to the live** BeachNapClub V1.0 theme (`#141574930516`) — `shopify theme push` needs interactive confirmation for live; `.shopifyignore` now guards merchant JSON. (Direct-to-live is safe: dormant without `?first=`.)
6. Smoke-test the live ad URL once after push; confirm dormant organic browsing unaffected.
7. Document rollback: `git revert` + re-push, or restore from the baseline commit; keep prior theme state recoverable.

## Success Criteria
- [ ] Every test-matrix row passes on preview (screenshots + DOM assertions in report).
- [ ] No console errors in any case; dormant case shows zero module activity.
- [ ] Committed on a feature branch with a clean message; pushed to live theme.
- [ ] Live ad URL smoke test passes; organic browsing unchanged.
- [ ] Rollback path documented and verified recoverable.

## Risk Assessment
- Do NOT verify via curl/unauthenticated fetch against preview (serves live theme silently). agent-browser only.
- Live push overwrites theme files; confirm `.shopifyignore` covers merchant JSON (`config/settings_data.json`, `sections/*.json`, `templates/*.json`) before push.
- If variant-swap proves unreliable on real products at this gate, ship reorder-only (still satisfies "card #1" + link `?variant=`) and iterate variant-image as a fast-follow rather than blocking the pin.
