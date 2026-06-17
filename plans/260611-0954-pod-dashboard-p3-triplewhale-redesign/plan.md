---
title: "POD Brand Dashboard - P3: Triple Whale-style Redesign"
description: "Evolve pod-dashboard into TW-class ops UI: dark sidebar shell, summary tile grid, conversion funnel (web pixel), creative cockpit, cohorts/LTV, anomaly alerts, AI chat."
status: pending
priority: P2
effort: 94-124h
branch: TBD-new-branch
tags: [pod-dashboard, analytics, shopify-web-pixel, meta-ads, ai-chat, redesign]
created: 2026-06-11
blockedBy: [260506-1147-pod-dashboard-p2]
blocks: []
---

# POD Brand Dashboard - P3: Triple Whale-style Redesign

## Overview
Evolve pod-dashboard (P1+P2: daily P&L, product P&L, UTM attribution) into a Triple Whale-class ops dashboard. Dark left-sidebar shell + light content; fixed tile sections (no per-user customize); AI chat as global slide-over; alerts as in-app bell; channels = Shopify + Meta + Printify only. Visual spec approved at `plans/260611-0810-.../mockup/index.html` (Tailwind-CDN — visual reference only, classes NOT copy-paste for repo Tailwind v4). Each phase ships independently behind existing nav.

## Phases
| Phase | Name | Status | Est | Owns migrations |
|-------|------|--------|-----|-----------------|
| 1 | [Web Pixel Sessions Ingestion](./phase-01-web-pixel-sessions-ingestion.md) | Pending | 18-24h | next free (0018 taken by ph03) |
| 2 | [Shell Sidebar Redesign](./phase-02-shell-sidebar-redesign.md) | ✅ Shipped (2026-06-13) | 8-11h | — |
| 3 | [Meta ETL Extension + Summary Tiles](./phase-03-meta-etl-extension-and-summary-tiles.md) | 🟢 Code-complete (2026-06-13; user-owned: apply 0018 + 90d backfill) | 12-16h | 0018 |
| 4 | [Funnel + Bounce Charts](./phase-04-funnel-and-bounce-charts.md) | Pending | 6-8h | — (reads aggregate directly) |
| 5 | [Products Columns + Creatives Cockpit](./phase-05-products-columns-and-creatives-cockpit.md) | ✅ Shipped (05a `93fba25` 2026-06-15 no migration; 05b `8f41b98` 2026-06-17 migration 0019; user-owned: apply 0019 + creative backfill) | 12-15h | 0019 (05b) |
| 6 | [Customers Cohorts + LTV](./phase-06-customers-cohorts-and-ltv.md) | Pending | 11-15h | 0021 |
| 7 | [Anomaly Alerts + Bell](./phase-07-anomaly-alerts-and-bell.md) | Pending | 8-10h | 0022 |
| 8 | [AI Chat Slide-over](./phase-08-ai-chat-slide-over.md) | Pending | 13-17h | 0023 |
| 9 | [Soak + Ship v0.3.0](./phase-09-soak-and-ship-v0-3-0.md) | Pending | 6-8h | — |

## Migration registry (latest on disk = 0019 as of 2026-06-17; next free = 0020)
Numbers are assigned by disk order at BUILD time, not reserved by phase (anti-drift rule). Phase 03 was built ahead of phase 01, so it claimed 0018 (the next free number then). Phase 01 will take the next free number when it is built.
| # | Phase | Purpose |
|---|-------|---------|
| 0018 | 03 | ✅ APPLIED 2026-06-15: `inline_link_clicks bigint NULL` on `meta_ad_insights_daily` (backfilled, verified) |
| 0019 | 05b | ✅ SHIPPED-PENDING-APPLY: `ALTER meta_ad_creative_cache ADD creative_id, creative_type, image_hash, permanent_url, thumbnail, effective_status` (6 cols — added effective_status for the cockpit Status column; no new table). Creative-cache write is NON-FATAL, so daily ETL stays green even before this is applied. User-owned: apply 0019 + creative backfill to populate thumbnails. (`8f41b98`) |
| next free (≥0020) | 01 | `pixel_events` (slim staging) + `daily_sessions` AGGREGATE rollup (PK workspace+date+is_bot+country) + RLS + prune fn; TZ policy doc block |
| 0021 | 06 | cohort key = customer `email` (backfill column from raw JSONB) + `customer_cohorts` matview + owner-view (invoker=false + embedded filter) + LTV RPC |
| 0022 | 07 | `alerts` table + RLS (select-for-members; dismiss-only RPC, NO generic UPDATE policy) |
| 0023 | 08 | single `chat_messages` (denormalized `workspace_id`; tool-rows = audit) + RLS (WITH CHECK role='user' on client inserts) + template RPCs |
Sequential, NO gaps. Phase 04 owns NO migration (funnel RPC deleted — reads aggregate `daily_sessions` directly). Each phase states its number explicitly. Planner has mis-numbered before — re-verify `supabase/migrations/` before authoring SQL. Note: stray non-numbered `supabase/migrations/_apply-0012-0013-bundle.sql` exists — EXCLUDE it from the phase-09 "no gaps" count check.

## Dependencies
- HARD: P2 phase-07 (soak + ship v0.2.0, incl. 8 failing Printify `orders.test.ts` fixes) MUST be green before P3 implementation starts. P3 planning proceeds now.
- Phase 04 consumes Phase 01 `daily_sessions` AGGREGATE grain directly via RLS select (no RPC, no migration); no backfill — sessions accrue only post-pixel-install; honest empty-states for past ranges.
- Phase 02 highest regression risk (touches every page) — land before 03-06 restyle work.
- Phase 08 sequenced LAST (only recurring-cost piece; security-review-mandatory).
- UNRELATED surface: separate in-flight plan `260530-1302-dopamiles-meta-feed-pixel-migration` installs Meta's OWN pixel app on the dopamiles storefront. Our Shopify Web Pixel (Phase 01) is additive + sandboxed; no file/scope overlap. Mentioned to prevent confusion.

## View/RPC security pattern (LOCKED — codebase convention, do NOT use security_invoker=true)
- This repo DELIBERATELY uses `security_invoker=false` + an embedded `where is_workspace_member(workspace_id)` filter + NO direct grant on underlying matviews (members have no SELECT on matviews; invoker=true broke prod TWICE — `0005_daily_pl_view_fix_security.sql:2-21`, `0015_product_pl_view_fix_security_invoker.sql:18`). Every new view/RPC over a matview MUST follow this pattern. Tenancy verified by per-surface test (member of workspace A cannot read B), NOT by "invoker=true".

## Conventions
- Code comments, migration filenames, test names MUST NOT reference plan artifacts (no "phase-03", no finding codes). Name by domain: `0018_pixel_events_sessions.sql`, `TestFunnelRollup_BotExcluded`. Explain the why (invariant/race/trade-off), not the origin.
- Honor YAGNI/KISS/DRY. Tailwind v4 (no `tailwind.config.*`); reuse existing `_components/ui/*`.
- All app reads via `createSupabaseServerClient()` (cookie-session RLS — NO bearer-JWT flow exists); service-role only in `etl/` + cron. The single sanctioned `app/` service-role exception is `app/api/pixel/route.ts`, added to the build-guard allowlist (reviewed in phase-08 security pass).

## User-owned operational steps (cannot be done in code)
- Phase 01 (USER-ASSISTED, critical path): existing `shpat_`-token custom apps CANNOT host extensions. Create TWO Shopify CLI apps — one custom-distribution app per store, each in its own account (validated; Partners-org single-app rejected) → run the 1h `webPixelCreate` spike (must PASS before the rest of phase 01 is scheduled) → add scopes `write_pixels`+`read_customer_events` → `shopify app deploy --config` per store → run `webPixelCreate` per store → set Vercel env `PIXEL_INGEST_SECRET` (FRICTION filter only, NOT auth — ships to browsers).
- Phase 03: trigger Meta `inline_link_clicks` backfill (TRAILING 90 DAYS — validated depth) after deploy; rerun failed chunks via `--days` covering the gap (no auto-resume exists).
- Phase 05: trigger creative-asset backfill (extends existing `pull-meta.ts` writer; no Storage bucket).
- Phase 06: run one-time email backfill (`UPDATE ... SET customer_email = raw->>'email'`) then refresh cohort matview.
- Phase 08: set Vercel env `ANTHROPIC_API_KEY`; verify current Haiku-class model ID + pricing at implementation.
- Every phase with a migration: apply migration to Supabase (01=0018, 03=0019, 05=0020, 06=0021, 07=0022, 08=0023) before the dependent ETL/UI ships.
- Pixel kill-switch runbook: rotate `PIXEL_INGEST_SECRET` (all stale POSTs 401) + `webPixelDelete`/`webPixelUpdate` per store to disable.

## Red Team Review
Session date: 2026-06-11. 4 reviewer lenses (security-adversary, failure-mode-analyst, scope-complexity-critic, assumption-destroyer); 15 findings accepted + applied (user approved ALL 15). Codebase re-verified against `d:/github local/pod-dashboard`.

| # | Finding | Sev | Disposition | Applied to |
|---|---------|-----|-------------|------------|
| 1 | Pixel ingest is PUBLIC; secret ships to browsers — demote to friction; add rate/batch/volume caps + circuit breaker + timestamp clamp + plausibility caps + kill-switch + CORS preflight | Crit | Accept | ph01, plan |
| 2 | View security: codebase uses invoker=false + embedded filter + no matview grant (0005/0015); per-surface tenancy tests, NOT invoker=true | Crit | Accept | ph04/06/08, plan |
| 3 | Rollup resilience: trailing 7-day window + PK upsert; prune only rolled-up days; document missed-cron catch-up | Crit | Accept | ph01 |
| 4 | Alert self-monitoring deadlock: staleness in READ path + GHA `if: failure()` | Crit | Accept | ph07 |
| 5 | Cohort key: `customer_id` 100% NULL — rekey on `email` from raw JSONB + backfill + non-empty gate | Crit | Accept | ph06, plan |
| 6 | Pixel deploy: token apps can't host extensions — per-store CLI app + 1h spike gate (user-assisted) | High | Accept | ph01, plan |
| 7 | Build guard: remove wrapper-evasion fallback; explicit allowlist of `app/api/pixel/route.ts` | High | Accept | ph01, plan |
| 8 | Meta backfill: nullable column (null≠0), no resume; completeness reconcile + rerun procedure | High | Accept | ph03, ph09 |
| 9 | Phase-02 rescope: date range ALREADY URL-driven — relocate + `compare` param + persist across nav; re-estimate down | High | Accept | ph02, plan |
| 10 | daily_sessions AGGREGATE grain; DELETE funnel RPC + migration; phase-04 reads aggregate directly | High | Accept | ph01/04, plan |
| 11 | Chat hardening: server reconstructs history + writes assistant/tool rows; WITH CHECK role='user'; cookie-session auth; rate/token caps | High | Accept | ph08 |
| 12 | Creatives: ALTER existing creative_cache (no new table); extend pull-meta.ts; stable permanent_url (no Storage); video/carousel | Med | Accept | ph05, plan |
| 13 | Alerts dismiss: workspace-global; dismiss-only RPC; NO generic UPDATE policy | Med | Accept | ph07 |
| 14 | Session semantics: TZ policy in 0018 (first-event day; UTC skew accepted); split bot heuristics; store-and-flag non-US | Med | Accept | ph01/04 |
| 15 | Hygiene: ph03 4→2 fetchers + 5-surface disposition + kpi-card; ph08 single chat_messages; current Haiku-class; per-phase rollback + scripted gates; exclude stray bundle | Med | Accept | ph03/08/09, plan |

Migration renumber (consequence of 10/12): 01=0018, 03=0019, 05=0020 (ALTER cache), 06=0021, 07=0022, 08=0023. Phase 04 owns NO migration. Total effort: 90-120h → 94-124h (ph01 +4-6h spike/caps; ph02 −4-5h phantom refactor; ph03 −2h fetcher consolidation; ph05 −4-5h no new table/Storage; ph06 +1h backfill; ph08 +1h hardening; net up — sum of phase ranges).

### Whole-Plan Consistency Sweep
- Files reread: 10 (plan.md + phase-01..09), all post-edit.
- Decision-deltas checked: 15 (one per finding).
- Stale-ref scan (grep across plan+phase files): `security_invoker=true`/`invoker=true` mandate — 0 (all hits are negations); `PIXEL_INGEST_SECRET` as auth — 0 (reframed friction); `customer_id` as cohort key — 0 (rekeyed to email; remaining hits explain the rejected trap); `meta_ad_creative_assets` — 0; `chat_sessions` — 0 (negations only); per-session `daily_sessions` schema — 0; old migration meanings 0020-0024 — 0; "promote to URL searchParams" — 0; "JWT from Authorization" — 0 (cookie-session); Supabase Storage thumbnails — 0 (negations only); per-user dismiss — 0 (workspace-global). All hits remaining in `reports/` are the original untouched red-team reports.
- Reconciled: phases table (est + owns-migrations), migration registry (renumbered, stray bundle note), effort total, dependencies note (ph04 no RPC), conventions (cookie-session + guard allowlist), user-owned steps (deploy spike, backfills, kill-switch), per-phase risk tables + success criteria + rollback notes.
- Unresolved contradictions: 0.

## Validation Log

### Session 1 — 2026-06-12
Verification pass: skipped per guard (Red Team Review carries codebase evidence); `[UNVERIFIED]` tags: 0. Interview: 4 questions (config 3-8), all recommended options accepted.

| # | Decision point | Answer | Propagated to |
|---|---------------|--------|---------------|
| 1 | Pixel app topology | TWO per-store custom-distribution CLI apps (stores in separate accounts; Partners-org single-app rejected) | ph01 step 0 + user-owned, plan user-owned |
| 2 | `inline_link_clicks` backfill depth | TRAILING 90 DAYS (extend later only if older ranges browsed; nullable column keeps gap honest) | ph03 requirements/architecture/step 3/criteria/risk, plan user-owned |
| 3 | Alert thresholds | net profit < 50% of 7d median; CPA > 135% of 14d avg; any ETL failure; constants in `lib/alerts/thresholds.ts` | ph07 key insights |
| 4 | Chat history scope | Resume most-recent conversation; "New chat" = fresh session_id; NO conversation-list UI v1 (schema unchanged) | ph08 requirements/files/step 7/criteria |

### Whole-Plan Consistency Sweep (Session 1)
- Files reread: plan.md + phase-01/03/07/08 (edited); phases 02/04/05/06/09 unaffected by these 4 decisions (verified no occurrences of the superseded terms).
- Decision deltas checked: 4. Stale refs reconciled: "or document a Partners-org choice" (0 remaining), un-scoped "historical backfill" in ph03 (0 remaining), "CPA > 2× baseline" placeholder (0 remaining), "grouped by session_id" history-list ambiguity (0 remaining).
- Unresolved contradictions: 0.
