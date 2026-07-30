# Phase 04 — Cleanup + region decision

**Depends on:** 01, 03

## Steps

1. **Remove `?authdiag=1` and `?perfdiag=1`** and their routing. Both were
   temporary and both are readable while signed out; leaving them on a public
   app is loose ends, not a feature.
2. **Record the region decision** in plan.md against phase 01's number:

   | Measured Cloud→Supabase RTT | Decision |
   |---|---|
   | under ~60ms | same region or close. Done; pooling was the whole fix. |
   | 60-150ms | pooling plus in-session tabs likely enough. Revisit only if the board still drags. |
   | over ~150ms | trans-Pacific. A US Supabase project halves the floor permanently — plan it separately, do not fold it in here. |

3. **Re-measure the acceptance criteria** on the deployed app, not locally.
   Local numbers are on the wrong side of the network and always look better.
4. Update `README.md` only if behaviour a user relies on changed — the nav
   losing Back is worth one sentence.

## Validation

Acceptance criteria 1-7 in [plan.md](plan.md), checked against the deployed
app with a browser.

## Risks

- **Removing the diagnostics before the numbers are recorded.** Do step 2
  before step 1.
- **Declaring victory on local timings.** The whole point of phase 01 is that
  the desktop is not the environment that was slow.
