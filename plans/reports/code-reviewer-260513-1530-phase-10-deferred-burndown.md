# Code Review — Phase 10 Deferred-Item Burndown (4 commits, feat/bug-fix-sprint)

Repo: `d:\github local\pod-tee-theme`
Plan: `plans/260511-1132-pod-tee-funnel-reset/phase-10-tail-cleanup.md`
Branch: `feat/bug-fix-sprint`
Baseline `shopify theme check`: 11 errors / 38 warnings — **unchanged after these 4 commits** (re-ran: 11 errors / 38 warnings).

---

## Per-commit assessment

### 1. `4480727` — extract 13 SVG call sites to `dopamiles-icon` snippet
**Verdict: PASS_WITH_NOTES**

Snippet output verified equivalent (semantically — attr order differs, browsers don't care) to each of the 13 inline call sites:

| Call site | Original attrs | Render params | OK |
|---|---|---|---|
| cart-drawer:75 | w/h=14, stroke=2.5, inline style valign | size:14, stroke:2.5, valign:true | yes |
| cart-main:141 | w/h=14, stroke=2.5, inline style valign | size:14, stroke:2.5, valign:true | yes |
| collection-grid:126 | w/h=11, stroke=2 | size:11 (default stroke 2) | yes |
| contact:100 | check-bold, stroke=2.5, no aria-hidden on SVG | check-bold, stroke:2.5 | yes (parent div already aria-hidden=true → no a11y regression) |
| faqs:40 | no size, class=chev, stroke=2 | chevron-down, class:'chev' | yes |
| gift-card:184 | w/h=16, stroke=2.2 | size:16, stroke:2.2 | yes |
| password:71 | w/h=18, stroke=2.2 | size:18, stroke:2.2 | yes |
| product-hero:285,295 | no size, class=chev, stroke=2 | chevron-down, class:'chev' | yes |
| bundle-cart-headline:66/77/88/99 | w/h=14, stroke=2.5 (no inline style) | size:14, stroke:2.5 (no valign) | yes |

**Verified safe:**
- All 13 call sites use lowercase icon names matching the snippet's `{% case %}` arms exactly — no silent-empty-SVG typo risk.
- `class` param guarded by `{% if class %}` → no `class=""` artifact when omitted.
- `valign` param emits inline `style` only on cart success rows (matches originals).
- `aria-hidden="true"` preserved on all 13 outputs.
- Whitespace control `{%- -%}` does not break inline-flex layouts — verified the snippet is consumed inside the same flow positions as the inline SVGs were.

**Notes / minor concerns:**
- `snippets/dopamiles-icon.liquid:24` — `check-bold` arm adds `stroke-linecap/linejoin="round"` correctly, BUT a non-`check-bold` call that also wants rounded caps would need a new param. YAGNI for now, just flag if future call sites need it.
- The contact-success SVG gains a redundant `aria-hidden="true"` (parent div already has it). Harmless, but a duplicate attribute on the same a11y subtree. Skip.
- Stroke-width attribute is always emitted, even when the original CSS-sized chevrons relied on default. Functionally equivalent (stroke="2" was the original).

### 2. `c33b194` — delete `dopamiles-chrome.css`
**Verdict: PASS**

- Grep confirms zero remaining references to `dopamiles-chrome` anywhere in the repo.
- `layout/theme.liquid` only dropped a stale comment line.
- BRAND-ASSETS.md line references verified accurate: `dopamiles-header.liquid:59` (the `<span class="dop-logo__dot">`), `dopamiles-header.css:53` (the `.dop-logo__dot` rule), and "see line 52" (the `logo_image` conditional) all match real file positions.
- No CSS missing — `dop-logo__dot` styled in `assets/dopamiles-header.css`.

### 3. `89b362a` — document `.dawn-backup.json` rollback policy
**Verdict: BLOCK — factual error in README**

The README claim **"Shopify ignores `.dawn-backup.json` — they do not affect the live theme"** is **wrong**. Shopify treats files named `<base-template>.<suffix>.json` as **alternate templates** with the suffix as the slug name (see shopify.dev → architecture/templates/alternate-templates). So the 7 backup files are registered as live alternate templates:

| File | Effect |
|---|---|
| `templates/product.dawn-backup.json` | Shows up in Admin → product → "Theme template" dropdown as "dawn-backup"; also at `/products/<handle>?view=dawn-backup` |
| `templates/collection.dawn-backup.json` | Shows up in Admin → collection → template dropdown |
| `templates/article.dawn-backup.json` | Shows up in Admin → article → template dropdown |
| `templates/blog.dawn-backup.json` | Same |
| `templates/cart.dawn-backup.json` | Reachable at `/cart?view=dawn-backup` |
| `templates/search.dawn-backup.json` | Reachable at `/search?view=dawn-backup` |
| `templates/index.dawn-backup.json` | Reachable at `/?view=dawn-backup` |

Real risk: a merchant browsing the Admin template dropdown can accidentally assign every product to the Dawn backup template, instantly regressing the storefront to pre-Dopamiles state. Also: Googlebot or attackers crawling `?view=dawn-backup` query strings will index the broken Dawn variant, creating duplicate-content + SEO mess.

**Required fix (one of):**
1. **Rename** the files to a non-template path. Move `templates/*.dawn-backup.json` → `archive/dawn-backups/*.json` (outside `templates/`). Shopify CLI uploads only known top-level theme dirs — files outside `templates/`, `sections/`, `snippets/`, `assets/`, `config/`, `layout/`, `locales/` are not uploaded.
2. **Add to `.shopifyignore`** so they stay in the repo but never upload (then push once to remove from live theme).
3. **Update README** to remove the false claim AND add a "do not assign in Admin / do not deep-link `?view=dawn-backup`" warning.

Also: the README's `shopify theme push --only templates/product.json` syntax is correct (verified against the Shopify CLI 3.x docs — `--only <path>` accepts a single file path).

### 4. `c99e14a` — delete unused `dopamiles-cart-line-item.liquid`
**Verdict: PASS**

- Grep across the entire repo (`.liquid`, `.js`, `.css`, `.json`, `.md`): zero references to `dopamiles-cart-line-item`.
- Cart drawer + cart main both render bundle children inline server-side, untouched by this delete.
- Commit rationale (pivot from refactor → delete) is well-justified in the message.

---

## User-visible rendering — no regressions found
- Bundle-cart-headline checkmarks (4 sites): identical viewBox/stroke/path/size → pixel-identical.
- PDP accordion chevrons (Details + custom blocks): identical, both keep `class="chev"` for CSS sizing.
- FAQ summary chevron: identical, keeps `class="chev"`.
- Cart "free shipping unlocked" check: identical (valign:true preserves inline-flex baseline).

---

## Recommended actions (priority order)
1. **BLOCK on commit 89b362a:** rename or `.shopifyignore` the 7 `.dawn-backup.json` files, and correct the README claim. Lowest-friction fix: move to `archive/dawn-backups/` and update the restore example accordingly.
2. (Optional) Add a code comment to `dopamiles-icon.liquid` warning that icon names are case-sensitive matched in the `case` block, so future contributors don't typo.
3. (Optional) Consider folding the redundant `aria-hidden="true"` on contact-success — purely cosmetic.

## Metrics
- Files changed: 14 across 4 commits
- Theme check: 11 errors / 38 warnings (baseline preserved, no new offenses)
- Net LOC: −137 lines (refactor + 3 deletes)

## Unresolved questions
- Should the dawn-backup rollback path stay in-repo at all? If the live store has already been stable for the threshold period, deleting these now removes the alternate-template footgun entirely and the rollback can be reconstructed from git history.
- Is `index.dawn-backup.json` actually selectable from the Admin homepage editor, or only via `?view=` deep-link? (Docs are ambiguous; either way the deep-link is reachable, which is enough to warrant the fix.)

---

**Status:** DONE_WITH_CONCERNS
**Summary:** 3 of 4 commits pass; commit `89b362a` README contains a factually incorrect claim about Shopify ignoring `.dawn-backup.json` template files — these are registered as live alternate templates and create a merchant/SEO footgun. Recommend renaming files out of `templates/` or `.shopifyignore`-ing them before this branch lands.
**Concerns/Blockers:** `templates/*.dawn-backup.json` are NOT ignored by Shopify; the 7 files become accessible alt-templates. README needs correction + files need to be moved or ignored.

Sources:
- [Shopify theme architecture — templates](https://shopify.dev/docs/storefronts/themes/architecture/templates)
- [Shopify alternate templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates)
