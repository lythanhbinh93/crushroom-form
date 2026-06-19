# CouplePix Toolkit — Production-Readiness Audit

**Date:** 2026-06-18 · **Mode:** parallel multi-reviewer (7 scopes), each scope adversarially re-verified · **Branch:** `claude/add-photo-upload-tool-p3dI0`
**Scope:** application source only — GAS backends, Cloudflare Worker, customer/admin frontends, Streamlit tool (plans/docs excluded).
**Method:** 7 `code-reviewer` agents (high effort) → 7 independent skeptic verifiers → severity adjusted to real, deployed threat model. 0 findings refuted; several downgraded.

## Severity tally (post-verification)

| Sev | Count | Headline |
|-----|-------|----------|
| Critical | 1 | Uploads report success on server error → silent customer-order loss |
| High | ~11 | No auth boundary on GAS web apps (bulk PII + open writes); Sheet formula injection; image-input dead-ends |
| Medium | ~13 | Lark-in-lock concurrency; resource-exhaustion; Zip Slip / SSRF; opaque failures |
| Low/Info | ~30 | Error-string leakage, dead code, copy mismatches, hardening |

---

## Cross-cutting themes (where the real risk concentrates)

### T1 — No authentication boundary on either GAS web app  *(the #1 systemic issue)*
Both `google-apps-script-complete.js` (photo) and `google-apps-script-voice.js` (voice) deploy **Execute-as-owner / Anyone-access** with **zero token/auth check** on `doGet`/`doPost`. The static admin page hardcodes the endpoints and is itself unauthenticated. Consequences (all confirmed, anonymous, zero-credential):
- `?action=list&from=&to=` returns **every customer row** (phone, notes, SKUs, Drive photo URLs) — sweep date ranges to dump the whole table. (`google-apps-script-complete.js:322-392`)
- `?action=listVoice&status=all` returns **every voice row** (phone, order_id, message_text, slugs). (`google-apps-script-voice.js:378-396`)
- `?action=imageProxy&id=<driveId>` returns any customer photo thumbnail in the upload folder. (`:87-122`)
- `doPost` accepts unauthenticated photo uploads (unbounded — see T5) and **voice mutate ops** (`publishVoice`/`archiveVoice`/`finishUpload`/`updatePeaks`) keyed only on guessable `(phone, order_id)` → anyone can publish a private gift, hide a live one, or overwrite a published gift's audio. (`google-apps-script-voice.js:80-92`)

**Fix (one decision, applied twice):** require a shared secret (`e.parameter.token` compared against a Script Property, constant-time) on every non-public action on both deployments; inject the token into the admin page at deploy time. The public customer paths (`listProducts`, customer `finishUpload`, published `getVoice`) stay open; everything else gates. This single change closes ~6 findings.

### T2 — Silent upload failure (HTTP 200 == success)  *(the Critical)*
`ContentService` can't set HTTP status, so GAS returns **200 on both success and its own error path** (`google-apps-script-complete.js:536` success, `:537-538` catch). The customer form's submit handler ignores the response entirely and shows "gửi thành công" + redirects on any 200. So a Drive-quota / base64 / lock-timeout / sheet-write failure ⇒ customer thinks the order is done, photos are never saved, CS has no record. The voice flow has the same opaque-failure shape on non-JSON 200s.

### T3 — Spreadsheet formula injection (stored)
Customer free-text written to Sheets without neutralizing a leading `= + - @`. When CS opens the sheet, `=IMPORTDATA(...)`/`=HYPERLINK(...)` executes **in the staff Google session**, exfiltrating adjacent rows' PII. Photo: `message`, `Filename_i`, any header-named param (`:517/:520-521/:526`). Voice: `order_id`, `text_message`, `peaks` (only `phone` is escaped, `:339-344`). One-line `csvSafe_()` helper fixes both.

### T4 — Lark notification runs inside the script lock  *(known, user-acknowledged trade-off)*
`notifyLark_(...)` is called inside `doPost`'s lock (`google-apps-script-complete.js:534`, released at `:540`), so the lock is held across multi-second Lark uploads → concurrent uploads serialize and can hit `tryLock(10000)` timeout. **This is the exact trade-off accepted during the keep-email rollout** ("fine for low-traffic CS; lock-free variant available on request"). Not a new defect — flagged for a conscious keep/fix decision. Compounded by **T2** (a lock-timeout surfaces as fake success) and by `tryLock` return being ignored (`:432`, can double-write a row).

### T5 — Unauthenticated resource exhaustion / abuse
- Photo `doPost`: no `ItemCount` ceiling, no per-image size cap before `base64Decode`+`createFile` → fill owner Drive / burn quota / 6-min timeout. (`:446-484`)
- Voice `finishUpload`: no size or MIME allow-list → arbitrary file types + unbounded writes. (`:303-332`)
- CF Worker `/upload-voice-audio`: **only a CORS Origin check** gates a service-account write proxy; `curl -H 'Origin: https://crushroom.vn'` bypasses it (CORS is browser-only). No rate limit; full body buffered in isolate memory. (`cloudflare-worker-voice-proxy.js:105-221`)
- Streamlit: **Zip Slip** — zip entry names from unsanitized order key + SKU (`..`/`/` survive `clean_sku`) → files extract outside the target folder (`app.py:384-388`). **SSRF** — `download_image_from_url` fetches arbitrary URLs when the Drive-ID regex misses, packaging the response (`:88-97`).

### T6 — Customer image-input dead-ends (mobile)
- No file-size guard before `FileReader`/Croppie full-res decode → 10-20MB phone photos freeze/crash the tab, no error. (`couple-pix.js:596-602`)
- HEIC/HEIF advertised as supported but undecodable in desktop Chrome/Firefox; `croppie.bind` rejection is swallowed (`console.error` only) → empty cropper, stuck modal. (`couple-pix.js:751-755`, `couplepix.html:134`)
- Voice compressor (worker + lamejs) is **loaded but never called** — raw audio uploaded; dead weight shipped + slow-4G timeout risk near the ~50MB GAS cap. (`voice-upload.js:513`)

### T7 — Hygiene / dead code
- `assets/assets/assets/admin.js` — stale misfiled duplicate, unreferenced, but **publicly served** and hardcodes the production **Sheet ID** + notes the sheet is "Anyone with link." Delete the `assets/assets/` subtree; confirm the Sheet's link-sharing is restricted. (`:10`, `vercel.json:4`)
- Every GAS `catch` returns `error.toString()` to anonymous callers → leaks sheet/Drive/folder ids (eases T1 enumeration).
- Duplicated `VOICE_GAS_URL` across two client files (rotation footgun); contradictory size limits shown to voice customers (35MB code vs 50/25/20MB UI).

---

## Findings detail

### CRITICAL
**cpx-1 — Upload POST treats any HTTP 200 as success** · `assets/couple-pix.js:963-979`
Submit handler `.then(()=>alert success → redirect)` never reads the response; GAS returns 200 even from its catch. Failed uploads (Drive quota, base64, lock timeout, sheet write) show success and redirect → silent order loss, no CS record.
**Fix:** read the body; treat success only when it equals the `Upload Done` sentinel (not `{result:'error'}`); else show the existing error + re-enable submit. (ContentService can't set status, so check the body token, not `r.ok`.)

### HIGH
| ID | File:line | Issue | Fix |
|----|-----------|-------|-----|
| T1 (multi) | gas-complete `:26-51,:322-392,:87-122`; gas-voice `:80-92,:378-396` | Unauthenticated bulk PII read + unauth writes/mutates on both GAS apps | Shared-secret token on all non-public actions, both deployments |
| gas-1 | gas-complete `:517,:520-521,:526,:530` | Sheet formula injection (photo) | `csvSafe_()` prefix on `message`/`Filename`/default + Items sku/name |
| gas-voice-2 | gas-voice `:339-344` | Sheet formula injection (voice) | same `csvSafe_()` on `order_id`/`text_message`/`peaks` |
| gas-voice-1 | gas-voice `:80-92` | publish/archive/finishUpload/updatePeaks unauthenticated, guessable key | admin token on mutate ops; overwrite-guard so a published row can't be clobbered |
| gas (missed) | gas-complete `:446-484` | Anonymous unbounded Drive writes → quota/exec DoS | ItemCount ceiling + decoded-byte size cap (+ throttle) |
| cfw-1 | cf-worker `:105-221` | Upload proxy gated only by spoofable CORS Origin | server-side signed upload token (HMAC from GAS), Origin = defense-in-depth only |
| cpx-2 | couple-pix `:596-602` | No size guard before full-res decode → mobile hang/OOM | `file.size > 25MB` reject in `handleFileSelected` |
| cpx-3 | couple-pix `:751-755` | HEIC advertised, undecodable on Chrome/FF, error swallowed | surface alert + close modal in `bind().catch`; drop HEIC claim or add decoder |

### MEDIUM (condensed)
| ID | File:line | Issue |
|----|-----------|-------|
| gas-2 (T4) | gas-complete `:534` | Lark notify inside lock → concurrent uploads serialize/timeout *(known trade-off)* |
| gas-3 | gas-complete `:432` | `tryLock` return ignored → row overwrite/data loss under contention |
| gas (missed) | gas-complete `:473` | Malformed ImgData throws mid-loop → orphan Drive files + no row + raw error |
| gas-voice-4 | gas-voice `:303-332` | `finishUpload` no size/MIME allow-list → unbounded/arbitrary writes |
| cfw-2 | cf-worker `:105-221` | No rate limit; full body buffered in isolate memory → cost/quota, memory pressure |
| cpx (missed) | couple-pix `:804` | Cropped image is PNG but labeled `image/jpeg`/`.jpg` → wrong MIME + bigger payloads |
| cpx (missed) | couple-pix `:936-963` | No total POST size guard → GAS request-limit hits surface as fake success (T2) |
| pyst-1 | app.py `:384-388` | Zip Slip via unsanitized order key + SKU |
| pyst-2 | app.py `:88-97` | SSRF fallback fetch of arbitrary URL into ZIP |
| pyst (missed) | app.py `:157,:64-65` | Unguarded `int()` on quantity → app crash on garbage cells |
| voice-1 | voice-upload `:513` | Compressor loaded but never called → dead code + slow-4G/near-cap raw upload |
| voice-2 | voice-upload `:574-584` | `gasPost` opaque error on non-JSON 200 |

### LOW / INFO (long tail — fix opportunistically)
Error-string leakage to anonymous callers (gas-5 `:49,:106,:201,:317,:390,:538`); `imageProxy` cross-customer thumbnail via leaked id (gas-4); audioProxy returns full blob, no MIME guard (gas-voice-3); voice orphan-file leak on re-upload + image MIME (gas-voice missed); CF worker: localhost-origin in prod (cfw-4), permissive magic-byte sniff (cfw-5), verbatim upstream error logging (cfw-3), open Drive relay `GET /<fileId>` (missed), SA token in `caches.default` (missed); catalog fetch leaks parser-error text (cpx-4); client-trusted ProductName/Filename (cpx missed); stale `assets/assets/assets/admin.js` leaking Sheet ID (orphan-1); phone unencoded into URL (pyst-3); Excel missing-column KeyError + unbounded slot count (pyst missed); voice size-limit copy mismatch (voice-3); peaks rejection aborts upload (voice missed); audio no type check (voice missed); duplicated `VOICE_GAS_URL` (voice missed).

---

## Recommended fix order
1. **T2 / cpx-1** (Critical) — stop silently losing orders. ~10-line client change.
2. **T1** — token-gate both GAS `doGet`/`doPost` non-public actions. Closes the biggest data-exposure cluster.
3. **T3** — `csvSafe_()` on both backends (one helper, ~6 call sites).
4. **T4 / gas-2 + gas-3** — your call: restore the deferred-notify-after-lock pattern (lock-free) + check `tryLock` return.
5. **T5/T6** — caps + image-input guards as a hardening pass.
6. **T7** — delete `assets/assets/`, sync URLs, fix copy.

## Fixes applied — 2026-06-18..19 (commit `b4ce4ee`, partial revert `20a3f25`; repo-only — needs redeploy)

**In effect (kept):** cpx-1 (silent upload success → body-token check) · T3 `csvSafe_` formula guard (photo + voice) · gas-3 `tryLock` check · T4 Lark notify moved out of the lock · cpx-2 size cap · cpx-3 HEIC handling · voice-1 compressor wired (raw fallback) · voice-3 size-limit copy. `node --check` clean; public customer paths open.

**Reverted by user decision 2026-06-19 (commit `20a3f25`):** T1 auth gate (ADMIN_TOKEN on both GAS apps + admin-frontend token) **and** the voice published-row overwrite guard were added in `b4ce4ee`, then **removed** — the GAS endpoints are intentionally **open again** (URL-obscurity accepted; the bulk-PII exposure is re-opened by choice). De-gated photo GAS is live; voice GAS de-gate pending re-paste.

**NOT done:** T5 resource caps · cfw-1..5 (CF Worker) · pyst-1/pyst-2 (Streamlit) · T7 hygiene (orphan delete in progress; gas-5 error-string leakage; dup URLs) · cpx PNG-mislabel + payload-size guard · voice-2 opaque error. Frontend audit fixes not yet promoted to Vercel production.

## Unresolved questions (need your input)
1. ~~URL-obscurity vs token gate?~~ **RESOLVED 2026-06-19:** user chose URL-obscurity — the token gate was removed; endpoints are open (accepted risk).
2. **Is the production Sheet shared "Anyone with the link"?** If yes, the Sheet ID leaked via `assets/assets/assets/admin.js` is directly exploitable → treat as already-exposed and restrict sharing. *(Orphan file deletion in progress; sharing setting still needs your check.)*
3. **Who populates `image-1`/`image-2`?** If straight from public customer uploads, pyst-2 (SSRF) rises to High.
4. ~~T4 lock-held vs lock-free?~~ **RESOLVED:** lock-free deferred-notify is in effect.
