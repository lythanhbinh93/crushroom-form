# Phase 02 — Local-to-Theme Block Migration Report

**Date:** 2026-05-14  
**Branch:** feat/bug-fix-sprint  
**Work context:** D:\github local\pod-tee-theme

---

## Created Block Files

| File | LOC | Setting IDs |
|---|---|---|
| `blocks/phrase.liquid` | 27 | `phrase` |
| `blocks/tab.liquid` | 42 | `label`, `collection` |
| `blocks/stat.liquid` | 48 | `number`, `label`, `caption` |
| `blocks/column.liquid` | 73 | `heading`, `body`, `cta_label`, `cta_url` |
| `blocks/pillar.liquid` | 81 | `icon`, `heading`, `body`, `meta` |
| `blocks/review.liquid` | 99 | `stars`, `headline`, `body`, `reviewer`, `date`, `verified` |

All 6 files: `block.shopify_attributes` on outer wrapper, `{% schema %}` with `"presets"`, ≤200 LOC.

---

## Setting ID Preservation (Merchant Content Safety)

| Section | Local type | Setting IDs in old schema | Setting IDs in new block file | Match? |
|---|---|---|---|---|
| home-hero | `stat` | `number`, `label`, `caption` | `number`, `label`, `caption` | ✅ exact |
| home-manifesto | `column` | `heading`, `body`, `cta_label`, `cta_url` | `heading`, `body`, `cta_label`, `cta_url` | ✅ exact |
| home-pillars | `pillar` | `icon`, `heading`, `body`, `meta` | `icon`, `heading`, `body`, `meta` | ✅ exact |
| home-marquee | `phrase` | `phrase` | `phrase` | ✅ exact |
| home-reviews | `review` | `stars`, `headline`, `body`, `reviewer`, `date`, `verified` | `stars`, `headline`, `body`, `reviewer`, `date`, `verified` | ✅ exact |
| home-shop-grid | `tab` | `label`, `collection` | `label`, `collection` | ✅ exact |

---

## Modified Section Files

| File | LOC after | Changes |
|---|---|---|
| `sections/dopamiles-home-hero.liquid` | 125 | `"blocks":[@theme]`; block loop → `{% render block %}`; removed stat local schema |
| `sections/dopamiles-home-manifesto.liquid` | 113 | `"blocks":[@theme]`; block loop → `{% render block %}`; removed column local schema |
| `sections/dopamiles-home-newsletter.liquid` | 148 | No change needed — already `@theme`-only from Agent A |
| `sections/dopamiles-home-pillars.liquid` | 103 | `"blocks":[@theme]`; block loop → `{% render block %}`; removed pillar local schema + inline SVG/render logic |
| `sections/dopamiles-home-marquee.liquid` | 46 | `"blocks":[@theme]`; block loops → `{% render block %}`; removed phrase local schema |
| `sections/dopamiles-home-reviews.liquid` | 129 | `"blocks":[@theme]`; block loop → `{% render block %}`; removed review local schema + inline render logic; removed unused `star_empty_svg` assign |
| `sections/dopamiles-home-shop-grid.liquid` | 159 | `"blocks":[@theme]`; removed tab local schema. Tab anchor loop kept in section (needs `request.param.tab` active-state — section-scope data, valid pattern). Collection-resolve loop also kept in section. |

All sections ≤200 LOC.

---

## Deleted Files

- `snippets/dopamiles-home-hero-stat.liquid` (orphaned — replaced by `blocks/stat.liquid`)
- `snippets/dopamiles-home-manifesto-column.liquid` (orphaned — replaced by `blocks/column.liquid`)

---

## Preset Block Type References

| Section | Preset blocks | Resolves to theme block file |
|---|---|---|
| home-hero | `stat` × 3 | `blocks/stat.liquid` ✅ |
| home-manifesto | `column` × 2 | `blocks/column.liquid` ✅ |
| home-newsletter | `dop-heading`, `dop-text` × 2 | existing `blocks/dop-*.liquid` ✅ |
| home-pillars | `pillar` × 3 | `blocks/pillar.liquid` ✅ |
| home-marquee | `phrase` × 7 | `blocks/phrase.liquid` ✅ |
| home-reviews | `review` × 3 | `blocks/review.liquid` ✅ |
| home-shop-grid | `tab` × 6 | `blocks/tab.liquid` ✅ |

---

## URL Guards Applied

- `blocks/column.liquid`: guards `cta_url` against `javascript:` / `data:` / `vbscript:` — verbatim pattern from `blocks/dop-cta.liquid`
- `blocks/tab.liquid`: no URL-type settings (collection picker, not url type)
- `blocks/phrase.liquid`, `blocks/stat.liquid`, `blocks/pillar.liquid`, `blocks/review.liquid`: no URL-type settings

---

## Shopify Theme Check

**Before migration:** 11 errors / 38 warnings (per prior agent report)  
**After migration:** **11 errors / 38 warnings** — zero new offenses

One transient warning (`star_empty_svg` UnusedAssign in reviews section) was introduced then fixed immediately by removing the now-redundant section-level assign. `star_svg` retained in section for the zero-block placeholder path.

---

## Notes / DONE_WITH_CONCERNS

**shop-grid tab rendering:** The `tab.liquid` theme block file satisfies the `@theme` schema requirement, but the section still renders tab anchors manually (not via `{% render block %}`). This is intentional and correct: the active-state logic (`active_tab == block.id`) requires `request.param.tab` which is only available in section scope, not within a `{% render %}` isolated scope. Shopify's render tag creates an isolated variable scope — passing `active_tab` as a parameter would work but adds unnecessary coupling. The current pattern (section reads `block.settings.*` + `block.id`, theme block satisfies schema constraint) is the standard Shopify pattern for stateful tab UI. Theme check does not flag this.

---

**Status:** DONE  
**Summary:** All 6 local block types migrated to `blocks/*.liquid` theme block files. All 7 sections updated to `{"type":"@theme"}` exclusive. Setting IDs preserved verbatim. Theme check holds at 11 errors / 38 warnings (no regression). Two orphaned snippets deleted.
