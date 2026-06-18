---
phase: 1
title: "Lark Setup & Config"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Lark Setup & Config

## Overview

Create the Lark side (group bot + custom app) and wire credentials into GAS Script Properties via a
one-time config helper. No notify logic yet — just make the secrets reachable.

## Requirements

- Functional: GAS can read `LARK_WEBHOOK_URL`, `LARK_APP_ID`, `LARK_APP_SECRET` from Script Properties.
- Non-functional: secrets never committed to git (Script Properties, not source consts).

## Architecture

Two Lark objects in the same tenant:
1. **Group custom bot** → incoming webhook URL (posts the card to the staff group).
2. **Custom app** → `app_id` + `app_secret` with image-upload permission (gets `tenant_access_token`
   → uploads photo bytes → `img_key`). An `img_key` uploaded by the app renders in the same-tenant
   bot card (hybrid pattern).

Config stored alongside the existing Spreadsheet-ID pattern (`scriptProp` at `google-apps-script-complete.js:18,23`).

## Related Code Files

- Modify: `google-apps-script-complete.js` — add `setLarkConfig_()` helper near `intialSetup()` (`:21`).

## Implementation Steps

1. **Lark group bot**: target staff group → Settings → Bots → **Add Bot → Custom Bot** → name it
   (e.g. "CouplePix Upload") → copy the **webhook URL** (`https://open.larksuite.com/open-apis/bot/v2/hook/...`).
   - **Security setting**: leave it as **"Custom Keyword" (or none)** — do NOT enable **Signature Verification**.
     The plan stores no signing secret; with signature verification on, Lark rejects every post (`code != 0`)
     and the card silently never appears (upload still works). If you must enable signing later, add HMAC-SHA256
     `timestamp`+`sign` to the webhook payload.
2. **Lark custom app**: Lark Developer console (`open.larksuite.com`) → create app → enable **Bot** capability →
   add permission scope for **uploading images / sending message resources** (`im:resource` family; confirm exact
   scope name in console) → **publish/release** the app version so the scope is active in the tenant →
   copy `app_id` + `app_secret`.
3. **GAS config helper**: add to `google-apps-script-complete.js`:
   ```js
   // One-time: run from the Apps Script editor to store Lark creds in Script Properties.
   function setLarkConfig_(webhookUrl, appId, appSecret) {
     scriptProp.setProperty('LARK_WEBHOOK_URL', webhookUrl);
     scriptProp.setProperty('LARK_APP_ID', appId);
     scriptProp.setProperty('LARK_APP_SECRET', appSecret);
   }
   ```
4. In the Apps Script editor, run `setLarkConfig_('<webhook>', '<app_id>', '<app_secret>')` once
   (paste literal values in a temporary wrapper or the function args), then clear the literals.
5. Verify via a throwaway `Logger.log(scriptProp.getProperty('LARK_APP_ID'))`.

## Success Criteria

- [ ] Custom bot added to staff group; webhook URL captured.
- [ ] Custom app created + released; `app_id`/`app_secret` captured; image-upload scope granted.
- [ ] All three Script Properties set and readable from GAS.
- [ ] No credential literal committed to `google-apps-script-complete.js`.

## Risk Assessment

- **Scope name mismatch** — Lark console scope label may differ from `im:resource`; confirm at setup, grant the
  one that authorizes `POST /open-apis/im/v1/images`. Mitigation: test upload in Phase 2 surfaces a 403 fast.
- **App not released** — unreleased app version = scope inactive = token works but upload 403s. Release before testing.

## Next Steps

Phase 2 consumes these three properties.
