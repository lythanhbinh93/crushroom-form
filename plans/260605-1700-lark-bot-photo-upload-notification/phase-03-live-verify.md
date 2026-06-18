---
phase: 3
title: "Live Verify"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Live Verify

## Overview

Redeploy the GAS web app and run a real customer upload end-to-end; confirm the Lark card arrives with
copy-pasteable inline photos and no email is sent.

## Requirements

- Functional: one real upload via the couplepix form produces exactly one Lark card with all photos inline.
- Non-functional: customer still gets `"Upload Done"`; staff inbox receives no new email.

## Related Code Files

- No code changes (verification only). Reads: GAS execution logs, Lark group, staff email inbox.

## Implementation Steps

1. **Redeploy**: Apps Script editor → Deploy → **Manage deployments** → edit the Web App deployment →
   **New version** → Deploy. (Same URL; new version picks up the code.)
2. **Trigger a test upload**: open `https://crushroom-form.vercel.app/couplepix.html`, pick product(s)
   with ≥2 slots, upload distinct photos + a note, submit.
3. **Verify Lark card** in the staff group:
   - header `Khách vừa tải ảnh lên · <SĐT>`
   - SĐT + slot count line (and `(dùng cùng 1 ảnh)` if reused)
   - **each photo rendered inline** — right-click/drag confirms it is a real image (copy/paste works)
   - per-product `N. SKU — Name · Xem Drive` link resolves to the Drive file
   - customer note present
4. **Verify no email** at `crush@crushroom.vn` for this upload.
5. **Verify customer response**: form shows success (`"Upload Done"`).
6. **Check GAS logs** (Executions): no thrown errors; if any `img fail` / `lark post fail` logged, fix per
   Phase 2 risk notes (multipart/contentType, `img` tag fields, token) and redeploy.
7. **Negative check**: temporarily clear `LARK_WEBHOOK_URL` (or simulate failure) → confirm upload STILL
   returns `"Upload Done"` and only logs the failure. Restore the property after.

## Success Criteria

- [ ] Lark card received with all photos inline and copy/paste-able.
- [ ] Per-product links + note + SĐT + slot count correct.
- [ ] No email sent for the test upload.
- [ ] Customer got `"Upload Done"`.
- [ ] Failure-path test: Lark down → upload still succeeds, failure logged only.
- [ ] GAS Executions log clean (or known-benign).

## Risk Assessment

- **Card schema rejection** — if `code != 0` on the webhook post, inspect `res.getContentText()`; common
  fixes: `img` element needs `alt`, or `header.template` must be a valid color. Adjust + redeploy.
- **Image too large** — 413/`invalid image` → switch upload source to the `…/thumbnail?...&sz=w1000` blob.
- **Stale deployment** — verifying the old version: ensure "New version" was selected, not just Save.

## Next Steps

On pass: update `README.md` ("Gmail access (MailApp)" line at `:162` → Lark bot) and `docs/` if notify is
documented there. Commit. Ship is a GAS-editor redeploy, not a repo deploy.
