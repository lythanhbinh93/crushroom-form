---
title: "POD Brand Dashboard — P2"
description: "Multi-brand workspace, 12-month backfill, marketing/product view"
status: pending
priority: P2
effort: 35-45h
branch: claude/add-photo-upload-tool-p3dI0
tags: [pod-dashboard, multi-tenant, etl, marketing-view]
created: 2026-05-06
---

# POD Brand Dashboard — P2

## Goal
Lift P1 from single-brand 90d to **2-5 brands × 12-month** with per-product/variant marketing view. Stay <$25/mo, preserve P1 RLS guarantees, no UI rewrite.

## Source of truth
- P1 plan: `plans/260504-1115-pod-brand-dashboard-p1/plan.md`
- P1 onboarding: `pod-dashboard/docs/pod-dashboard-onboarding.md`
- P1 architecture: `pod-dashboard/docs/system-architecture.md`
- Code repo: `d:/github local/pod-dashboard` (separate from this plans repo)

## Locked decisions (from P2 interview + research)
- **Schema:** `workspace_id` already on every P1 table — keep row-tenancy via RLS. NO schema migration to brand_id; "workspace = brand" is the existing convention. P2 just renames UX-facing label "workspace" → "brand" and removes the single-workspace assumption in code.
- **Permissions:** explicit per-user per-workspace grants via existing `workspace_members` table (already supports it). Owner UI in Settings → Members.
- **Brand switcher:** top-nav dropdown, persists selection in cookie (`active_workspace_id`). NOT URL-segmented (avoids rewriting every route + middleware).
- **12-month backfill:** reuse existing GHA backfill workflow (date-chunked, resumable). Per-brand on-demand, NOT auto-run on all 5. Cost-bounded by chunk size + sequential per-brand.
- **Marketing view scope:** product list with revenue + ad spend + COGS + variants; ad attribution via Meta `ad_id` ↔ Shopify `utm_content` (requires onboarding step to enforce UTM template). NO best-creative-of-creative-asset view (Meta API does not expose a clean creative→product map).
- **Storage budget:** 5 brands × 365d realistic load = ~250 MB Postgres (math in phase-02). Stays on Supabase free tier; Pro upgrade only if breached.
- **Out of P2:** team chat / comments, mobile-first design, MCP, automated alerts, anomaly detection, BigCommerce/WooCommerce.

## Migration registry
P2 uses sequential migrations to track schema changes per phase. Avoids collision with future phases:
- **Phase 01:** 0001-0007 (workspace foundation, RLS, initial RPC)
- **Phase 02:** 0008 (workspace RPC), 0009 (drop meta raw + index), 0010 (table sizes RPC)
- **Phase 03:** 0011 (members management: RPC `add_workspace_member_by_email` + last-owner trigger + view)
- **Phase 04:** 0012 (shopify_product_variants + ETL tracking), 0013 (printify_variant_costs.sku)
- **Phase 05:** 0014 (product_pl matview, ad_product_map stub, RLS view, refresh RPC)
- **Phase 06:** 0016 (ad_product_map PK collapse + creative cache), 0017 (shopify_orders utm columns + landing_site extraction)

## Phases
| # | File | Status | Est. |
|---|------|--------|------|
| 01 | [phase-01-multi-brand-foundation.md](phase-01-multi-brand-foundation.md) | completed (Phase 01 shipped — multi-brand switcher + cookie + RPC) | 6-8h |
| 02 | [phase-02-storage-budget-and-12mo-backfill.md](phase-02-storage-budget-and-12mo-backfill.md) | completed (code shipped; operational measurement deferred to user) | 5-7h |
| 03 | [phase-03-members-and-permissions-ui.md](phase-03-members-and-permissions-ui.md) | completed (members UI shipped; smoke test user-owned) | 4-6h |
| 04 | [phase-04-product-catalog-pull.md](phase-04-product-catalog-pull.md) | completed (catalog + SKU-match shipped; smoke tests user-owned) | 6-8h |
| 05 | [phase-05-product-pl-view.md](phase-05-product-pl-view.md) | completed (product P&L view shipped; smoke test user-owned) | 6-8h |
| 06 | [phase-06-ad-to-product-attribution.md](phase-06-ad-to-product-attribution.md) | completed (ad attribution shipped; UTM coverage will be ~0% week 1, builds 30-90d) | 5-7h |
| 07 | [phase-07-soak-and-ship.md](phase-07-soak-and-ship.md) | pending | 3-4h |

## Definition of Done (Ship Gate)
- 2-5 brands switchable from top-nav dropdown; URL-bookmarkable per brand
- Owner can grant/revoke another user's access to specific workspaces from Settings → Members
- 12-month `daily_pl` populated for both existing brands; reconcile within ±1% on the most recent 30 days
- Product P&L view lists products with revenue, ad spend, COGS, net per row; sortable by net
- New brand onboarding (per `docs/pod-dashboard-onboarding.md`) still works end-to-end
- Supabase DB <400 MB after backfill of all live brands (80% of free tier)
- Cost: <$25/mo (Vercel free + Supabase free + GHA free)

## Cross-plan check
- P1 plan dir `plans/260504-1115-pod-brand-dashboard-p1/` is ship-complete, no overlap.
- No other active plan touches `pod-dashboard` repo.
- Repo placement settled in P1: code is at `github.com/lythanhbinh93/pod-dashboard`, plans stay here.

## Key risks (carried into phase docs)
1. **Cookie-based brand switcher race conditions** — server components read cookie before client navigates. Phase 01 mitigates with route-handler set-then-router-refresh pattern.
2. **12-month Meta backfill rate limits** — research shows 13mo is async-required cliff; 12mo stays in sync window but chunk size must be ≤7d. Phase 02.
3. **Storage growth on 5 brands** — Printify catalog snapshots are the heaviest table; phase-02 caps with TTL prune.
4. **Ad→product attribution depends on UTM discipline** — if user's existing ads lack `utm_content=ad_id`, mapping coverage will be patchy. Phase 06 ships an UTM gap report, not a hard fix.
5. **`getActiveWorkspace()` is called everywhere** — refactor must be surgical; one missed callsite = data leak between brands. Phase 01 enforces with grep guard in CI.

## Brainstorm-resolved decisions (2026-05-06)
See `plans/reports/brainstorm-260506-1200-pod-dashboard-p2-scope.md`.
- **Scope confirmed:** full 7-phase plan stands (user rejected lean-cut alternatives).
- **P&L drill depth:** 3-level (product → variant → ad creative).
- **Attribution:** Meta `creative_id` + UTM stitch (no manual mapping fallback).
- **UTM hygiene:** existing ads NOT tagged. User will fix going forward; no historical backfill.
  - **Phase 06 added requirement:** ship a visible "Attribution coverage: N%" indicator in marketing view UI. Expect ~0% week 1, building to 60-90% by ~90 days as new (tagged) ads drive new orders. Treat low coverage as feature-of-stage, not bug.
  - Product-level P&L (Phase 05) unaffected — Shopify orders + Printify COGS complete regardless of UTM.
- **Member invite flow:** "invitee logs in first" UX accepted; magic-link invite token deferred to P3.

## All open questions resolved (2026-05-06)
1. **Brand C for soak:** only 2 real brands exist. **Decision:** Phase 02 soak uses synthetic clones of Brand A (date-shifted, ID-rewritten) to simulate 5-brand load. Document caveat — synthetic data won't exercise real Meta/Shopify edge cases of a true third brand, but storage-budget validation is the only goal here.
2. **Refunds in product P&L:** **include**. Phase 05 must join Shopify `refund_line_items` → `order_line_items.product_id` and subtract from per-product revenue. `product_pl.net_profit = revenue - refunds - cogs - ad_spend - shopify_fees - allocated_app_subs`. Adds query complexity but matches "true net" parity with brand-day P&L.
3. **Shopify metafield namespace `pod_dashboard.printify_product_id` does NOT exist on existing brands.** **Decision:** Phase 04 pivots primary mapping strategy from metafield → **SKU-match** (Shopify variant SKU ↔ Printify variant SKU; both share SKU when Printify is sole fulfillment). Metafield support stays as opt-in/secondary. This may grow Phase 04 estimate from 6-8h → 8-10h. Document SKU-collision risk: if two products share a SKU, mapping is ambiguous → flag in dashboard.
4. **Pro tier trigger:** **defer to phase-02 measured data**. User has no preference yet. Phase 02 must report real DB size; if >450 MB, escalate decision to user with concrete numbers (Pro $25/mo fits ceiling vs. aggressive rollup + R2 cold-storage).
