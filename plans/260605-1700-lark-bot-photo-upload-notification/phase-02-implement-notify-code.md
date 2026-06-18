---
phase: 2
title: Implement Notify Code
status: completed
priority: P1
effort: 3h
dependencies:
  - 1
---

# Phase 2: Implement Notify Code

## Overview

Remove the email notification and add the Lark notify path: tenant-token fetch (cached), per-photo
image upload → `img_key`, interactive-card assembly, and webhook post. Wired into `doPost` so a Lark
failure never breaks the upload response.

## Requirements

- Functional: on each customer upload, post ONE Lark card to the group with SĐT, slot count, every
  photo inline, per-product SKU/name + Drive link, and customer note.
- Non-functional: zero added latency to the customer response on Lark failure (fire inside try/catch);
  token reused across uploads within its ~2h TTL.

## Architecture

Data already in `doPost` scope (`google-apps-script-complete.js`):
- `phone` (`:30` region / used at `:534`), `e.parameter['Name']` (display SĐT), `samePhoto` (`:511`),
  `items[]` each `{ sku, name, fileUrl, fileId, filename }` (built `:497-507`),
  `e.parameter['message']` (note).

Flow inside `notifyLark_`:
```
getLarkTenantToken_()  ->  for each item: uploadLarkImage_(item.fileId) -> img_key
                      ->  build interactive card (header + info + per-item img/div + note)
                      ->  UrlFetchApp.post(LARK_WEBHOOK_URL, { msg_type:'interactive', card })
```

### Lark API contracts (open.larksuite.com)

- Token: `POST /open-apis/auth/v3/tenant_access_token/internal`
  body `{app_id, app_secret}` → `{ code:0, tenant_access_token, expire }` (expire seconds, ~7200).
- Image upload: `POST /open-apis/im/v1/images`, header `Authorization: Bearer <token>`,
  multipart `image_type=message` + `image=<Blob>` → `{ code:0, data:{ image_key } }`.
- Card post: `POST <webhook>` JSON `{ msg_type:"interactive", card:{ header, elements:[...] } }`
  → `{ code:0 ... }` (webhook uses `StatusCode`/`code`).

## Related Code Files

- Modify: `google-apps-script-complete.js`
  - **Delete** `recipientEmail` const (`:19`) and email block (`:533-545`).
  - **Add** `getLarkTenantToken_`, `uploadLarkImage_`, `notifyLark_` (place after `ensureFormDataColumns_`, ~`:566`).
  - **Replace** deleted email block (call site) with `notifyLark_(...)`.

## Implementation Steps

1. **Remove email**: delete `recipientEmail` const (`:19`); delete lines `:533-545`.
2. **Token (cached)**:
   ```js
   function getLarkTenantToken_() {
     const cache = CacheService.getScriptCache();
     const hit = cache.get('lark_tenant_token');
     if (hit) return hit;
     const res = UrlFetchApp.fetch(
       'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
       { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
         payload: JSON.stringify({
           app_id: scriptProp.getProperty('LARK_APP_ID'),
           app_secret: scriptProp.getProperty('LARK_APP_SECRET') }) });
     const j = JSON.parse(res.getContentText());
     if (j.code !== 0) throw new Error('lark token: ' + res.getContentText());
     cache.put('lark_tenant_token', j.tenant_access_token, Math.max(60, (j.expire || 7200) - 120));
     return j.tenant_access_token;
   }
   ```
3. **Image upload** — full-resolution original (staff copy a usable photo); fallback to Drive w1000
   thumbnail when the original is rejected (e.g. >10MB). <!-- Updated: Validation Session 1 - quality=full-orig+w1000-fallback -->
   ```js
   function uploadLarkImageBlob_(blob, token) {
     const res = UrlFetchApp.fetch('https://open.larksuite.com/open-apis/im/v1/images', {
       method: 'post', muteHttpExceptions: true,
       headers: { Authorization: 'Bearer ' + token },
       payload: { image_type: 'message', image: blob } });  // GAS builds multipart from Blob
     return JSON.parse(res.getContentText());
   }
   function uploadLarkImage_(fileId, token) {
     const file = DriveApp.getFileById(fileId);
     let j = uploadLarkImageBlob_(file.getBlob(), token);  // full original first
     if (j.code !== 0) {  // original rejected (likely >10MB) → smaller thumbnail
       const thumb = file.getThumbnail();  // auth-aware (files are private); may be null
       if (thumb) j = uploadLarkImageBlob_(thumb, token);
     }
     if (j.code !== 0) throw new Error('lark img: ' + JSON.stringify(j));
     return j.data.image_key;
   }
   ```
   > **Review note (M3):** use `file.getThumbnail()`, NOT the public `drive.google.com/thumbnail?id=` URL —
   > uploaded files are private to the script owner, so the unauthenticated URL returns login HTML, not bytes.
4. **Notify + card** — `samePhoto` ⇒ embed ONE image + "dùng cho N slot"; else one image per slot.
   Per-image failure ⇒ that slot shows text + Drive link only (card still posts).
   <!-- Updated: Validation Session 1 - samePhoto=embed-once; partial-fail=text-line+link -->
   ```js
   function imgEl_(key, alt) { return { tag: 'img', img_key: key, alt: { tag: 'plain_text', content: alt } }; }
   function itemLine_(i, it) { return { tag: 'div', text: { tag: 'lark_md',
     content: (i+1) + '. ' + it.sku + ' — ' + it.name + ' · [Xem Drive](' + it.fileUrl + ')' } }; }

   function notifyLark_(phone, items, samePhoto, message) {
     try {
       const webhook = scriptProp.getProperty('LARK_WEBHOOK_URL');
       if (!webhook) { Logger.log('lark: no webhook configured'); return; }
       if (!items.length) return;
       const token = getLarkTenantToken_();
       const elements = [{
         tag: 'div', text: { tag: 'lark_md',
           content: '**SĐT:** ' + (phone || '') + '\n**Số slot:** ' + items.length +
                    (samePhoto ? ' · dùng cho ' + items.length + ' slot (1 ảnh)' : '') } }, { tag: 'hr' }];

       if (samePhoto) {
         // One shared photo: upload + show once, then list every product line.
         try { elements.push(imgEl_(uploadLarkImage_(items[0].fileId, token), items[0].name || 'ảnh')); }
         catch (e) { Logger.log('img fail (same) ' + items[0].fileId + ': ' + e); }
         items.forEach(function (it, i) { elements.push(itemLine_(i, it)); });
       } else {
         // Distinct photos: one image per slot; on upload failure show the line only.
         items.forEach(function (it, i) {
           try { elements.push(imgEl_(uploadLarkImage_(it.fileId, token), it.name || ('slot ' + (i+1)))); }
           catch (e) { Logger.log('img fail ' + it.fileId + ': ' + e); }
           elements.push(itemLine_(i, it));
         });
       }
       if (message) elements.push({ tag: 'hr' },
         { tag: 'div', text: { tag: 'lark_md', content: '**Ghi chú khách:** ' + message } });
       const card = { config: { wide_screen_mode: true },
         header: { template: 'blue',
           title: { tag: 'plain_text', content: 'Khách vừa tải ảnh lên' + (phone ? ' · ' + phone : '') } },
         elements: elements };
       const res = UrlFetchApp.fetch(webhook, { method: 'post', contentType: 'application/json',
         muteHttpExceptions: true, payload: JSON.stringify({ msg_type: 'interactive', card: card }) });
       const j = JSON.parse(res.getContentText());
       if (j.code !== 0) Logger.log('lark post fail: ' + res.getContentText());
     } catch (e) { Logger.log('notifyLark_ failed: ' + e); }
   }
   ```
5. **Call site (M2 — notify AFTER lock release)**: do NOT call `notifyLark_` inside the lock — large
   multi-slot uploads would hold the script lock for seconds. Restructure `doPost` to stash the response +
   args, release the lock in `finally`, then notify lock-free:
   ```js
   let response; let notifyArgs = null;
   try {
     ... sheet.setValues(...);
     notifyArgs = { phone, items, samePhoto, message: e.parameter['message'] };
     response = ContentService.createTextOutput('Upload Done');
   } catch (err) { response = jsonOut({ result: 'error', error: String(err) }); }
   finally { lock.releaseLock(); }
   if (notifyArgs) notifyLark_(notifyArgs.phone, notifyArgs.items, notifyArgs.samePhoto, notifyArgs.message);
   return response;
   ```
   `notifyLark_` is fully try/catch-wrapped, so running it in/after `finally` never affects the response.
6. **Paste into Apps Script editor**, save. (No local build for GAS; syntax-check by saving — editor flags errors.)

## Success Criteria

- [x] `recipientEmail` const and `MailApp.sendEmail` block removed; no other reference remains. (grep: 0)
- [x] `notifyLark_` called at the former email site; returns before upload response. (`:554`, after lock release)
- [x] Token cached in `CacheService` with TTL honoring `expire`. (`:580-592`)
- [x] Per-image failure is caught and logged (does not abort the card or upload). (`:656-657`, `:665-666`)
- [x] `notifyLark_` whole body in try/catch; upload always returns `"Upload Done"`. (`:638-693`)
- [x] Apps Script editor reports no syntax errors on save. (`node --check` pass)

## Risk Assessment

- **Multipart form from Blob** — `UrlFetchApp` builds `multipart/form-data` when `payload` is an object
  containing a Blob; do NOT set `contentType` on the image POST (let GAS set the boundary). Mitigation: live test Phase 3.
- **`img` element tag fields** — confirm `{ tag:'img', img_key, alt:{tag:'plain_text',content} }` renders;
  some card versions want `alt` required. Mitigation: Phase 3 live test, adjust if card errors.
- **Token expiry mid-batch** — cached token could expire between uploads on a slow request; acceptable (next
  upload refetches). If 401 on image upload, optional retry-once after `cache.remove`.
- **Large originals** — handled: `uploadLarkImage_` sends the full original first, then auto-retries with the
  `…/thumbnail?id=…&sz=w1000` blob if Lark rejects it. If w1000 also exceeds the cap, drop to `sz=w400`.

## Next Steps

Phase 3 live-tests one real upload.
