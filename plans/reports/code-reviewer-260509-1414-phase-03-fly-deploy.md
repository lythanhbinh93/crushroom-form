# Code Review — Phase 03 Fly Deploy Artifacts

**Scope:** `Dockerfile`, `.dockerignore`, `.env.example`, `fly.toml`, `package.json`, `prisma-postgres/`
**Branch:** `feat/admin-ui-remix` (in `D:\github local\dopamiles-bundle-app`)
**Plan:** `plans/260509-1214-bundle-admin-remix-rebuild/phase-03-postgres-and-fly-deploy.md`

## Overall Assessment

Solid first pass. Heterogeneous SQLite/Postgres split is clean, schema parity confirmed, secrets handling correct, `client_id` + `extensions/bundle-discount/` preserved. **One real bug** (Rust target dir not dockerignored — 155MB bloat) and a few concerns worth addressing before first `flyctl deploy`. No security holes.

---

## Critical Issues

None.

---

## High Priority

### H1. `extensions/bundle-discount/target/` (155MB) NOT in `.dockerignore`

`.dockerignore` excludes `node_modules`, `.cache`, `build`, `prisma/migrations/`, etc. — but **does not exclude `extensions/*/target/`**. The Rust function build artifacts are gitignored locally (`.gitignore` has nothing for them either, but they don't exist in git because the function builds elsewhere). They DO sit in the working tree at 155MB and will:

- Inflate Docker build context (slow uploads to Fly registry).
- Get COPYed into both build + runtime stages (image size violates the <250MB non-functional req in plan).
- Possibly slow cold-start container pull.

**Fix:** add to `.dockerignore`:
```
# Rust function build artifacts (not needed for admin app image)
extensions/*/target/
extensions/*/Cargo.lock
extensions/*/.shopify/
```

`Cargo.lock` is up to debate (often committed) but `target/` is unambiguous waste.

### H2. Runtime stage carries unused source + dev artifacts

`COPY --from=build /app /app` copies the entire build workdir, including `app/` source, `extensions/`, `tests`, etc. Only needed at runtime: `build/`, `node_modules/`, `package.json`, `prisma/` (for migrate deploy).

Not blocking but combined with H1 risks 256MB-VM cold-start pressure and large image pulls.

**Fix (optional, do later if image > 200MB):** in runtime stage, COPY only what's needed:
```dockerfile
COPY --from=build /app/build /app/build
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/prisma /app/prisma
```

---

## Medium Priority

### M1. `release_command` cold-start OOM risk on 256MB VM — likely fine but flag

`npx prisma migrate deploy` on Node 20 + Prisma 6 typically uses 100-180MB peak. On a 256MB VM with no swap (Fly default), a single empty-table migration should fit, but it's tight. Fly runs the release_command in a **separate ephemeral VM** that uses the same `[[vm]]` block — so it'll also be 256MB.

**Recommendation:** if release_command OOMs (look for `signal: killed` in `flyctl logs`), bump release VM specifically:
```toml
[deploy]
  release_command = "npx prisma migrate deploy"
  release_command_vm = { memory_mb = 512 }
```
Don't pre-emptively bump — empty migration should pass at 256MB.

### M2. `.env.example` lists `SCOPES` but plan-supplied scope set differs from `shopify.app.toml`

`.env.example` line 6:
```
SCOPES=read_discounts,write_discounts,write_metaobject_definitions,write_metaobjects,write_products,read_orders,write_content
```
`shopify.app.toml` line 10:
```
scopes = "write_products,write_metaobjects,write_metaobject_definitions,write_discounts,read_discounts,read_orders,write_content"
```
**Order differs only.** Functionally identical sets. Shopify treats scope strings order-insensitive. Cosmetic — no fix needed, but if you re-run `shopify app dev` it may rewrite `.env` to match the toml order.

### M3. `auto_stop_machines = "stop"` + `min_machines_running = 0` — confirmed acceptable but document caveat

Plan accepts cold starts for monthly admin use. With Remix + Prisma + Polaris bundle, expect 5-10s first request after suspension. Embedded Shopify admin will show a brief blank state. If a merchant clicks the app icon and waits ~10s without feedback, support will get pinged.

**Mitigation (informational):** add `[http_service.checks]` to keep machine warm OR document the cold-start expectation in the README/runbook so merchant gets warned.

### M4. `release_command` runs migrate-deploy with no rollback safety on partial application

`prisma migrate deploy` is idempotent for fully-applied migrations but if a single migration fails partway, Postgres is left in inconsistent state. For phase 03 (single empty `Session` table create), low risk. Flag for future migrations.

---

## Low Priority

### L1. `.dockerignore` excludes `*.md` but allows `README.md` — `prisma-postgres/` has no README anyway

Cosmetic. Current rule is fine.

### L2. `Dockerfile` ENV `NODE_ENV="production"` set in `base` stage — correct, but `npm ci --include=dev` in build stage relies on this not blocking dev deps install

`npm ci --include=dev` explicitly opts in, so it works. Verified.

### L3. Runbook step 6 hardcodes redirect_urls to 3 paths

`@shopify/shopify-app-remix` v4 actually only uses `/auth/callback`. The other two (`/auth/shopify/callback`, `/api/auth/callback`) are belt-and-suspenders from older templates. Not a bug, just unused. Leave them — no harm.

### L4. Runbook Troubleshooting row mentions `libc6-compat` as already-in-Dockerfile but Dockerfile only has `openssl python3 build-base`

Minor doc drift — `libc6-compat` is NOT in the Dockerfile. If `prisma generate` fails on glibc, will need to add. Update the troubleshooting table or add the package preemptively.

---

## Verified-Correct Checklist Items

| Item | Status |
|------|--------|
| `npx prisma generate` in build stage works without `DATABASE_URL` (Prisma generate doesn't need DB) | OK |
| `npm prune --omit=dev` keeps prisma CLI (it's in `dependencies`, not `devDependencies`) | OK — verified line 38 of package.json |
| Schema swap `rm -rf prisma && mv prisma-postgres prisma` is safe | OK — happens after COPY, before generate; both dirs exist |
| `.dockerignore` excludes `.env`, `.shopify`, `prisma/dev.sqlite`, `prisma/migrations/`, `.git` | OK |
| `release_command` finds postgres migrations (image has `prisma/migrations/20260509141500_init/migration.sql` after swap) | OK |
| Schema parity: `prisma-postgres/schema.prisma` model matches `prisma/schema.prisma` | OK — identical field-for-field, only datasource differs |
| Migration SQL parity: `migration.sql` matches schema | OK — all 17 fields present, types correctly mapped (sqlite TEXT→Postgres TEXT, DATETIME→TIMESTAMP(3), BOOLEAN→BOOLEAN, BIGINT→BIGINT) |
| `migration_lock.toml` provider = "postgresql" | OK |
| `client_id` preserved in `shopify.app.toml` (`0a0674917de5e3c26cf2a3e14be07a7f`) | OK — runbook step 6 explicitly verifies; no changes to file yet |
| `extensions/bundle-discount/` untouched | OK — git status shows no changes; runbook does not modify |
| Heterogeneous strategy is the right call | OK — single-table Session schema, no app code touches DB-specific features, Prisma client abstracts. Homogeneous-Postgres-everywhere would mean local Postgres install pain for marginal benefit. |
| Secrets not baked into image | OK — `.env*` in `.dockerignore`, runbook uses `flyctl secrets set` |
| Heterogeneous schema mirror process documented | OK — comment on line 1-2 of `prisma-postgres/schema.prisma` says "Mirrors prisma/schema.prisma" |

---

## Edge Cases / Future-Proofing

1. **Schema drift between `prisma/` and `prisma-postgres/`:** when you add a new model, you must update BOTH schema files AND create a migration in BOTH `prisma/migrations/` (sqlite) AND `prisma-postgres/migrations/` (postgres). Easy to forget. Suggest adding a pre-commit check or a journal note.

2. **`db.server.ts` global mutation in dev only:** correct pattern, but in production each instance creates a fresh `PrismaClient()`. With `min_machines_running = 0` and machine restart on each cold start, this is fine. If you later scale to multiple machines, no shared state issue (Postgres handles concurrency).

3. **No healthcheck route:** `fly.toml` has no `[http_service.checks]`. Fly will treat any HTTP 200/3xx on `/` as healthy, but if Shopify auth redirect fails for some reason, the machine could be marked unhealthy and rolled back. Not blocking — Fly default behavior is forgiving. Add a `/healthcheck` route in a future phase.

4. **`git status` shows `.dockerignore`, `Dockerfile`, `package.json` modified + `fly.toml`, `prisma-postgres/` untracked** — matches plan expectations. No surprise files.

---

## Recommended Actions (in order)

1. **[H1] Add `extensions/*/target/` to `.dockerignore`** — 1 minute, prevents 155MB image bloat.
2. **[L4] Either add `libc6-compat` to Dockerfile OR remove it from runbook troubleshooting** — pick consistency.
3. Run `flyctl deploy` per runbook. If release_command OOMs (M1), bump release VM memory.
4. **(Future)** When adding new Prisma models: update both schemas + both migration folders. Document in README or add a journal entry warning.

---

## Unresolved Questions

1. Did `prisma migrate diff --from-empty` output truly match the hand-written `migration.sql` byte-for-byte, or just structurally? (Important: subtle whitespace/quoting differences are fine, but verify column DEFAULTs, NOT NULL ordering, and constraint names match what Prisma would generate, otherwise next `migrate dev` against postgres will see drift.)
2. Will `extensions/bundle-discount/` (Rust function source) need to be present in the deployed image, or is it deployed separately via `shopify app deploy` only? (Currently bundled, contributing to image size but not required for the admin app to run.)
3. Fly free tier Postgres limit is 3GB — with `Session` table only, no concern, but if app evolves to store bundle data in Postgres, plan capacity.

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 03 deploy artifacts are correct, secure, and ready for `flyctl deploy`. One real bug (`extensions/*/target/` 155MB not dockerignored — H1) plus minor cold-start/OOM caveats worth flagging before production cutover.
**Concerns/Blockers:** Fix H1 before first deploy; consider H2 if image size > 200MB; M1 release-command OOM is a maybe-fix-after-observation item.
