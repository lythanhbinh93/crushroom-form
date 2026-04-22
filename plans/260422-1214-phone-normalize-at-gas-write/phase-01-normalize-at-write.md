---
phase: 01
name: Normalize at Write
status: code-complete
priority: high
effort: S (≤30 min incl. deploy + manual test)
---

# Phase 01 — Normalize at Write

## Context Links
- Plan: [plan.md](plan.md)
- Brainstorm: [brainstorm-260422-1214-phone-normalize-at-gas-write.md](../reports/brainstorm-260422-1214-phone-normalize-at-gas-write.md)
- Target: [google-apps-script-complete.js](../../google-apps-script-complete.js)

## Overview

Add `normalizeVNPhone_` helper and route both write-path reads of `e.parameter['Name']` through it. Keeps `searchByPhone` untouched (already normalizes).

## Key Insights

- Frontend already strips non-digits (`assets/couple-pix.js:920`) but does **not** restore the VN mobile leading 0 and may be bypassed by legacy/liquid paths.
- `searchByPhone` already handles both sides via `.replace(/\D/g,'')` + ±3 fuzzy tolerance — no change needed.
- `e.parameter['Name']` is the single write-path input; only two places consume it in `doPost`.
- Filename construction (L458) reads `phone` from L437 — normalizing L437 propagates to filenames automatically.

## Requirements

### Functional
- Store digits-only `Name` in Sheet.
- Prepend `0` when digits length is exactly 9 AND first digit in `[3-9]` (VN mobile missing-zero case).
- Leave all other inputs unchanged post-strip.

### Non-functional
- No new dependencies.
- No change to search, admin, or Streamlit code.
- Backwards compatible with existing rows (they stay as-is).

## Architecture

**Before:**
```
Frontend → FormData.Name (digits, maybe missing 0)
        → GAS doPost
          ├─ L437: phone = Name.replace(/\D/g,'')   ─┐
          └─ L503: Sheet write Name = raw           ─┴→ inconsistent persistence
```

**After:**
```
Frontend → FormData.Name (unchanged)
        → GAS doPost
          ├─ L437: phone = normalizeVNPhone_(Name)   ─┐
          └─ L503: Sheet write Name = normalizeVNPhone_(Name)   ─┴→ canonical everywhere
```

## Related Code Files

**Modify:**
- `google-apps-script-complete.js` — add helper + edit L437, L503.

**Read for context (no edit):**
- `assets/couple-pix.js` (L920-927) — confirm frontend unchanged.
- `app.py` (L77-85) — confirm Streamlit still works.
- `assets/admin.js` (L26-38, L744) — confirm admin display gets canonical for new rows.

## Implementation Steps

1. **Locate helper insertion point.** Add just above `doPost` or near existing private helpers (e.g., `loadProductMap_`, `ensureFormDataColumns_`) for consistency with `_` suffix convention.

2. **Add helper:**
   ```js
   // Canonical VN phone: digits only; auto-prepend 0 when length 9 and starts 3-9 (mobile prefix without leading 0).
   // Leaves international (11+), landlines (10 starting 0), and garbage (<9 or other) untouched post-strip.
   function normalizeVNPhone_(raw) {
     var digits = String(raw || '').replace(/\D/g, '');
     if (digits.length === 9 && /^[3-9]/.test(digits)) digits = '0' + digits;
     return digits;
   }
   ```

3. **Edit L437:**
   ```js
   // Before
   const phone = String(e.parameter['Name'] || '').replace(/\D/g, '');
   // After
   const phone = normalizeVNPhone_(e.parameter['Name']);
   ```

4. **Edit L503 (inside headers.map switch):**
   ```js
   // Before
   case 'Name': return e.parameter['Name'] || '';
   // After
   case 'Name': return normalizeVNPhone_(e.parameter['Name']);
   ```

5. **Deploy:**
   - Open GAS project.
   - "Manage deployments" → select active web app → pencil → "New version" → deploy.
   - Verify deployment URL unchanged (hardcoded in 4 files).
   - If URL changed, update:
     - `app.py:14`
     - `assets/admin.js` (SCRIPT_URL constant)
     - `assets/couple-pix.js` (SCRIPT_URL constant)
     - `couplepix.html` (SCRIPT_URL constant)

6. **Manual test** (see Success Criteria below).

## Todo List

- [x] Add `normalizeVNPhone_` helper function in `google-apps-script-complete.js`
- [x] Replace `L437` phone normalization call
- [x] Replace `L503` Sheet-write `Name` case
- [ ] Deploy new GAS version ("New version" to preserve URL)
- [ ] Verify deployment URL unchanged; if changed, update 4 hardcoded URLs
- [ ] Manual test: upload `"0886 534 797"` → Sheet shows `"0886534797"`
- [ ] Manual test: upload `"886534797"` → Sheet shows `"0886534797"`
- [ ] Manual test: upload `"0886534797"` → Sheet unchanged
- [ ] Manual test: run Photo Naming Helper on fresh order → confirm consistent result set
- [ ] Commit with conventional message: `fix(gas): canonicalize Name column on write (strip spaces + restore VN leading 0)`

## Success Criteria

Per test in manual-test list above. All four Sheet writes must produce `0886534797` (or respective canonical form). Photo Naming Helper search must return only rows belonging to the queried customer.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Deployment URL rotates, breaks 4 clients | Low (in-place version update preserves URL) | Test one client immediately post-deploy; rollback = redeploy prior version |
| Helper regexes break on edge input | Very low (covered in brainstorm edge cases) | Input is already trimmed to digits before regex; string ops safe on `""` |
| 9-digit non-mobile gets `0` prepended | Very low (VN garbage falls in same class as today) | Same blast radius as current behavior; not a regression |

## Security Considerations

- No new inputs trusted; helper only transforms existing untrusted input.
- No new PII path; canonicalization is lossy in one direction (strips formatting) but not in a privacy-sensitive way.

## Next Steps

None within this plan. Post-merge, monitor Sheet for one week to confirm zero new space-containing `Name` values. If cleanup of historical rows desired later, spin a small one-off GAS function `cleanupNames_()` — out of scope here.
