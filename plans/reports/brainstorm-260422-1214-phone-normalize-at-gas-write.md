---
type: brainstorm
slug: phone-normalize-at-gas-write
date: 2026-04-22
session: 1214
branch: claude/add-photo-upload-tool-p3dI0
---

# Brainstorm — Normalize VN Phone at GAS Write Time

## Problem

CouplePix upload tool persists `Name` column (phone) with spaces (e.g., `"0886 534 797"`) and sometimes without leading 0 (e.g., `"886534797"`). Admin panel displays these raw. Photo Naming Helper Streamlit app (`app.py`) returns no/partial results when searching — mixed matches caused by fuzzy tolerance + inconsistent storage.

### Screenshot evidence
- Search `0886534797` returned 4 rows: two stored as `0886 534 797`, one as `886534797`.

## Root cause

`google-apps-script-complete.js:503`
```js
case 'Name': return e.parameter['Name'] || '';
```
Writes raw form input. `intl-tel-input` auto-formats the visible value with spaces as the user types. Frontend (`assets/couple-pix.js:920-927`) strips spaces via `.replace(/\D/g,'')` before submit — but:
1. Does not prepend leading 0 for 9-digit VN mobile.
2. `couplepix.liquid` or legacy versions may have submitted pre-strip values.
3. No backstop at GAS layer.

Search (`searchByPhone`, L295) normalizes on both sides via `.replace(/\D/g,'')` + ±3-digit fuzzy tolerance — so lookup technically finds rows, but tolerance introduces cross-contamination and Helper downstream still sees mixed raw `Name` values.

## Evaluated approaches

| # | Approach | Pros | Cons | Verdict |
|---|----------|------|------|---------|
| 1 | **Normalize at GAS write time** | Single source of truth. All future uploads canonical. No frontend coupling. | Existing rows stay dirty. | **Chosen** |
| 2 | Normalize on read/display | Cheap cosmetic patch. | Doesn't fix filenames or downstream Helper logic. Band-aid. | Rejected |
| 3 | Client-side fix only | Fast. | Bypassed if any other form path exists (liquid, curl, legacy). Not defense in depth. | Rejected |
| 4 | Backfill existing rows | Fixes display for history. | Irreversible; user opted out (KISS). | Deferred |
| 5 | Tighten fuzzy match | Reduces cross-matches. | Loses robustness to missing-0 edge cases; user opted out. | Deferred |

## Chosen solution

**Add canonicalization helper in `google-apps-script-complete.js`, apply at two call sites inside `doPost`.**

```js
// Canonical VN phone: digits only; auto-prepend 0 when length 9 and starts 3-9 (mobile prefix)
function normalizeVNPhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 9 && /^[3-9]/.test(digits)) digits = '0' + digits;
  return digits;
}
```

### Call sites
| Line | Change |
|------|--------|
| L437 | `const phone = normalizeVNPhone_(e.parameter['Name']);` |
| L503 | `case 'Name': return normalizeVNPhone_(e.parameter['Name']);` |

## What this fixes
- L503 → Sheet `Name` cell canonical for all future uploads.
- L437 → auto-generated filenames (`phone + '_' + i + '_' + safeSku`) also canonical.

## What stays unchanged
- Frontend (`couple-pix.js`, `couplepix.liquid`).
- Search (already normalizes).
- Admin display (renders `row.Name` — clean automatically for new rows).
- Streamlit helper (already normalizes query).
- Fuzzy ±3 tolerance (redundant once storage canonical but harmless).

## Risk / edge cases
- International (`+1 555 123 4567` → 11 digits, no rule trigger). Safe.
- Landlines (`024 3823 xxxx` → starts 0, no rule trigger). Safe.
- Garbage 9-digit starting 3-9 → gets `0` prepended; same blast radius as today's raw-store. Acceptable.

## Validation
1. Deploy new GAS version.
2. Test upload with `"0886 534 797"` → Sheet shows `0886534797`.
3. Test upload with `"886534797"` → Sheet shows `0886534797`.
4. Test upload with `"0886534797"` → unchanged.
5. Run Photo Naming Helper with fresh order → search returns only expected rows.

## Success metrics
- 0 new rows with spaces in `Name` column after deploy.
- 0 new rows with 9-digit `Name` when input was a VN mobile.
- Photo Naming Helper reports consistent search results for same customer across multiple upload sessions.

## Out of scope (user decision)
- Backfill existing Sheet rows.
- Tighten fuzzy match.
- Client-side normalization.

## Dependencies
- GAS deployment (Web app "Manage deployments → new version").
- Hardcoded URLs in `app.py:14`, `assets/admin.js`, `assets/couple-pix.js`, `couplepix.html` may OR may not need update — depends on whether GAS URL changes on new version (usually: in-place version update preserves URL; new deployment changes it).

## Unresolved questions
- Should `searchByPhone` reuse `normalizeVNPhone_` on the query side for symmetry? Low value — fuzzy tolerance already catches it. Skip unless strict-match cleanup later.
- Deployment procedure confirmation: in-place version update (URL preserved) vs new deployment (URL changes + cascade update)?
