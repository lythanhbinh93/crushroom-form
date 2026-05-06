# Phase 06 — Ad → Product Attribution: Code Review

**Reviewer:** code-reviewer
**Date:** 2026-05-06 20:55
**Scope:** Phase 06 only (migration 0016, derive-utm-mappings, pull-meta extension, run-daily wiring, /products coverage banner, /products/[id] manual override UI)
**Verdict:** **REWORK** — one CRITICAL data-flow bug blocks ship; two HIGH issues need fix; otherwise solid.

**Score: 6/10**

---

## Headline finding (CRITICAL — blocks ship)

`derive-utm-mappings.ts` queries `shopify_orders.utm_content`, but **that column does not exist in the schema** and `pull-shopify.ts` does not extract it. Every daily run will fail with a Postgres error and the entire UTM derivation step is dead code. The 8 derive-utm tests pass only because they mock the Supabase client.

This is the same class of bug as Phase 04 M3 (cross-source ETL writing column the schema didn't yet support). Not caught because tests mock at the JS-client boundary.

Detail in CRITICAL-1 below.

---

## Findings by severity

### CRITICAL

**C-1. `shopify_orders.utm_content` does not exist — entire UTM derivation step will throw at runtime.**
- `etl/derive-utm-mappings.ts:79` `.select('workspace_id, order_id, utm_content')` then `.ilike('utm_source', 'facebook%')`.
- Schema (`supabase/migrations/0002_etl_schema.sql:27-29`) defines only `utm_source`, `utm_medium`, `utm_campaign`. No `utm_content` column.
- `etl/pull-shopify.ts:169-171` extracts utm_source/utm_medium/utm_campaign from `note_attributes`. **No utm_content.** Even if the column existed, ingestion would never populate it.
- Likewise `utm_source` is already filtered to `ilike '%fb%' OR ilike '%meta%'` in 0003/0006/0007 matview semantics — but Meta attribution by Shopify Online Store typically writes `utm_source = 'facebook'` to the order's `landing_site` query string, parsed into a different field, not `note_attributes` either. So the entire selector is fragile.
- **Impact:** `deriveUtmMappings` throws on every run. Caught by run-daily's try/catch (logged then swallowed) — silent failure mode. **`product_pl.ad_spend` will only ever be filled by destination_url (0.7) + manual (1.0)**, never by UTM (0.9). Coverage % capped at the URL+manual ceiling.
- **Fix required:**
  1. Migration `0017_shopify_orders_utm_content.sql` adding `utm_content text` (and `utm_term`/`utm_referrer` if you want symmetry).
  2. `pull-shopify.ts` extract `utm_content` (and re-scan `note_attributes` for it if Shopify writes it there, or parse `landing_site` query string). Verify against a real Shopify order from Brand A — Shopify may send UTMs via `note_attributes`, `customer_journey_summary.first_visit.landing_page`, or `landing_site`. Best-effort multi-path extractor.
  3. Add a smoke test that reads from a real (or fixture) Shopify order payload with `utm_content={{ad.id}}` and verifies extraction.
- **Why CI didn't catch:** the derive-utm test mocks `client.from('shopify_orders').select(...)` at the JS layer — it never hits Postgres so the missing-column error never surfaces. Mirrors the "mock permissiveness hides correctness bugs" pattern from Phase 02.

### HIGH

**H-1. `derive-utm-mappings` cross-workspace order_id collision when run unscoped.**
- `etl/derive-utm-mappings.ts:108-110`: `orderAdMap` is keyed by `order_id: number`. `shopify_orders` PK is `(workspace_id, order_id)` — order IDs are unique per-workspace, NOT globally. If two workspaces both have an order_id `5001` and the function is called without `workspaceId`, the second `set` clobbers the first, then the order_lines join (filtered by `workspace_id IN [...]` but not joined per-workspace in the lookup map) misattributes lines.
- Today this is dormant because `run-daily.ts:208` always passes `workspaceId`. But the function signature advertises "omit workspaceId to process all" (line 17, 24).
- **Fix:** key the map by `${workspace_id}::${order_id}`, or remove the "all workspaces" affordance. Even with C-1 fixed, this is a footgun.

**H-2. `parseProductHandle` regex over-permissive — matches non-product URLs.**
- `lib/connectors/meta/creative-link.ts:67`: `/\/products\/([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])/i`
- Matches anywhere in the URL, not just under the host's path root. Examples that match incorrectly:
  - `https://example.com/blog/our-products/foo` → captures `foo` after `/products/foo`. Wait — the pattern needs `/products/` literal so `our-products/foo` (with hyphen) does NOT match because the regex requires `/products/`. OK.
  - `https://example.com/admin/products/awesome-tee` → captures `awesome-tee`. This is admin path, not customer URL. Would match the wrong thing if a Meta ad pointed to a non-storefront URL.
  - `https://blog.example.com/products/round-up-2026` → blog post category named `products`. False positive.
- The `i` flag is fine but `[a-z]` already includes both due to the flag.
- **Mitigation:** acceptable as best-effort (per spec "URLs can be cloaked/shortened, implement minimal regex"). The handle→product_id lookup in `pull-meta.ts:266` requires the parsed handle to exist in `shopify_products.handle`, which fails closed for the blog-category false positive (no shopify_products row with handle `round-up-2026` unless the user really has that product). So in practice this is contained — but flag if Brand A's storefront ever has a blog post with a slug that collides with a product handle.
- **Recommend:** add a comment in `parseProductHandle` explicitly acknowledging the host-path-root limitation, and consider tightening to require the Shopify-native `/products/<handle>` pattern at the URL path root using `URL` parser instead of regex. Optional, low priority.

**H-3. `last_check >= staleCutoffIso` ISO string comparison fragile.**
- `etl/pull-meta.ts:216`: `r.last_check >= staleCutoffIso` where `staleCutoffIso = staleCutoff.toISOString()` (e.g., `2026-04-29T20:55:00.000Z`).
- Postgres `timestamptz` columns serialized via PostgREST come back as ISO 8601 with `+00:00` offset, not `Z` suffix in some Supabase versions. `'2026-05-06T20:55:00+00:00' >= '2026-05-06T20:55:00.000Z'` does string-comparison and will sort `+` (43) before `.` (46) and `0` (48) — meaning `+00:00` rows compare LESS than the `.000Z` cutoff and would always be treated as stale.
- **Verify:** in Brand A's actual return shape, what does `last_check` look like? If `+00:00` form: 7-day TTL is broken (every ad re-fetched on every run, defeating the cache). If `.000Z` form: works.
- **Fix:** parse to Date and compare numerically: `new Date(r.last_check) >= staleCutoff`. One-line change, eliminates the fragility.

### MEDIUM

**M-1. `daily_pl_view`/`shopify_utm` matview filter `utm_source ilike '%fb%' or '%meta%'` vs Phase 06 `utm_source ilike 'facebook%'`.**
- The legacy matview matches `%fb%` OR `%meta%` (substring); Phase 06 matches `facebook%` (prefix-anchored). If an order has `utm_source='fb-ads'` it counts in the matview but is dropped by Phase 06.
- Not necessarily wrong (different intents), but flag for spec consistency. Recommend reusing the same predicate in both places. If we standardize on `'facebook%'`, document; if on `'%fb%'`, expand the Phase 06 filter.
- Belongs to fix-up alongside C-1.

**M-2. `derive-utm-mappings` non-atomicity + matview race.**
- run-daily order: pulls → derive-utm → matview refresh. If a Shopify webhook (or user retry) writes a new order between the derive query and the matview refresh, the matview reflects it but the derive doesn't. Self-correcting on next run. Acceptable.
- The non-atomic SELECT-aggregate-UPSERT in derive itself (steps 1-4 in TS) over a long table scan window may produce a slightly stale majority vote. At Brand A volumes (10k orders/month) this is unobservable. Document as known, no action.

**M-3. `derive-utm-mappings` upserts unchanged rows, churning `updated_at`.**
- Line 218-228: even when existing source='utm' AND existing product==new product, the function still upserts (the comment at 217-220 acknowledges this). This rewrites `updated_at`, churns the audit trail, and triggers downstream cache invalidation if any (none today).
- **Fix:** before pushing to `upsertRows`, check `if (existing?.source === 'utm' && existing.product_id === best.product_id) continue;` (would need product_id in the existing fetch). YAGNI candidate, but free if you're touching the file for C-1.

**M-4. `pull-meta.ts` cache-write failure swallowed silently.**
- Line 314-322: cache upsert errors logged via `console.warn` and execution continues. The mapping upsert (line 332) then runs anyway. If the cache write keeps failing, every daily run re-fetches every ad's link_url — Meta API quota burn. No alerting.
- **Mitigation:** keep current behavior, add a counter in the result type so the orchestrator can detect prolonged failure (not now; phase 07 reconciliation territory).

**M-5. `meta_ad_creative_cache` schema lacks `created_at` / `updated_at` separation.**
- Single `last_check` column conflates "first cached" with "last refreshed". Hard to retroactively diagnose stale vs. fresh data. YAGNI; phase 07 if needed.

**M-6. `assignAdToProduct` — no audit trail for manual overrides.**
- Manual overrides are owner-gated but unlogged. Two owners could fight; no record of who pinned what when. The `updated_at` is set but `actor_id` is not stored.
- Phase 03 reviewer raised the same lesson on member changes. Recommend adding `assigned_by uuid references auth.users(id)` to `ad_product_map` in a follow-up migration. Not blocking.

### LOW

**L-1. `assignAdToProduct` — RPC `refresh_product_pl` failure not surfaced even in logs to the user.**
- Line 117 logs `console.error`. The user gets `{ ok: true }`. UI shows "Assigned" but the matview doesn't reflect for 24h. Page revalidatePath helps for raw `ad_product_map` reads but `product_pl` is the matview. Acceptable for low-friction action.
- Optional: include a soft warning in the response: `{ ok: true, warning: "Reflects on next refresh." }`. Skip for now.

**L-2. `ad-coverage-banner.tsx` — accessibility.**
- The amber `<code>` block uses `bg-amber-100` text on amber Callout. Contrast ratio likely OK but I didn't verify. Add `aria-label` on the external link.
- The Callout itself: confirm `tone="amber"` includes a role=status / role=alert appropriately. Not critical.

**L-3. `ad-mapping-form.tsx` — optimistic UI does not roll back on server failure.**
- Wait — actually it does NOT advance optimistically. `handleAssigned` is called only inside the success branch (line 78). So the UI updates only after the server succeeds. Good — no rollback needed. The "optimistic" framing in the impl report is slightly misleading; this is just post-success local state. Confirmed correct by reading lines 73-83.

**L-4. `ad-mapping-form.tsx` — 180 LOC, near 200-line limit.**
- Two natural splits: `MappedAdsTable` and `UnmappedAdsTable`. KISS says leave it (one concern: assigning an ad to this product). Skip.

**L-5. `derive-utm-mappings.ts` — 263 LOC, exceeds 200-line guideline.**
- Single cohesive job with five labeled steps. Splitting `vote()`, `loadExisting()`, `buildUpserts()` would help testability. Do this when fixing C-1 (the file is being touched anyway). Optional but recommended.

**L-6. SQL injection vector — `derive-utm-mappings.ts:53` interpolates `workspaceId` into a SQL string.**
- `const workspaceFilter = workspaceId ? \`and o.workspace_id = '${workspaceId}'::uuid\` : '';`
- This `workspaceFilter` variable is **never used** downstream (the codepath uses Supabase JS query builder, not raw SQL). So no actual injection risk. But the variable is dead code and a future refactor could mistakenly use it.
- **Fix:** delete lines 50-54. Dead code with a foot-shaped trigger.

**L-7. `meta_ad_creative_cache` index `idx_meta_ad_creative_cache_last_check (workspace_id, ad_id, last_check)` — duplicates the PK prefix.**
- The PK is `(workspace_id, ad_id)`. The index `(workspace_id, ad_id, last_check)` is a strict superset. Postgres can use the PK index for `(workspace, ad)` lookups; the explicit secondary index buys nothing the PK doesn't already give. The comment claims it helps "find stale cache entries efficiently" but the actual query (line 201-205) is `eq workspace_id, in ad_id` — which the PK covers.
- **Fix:** drop the index OR change order to `(workspace_id, last_check)` if you want to support a "find all stale entries for a workspace" scan that doesn't already know the ad_ids.

---

## Migration 0016 review (positive)

- **Dedupe-then-drop-PK ordering:** correct. DELETE runs before PK change. On empty table, the DELETE is a no-op.
- **`source` NOT NULL flow:** UPDATE-nulls → SET DEFAULT + SET NOT NULL is correct ordering (`SET NOT NULL` would fail if any null remained).
- **Confidence check wrapped in DO block with `pg_constraint` lookup:** idempotent. Good.
- **`alter table … alter column source set default … alter column source set not null` in one statement:** valid PG syntax, atomic.
- **RLS INSERT policy (G):** wrapped in DO block with `pg_policies` lookup — idempotent. `for all` covers INSERT/UPDATE/DELETE; `is_workspace_member` allows any member, but the action layer narrows to owner. Defense-in-depth holds. (Note: `for all` on `using` AND `with check` means even SELECT is policy-gated; the existing SELECT policy from 0014 still works because Postgres OR's policies for the same role/operation, but the new `for all` policy is a permissive ALL-policy that adds, not replaces.)
- **`meta_ad_creative_cache` RLS:** SELECT-only policy + no INSERT policy = service-role-only writes. Correct.
- **CASCADE on workspace deletion:** confirmed via FK `references public.workspaces(id) on delete cascade`. Good.

**Minor wart:** the existing index `idx_ad_product_map_workspace` from 0014 (line 68-69) and the new `idx_ad_product_map_workspace_ad` from 0016 (line 74-75) both lead with `workspace_id`. Postgres won't use the second when the PK already serves `(workspace, ad)` lookups. Not harmful but redundant. Skip.

**Migration sequencing on fresh deploy (0001 → 0016 in order):** confirmed safe — empty `ad_product_map` after 0014; DELETE no-ops; PK swap succeeds; backfill UPDATE no-ops on empty table; constraints add cleanly.

---

## Owner-check pattern review

`assignAdToProduct` mirrors `addMember`/`removeMember` correctly:
1. Validate inputs first.
2. `getActiveWorkspace()` (redirects to /login on unauth).
3. Explicit `workspace.role !== "owner"` guard with clear error.
4. Then create RLS-aware Supabase client.

This is the standard. Test `actions.test.ts:76-83` exercises the owner-rejection path. Good.

**One nit:** the impl report claims the owner-check happens "BEFORE `createSupabaseServerClient()` is called — so the Supabase client is never created for non-owners". The actual code (lines 78-92) does call `getActiveWorkspace()` before the role check. `getActiveWorkspace` itself instantiates a Supabase client internally. So the "client never created" framing is slightly off — but the protection (no privileged DB call for non-owners) holds. Cosmetic.

---

## Cross-source data-ownership check (Phase 04 carry-over lesson)

Three writers to `ad_product_map`:
1. `pull-meta.ts` → `source='destination_url'`, confidence=0.7
2. `derive-utm-mappings.ts` → `source='utm'`, confidence=0.9
3. `assignAdToProduct` → `source='manual'`, confidence=1.0

**Race scenarios analyzed:**

- **Manual + automation race:** ETL fetches "existing manual ad_ids" (pull-meta line 227-237; derive-utm line 174-193) BEFORE building the upsert set, then filters. Owner could click "Assign" between the fetch and the upsert — `pull-meta` could overwrite. Window is small (sub-second to few hundred ms) but real. **DB-level guard:** none (the upsert uses simple `onConflict` REPLACE, no `WHERE source != 'manual'` predicate on the conflict update path). Supabase JS upsert doesn't expose a partial-update-conditional via on-conflict.
  - **Recommend:** add a Postgres trigger on `ad_product_map` BEFORE INSERT/UPDATE that rejects updates that would change a row from `source='manual'` to anything else. Three-line trigger; eliminates the race entirely. Defense-in-depth. **Not blocking** (TS guard + small window) but Phase 04 lesson says race + cross-source = scary.

- **Two ETL writers race (pull-meta + derive-utm in parallel):** run-daily.ts is sequential, no parallelism. Safe.

- **Two manual override clicks:** `revalidatePath` invalidates after upsert; second click sees fresh state. Safe.

---

## Test coverage assessment

45 tests, all pass. But:
- Tests mock at the JS-client `from('table').select(...)` boundary. They do NOT execute the SQL. C-1 (missing column) would only be caught by a schema-aware integration test or by exercising the migration in CI.
- **Recommend** for Phase 07: add a migration-applied integration test that boots a real Postgres + applies migrations 0001..0016 + runs `derive-utm-mappings` against fixture data. Same lesson as P2 prior phases (mock permissiveness).

---

## Recommended actions (priority order)

1. **CRITICAL — fix C-1:** add `utm_content` column to schema; extend pull-shopify to populate it; verify against a real Brand A order; re-run derive-utm. Without this, Phase 06 is non-functional for its primary signal.
2. **HIGH — fix H-1:** key `orderAdMap` by `(workspace_id, order_id)` composite or restrict the function signature to require `workspaceId`.
3. **HIGH — fix H-3:** swap string ISO comparison for `Date` numeric comparison in pull-meta cache staleness check.
4. **MEDIUM — fix M-1:** standardize utm_source predicate across legacy matview + Phase 06.
5. **LOW cleanup — L-6:** delete dead `workspaceFilter` SQL string in derive-utm.
6. **Optional — cross-source race hardening:** Postgres trigger to protect `source='manual'` rows.

---

## Positive observations

- Migration 0016 is well-structured, idempotent, with thoughtful comments.
- Owner-check pattern correctly mirrors Phase 03.
- Coverage banner handles divide-by-zero, partial-coverage, zero-spend gracefully.
- `pull-meta.ts` per-ad failure isolation (line 280-287) is clean — one ad's API failure doesn't block others.
- run-daily.ts wraps `deriveUtmMappings` in try/catch and explicitly comments "non-fatal — matview refresh continues" — good defensive orchestration.
- Cache TTL pattern (`meta_ad_creative_cache.last_check`) avoids burning Meta API quota on stable creatives.
- `parseProductHandle` test coverage is thorough (15+ URL forms).
- Action returns structured `{ ok: bool, error?: string }` instead of throwing — predictable client UX.

---

## Unresolved questions

1. **What is Brand A's actual `utm_content` write path?** Shopify can store it in `note_attributes`, `landing_site` query string, or `customer_journey_summary`. Need to verify against a real order before fixing C-1.
2. **Should `meta_ad_creative_cache` be cleared when a user disconnects Meta?** Currently CASCADE on workspace delete only. If they disconnect/reconnect with a new ad account, stale cache may persist. Minor.
3. **Does Brand A actually use `{{ad.id}}` UTM template?** If not, UTM derivation produces zero rows even after C-1 is fixed; Phase 06 success metric (≥30% mapped) relies on URL-based + manual. Worth confirming during Phase 07 smoke.
4. **`product_pl` matview refresh after `derive-utm-mappings` upserts:** run-daily refreshes after derive, but `assignAdToProduct` calls `refresh_product_pl` directly. Are these the same RPC? Verify name match between RPC and migration 0014/0015.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 06 has solid scaffolding (migration, owner-check, coverage banner, manual UI) but ships with a CRITICAL data-flow bug (`utm_content` column missing) that silently breaks the UTM derivation step. One HIGH workspace-key bug, one HIGH ISO comparison fragility, several MEDIUM/LOW findings.
**Concerns:**
- C-1 blocks ship: UTM derivation throws on every run because `shopify_orders.utm_content` does not exist.
- H-1 cross-workspace order_id collision is dormant but a footgun.
- H-3 ISO string comparison may break the 7-day creative cache TTL silently.
- Test mocks did not catch C-1 — same pattern as P2 mock-permissiveness lesson.
**Score:** 6/10 — would be 8/10 with C-1 + H-1 + H-3 fixed.
