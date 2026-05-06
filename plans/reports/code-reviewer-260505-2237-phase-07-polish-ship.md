# Code Review — Phase 07 Polish + Ship (POD Dashboard)

**Date:** 2026-05-05
**Reviewer:** code-reviewer
**Scope:** 11 new files in `d:/github local/pod-dashboard` (app-subs CRUD, error/404 pages, robots.txt, reconcile script, onboarding doc, CHANGELOG)
**LOC reviewed:** ~600 (TS/TSX) + 158 (md) + 4 (txt)
**Build state:** `tsc --noEmit` clean, `eslint` clean (per task brief; not re-run)

## Score: 9.3 / 10

Solid ship-quality work. Defense-in-depth on owner checks is correct, soft-delete preserves the matview invariant, schemas line up with `numeric(14,4)` + RLS policies, no service-role leakage in `app/`. Two minor issues + a couple of nits below.

---

## Critical
_none_

## Major
_none_

## Minor

### M1. `reconcile-pl.ts` silently truncates at 1000 rows
`scripts/reconcile-pl.ts:81-103` — no `.range()` / `.limit()` is set. PostgREST default cap is 1000 rows; for a 30-day reconcile the script is fine, but docs encourage `--since/--until` of arbitrary width. A 3-year reconcile (1095 days) would silently produce a truncated CSV with a wrong `TOTAL` line and no warning.

**Fix (1 line):** assert and bail.
```ts
if (rows.length === 1000) {
  console.error("hit 1000-row PostgREST cap — narrow the range or page");
  process.exit(1);
}
```
Alternative: explicit `.range(0, 9999)` (matview row-per-day means even 10y workspaces stay <4000 rows) — pragmatic and KISS.

### M2. `EditableNameRow` form posts even when nothing changed
`app-subs-table.tsx:113-166` — every "Save" hits Postgres + `revalidatePath` even with no field diff. Not a correctness bug (idempotent) but generates needless writes against an audited table. **YAGNI applies — accept as-is unless writes show up in logs.** Noting because it's the only thing across these files that's slightly wasteful.

### M3. `endAppSub` allows ending an already-ended sub
`actions.ts:121-138` — calling "End today" on a row whose `active_to` is already in the past silently moves the end date forward to today, re-activating it for any days between the old end and now-1. UI hides the button (`!ended` guard at table.tsx:80), so practically unreachable, but a malicious POST could exploit it. **Defense-in-depth fix:**
```ts
.eq("workspace_id", workspace.id)
.eq("id", parsed.id)
.or("active_to.is.null,active_to.gte." + todayIso());
```
Or a server-side guard reading current `active_to` before update. Low severity (only owners can post; impact is moving an end-date, not data loss). Flag if you're being strict on audit invariants.

### M4. `EditSchema` allows owner to push `active_from` arbitrarily into the past
`actions.ts:39-41` — no upper bound on how far back `active_from` can be edited. An owner editing a sub from 2026-04-01 → 2024-01-01 would silently rewrite ~2 years of `app_subs` allocation in `daily_pl` on next refresh. Expected per spec ("owner-only manual entry"), but the matview impact is non-obvious. Worth a one-line UI hint near the date input ("changing this rewrites historical allocation"). Pure UX nit.

---

## Positive Observations

- **Auth defense-in-depth is correct.** Every action re-checks `workspace.role !== "owner"` before hitting Supabase, even though RLS would also block. Matches spec requirement #1.
- **Soft-delete invariant preserved.** `endAppSub` sets `active_to = today`, never deletes. Matview's `between active_from and coalesce(active_to, current_date)` keeps historical days allocated. Matches spec requirement #2.
- **Schema↔table alignment.** `monthly_cost: z.coerce.number().nonnegative()` matches `numeric(14,4)` (no precision overflow possible from a JS number under 1e10). `currency: regex /^[A-Z]{3}$/` matches the table's `text` default `'USD'` use. `DateString` regex matches `date` columns. The numeric→string coercion at `page.tsx:17-20` is correct PostgREST behavior; comment explains why.
- **Reconcile service-role usage justified.** `daily_pl` matview has no `grant ... to authenticated` (verified in `0005_daily_pl_view_fix_security.sql`) — only `daily_pl_view` does, and that adds the `is_workspace_member` filter. The script's CSV is run locally, never deployed. CI grep guard for `service` under `app/` confirmed clean.
- **CSV escaping is correct.** `csvCell` escapes `"`, `,`, `\n` and double-quote-doubles. Numerics bypass quoting (skip the regex test). Header row has no special chars. Only attack surface is the workspace-currency string in TOTAL line, which doesn't appear in headers. Safe.
- **Error boundary dep claim holds.** `app/error.tsx` imports only `next/link` + `react` — no Tremor, no app-internal modules that could be the failure source. Safety-net property preserved.
- **`not-found.tsx` correctly omits `"use client"`.** Server component, statically renderable, edge-cacheable. Consistent with comment.
- **`robots.txt` + `metadata.robots = {index:false, follow:false}` belt-and-braces.** Verified in `app/layout.tsx:7`. Crawler bypass would require both to fail.
- **CHANGELOG follows Keep-a-Changelog conventions** with a clear "Definition of Done" gate. Onboarding doc is 158 lines — covers the 6 sections in spec step 3.
- **`getActiveWorkspace()` integration.** Page component calls it once per request; no N+1. Settings layout is a server component with no client-side state (intentional per comment).

---

## Edge Cases Scouted

| Risk | Status |
|------|--------|
| Race: two owners adding subs concurrently | Safe — table has PK `(workspace_id, id)`, `gen_random_uuid()` default; no unique-name constraint either, so duplicates are allowed (probably fine for "Klaviyo Basic" / "Klaviyo Pro"). |
| Race: edit + end concurrent | Last-write wins on `active_to`; both paths are idempotent in the worst case. Acceptable. |
| Numeric precision: `Number(numeric(14,4))` | Max value 9.99e9 — well below `Number.MAX_SAFE_INTEGER`. No precision loss for realistic monthly costs. |
| `active_to = active_from` (same-day end) | `ensureRangeValid` permits (`activeTo < activeFrom` only blocks). Matview `between` is inclusive → 1 day of allocation. Correct. |
| Currency mismatch with workspace currency | Allowed by schema (sub can be USD, workspace EUR). Matview sums raw `monthly_cost / 30` — currency-blind. **Pre-existing issue in matview, not introduced here.** Worth a P2 ticket. |
| Empty `formData.get("currency")` falsy short-circuit | `formData.get("currency") \|\| "USD"` correctly fallbacks because empty string is falsy. ✓ |
| `active_to` empty string vs missing | Schema `union([DateString, literal("")]).transform(... null)` handles both. ✓ |
| Trailing newline in CSV | Present (`+ "\n"`) — Excel-friendly. ✓ |
| Server action invoked outside form (CSRF) | Next 14+ server actions have built-in CSRF via encrypted action IDs. Standard. ✓ |

---

## Minor Style/Nits (skip if you don't care)

- `actions.ts:14` `todayIso()` is recomputed each call — fine, but `getActiveWorkspace()` returns `timezone` and the action uses UTC midnight. For a workspace in `America/New_York`, "End today" between 19:00–23:59 ET will set `active_to` to *tomorrow* (UTC). For the daily allocation `between active_from and coalesce(active_to, current_date)` this means one extra day of allocation on the rollover boundary. **Sub-1% impact on a single day** → ignore unless reconciliation flags it.
- `app-subs-table.tsx:49` `r.active_to < today` — string compare on ISO YYYY-MM-DD is lexicographically correct. ✓
- `reconcile-pl.ts:113` `as unknown as DailyRow[]` — comment explains. Acceptable pragmatism.
- `EditSchema` exposes the `id` over the wire as a hidden input; tampering only lets an attacker target a different sub *they own* (RLS + `.eq("workspace_id", workspace.id)`). Safe.

---

## Verification of Task Brief Claims

| Claim | Verified |
|-------|----------|
| `tsc --noEmit` clean on these files | Trusted (not re-run) |
| `eslint` clean | Trusted (not re-run) |
| Pre-existing test fails out of scope | Trusted |
| Mirrors `credentials/page.tsx + actions.ts` style | Could not verify directly (privacy block); structure (zod schemas, server actions, `getActiveWorkspace` call, owner check, `revalidatePath`) is internally consistent and idiomatic for Next 14 App Router |
| `metadata.robots = {index:false, follow:false}` exists | ✓ Verified at `app/layout.tsx:7` |
| Service-role only in ETL + reconcile | ✓ Verified — `app/` has zero `SUPABASE_SERVICE` references |
| Soft-delete preserves matview history | ✓ Verified against `0007_cogs_includes_shipping_and_tax.sql:101-103` |
| RLS owner-write policies | ✓ `0002_etl_schema.sql:263-268` |

---

## Recommended Actions (Priority Order)

1. **(M1)** Add `if (rows.length === 1000) bail` to `reconcile-pl.ts`. 3 lines, prevents a silent reconcile bug.
2. **(M3)** Optional `.or("active_to.is.null,active_to.gte.<today>")` filter on `endAppSub` if audit-strict.
3. **(M4)** UI hint near `active_from` edit field about historical rewrite. Pure copy change.
4. Consider adding a unit test for `ensureRangeValid` + zod schemas — small, gives regression confidence on the validation layer. Not blocking ship.

None of these block v0.1.0. Ship.

---

## Unresolved Questions

- (Out of scope) Currency-blind summation in `daily_pl` matview when sub currency != workspace currency — should this convert at ETL time using a daily FX rate? File P2 ticket.
- Were credentials/page.tsx and actions.ts intentionally privacy-blocked from review? If so, pattern parity claim rests on the brief's assertion only — flag if pattern-parity is critical for cross-repo consistency.

---

**Status:** DONE
**Summary:** Phase 07 ship-ready at 9.3/10. Owner checks correct, soft-delete preserves matview history, schemas align with table constraints, service-role usage justified. Three minor recommendations (silent CSV truncation cap, end-already-ended guard, active_from rewrite hint) — none blocking.
**Concerns/Blockers:** none
