---
title: 'Lark Bot Photo-Upload Notification (replace email, copy-pasteable photos)'
description: >-
  Replace MailApp email with a Lark group-bot interactive card that embeds every
  uploaded photo inline (copy/paste/drag). Photo-upload GAS backend only.
status: in-progress
priority: P2
branch: claude/add-photo-upload-tool-p3dI0
tags:
  - gas
  - lark
  - notification
  - couplepix
blockedBy: []
blocks: []
created: '2026-06-05T10:02:26.481Z'
createdBy: 'ck:plan'
source: skill
---

# Lark Bot Photo-Upload Notification (replace email, copy-pasteable photos)

## Overview

Swap the customer-photo-upload notification in `google-apps-script-complete.js` from a plain-text
email (`MailApp.sendEmail`, links only) to a **Lark group-bot interactive card** that embeds **every
uploaded photo inline** so staff can copy/paste/drag the images.

Wiring is **hybrid**: a Lark **custom app** (app_id/secret) uploads each photo to Lark's image API to
get an `img_key`; the **existing group-bot webhook** posts the card referencing those keys. Secrets in
`PropertiesService`. Email fully removed. Voice-gift backend is out of scope.

Source brainstorm: `plans/reports/brainstorm-260605-1700-lark-bot-photo-upload-notification-report.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Lark Setup & Config](./phase-01-lark-setup-config.md) | Completed |
| 2 | [Implement Notify Code](./phase-02-implement-notify-code.md) | Completed |
| 3 | [Live Verify](./phase-03-live-verify.md) | Lark verified live (email-removal pending) |

## Key Decisions (from brainstorm)

- Replace email **fully** (remove `recipientEmail` const + `MailApp.sendEmail` block).
- **Photo form only** — `google-apps-script-complete.js`. Voice (`google-apps-script-voice.js:361`) OUT.
- **All photos inline**, copy-pasteable. Upload source = full-resolution original, auto-fallback to Drive
  `sz=w1000` thumbnail if Lark rejects (>10MB cap). [Validation Session 1]
- **Hybrid**: app uploads image → `img_key`; existing webhook posts the `interactive` card.
- Secrets in Script Properties: `LARK_WEBHOOK_URL`, `LARK_APP_ID`, `LARK_APP_SECRET`. **No** signing secret.
- Platform: Lark international (`open.larksuite.com`).
- Notify wrapped in try/catch — Lark failure must never break the `"Upload Done"` response.

## Dependencies

None. No cross-plan blocking relationships (voice-gift + fulfillment-platform plans are unrelated).
External prerequisite: a Lark group + custom app must exist (Phase 1).

## Validation Log

### Session 1 — 2026-06-06

**Verification Results** (Standard tier — Fact Checker + Contract Verifier)
- Claims checked: 6 · Verified: 6 · Failed: 0 · Unverified: 0
- `phone` `google-apps-script-complete.js:450`; `items[]{sku,name,slot,fileUrl,fileId,filename}` `:477-484,:493-506`;
  `samePhoto` `:449`; `recipientEmail` `:19`; email block `:534-545`; send `:545`; `ensureFormDataColumns_` `:556`. All ✓.

**Decisions confirmed**
1. **Photo quality** → Full original first, auto-fallback to Drive `sz=w1000` thumbnail if Lark rejects (>10MB).
   Staff get usable-resolution photos. (→ phase-02 `uploadLarkImage_`)
2. **samePhoto** → Embed the shared photo ONCE + note "dùng cho N slot"; still list every product line.
   (→ phase-02 `notifyLark_` samePhoto branch)
3. **Partial image failure** → Post the card with whatever uploaded; failed slot shows SKU/name + Drive link
   text only; failure logged. Never skip the card. (→ phase-02 `notifyLark_` try/catch per slot)

**Propagation:** phase-02-implement-notify-code.md updated (3 markers). phase-01/phase-03 unaffected.

### Whole-Plan Consistency Sweep — 2026-06-06
- Re-read plan.md + all 3 phase files. No stale terms. Resolved the prior w400-default vs full-original
  discrepancy (brainstorm suggested w400; validation locked full-original+w1000-fallback) — phase-02 code,
  risk note, and this log now agree. No remaining contradictions. **Zero unresolved.**

## Code Review Log

### Session 1 — 2026-06-06 (Phase 2 implementation)

code-reviewer (DONE_WITH_CONCERNS) raised 1 Critical + 1 High + 3 Medium + 3 Low. Dispositions:

- **C1 (img_key vs image_key)** — **REFUTED via official Lark doc.** The card `img` element uses **`img_key`**
  (docs: "图片资源的 Key … 上传图片接口"), which is what the code has. The reviewer conflated it with the
  image-upload API *response* field (`data.image_key`, read correctly at code). No change. Verified, sticky.
- **H1 (card schema version)** — N/A given C1 resolved; the v1 `div`/`lark_md`/`hr`/`img`(`img_key`) element set
  is internally consistent. Live test (Phase 3) is the final confirm. No change.
- **M1 (bot signature verification)** — **VALID, doc'd in phase-01**: bot must use Custom Keyword/none, not
  Signature Verification (plan stores no signing secret). Setup-time, not code.
- **M2 (lock held during uploads)** — **VALID, FIXED**: `notifyLark_` now runs AFTER `lock.releaseLock()`
  (deferred via stashed `response`/`notifyArgs`). Removes lock-hold during multi-MB uploads.
- **M3 (unauthenticated thumbnail fallback)** — **VALID, FIXED**: fallback now uses `file.getThumbnail()`
  (auth-aware) instead of the public `drive.google.com/thumbnail?id=` URL (files are private → URL returns HTML).
- **L1-L3** — benign / already-correct (token TTL, guarded access via per-slot try/catch). No change.

Post-fix `node --check`: pass. Email path fully removed (grep: 0 `MailApp`/`recipientEmail`).

## Deployment Log

### 2026-06-18 — Lark notification LIVE (additive keep-email rollout)

Shipped via a **safe additive rollout** instead of the phase-02 swap, to avoid touching the live
customer flow (user explicitly refused a full-file paste-over of the live GAS script):

- **A1** group webhook reused (`df40fc93…`). **A2** custom app `cli_a7c3e35ba4f9d010` (international
  `larksuite.com`, same org as the webhook group): Bot capability ("Send and receive message") +
  `im:resource` scope, **released**. First app was built in the wrong org (DOPAMILES) and discarded.
- **Pre-deploy smoke tests** (all `code 0`): tenant token, image upload → `img_key`, webhook card with
  a real `img_key` rendering inline.
- **GAS deploy = additive, not swap:** added a NEW file `lark-notify.gs` (all Lark fns) + ONE line in
  `doPost` — `notifyLark_(phone, items, samePhoto, e.parameter['message'])` placed AFTER
  `MailApp.sendEmail`. **Email retained** — both email + Lark card fire. Creds in Script Properties.
  Adversarially verified SHIP-SAFE (current flow byte-for-byte unchanged; `notifyLark_` can't throw
  out of `doPost`; no symbol collision vs live).
- **Live-verified 2026-06-18:** real upload → Lark card with inline photos confirmed working.

⚠️ **Repo ⇄ production divergence (footgun):**
- **Production** main script = live pre-Lark+v3 + the one-line `notifyLark_` call (email kept), PLUS a
  separate `lark-notify.gs`.
- **Repo** `google-apps-script-complete.js` = the INTEGRATED swap (email removed, single file) — the
  END-STATE reference, **NOT what is live**. DO NOT full-paste it over production while `lark-notify.gs`
  exists → duplicate `const LARK_BASE` / `notifyLark_` = project won't compile.

### 2026-06-18 — Email removal handed off (→ Lark-only)

User opted to go Lark-only immediately. Handed off the live-script edit (delete the whole email block +
the now-unused `recipientEmail` const; keep the `notifyLark_` call). `README.md` notify line synced from
"Gmail access (MailApp)" → Lark bot. **Awaiting user deploy (New version) + no-email confirmation** before
Phase 3 "No email sent" is marked verified.

**Pending:** user deploys the Lark-only version; optional repo reconcile so source matches the deployed
additive layout (separate `lark-notify.gs` + lock-held notify) vs the committed integrated swap.
