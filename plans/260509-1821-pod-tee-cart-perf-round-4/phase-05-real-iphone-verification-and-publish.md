# Phase 05 — Real iPhone Verification + Publish

## Context Links

- Halt journal lesson #4 ("Done means observable in user screen recording"): [../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md](../../docs/journals/260509-pod-tee-round-3c-halt-globo-broke-perception-rejected.md)
- Round-3c phase plan (verification protocol baseline): [../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md](../260509-1057-pod-tee-bug-fix-round-2/phase-06-round-3c-perception-cls.md) — Step 8 walk
- SLC research expected behavior: [../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md](../reports/researcher-260509-1814-slc-cart-pattern-vs-pod-tee.md)
- Phase 02 changes (what user verifies): [./phase-02-slc-pattern-inversion-atc-and-qty.md](./phase-02-slc-pattern-inversion-atc-and-qty.md)
- Phase 03 changes (CLS): [./phase-03-cls-via-min-height-slot-reservation.md](./phase-03-cls-via-min-height-slot-reservation.md)

## Overview

**Priority:** P0 (publish gate)
**Status:** pending
**Effort:** ~60 min user-side
**Owner:** user (real iPhone walk + screen recording) + code (Lighthouse mobile audit)

User real-device verification is the only authoritative "done" signal. No emulation. No theme-check-clean shortcut.

## Key Insights

- **Round-3c lesson:** code-reviewer-approved + theme-check-clean + preview-deployed is NOT done. The Globo cascade bug bypassed all review gates and was caught only by user iPhone screen recording.
- **Phase 05 is the only phase where "done" is observable.** Everything else is process toward that observable.
- **Build-tag + error overlay (preserved from round-3c) carry forward as diagnostic surface.** If verification fails, we want the failure to surface in the recording with diagnostic content (build-tag value, error overlay message), not as silent "didn't work."
- **Halt rule applies at this phase too.** If phase 05 fails: halt, reset plan, do not iterate inline.
- **Done = drawer-arrives-with-content under 500ms target on real cellular.** Not "drawer opens" — drawer opens with cart visibly updated.

## Requirements

**Functional verification (real iPhone, real cellular):**
1. Open Dopamiles preview URL on iPhone Safari (cellular OFF wifi disabled, OR Network Link Conditioner equivalent if available)
2. Hard-refresh PDP — confirm build-tag visible top-right with new value
3. **ATC test:** tap ATC → expect button-spinner immediately → drawer remains hidden → drawer slides in with real content visible (image, title, variant, qty, price)
4. **Qty +/- test:** open cart page → tap qty + button → expect button-spinner → number unchanged → ~500ms later line replaces with new qty + new price together
5. **Error test:** turn airplane mode on → tap ATC → expect button-spinner clears + red error overlay appears with message + drawer never opens
6. **R3-1 CLS test:** reload PDP under Slow cellular → no layout reflow when Globo swatches paint
7. **Globo OFF test (if user can toggle):** disable Globo per-product → reload PDP → variant-selects renders normally with reserved space below; PDP usable
8. **Multi-product matrix:** repeat ATC test on 3 different products (different variant counts)

**Lighthouse mobile (preview URL, code-side):**
- PDP CLS < 0.1
- PDP perf score ≥ 0.85
- PDP a11y ≥ 0.95
- ATC drawer-open < 500ms (extracted from Performance trace under Slow 3G)

**Non-functional:**
- 0 red error overlays during user happy-path recording
- Build-tag visible AND value differs from prior preview deploys (cache-bust signal)
- Single screen recording per test (~15s each)
- No emulation. No "DevTools mobile mode" as substitute for real iPhone.

## Architecture (the verification protocol)

```
User walk (single session, ~30 min):
  ├─ Pre-flight (5 min)
  │   ├─ Settings → Safari → Clear History on iPhone
  │   ├─ Confirm preview URL loads with phase 01-04 deployed
  │   ├─ Confirm build-tag visible top-right (value should differ from prior recordings)
  │   └─ Disable wifi → use cellular (LTE or 5G)
  ├─ Test 1 — ATC happy path (5 min)
  │   ├─ Open product PDP A
  │   ├─ Start screen recording
  │   ├─ Tap ATC
  │   ├─ Watch: button-spinner → wait → drawer slides in WITH content
  │   ├─ Stop recording
  │   └─ Send to code reviewer
  ├─ Test 2 — Qty +/- (5 min)
  │   ├─ Open cart page
  │   ├─ Start recording
  │   ├─ Tap qty + on a line item
  │   ├─ Watch: button-spinner → ~500ms → line replaces with new qty + price
  │   ├─ Repeat for qty -
  │   ├─ Stop recording
  │   └─ Send
  ├─ Test 3 — Error path (5 min)
  │   ├─ Airplane mode ON
  │   ├─ Open PDP, start recording
  │   ├─ Tap ATC
  │   ├─ Watch: button-spinner → red error overlay appears → drawer never opens
  │   ├─ Stop recording, airplane mode OFF
  │   └─ Send
  ├─ Test 4 — CLS (Globo ON, 5 min)
  │   ├─ Hard reload PDP
  │   ├─ Start recording at moment of refresh
  │   ├─ Watch first 3s: variant area should be stable (no jump when Globo paints)
  │   ├─ Stop recording
  │   └─ Send
  ├─ Test 5 — CLS (Globo OFF, 5 min, optional)
  │   ├─ Toggle Globo off in admin (if user has access)
  │   ├─ Reload PDP
  │   ├─ Recording: variant-selects renders, reserved space below visible
  │   ├─ Variant click + ATC still functional
  │   └─ Send
  └─ Multi-product matrix (Test 1 repeated on Product B + Product C)

Code review of recordings (~15 min):
  ├─ Frame-by-frame analysis of each recording
  ├─ Confirm build-tag visible + value matches latest deploy
  ├─ Confirm 0 red error overlays in happy paths
  ├─ Confirm error overlay DID appear in airplane-mode test
  ├─ Confirm drawer-open occurs AFTER fetch (no empty-drawer-then-swap visible)
  ├─ Measure ATC tap-to-drawer-content elapsed (eyeball or timestamp annotation)
  └─ Lighthouse mobile audit recorded separately

Publish gate (~10 min):
  ├─ All recordings show success criteria met
  ├─ Lighthouse CLS<0.1 confirmed
  ├─ Round-1 backup theme `rollback-2026-05-08-pre-bugfix` confirmed available
  ├─ Publish preview theme to live
  └─ 1h smoke check post-publish
```

**Failure-mode coverage:**

| Failure | Detection | Mitigation |
|---|---|---|
| Recording shows drawer opening before fetch returns (phase 02 inversion didn't take effect) | Frame analysis | Build-tag confirms which deploy ran; if old deploy → cache; if new deploy → code didn't actually invert; halt |
| Red error overlay flashes during happy path (silent throw in inverted code) | Recording | Error message tells us the specific line; targeted fix, single retry, halt rule applies |
| User reports "doesn't feel different from round-3c" despite phase 02 deployed | Subjective | Frame analysis: if drawer is visibly opening empty then swapping → phase 02 didn't apply; if drawer arrives with content → phase 02 worked but user perception differs → halt + plan reset, evaluate Q3 (cart-notification surface) |
| CLS still visible (Globo paint causes reflow) | Recording + Lighthouse | Phase 03 min-height value too small; one tuning iteration allowed; halt thereafter |
| ATC drawer-open >800ms on cellular | User feel + Lighthouse | Phase 04 levers may not have shipped; OR server render is dominant; document and halt — major perf work is future round |
| Build-tag missing on preview | Recording | Phase 01 inadvertently removed build-tag (theme.liquid edit); rare since phase 01 doesn't touch theme.liquid |
| Build-tag value matches prior deploy (cache stale) | Recording | Settings → Clear History on iPhone; reload; if still stale, wait 5 min for Shopify CDN bust |
| Error overlay does NOT fire in airplane-mode test (silent failure) | Recording | Either phase 01 removed `showInjectError` (regression) or phase 02 didn't wire it; targeted fix |

## Related Code Files

**Read-only this phase:** all theme files (no edits in phase 05).

**Documents to update post-verification:**

- `D:\github local\crushroom-form\docs\journals\260509-pod-tee-round-4-shipped.md` — new journal entry on success
- `D:\github local\crushroom-form\plans\260509-1821-pod-tee-cart-perf-round-4\plan.md` — frontmatter `status: completed`
- `D:\github local\crushroom-form\plans\260509-1057-pod-tee-bug-fix-round-2\plan.md` — note round-4 successor sprint outcome

## Implementation Steps

### Step 1 — Pre-flight checklist (code-side, 5 min)

```powershell
cd "D:\github local\pod-tee-theme"

# Confirm all phase 01-04 commits landed
git log --oneline -10

# Confirm preview deploy current
shopify theme list

# Final theme check before user starts walk
shopify theme check
```

Verify build-tag value will be unique on user's reload (theme.liquid uses `'now' | date: '%s' | slice: -6, 6` — every render = new value).

### Step 2 — Lighthouse mobile audit (code-side, 10 min)

1. Chrome desktop, DevTools, Lighthouse tab
2. Mobile, Performance + Accessibility + Best Practices
3. Run on preview PDP URL: `https://rfeixb-dd.myshopify.com/products/<slug>?preview_theme_id=158279991548`
4. Capture scores. Acceptance: CLS<0.1, perf≥0.85, a11y≥0.95
5. If CLS≥0.1 → phase 03 min-height needs tuning; HALT before user walk; one iteration allowed

### Step 3 — User walk (user-side, 30 min)

User performs Tests 1-5 per Architecture section. User sends 5+ screen recordings to code reviewer.

**User walk script (paste to user):**

> Please record 5 short clips (~15s each) on your iPhone using cellular (not wifi):
>
> 1. **ATC Test (Product A):** open any product, hit Add to Cart. I want to see: button shows spinner, you wait briefly, drawer slides in with the item already visible.
> 2. **Qty Test:** open cart page, tap + on a line. I want to see: + button shows spinner, the number doesn't change for a moment, then the whole line replaces with new qty and price.
> 3. **Error Test:** turn on airplane mode, then hit Add to Cart. I want to see: button spinner clears, a red overlay appears with an error message, drawer does not open. Turn airplane mode off after.
> 4. **CLS Test (Globo ON):** hard-refresh a PDP (the one with color swatches). Start recording at the refresh moment. I want to see: the variant/swatch area stays stable, no jumping when colors appear.
> 5. **Multi-product:** repeat Test 1 on two other products (different variant counts).
>
> Build-tag should be visible top-right in every recording. Note the value — it should look different from the last set of recordings I gave you.

### Step 4 — Code review of recordings (code-side, 15 min)

Frame-by-frame:
- [ ] Build-tag visible AND new value
- [ ] 0 red overlays in Tests 1, 2, 4, 5 (happy path)
- [ ] Red overlay PRESENT in Test 3 (error path) with readable error text
- [ ] Test 1: drawer slide-in shows real content from frame 1 (no empty-then-swap visible)
- [ ] Test 2: line replacement is single visual event (no intermediate state with new qty + old price)
- [ ] Test 4: variant area is stable across the first 3s of paint (no row-height-change reflow)
- [ ] Test 5: same as Test 1 across 3 products

Document findings + screenshot annotations in:
`d:\github local\crushroom-form\plans\reports\verification-260509-1821-pod-tee-cart-perf-round-4-iphone.md`

### Step 5 — Publish gate (code-side, 10 min)

Pre-publish:
- [ ] All Step 4 checkboxes pass
- [ ] Lighthouse CLS<0.1 confirmed
- [ ] Rollback dry-run: confirm `rollback-2026-05-08-pre-bugfix` theme still in admin theme library
- [ ] Round-1 Phase 01 admin tasks confirmed done (carry-over check from parent sprint)

Publish:

```powershell
# Switch preview theme to live
# (use Shopify admin GUI or shopify CLI)
shopify theme publish --theme 158279991548
```

Post-publish smoke (1h):
- Tap ATC on live store
- Tap qty +/-
- Confirm build-tag is INVISIBLE on live store (preview-only gate from round-3c)
- Confirm error overlay still wired (briefly trigger via airplane mode)

### Step 6 — Journal + plan close

Create `D:\github local\crushroom-form\docs\journals\260509-pod-tee-round-4-shipped.md`:
- Round-4 outcome (lessons, what shipped vs what was deferred)
- Q1/Q2/Q3 follow-up status
- Compare ATC ms before (round-3c) vs after (round-4)

Update plan.md frontmatter `status: completed`.

## Todo Checklist

- [ ] Step 1 — pre-flight: phase 01-04 commits landed, theme check clean
- [ ] Step 2 — Lighthouse mobile: CLS<0.1, perf≥0.85, a11y≥0.95 captured
- [ ] Step 3 — user 5 recordings received
- [ ] Step 4 — recordings frame-analyzed; verification report committed
- [ ] Step 5 — publish gate: all green, rollback theme confirmed, theme published live
- [ ] Step 5b — 1h post-publish smoke clean
- [ ] Step 6 — journal entry committed; plan status set completed

## Success Criteria

- ALL 5 user recordings show specified behavior (build-tag visible + new value, drawer-after-fetch ATC, qty button-spinner, error overlay on airplane mode, CLS-stable variant area)
- Lighthouse mobile CLS<0.1, perf≥0.85, a11y≥0.95
- 0 unexplained console errors
- Multi-product matrix: 3 products tested, all pass
- Live store smoke clean at 1h post-publish
- Verification report committed with embedded recording timestamps + frame notes
- Done = the user said "ship it" after watching their own recording

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User reports "still feels slow" despite phase 02 + 04 ship | Med | High | Halt rule: do NOT iterate inline. Reset plan. Q3 (cart-notification surface) candidate for round-5. |
| iPhone Safari cache stale → user verifying old build | Low | Med | Build-tag value comparison catches this; user retries with Settings → Clear History |
| Lighthouse mobile CLS≥0.1 (phase 03 min-height too small) | Med | Med | One tuning iteration allowed; halt after that |
| Red overlay fires in happy path (silent throw in phase 02 code) | Low | High | Error message identifies file+line; targeted fix; one retry |
| User cellular speed too fast to perceive 500ms wait (looks instant) | Low | Low | Better than expected — accept |
| User cellular speed too slow (>2s wait) — "drawer arrives with content but I waited forever" | Med | Med | Phase 04 should have measured this; if not addressed, this is the structural cellular limit; document and ship anyway IF SLC pattern verified working |
| Globo behaves differently in production than preview (different settings) | Low | Med | Test against production-equivalent settings on preview |
| Round-1 backup theme `rollback-2026-05-08-pre-bugfix` was deleted | Low | High | Step 5 confirms availability before publish; if missing, abort publish, recreate backup |
| Publish breaks something not in test matrix (e.g. checkout flow) | Low | High | 1h smoke includes funnel test (PDP → ATC → cart → checkout-init); 24h soak via parent sprint protocol |

## Security Considerations

- No code edits this phase; no new attack surface.
- Build-tag preview-gating verified post-publish: build-tag must NOT appear on live URLs (regression check during 1h smoke).
- Error overlay uses `textContent` not innerHTML — XSS-safe (verified phase 01-preserved helper).
- No new analytics events, no new credentials.

## Next Steps

- Round-5 (only if needed): triggered by user "still slow" feedback. Investigate Q3 (cart-notification surface as ATC feedback).
- Custom cart.js refactor (Q1 follow-up): future planning sprint, multi-day effort.
- 24h soak protocol per parent sprint: 1h, 6h, 24h checkpoints.

## Unresolved Questions

1. Does the user have Network Link Conditioner or equivalent on iPhone for deterministic cellular throttling? If not, "cellular" varies by location/signal strength — accept directional measurements.
2. What if 4/5 recordings pass but 1 fails (e.g. one product variant matrix has CLS issue)? Treat as halt → diagnose 1 product before publish, OR ship to live with that 1 product flagged for follow-up. Default: halt.
3. Should we measure ATC ms with a stopwatch overlay in the recording? User can use iOS screen recording with timestamp; otherwise frame-count from 60fps recording (~16ms per frame). Phase 04 measurement is the authoritative number; phase 05 is gut-check.
4. Does user prefer to publish during off-peak (low-traffic window)? Recommend yes — confirm with user before Step 5.
5. What's the formal "rollback trigger" criteria post-publish? E.g. >1% checkout rate drop in first 24h. Document in journal Step 6.
