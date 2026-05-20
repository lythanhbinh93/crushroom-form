---
date: 2026-05-20
project: pod-tee-theme
branch: feat/pdp-perf-pareto
commits:
  - 0dc95b0 feat(pdp): wire bundle banner above ATC
plan: plans/260520-1010-pod-tee-cart-drawer-offer-revamp/
related-journals:
  - 260520-pod-tee-cart-drawer-offer-revamp-shipped.md (original 4-phase cart-drawer ship)
  - 260520-pod-tee-cart-drawer-qa-iteration-shipped.md (14-commit QA iteration + Section Rendering API gotchas)
qa-report: plans/reports/phase-05-qa-results.md
tags: [shopify, theme, pod-tee, pdp, bundle-discount, qa-delegation, agent-browser-skill, snippet-wiring, code-quality-pattern]
---

# Pod-tee PDP bundle banner wire-up — Phase 5 QA → PDP-1 fix → app retirement

## Outcome

Phase 5 QA matrix (24+ scenarios) delegated to a `general-purpose` agent driving live storefront via `agent-browser` skill completed in ~30 min with 18/19 PASS. Single fail: **PDP-1** — the `dopamiles-bundle-banner.liquid` snippet existed in the codebase since an earlier phase but was never `{% render %}`'d anywhere, so the "More tees, more savings" CTA banner never appeared on the product detail page above the Add-to-Cart button. One-line fix deployed. Bundle app (`dopamiles-bundle-app`) then uninstalled from merchant's Shopify admin (no hosting cost — fly.io trial had expired). Theme now reads end-to-end with zero app dependencies for bundle discount UX.

## What I shipped

**Commit `0dc95b0`**: `{% render 'dopamiles-bundle-banner', product: product %}` inserted in `sections/dopamiles-product-hero.liquid` between the `.dop-price-row` closing tag and the `<product-form>` wrapper opening tag. The snippet itself handles the eligibility guard: inner conditional `{% if product.collections contains 'bundle-eligible' %}` gates rendering. No wrapper conditional needed; the banner self-hides if the product isn't tagged for bundles.

Result: PDP now displays a clickable "More tees, more savings" CTA above the standard ATC form, linking to the 3-pack stack-save tier cards. Closes PDP-1 + unblocks Phase 5 sign-off.

## What worked

**Browser-agent QA delegation**: Ran 24 scenarios across cart, PDP, collection cards, checkout in ~30 min of agent time vs. an estimated 90+ min of manual spot-checking. The agent methodically walked the matrix, took screenshots, and caught PDP-1 via grep when I asked "does `dopamiles-bundle-banner` get rendered anywhere?" Report at `plans/reports/phase-05-qa-results.md` with screenshot set in `plans/reports/phase-05-screenshots/`.

Pattern worth repeating: QA-heavy phases with a discrete test matrix (go through N paths on X surfaces) are ideal for browser-agent delegation. Human QA works better for exploratory edge cases; agent QA excels at matrix coverage.

## What didn't work / pattern caught

**Snippet-without-render-call is a code-quality blind spot.** The `dopamiles-bundle-banner.liquid` file lived in the repo since phase 3 (the bundle discount pivot) but was never wired up. No build-time warning, no test failure. It only surfaced during manual QA when the banner didn't appear.

Lesson: When adding a new snippet, follow-up with grep for at least one `{% render %}` reference before marking the feature shipped. This pattern belongs in the code-review checklist for future Shopify theme PRs. For this session: will add a note to the project's code-standards doc that "Snippets without inbound `{% render %}` references are likely dead code."

## User-driven shortcut paths sometimes work fine

I'd proposed a 6-step bundle-app retirement sequence (deactivate Function discount → test → backup metafield → check metafield seed → verify app machine state → uninstall). User skipped steps 1-4 and went straight to uninstall.

Worked fine. The Shopify uninstall removed the Function discount cleanly; all user data (shop metafields, `bundle-eligible` tags, smart collection) persisted. The user also tried to suspend the fly.io app machines but the trial had expired so machines were already shutdown (zero hosting cost, no action needed).

Not every safety sequence needs to be invoked. The user had enough context to know the abbreviated path was safe. Don't over-correct for next time — the proposed steps were right for a generic case; this user just didn't need them.

## What's next

- **Phase 5 manual QA complete**: All 19 scenarios now PASS. Bundle discount surfaces (cart drawer + PDP + collection cards) unified on "save / saved" tone. Section Rendering API gotchas surfaced, documented, and fixed (recorded in prior session journal).
- **No remaining code tasks**: All cart-drawer phases + PDP wire-up complete. Bundle discount architecture migrated to Shopify native + live theme. Copy revision complete across 4 surfaces.
- **Branch shipped to remote**: 16 commits total (1 original 4-phase cart ship + 14-commit QA iteration + 1-commit PDP wire) tested + QA-passed + pushed to `origin/feat/pdp-perf-pareto`. Draft theme `dopamiles-bundle-prod-260508` running latest. Publish swap to live theme is user's call.

## Lessons in context (cross-cutting)

- **Dead-code pattern for Shopify snippets**: If it doesn't have an inbound render call, it's not executing. Audit new snippet additions via grep before shipping.
- **Browser-agent scaling for discrete QA matrices**: Excellent ROI for 20+ scenario cases; poor ROI for exploratory or edge-case-heavy QA.
- **External service trial expiry as implicit cost control**: No explicit suspend action needed. Acknowledge but don't build processes around it.
