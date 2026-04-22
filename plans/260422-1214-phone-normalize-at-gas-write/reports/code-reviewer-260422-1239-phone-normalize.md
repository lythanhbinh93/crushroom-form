# Code Review: Normalize VN Phone at GAS Write Time

**Scope:** `google-apps-script-complete.js` L410-414 (new helper), L446, L512.

## 1. Helper logic — correctness

`normalizeVNPhone_(raw)` strips non-digits, prepends `0` when `digits.length===9 && /^[3-9]/`.

- Null/undefined/number input → coerced via `String(raw || '')` → safe, returns `''`.
- `"0886 534 797"` → `0886534797` ✓
- `"886534797"` → `0886534797` ✓
- `"+84886534797"` → `84886534797` (11 digits, passes through; intl form preserved) — acceptable per comment.
- `"84886534797"` (no +) → same as above; **not** canonicalized to `0886534797`. Low-severity ambiguity; matches `searchByPhone` fuzzy endMatch tolerance (≤3 prefix diff), so lookups still work.
- 9 digits starting `4` or `6` → prepends `0` even though VN mobile only uses `3/5/7/8/9`. `[3-9]` over-matches. Impact: low (4/6 as first digit of a 9-digit string is rare user input; a typo would get stored as `04xxxxxxxx`). Not a regression — previously stored raw. Consider tightening to `/^[3579]|^8/` only if paranoia demands, but YAGNI.

## 2. Call-site regression check

- **L446 `phone`**: used in filename (L467) and email subject (L530). Both benefit from canonical form. No shape change (still string, possibly empty).
- **L512 sheet `Name`**: canonical digits written. Downstream `searchByPhone` strips `\D` anyway (L295) — strict improvement, no regression.
- **L532 email body** `'SĐT: ' + e.parameter['Name']`: still raw. Intentional (operator sees user-typed form) — minor inconsistency but not a bug. Flag: informational.

## 3. searchByPhone untouched — safe

Confirmed. L268/L295 both `.replace(/\D/g,'')` at search time; fuzzy end/start match with ≤3 digit tolerance absorbs old rows with spaces or missing `0`. No migration needed.

## 4. Naming convention

`normalizeVNPhone_` matches `loadProductMap_`, `ensureFormDataColumns_`. GAS trailing-underscore = private (not exposed as web endpoint). Correct.

## 5. Security

- Input coerced to String, then `\D` stripped → no injection surface downstream (Sheet cell, filename, email subject).
- Regexes (`/\D/g`, `/^[3-9]/`) are linear; no ReDoS.
- Filename L467: `phone` is digits-only → safe for Drive filenames.

## Positive

- Tight helper (~4 LOC), descriptive comment explains the 9-digit rule rationale.
- Idempotent: `normalizeVNPhone_(normalizeVNPhone_(x)) === normalizeVNPhone_(x)`.
- Backward compat preserved; no schema change.

## Unresolved

- Q: Intentional that L532 email body keeps raw user form, or should it also be canonical? (Low — operator UX call.)

**Score: 9.6/10**
**Status: DONE**
