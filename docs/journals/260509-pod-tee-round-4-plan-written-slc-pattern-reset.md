# Round-4 Plan Written — SLC Pattern Reset After Round-3c Halt

**Date**: 2026-05-09 18:45 ICT  
**Severity**: High  
**Component**: Pod Tee cart performance strategy (round-3 abandonment, round-4 initiation)  
**Status**: PLANNED (code phase pending)

## What Happened

Six hours after the round-3c halt (18:03), the plan for round-4 is now written and ready for code implementation. The reset happened in stages:

1. **User redirect (18:05).** "Look at Sloth Hiking Club's cart—check cart.js." Single request pivoted the entire approach.
2. **SLC research spike (18:14).** 15-minute investigation of minified product-form.js, cart-drawer.js, cart.js, and cart-notification.js. Traced the ATC ordering: button-spinner → fetch `/cart/add.js` → swap drawer content (while drawer hidden) → THEN open drawer. Compared to pod-tee's current (broken) flow: button-spinner → open drawer (empty) → fetch → swap visible (user sees flash) → un-dim.
3. **Plan write (18:21-18:45).** Five phases structured around the SLC pattern inversion, Globo regression fix, actual latency measurement, and iPhone verification gate. 6 markdown files. 3–4h active effort + 1h user verification time.

## The Brutal Truth

Three rounds on the same feature. Zero convergence. User rejection at 18:03 isn't a "this iteration needs tweaking" moment—it's "the entire strategy is wrong." That's the worst feeling in a 12-hour sprint. But the redirect to a competitor's working code in the next message is gold.

The real kick: we had all the clues. Round-3b spent 4 hours chasing "maybe we need better line-item HTML structure" when the issue was "don't show anything to the user until the cart actually changed." Code-reviewer caught 4 issues in round-3c and missed the CSS cascade because code review doesn't catch third-party regressions. The halt rule worked exactly as designed—it stopped us from iterating blindly on a rejected strategy.

What's hard to admit: the plan investment (3-4h) for a ~10-LOC code change feels heavy. But that ratio is earned. Round-3a/b/c each had plans too, and they shipped anyway. Better plans with harder verification gates (real iPhone, build-tag, error overlay) are the only insurance against repeating this.

## Technical Details

**SLC's drawer-after-fetch ordering (the smoking gun):**
```js
// SLC pattern: drawer slides in AFTER cart updated
const result = await addToCart(varId, qty);
applyCartMutation(result);      // swap content while drawer hidden
openDrawer();                   // now drawer opens with real content
```

**Pod-tee's broken ordering (round-3c):**
```js
// Current: drawer slides in BEFORE cart updated
injectOptimisticAtcLine(form, qty);  // placeholder
openDrawer();                         // drawer open, showing placeholder
const result = await addToCart(varId, qty);
applyCartMutation(result);           // swap happens, user sees flash
```

The visual perception: SLC user waits ~500ms, sees button spinner, then drawer arrives with content (one coherent event). Pod-tee user waits ~50ms, sees drawer with placeholder, then watches it swap to real (multi-event, detectible flash, trust erosion). The HTML is pixel-identical after the swap; the timing of the animation is what breaks the illusion.

**SLC's bundle footprint:** 3 files, ~14KB minified (product-form.js, cart-drawer.js, cart.js). No custom cart override. No optimistic helpers. No visibility tricks. Stock Dawn.

**Pod-tee's bundle:** 599-line custom dopamiles-cart.js + stock cart-drawer.js. Plan defers the question: do we need the custom file?

## Why This Plan Works (And Why It's Heavy)

**Five phases, not one:**

1. **Revert round-3c debt** (~30min) — remove optimistic helpers, Globo-cascade wrapper, visibility tricks. Keep observability tools (build-tag, error overlay, JSON island). Clean baseline before changes.
2. **SLC inversion** (~45min) — apply drawer-after-fetch ordering to ATC + qty handlers. 10-LOC net delete.
3. **CLS via min-height** (~45min) — CSS-only space reservation in variant-picker. No visibility/display tricks on parents. Spot-test Globo ON and OFF.
4. **Latency profile** (~60min) — measure actual cellular latency before optimizing further. Three open questions gated: does custom dopamiles-cart.js add value? Does sections= bundle more than 2? Is cart-notification viable?
5. **Real iPhone verification** (~60min user-side) — screen recording. Lighthouse mobile. No emulation. Build-tag visible, no red overlays, CLS<0.1, ATC<500ms, qty<500ms. Done = observable in user video.

**The halt rule carries forward:** single iteration per phase. If phase 05 verification fails, halt and reset again. Don't iterate inline.

## Lessons From Round-3c That Made Round-4 Plan Different

1. **Competitor research is research.** Three rounds of internal iteration = 6 hours. One look at SLC's code = 15 minutes + found the exact bug + found the fix. When stuck, look for someone who solved it already.

2. **Stock code often beats custom code.** SLC's 14KB stock files outperform our 599-line custom dopamiles-cart.js on perceived speed. Custom code carries customization debt; stock code carries Shopify-team-tested defaults. Question in round-4 phase-04: do we even need our custom file?

3. **Process gaps are permanent regressions.** Round-3c phase plan said "spot-test Globo OFF" but didn't mandate "spot-test Globo ON." That's a process gap that became a user-facing blank. Phase-05 now requires real iPhone, not "preview theme + Lighthouse."

4. **Research artifacts compound.** The SLC report is linked from plan.md, phase-02, phase-04 (latency question 2). One read-and-write paid off four times already. Writing research to markdown is future-proofing.

5. **Plans outnumber code files now.** 6 markdown files in round-4 plan dir. 4 modified theme files in round-3c. The discipline gap between "write a plan" and "write code blind" is where rounds 3a/b/c failed. Round-4 closes it with verification gates, not just implementation gates.

## Open Questions (Plan defers, phase-04 answers)

1. **Will the 5-LOC ordering inversion feel fast on cellular, or is the underlying `/cart/add.js` round-trip the dominant cost regardless of ordering?** Phase-04 measures actual latency. If still >1000ms, evaluate cart-notification surface (Q3 follow-up).

2. **Are we over-planning a 10-LOC fix?** Plan effort (~3-4h) vs code change ratio is high. Is round-3c trauma over-correcting? Probably yes. Live with it for one round and reassess after phase-05.

3. **Is the right long-term move to delete dopamiles-cart.js entirely and use stock Dawn?** Phase-04 measurement will tell us if custom code adds value or just maintenance burden. If stock Dawn's 3 files pass verification, consider full replacement.

## Unresolved (Post-Plan, Pre-Code)

- Will `min-height` reservation for Globo match actual rendered swatch height? Spot-test both ENABLED and DISABLED.
- Does `/cart/add.js?sections=...` bundle more than 2 sections today? Needs audit.
- Does drawer-after-fetch still read as slow despite faster perception? Depends on actual cellular latency, which is unmeasured.

---

**Status**: DONE (plan written, code phase pending)  
**Decision**: User approved reset strategy. Round-4 plan phases 01-05 structured. Ready for implementation.  
**Next**: Code phase (phase-01 revert) — scheduled next session.  
**Entry recorded**: 2026-05-09 18:45 ICT
