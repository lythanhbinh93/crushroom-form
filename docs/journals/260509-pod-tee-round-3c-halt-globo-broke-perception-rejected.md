# Round-3c Halt — Globo Cascade + User Rejects "Fake Animation" Strategy

**Date**: 2026-05-09 18:03 ICT  
**Severity**: Critical  
**Component**: Pod Tee PDP optimistic ATC UI (G), cart qty price feedback (F), CLS hide+reveal (R3-1)  
**Status**: HALTED — plan reset invoked

## What Happened

Round-3c shipped to preview theme 158279991548 at 17:30. Code-reviewer pre-approved with 4 critical patches applied. Four hours later, user iPhone screen-recording verification surfaced two failures:

1. **Globo color swatches did not render on the PDP.** Blank space where swatches should appear. Build-tag confirmed new code reached device (cache-bust signal worked). No red error overlay (silent-throw detection worked). The feature itself failed silently due to CSS cascade.

2. **User rejected optimistic UI as a strategy.** "ATC not good, just fake animation. I want real performance." The placeholder appeared instantly, but the user perceived the visual swap when the server response replaced it. Optimistic UI isn't instant if the user sees the mutation — it's dishonest loading state theater.

At 18:03 ICT, user invoked the phase-06 halt rule explicitly: "Single round of iteration max — if round-3c also fails, halt and reset plan."

## The Brutal Truth

This is the third failed attempt on the same feature in a single day. Round-3a shipped (drawer immediate-open). Round-3b added payload logic and was reverted after 4 silent-throw iterations. Round-3c shipped with observability (build-tag + error overlay) to break the guess loop, and the verification _surfaced_ the failure correctly — but the failure invalidated the entire strategy, not just the implementation.

**The worst part:** code-reviewer didn't flag the Globo regression. Code was clean. Liquid syntax valid. Theme check clean. Deployed with confidence. The failure was CSS cascade, not JavaScript, so it bypassed the usual review gates. I wrapped `<product-info>` in `<div data-dawn-vs style="visibility:hidden">` to hide Dawn's variant-selects until Globo confirmed inject. That wrapper's `visibility:hidden` cascaded to Globo's async-injected `.globo-color-swatch` children, hiding them forever. The reveal-if-no-Globo timer (1500ms) checked for Globo presence via CSS selectors (`.globo-swatch-product-detail`, etc.) — but the selectors matched the *hidden* injected nodes, so the timer thought Globo had done its job and never fired the reveal. Net result: Globo rendered, but invisible under `visibility:hidden`. User saw blank.

**Even worse:** this was predictable. We didn't spot-test with Globo *enabled*. The phase plan said "spot-test with Globo OFF + click variant pill" but we didn't mandate "spot-test with Globo ON." Process gap turned into user-facing blank.

The "fake animation" critique invalidates round-3a's drawer-immediate-open in spirit too. Instant-appearing drawer is also optimistic perception. The whole perception thrust (3 days, 3 rounds, zero convergence) is rejected.

## Technical Details

**Globo cascade root cause:**
```html
<!-- My wrapper hides everything inside, including Globo's injected children -->
<div data-dawn-vs style="visibility:hidden">
  <product-info>
    <product-variant-picker><!-- Dawn renders here --></product-variant-picker>
  </product-info>
  <!-- Globo async-injects .globo-color-swatch here after component paints -->
  <div class="globo-color-swatch" style="display:none"><!-- Hidden by parent! --></div>
</div>

<!-- Timer checks for Globo presence -->
<script>
  setTimeout(function() {
    var globoPresent = document.querySelector('[class*="globo-color-swatch"]');
    // Selector matches the hidden node above
    if (globoPresent) return; // Timer thinks "Globo handled it", never reveals
  }, 1500);
</script>
```

**The fix would have been:** hide *sibling* element or use `display:none` on the wrapper (reserved vertical space doesn't trigger reflow). But we used `visibility:hidden` on the parent, which silently hides children regardless of their visibility value. CSS cascade 101.

**User's "fake animation" feedback:**
The optimistic line item rendered in the drawer before the server response. But the user watched it flicker out and be replaced by the real item. That swap is observable. Optimistic UI only works if the user truly cannot perceive the transition — sub-100ms swaps where the change happens during a blink or off-screen. ATC drawer is full-screen and 500–1500ms latency; the user sees the swap.

**Code-reviewer's blind spot:**
Caught 4 critical issues (C1 empty-cart, M1–M3 escaping, M4 script-close, m1 aria-role). Missed the CSS cascade. Not fair to blame the reviewer — CSS reflow logic isn't part of a typical code-review checklist. But this is exactly why we need spot-tests on the live store with all third-party features enabled. Code review != end-to-end verification.

## What We Tried

Round-3 strategy: optimistic perception (fake instant UI to paper over real latency).
- Round-3a: optimistic drawer-open (immediate visual feedback on tap)
- Round-3b: optimistic line-item + price scaling (full payload, 4 reverts, no convergence)
- Round-3c: optimistic line-item + spinner + build-tag + error overlay (clean code-review, failed user verification)

**The strategy itself is rejected.** User doesn't perceive optimistic UI as "instant." User perceives the swap, which breaks trust.

## Root Cause Analysis

Three cascading failures:

1. **CSS cascade blindness.** `visibility:hidden` on a parent silently cascades to async-injected children. We tested with Globo OFF (confirmed phase plan gap) but not ON. The reveal-timer checked for Globo's presence using selectors — but selectors matched the hidden nodes, so the timer fired but returned early (false positive).

2. **Strategy mismatch.** Optimistic UI is a latency-hiding pattern, not a performance-elimination pattern. It works when latency is <100ms and imperceptible. ATC /cart/add.js round-trip is 500–1500ms on cellular. The optimistic line appears instantly, but the swap is observable. User sees "fake animation," not real performance. The trust erosion is worse than an honest loading state.

3. **Process gaps.** Phase plan said "spot-test Globo OFF" but didn't mandate "spot-test Globo ON." We validated code but not assumptions. End-to-end verification was deferred to user (correct gate), but we shipped without pre-deploying on the live store with all third-party apps enabled. That test would have caught the cascade within 10 seconds.

## Lessons Learned

1. **"Fake instant" breaks trust faster than honest latency.** Optimistic UI is a strategy choice, not a default. Only reserve it for sub-100ms swaps where the user genuinely cannot perceive the transition (e.g. quantity number updates within text, not entire line items animating in then mutating color/text). The ATC drawer and line-item mutations are too big and too slow to hide with optimistic UI. Future feature requests should start with "can we reduce actual latency?" not "can we paper over latency?"

2. **CSS cascade is a third-party regression surface.** When a third-party app (Globo, Stamped, Yotpo) injects DOM into a container you control, parent-level CSS state is a gun. `visibility:hidden` and `display:none` on a parent affect every async-injected child invisibly. Mitigation: hide *siblings* only, or use `min-height` + layout reservation so neither app nor parent layout impacts each other. Hide parents only when you own the entire subtree.

3. **Third-party app integrations need deterministic server-side signals.** Building features that depend on async-app-injection timing (like the 1.5s reveal-timer) is fundamentally racy. If Globo is enabled site-wide, ask: does Globo expose a Liquid metafield or setting? If yes, check server-side and skip the timer entirely. If no, reserve vertical space with `min-height` so both Dawn and Globo have guaranteed layout slots regardless of who paints first. Option 2 is the YAGNI answer for R3-1.

4. **"Done" means observable in user screen recording.** Code-reviewer-approved + theme-check-clean + deployed-to-preview is NOT done. This is from the phase-06 success criteria and proved out: verification caught the cascade bug that code review missed. Honor the iPhone screen-recording gate for future iterations. Don't trust review gates alone on visual/latency features.

5. **Halt rule paid off.** The phase plan said: "Single round of iteration max — if round-3c also fails, halt and reset plan." User invoked it. We're halting now instead of iterating 4–7 more times on the Globo cascade (what's wrong? is it CSS? is it timing? is it form-binding? is Globo disabled? is device cache stale?). Setting that explicit halt boundary at the start of phase-06 avoided the iteration hell of round-3b repeating.

## What Survives Round-3c

Keeping these in production (verify-tool infrastructure, not feature code):
- **Build-tag** (top-right 6-digit epoch) — cache-bust signal. Works. Cheap to leave on preview indefinitely.
- **Error overlay** (red fixed div, 5s auto-dismiss) — silent-throw surface for Mobile Safari. Didn't fire because the failure was CSS rendering, not JS throw. Still valuable for future iteration.
- **JSON product data island** (`<script id="dop-product-data">`) — deterministic data source. Clean pattern. Might be useful for a future cart feature. Keep it.

**Archived for learning:**
- Code-reviewer report (shows what review caught and what it missed)
- Deploy-moment journal (17:30 entry showing confidence, setup for 18:03 contradiction)
- This halt journal (documenting the third strike + plan reset)

## What Gets Thrown Out (Next Plan)

- `[data-dawn-vs]` wrapper + reveal-if-no-Globo timer (Globo regression cause)
- `injectOptimisticAtcLine` + `.dop-li-optimistic` (rejected strategy)
- `optimisticLineUpdate` qty spinner (also "fake animation" by the user's standard)
- The whole optimistic-perception thrust on ATC (rounds 3a/b/c, all rejected)

## Next Steps

**Halt rule invoked.** Phase-06 is over. Plan reset for round-4 will:
1. Investigate actual `/cart/add.js` latency breakdown (network DNS+TLS, server-side section render, asset preload contention, theme JS pre-fetch?). User's cellular baseline vs. LAN.
2. Evaluate Shopify's native `cart-bubble` Section Render API — is it faster than manual fetch+swap?
3. For R3-1 (CLS): use `min-height` reservation on the swatch slot so both Dawn and Globo have guaranteed space. No visibility tricks, no timers, no regressions.
4. For ATC and qty feedback: honest loading states. No optimistic UI.

**Preserve:** build-tag, error overlay, JSON island (cost us nothing after round-3c ships).

**Owner:** escalate latency baseline investigation to round-4 planner. This requires profiling on actual Dopamiles store with Globo enabled and network throttling. Can't guess the bottleneck.

## Unresolved Questions

1. What's the actual `/cart/add.js` latency breakdown on Dopamiles cellular? (Network, server render bundle, theme JS execution, all above?)
2. Does Shopify's `cart-bubble` Section Render API allow subsetting the response (only open drawer, skip cart-page)?
3. Can we set fixed `min-height` on the Globo swatch slot that fits both Dawn and Globo so first-paint reserves space deterministically?
4. Does Globo expose a Liquid metafield/setting for "app enabled on this product"? Would eliminate the 1.5s timer race for R3-1.
5. For user's next round: does "real performance" mean sub-200ms ATC? Sub-100ms? Or just "honest loading state, no fake instant UI"?

---

**Status:** HALTED — Plan reset required  
**Decision maker:** User (invoked halt rule at 18:03)  
**Entry recorded:** 2026-05-09 18:03 ICT  
**Next artifact:** Round-4 plan TBD (latency investigation → redesign approach)
