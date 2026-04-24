---
name: Normalize VN Phone at GAS Write Time
slug: phone-normalize-at-gas-write
created: 2026-04-22
status: code-complete
priority: high
owner: lythanhbinh93
branch: claude/add-photo-upload-tool-p3dI0
blockedBy: []
blocks: []
mode: fast
progress: 4/13 todo items (code complete, deploy+test pending)
last_updated: 2026-04-22
---

# Normalize VN Phone at GAS Write Time

> Source brainstorm: [brainstorm-260422-1214-phone-normalize-at-gas-write.md](../reports/brainstorm-260422-1214-phone-normalize-at-gas-write.md)

## Goal

Eliminate phone-number inconsistencies in the `Name` column of the CouplePix Google Sheet (spaces, missing leading 0) by adding a canonicalization helper in the GAS backend and applying it at two write-path call sites inside `doPost`. Fixes Photo Naming Helper downstream search wrongness without touching frontend or existing rows.

## Scope

**Single file:** [google-apps-script-complete.js](../../google-apps-script-complete.js)
- Add `normalizeVNPhone_` helper (~4 LOC).
- Replace L437 write-path normalization call.
- Replace L503 sheet-write `Name` case.

**Total:** ~5 LOC changed, 1 file.

## Out of scope

- Backfilling existing Sheet rows.
- Tightening `searchByPhone` fuzzy tolerance.
- Frontend changes (`couple-pix.js`, `couplepix.liquid`).
- Admin/Streamlit downstream normalization (already handled on their side via `.replace(/\D/g,'')`).

## Phases

| # | File | Status |
|---|------|--------|
| 01 | [phase-01-normalize-at-write.md](phase-01-normalize-at-write.md) | code-complete |

## Success criteria

1. New test upload with `"0886 534 797"` produces Sheet row `Name = "0886534797"`.
2. New test upload with `"886534797"` produces Sheet row `Name = "0886534797"`.
3. Auto-generated filenames (when client omits `Filename_*`) use canonical phone prefix.
4. Existing fuzzy search still returns same row set for same customer.
5. Photo Naming Helper (Streamlit) shows consistent search results.

## Key dependencies

- GAS deployment step (user-driven; not code). In-place "Manage deployments → New version" preferred to preserve hardcoded URLs.
