# Scout: pod-dashboard Phase 05 (Dashboard UI) Ground Truth

**Date:** 2026-05-05 | **Status:** READY FOR PHASE 05

---

## PUNCH LIST: Already Exists vs. Phase 05 Must Add

### Already Exists ✅
- **App Router structure:** `app/(app)/layout.tsx` + `page.tsx` with header, workspace context, auth check ✓  
- **Auth pipeline:** Supabase magic-link login + callback route fully wired, session in cookies ✓
- **Supabase server client:** `lib/supabase/server.ts` RLS-aware; `lib/workspace.ts` exports `getActiveWorkspace()` ✓
- **SQL schema:** Migration `0003_daily_pl_matview.sql` defines `daily_pl` materialized view + RLS view `daily_pl_view` ✓  
  All required columns: gross_revenue, orders, refunds, printify_cogs, shopify_fees, app_subs, meta_spend, meta_reported_revenue, meta_reported_purchases, net_profit ✓
- **Tailwind:** v4 installed (CSS-first), globals.css imported ✓
- **Testing:** Vitest configured (tests focus on ETL, not UI yet) ✓
- **Minimal dashboard:** `page.tsx` has P&L table + KPI stats; explicitly marked "Phase 05 replaces this with charted dashboard" ✓

### Phase 05 Must Add ⚙️
- **Chart library:** Tremor v3 has React 19 peer-dep issue → **evaluate Tremor v4 vs shadcn/ui+Recharts** at build time
- **Dashboard components** (`_components/` subdirectory):
  - `date-range-picker.tsx`, `kpi-card.tsx`, `hero-net-profit.tsx`, `trend-chart.tsx`
  - `pl-breakdown.tsx`, `attribution-check.tsx`, `missing-cogs-alert.tsx`, `refresh-button.tsx` (stub)
- **Data layer** (`_data/` subdirectory):
  - `get-pl-summary.ts`, `get-pl-trend.ts`, `get-attribution.ts`, `get-missing-cogs.ts`
- **Page refactor:** Replace inline table with hero layout + 3-col chart grid; wire date-picker
- **Refresh backend:** Wrap existing `refresh_daily_pl()` RPC in `app/api/etl/refresh` route (validates workspace membership)

### Surprises / Blockers 🚨
1. **No chart library installed:** Tremor choice explicitly deferred in CLAUDE.md; must test React 19 compat before commit
2. **No _components/ or _data/ directories yet:** File-colocation pattern under `app/(app)/`
3. **Attribution mismatch surfacing:** `daily_pl_view` has both `shopify_utm_*` (UTM-based) and `meta_reported_*` (Meta-reported); dashboard must surface the variance visually
4. **Missing-COGS detection:** May require schema extension or computed query; not yet automated in `daily_pl`
5. **Refresh UI button:** Must call service-role refresh via API route; cannot call directly from client

---

## Detailed Findings

### 1. App Directory Structure & Auth Flow
```
app/(app)/layout.tsx         → Header + workspace context (getActiveWorkspace() call)
app/(app)/page.tsx           → Minimal P&L table (Phase 05 target for refactor)
app/(app)/settings/...       → Stub (credentials management)
app/(auth)/login/page.tsx    → Magic-link form
app/auth/callback/route.ts   → OTP exchange, session cookie set
app/api/health/route.ts      → Health check
```

Auth: Login → OTP → callback (sets cookie) → getActiveWorkspace RPC → redirect /. Session persists in cookies.

### 2. Supabase & Workspace Context
- **Server client:** `createSupabaseServerClient()` uses `@supabase/ssr` + cookies; RLS-aware
- **Service client:** `createSupabaseServiceClient()` bypasses RLS (service_role key); ETL-only
- **Workspace lookup:** `getActiveWorkspace()` from `lib/workspace.ts`  
  Calls `bootstrap_workspace_for_user()` RPC to create default "My Brand" on first login.  
  Returns { id, name, role }. Safe redirect to /login if no session.

### 3. daily_pl Schema: Columns & Related Tables
**Materialized view columns:**
- workspace_id, date (UTC), gross_revenue, orders, refunds
- printify_cogs, shopify_fees, app_subs
- meta_spend, meta_reported_revenue, meta_reported_purchases
- shopify_utm_orders, shopify_utm_revenue
- net_profit (derived: gross_revenue - refunds - cogs - fees - app_subs - meta_spend)

**Related tables:**
- shopify_orders (workspace_id, created_at, subtotal, financial_status, utm_source, order_id)
- shopify_transactions, shopify_refunds, printify_orders
- meta_ad_insights_daily (workspace_id, date, spend, meta_reported_*)
- app_subscriptions (workspace_id, monthly_cost, active_from, active_to)

**Access:** RLS-filtered view `daily_pl_view` with `security_invoker=true`, filters by `is_workspace_member()`. Service-role can refresh; authenticated users read via view only.

### 4. UI Dependencies in package.json
- Next 16.2.4, React 19.2.4, TypeScript 5, Tailwind 4
- date-fns 4.1.0, Zod 4.4.3
- Vitest, ESLint
- **Tremor, Recharts, shadcn/ui:** NOT installed (deferred to Phase 05)

### 5. Current page.tsx
- Reads `daily_pl_view` last 90 days
- Renders KPI stats (5-col grid) + data table
- Inline `Stat`, `Th`, `Td` helpers → extract to components
- Comment: "Phase 05 replaces this with a charted dashboard"

### 6. Testing
- `tests/` has only connector + shared utility tests (no UI tests)
- Vitest configured; ready for component tests if time permits

---

## Summary: Phase 05 Ready to Ship

**Green lights:**
- Auth + RLS fully functional; server client + workspace context centralized ✓
- `daily_pl_view` schema complete; all columns present ✓
- Tailwind ready; CSS baseline in place ✓
- Page structure allows iterative refactor ✓

**Decision:** Chart library choice (Tremor v4 vs Recharts+shadcn) before first commit.

**Deliverables:**
- `app/(app)/_components/`: 8 components (date-picker, kpi-card, hero, trend, breakdown, attribution, alert, refresh)
- `app/(app)/_data/`: 4 query functions (summary, trend, attribution, missing-cogs)
- Refactor page.tsx to dashboard layout; wire pickers to data functions
- Wrap `refresh_daily_pl()` RPC in API route for refresh button

**Effort:** 2–3 days (design + build + polish).

