# PM Status — 2026-05-08 11:15

**Branch:** `claude/add-photo-upload-tool-p3dI0` (3 unpushed commits)
**Yesterday's EOD:** [pod-bundle phase 03 shipped, deployment paths open](../../docs/journals/260507-pod-bundle-session-eod-tomorrow-pickup.md)

## Plan Inventory

| Plan | Status | Next Action | Priority |
|---|---|---|---|
| **pod-bundle-function** (260507-1636) | in_progress | **Path A: deploy Phase 01 + QA** OR **Path B: Phase 04 picker** | **P1 — TODAY** |
| pod-dashboard-p2 (260506-1147) | pending (6/7 done) | Phase 07 soak+ship (1wk soak) | P2 — backlog |
| pod-tee-product-page (260506-2236) | pending | Phase 06 Pixel+Perf (P0 for ads) | P2 — after bundle |
| pod-brand-dashboard-p1 (260504-1115) | code-complete | v0.1.0 tag (user-owned) | done |
| dopamiles-full-theme-port (260507-1306) | completed | — | done |
| voice-upload-phase-2 (260429-1619) | in-progress | stale, recheck | P3 |
| admin-copy-product-thumb-image (260418-1408) | in_progress | stale, recheck | P3 |
| voice-gift-qr-upload (260424-1431) | code-complete | tag/ship if user owns | P3 |
| pod-iterator-app-mvp (260421-1619) | pending | not started | P3 |
| pod-winner-iterator-v02 (260421-1205) | pending | not started | P3 |
| photo-helper-auto-match-v2 (260422-1407) | pending | not started | P3 |
| adopt-superpowers-remaining (260315-1458) | pending | backlog | P4 |

## Today's Pick — pod-bundle-function

Two deployment paths from yesterday's EOD (user decision pending):

**Path A — Validate Phase 01 → Phase 03 integration** ⭐ recommended
1. `cd "D:\github local\dopamiles-bundle-app" && shopify app deploy` (Function live)
2. Seed `bundles.tiers` metafield on dev store
3. Tag 2-3 products `bundle-eligible`
4. Positive QA: banner % → cart count → headline state-machine
5. Smoke checkout: 1/2/3-pack tier math
- **Effort:** 1-2h
- **Unblocks:** Phase 04 demo with live math; Phase 03 sign-off
- **Risk:** lowest — exercises code already shipped

**Path B — Phase 04 scaffolding (3-pack picker)**
1. `/pages/3-pack` + `dopamiles-3pack-picker` section
2. `_bundle_id` line-property cart-drawer grouping
3. localStorage slot persistence + batch ATC
- **Effort:** 5-7d
- **Unblocks:** Meta-ads cold-traffic landing surface
- **Blocker:** end-to-end checkout math needs Phase 01 live (Path A first)

**Recommendation:** Path A first (1-2h), then start Path B.

## Housekeeping

- 3 unpushed commits on `crushroom-form` (plans-only, safe to push)
- 1 unpushed commit on `pod-tee-theme:feat/bundle-function` (`af46860` Phase 03 theme code)
- Both staged pending user go/no-go

## Resolved Status Mismatches

None this session (sync-back not needed; yesterday's planner correctly reflects current state).

## Unresolved Questions

1. **Path A vs Path B** — user decision; Path A recommended.
2. **Function qty-rule** (qty-sum vs distinct-line-count) — verify before claiming Phase 03 headline matches Function logic.
3. **PDP CTA collision** — `dopamiles-bundle-inline.liquid` (kit picker) + new `dopamiles-bundle-banner.liquid` = 2 CTAs same product. UX decision needed.
4. **Pod-tee-product-page Phase 04** — supersede-mark when bundle Phase 03 fully validated (post Path A).
5. **Phase 06 Pixel+Perf (P0)** — sits behind bundle work; flag if Meta-ads launch date exists.
