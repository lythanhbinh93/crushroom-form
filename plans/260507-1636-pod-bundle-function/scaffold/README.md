# Bundle Discount Function — Scaffold

Drop-in source for the Shopify Function. Files here are ready to copy into a fresh app once you've scaffolded it.

## Prerequisites

```powershell
# 1. Install Rust toolchain (one-time)
winget install --id Rustlang.Rustup -e
rustup target add wasm32-wasip1   # Shopify Functions WASM target

# 2. Verify Shopify CLI (already installed: 3.94.1)
shopify version
```

## Scaffold the app (interactive — you must run)

```powershell
cd "D:\github local"
shopify app init
# Prompts:
#   App name:           dopamiles-bundle-app
#   Template:           Remix (TypeScript)
#   Partner org:        <your Dopamiles partner>
#   Dev store:          <your Dopamiles dev store>
#   Distribution:       Custom

cd dopamiles-bundle-app
shopify app generate function
# Prompts:
#   Function type:      Product discount
#   Language:           Rust
#   Function name:      bundle-discount
```

## Copy scaffold files into the new app

After `shopify app generate function` completes, replace the auto-generated files with these:

```powershell
$src = "D:\github local\crushroom-form\plans\260507-1636-pod-bundle-function\scaffold"
$dst = "D:\github local\dopamiles-bundle-app"

Copy-Item "$src\extensions\bundle-discount\shopify.extension.toml" -Destination "$dst\extensions\bundle-discount\" -Force
Copy-Item "$src\extensions\bundle-discount\Cargo.toml"             -Destination "$dst\extensions\bundle-discount\" -Force
Copy-Item "$src\extensions\bundle-discount\input.graphql"          -Destination "$dst\extensions\bundle-discount\" -Force
Copy-Item "$src\extensions\bundle-discount\src\main.rs"            -Destination "$dst\extensions\bundle-discount\src\" -Force
Copy-Item "$src\extensions\bundle-discount\tests\"                 -Destination "$dst\extensions\bundle-discount\" -Recurse -Force
```

## Implementation pivot — product tag, not collection ID

**Original brainstorm decision:** eligibility = curated `bundle-eligible` collection, ID stored in metafield.

**Implementation reality:** Shopify Functions GraphQL doesn't accept runtime variables for `inCollections(ids:)`. The collection ID would have to be hardcoded into `input.graphql` at build time — defeating the metafield-driven flexibility goal.

**Pivot:** Use **product tag `bundle-eligible`** with `hasTags()` query. UX equivalent — admins create a **Smart Collection** in Shopify admin filtered by the tag, customers see a normal collection on the storefront, but the Function checks the tag directly (cheaper, runtime-flexible).

**Net change:**
- Tag products `bundle-eligible` to make them eligible
- Smart Collection auto-populates ("Bundle Eligible") for storefront browsing
- Function reads tag name from metafield `bundles.eligible_tag` (default: `bundle-eligible`)

The plan's phase-01 doc has been updated to reflect this. Locked decision still honored: tier values + eligibility config both live in shop metafields.

## Build & test

```powershell
cd "D:\github local\dopamiles-bundle-app\extensions\bundle-discount"

# Run each fixture
foreach ($f in (Get-ChildItem tests\fixtures\*.json)) {
  shopify app function run --input $f.FullName
}

# Expected outputs documented in tests/fixtures/EXPECTED.md
```

## Seed dev-store metafields

Only ONE metafield is needed (eligibility tag is hardcoded in `input.graphql` for now).

Shopify admin → Settings → Custom data → Shop → Add definition:

| Namespace | Key | Type | Default value to seed |
|---|---|---|---|
| `bundles` | `tiers` | JSON | `[{"min":2,"pct":15},{"min":3,"pct":25}]` |

Then **edit the shop's metafields** under Settings → Custom data → Shop entries → set tier JSON value (definitions don't auto-populate).

## Tag products as bundle-eligible

In Shopify admin → Products → bulk-select tees → Add tag → `bundle-eligible`.

Optional: create a Smart Collection "Bundle Eligible" filtered by tag — gives you a clean storefront URL `/collections/bundle-eligible` and lets the picker page (Phase 04) browse it natively.

## Deploy

```powershell
cd "D:\github local\dopamiles-bundle-app"
shopify app deploy
```

Confirm in Partner dashboard → App → Extensions → bundle-discount shows "Active".

---

## Phase 02 — Admin Polaris Page

Custom embedded admin page at `/app/bundle-config` for editing tier JSON.
No collection picker — eligibility is tag-based (`bundle-eligible`), so the
admin only needs to tune tier breakpoints.

### New files produced by Phase 02

| Scaffold path | Target path in app | Purpose |
|---|---|---|
| `app/routes/app.bundle-config.tsx` | `app/routes/app.bundle-config.tsx` | Main route: loader, action, Polaris page shell |
| `app/components/bundle-tier-editor.tsx` | `app/components/bundle-tier-editor.tsx` | Polaris form card: textarea + live validation + preview |
| `app/lib/bundle-config-validation.ts` | `app/lib/bundle-config-validation.ts` | Pure tier JSON validator + preview helper |
| `app/lib/bundle-config-graphql.ts` | `app/lib/bundle-config-graphql.ts` | Admin GraphQL read/write helpers |
| `app/routes/PATCHES.md` | _(reference only — do not copy)_ | Manual patch instructions for generated files |

### Copy commands

```powershell
$src = "D:\github local\crushroom-form\plans\260507-1636-pod-bundle-function\scaffold"
$dst = "D:\github local\dopamiles-bundle-app"

# Create directories if they don't exist
New-Item -ItemType Directory -Force -Path "$dst\app\lib"        | Out-Null
New-Item -ItemType Directory -Force -Path "$dst\app\components" | Out-Null

# Copy Phase 02 files
Copy-Item "$src\app\routes\app.bundle-config.tsx"        -Destination "$dst\app\routes\"     -Force
Copy-Item "$src\app\components\bundle-tier-editor.tsx"   -Destination "$dst\app\components\" -Force
Copy-Item "$src\app\lib\bundle-config-validation.ts"     -Destination "$dst\app\lib\"        -Force
Copy-Item "$src\app\lib\bundle-config-graphql.ts"        -Destination "$dst\app\lib\"        -Force
```

### Required Admin API scopes

Add these to `shopify.app.toml` before deploying:

```toml
scopes = "read_products,write_discounts,read_discounts,write_metafields"
```

`write_metafields` is the critical addition — it authorises `metafieldsSet`
on the shop owner. Without it, saves return a 403 user error.

### Manual patches required after copy

See `app/routes/PATCHES.md` for:
1. Adding the nav link to `app/routes/app.tsx` (`<NavMenu>`)
2. Confirming `shopify.server.ts` exports `authenticate`
3. Updating `shopify.app.toml` scopes
4. Optional: Polaris `monospaced` prop version note

### Validation rules enforced

| Rule | Detail |
|---|---|
| Valid JSON | Must parse without error |
| Array of objects | `[{min, pct}, ...]`, min 1 element |
| `min` | Positive integer ≥ 1 |
| `pct` | Integer 1–50 (margin guardrail — blocks accidental 100% off) |
| No duplicate `min` | Ambiguous tier selection rejected |
| Auto-sorted | Saved tiers sorted ascending by `min` (matches Function logic) |

### Smoke test (manual, dev store)

1. Open Shopify admin → Apps → dopamiles-bundle-app → Bundle Config
2. Edit tiers JSON, introduce a parse error — Save button should be disabled
3. Fix JSON, click Save — success banner appears
4. Verify via GraphiQL: `shop { metafield(namespace:"bundles", key:"tiers") { value } }`
5. Add 2 tagged tees to cart → confirm 15% discount applies (Function reads new value)

---

## Phase 03 — Theme integration

Liquid snippets and a section that surface the bundle discount on the storefront.
All files are drop-in valid Shopify OS 2.0 Liquid — no JS dependencies added.

### New files produced by Phase 03

| Scaffold path | Target path in `pod-tee-theme` | Purpose |
|---|---|---|
| `theme/snippets/bundle-banner.liquid` | `snippets/bundle-banner.liquid` | PDP + collection upsell strip; reads `shop.metafields.bundles.tiers` |
| `theme/snippets/bundle-cart-discount-line.liquid` | `snippets/bundle-cart-discount-line.liquid` | "Bundle saving · -$X" row in cart drawer totals |
| `theme/snippets/bundle-free-ship-progress.liquid` | `snippets/bundle-free-ship-progress.liquid` | Free-ship bar using post-discount `cart.total_price`; state-aware copy |
| `theme/sections/bundle-tease-banner.liquid` | `sections/bundle-tease-banner.liquid` | Section wrapper for theme-editor placement on collection pages |
| `theme/assets/dopamiles-bundle.css` | `assets/dopamiles-bundle.css` | Collection pill + cart headline + banner override styles |

### Copy commands

```powershell
$src = "D:\github local\crushroom-form\plans\260507-1636-pod-bundle-function\scaffold\theme"
$dst = "D:\github local\pod-tee-theme"

# Snippets
Copy-Item "$src\snippets\bundle-banner.liquid"               -Destination "$dst\snippets\" -Force
Copy-Item "$src\snippets\bundle-cart-discount-line.liquid"   -Destination "$dst\snippets\" -Force
Copy-Item "$src\snippets\bundle-free-ship-progress.liquid"   -Destination "$dst\snippets\" -Force

# Section
Copy-Item "$src\sections\bundle-tease-banner.liquid"         -Destination "$dst\sections\" -Force

# Asset
Copy-Item "$src\assets\dopamiles-bundle.css"                 -Destination "$dst\assets\"   -Force
```

### Manual patches required after copy

See `theme/PATCHES.md` for full diff instructions. Summary:

1. **`sections/dopamiles-product-hero.liquid` ~line 124** — insert `{%- render 'bundle-banner' -%}` above `{%- form 'product' ... -%}`
2. **`sections/dopamiles-cart-drawer.liquid` ~line 70** — replace existing ship-bar `<div>` block with `{%- render 'bundle-free-ship-progress' -%}`
3. **`sections/dopamiles-cart-drawer.liquid` ~line 248** — insert `{%- render 'bundle-cart-discount-line' -%}` before `.dop-drawer-foot`
4. **`sections/dopamiles-cart-drawer.liquid` ~lines 11–15** — remove redundant ship variable assignments (snippet owns them now); fix the upsell `ship_remaining` reference (see PATCHES.md §3)
5. **`layout/theme.liquid`** — add `{{ 'dopamiles-bundle.css' | asset_url | stylesheet_tag }}` after `base.css`

### QA checklist (dev store)

| Scenario | Expected |
|---|---|
| PDP, metafield set | Orange banner: "Add a 2nd tee — save 15% · Make it a 3-pack — save 25%" + CTA |
| PDP, metafield missing | Banner hidden (no empty box) |
| 1 eligible tee in cart | Ship bar: "Add $X more for free shipping" |
| 2 eligible tees in cart ($57.80 net) | Ship bar joint upsell: "Add $X more — or go for a 3-pack..." |
| 3 eligible tees in cart ($76.50+ net) | Ship bar: "Free shipping unlocked." + green fill |
| Bundle discount applied | "Bundle saving · -$X" green row appears above checkout |
| No bundle discount | Green row absent |
| Mobile 375px | Banner stacks vertically, no ATC pushed below fold |

---

## Smoke test (manual, on dev store)

| Cart | Expected |
|---|---|
| 1 tagged tee | No discount |
| 2 tagged tees | 15% off both lines |
| 3 tagged tees | 25% off all three lines |
| 2 tagged + 1 untagged | 15% off the 2 tagged only; untagged untouched |
| 0 tagged, 3 untagged | No discount |
| Promo code applied | Bundle discount **does not stack** (verify cart math) |

If any case misbehaves, check `shopify app logs` for Function output trace.
