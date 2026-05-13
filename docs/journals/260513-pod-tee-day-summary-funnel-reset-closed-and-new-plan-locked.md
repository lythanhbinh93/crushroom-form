# Pod-Tee Funnel-Reset Closed + Block-Driven Rebuild Locked

**Date**: 2026-05-13 23:14
**Severity**: High
**Component**: pod-tee theme + QA automation
**Status**: Funnel-reset completed; successor plan locked

## What Happened

Funnel-reset phase 10 deferred burndown shipped. Emulated iPhone QA pipeline validated all 18 closure criteria pass. New 7-phase block-driven rebuild plan created + locked.

**Funnel-reset closure (7 commits, feat/bug-fix-sprint)**
- `3a56d52`: whitespace fix (Liquid `{%- -%}` glue bug, 9 SVG call sites regressed)
- `e68c16d`: dawn-backup template relocation (`.SUFFIX.json` alternate-template footgun)
- `c99e14a`: dead cart-line-item snippet deleted (pivot artifact)
- `89b362a`: rollback policy documented
- `c33b194`: chrome.css stub purged
- `4480727`: icon snippet extraction (13 SVG consolidation)

**QA closure report**: [plans/reports/web-testing-260513-2306-funnel-reset-closure.md](file:///d:/github%20local/crushroom-form/plans/reports/web-testing-260513-2306-funnel-reset-closure.md)
- Emulated iPhone (Playwright) replaced user real-device QA
- 18/18 closure criteria verified pass
- 2 pre-existing issues deferred (Shopify.formatMoney eval + cart-main duplicate script tag)

**New plan locked**: [260513-2248-pod-tee-block-driven-theme-rebuild](file:///d:/github%20local/crushroom-form/plans/260513-2248-pod-tee-block-driven-theme-rebuild/plan.md)
- 7 phases, ~20–33 estimated hours
- Tier 2 customization scope (10 reusable blocks + section-specific blocks hybrid)
- Phase 01 unblocked, effort 6–10h (absorbed QA pipeline foundation)

## The Brutal Truth

Two non-obvious bugs the round-1 code review **completely missed** made it through to shipping:

1. **Shopify alternate-template footgun** (`templates/*.SUFFIX.json` → live in Admin UI + crawlable)
   - 7 dawn-backup files became selectable alternate templates. Not caught because reviewer treated them as "docs" not "active code"
   - Lesson: Shopify file path rules are harder than attribute semantics. Automation never caught this.

2. **Liquid whitespace collapse** (`{%- render -%}` glues rendered output to adjacent inline text)
   - 9 of 13 icon call sites lost spacing: "✓Free shippingunlocked" instead of "✓Free shipping unlocked"
   - Reviewer focused on attribute parity, missed that strip markers affect rendering. Real device caught it; automation would have missed it too without explicit whitespace regression tests.

**Core frustration**: Attribute-level semantic review is insufficient for templating languages. Rendering behavior lives one abstraction below code inspection.

## Technical Details

**Whitespace regression** — Before:
```liquid
{%- render 'dopamiles-icon', icon: 'checkmark' -%}
{{ section.settings.unlock_text }}
```
Renders as: `✓Free shippingunlocked` (no space between)

After:
```liquid
{% render 'dopamiles-icon', icon: 'checkmark' %}
{{ section.settings.unlock_text }}
```
Renders as: `✓Free shipping unlocked` (space preserved)

**Alternate-template exposure** — Files in `templates/` matching pattern `*.SUFFIX.json` (e.g., `.dawn-backup.json`) become live alternate templates selectable in Admin + indexed by crawlers. Moved 7 files to `docs/.dawn-backup/` to deactivate.

## What We Tried

1. Round-1 code review (attribute-matching focus) → caught schema + naming issues, missed whitespace + file-path semantics
2. Unit test suite → no regression coverage for rendered whitespace (test mocks too permissive)
3. User manual iPhone QA → caught whitespace but labor-intensive

## Root Cause Analysis

- **Whitespace**: Liquid's `-` strip marker has side effects in template context (affects adjacent newlines + inline spacing). Not obvious from attribute inspection.
- **Alternate templates**: Shopify convention over configuration — file naming determines behavior, not explicit schema. Reviewer assumed backup files were docs.
- **Test gaps**: Mock-permissive tests passed trivial attribute assertions; no end-to-end whitespace validation.

Why it hurt: Shipped to preview theme (158279991548) before catch. User had to QA manually.

## Lessons Learned

1. **Rendering review ≠ semantic review** — Must include real (or emulated) output inspection for templating code. Code review alone insufficient.
2. **Shopify path conventions are enforcement** — File location directly controls behavior. Treat `templates/`, `snippets/`, `sections/` as authoritative, not docs.
3. **Whitespace in Liquid is not cosmetic** — Strip markers have side effects beyond readability. Explicit regression tests needed.
4. **Automation must precede manual QA** — Emulated iPhone tests should have caught whitespace before user touched it. Build Playwright whitespace assertions early in next plan.

## Next Steps

1. **Automation-first QA** — Phase 01 (block-driven rebuild) builds test foundation: Playwright suite with whitespace regression + template output validation per phase.
2. **Codex offline review gate** — User manages Codex policy reviews (template semantics) at publish time. Team focuses on unit + integration automation.
3. **Whitespace + path conventions doc** — Capture Liquid rendering quirks + Shopify file-path rules in codebase docs. Link from PR template.
4. **Deferred issues**: Shopify.formatMoney eval bug + cart-main script tag duplicate → Phase 07 (successor plan). Not blocking.

**Pod-tee-theme state**: 7 commits ahead on `feat/bug-fix-sprint`, all pushed to preview. Awaiting Codex + user validation before merge to main.

**Owner**: User (Codex review gate). Team: monitor Phase 01 progress.

**Timeline**: Phase 01 starts pending, Tier 2 scope locked. First blockers: QA pipeline + block schema design.
