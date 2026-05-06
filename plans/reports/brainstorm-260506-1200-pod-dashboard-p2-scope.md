---
type: brainstorm
date: 2026-05-06
slug: pod-dashboard-p2-scope
plan: 260506-1147-pod-dashboard-p2
status: approved
---

# Brainstorm — POD Dashboard P2 Scope Confirmation

## Context
P1 shipped (single-brand true-profit). User asked for a brainstorm sanity-check before committing to the planner's 7-phase output, citing "not get it too much" — concern the plan was over-engineered for actual POD operator needs.

## What was challenged
Brainstormer proposed trimming to **Lean Cut** (multi-brand switcher + per-product/variant P&L only, ~12-18h) and deferring permissions, 12mo backfill, Meta attribution, soak phase to P3.

## User's decisions (locked)
| Question | Choice |
|---|---|
| Scope | **Full 7-phase plan** — keep planner output as-is |
| P&L detail level | **Product + variant + ad creative** (3-level drill) |
| Attribution method | **Meta creative_id + UTM stitch** |
| UTM hygiene today | **Not tagged; will fix going forward** (no historical backfill of UTMs) |

## Implications

### Attribution coverage timeline
- **Week 1:** ~0% of orders carry `utm_content={{ad.id}}` → per-creative drill shows mostly nulls
- **Week 4-12:** coverage climbs as new ads (re-tagged) drive new orders
- **Steady state (~90d):** 60-90% coverage assuming all new ads tagged correctly
- **Mitigation:** Phase 06 must ship a visible "Attribution coverage: N%" banner so user understands why creative drill looks sparse early. Treat low coverage as a feature-of-stage, not a bug.

### Product-level P&L still works day 1
Shopify orders + Printify COGS are complete regardless of UTM. Phase 05 (product P&L) ships fully functional. Phase 06 (ad creative drill) is the only one degraded by UTM gap.

### Storage budget
Phase 02 storage model (~280 MB after mitigation) holds — UTM decision doesn't change row counts. Free tier still fits.

### Permissions UI
User accepted Phase 03 (members + permissions). Even though they're solo today, the multi-brand foundation needs the workspace_members table for RLS to make sense. Keep as planned.

## Plan status
**No restructure needed.** Existing 7-phase plan at `plans/260506-1147-pod-dashboard-p2/` stands. Update plan.md to:
1. Mark UTM-hygiene question as RESOLVED (option B chosen)
2. Add "attribution coverage indicator" requirement to Phase 06
3. Strike Q3 (magic-link invite token) as deferred to P3 unless user requests

## Approved approach
**Full 7-phase build**, 35-45h estimate, build order per planner. Phase 06 gets one extra requirement: visible attribution-coverage % in the marketing view UI.

## Unresolved questions (carried to plan.md)
1. Brand C identity for storage soak — real third brand or synthetic?
2. Refunds excluded from per-product P&L — confirm acceptable
3. Shopify metafield namespace — confirm `pod_dashboard` namespace on existing brands
4. If real measured DB exceeds 450 MB during Phase 02 soak (despite mitigation), pivot: Pro tier ($25/mo) vs aggressive aggregation rollups vs cold-storage to R2?

## Next step
User confirms → start Phase 01 (multi-brand foundation). No /ck:plan re-invocation needed; planner output is already good.
