# Phase 02 — Custom Polaris Admin Page

## Context Links
- Brainstorm: `plans/reports/brainstorm-260507-1636-pod-bundle-function.md` (§10 decision #6)
- Parent plan: [plan.md](plan.md)
- Blocked by: [phase-01](phase-01-shopify-app-and-discount-function.md) (metafield schema must exist)
- Polaris docs: https://polaris.shopify.com/components
- Shopify App Bridge ResourcePicker: https://shopify.dev/docs/api/app-bridge-library/react-components/resourcepicker
- Admin GraphQL `metafieldsSet`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet

## Overview
- **Priority:** P1 (replaces raw metafield editor — merchant-grade UX)
- **Status:** pending
- **Effort:** 2-3 days
- **Description:** Embedded admin page in the Remix app at `/app/bundle-config` for editing tier JSON. Polaris components, JSON validation, writes via Admin GraphQL `metafieldsSet`.

> **Implementation update (post-pivot):** Eligibility uses product tag `bundle-eligible` (hardcoded in Phase 01 `input.graphql`), not a metafield-stored collection ID. **Collection picker is dropped from v1.** Page is single-card: tier JSON editor only. References to `bundle-collection-picker.tsx` and `eligible_collection_id` in this doc below predate the pivot — see Phase 01 doc §Architecture for canonical schema.

## Key Insights
- Page lives in same Remix app as Function (Phase 01) — no new repo
- Shopify Admin embeds via App Bridge; Polaris components match native admin styling
- JSON tier editor needs **client-side validation** before save (shape: `[{min, pct}]`, both positive ints, sorted by min ascending)
- ResourcePicker for collection — returns full GID; store as-is in metafield (matches Function expectation)
- Save = single `metafieldsSet` mutation with both metafields in one call (atomic)
- On load, fetch current values; on save, write + toast confirmation; on error, banner with details

## Requirements

**Functional**
- Route `/app/bundle-config` shows current tiers + current eligible collection
- TextField (multiline, monospace) for tier JSON with inline validation feedback
- ResourcePicker button → opens collection picker → shows selected collection name + ID
- Save button → writes both metafields via Admin GraphQL → toast on success / banner on error
- "Reset to defaults" button → loads default tier JSON `[{"min":2,"pct":15},{"min":3,"pct":25}]` into editor (does not save)
- Validation rules:
  - Must be valid JSON
  - Must be array of `{min: int≥1, pct: int 1-50}` (50% margin guardrail)
  - At least 1 tier
  - Tiers sorted by `min` ascending (auto-sort on save)
- Disable Save until JSON valid AND collection selected

**Non-functional**
- Polaris `AppProvider` + Shopify App Bridge React wrappers
- Loader + action pattern (Remix conventions)
- TypeScript strict
- Page renders <500ms p95
- Accessibility: keyboard nav, ARIA labels on Save/Picker

## Architecture

```
Browser (Shopify admin iframe)
   │
   ▼
┌──────────────────────────────────────┐
│ /app/bundle-config (Remix route)     │
│  ┌──────────────────────────────┐    │
│  │ loader(): fetch metafields   │    │
│  │  via authenticate.admin GQL  │    │
│  ├──────────────────────────────┤    │
│  │ Component:                   │    │
│  │   <Page>                     │    │
│  │     <Card> JSON editor       │    │
│  │     <Card> Collection picker │    │
│  │     <Button primary>Save     │    │
│  │     <Toast> / <Banner>       │    │
│  ├──────────────────────────────┤    │
│  │ action(): metafieldsSet      │    │
│  │  validate → write → return   │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
   │
   ▼
Admin GraphQL → shop metafields updated → Function (Phase 01) reads on next cart calc
```

## Related Code Files

**To create (new app repo from Phase 01):**
- `app/routes/app.bundle-config.tsx` — main route (loader, action, component)
- `app/lib/bundle-config-validation.ts` — tier JSON validator (pure fn, unit-testable)
- `app/lib/bundle-config-graphql.ts` — GraphQL queries/mutations (read + write metafields)
- `app/components/bundle-tier-editor.tsx` — TextField with inline validation
- `app/components/bundle-collection-picker.tsx` — ResourcePicker wrapper
- `app/lib/bundle-config-validation.test.ts` — unit tests for validator
- (Update) `app/routes/app.tsx` — add nav link to `/app/bundle-config`
- (Update) `shopify.app.toml` — add scopes `write_products`, `write_discounts` (for metafieldsSet on shop)

**To modify:**
- None outside new app repo

## Implementation Steps

1. Verify Phase 01 metafield definitions exist on dev store (or define via app on first install)
2. Create `app/lib/bundle-config-validation.ts`:
   - `validateTiers(input: unknown): {ok: true, tiers: Tier[]} | {ok: false, error: string}`
   - Checks JSON parse, array shape, int bounds, dedupe min, auto-sort
3. Write unit tests `bundle-config-validation.test.ts` covering: valid, invalid JSON, missing fields, negative pct, pct≥100, duplicate min, unsorted (should sort), empty array
4. Create `app/lib/bundle-config-graphql.ts`:
   - `getBundleConfig(admin)` → reads both metafields
   - `setBundleConfig(admin, {tiers, collectionId})` → `metafieldsSet` mutation
5. Create `app/components/bundle-tier-editor.tsx` — Polaris TextField, monospace, multiline rows=8, error prop wired to validator
6. Create `app/components/bundle-collection-picker.tsx` — uses App Bridge `ResourcePicker` with `resourceType: "Collection"`, single-select
7. Create `app/routes/app.bundle-config.tsx`:
   - `loader` — call `getBundleConfig`, return current values
   - Component — useState for tier JSON + collection; show tier editor + picker + Save + Reset
   - `action` — validate, call `setBundleConfig`, return `{success: true}` or `{error}`
   - Toast on success, Banner on error
8. Add nav link in `app/routes/app.tsx` (or app navigation config)
9. Update `shopify.app.toml` scopes if missing
10. Local dev: `shopify app dev` → open admin embed → edit tiers → save → confirm Function picks up new tiers on next checkout

## Todo List

- [ ] Validator module + 8 unit tests, all green
- [ ] GraphQL helper module (read + write)
- [ ] Tier editor component
- [ ] Collection picker component
- [ ] Bundle-config route (loader, action, UI)
- [ ] Nav link to page from app shell
- [ ] Scopes updated in shopify.app.toml
- [ ] End-to-end: edit → save → checkout reflects new tier
- [ ] Reset-to-defaults button works
- [ ] Banner shown on GraphQL error

## Success Criteria

- All validator unit tests pass
- Page loads in admin embed without console errors
- Save persists to metafields (verified via GraphiQL)
- Function (Phase 01) reads new values on next cart calc
- Invalid JSON blocks save with clear inline error
- Collection picker returns proper GID format

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Validator allows malformed JSON through → Function fails over to no-discount | Med | Med | Comprehensive unit tests; Function fail-safe is backstop |
| Wrong scope in toml → metafieldsSet 403 | Med | High | Add `write_products` (covers shop metafields) explicitly; verify on first install |
| ResourcePicker returns numeric ID not GID | Low | Med | Wrapper normalizes to `gid://shopify/Collection/{id}` |
| Embed App Bridge version mismatch | Low | Med | Pin App Bridge version per Remix template default |
| Concurrent edits from two admins | Low | Low | Last-write-wins acceptable v1; document for support |
| User pastes tiers with `pct > 50` | Med | High (margin shred) | Validator caps `pct ≤ 50`; rejected with inline error |

## Security Considerations

- **Auth:** `authenticate.admin(request)` (Remix template default) on loader + action — only authenticated shop admin can read/write
- **Scope:** `write_products` covers shop metafield writes; principle of least privilege (no `write_customers`, `read_orders`, etc.)
- **Input sanitization:** Validator runs server-side in action before mutation (client validation is UX only)
- **CSRF:** Remix action protected by App Bridge session token (built-in)
- **Pct cap:** Validator enforces `1 ≤ pct ≤ 50` — POD margin guardrail; blocks accidental free-product saves and unrecoverable margin shreds
- **GraphQL error leakage:** Catch + sanitize errors before returning to UI (no internal IDs in user-facing message)

## Next Steps

- **Blocks:** Phase 03 indirectly (theme reads same metafield; admin must be functional for merchant to retune)
- **Does not block:** Phase 03 can ship in parallel using metafields seeded manually in Phase 01
- **Follow-ups:** Document admin URL + screenshot in app README
