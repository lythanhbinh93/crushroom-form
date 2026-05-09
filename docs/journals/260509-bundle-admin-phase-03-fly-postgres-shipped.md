# Bundle Admin Phase 03 — Fly.io + Postgres Shipped

**Date**: 2026-05-09 14:30
**Severity**: Medium
**Component**: Bundle admin Remix app deployment / DB migration
**Status**: SHIPPED

## What Happened

Phase 03 shipped production-ready: Remix admin app deployed to Fly.io free tier (sin region) with Neon Postgres backend. App live at `https://dopamiles-bundles-admin.fly.dev`. Shopify Partner registered new app version `dopamiles-bundle-app-7`; `client_id` (0a0674917de5e3c26cf2a3e14be07a7f) preserved. Bundle discount Function v6 still active. Single `Session` table created via Prisma migration. Commits: dopamiles-bundle-app 37ff19c, aaad790, abb869a; crushroom-form fc4e736, 3875de0.

## The Brutal Truth

Mid-deploy discovery that the plan's entire heterogeneous-DB strategy was wrong felt like time wasted on research that was guaranteed to fail. The deeper sting: it wasn't caught in review — Prisma docs explicitly say `provider` must be a literal string, not env-gated. That's a reading-comprehension miss on both author and reviewer. Also, Fly's Postgres free tier was deprecated, which means the plan was outdated by assumption, not by us shipping slower than Fly's roadmap. That combo (wrong design + stale infra assumption) forced a mid-deploy pivot from Fly Postgres → Neon. Frustrating because it burned ~45min on a false path when Phase 04 is already at the gate.

Node 20 EOL hitting us at build time (Polaris types v1.0.7 needs Node >=22.18.0) was preventable — Dockerfile should have bumped weeks ago during initial app scaffolding. Classic "ship local, hit reality at scale" moment.

PowerShell backtick syntax in the runbook wasn't checked by anyone who actually runs Windows. Bash muscle memory wrote `\` line continuations; user hit the silent failure (flyctl accepted partial command, never complained). That's a docs-as-code gap — runbook should have been tested end-to-end on Windows before shipping.

## Technical Details

**Prisma heterogeneous design pivot:**
Plan claimed `datasource db { provider = env("DATABASE_PROVIDER") }` would let us swap SQLite (dev) ↔ Postgres (prod) via environment. Prisma 6 doesn't support this — provider field must be a string literal at codegen time. Discovered at `pnpm prisma generate` during Docker build attempt #1. Pivoted to two-folder schema (`prisma/schema.prisma` SQLite; `prisma-postgres/schema.prisma` Postgres), with Dockerfile `RUN rm -rf prisma && mv prisma-postgres prisma` before build. Schema parity verified field-for-field; migration hand-written and validated against `prisma migrate diff --from-empty`.

**Fly Postgres deprecation:**
`flyctl postgres create` CLI threw `[WARN] Unmanaged Fly Postgres is not supported... users responsible for disaster recovery` during user's initial attempt. Plan author assumed "Fly free tier has 3GB Postgres" — that tier was Unmanaged and is now deprecated. Fly Managed Postgres minimum is $38/mo Basic. Neon free tier (3GB, autoscale-to-zero, ap-southeast-1) fit the monthly-cadence budget exactly. Cost: zero (free); zero monetary risk.

**Neon URL split (`DATABASE_URL` + `DIRECT_URL`):**
Neon's pooled URL (`ep-xxx-pooler.ap-southeast-1...`) hits a connection pooler that strips prepared statements, breaking `prisma migrate deploy` (prepared statement already exists error). Neon provides two URLs: pooled (for runtime) and direct/unpooled (for migrations). Prisma schema needs `directUrl = env("DIRECT_URL")` + `url = env("DATABASE_URL")`. Flew as a separate surprise during first deploy failure; fixed by re-reading Neon docs and setting both secrets.

**Node version mismatch:**
Dockerfile inherited `NODE_VERSION=20` from early scaffold. Polaris types v1.0.7 requires Node >=22.18.0. Build failed with `The current version of Node.js (20.x.x) does not meet the stated requirement of >=22.18.0`. Bumped to `NODE_VERSION=22`; build succeeded on retry #3.

**PowerShell syntax in runbook:**
Runbook had bash-style line continuations (`\`) in PowerShell examples. Step 4 (set Fly secrets) split across multiple lines; user's PowerShell silently dropped the `flyctl` invocation at the first `\` (bash line continuation is not valid syntax in PowerShell). User re-ran as single-line; worked. Runbook should have shown **backtick** (`` ` ``) for PowerShell. This is a docs-as-code debt: no one validated the runbook on Windows PowerShell before shipping.

**Fly app name globally unique:**
`dopamiles-bundle-app` was taken. User picked `dopamiles-bundles-admin`. Required ripple fixes: `fly.toml` `app = "dopamiles-bundles-admin"`, `SHOPIFY_APP_URL` secret updated, `shopify.app.toml` URLs (application_url + redirect_urls) updated. All three must align or auth redirect loops.

**Secrets leakage from failed `flyctl apps create`:**
User's first `flyctl apps create dopamiles-bundle-app` failed (name taken). Second `flyctl apps create dopamiles-bundles-admin` succeeded. However, when user ran `flyctl secrets set ... --app dopamiles-bundle-app` during the first attempt, Fly silently accepted the command against a non-existent app (no error, no warning). When the ACTUAL app was `dopamiles-bundles-admin`, it only had the one secret set during retry. Resulting deploy failed: "Environment variable not found: DIRECT_URL". Solution: re-set all 6 secrets against the actual app. Fly's UX here is forgiving-to-a-fault; should error if app doesn't exist.

**Build artifacts in Neon URLs:**
Neon pooled URLs include `&channel_binding=require` query param (newer Neon format). On PowerShell, `&` is a command separator without single quotes. Runbook step 4 explicitly used single quotes (`'...'`) to protect the URL from shell interpolation — this was correct and documented. That's the one thing that worked as intended.

**Code review catch:**
`extensions/bundle-discount/target/` (Rust build artifacts, ~155MB) was not in `.dockerignore`. Would have inflated the image and violated the <250MB non-functional requirement. Fixed before deploy: added `extensions/*/target/`, `extensions/*/Cargo.lock`, `extensions/*/.shopify/` to `.dockerignore`.

## What We Tried

1. **Prisma env-based provider** → failed at schema generation; pivoted to two-folder pattern. Confirmed with Prisma docs that codegen happens at build-time before env vars can be read.

2. **Fly Postgres (Unmanaged)** → deprecated CLI warning + cost prohibitive (Managed = $38/mo). Pivoted to Neon free tier in same region (ap-southeast-1 → Fly sin co-location).

3. **Node 20 in Dockerfile** → build failed on Polaris types requirement. Bumped to 22; build succeeded.

4. **Bash-style line continuations in runbook** → silent failure in PowerShell. Rewrote for backtick syntax.

5. **First deploy attempt** (with Fly Postgres intent) → DB connection error before build even finished. Aborted; pivoted to Neon.

6. **Second deploy attempt** (Neon, Node 20) → Node version error. Bumped Node; next retry succeeded.

7. **Third deploy attempt** (Neon, Node 22) → `prisma migrate deploy` failed (only `DATABASE_URL` set, not `DIRECT_URL`). Added missing secret; final retry succeeded.

## Root Cause Analysis

**Heterogeneous design claim was unvetted.** Plan author cited "Prisma supports env-based provider" without reading Prisma schema docs (provider field is literal, not runtime-evaluated). Should have been caught in plan review or at least during implementation read-ahead.

**Fly's Postgres free tier EOL was not tracked.** Plan authored ~2–3 weeks prior; Fly's deprecation of Unmanaged Postgres predates that. Should have cross-checked Fly docs during plan phase. Plan review should flag "free tier" assumptions as needing confirmation.

**Node 20 was locked in scaffolding phase without forward-pass.** Polaris types v1.0.7 was already published; didn't check breaking reqs during scaffolding. Should have used latest stable (Node 22) from the start.

**PowerShell syntax not tested on Windows.** Runbook written in generic "multi-line shell" style without testing on target OS. Bash and PowerShell are different languages; line continuation is not portable.

**Fly secret handling is too permissive.** Setting secrets against non-existent app doesn't error — user gets a false sense of completion, then deploy fails with env var not found. This is Fly's UX debt, not ours, but it burned 10min of debugging.

## Lessons Learned

1. **Prisma's `datasource` block is compile-time, not runtime.** Env vars that control schema structure (datasource provider, database_url, etc.) must be resolved before `prisma generate`. For heterogeneous dev/prod DB, two schemas are necessary — not env-gating. This is a doc-the-pattern thing: future Prisma migrations should follow this two-folder layout from the start.

2. **"Free tier" in cloud infra plans is a liability.** Free offerings change, get deprecated, or have hidden scaling cliffs. Plans that rely on free tiers need a validation step: "Check Fly docs for current free Postgres offering" or similar. Or use a paid baseline ($5/mo) and mark it explicitly in the plan.

3. **Node version requirements are transitive.** When picking a Remix/Polaris version, check the entire dependency tree for Node constraints. Package.json `engines` field is not always populated. Use `npm outdated` or read package READMEs for minimum Node requirements.

4. **Runbooks must be tested on the target platform.** Bash and PowerShell are incompatible enough (line continuation, variable syntax, quote handling, pipe behavior) that a runbook written generically will fail on half the users. Test on Windows (PowerShell) and Unix (bash/zsh) before shipping, or clearly mark which shell each section targets.

5. **Fly app creation should validate the app name upfront.** The silent-success on non-existent-app is a UX trap. But we can't change Fly, so runbooks should explicitly say: "Verify the app was created: `flyctl apps list`" after the create step.

6. **Heterogeneous-DB pain is real, but necessary here.** The pain (two schemas, two migration folders) is worth it vs. forcing local Postgres install for monthly-cadence admin work. Document the pattern: "When adding a new model, update both `prisma/schema.prisma` AND `prisma-postgres/schema.prisma`, and create migrations in both folders." Could automate this with a script, but manual is acceptable at this scale.

## Next Steps

- **Phase 04:** Dopamiles store re-auth + production smoke tests. Phase 03 unblocked it by stabilizing the production URL and Shopify Partner registration.
- **Pre-commit hook (nice-to-have):** schema-parity check that validates both Prisma folders define the same models. Flag at git commit time if they drift.
- **Future Node upgrades:** check `npm outdated` + package READMEs for `engines` constraints before bumping Node in Dockerfile.
- **Runbook template:** create a `.claude/skills/runbook-validator/` that tests Shell syntax on both Bash and PowerShell, or at least warns "This runbook was not validated on PowerShell."

---

**Status:** DONE
**Summary:** Phase 03 shipped. Heterogeneous DB strategy required mid-plan pivot (env-based provider unworkable; two-folder schema deployed instead). Fly Postgres deprecated; Neon free tier substituted. Node 20 bumped to 22. Runbook PowerShell syntax fixed. App live, Partner registered, Phase 04 unblocked.
**Concerns:** None blocking. Two-schema pattern is unfamiliar; document for next Prisma change.
