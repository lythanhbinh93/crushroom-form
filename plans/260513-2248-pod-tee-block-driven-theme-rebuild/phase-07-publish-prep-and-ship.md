# Phase 07 — Publish prep + ship

**Status:** pending
**Owner:** code + user (real-device QA, publish trigger)
**Effort:** 2-4h
**Depends on:** Phases 01-05 (Phase 06 optional)
**Gate:** real-iPhone full-funnel QA + user approval

## Goal
Fix the 2 flagged JS bugs from 2026-05-13 QA, run full theme-check + theme-editor test, write rollback runbook, real-iPhone QA pass, swap live theme on dopamiles.co from BuildMyPOD to pod-tee.

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

### Full-funnel real-iPhone QA
User runs:
- Home → click product → PDP → ATC → cart drawer → cart page → checkout button (don't pay)
- Each filter/sort on collection page
- Newsletter signup
- Each accordion expand on PDP
- Each bundle tier (2/3/5-pack)
- Globo swatches if installed

### Publish
- Shopify Admin → Themes → pod-tee preview → "Publish"
- Confirm DNS resolves correctly
- BuildMyPOD demotes to library (rollback available)

## Implementation steps
1. Fix #1 in `dopamiles-pdp-variant-sync.js`
2. Fix #2 in `dopamiles-cart-main.liquid` (delete dup script tag)
3. Theme check pass
4. Theme editor full pass: customize each template, verify saves
5. Write `docs/publish-rollback-runbook.md`
6. Push to preview
7. Re-run emulated QA (qa-script.mjs from 2026-05-13 report path) — both errors should be gone
8. **User: real-iPhone full-funnel QA** — gate
9. **User: publish via Shopify Admin** — final action

## Todo
- [ ] Fix `amount is not defined` in `dopamiles-pdp-variant-sync.js`
- [ ] Delete duplicate script tag in `cart-main.liquid:234`
- [ ] `shopify theme check` — baseline preserved
- [ ] Write `docs/publish-rollback-runbook.md`
- [ ] Push to preview theme 158279991548
- [ ] Re-run emulated QA — verify 2 JS errors gone
- [ ] Code-reviewer subagent pass (last line of defense)
- [ ] **User action: real-iPhone full-funnel QA**
- [ ] **User action: publish via Shopify Admin → Themes → Publish**
- [ ] Post-publish: 30-min smoke (home, PDP, ATC, cart, checkout button — all 200 / no console errors on dopamiles.co)
- [ ] Mark plan as `completed` in frontmatter

## Success criteria
- 2 JS bugs eliminated (emulated QA shows zero pageerrors + zero `dopCartHelpers not loaded` warnings)
- Theme check baseline preserved
- Rollback runbook exists and is tested (at least mentally walk through)
- Real-iPhone QA passes
- dopamiles.co live theme is pod-tee, BuildMyPOD demoted to library
- Post-publish 30-min smoke pass

## Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Publish reveals issue not caught by preview QA | High | BuildMyPOD stays in library — instant rollback via Admin |
| DNS / Cloudflare cache shows stale BuildMyPOD content to some users after publish | Medium | Wait 5-10 min before declaring success; check from incognito + multiple regions |
| Real-iPhone QA finds new bug at this stage | High | Halt publish, file as bug, address before re-attempting. Don't push through. |
| Customer in mid-checkout during swap | Low | Shopify handles atomically; carts persist via cookie |
| Globo / FB Pixel breaks after swap | Medium | Re-test third-party app integrations within first 30 min post-publish |
| 30-day Dawn-backup rollback files trigger merchant confusion | Low | Already documented in README; under `docs/` not `templates/` |

## Halt rule
If real-iPhone QA finds ANY blocker → halt + don't publish + file bug + scope a Phase 08 fix. Do not push through.

## Post-publish
After 30-min smoke pass:
- Mark plan `status: completed` in `plan.md`
- Mark `funnel-reset` `status: completed` (its publish goal achieved)
- Run `/ck:journal` for the publish day
- Save memory: `pod-tee-theme-shipped-to-dopamiles-co` if any lessons emerge

## End of plan.
