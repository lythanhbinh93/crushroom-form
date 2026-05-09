# Phase 03 Fly Deploy Runbook

Step-by-step commands for **you to run** in the `dopamiles-bundle-app` repo. All file prep is done (Dockerfile, fly.toml, prisma-postgres/, .dockerignore, .env.example, package.json setup script). Branch: `feat/admin-ui-remix`.

## 0. Install flyctl

**Windows (PowerShell admin):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Then close + reopen terminal. Verify:
```bash
flyctl version
```

## 1. Login

```bash
flyctl auth login
```

(Opens browser; sign in / sign up.)

```bash
flyctl auth whoami    # confirm
```

## 2. Create app + Postgres

App name `dopamiles-bundle-app` may be taken globally — Fly will prompt for an alternate. Pick a unique one and update `fly.toml` `app = ` to match.

```bash
cd "d:/github local/dopamiles-bundle-app"

# Create app (does NOT deploy — just registers name + reads fly.toml)
flyctl apps create dopamiles-bundle-app

# Create Postgres cluster (Hobby tier, free)
flyctl postgres create \
  --name dopamiles-bundle-db \
  --region sin \
  --vm-size shared-cpu-1x \
  --volume-size 1 \
  --initial-cluster-size 1
# Save the printed connection string in your password manager.

# Attach Postgres to app — auto-injects DATABASE_URL secret
flyctl postgres attach dopamiles-bundle-db --app dopamiles-bundle-app
```

## 3. Set Shopify secrets

Pull values from `.env`:

```bash
flyctl secrets set \
  SHOPIFY_API_KEY="0a0674917de5e3c26cf2a3e14be07a7f" \
  SHOPIFY_API_SECRET="<from .env SHOPIFY_API_SECRET>" \
  SCOPES="read_discounts,write_discounts,write_metaobject_definitions,write_metaobjects,write_products,read_orders,write_content" \
  SHOPIFY_APP_URL="https://dopamiles-bundle-app.fly.dev" \
  --app dopamiles-bundle-app

flyctl secrets list --app dopamiles-bundle-app
# Expected: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES, SHOPIFY_APP_URL, DATABASE_URL
```

If your Fly app name differs from `dopamiles-bundle-app`, update SHOPIFY_APP_URL accordingly (and remember to update `shopify.app.toml` in step 6).

## 4. First deploy

```bash
flyctl deploy
```

What happens:
- Docker build (multi-stage) — swaps `prisma/` for `prisma-postgres/` schema
- Image push to Fly registry
- **Release step**: `npx prisma migrate deploy` runs against attached Postgres → creates `Session` table
- VM rollout in `sin` region

Tail logs:
```bash
flyctl logs --app dopamiles-bundle-app
```

## 5. Smoke check production URL

```bash
curl -I https://dopamiles-bundle-app.fly.dev/
# Expect: HTTP/2 302 (Shopify auth redirect) or 200 — not 5xx
```

Open in browser:
```
https://dopamiles-bundle-app.fly.dev/auth/login
```

Should render Shopify login form. Don't install on Dopamiles store yet — that's Phase 04.

## 6. Update shopify.app.toml + register URL

Edit `shopify.app.toml`:

```toml
application_url = "https://dopamiles-bundle-app.fly.dev"

[auth]
redirect_urls = [
  "https://dopamiles-bundle-app.fly.dev/auth/callback",
  "https://dopamiles-bundle-app.fly.dev/auth/shopify/callback",
  "https://dopamiles-bundle-app.fly.dev/api/auth/callback"
]
```

**Verify `client_id = "0a0674917de5e3c26cf2a3e14be07a7f"` UNCHANGED.**

Push to Partner dashboard:
```bash
shopify app deploy
```

CLI prompts will show what's changing — confirm only `application_url` + `redirect_urls` change. **Function v6 + `DiscountAutomaticNode/1396914946300` should NOT appear in the diff.**

## 7. Verify Partner dashboard

- Open Shopify Partner dashboard → app `dopamiles-bundle-app`
- App URLs section should show `https://dopamiles-bundle-app.fly.dev`
- Discount Functions should still list bundle-discount v6

## 8. Commit

```bash
git add Dockerfile .dockerignore .env.example fly.toml prisma-postgres/ package.json shopify.app.toml
git status   # confirm no unintended files
git commit -m "feat(deploy): postgres schema split + fly.io sin deploy + shopify URL update"
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `flyctl deploy` build fails on `prisma generate` | Native binary download blocked | Add `RUN apk add --no-cache openssl libc6-compat` (already in Dockerfile) |
| Release command fails on `migrate deploy` | DATABASE_URL secret not set | `flyctl secrets list` — confirm DATABASE_URL present; if not, re-run `postgres attach` |
| 502 on Fly URL after deploy | App crashed at boot | `flyctl logs` — common cause: missing SHOPIFY_API_KEY/SECRET secret |
| App auto-suspends | Free tier auto-stop | Acceptable for monthly admin use; set `min_machines_running = 1` in fly.toml if needed |
| `shopify app deploy` rejects | client_id mismatch | Confirm `shopify.app.toml` `client_id` matches Partner; never edit |
| App name taken globally | Fly app names are global | Pick unique name, update `fly.toml` `app = `, secrets `SHOPIFY_APP_URL`, `shopify.app.toml` URLs |

## Rollback

```bash
flyctl releases --app dopamiles-bundle-app
flyctl releases rollback <version> --app dopamiles-bundle-app
```

## Tear-down (if abandoning)

```bash
flyctl apps destroy dopamiles-bundle-app
flyctl postgres destroy dopamiles-bundle-db
```

---

**After this runbook completes successfully, Phase 03 gate is met:** Fly app reachable + `shopify app deploy` updates application_url. Proceed to Phase 04 (Dopamiles store re-auth + production smoke).
