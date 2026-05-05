---
name: POD Brand Dashboard — P1 MVP
slug: pod-brand-dashboard-p1
date: 2026-05-04
status: pending
mode: auto
priority: high
estimated: 5-6 weeks part-time (~50-60h)
blockedBy: []
blocks: []
---

# POD Brand Dashboard — P1 MVP

## Goal
Self-hosted "true profit" dashboard stitching **Shopify + Meta Ads + Printify** for one brand. Replace $100-500/mo SaaS (Triple Whale, Polar, TrueProfit). Read-only, daily refresh + manual button, web only, single brand, 90-day backfill.

## Source of truth
- Brainstorm summary: `plans/reports/brainstorm-260504-1115-pod-brand-dashboard.md`

## Locked decisions (from brainstorm + planning interview)
- Stack: Next.js App Router + Supabase (Postgres / Auth / Vault / RLS) + Vercel + Tremor + Recharts + GitHub Actions
- ETL: GHA cron (daily) + manual `repository_dispatch` (no Vercel cron, dodges 60s timeout)
- COGS scope (P1): **Full P&L** — Printify + Shopify fees + refunds + app subscriptions
- Meta auth: per-account access token, separate BMs (token stored in Supabase Vault)
- Shopify auth: custom app per store (admin-installed, long-lived token)
- Printify auth: personal access token
- Attribution: show Meta-reported AND Shopify-UTM side-by-side, no reconciliation
- Mobile: web-only in P1, default Tailwind responsive (no dedicated mobile design)
- Out of P1: multi-brand, winning ads view, winning products view, ops health, own MCP server

## Phases
| # | File | Status | Est. |
|---|------|--------|------|
| 01 | [phase-01-foundation.md](phase-01-foundation.md) | completed — implementation moved to https://github.com/lythanhbinh93/pod-dashboard | 6-8h |
| 02 | [phase-02-source-connectors.md](phase-02-source-connectors.md) | completed (code-complete, smoke deferred) | 10-12h |
| 03 | [phase-03-schema-and-daily-etl.md](phase-03-schema-and-daily-etl.md) | completed (code-complete, smoke pending) | 10-12h |
| 04 | [phase-04-backfill-90-day.md](phase-04-backfill-90-day.md) | completed (data quality fixes + GHA backfill) | 6-8h |
| 05 | [phase-05-dashboard-ui.md](phase-05-dashboard-ui.md) | completed (UI shipped, smoke + review pass) | 12-15h |
| 06 | [phase-06-manual-refresh.md](phase-06-manual-refresh.md) | pending | 3-4h |
| 07 | [phase-07-polish-and-ship.md](phase-07-polish-and-ship.md) | pending | 6-8h |

## Definition of Done (Ship Gate)
- Yesterday's net profit visible by 8am local with auto-refresh
- Manual refresh button completes in <60s perceived (async ETL acceptable)
- All P&L numbers reconcile to manual spreadsheet calc within 1%
- "Missing COGS" banner shows count = 0 for active SKUs
- Magic-link login works for 2-5 team members
- Cost: <$25/mo (Supabase free → Pro upgrade only if storage demands it)

## Key risks (carried forward from brainstorm)
1. Meta API rate limits on 90-day backfill → date-chunked, resumable
2. Printify pagination slow (~400ms/page) → bulk pull on GHA, hours OK
3. Variant ↔ Printify mapping fails for non-POD products → dashboard alert from day 1
4. Vercel 60s timeout on ETL → never run ETL on Vercel; GHA only
5. iOS14 attribution divergence → show both numbers explicitly

## Cross-plan check
Scanned `plans/`: no overlap with existing plans (all CouplePix internal tools — voice-gift, photo-helper, admin-copy-product). No `blockedBy` / `blocks` relationships.

## Repo placement
**Open question** — this plan is in `crushroom-form/plans/` but the dashboard is a *separate* product from CouplePix. Two options:
- (a) Build dashboard as a sibling app in this monorepo (`apps/pod-dashboard/`)
- (b) Spin up a fresh repo (`pod-dashboard`) and migrate the plan there
Phase 01 must resolve this before scaffolding.
