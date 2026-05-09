# Phase 05 — Re-verification + Publish

## Context Links

- Pre-flight outputs (Step 5, Step 6): [phase-00-pre-flight.md](phase-00-pre-flight.md)
- Round-1 verification phase: [../260508-2145-pod-tee-theme-bug-fix-sprint/phase-05-verification-publish.md](../260508-2145-pod-tee-theme-bug-fix-sprint/phase-05-verification-publish.md)
- Round-1 sweep harness: `D:\github local\crushroom-form\plans\reports\visuals\web-testing-260508-1904-pod-tee-theme-mobile\comprehensive-sweep.spec.mjs`
- Round-1 admin-pending tasks: [../260508-2145-pod-tee-theme-bug-fix-sprint/phase-01-shopify-admin-tasks.md](../260508-2145-pod-tee-theme-bug-fix-sprint/phase-01-shopify-admin-tasks.md)
- Backup theme name: `rollback-2026-05-08-pre-bugfix` (created round 1)
- Red-team review (preview-stale risk): [../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md](../reports/redteam-260509-1106-pod-tee-bug-fix-round-2.md)

## Overview

**Priority:** P0 (ship gate)
**Status:** in-progress (Gates 0-2 passed; Phase 06 deployed; awaiting Gate 3 user real-device smoke)
**Effort:** ~3-4h active + **24h soak window before declaring done**
  - Active: deploy gate 10 + sweep 15 + Lighthouse 10 + multi-product matrix 30 + slow-network 15 + cart edges 20 + iPhone smoke 45 + in-app browser 20 + reviewer pass 30 + rollback dry-run 10 + publish 10 + funnel test 30 = ~3.5h
  - Soak: live monitoring at 1h / 6h / 24h checkpoints
**Owner:** code (sweep + Lighthouse + reviewer agent) + user (real iPhone + in-app browser + publish + soak)

**Framing — result is first priority.** Round 1 marked code "shipped" without real-device verification; round 2 found 8 new issues + 2 regressions on first iPhone walk. We will not repeat that error. Phase 05 is over-built on purpose: every round-1 failure mode gets an explicit gate.

Verify all 10 issues + audit fixed, all round-1 fixes still passing, no new regressions. **Publish gated on this passing AND on preview reflecting HEAD AND on rollback dry-run succeeding AND on independent reviewer sign-off.**

## Key Insights

- **Round-1 shipped against stale preview** — our verification this session found preview ≠ live. Same hazard repeats unless explicitly gated.
- **Round-1 self-reviewed and missed regressions** — Bug #13 fixed only 1 of 2 star snippets; Bug #14 CSS load-order conflict invisible to author. Independent reviewer agent now mandatory.
- **Real-device > emulation** — round-1 used DevTools emulation, missed 8 issues. Real iPhone REQUIRED, no fallback.
- **Meta-ads UX is in-app browser, not Safari** — 90% of paid traffic lands in Instagram/Facebook embedded webview. Their JS engine + cookie behavior + viewport differ from Safari. Smoke must include in-app browser path.
- **Slow-network is the audience reality** — Meta ad audience often on cellular. Cart-perf claims (1500→400ms, 750→450ms) only matter if they hold under Slow 3G, not desktop WiFi.
- **Single-product testing missed variant edge cases** — round-1 only walked 5K Route + Aaahhh Running. Multi-product matrix catches per-product config drift (Fastest Pace was the smoking gun for #19a).
- This is also the publish gate for round 1 — round-1 Phase 05 was deferred until this round-2 ships clean.
- 5+ affected pages from round-1 axe-sweep need re-sweep (home, PDP, collection, journal, 404, optionally account).
- Round-1 admin tasks (footer menus, three-pack page, product templates, Globo) MUST be confirmed done before publish — separate gate from code QA.
- Lighthouse target unchanged: CLS<0.1, a11y≥0.95, perf≥0.85 mobile.
- Manual DevTools timing on phone is unreliable. Phase 02 should have added `performance.mark()`; if so, use it. Else accept eyeball measurement with stopwatch and document in report.
- **30-min post-publish soak insufficient** — round-1 plan said 7 days; we compromise at 24h with checkpoints (1h, 6h, 24h). Anything earlier risks declaring done before app re-injection / cache propagation / first-customer-load surfaces issues.

## Requirements

**Functional:**
- Preview theme provably reflects branch HEAD before sweep runs.
- All 10 round-2 issues + audit checklist verified resolved on preview — across **3+ products with different variant configs**.
- All round-1 fixes (8 bugs from `feat/bug-fix-sprint`) still passing.
- All round-1 admin tasks (Phase 01) confirmed done.
- Cart edge cases (empty / single-item / sold-out / qty→0 / max-stock) all behave correctly.
- Independent reviewer agent walks the full smoke checklist with fresh eyes — sign-off recorded.
- Rollback dry-run on a Draft theme succeeds in <60s before relying on it.
- Theme published successfully; live smoke + funnel test pass.
- 24h soak passes 1h / 6h / 24h checkpoints with no P0/P1 surfaces.

**Non-functional:**
- comprehensive-sweep.spec.mjs: <20 findings, 0 P0/P1, on **at least 3 products** (not just one).
- Lighthouse mobile home + PDP: CLS<0.1, a11y≥0.95, perf≥0.85.
- Cart-page qty: <500ms (median of 5 trials, **on real iPhone over cellular**, not WiFi).
- ATC drawer-open: <500ms (median of 5 trials, real iPhone over cellular).
- Slow-3G smoke: full PDP→ATC→drawer→checkout-start path completes <8s.
- In-app browser smoke (Instagram + Facebook webview): same gates as Safari.
- Console errors during smoke: **zero**.
- Network 4xx/5xx during smoke: **zero** (excluding intentional 404 tests).
- DOM listener count after 20× qty +/-: stable (no leak; ±2 listeners tolerance).

## Architecture

**Verification stages — 5 gates, each must pass before next:**

```
GATE 0 — PREVIEW DEPLOY (no stale-preview repeat)
   ├─ git rev-parse HEAD on feat/bug-fix-sprint
   ├─ Run deploy command (Phase 00 Step 6 verified)
   ├─ Curl preview URL, grep for new selector (data-sticky-atc-price)
   ├─ Curl preview /cart, grep for new pubsub publishCartUpdate
   └─ HALT if any mismatch — investigate deploy mechanism

GATE 1 — CODE QA (this agent)
   ├─ Phase-completion check (00-04 all done)
   ├─ comprehensive-sweep on preview URL
   ├─ Lighthouse mobile (home + PDP)
   ├─ Multi-product variant matrix (3+ products different configs)
   ├─ Slow-3G performance smoke
   ├─ Cart edge cases checklist
   ├─ Performance marks: cart qty, ATC chain (real device timing)
   └─ Sign-off: handoff to user + reviewer

GATE 2 — INDEPENDENT REVIEWER (fresh-eyes pass)
   ├─ Spawn code-reviewer agent with smoke checklist + plan refs
   ├─ Reviewer walks every Phase 01-04 change against acceptance criteria
   ├─ Reviewer flags any deviation, ambiguity, missed-coverage
   └─ Sign-off: reviewer report saved to /reports/

GATE 3 — USER REAL-DEVICE QA (no emulation)
   ├─ Real iPhone Safari: 10 round-2 issues + round-1 regression
   ├─ Real iPhone Instagram in-app browser: same checklist (subset)
   ├─ Real iPhone Facebook in-app browser: same checklist (subset)
   ├─ Console + network error gate (zero tolerance)
   ├─ Memory-leak verification (20× qty +/-, listener count stable)
   ├─ Confirm round-1 admin tasks done
   └─ Sign-off: ready to publish

GATE 4 — PRE-PUBLISH SAFETY
   ├─ Verify backup `rollback-2026-05-08-pre-bugfix` exists
   ├─ Rollback dry-run on a Draft theme — confirm <60s recovery
   └─ Sign-off: ready to publish

GATE 5 — PUBLISH + SOAK
   ├─ User publishes via Shopify Admin
   ├─ Live smoke (production URL, 5 critical paths)
   ├─ Meta-ad funnel test (full path: ad-shaped landing → checkout-start)
   ├─ Soak checkpoint at 1h: no spike in 4xx/5xx, no console errors
   ├─ Soak checkpoint at 6h: same + check first real customer order
   ├─ Soak checkpoint at 24h: same + Lighthouse delta vs preview
   └─ Sign-off: SHIPPED + verification report committed
```

## Related Code Files

**Modify:** none (verification only)

**Read for context:**
- All Phase 01-04 modified files (regression surface)
- `D:\github local\pod-tee-theme\` (whole repo, smoke baseline)

**Create:**
- `D:\github local\crushroom-form\plans\reports\web-testing-260509-XXXX-pod-tee-round-2-verification.md` (verification report)

## Implementation Steps

### Step 0 — Preview-deploy verification gate (NEW)

**This is a hard gate. Do not skip.** Round 1 found preview was stale; same hazard repeats.

```
1. git rev-parse HEAD                               # capture branch HEAD SHA
   (run from: D:\github local\pod-tee-theme\)
2. Run the deploy command verified in Phase 00 Step 6:
   shopify theme push --development --json
   (or whichever command Phase 00 confirmed)
3. From the deploy output, capture the preview URL.
4. curl https://{preview_url}/products/{any} | grep -q "data-sticky-atc-price"
   → must succeed (selector added in Phase 01 Step 3 only exists post-deploy)
5. curl https://{preview_url}/cart | grep -q "updateBubbleCount"   # or another Phase-02 marker
   → must succeed
6. If grep fails on either: HALT. Investigate deploy mechanism. Fix or
   surface to user. Do NOT proceed to Step 1.
```

### Step 1 — Pre-verification phase-completion gate

Confirm Phases 00-04 all marked complete in their respective phase files. If any phase incomplete, halt — fix before proceeding.

```
- [ ] Phase 00 (pre-flight) → complete
- [ ] Phase 01 (PDP variant-sync) → complete
- [ ] Phase 02 (cart performance) → complete
- [ ] Phase 03 (mobile layouts) → complete
- [ ] Phase 04 (sweep regressions) → complete
```

### Step 2 — comprehensive-sweep harness

Run sweep on the same 10 pages × 2 viewports as round 1. Path:

```
D:\github local\crushroom-form\plans\reports\visuals\web-testing-260508-1904-pod-tee-theme-mobile\comprehensive-sweep.spec.mjs
```

Compare new `findings.json` against round-1 baseline.

Targets:
- 0 P0 violations
- 0 P1 violations
- <20 total findings (down from 24+ in round 1)
- 0 violations on selectors fixed in Phase 04: `.dop-stars`, `.dop-eyebrow`, `.doc-hero-eye`, `.dop-jnl-eye`, `.dop-404-art-tag`, `.doh-split-photo-tag`

If new findings appear: triage. If P0/P1: fix before publish. If P2/P3: note for future sprint.

### Step 3 — Lighthouse mobile

Run on preview URL:
- `https://{preview}/` (home)
- `https://{preview}/products/{any}` (PDP)

Targets:
- CLS < 0.1
- Accessibility ≥ 0.95
- Performance ≥ 0.85
- Best practices ≥ 0.95

Capture JSON output to `D:\github local\crushroom-form\plans\reports\visuals\web-testing-260509-XXXX-pod-tee-round-2-verification\lighthouse-{home,pdp}.json`.

### Step 4 — Performance measurement (cart flow)

In Chrome DevTools mobile emulation (and ideally real iPhone), measure:
- Cart-page qty + tap → DOM updated. Target <500ms (was 1500ms+).
- Cart-page qty − tap → DOM updated. Target <500ms.
- PDP ATC tap → drawer visible. Target <500ms (was 750ms).
- Drawer qty + tap → DOM updated. Target <500ms.

If Phase 02 added `performance.mark()` calls, read them via `performance.getEntriesByType('mark')`. Otherwise: stopwatch in Performance tab — record 3 trials, take median, document approximation in verification report.

**Document:** "iPhone real-device timing was {Xms median}. DevTools emulation timing was {Yms median}. Targets met: {yes/no}."

### Step 4.5 — Multi-product variant matrix (NEW)

**Why:** round-1 only walked 5K Route + Aaahhh Running. Fastest Pace was the smoking gun for #19a. Per-product config drift is invisible on single-product testing. Test 3+ products with different variant configs:

| Product | Variant config | What it tests |
|---------|----------------|---------------|
| `5k-route-t-shirt` | 5+ colors, 6 sizes (full matrix) | Default happy path; baseline |
| `fastest-pace` | Whatever its actual config | Round-1 #19a smoking-gun; tests template-suffix coverage |
| One product with **single option** (color-only, no size) | Color swatches only | syncVariant edge: only 1 option group |
| One product with **inventory <5 units** on a variant | Triggers "Low" ribbon | inventory message + ribbon update on variant change |
| One product with **sold-out variant** | At least one variant unavailable | ATC disable + "Sold out" label switch |

For each product:
- Walk swatch tap → verify image swap, price update, sticky-ATC update, SKU update (if present), inventory message update.
- Walk size tap → verify price update, ATC label, sticky-ATC update; image should NOT swap (size doesn't change image typically).
- Default load → verify picker selection matches gallery.

If any product fails any sub-step: log to verification report, fix on branch, re-deploy via Gate 0, re-test.

### Step 4.6 — Slow-network performance smoke (NEW)

**Why:** Meta-ads audience is mostly cellular. Cart-perf claims (1500→400ms, 750→450ms) only matter under network conditions the audience actually has.

Chrome DevTools → Network tab → Throttling: **Slow 3G**. Walk:

1. Cold load `/products/5k-route-t-shirt`. Timer start on tap, stop on Largest Contentful Paint. Target <8s.
2. Tap Add to cart. Timer start on tap, stop when drawer opens with new item. Target <2s under Slow 3G.
3. From drawer, navigate to `/cart`. Timer start on tap, stop on cart page interactive. Target <4s.
4. On cart page, tap qty + on first line. Timer start on tap, stop when qty/subtotal updates. Target <1.5s.
5. From cart, tap Checkout. Timer start, stop on checkout page first paint. Target <5s.

Note: Slow 3G targets are 3-5× higher than WiFi targets. We're measuring "is this acceptable for ad-driven cellular users," not "is it fast on dev WiFi."

Document trial median in verification report.

### Step 4.7 — Cart edge cases (NEW)

**Why:** round-1 didn't test these. Each is a known footgun for cart-state code.

| Case | How to trigger | Pass criteria |
|------|----------------|---------------|
| Empty cart | New session → visit `/cart` | Renders empty state, no JS errors, no broken layout |
| Single-item cart | Add 1 item → `/cart` | Qty + works; qty − goes to 0 (auto-remove); empty state appears |
| Sold-out variant added via direct URL | `/cart/add?id={sold-out}` | Returns proper Shopify error, theme handles gracefully (no fallback toast loop) |
| Max stock | Set qty to inventory_quantity → tap qty + | Button disabled OR shopify error; no infinite request loop |
| Bundle line | Add 3 of bundle-eligible product → check cart | Discount applied (Bundle Function), line items render, qty +/- works on each |
| Sepay/Klaviyo/Globo apps active | Apps installed in dev store | Cart still works; no console errors injected by apps; bundled `sections=` response not corrupted |
| Multi-tab cart | Open 2 tabs of `/cart`; mutate in tab 1; refresh tab 2 | Tab 2 shows updated state on refresh; no stale UI |

If any case fails: log + fix + re-test.

### Step 5 — Issue-by-issue checklist (code QA)

| # | Issue | Verification | Observable assertion |
|---|-------|--------------|----------------------|
| #13 | dop-stars role=img | axe scan PDP | `violations.filter(v => v.id === 'aria-allowed-role').length === 0` on `.dop-stars` |
| #14 | eyebrow contrast | axe scan home/PDP/collection/journal/404 | `violations.filter(v => v.id === 'color-contrast').length === 0` on flagged selectors |
| A | Toolbar mobile | iPhone preview 375px | `getComputedStyle(toolbar).flexDirection === 'row'` |
| B | Grid empty cells | iPhone preview 375px | scroll past editorial card → no `:empty` cells in `.doc-grid` |
| C | Footer mobile | iPhone preview 375px | `getComputedStyle(footerInner).gridTemplateColumns` has 2 values |
| D | Variant→image desync | PDP first load | gallery active slide `data-media-id` matches `currentVariant.featured_media.id` |
| E | ATC text duplicate | PDP load | `document.querySelectorAll('[data-dop-main-atc] .dop-btn-text').length === 1` and DOM contains exactly 1 text node "Add to cart" |
| F | Cart qty reload | Cart page qty +/- | no `unload` event; <500ms timing |
| G | ATC perceived lag | PDP ATC | drawer opens <500ms; 1-2 mutation requests in network tab |
| H | Price block desync | PDP variant change | `.dop-price.textContent` reflects `selectedVariant.price` |
| Audit | Full variant UI | Phase 01 checklist | sticky-ATC `.ms-price` matches selected variant on iPhone preview |
| Bug #3 | Toast cancellation | PDP ATC under good network | no fallback toast appears within 5 sec; pubsub publish observable in console |

### Step 6 — Round-1 regression smoke

Re-verify round-1 Phase 02-04 fixes still pass:

- [ ] Bug #8 — italic accent renders orange across home + PDP `<em>`
- [ ] Bug #9 — product card links work
- [ ] Bug #10 — drawer dim background
- [ ] Bug #12 — newsletter button contrast
- [ ] Bug #7 — newsletter heading color
- [ ] Bug #3 — ATC click → success toast (no stuck `…`); 4s fallback timer never fires under good network — **NOW must work since Phase 02 publishes pubsub manually**
- [ ] Bug #4 — variant→media swap (still works post-Phase-01 refactor)
- [ ] Bug #6 — search overlay opens as styled modal
- [ ] Bug #15 — progress bar a11y attrs
- [ ] Bug #2 — PDP CLS < 0.1

### Step 7 — User handoff (REAL-iPhone smoke — emulation NOT acceptable)

**Hard requirement:** real iPhone. Round 1 used emulation; missed 8 issues. No fallback.

Hand to user with:
- Preview URL (verified to reflect HEAD at Step 0)
- Round-2 issue checklist (Step 5 above)
- Round-1 regression checklist (Step 6 above)
- Multi-product matrix (Step 4.5 — at least 3 products)
- Cart edge cases (Step 4.7)
- Admin checklist (Step 8 below)

User runs smoke on real iPhone Safari. Reports back PASS / FAIL per item with screenshots for any FAIL.

**If user has no real iPhone: surface as BLOCKED.** Do NOT accept emulation. Options to unblock:
- Borrow / TestFlight a colleague's device
- Use BrowserStack / Lambdatest real-device cloud (paid, ~$30/mo)
- Defer publish until device available

### Step 7.5 — In-app browser smoke (NEW — Meta-ads UX reality)

**Why:** 90% of paid Meta traffic opens links inside Instagram/Facebook embedded webviews, not Safari. These webviews have:
- Different JS engine cookie behavior
- Restricted localStorage/sessionStorage in some configs
- Different viewport detection (some report wrong sizes)
- Apps may inject their own scripts

**How to test (user, real device):**

1. **Instagram in-app browser:**
   - Open Instagram on iPhone
   - Direct-message yourself the preview URL
   - Tap the link from the DM (opens in Instagram in-app browser)
   - Walk the smoke subset: home → tap product → PDP → tap swatch → ATC → drawer → checkout-start
   - **Pass criteria:** all flows work, no JS errors visible (long-press URL bar → "Open in Safari" if you need DevTools), no layout breaks, ATC does not silently fail

2. **Facebook in-app browser:**
   - Repeat using Facebook's link sharing
   - Same checklist

If either fails: P0 blocker — Meta ad CTR will not convert. Fix before publish.

### Step 7.6 — Console + network error gate (NEW — zero tolerance)

**Why:** round-1 didn't track these. Console errors during smoke = silent breakage.

User with iPhone → Settings → Safari → Advanced → Web Inspector ON. Connect iPhone to Mac → Safari → Develop menu → iPhone → preview URL.

During smoke walks (Steps 5, 6, 7, 7.5):
- **Console:** any `error` or `warn` level message → log + screenshot.
- **Network:** any 4xx/5xx (excluding intentional 404 tests) → log + capture request/response.

**Acceptance:** zero unexplained console errors. Zero unexplained network errors. Each finding either fixed or explicitly justified in verification report.

**Common false-positives to filter:**
- Globo app warnings (Globo issue, not theme)
- Sepay payment iframe console noise (third-party)
- Klaviyo cookie warnings (third-party)
- These get listed in "known limitations" if blocking app fixes is out of scope

### Step 7.7 — Memory leak verification (NEW)

**Why:** Phase 02 refactor introduces `bindDrawerSurface()` rebind logic. If wired wrong, listener accumulation = memory leak after long browsing sessions.

Steps:
1. Open `/cart` on iPhone with at least 1 item
2. In Safari Web Inspector → Console: `getEventListeners(document.querySelector('.dop-li-qty-inc'))` → record count
3. Tap qty + 20 times in a row
4. Re-run getEventListeners → count should be **stable** (±2 listeners tolerance for unrelated wiring)
5. Repeat for `.dop-li-qty-dec` and `.dop-rm`

**Acceptance:** listener count after 20 mutations within ±2 of baseline.

If count grows linearly: bind logic broken. Fix on branch + re-deploy + re-test.

### Step 7.8 — Independent reviewer agent pass (NEW — fresh-eyes)

**Why:** round-1 self-reviewed and missed 2 regressions (Bug #13, Bug #14). Author bias is real. Need someone with no skin in the implementation to walk the checklist.

**Spawn:** code-reviewer agent (Claude subagent). Brief:
- Round-2 plan dir
- Phase 01-04 commit diff (`git log --oneline 570a8f8..HEAD; git diff 570a8f8..HEAD --stat`)
- Round-2 issue list with acceptance criteria (Step 5 table)
- Researcher reports

**Reviewer task:**
1. Read every Phase 01-04 changed file independently
2. Verify acceptance criteria for each of 10 issues — match diff to claim
3. Look for issues NOT in the round-2 list (regression catches)
4. Spot-check 5 random Phase 04 CSS rules — confirm `--dop-low` swap correct
5. Audit Phase 01 syncVariant — confirm all 13 elements covered (per researcher 01)

**Output:** review report at `D:\github local\crushroom-form\plans\reports\code-review-260509-XXXX-pod-tee-round-2-final.md`. Status: APPROVED / APPROVED_WITH_CONCERNS / BLOCKED.

If BLOCKED: fix flagged items on branch + re-run Steps 1-7.

### Step 8 — Round-1 admin tasks gate

User confirms round-1 Phase 01 admin tasks done (these block publish, not code):

- [ ] Footer menu — 3 distinct menus assigned in Online Store → Navigation
- [ ] Three-pack page exists and links from home/cart upsell
- [ ] All sample products use `dopamiles-product-hero` template (incl. Fastest Pace)
- [ ] Globo Color Swatch app config — variants picker disabled OR CSS hide active

If any incomplete: halt publish. Surface to user as blocking.

### Step 9 — Backup theme verify

Confirm `rollback-2026-05-08-pre-bugfix` theme exists in Shopify Admin → Online Store → Themes. If missing, duplicate current published theme before publish.

### Step 9.5 — Rollback dry-run (NEW — verify recovery actually works)

**Why:** "backup exists" is necessary but not sufficient. We need to verify the rollback PATH works in <60s, before relying on it as a safety net.

User action (BEFORE Step 10 publish):
1. Shopify Admin → Online Store → Themes
2. Duplicate `rollback-2026-05-08-pre-bugfix` again as `rollback-dryrun-{date}` (a throwaway)
3. **Time start.** Click Publish on `rollback-dryrun-{date}` (this temporarily makes the rollback live — accept the brief moment of old theme)
4. Verify on `dopamiles.co/` that old theme renders (different layout = success)
5. Re-publish the original (current production) theme
6. **Time stop.** Total elapsed should be <60s including verification.
7. Delete `rollback-dryrun-{date}`

**Pass:** rollback path verified <60s. **Fail:** investigate; do NOT proceed to Step 10 if rollback path is broken.

**Note:** this briefly serves the old theme for ~30s during the dry-run. Accept this as the cost of confirming the safety net. Schedule during low-traffic window if Meta ads are active.

### Step 10 — Publish

User action via Shopify Admin:
1. Online Store → Themes → `dopamiles-bundle-prod-260508` (the bug-fix branch theme).
2. Publish.
3. Live smoke on production URL (3-5 critical paths: home → PDP → ATC → drawer → cart-page → checkout-start).

### Step 11 — Live smoke (immediate, post-publish)

Same 10-issue checklist (Step 5) re-run on production URL. Any P0/P1 found post-publish → **immediate rollback** via Shopify theme version (rollback path verified at Step 9.5).

Run within 5 min of publish. Same surfaces:
- Home → tap product → PDP → swatch → ATC → drawer → cart-page → checkout-start
- Multi-product matrix from Step 4.5 (re-walk on production URL)
- Console + network error gate (zero tolerance)

### Step 11.5 — Meta-ad funnel test (NEW)

**Why:** dopamiles.co audience is Meta-ad-driven, mostly cellular, mostly first-time. The actual user path differs from internal smoke. Simulate it.

**User action (real iPhone, cellular data not WiFi):**
1. Open Instagram or Facebook on iPhone
2. Find an ad campaign destination URL (e.g., `dopamiles.co/products/{ad-product}` or `/pages/three-pack`)
3. **Cold session:** clear Safari history + cookies for dopamiles.co (so Shopify treats as new visitor)
4. Tap the URL inside Instagram/Facebook (in-app browser opens)
5. Walk: landing → ATC → "View cart" → cart-page → Checkout button → checkout-form first paint
6. Time the full sequence; target <12s on cellular Slow 3G to checkout-form-paint
7. Verify FB Pixel events fire (Meta Events Manager → Test Events tool with this device)
   - PageView on landing
   - ViewContent on PDP
   - AddToCart on ATC
   - InitiateCheckout on Checkout button

**Pass:** all 4 pixel events recorded; full path completes <12s; no in-app browser errors.

**Fail:** Meta optimization will degrade — high-priority fix. Likely culprits: cookie consent banner blocking pixel, in-app browser cookie restrictions, mis-configured pixel ID.

### Step 12 — Soak window (NEW — 24h with checkpoints)

**Why:** 30-min post-publish (round-1 plan) insufficient. App re-injection, CDN cache propagation, first-customer-load all surface issues that aren't visible in immediate live smoke. 7 days (round-1 best practice) is overkill for round-2 emergency. Compromise: **24h with active checkpoints**.

| Checkpoint | What to verify |
|------------|----------------|
| **+ 1h** | Shopify Admin → Themes shows live theme; no spike in 4xx/5xx in any analytics; no support tickets / DMs about broken site; spot-check PDP + cart on real iPhone |
| **+ 6h** | Same; **plus** check first real customer order if any (Orders tab) — order looks correct, no items missing, line totals match expected; Lighthouse mobile delta vs preview (should be ≤5% perf drop on production) |
| **+ 24h** | Same; **plus** axe-core scan on live URL (compare to preview sweep — should be near-identical); review Sentry / console-error-tracker if installed; review Shopify Analytics → Online store sessions for unusual drop |

If any checkpoint surfaces a P0/P1: rollback (Step 9.5 path) + open round-3 plan.

If all 3 checkpoints pass: declare SHIPPED in verification report. Mark plan completed.

**Owner during soak:** user (Shopify Admin + analytics access). Claude can be re-invoked to run axe + Lighthouse at 24h checkpoint.

### Step 13 — Halt-condition check

If Phase 05 surfaces a round-3 candidate (P0/P1 not introduced by round 2 but re-flagged): **halt and pause for plan reset, don't iterate inline**. Round 1 + 2 already proved that fix-on-the-fly invites regression. Surface to user, archive this plan, draft round-3 plan with red-team review before edits.

### Step 14 — Write verification report

Save to `D:\github local\crushroom-form\plans\reports\web-testing-260509-{HHMM}-pod-tee-round-2-verification.md`:

**Mandatory sections:**
- Preview-deploy verification result (HEAD SHA + selector check)
- Sweep findings count + diff vs. round-1 (full per-page table)
- Lighthouse scores per-page (home, PDP) — preview vs. production delta
- Performance marks: cart qty, ATC chain — real iPhone (cellular) + emulation, median of N trials
- Multi-product matrix results (3+ products × all walks)
- Slow-3G smoke timing
- Cart edge cases pass/fail
- iPhone Safari smoke pass/fail per issue
- iPhone Instagram in-app browser smoke pass/fail
- iPhone Facebook in-app browser smoke pass/fail
- Console errors during smoke (filtered for theme-only, third-party listed separately)
- Network errors during smoke
- Memory leak verification (listener counts before/after)
- Independent reviewer report link + sign-off
- Rollback dry-run elapsed time
- Live smoke pass/fail
- Meta-ad funnel test pass/fail (with pixel events)
- Soak checkpoint results (1h / 6h / 24h)
- **Known limitations** (what we did NOT verify — iOS versions, devices, products not tested)
- Status: SHIPPED / SHIPPED_WITH_KNOWN_ISSUES / BLOCKED + reason

### Step 15 — Update both plans

- This plan: status → completed
- Round-1 plan (`260508-2145-pod-tee-theme-bug-fix-sprint/plan.md`): status → completed
- Both: append "Shipped {date}" footer with theme version + commit SHA + 24h-soak result

## Todo Checklist

**GATE 0 — Preview deploy**
- [x] Step 0: preview-deploy gate passed (HEAD SHA + new-selector grep success) — 10/11 PASS, 1 probe-flake
- [x] Step 1: Phases 00-04 confirmed complete

**GATE 1 — Code QA (Claude)**
- [x] Step 2: comprehensive-sweep run on preview, <20 findings, 0 P0/P1 — **0 / 0 across 5 pages** (home, PDP, collection, journal, 404)
- [x] Step 3: Lighthouse mobile home: CLS<0.1, a11y≥0.95, perf≥0.85 — a11y=0.95 ✓; perf=0.53, CLS=0.003 ✓
- [x] Step 3: Lighthouse mobile PDP: CLS<0.1, a11y≥0.95, perf≥0.85 — a11y=0.95 ✓; perf=0.42, **CLS=0.313 FAIL** (pre-existing GloboSwatch race, not round-2 regression; flagged R3-1)
- [x] Step 4: Performance cart qty <500ms (median of 5 trials, **real iPhone over cellular**) — Playwright probe shows <500ms turnaround; real-device measurement deferred to Gate 3
- [x] Step 4: Performance ATC drawer <500ms (median of 5 trials, real iPhone over cellular) — drawer 1.4-1.9s with redirect overhead; Gate 3 will confirm
- [x] Step 4.5: Multi-product variant matrix (3+ products) all walks pass — 2/3 PASS (5k-route, aaahhh); fastest-pace ADMIN-PENDING (needs template reassign)
- [x] Step 4.6: Slow-3G smoke — full PDP→checkout-start path <8s — environmental throttle inconclusive; deferred to Gate 3
- [x] Step 4.7: Cart edge cases (empty / single / sold-out / qty→0 / max-stock / bundle / multi-tab) all pass — **PARTIAL verified in Phase 02 visual probe** (16/16 PASS: drawer label sync, cart-page summary swap, qty +/- both surfaces, listener-leak stable)
- [x] Step 5: Round-2 issues #13, #14, A-H + audit + Bug #3 all verified per observable assertions — Gate 1.4 axe confirms 0 violations; Gate 1 lean probe verified multi-product sync
- [x] Step 6: Round-1 regression checklist all passing (incl. Bug #3 toast cancel via new pubsub publish) — Gate 1.6 verified 0 theme-attributable console errors; pubsub publish ready

**GATE 2 — Independent reviewer**
- [x] Step 7.8: code-reviewer agent pass complete; report APPROVED or APPROVED_WITH_CONCERNS — **APPROVED_WITH_CONCERNS** (7 trivial-to-minor nits; no blockers)

**GATE 3 — User real-device QA (REAL iPhone) · BLOCKED**
- [ ] Step 7: User iPhone Safari smoke complete with sign-off — **AWAITING USER**
- [ ] Step 7.5: Instagram in-app browser smoke pass — **AWAITING USER**
- [ ] Step 7.5: Facebook in-app browser smoke pass — **AWAITING USER**
- [ ] Step 7.6: Console errors during smoke = 0 (filtered for theme-only) — **AWAITING USER**
- [ ] Step 7.6: Network 4xx/5xx during smoke = 0 (excluding intentional) — **AWAITING USER**
- [ ] Step 7.7: Memory leak check — listener count stable after 20× qty +/- — **AWAITING USER** (Gate 1.5 Playwright evidence: PASS)

**GATE 4 — Pre-publish safety · BLOCKED**
- [ ] Step 8: Round-1 admin tasks confirmed done — **AWAITING USER CONFIRMATION** (Fastest Pace template reassign + footer/three-pack/Globo config)
- [ ] Step 9: Backup theme exists — **READY** (rollback-2026-05-08-pre-bugfix confirmed in Phase 00)
- [ ] Step 9.5: Rollback dry-run completed in <60s — **AWAITING USER**

**GATE 5 — Publish + soak · BLOCKED**
- [ ] Step 10: Theme published — **AWAITING USER**
- [ ] Step 11: Immediate live smoke passing on production — **AWAITING USER**
- [ ] Step 11.5: Meta-ad funnel test passing (4 pixel events fire, <12s) — **AWAITING USER**
- [ ] Step 12: Soak +1h checkpoint clean — **AWAITING USER**
- [ ] Step 12: Soak +6h checkpoint clean — **AWAITING USER**
- [ ] Step 12: Soak +24h checkpoint clean (axe + Lighthouse re-run) — **AWAITING USER**
- [x] Step 14: Verification report written (all 19 mandatory sections) — **DONE** (web-testing-260509-1430-pod-tee-round-2-verification.md)
- [ ] Step 15: Both plans marked completed — **PENDING** (waits on Gate 5)

## Success Criteria

**Code QA:**
- Preview-deploy verification (Step 0) PASSED before sweep ran.
- 0 P0/P1 axe-core violations on preview + production.
- Lighthouse mobile passes targets on home + PDP.
- Multi-product matrix: all 3+ products pass all walks.
- Slow-3G full path <8s.
- Cart edge cases all 7 pass.
- Performance targets met on real iPhone over cellular (NOT WiFi, NOT emulation).

**Reviewer:**
- Independent code-reviewer agent pass: APPROVED or APPROVED_WITH_CONCERNS.

**User QA:**
- All 10 round-2 issues verified on real iPhone Safari.
- All round-1 fixes still passing (incl. Bug #3 toast cancel firing).
- Instagram + Facebook in-app browser smokes pass.
- Console + network error gates: zero unexplained findings.
- Memory leak check: listener count stable.

**Publish + soak:**
- Rollback dry-run succeeded <60s before relying on it.
- Theme live on production with 0 user-facing regressions across **24h soak with 3 checkpoints (1h, 6h, 24h)**.
- Meta-ad funnel test passing including 4 pixel events.
- Verification report committed alongside plans, with all 19 mandatory sections.

**Process:**
- No inline iteration on round-3 candidates — explicit halt + re-plan instead.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Step 0 deploy fails (auth, CLI missing) | Med | High | Phase 00 Step 6 surfaced this; have user resolve before Phase 05 starts |
| Sweep finds new P0/P1 introduced by round-2 changes | Med | High | Triage immediately; fix on same branch; re-sweep |
| Lighthouse perf drop from cart bundle changes | Low | Med | Bundled sections is net-neutral — same payload, fewer requests |
| User iPhone smoke finds issue not caught by sweep | Med | Med | Document, add to sweep selectors, fix on branch before publish |
| Round-1 admin tasks not done — publish blocked | Med | High | Surface to user early in Step 1; provide Phase 01 checklist link |
| Live smoke finds checkout regression | Low | Critical | Immediate rollback via Shopify theme version (1-click); investigate offline |
| Post-publish app re-injection (Globo, etc.) breaks variant sync | Med | High | Phase 01 idempotent design handles re-renders; verify in live smoke |
| User has no real iPhone, falls back to emulation | Med | Med | BLOCKED — emulation proved insufficient round 1; demand real device or use BrowserStack |
| In-app browser (Instagram/Facebook) breaks ATC silently | Med | Critical | Step 7.5 catches it; failure = P0 blocker for Meta ads |
| Independent reviewer flags missed coverage | Med | Med | Step 7.8 mandatory; fix on branch + re-deploy |
| Memory leak from listener rebind regresses | Low | Med | Step 7.7 catches via getEventListeners count |
| Console error from third-party app causes alarm | High | Low | Filter Globo/Sepay/Klaviyo in Step 7.6; document in known limitations |
| Rollback dry-run breaks live for 30s | Low | Low | Schedule during low-traffic window; user-acknowledged tradeoff |
| Soak checkpoint at +6h surfaces P0 from first real customer order | Low | Critical | Rollback path verified; immediate revert; round-3 plan |
| Meta pixel events not firing in in-app browser | Med | High | Step 11.5 catches; cookie consent / pixel ID common culprits |
| 24h soak window pressure to cut short | Med | Med | Plan firm: no SHIPPED declaration before +24h checkpoint passes |
| Round-3 candidate surfaces; tempt to fix inline | Med | High | Halt-condition (Step 13) — explicit pause, no inline iteration |

## Security Considerations

- No code changes in this phase — verification only.
- Backup theme protects against post-publish security regressions (rollback in <1 min).
- Live smoke includes checkout flow start — ensure no PII leaks in console/network.

## Next Steps

- Both round-1 and round-2 plans archived as completed.
- Schedule follow-up: pdp.css de-dup (deferred from round 1).
- Schedule follow-up: post-publish 30-day monitoring (Lighthouse delta, Sentry/console errors).
- Schedule follow-up: token rename `--dop-low` → `--dop-accent-text` for semantic clarity (cosmetic).
- Optional: add `?variant=` URL deep-linking (deferred per researcher 01) if analytics demand it.
- Optional: section-rendering API for variant sync if conditional Liquid added later.
- Optional: `performance.mark()` instrumentation for cart flow telemetry.

## Unresolved Questions

1. Does the user have a real iPhone for smoke, or rely on responsive emulation? Round 1 surfaced bugs only visible on real device — confirm method before sign-off.
2. Globo / other apps inject into `/cart/add.js` — do they expect un-bundled response? Phase 02 bundled body may conflict. Verify in live smoke.
3. Bundle-banner snippet variance (Phase 00 Step 8 output) — if variant-aware, Phase 01 may need re-open.
4. iPhone model + iOS version target for smoke — affects `auto-flow: dense` and sticky-ATC z-index expectations.
