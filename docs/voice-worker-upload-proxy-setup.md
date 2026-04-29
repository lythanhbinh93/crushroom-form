# Voice Worker Upload Proxy — Setup Runbook

**Feature:** Phase 2.1 — `POST /upload-voice-audio` on `voice-proxy.crushroom.workers.dev`
**One-time setup required before deploying** the updated `cloudflare-worker-voice-proxy.js`.

---

## Prerequisites

- Access to Google Cloud Console for the project
- `wrangler` CLI installed and authenticated (`wrangler login`)
- The Drive folder ID where voice audio already lives (used by GAS `VOICE_FOLDER_ID`)

---

## Step 1 — Create GCP Service Account

1. Open [Google Cloud Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Select the project used by the existing voice GAS script.
3. Click **Create Service Account**.
   - Name: `voice-upload-worker`
   - ID: `voice-upload-worker` (auto-filled)
   - Description: `Cloudflare Worker service account for Drive audio uploads`
4. Click **Create and Continue**.
5. Skip "Grant this service account access to project" (no project-level roles needed — folder-level share is enough).
6. Click **Done**.

---

## Step 2 — Generate JSON Key

1. In the Service Accounts list, click the `voice-upload-worker` account.
2. Go to the **Keys** tab → **Add Key** → **Create new key** → **JSON**.
3. Download the JSON file (e.g. `voice-upload-worker-key.json`).
4. **Keep this file secure — do not commit it to git.**

---

## Step 3 — Enable Google Drive API

1. Go to [APIs & Services → Library](https://console.cloud.google.com/apis/library).
2. Search **Google Drive API** → click **Enable** (if not already enabled).

---

## Step 4 — Share Drive Folder with Service Account

1. Open Google Drive and navigate to the voice-gift folder (the one whose ID is your `VOICE_FOLDER_ID`).
2. Right-click the folder → **Share**.
3. In the "Add people and groups" field, enter the service account email:
   ```
   voice-upload-worker@<YOUR_PROJECT_ID>.iam.gserviceaccount.com
   ```
   (visible on the Service Accounts page or in the JSON key under `client_email`).
4. Set permission to **Editor**.
5. Uncheck "Notify people" (it's a service account).
6. Click **Share**.

---

## Step 5 — Store Secrets in Cloudflare

Run both commands from the repo root (where `wrangler.toml` lives).

### 5a. Store the service account JSON key

```bash
wrangler secret put DRIVE_SA_JSON
```

When prompted, paste the **entire contents** of `voice-upload-worker-key.json` as a single line (or multi-line — wrangler accepts either). Press Enter twice to confirm.

Alternatively, pipe it directly:
```bash
cat voice-upload-worker-key.json | wrangler secret put DRIVE_SA_JSON
```

### 5b. Store the Drive folder ID

```bash
wrangler secret put VOICE_FOLDER_ID
```

When prompted, paste the folder ID string (the long alphanumeric ID from the Drive URL).

Verify both secrets are registered:
```bash
wrangler secret list
```

Expected output includes:
```
DRIVE_SA_JSON
VOICE_FOLDER_ID
```

---

## Step 6 — Deploy the Worker

```bash
wrangler deploy
```

Expected output ends with:
```
Deployed voice-proxy (... ms)
  https://voice-proxy.crushroom.workers.dev
```

---

## Step 7 — Smoke Tests

### 7a. Valid 1 MB MP3 upload (should succeed)

```bash
# Create a 1 MB test file if you don't have one
dd if=/dev/urandom bs=1024 count=1024 | head -c 1048576 > /tmp/test.mp3

curl -X POST \
  'https://voice-proxy.crushroom.workers.dev/upload-voice-audio?filename=smoke-test.mp3&mime=audio%2Fmpeg' \
  --data-binary @/tmp/test.mp3 \
  -H 'Content-Type: audio/mpeg' \
  -H 'Origin: https://crushroom-form.vercel.app' \
  -w '\nHTTP %{http_code}\n'
```

Expected response (HTTP 200):
```json
{"ok":true,"driveFileId":"<id>","mime":"audio/mpeg","size":1048576,"durationMs":<ms>}
```

Verify the file appears in the Drive folder with name `smoke-test.mp3`.

### 7b. 95 MB body rejection (should return 413)

```bash
dd if=/dev/urandom bs=1048576 count=95 > /tmp/big.mp3

curl -X POST \
  'https://voice-proxy.crushroom.workers.dev/upload-voice-audio?filename=big.mp3&mime=audio%2Fmpeg' \
  --data-binary @/tmp/big.mp3 \
  -H 'Content-Type: audio/mpeg' \
  -H 'Origin: https://crushroom-form.vercel.app' \
  -w '\nHTTP %{http_code}\n'
```

Expected: HTTP 413 `{"ok":false,"error":"payload_too_large"}`

### 7c. Unsupported MIME rejection (should return 400)

```bash
curl -X POST \
  'https://voice-proxy.crushroom.workers.dev/upload-voice-audio?filename=test.mp3&mime=video%2Fmp4' \
  --data-binary @/tmp/test.mp3 \
  -H 'Content-Type: video/mp4' \
  -H 'Origin: https://crushroom-form.vercel.app' \
  -w '\nHTTP %{http_code}\n'
```

Expected: HTTP 400 `{"ok":false,"error":"unsupported_mime","mime":"video/mp4"}`

### 7d. CORS preflight from production origin (should return 204)

```bash
curl -X OPTIONS \
  'https://voice-proxy.crushroom.workers.dev/upload-voice-audio' \
  -H 'Origin: https://crushroom-form.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type' \
  -v 2>&1 | grep -E 'HTTP|Access-Control'
```

Expected: HTTP 204, `Access-Control-Allow-Origin: https://crushroom-form.vercel.app`

### 7e. Token cache hit (second request should be faster)

Run smoke test 7a twice in quick succession. The second call should complete noticeably faster (no `oauth2.googleapis.com` call). You can confirm by checking Worker tail logs:

```bash
wrangler tail
```

First call: logs show `oauth2 token exchange` (cache miss). Second call: no oauth log line (cache hit).

---

## Rollback

If the upload route causes issues, the existing streaming and metadata routes are unaffected. You can disable only the upload route by temporarily returning 503 at the top of `handleUpload`, then redeploying. No data loss — Drive files already uploaded remain intact.

---

## Key Rotation

Service account keys should be rotated **quarterly**. Owner: @lythanhbinh93.

Steps:
1. GCP Console → Service Accounts → `voice-upload-worker` → Keys → Add new key (JSON).
2. `wrangler secret put DRIVE_SA_JSON` with the new key content.
3. Verify with smoke test 7a.
4. Delete the old key from GCP Console.

---

## Security Notes

- Service account scope is `drive.file` — Worker can only access files it creates, not the full Drive.
- Secret `DRIVE_SA_JSON` is encrypted at rest by Cloudflare; never logged or returned to clients.
- CORS for the upload route is restricted to `https://crushroom-form.vercel.app` and `localhost:*` (dev). The streaming/metadata routes retain `*` CORS (public audio playback).
- Filenames are sanitized server-side: path separators stripped, max 200 characters.
