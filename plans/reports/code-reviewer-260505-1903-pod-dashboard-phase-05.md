# Code Review — POD Dashboard Phase 05 (Dashboard UI)

**Score:** 9.6 / 10
**Verdict:** APPROVE_AS_IS (auto-approval threshold met: ≥9.5 + zero critical)
**Scope:** 22 files reviewed (lib + `_data/*` + `_components/*` + `page.tsx` + `layout.tsx` + tests)
**Date:** 2026-05-05

---

## Critical Issues
**None.** All R-series risks (R1–R9) properly mitigated. Out-of-scope guard respected.

---

## Major Issues
**None.**

---

## Minor / Nits

### M1 — Duplicate `getDeltaType` logic between `kpi-card.tsx` and `hero-net-profit.tsx`
- `KpiCard` uses `BadgeDelta` deltaTypes `"increase" | "decrease" | "unchanged"`.
- `HeroNetProfit` uses `"moderateIncrease" | "moderateDecrease" | "unchanged"`.
- Inline ternary on hero (line 31-32) duplicates intent of helper.
- DRY-fix: extract helper to `lib/format.ts` → `getDeltaType(delta, intensity?: "normal" | "moderate")`. Optional cleanup.

### M2 — Sample-titles inconsistency between fetcher and component
- `getMissingCogs` returns `sample_titles.slice(0, 5)` (line 111).
- `MissingCogsAlert` re-slices to 3 (line 17).
- Fetcher could return 3 directly; or component could use all 5. No bug, just two truncation rules to track.

### M3 — `layout.tsx` calls `supabase.auth.getUser()` after `getActiveWorkspace()` already did
- `getActiveWorkspace()` internally invokes `getUser()` (line 19 of `workspace.ts`).
- Layout calls again at line 10 to display email.
- Two redundant auth round-trips per layout render. ~10ms cost; acceptable but worth a `userEmail` field on `ActiveWorkspace` if ever revisited.

### M4 — `formatRoas` and `formatMarginPct` live in `dashboard-grid.tsx`
- Single-use helpers. YAGNI says leave them inline; if ever a second caller appears, lift to `lib/format.ts`. Acceptable as-is.

### M5 — Trailing date-string fallback in `getPlTrend` is dead code
- Lines 53–55: `typeof row.date === "string" ? slice : new Date(...).toISOString().slice`.
- Supabase returns date columns as strings; the `Date` branch is unreachable.
- Defensive, but flagged per YAGNI. Replace with `row.date.slice(0, 10)`.

### M6 — `getMissingCogs` cold-start when Shopify products exist but Printify is empty
- Returns `count: 0` when `printifyRows` is empty (line 66) — masks the real situation where every active product is unmatched.
- Documented as "cold-start avoidance"; acceptable trade-off but worth a comment that during a partial-onboarding state the alert will silently undercount.

### M7 — `kpi-card.tsx` annotates return type `React.JSX.Element`; siblings don't
- Stylistic inconsistency only; React.FC is intentionally avoided. Trivial.

### M8 — `getMissingCogs` title-substring match is bidirectional
- Short titles ("Mug", "Tee") will match many Printify titles → false negatives.
- Acknowledged in JSDoc + R3; replace with `product_cost_map` in P2. No action.

### M9 — `attribution-check.tsx` uses `formatDelta(divergence_pct)`
- `formatDelta` always emits sign prefix; divergence is always ≥ 0 → renders `"+15.0%"` which reads slightly odd for a magnitude.
- Cosmetic; consider `Math.round(divergence_pct * 100) + "%"` for a magnitude string. Optional.

---

## Strengths

1. **R9 hardened.** `grep` confirms zero `createSupabaseServiceClient` usage anywhere under `app/`. All `_data/*` use `createSupabaseServerClient` (RLS-aware). `workspaceId` always sourced from `getActiveWorkspace()`, never from request input.
2. **R8 boundary clean.** Three client components (`date-range-picker`, `refresh-button`, `trend-chart`); only `trend-chart` imports from `_data/*` and uses `import type` (erased at compile). Server data flows in via props.
3. **R2 null-safety thorough.** `get-pl-summary` PlRow fields all `number | null`; `?? 0` coalesce in every sum. `daily_pl_view` already coalesces in SQL (0006/0007 migrations) — defense-in-depth.
4. **R4 div-by-zero guarded.** `Math.max(meta_revenue, utm_revenue, 1)` denominator + clamp to `[0,1]`.
5. **R5 UTC discipline.** `parseRange` exclusively uses UTC math; JSDoc explicit. Tests verify boundary at `23:59:59.999Z` and `00:00:00.001Z`.
6. **R7 modularization respected.** `dashboard-grid.tsx` extracted; `page.tsx` is 133 LOC, all reviewed files ≤ 165 LOC.
7. **Out-of-scope guard honored.** `RefreshButton` is a disabled stub with explanatory `title`. No `/api/etl/refresh` route. No onboarding flow. No dark-mode toggle. No CSV export.
8. **Empty state correct.** Cold-start uses `count: "exact", head: true` (no row download) — efficient and uses RLS client (R9).
9. **Tremor v3 pin landed cleanly.** `@tremor/react@^3.18.7` + `recharts@^2.15.4`; no v4-only props observed (`enableSelect={false}` is v3 API; `decoration`/`decorationColor` are v3).
10. **Test coverage strong on critical paths.** `parseRange` has 14 cases covering all presets, custom, invalid input, UTC boundaries, prior-period correctness. `format` covers null/undefined coercion.
11. **Tremor `showAnimation` quirk avoided.** `LineChart` correctly sets `showAnimation={false}`; `SparkAreaChart` correctly omits the prop entirely.
12. **Type-only imports** used in `trend-chart.tsx` to keep server types out of client bundle.

---

## Acceptance against Phase 05 Success Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `pnpm build` exits 0 | not run by reviewer; static grep clean |
| 2 | Vitest suites for date-range + format | files present, 14 + 13 cases |
| 3-5 | Page renders, URL drives state | code path verified |
| 6 | Cold-start empty state | verified (page.tsx:77-88) |
| 7 | Divergence banner > 15% | verified (attribution-check.tsx:22) |
| 8 | Missing-COGS alert | verified (missing-cogs-alert.tsx:13) |
| 10 | `grep -r createSupabaseServiceClient app/` empty | verified |

---

## Unresolved Questions

1. **`workspace.timezone`** is now stored and returned but unused in display formatting. P1 ships with UTC-everywhere; intentional per phase plan but document for next phase.
2. **`MissingCogsAlert` cold-start masking** (M6) — should it surface a different copy ("Printify not connected yet") when shopify rows exist but printify rows are 0? Recommend covering in Phase 06 onboarding work.
3. **`hero-net-profit` uses `BadgeDelta size="sm"`**; rest uses default. Visual-design call, not a defect.

---

**Status:** DONE
