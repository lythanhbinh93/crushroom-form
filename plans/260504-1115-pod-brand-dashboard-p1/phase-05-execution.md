# Phase 05 — Execution Refinement

**Parent:** [phase-05-dashboard-ui.md](phase-05-dashboard-ui.md) · **Repo:** `D:\github local\pod-dashboard`
**Scout:** [scout-260505-1903-pod-dashboard-phase-05.md](../reports/scout-260505-1903-pod-dashboard-phase-05.md)
**Status:** ready-to-execute · **Total est:** 12-14h · **Critical path:** T1 → T2 → T4 → T7 → T11 → T13

---

## Ticket List (executable order)

| ID | Intent | Files | Depends | Acceptance | Est |
|----|--------|-------|---------|------------|-----|
| **T1** | Install chart deps + format helpers | `package.json`, `lib/format.ts` (new) | — | `pnpm add @tremor/react@^3.18 recharts@^2` succeeds; `formatCurrency(123, "USD")` returns `"$123.00"`; `formatDelta(0.12)` returns `"+12.0%"` | 30m |
| **T2** | URL search-param contract + range parser | `lib/date-range.ts` (new) | T1 | `parseRange({since,until,preset})` returns `{since: Date, until: Date, preset: "yesterday"\|"today"\|"7d"\|"mtd"\|"30d"\|"custom", priorSince, priorUntil}`. Unit test: 6 presets + custom + invalid fallback to yesterday | 60m |
| **T3** | Extend workspace lookup with currency + tz | `lib/workspace.ts` (edit) | — | `getActiveWorkspace()` returns `{id, name, role, currency, timezone}` (additive, no callers break) | 30m |
| **T4** | `get-pl-summary.ts` data fn | `app/(app)/_data/get-pl-summary.ts` (new) | T2, T3 | Given `(wsId, since, until)` returns `{gross_revenue, refunds, printify_cogs, shopify_fees, app_subs, meta_spend, net_profit, orders, prior: {…same shape}}` summed from `daily_pl_view`. Single round-trip OK (two `.from().select()` calls in `Promise.all`) | 60m |
| **T5** | `get-pl-trend.ts` data fn | `app/(app)/_data/get-pl-trend.ts` (new) | T3 | Returns `Array<{date, net_profit, gross_revenue, meta_spend}>` for last 30 days ending at `range.until`; sorted asc | 45m |
| **T6** | `get-attribution.ts` data fn | `app/(app)/_data/get-attribution.ts` (new) | T2, T3 | Returns `{meta_revenue, meta_purchases, utm_revenue, utm_orders, divergence_pct}`. Formula: `divergence_pct = abs(meta_revenue - utm_revenue) / max(meta_revenue, utm_revenue, 1)` | 45m |
| **T7** | `get-missing-cogs.ts` data fn | `app/(app)/_data/get-missing-cogs.ts` (new) | T3 | Returns `{count: number, sample_titles: string[] }`. Query: active `shopify_products` for workspace where no row in `printify_products` matches by SKU/title heuristic. Uses RLS view; no service-role | 60m |
| **T8** | `kpi-card.tsx` component | `app/(app)/_components/kpi-card.tsx` (new) | T1 | Props: `{label, value, delta?, sublabel?, accent?}`. Renders Tremor `Card` + `BadgeDelta`. No data fetching | 45m |
| **T9** | `hero-net-profit.tsx` component | `app/(app)/_components/hero-net-profit.tsx` (new) | T1, T8 | Props: `{value, delta, sparklineData, currency}`. Larger card with `SparkAreaChart`. Negative net = rose accent | 45m |
| **T10** | `date-range-picker.tsx` (client) | `app/(app)/_components/date-range-picker.tsx` (new) | T2 | `"use client"`. Preset chips + custom range. `useRouter` + `useSearchParams` to push `?preset=…` or `?since=…&until=…`. Default: yesterday. URL is single source of truth | 75m |
| **T11** | `trend-chart.tsx` (client) | `app/(app)/_components/trend-chart.tsx` (new) | T1, T5 | `"use client"`. Tremor `LineChart` with 3 series: net_profit (primary), gross_revenue, meta_spend. Y-axis currency formatted | 60m |
| **T12** | `pl-breakdown.tsx` component | `app/(app)/_components/pl-breakdown.tsx` (new) | T1, T4 | List rows: Revenue (+), Refunds (−), COGS (−), Shopify fees (−), App subs (−), Ad spend (−), **Net profit** bold. Uses Tremor `BarList` for visual bars; signed labels | 60m |
| **T13** | `attribution-check.tsx` component | `app/(app)/_components/attribution-check.tsx` (new) | T6 | Two-column block. Banner if `divergence_pct > 0.15`. No banner = silent agreement | 45m |
| **T14** | `missing-cogs-alert.tsx` component | `app/(app)/_components/missing-cogs-alert.tsx` (new) | T7 | Renders only if `count > 0`. Red banner with link to `/settings/credentials`. Returns `null` otherwise | 30m |
| **T15** | `refresh-button.tsx` stub (client) | `app/(app)/_components/refresh-button.tsx` (new) | — | `"use client"`. Disabled button labelled "Refresh (Phase 06)". Phase 06 wires the action. Stub-only — no fetch | 15m |
| **T16** | Empty-state component | `app/(app)/_components/empty-state.tsx` (new) | — | Props: `{title, body, ctaHref, ctaLabel}`. Pure presentational | 20m |
| **T17** | Page composition + layout grid | `app/(app)/page.tsx` (replace body) | T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16 | Server component. `Promise.all` 4 data fns. Renders: header row (date picker + refresh stub), hero card, KPI grid (5 cols → 2 cols mobile), trend chart full-width, 2-col bottom (P&L breakdown + attribution), missing-COGS alert above hero | 90m |
| **T18** | Layout header tweak (workspace currency badge) | `app/(app)/layout.tsx` (edit) | T3 | Header shows `{workspace.name} · {workspace.currency}`. No new components | 15m |
| **T19** | Empty-state wiring in page | `app/(app)/page.tsx` (edit) | T17 | If summary returns all zeros AND `daily_pl_view` count for workspace = 0 → render `<EmptyState>` with CTA to `/settings/credentials`. Otherwise render dashboard | 30m |
| **T20** | Smoke-test: run dev, screenshot, compare to ASCII mock | manual + `pnpm dev` | T17, T19 | Dashboard renders without console errors; numbers match `daily_pl_view` for "yesterday" preset; URL changes on preset click; mobile (Chrome devtools 375px) collapses to 1-col | 45m |

**Total: 12.5h** (excludes context-switch overhead).

---

## Sequencing Groups

### Wave 1 — Foundations (parallel, no shared files)
T1, T2, T3 — independent. **Block T4-T17.**

### Wave 2 — Data layer (parallel after Wave 1)
T4, T5, T6, T7 — all create new files in `_data/`. No conflicts. **Block T17 page composition.**

### Wave 3 — Components (parallel after Wave 1)
T8, T9, T10, T11, T12, T13, T14, T15, T16 — distinct files in `_components/`.
- T9 depends on T8 (uses `KpiCard` shell — confirm import order).
- T10 only needs T2 (date-range parser); can start immediately after Wave 1.

### Wave 4 — Composition (sequential)
T17 → T18 → T19 → T20. Same `page.tsx` and `layout.tsx`; cannot parallelize.

### Critical path
T1 → T2 → T4 → T17 → T19 → T20 (~5h serial; remainder parallel). With one developer, total ~12-14h matching plan estimate.

---

## Resolved Decisions

### D1 — Tremor v3 vs Recharts split
**Pin Tremor v3.18 (last stable React 18-compat with peer warning override).** Use `pnpm add @tremor/react@^3.18 recharts@^2 --legacy-peer-deps` if React 19 peer-dep blocks install.
- **Tremor:** `Card`, `BadgeDelta`, `LineChart`, `SparkAreaChart`, `BarList`, `DateRangePicker`. Covers 95% of UI.
- **Recharts (raw):** only if Tremor's `LineChart` y-axis currency formatter rejects custom locale; fallback for `pl-breakdown` waterfall if `BarList` insufficient.
- **Why not Tremor v4:** alpha at this time, breaking API changes; Tremor v3 is battle-tested.
- **Why not shadcn+Recharts only:** doubles ticket count (T8/T9/T11/T12 all hand-rolled). YAGNI.
- **Escape hatch:** if Tremor v3 install fails twice, swap to `recharts` only and hand-roll cards with Tailwind. Add 3h to estimate.

### D2 — Currency formatting source
**Workspace row.** `lib/format.ts` exports `formatCurrency(n: number, currency: string, locale = "en-US")`. Page passes `workspace.currency` (already in DB, default `'USD'`) into every KPI/hero. **No `Intl` locale negotiation in P1** — hardcoded `"en-US"` for number grouping. P1 users are English-speaking.
- **Why:** workspace already stores currency (migration 0001:13). Adding per-user locale is YAGNI.

### D3 — URL search-param contract
**Two mutually exclusive modes:**
- Preset: `?preset=yesterday|today|7d|mtd|30d`
- Custom: `?since=YYYY-MM-DD&until=YYYY-MM-DD` (ISO date, no time)

`parseRange()` precedence: explicit `since`+`until` wins; else `preset`; else default `yesterday`. Invalid input → fall back to `yesterday` (no error UI). Comparison period (prior) auto-derived: same length, immediately preceding.

### D4 — Empty-state strategy
**Two-tier:**
1. **Cold start (zero rows ever):** `count(*) from daily_pl_view where workspace_id = $1` returns 0 → render `<EmptyState>` "No data yet — set up credentials" with CTA to `/settings/credentials`.
2. **Warm but range empty:** zeros in summary but rows exist outside range → render dashboard with `$0` values + small note "No data in this range. Try Last 30d." No CTA.

Detection happens in T19; one extra count query (~5ms). Cheaper than reusing summary.

### D5 — workspace_id source in server components (re-confirmed from scout)
**`getActiveWorkspace()` in `lib/workspace.ts`.** Already wired. Layout calls it once; page calls it again (cheap — RPC + 2 selects, ~50ms). No prop-drilling. **Never trust client input for `workspace_id`.** All `_data/*` functions take `workspaceId: string` as first arg.

---

## Risk Register (delta from parent plan)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Tremor v3 React 19 peer-dep blocks install | High | Medium | T1 has fallback path: `--legacy-peer-deps` flag; if still blocks, swap to Recharts-only (D1 escape) |
| R2 | `daily_pl_view` returns no rows on cold start; UI crashes on `null` aggregates | Medium | High | T4 coalesces `null → 0` in SQL; T19 explicit empty-state check |
| R3 | Missing-COGS query has no canonical join key (Shopify SKU vs Printify product_id format) | High | Medium | T7: heuristic match by SKU substring + title fuzzy. Document as "best-effort" in JSDoc; refine in Phase 07. **Scout flagged: not yet automated in `daily_pl`** |
| R4 | Attribution divergence formula edge case: zero meta_revenue but non-zero utm_revenue → div by 0 | Medium | Low | T6 uses `max(meta, utm, 1)` denominator |
| R5 | Server-side date math drifts vs workspace timezone (DB is UTC, user sees local) | Medium | Medium | T2: all date math in UTC; display formatter uses workspace.timezone. Document boundary in `date-range.ts` JSDoc |
| R6 | Tremor `DateRangePicker` ships its own date-fns version; bundle bloat / dup | Low | Low | Accept; revisit in Phase 07 polish |
| R7 | T17 page composition becomes >200 LOC (modularization rule violation) | High | Low | Split layout grid into `app/(app)/_components/dashboard-grid.tsx`. Add as T17a if line count exceeds 180 |
| R8 | "use client" boundary leaks server data fetch into client (`get-pl-trend` called from `trend-chart`) | Medium | High | Data fetched in `page.tsx` (server), passed as serializable props to client `trend-chart`. Lint rule: no `_data/*` import inside `_components/*` |
| R9 | RLS bypass risk if dev accidentally uses `createSupabaseServiceClient()` in `_data/*` | Low | Critical | Code review checkpoint at T20; grep guard: `grep -r "createSupabaseServiceClient" app/` must be empty |

---

## Out-of-Scope Guard (DO NOT BUILD in Phase 05)

| Feature | Belongs to |
|---------|-----------|
| Refresh button **action** (POST to `/api/etl/refresh`, mutation, toast) | Phase 06 |
| `app/api/etl/refresh/route.ts` route handler | Phase 06 |
| Service-role refresh RPC wrapper | Phase 06 |
| Onboarding flow / first-run wizard | Phase 07 |
| Magic-link email customization | Phase 07 |
| Dark mode toggle | Phase 07 |
| Mobile-first redesign (custom breakpoints beyond Tailwind defaults) | Phase 07 / out of P1 |
| Lighthouse score >85 polish (font preloading, image opts) | Phase 07 |
| Brand switcher / multi-workspace UI | out of P1 |
| Winning ads / winning products tabs | out of P1 |
| Export CSV / PDF | out of P1 |
| Weekly smoothing toggle on trend chart | Phase 07 backlog |
| Component-level Vitest tests | Phase 07 if time permits |
| Currency switcher UI | out of P1 (workspace row only) |

**Rule:** if a ticket grows to include any of the above, stop and re-scope.

---

## Rollback Plan

Per-ticket atomic commits. Rollback = `git revert <sha>`.
- T17 (page composition) is the only **destructive** edit (replaces existing `page.tsx` body). Snapshot current `page.tsx` to `app/(app)/page.tsx.phase04-snapshot` before T17 edit; delete after T20 passes.
- T18 (layout header tweak) is additive; trivially revertable.
- T1 (deps) — if Tremor breaks build, `pnpm remove @tremor/react` reverts.
- DB migrations: **none in Phase 05.** Zero schema risk.

---

## Test Matrix

| Layer | Coverage | Tool |
|-------|----------|------|
| `lib/date-range.ts` | 6 presets + custom + invalid fallback (8 cases) | Vitest unit |
| `lib/format.ts` | currency, delta, signed | Vitest unit |
| `_data/get-pl-summary.ts` | one happy-path test with mocked Supabase response | Vitest unit (optional, deferred to Phase 07) |
| Page render | manual smoke per T20 | dev server + browser |
| RLS enforcement | manual: log in as workspace A, verify can't see workspace B data via URL tampering | manual at T20 |
| Mobile collapse | Chrome devtools 375px | manual at T20 |

**Required to ship:** date-range + format unit tests pass; T20 smoke checklist green.

---

## File Ownership (no parallel-edit conflicts)

| File | Tickets | Single-owner? |
|------|---------|----------------|
| `package.json` | T1 | yes |
| `lib/format.ts` | T1 | yes (new) |
| `lib/date-range.ts` | T2 | yes (new) |
| `lib/workspace.ts` | T3 | yes (edit) |
| `app/(app)/_data/*` | T4-T7 | yes (4 distinct files) |
| `app/(app)/_components/*` | T8-T16 | yes (9 distinct files) |
| `app/(app)/page.tsx` | T17, T19 | **sequential** (same file) |
| `app/(app)/layout.tsx` | T18 | yes |

---

## Success Criteria (measurable)

1. `pnpm build` exits 0; no TS errors.
2. Vitest: `lib/date-range.test.ts` + `lib/format.test.ts` pass.
3. `pnpm dev` → open `/` → no console errors; KPIs match a manual SUM of `daily_pl_view` for "yesterday".
4. Click each preset → URL updates → numbers update.
5. Set `?since=2026-04-01&until=2026-04-30` directly in URL → custom range applies.
6. With seeded zero rows: empty-state CTA renders.
7. With `meta_revenue` and `utm_revenue` differing >15% in test data: divergence banner shows.
8. With one Shopify product lacking Printify match: missing-COGS alert shows count = 1.
9. Chrome devtools 375px: layout collapses to single column, no horizontal scroll.
10. `grep -r "createSupabaseServiceClient" app/` returns zero matches.

---

## Unresolved Questions

1. **Missing-COGS join heuristic** — scout flagged "not yet automated in `daily_pl`". Is SKU-substring match acceptable for P1, or do we need an explicit `product_cost_map` table? Recommend P1 ships with heuristic + alert; introduce mapping table in P2.
2. **`workspace.timezone` usage in date display** — current `daily_pl` is UTC-bucketed. Should "yesterday" mean UTC-yesterday or workspace-local-yesterday? Recommend UTC-yesterday for P1 (matches ETL boundary); document in `date-range.ts`. User can revisit if data feels "off by one day" after first week.
3. **Tremor v3 + React 19 peer-dep** — actual install behavior unverified. T1 will discover at execution; D1 escape hatch documented.
4. **Component tests** — phase plan is silent. Recommend defer to Phase 07 to keep P1 scope tight; ship with manual T20 smoke + lib unit tests only.
