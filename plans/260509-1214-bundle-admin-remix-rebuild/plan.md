---
title: "Bundle Admin Remix Rebuild — OAuth Unblock + Fly.io Hosted"
description: "Scaffold-replace dopamiles-bundle-app from @shopify/shopify-app-react-router@1.1.0 to @shopify/shopify-app-remix; deploy to Fly.io free tier; preserve client_id + Function v6 + biz code."
status: in-progress (Phases 01-02 shipped; 03-04 pending)
priority: P1
effort: 3-4.5h planned; ~3.5h actual on Phases 01-02
repo: D:\github local\dopamiles-bundle-app
branch: feat/admin-ui-remix (active)
blockedBy: []
blocks: [260508-1645-bundle-admin-ui]
related:
  - brainstorm: plans/reports/brainstorm-260509-1214-bundle-admin-architectural-rethink.md
  - parent-pod-bundle: plans/260507-1636-pod-bundle-function/plan.md
  - blocked-admin-ui: plans/260508-1645-bundle-admin-ui/plan.md (smoke-deferred, unblocked by this plan)
tags: [shopify, remix, oauth, fly-io, postgres, admin-ui, scaffold-rebuild]
created: 2026-05-09
---

# Bundle Admin Remix Rebuild

Replace broken auth scaffold in `dopamiles-bundle-app` and ship a stable hosted admin UI for Dopamiles bundle config. Function v6 + active discount node remain untouched throughout.

**Brainstorm:** [brainstorm-260509-1214-bundle-admin-architectural-rethink.md](../reports/brainstorm-260509-1214-bundle-admin-architectural-rethink.md) (decisions locked)

## Why

Two failed smoke sessions on `feat/admin-ui` branch — OAuth callback never writes Prisma session. Root suspect: `@shopify/shopify-app-react-router@1.1.0` (bleeding-edge). Tunnel + dev-cert fatigue makes dev loops painful. Single-store + monthly tier-edit cadence justifies embedded UI but not multi-tenant SaaS overhead.

**Strategy:** Scaffold-replace (not project-replace) — swap auth lib, keep client_id, Function, and ~1,400 LOC of business logic.

## Repo Layout

- **Primary:** `D:\github local\dopamiles-bundle-app` on new `feat/admin-ui-remix` branch (off `feat/admin-ui`)
- **Function:** `extensions/bundle-discount/` — UNTOUCHED across all phases
- **Theme:** `pod-tee-theme` — not affected

## Locked Decisions (from brainstorm)

- Auth lib: **`@shopify/shopify-app-remix`** (proven, ~10K production apps); pin to current LTS
- Hosting: **Fly.io free tier** + Fly Postgres (Hobby)
- Reuse: **scaffold-replace** — copy auth/scaffold files only into existing repo
- Branch: new `feat/admin-ui-remix` off current `feat/admin-ui` (preserve current state as reference)
- DB: SQLite → Postgres for production; local dev can keep SQLite or switch to local Postgres (Phase 03 decision)
- `client_id = "0a0674917de5e3c26cf2a3e14be07a7f"` PRESERVED
- `extensions/bundle-discount/` UNTOUCHED
- `app/lib/*.ts` (7 files) ports as-is

## Phases

| # | Phase | Status | Effort | Gate |
|---|-------|--------|--------|------|
| 01 | [Auth scaffold replace + local OAuth verification](phase-01-auth-scaffold-replace.md) | **shipped 2026-05-09** (commits 8232189, cd9474b, 4248e4c, f56364f) | 60-90min planned → ~3h actual | ✅ Session row written + dashboard renders + afterAuth fires |
| 02 | [Business route adaptation](phase-02-business-route-adaptation.md) | **mostly shipped 2026-05-09** (commits de04795, 4a642de) — 4 biz routes import-swapped + metrics GraphQL field fixed | 60-90min planned → ~30min actual | ✅ All 5 admin routes functional locally |
| 03 | [Postgres migration + Fly.io deploy](phase-03-postgres-and-fly-deploy.md) | **code-complete 2026-05-09** (file prep done; Fly CLI deploy pending — see [runbook](phase-03-fly-runbook.md)) | 60-90min planned → ~45min prep | Fly.io app reachable at production URL |
| 04 | [Production smoke + Dopamiles re-auth](phase-04-production-smoke-and-reauth.md) | pending | 30min | All 5 admin features verified on production; Function regression check passes |

**Total:** 3-4.5h planned → Phases 01-02 ~3.5h actual (debugging surfaced 5 bug layers)

## Critical Preservation

- `client_id "0a0674917de5e3c26cf2a3e14be07a7f"` MUST NOT change → Function v6 + `DiscountAutomaticNode/1396914946300` stay LIVE
- `extensions/bundle-discount/` source files NOT modified
- `app/lib/*.ts` (7 files, ~1,400 LOC) ported byte-for-byte where possible
- `shopify.app.toml`: only `application_url` changes (Phase 03); `client_id`, scopes, webhooks preserved

## Out of Scope

- Multi-store distribution / app-store listing
- Function logic changes (separate workstream if needed)
- Theme republish (parallel workstream — not blocked by this plan)
- Cart Transform Function R&D (Phase 06 of parent plan)
- Welcome-code stacking
- Custom domain on Fly.io (use default `<app>.fly.dev`)

## Cross-Plan Impact

- **`260508-1645-bundle-admin-ui` (smoke-deferred):** UNBLOCKED by completion of this plan. Its 4 phases of admin UI code (tier editor, product tagger, setup wizard, dashboard tile) ride on the new auth scaffold delivered here. Mark that plan as fully shipped after Phase 04 of THIS plan passes.
- **`260507-1636-pod-bundle-function` (completed):** Phase 02 (Polaris admin) was deferred. This plan completes it via the rebuild path.
- **Customer launch (theme republish):** independent workstream — can proceed in parallel; not blocked.

## Success Criteria

- [ ] OAuth callback writes a session row to Postgres on Dopamiles dev store install
- [ ] Embedded admin loads in Dopamiles store admin from production Fly.io URL (no tunnel)
- [ ] All 5 admin features functional: tier editor, product tagger, setup wizard, metrics tile, app index
- [ ] Function v6 + `DiscountAutomaticNode/1396914946300` still active in checkout (no regression on test cart)
- [ ] Tunnel only required for active local dev sessions
- [ ] Tier edit → metafield update → checkout discount reflects change end-to-end

## Fallback Plan

If Phase 01 fails (90min timebox) — i.e., `@shopify/shopify-app-remix` ALSO exhibits OAuth bug — pivot to **Approach C from brainstorm: CLI scripts**.
- Archive `feat/admin-ui-remix` branch
- Port `app/lib/*.ts` to 3 standalone Node CLI scripts (`scripts/set-tiers.ts`, `scripts/tag-products.ts`, `scripts/metrics.ts`)
- Use offline access token from one-time manual auth
- ~1-2h additional work; kills embedded admin entirely
- Acceptable downside: monthly tier edits via terminal command instead of UI

Document fallback decision in journal if triggered.

## Unresolved Questions

1. `@shopify/app-bridge-react@4.x` compatibility with `@shopify/shopify-app-remix` — verify in Phase 01 fresh scaffold output; downgrade if needed
2. Fly.io Postgres Hobby tier limits (storage, connections, auto-suspend) — verify in Phase 03; switch to Hobby Plus ($5/mo) if pain
3. Webhook `api_version = "2026-07"` (current `shopify.app.toml`) — may need downgrade to match `shopify-app-remix` LTS API version; decide in Phase 02 after scaffold review
4. Local dev DB choice — keep SQLite for local + Postgres for production (heterogeneous), or migrate local to Postgres too (homogeneous)? Decide in Phase 03
5. Should `feat/admin-ui` branch be archived after rebuild succeeds, or kept as reference for 30 days? Recommend keep until Phase 04 passes, then archive
