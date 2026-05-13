# Phase 07 — Publish prep + ship

**Status:** pending
**Owner:** code (automated QA + code prep), user (Codex review + publish trigger)
**Effort:** 2-4h code work + Codex review time (user-managed, async)
**Depends on:** Phases 01-05 (Phase 06 optional)
**Gate:** Full automated regression suite passes + **Codex manual code review (user runs offline)** + user publish trigger

## Goal
Fix the 2 flagged JS bugs from 2026-05-13 QA, run full theme-check + theme-editor test, write rollback runbook, run full automated regression QA (all 7 phase suites cumulative), hand code to Codex for manual review, then user swaps live theme on dopamiles.co from BuildMyPOD to pod-tee.

## QA gate revision (2026-05-13 23:00 ICT)

Original plan called for "real-iPhone full-funnel QA" as the publish gate. **Replaced** with:
1. **Automated full-regression** — run all 7 phase QA suites cumulatively (`node qa/run-all.mjs` or equivalent). Zero P0 failures, P1 flags reviewed.
2. **Codex manual code review** — user takes the code (this branch's diff or the whole pod-tee-theme tree) and feeds it to Codex for analysis. Codex reports issues; user triages.
3. **User publishes** — once Codex sign-off received, user triggers theme swap via Shopify Admin.

**Removed:** the 5-min real-iPhone spot-check that earlier draft proposed. User explicitly delegating all manual QA. Residual risk of Safari-only rendering bugs is accepted; rollback runbook is the recovery path if a bug slips through.

## Pre-publish fixes

### Fix #1 — `amount is not defined` pageerror
**Source:** `assets/dopamiles-pdp-variant-sync.js:48` — passes `'${{amount}}'` to `window.Shopify.formatMoney` which is likely overwritten by a third-party app (Globo?) with an `eval`-based variant.

**Fix:** Skip `Shopify.formatMoney` entirely; always use local switch implementation at lines 51-71.

```js
function fmtMoney(cents) {
  var format = window.shopMoneyFormat || '${{amount}}';
  // SKIP Shopify.formatMoney — local impl always safe + doesn't rely on app overwrites
  var placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
  var match = format.match(placeholderRegex);
  if (!match) return format;
  var value;
  switch (match[1]) {
    case 'amount': value = formatWithDelimiters(cents, 2); break;
    // ... rest of switch
  }
  return format.replace(placeholderRegex, value);
}
```

Estimated effort: 15-30 min.

### Fix #2 — cart-main script-order
**Source:** `sections/dopamiles-cart-main.liquid:234` has a duplicate `<script src="dopamiles-cart.js" defer></script>` that executes BEFORE theme.liquid's helpers.js due to document order. Cart-main qty +/- likely broken.

**Fix:** Delete the duplicate script tag (theme.liquid already loads cart.js with correct ordering after helpers.js + mutations.js).

```liquid
- <script src="{{ 'dopamiles-cart.js' | asset_url }}" defer></script>
```

Estimated effort: 5 min.

## Publish prep

### Theme check
```sh
shopify theme check
```
Must return baseline (11 errors / 38 warnings) — zero new errors from Phases 01-06.

### Rollback runbook
Document in `docs/publish-rollback-runbook.md`:
- How to revert to BuildMyPOD if pod-tee fails post-publish
- Use `docs/templates-dawn-backup/*.json` (relocated 2026-05-13) for individual template rollback
- Shopify Admin: Themes → Library → Publish previous theme (BuildMyPOD stays in library)
- DNS/cache TTL considerations

### Full automated regression
Run `node qa/run-all.mjs` (orchestrator that invokes phase-01.mjs through phase-06.mjs cumulatively). Output:
- Markdown report: `qa/reports/full-regression-{date}.md`
- Exit 0 = ready for Codex
- Exit 1 = halt, fix, re-run

Expected to pass:
- Zero P0 failures across all 7 viewport×phase combinations
- P1 flags reviewed by user before proceeding (none should be present if Phases 01-06 cleanly shipped)

### Codex manual code review (user-managed)
1. User generates diff: `git diff main...feat/bug-fix-sprint > /tmp/pod-tee-diff.patch` (or use GitHub PR view)
2. User feeds diff (or entire `pod-tee-theme` source tree) to Codex
3. Codex reports issues (security, logic, maintainability, performance, anti-patterns)
4. User triages Codex findings:
   - Critical → file as bugs, fix, re-run automated QA, re-submit to Codex
   - Important → fix in Phase 07 fix cycle if scope permits
   - Nitpick → log for future iteration, ship anyway
5. Iterate until Codex sign-off

### Publish
- Shopify Admin → Themes → pod-tee preview → "Publish"
- Confirm DNS resolves correctly
- BuildMyPOD demotes to library (rollback available)
- Post-publish 30-min smoke (automated `qa/run-all.mjs --target=live` against dopamiles.co)

## Implementation steps

### Code prep (assistant-side)
1. Fix #1 in `dopamiles-pdp-variant-sync.js` (skip Shopify.formatMoney, always use local switch)
2. Fix #2 in `dopamiles-cart-main.liquid` (delete duplicate script tag at line 234)
3. `shopify theme check` — verify baseline preserved (11/38)
4. Write `docs/publish-rollback-runbook.md`
5. Update `qa/` — add `qa/run-all.mjs` orchestrator + `qa/phase-07.mjs` (verifies both bugs gone)
6. Run `node qa/phase-07.mjs` → confirms both flagged JS errors eliminated
7. Run `node qa/run-all.mjs` → full regression across all 7 phases
8. Commit + push to preview theme

### Codex review (user-managed, async)
9. User feeds branch diff or full source tree to Codex
10. User triages findings
11. Fix-cycle loop if needed (assistant fixes critical issues → re-run QA → re-submit to Codex)
12. Codex sign-off

### Publish (user-triggered)
13. User: Shopify Admin → Themes → pod-tee → "Publish"
14. Assistant: run `node qa/run-all.mjs --target=live` against dopamiles.co (post-publish smoke, 30 min)
15. Mark plan `status: completed`

## Todo

### Assistant code work
- [ ] Fix `amount is not defined` in `dopamiles-pdp-variant-sync.js`
- [ ] Delete duplicate script tag in `cart-main.liquid:234`
- [ ] `shopify theme check` — baseline preserved (11/38)
- [ ] Write `docs/publish-rollback-runbook.md`
- [ ] Write `qa/phase-07.mjs` (verifies 2 JS bugs gone + cumulative regression)
- [ ] Write `qa/run-all.mjs` (orchestrator)
- [ ] Run `node qa/phase-07.mjs` — exit 0
- [ ] Run `node qa/run-all.mjs` — exit 0, full P0 pass
- [ ] Code-reviewer subagent pass
- [ ] Commit + push to preview theme 158279991548

### User-driven (Codex review)
- [ ] **User action: feed code to Codex for manual review**
- [ ] User triages Codex findings; assistant fixes critical issues if any
- [ ] Codex sign-off received

### Publish
- [ ] **User action: publish via Shopify Admin → Themes → Publish**
- [ ] Assistant: `node qa/run-all.mjs --target=live` against dopamiles.co post-publish
- [ ] Post-publish: 30-min monitoring (run smoke every 10 min × 3)
- [ ] Mark plan as `completed` in frontmatter
- [ ] Mark funnel-reset plan as `completed` (its publish goal now achieved)

## Success criteria
- 2 JS bugs eliminated (`qa/phase-07.mjs` shows zero `amount is not defined` pageerrors + zero `dopCartHelpers not loaded` warnings)
- Theme check baseline preserved (11/38)
- Full regression suite `qa/run-all.mjs` exits 0
- Rollback runbook exists at `docs/publish-rollback-runbook.md`
- **Codex review completed by user with sign-off**
- dopamiles.co live theme is pod-tee, BuildMyPOD demoted to library
- Post-publish 30-min automated smoke against live (`--target=live`) — zero new P0 failures

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Publish reveals Safari-only bug not caught by Chromium+WebKit emulation | **High** | BuildMyPOD stays in library — instant rollback via Admin. Residual risk accepted by user (no manual iPhone QA). |
| DNS / Cloudflare cache shows stale BuildMyPOD content to some users after publish | Medium | Wait 5-10 min before declaring success; assistant runs `qa/run-all.mjs --target=live` from multiple regions if possible |
| Codex review finds critical bug after assistant declared "ready" | High | Iterate: fix → re-run QA → re-submit. Don't push through. Plan budgets implicit time for ≥1 Codex round. |
| Codex review never completes (user defers indefinitely) | Medium | This is a process risk, not technical. Plan stays `pending` on Phase 07 until Codex sign-off received. |
| Customer in mid-checkout during swap | Low | Shopify handles atomically; carts persist via cookie |
| Globo / FB Pixel breaks after swap | Medium | Automated smoke includes Globo selector check; assistant flags if absent. User installs/re-installs apps post-publish if needed. |
| 30-day Dawn-backup rollback files trigger merchant confusion | Low | Already documented in README; under `docs/` not `templates/` |
| `qa/run-all.mjs --target=live` runs against PRODUCTION traffic and triggers analytics noise | Low | Add `?_qa=1` UTM param convention; document in `qa/README.md`. Or run from headless Playwright with `--no-pixel` flag. |

## Halt rule
If **automated QA P0 fail** or **Codex review identifies critical bug** → halt + don't publish + scope fix. Do not push through.

**Codex review IS a halting gate.** Even if automated QA passes, if Codex flags critical security or logic bugs, halt and fix.

## Post-publish
After 30-min smoke pass:
- Mark plan `status: completed` in `plan.md`
- Mark `funnel-reset` `status: completed` (its publish goal achieved)
- Run `/ck:journal` for the publish day
- Save memory: `pod-tee-theme-shipped-to-dopamiles-co` if any lessons emerge

## End of plan.
