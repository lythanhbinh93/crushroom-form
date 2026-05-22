---
phase: 3
title: "Shopifyignore push protection — verify existing coverage"
status: complete
priority: P1
effort: "~10m"
dependencies: []
---

# Phase 03: `.shopifyignore` push protection — verify existing coverage

<!-- Updated: Validation Session 1 - F2 (file already exists with full coverage; reduce to verification-only) -->

## Overview

Verified during planning: `.shopifyignore` already exists at theme root with full coverage for our use case. This phase is reduced to **verification + optional comment-block update + 3-push test**. Independent of Phases 01/02 — can run in parallel.

## Existing coverage (verified)

`d:/github local/pod-tee-theme/.shopifyignore` already protects:

```
config/settings_data.json
sections/*.json
templates/*.json                  ← covers templates/product.json (our target)
templates/customers/*.json
templates/metaobject/*.json
```

`templates/*.json` glob covers `templates/product.json` where merchant-uploaded size-guide images live. **No new patterns needed.**

## Requirements

- Functional:
  - Existing `.shopifyignore` patterns prevent `shopify theme push` from overwriting `templates/product.json` after a merchant uploads a size-guide image.
  - 3 consecutive pushes do not change the merchant's image binding in production.
- Non-functional:
  - Optional: add a one-line comment in `.shopifyignore` header pointing to this plan (helps next dev understand why coverage exists).

## Architecture

No new files. Verification leverages existing infra.

## Related Code Files

- Optionally modify: `d:/github local/pod-tee-theme/.shopifyignore` — add plan-reference comment line (1 LOC added)

## Implementation Steps

1. **Confirm `.shopifyignore` patterns are still in place** (sanity check; no edits if untouched):
   ```bash
   cat "d:/github local/pod-tee-theme/.shopifyignore"
   ```
   Expected: `templates/*.json` present.

2. **(Optional) Add plan-reference comment to file header:**
   ```diff
    # Pushing local copies would clobber merchant choices and silently
    # revert settings between deploys. Pulling is fine.
   +
   +# 260522: extended use includes PDP size-guide images (per plan
   +# 260522-1302-pdp-size-guide-port-from-buildmypod). `templates/*.json`
   +# glob below already covers `templates/product.json` where those images bind.
   ```

3. **Test plan (executes during Phase 04 step #6):**
   - Phase 04 owns the 3-push test execution since it requires Phase 04 to have uploaded a real image first.
   - Phase 03's job is just to **confirm coverage exists BEFORE Phase 04 starts**.

## Success Criteria

- [ ] `.shopifyignore` exists with `templates/*.json` pattern (verified — already true)
- [ ] (Optional) Plan-reference comment added to file header
- [ ] Phase 04's 3-push test passes (deferred verification — Phase 04 owns execution)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Someone removes `templates/*.json` from `.shopifyignore` before Phase 04 ships | Phase 03 verification catches absence; comment block explains why entry exists |
| `templates/*.json` glob does not match `templates/product.json` on Windows | Shopify CLI handles globs consistently across platforms; verified previously when sticky-header fixes shipped (memory: project_pod_tee_wave_1_shipped) |
| Phase 04 3-push test fails despite ignore coverage | Investigate CLI version mismatch, double-check ignore syntax with `shopify theme push --dry-run` if supported |
