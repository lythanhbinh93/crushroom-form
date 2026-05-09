# Phase 03 Fly Deploy Runbook (Neon Postgres)

Step-by-step commands for **you to run** in the `dopamiles-bundle-app` repo. All file prep is done. Branch: `feat/admin-ui-remix`.

**Architecture:** Fly.io VM (sin) + Neon Postgres (free tier, external).
**Why not Fly Postgres?** Unmanaged version is deprecated/unsupported; Managed starts at $38/mo. Neon's free tier (3GB, autoscale-to-zero) fits monthly-cadence admin perfectly.

> **PowerShell note:** all multi-flag commands below are written single-line. If you want line breaks, use backtick `` ` `` (NOT backslash). Bash users on WSL/git-bash can use `\`.

## 0. Install flyctl

**Windows (PowerShell admin):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Close + reopen terminal. Verify:
```powershell
flyctl version
```

## 1. Login

```powershell
flyctl auth login
```

(Opens browser; sign in / sign up.) Verify:
```powershell
flyctl auth whoami
```

## 2. Create Neon Postgres project

1. Browser → https://neon.tech → sign up (GitHub/Google works)
2. Create project:
   - Project name: `dopamiles-bundle`
   - Postgres version: 16 (default OK)
   - Region: **AWS Asia Pacific (Singapore)** `ap-southeast-1` — co-locate with Fly `sin`
3. From the dashboard, click **Connection Details** (top-right) and copy **TWO** URLs:
   - **Pooled** (default shown) — looks like: `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - **Direct/unpooled** — toggle "Pooled connection" OFF; URL drops `-pooler`: `postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

Save both somewhere safe (password manager). Pooled = runtime; Direct = migrations.

## 3. Create Fly app

App name `dopamiles-bundle-app` may be globally taken. If so, `flyctl` errors and you pick another — then update `fly.toml` `app =` and `SHOPIFY_APP_URL` accordingly.

```powershell
cd "d:/github local/dopamiles-bundle-app"
flyctl apps create dopamiles-bundle-app
```

## 4. Set Fly secrets (one command, single line)

Paste both Neon URLs from step 2 in place of the placeholders below. Pull `SHOPIFY_API_SECRET` from `.env`. Run as **one line** (PowerShell):

```powershell
flyctl secrets set SHOPIFY_API_KEY="0a0674917de5e3c26cf2a3e14be07a7f" SHOPIFY_API_SECRET="<paste from .env>" SCOPES="read_discounts,write_discounts,write_metaobject_definitions,write_metaobjects,write_products,read_orders,write_content" SHOPIFY_APP_URL="https://dopamiles-bundle-app.fly.dev" DATABASE_URL="<paste Neon POOLED URL>" DIRECT_URL="<paste Neon DIRECT URL>" --app dopamiles-bundle-app
```

If you prefer line-continuation, use backtick:
```powershell
flyctl secrets set `
  SHOPIFY_API_KEY="0a0674917de5e3c26cf2a3e14be07a7f" `
  SHOPIFY_API_SECRET="<from .env>" `
  SCOPES="read_discounts,write_discounts,write_metaobject_definitions,write_metaobjects,write_products,read_orders,write_content" `
  SHOPIFY_APP_URL="https://dopamiles-bundle-app.fly.dev" `
  DATABASE_URL="<Neon POOLED URL>" `
  DIRECT_URL="<Neon DIRECT URL>" `
  --app dopamiles-bundle-app
```

Verify:
```powershell
flyctl secrets list --app dopamiles-bundle-app
```

Expected names: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`, `DATABASE_URL`, `DIRECT_URL`.

## 5. First deploy

```powershell
flyctl deploy
```

Build phases (watch for):
1. Docker build (multi-stage; swaps `prisma/` → `prisma-postgres/`)
2. Image push to Fly registry
3. **Release step:** `npx prisma migrate deploy` runs in a fresh container against Neon Postgres — creates `Session` table (uses `DIRECT_URL`)
4. App VMs start in `sin`

Tail logs:
```powershell
flyctl logs --app dopamiles-bundle-app
```

**Expected log signals:**
- `Running release_command... Applying migration 20260509141500_init` → migrate ran
- `[remix-serve] http://[::]:3000` → app booted

## 6. Smoke check production URL

```powershell
curl.exe -I https://dopamiles-bundle-app.fly.dev/
```

(Use `curl.exe` on PowerShell — the bare `curl` alias is `Invoke-WebRequest` which behaves differently.)

Expect HTTP 302 (Shopify auth redirect) or 200 — not 5xx.

Open in browser: `https://dopamiles-bundle-app.fly.dev/auth/login` — should render Shopify login form. **Don't install on Dopamiles store yet — that's Phase 04.**

## 7. Update shopify.app.toml + register URL

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
```powershell
shopify app deploy
```

CLI prompts will show what's changing — confirm only `application_url` + `redirect_urls` change. **`extensions/bundle-discount/` (Function v6) should NOT appear in the diff.**

## 8. Verify Partner dashboard

- Shopify Partner → app `dopamiles-bundle-app`
- App URLs section shows `https://dopamiles-bundle-app.fly.dev`
- Discount Functions still lists `bundle-discount v6` under same `client_id`

## 9. Commit deploy artifacts

```powershell
git add Dockerfile .dockerignore .env.example fly.toml prisma-postgres/ package.json shopify.app.toml
git status
git commit -m "feat(deploy): postgres schema split + fly.io deploy + neon DB + shopify URL update"
```

(File prep was already committed earlier — this commit covers `shopify.app.toml` URL changes only.)

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `flyctl deploy` build fails on `prisma generate` | Missing native deps | Already covered: `apk add openssl build-base python3` in Dockerfile |
| Release fails: `prisma migrate deploy` errors `prepared statement already exists` | Pooled URL used for migration | Confirm `DIRECT_URL` set as Neon's **un-pooled** URL (no `-pooler`) |
| Release fails: connection timeout | Neon project paused (autoscale-to-zero) | First connection wakes it (~5s); just retry deploy |
| 502 on Fly URL | App crashed at boot | `flyctl logs` — usually missing `SHOPIFY_API_KEY/SECRET` secret |
| App auto-suspends | Fly free hobby tier auto-stop | Acceptable for monthly admin; set `min_machines_running = 1` in fly.toml if pain |
| `shopify app deploy` rejects | client_id mismatch | Confirm `shopify.app.toml` `client_id` matches Partner; never edit |
| Fly app name taken globally | Fly app names global | Pick unique, update `fly.toml` `app = `, `SHOPIFY_APP_URL` secret, `shopify.app.toml` URLs |
| Neon connection string shows `?channel_binding=require` | Newer Neon URL format | Works fine with Prisma; keep as-is |

## Rollback

```powershell
flyctl releases --app dopamiles-bundle-app
flyctl releases rollback <version> --app dopamiles-bundle-app
```

Neon: dashboard → branch history → restore (point-in-time recovery on free tier covers ~24h).

## Tear-down (if abandoning)

```powershell
flyctl apps destroy dopamiles-bundle-app
# Neon: dashboard → project settings → delete
```

---

**Gate:** when production URL serves the Shopify auth page + `shopify app deploy` registers the new URL → Phase 03 done. Proceed to Phase 04 (Dopamiles store re-auth + production smoke).
