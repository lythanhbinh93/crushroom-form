# POD Dashboard P2 — Phase 06 Sync Report
**Date:** 2026-05-06 21:31 UTC  
**Phase:** 06 (Ad → Product Attribution)  
**Status:** COMPLETED + ISSUES RESOLVED

---

## Delivery Status

**Phase 06 shipped:** all code committed; 4 critical/high bugs identified in review + fixed post-review; 18 additional tests added. **Live, operational.**

### Metrics
- **Tests:** 45 Phase 06 (all PASS) + 18 follow-up (all PASS); 331 total / 339 (8 pre-existing Printify failures, unchanged)
- **Builds:** tsc clean, npm guard clean
- **Migrations:** 0016 (ad_product_map PK collapse + creative cache) + 0017 (utm columns + landing_site extraction) deployed
- **Code review score:** 6/10 → 8/10 after fixes (C-1, H-1, H-3, L-6)

---

## Issues Resolved (Post-Review)

| Severity | Issue | Root Cause | Fix | Tests Added |
|----------|-------|-----------|-----|------------|
| **CRITICAL** | `utm_content` column missing | `derive-utm-mappings` queried nonexistent column; `pull-shopify` never extracted from `landing_site` URL | Migration 0017 + new `extractUtmFromLandingSite()` helper in `pull-shopify.ts`; landing_site first, note_attributes fallback | 10 |
| **HIGH** | `orderAdMap` cross-workspace collision | Map keyed by order_id only; PK is (workspace_id, order_id) | Required workspaceId; composite key `${workspace_id}::${order_id}`; removed "all workspaces" path | 1 |
| **HIGH** | ISO string date comparison broken | `+00:00` vs `.000Z` mismatch broke 7-day cache (string < compare returned false when should be true) | `Number(new Date(...)) >= Number(staleCutoff)` — format-independent | 7 |
| **LOW** | Dead SQL injection vector | Unused `workspaceFilter` variable interpolating workspaceId into SQL | Deleted dead code (combined with H-1 pass) | — |

**Operational note on C-1:** Historical orders stay NULL until next Shopify pull. Manual mapping flow is load-bearing fallback for existing data.

---

## Plan Sync

✓ **phase-06-ad-to-product-attribution.md:**
  - Status: `pending` → `completed (codeable; live coverage measurement user-owned)`
  - Added "Completed: 2026-05-06"
  - Checked off all Todo items (✓) except Brand A smoke → marked `[~]` user-owned-operational
  - Appended "Code Review & Follow-ups" section with 6/10 score + C-1/H-1/H-3/L-6 fixes + deferred items (M-1 through M-6, L-1 through L-7)
  - Added "Recurring pattern flagged for memory": "Feature against missing data" struck Phase 04 (SKU column), Phase 06 (utm_content). Planning checklist: Before phase ships, dev MUST grep referenced columns exist OR migration adds them same phase.

✓ **plan.md:**
  - Phases table row 06: `pending` → `completed (ad attribution shipped; UTM coverage will be ~0% week 1, builds 30-90d)`
  - Migration registry extended: Phase 06 = 0016 + 0017

✓ **phase-07-soak-and-ship.md:**
  - Added to Risks: "Phase 06 utm_content shipped via 0017; historical orders NULL until next pull-shopify. Manual mapping load-bearing fallback."
  - Added to Risks: "Pre-existing 8 Printify test failures must be resolved before Phase 07 CI gate."
  - Added to Success Criteria: "Coverage banner displays sane number (not zero/divide-by-zero) on Brand A within 24h — verifies pull-shopify + derive-utm-mappings runs successfully."
  - Added to Success Criteria: "Printify failures resolved before Phase 07 CI gate."
  - Updated Soak gate.

---

## Unresolved Items (Deferred, Non-Blocking)

**Deferred to Phase 07 or P3:**
- **M-1:** utm_source predicate mismatch (legacy matview `%fb%` vs Phase 06 `facebook%`) — standardization P3 candidate
- **M-2 to M-6:** Race conditions, churn, audit trails — acceptable at Brand A scale or Phase 07 territory
- **L-1 to L-7:** UI polish, accessibility, index redundancy — no functional impact

**Printify test regression (8 pre-existing failures):** Flagged in Phase 07 gate. Tester report confirms unchanged from baseline.

---

## Cross-Checks

Migration sequence verified:
- 0016 applied safely on fresh deploy (empty table post-0015)
- 0017 adds column safely (idempotent, NULL backfill, index included)
- Ordering: pulls → mappings → matview refresh

Next phase (07) success criteria updated to verify coverage banner + smoke matrix on real data. Printify gate hardened.

---

## Blockers for Phase 07

None. Phase 06 code is live. Phase 07 gates:
1. Coverage banner sanity check on Brand A within 24h (operational)
2. Printify test failures resolved (may require separate fix task)
3. 1-week soak clean (no error rows in etl_runs)

---

**Status:** DONE  
**Summary:** Phase 06 complete + all critical issues fixed. Plan sync'd. Phase 07 gates documented. Live coverage measurement is user-operational (expect ~0% week 1, 30-90d ramp).
