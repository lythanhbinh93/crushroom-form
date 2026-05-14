# Pod-Tee Phase 02: Homepage Block-Driven Conversion Shipped

**Date**: 2026-05-14 14:22
**Severity**: Medium
**Component**: pod-tee theme homepage (7 sections)
**Status**: Phase 02 complete; Phase 03 unblocked

## What Happened

Phase 02 (convert 7 homepage sections to accept `@theme` blocks) shipped in ~2.5h on 2026-05-14 morning. Parallel agents completed theme conversion + QA automation independently; mid-phase Shopify platform constraint triggered approved pivot; migration safety verified zero merchant content loss on republish.

**Commits shipped**:
- theme repo `1ca4000`: feat(theme): phase 02 — homepage @theme-accept via 6 local→theme block migration (13 files: 6 new blocks/ + 7 sections updated; +536 / −455 LOC)
- plan repo `f7545ce`: feat(plan): phase 02 shipped (qa/phase-02.mjs 248 LOC + 4 lib helpers + 4 reports)

**QA result**: `node qa/phase-02.mjs` against preview 158279991548: **48/49 PASS**
- All 7 sections render across 4 viewports (iPhone 14 Chrome/Safari, iPhone SE Chrome, Desktop 1280)
- P0 failures: 0
- P1 flag: 1 — LCP=6432ms on iPhone 14 Chrome (vs Phase 01 baseline 1436ms). Single shot; deferred Phase 08 investigation. Not a blocker.
- CLS: 0

## The Brutal Truth

**Shopify's `ValidLocalBlocks` theme-check rule is a hard constraint** and it invalidated Phase 02's original architecture mid-execution. We learned this the frustrating way: sections cannot mix `{"type":"@theme"}` blocks with locally-scoped block types in the same blocks array. The rule is non-disableable.

Six of seven sections (hero, manifesto, pillars, reviews, marquee, shop-grid) had local block types (pillar, phrase, review, tab, stat, column) that prevented direct `@theme` conversion. The seventh (home-newsletter) was clean.

**What made this painful**: No up-front validation. We didn't discover this constraint until Agent A hit it 45 min in, blocked on schema generation. The original plan assumed we could migrate incrementally—sections first, then block types later. Wrong.

## Technical Details

**Shopify ValidLocalBlocks constraint**:
```
Section schema blocks array cannot contain both:
- {"type":"@theme"} (theme-scoped blocks)
- locally-defined block types (defined in section's own {% schema %})

Error: "home_hero contains type @theme but also contains locally-scoped block type pillar"
```

**Migration approach** (user-approved pivot):
- Move all 6 local block types to dedicated `blocks/*.liquid` theme block files
- Keep setting IDs + block type names unchanged (matching new FILENAMES)
- Shopify auto-resolves existing merchant block instances to new theme blocks on republish
- Zero merchant data loss (blocks still have same setting IDs)

**Migration cost**: ~30 min for 6 block types (avg 5 min per type):
1. Extract block schema + settings from section's `{% schema %}`
2. Create new `blocks/{type}.liquid` with identical settings
3. Update section to accept only `@theme`
4. Validate schema passes `shopify theme validate`

## What We Tried

1. Original Phase 02 design (sections accept `@theme` + local blocks coexist) → hit ValidLocalBlocks error
2. Agent A attempted schema workaround (conditional type checking) → not viable; Shopify validation happens at publish, not runtime
3. Pivot path: theme blocks for all 6 types → validated safe, zero data loss, user approved

## Root Cause Analysis

**Why it happened**: ValidLocalBlocks is a Shopify design choice (not a bug). It forces theme extensibility to be explicit: theme blocks OR section-local blocks, not both. The policy exists because Shopify theme updates can shadow or redefine theme blocks; mixing creates ambiguity about which version wins on merchant re-edit.

**Why we didn't catch it earlier**: Architecture phase didn't enumerate block types per section. Assumption was "sections come first, we'll sort local types in Phase 03 refactoring." ValidLocalBlocks violated that sequencing.

## Lessons Learned

1. **For any new section design intending future merchant customization, default to theme blocks.** Even if only one block type seems needed today. ValidLocalBlocks makes the migration one-way: local→theme is safe (ID preservation); theme→local is destructive.

2. **Shopify's platform constraints are not optional.** Validate schema against actual `shopify theme validate` pre-commit, not just linting. Test the constraint in a fresh preview store if unclear.

3. **Agent orchestration worked well when blocked**: Agent A hit constraint with clear rationale + 3 forward paths. Clean handoff to user + Agent B. No rework, no blame. This is the pattern to repeat.

## Next Steps

**Phase 03 unblocked**: PDP template conversion (same `@theme` architecture, ~4-6h estimated).

**Carryover P1s** (Phase 03 or later, not blockers):
- Backport Phase 02's URL guard (`downcase` first) to Phase 01's `dop-cta*` blocks for consistency
- Section-level fallback URLs in hero + manifesto lack URL guard (pre-existing)
- BlockIdUsage warning in shop-grid (tab anchors use `?tab={{ block.id }}`; pre-existing, Shopify warns because IDs are dynamic)

**Next session**: Phase 03 — PDP template conversion
