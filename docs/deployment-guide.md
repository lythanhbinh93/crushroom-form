# Deployment Guide

**Project**: CouplePix (crushroom-form)  
**Last Updated**: 2026-04-20  
**Audience**: DevOps, infrastructure team

## Overview

CouplePix is deployed across three platforms: Streamlit Cloud (Streamlit app), Vercel (static frontend), and Google Apps Script (backend). Each has independent deployment pipelines.

## 1. Streamlit Cloud (Photo Naming Helper)

### Setup (One-Time)

1. Go to https://streamlit.io/cloud
2. Sign in with GitHub
3. Click "New app"
4. Repository: `lythanhbinh93/crushroom-form`
5. Branch: Current development branch (e.g., `claude/...`)
6. Main file: `app.py`
7. Click "Deploy"

### Auto-Deployment

**Trigger**: Git push to selected branch

**Behavior**:
- Streamlit detects push automatically
- Installs dependencies from `requirements.txt`
- Runs `streamlit run app.py`
- Deployment takes 2–3 min
- URL: `https://crushroomapp.streamlit.app/`

### Monitoring

**Dashboard**: https://share.streamlit.io/

**Logs**: Click app → "Settings" → "View logs"

**Checks**:
- [ ] App loads without errors
- [ ] Can upload and parse Excel
- [ ] GAS search returns results
- [ ] ZIP export completes

### Rollback

Push previous commit to trigger redeploy:
```bash
git revert HEAD
git push origin <branch>
```

### Secrets Management

For future GAS endpoint URL or API keys:
1. Go to Streamlit Cloud dashboard
2. App settings → "Secrets"
3. Add as TOML:
   ```toml
   [api]
   google_script_url = "https://script.google.com/..."
   ```
4. Reference in `app.py`:
   ```python
   st.secrets["api"]["google_script_url"]
   ```

## 2. Vercel (Static Frontend + Admin Panel)

### Setup (One-Time)

1. Go to https://vercel.com
2. Sign in with GitHub
3. Import project: `lythanhbinh93/crushroom-form`
4. Framework preset: "Other" (static)
5. Deploy

### Configuration

**File**: `vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/",
      "destination": "/index.html"
    },
    {
      "source": "/admin.html",
      "destination": "/admin.html"
    },
    {
      "source": "/couplepix.html",
      "destination": "/couplepix.html"
    },
    {
      "source": "/check-date.html",
      "destination": "/check-date.html"
    }
  ]
}
```

### Routing

| URL | File |
|-----|------|
| `/` | `index.html` |
| `/admin.html` | `admin.html` |
| `/couplepix.html` | `couplepix.html` |
| `/check-date.html` | `check-date.html` |
| `/assets/*` | `assets/` (CSS/JS) |

### Auto-Deployment

**Trigger**: Git push to main branch

**URL**: `https://crushroom-form.vercel.app/`

### Monitoring

**Dashboard**: https://vercel.com/dashboard

**Checks**:
- [ ] Homepage loads (index.html)
- [ ] Admin panel loads (admin.html)
- [ ] CSS/JS files accessible
- [ ] Links work (to Streamlit, GAS, etc.)

### Rollback

Vercel keeps deployment history. Go to dashboard → click previous deployment → "Promote to Production".

## 3. Google Apps Script (Backend)

### Setup (One-Time)

1. Go to https://script.google.com
2. Create new project
3. Paste `google-apps-script-complete.js` into editor
4. Functions → `intialSetup` → Run (authorizes access)
5. Fills PropertiesService with Spreadsheet ID

### Configuration (in Script)

**Required values** (edit in script):
```javascript
const sheetName = 'form data';                    // Target sheet name
const productsSheetName = 'products';             // Product catalog sheet
const driveFolderId = 'FOLDER_ID';                // Target Drive folder (uploads)
const productImagesFolderId = 'FOLDER_ID';        // Product images folder (NEW — required for imageProxy)
const recipientEmail = 'crush@crushroom.vn';      // Notification email
```

**CRITICAL**: `productImagesFolderId` MUST be set to the Drive folder ID containing product catalog images, otherwise the admin panel's "Copy ảnh + tin nhắn" feature will fail to load product thumbnails (fallback imageProxy will reject all product-image requests). If using imageProxy, deploy with:
1. Set `productImagesFolderId` to the folder ID
2. Deploy as Web app with "Execute as: Me" (requires script-owner Drive read access)
3. First run from editor: call `authorizeUrlFetch()` function once to grant external_request scope

### Deployment

1. Deploy → "New deployment" → Type: "Web app"
2. Execute as: **Me** (script-owner; required for DriveApp & imageProxy)
3. Who has access: "Anyone"
4. Click "Deploy"
5. Copy the deployment URL
6. Update hardcoded URLs in:
   - `app.py` (line 14: `GOOGLE_SCRIPT_URL`)
   - `assets/admin.js` (search for `script.google.com`)
   - `assets/couple-pix.js` (search for `script.google.com`)
   - `couplepix.html` (search for `script.google.com`)

**New OAuth Scope (if using imageProxy)**:
- One-time editor setup: call `authorizeUrlFetch()` function to grant `external_request` scope (UrlFetchApp for imageProxy)
- This dialog appears once; can be deleted after authorization succeeds

### Required Google Setup

**Spreadsheet**:
1. Create Google Sheet named "CouplePix Form Data"
2. Share with GAS service account (email from GAS settings)
3. Copy Spreadsheet ID
4. In GAS Editor → Project Settings → copy ID to PropertiesService (via `intialSetup()`)

**Drive Folder**:
1. Create Drive folder "CouplePix Uploads"
2. Share with GAS service account
3. Copy folder ID
4. Paste into GAS script line: `const folder = DriveApp.getFolder('FOLDER_ID');`

**Gmail**:
- GAS has access to send email via MailApp (no additional setup needed)
- Recipient email: crush@crushroom.vn (or configure in script)

### Monitoring

**Logs**: Editor → Execution log (shows recent runs)

**Sheets**: Check "form data" sheet for new rows (indicates successful uploads)

**Checks**:
- [ ] Customer upload works (FormData POST)
- [ ] Admin search works (GET ?action=search&phone=...)
- [ ] Admin browse works (GET ?action=list&from=...&to=...)
- [ ] Sheet rows appear after upload
- [ ] Email notification sent

### Error Handling

**Common Errors**:

| Error | Cause | Fix |
|-------|-------|-----|
| `SpreadsheetApp.openById() fails` | Spreadsheet ID not set | Run `intialSetup()` again |
| `DriveApp.getFolder() fails` | Folder ID invalid | Verify folder exists, check ID |
| `MailApp.sendEmail() fails` | Recipient not authorized | Use organization email or allow insecure |
| `LockService timeout` | Concurrent uploads | Increase timeout or add queue |

### URL Rotation (When Needed)

If GAS endpoint is compromised:

1. Create new GAS project
2. Deploy as new Web app
3. Copy new URL
4. Update in 4 locations:
   - `app.py` line 14
   - `assets/admin.js`
   - `assets/couple-pix.js`
   - `couplepix.html`
5. Commit & push changes
6. Redeploy Streamlit & Vercel (auto)
7. Verify all endpoints work
8. Delete old GAS deployment

**Time estimate**: 10–15 min per rotation

## Environment Variables & Secrets

### Streamlit

Store in Streamlit Cloud dashboard:
```toml
[google_apps_script]
endpoint = "https://script.google.com/macros/s/AKfycb.../exec"
```

### Vercel

Add to Vercel dashboard → Settings → Environment Variables:
```
GAS_ENDPOINT=https://script.google.com/macros/s/AKfycb.../exec
```

Then reference in JS (frontend):
```javascript
const gasUrl = process.env.GAS_ENDPOINT || 'https://script.google.com/...';
```

### Google Apps Script

Use PropertiesService (set via `intialSetup()`):
```javascript
const spreadsheetId = scriptProp.getProperty('key');
const sheetName = 'form data';  // Hardcoded (OK for small project)
```

## 4. Voice Gift GAS Deploy

The Voice Gift feature uses a **separate** GAS project from the main backend. This isolates voice storage quotas and endpoints.

### Setup (One-Time)

1. Go to https://script.google.com — create a **new** project (do NOT reuse the main GAS project)
2. Paste contents of `google-apps-script-voice.js` into the editor
3. **Enable Drive API v2 Advanced Service**:
   - Editor → Services (+ icon) → "Google Drive API" → Version v2 → Add
   - This is required for `Drive.Files.insert()` used by `finishUpload`. Without it, uploads fail silently.
4. Create two Drive folders (can be in "My Drive"):
   - "CouplePix Voice Audio" — for MP3/M4A uploads
   - "CouplePix Voice Images" — for customer photos
   - Copy both folder IDs from Drive URL (`/folders/FOLDER_ID`)
5. In GAS Editor → Project Settings → Script Properties → Add:
   - `VOICE_AUDIO_FOLDER_ID` = `<audio folder ID>`
   - `VOICE_IMAGE_FOLDER_ID` = `<image folder ID>`
6. Run `intialSetup()` function once (authorizes Spreadsheet access, creates `voice_pages` sheet)
7. Run `authorizeUrlFetch()` function once (grants `external_request` UrlFetchApp scope — required for audioProxy)
8. Deploy → "New deployment" → Type: **Web app**
   - Execute as: **Me** (script-owner; required for DriveApp)
   - Who has access: **Anyone**
9. Copy the deployment URL

### Update Hardcoded URLs

After deploying, update `VOICE_GAS_URL` constant in 3 files:

| File | Constant |
|------|----------|
| `assets/voice-upload.js` | `var VOICE_GAS_URL` (line ~19) |
| `assets/voice-page.js` | `var VOICE_GAS_URL` (line ~16) |
| `assets/admin-voice-tab.js` | `const VOICE_GAS_URL` (line ~19) |

### Verify Deployment

```bash
# Test listVoice (should return { ok: true, rows: [] } on fresh deploy)
curl "https://script.google.com/macros/s/YOUR_ID/exec?action=listVoice&status=pending"

# Test getVoice with nonexistent slug (should return { ok: false, error: "not found" })
curl "https://script.google.com/macros/s/YOUR_ID/exec?action=getVoice&id=test"
```

### Voice Gift Routing (Vercel)

The new static pages (`voice-upload.html`, `voice.html`) are served by Vercel automatically. No changes to `vercel.json` required — Vercel serves all `.html` files in the root by default.

### Voice Proxy Worker (Cloudflare — Phase 2.1)

Recipient audio playback, metadata caching, and upload go through a Cloudflare Worker. Source: `cloudflare-worker-voice-proxy.js` + `wrangler.toml`.

**Routes**:
- `GET /voice/<slug>` → cached JSON proxy of GAS `getVoice` (1 h edge TTL, 10 min browser TTL)
- `GET /<driveFileId>` → streaming Drive audio with CORS + Range support (24 h immutable cache)
- `POST /upload-voice-audio` → service-account authenticated upload to Drive via resumable session (90 MB) — **NEW Phase 2.1**
- `OPTIONS /upload-voice-audio` → CORS preflight

**Setup (one-time)**:
1. **For audio proxy only** (existing): See below
2. **For upload route (NEW Phase 2.1)**: Create GCP service account + Drive API enable + share folder. See **`docs/voice-worker-upload-proxy-setup.md`** (212 LOC runbook with exact steps, secrets, smoke test)

**Audio Proxy Setup (Existing)**:
1. `npm i -g wrangler` (global install, no project package.json needed)
2. `wrangler login` → CF OAuth in browser
3. From repo root: `wrangler deploy` → outputs URL like `https://voice-proxy.<sub>.workers.dev`
4. If subdomain not yet set, dashboard prompts to register one
5. After deploy, update `VOICE_AUDIO_PROXY_URL` constant in 3 files if subdomain differs from `crushroom`:
   - `assets/voice-page.js` (line ~17)
   - `assets/admin-voice-tab.js` (line ~22)
   - `cloudflare-worker-voice-proxy.js` `GAS_VOICE_URL` constant (only if GAS URL changes)

**Re-deploy after worker code change**: just `wrangler deploy` again. Cache stays warm for previously-fetched slugs (cleared on TTL expiry).

**Cache behavior**: admin "Publish" prefetches both `/voice/<slug>` and `/<audio_file_id>` so first recipient hits warm caches. Re-publishing a row keeps the same slug; recipients see stale metadata for up to 1 h. Manual purge possible via `wrangler` API or by changing the cache key in code.

### Monitoring

**Checks after deploy**:
- [ ] Customer upload form loads with valid `?phone=&order=` params
- [ ] Upload with small test audio (<1MB) succeeds
- [ ] Admin #voice tab shows the pending row
- [ ] Publish → QR appears → Copy QR works
- [ ] Open `voice.html?id=SLUG` → audio loads and plays
- [ ] Email notification arrives at crush@crushroom.vn

**Drive Folders**:
- Audio folder: monitor size quarterly (50 MB MP3 uploads add up)
- Image folder: 400×400 JPEG, ~80 KB each — negligible

## Monitoring & Alerts

### Google Drive Quota

**Check**: https://one.google.com/storage

**Quota**: 15 GB free → ~300 couple photos (20 MB each)

**Monitoring**:
- [ ] Check quarterly
- [ ] Archive old uploads if >80% full
- [ ] Document rotation schedule

### Streamlit Cloud Status

**Status page**: https://status.streamlit.io/

**Subscribe**: Email notifications for outages

### Vercel Status

**Status page**: https://www.vercel-status.com/

**Dashboard**: https://vercel.com/status

## Disaster Recovery

### Backup Strategy

**Drive**: Google Drive's versioning (built-in)
- Files have version history
- Recover deleted files from Trash (30 days)

**Sheet**: Google Sheets versioning
- Check version history: File → Version history
- Restore old version if needed

**Code**: GitHub (DVCS)
- All code in git
- Branches tagged at release points
- Can revert to any commit

### Recovery Procedures

**If Streamlit app down**:
1. Check Streamlit Cloud dashboard for errors
2. Check GAS endpoint status (curl the URL)
3. If GAS down: redeploy GAS script
4. If code issue: rollback git commit on branch

**If Vercel down**:
1. Check Vercel dashboard
2. Manually deploy previous version
3. Check static files (CSS/JS) not corrupted

**If GAS down**:
1. Check GAS execution logs
2. If quota exceeded: delete old files from Drive
3. If service error: wait or redeploy

**If Drive quota full**:
1. Delete oldest uploads (before DATE)
2. Archive Sheet rows to separate "archive" sheet
3. Monitor quota going forward

## Deployment Checklist

### Before Deploy

- [ ] Code review completed
- [ ] All tests pass locally
- [ ] No secrets in code (API keys, credentials)
- [ ] requirements.txt updated (Python)
- [ ] package.json updated (if applicable)
- [ ] vercel.json is valid JSON
- [ ] GAS script has no syntax errors
- [ ] Branch is up-to-date with main

### After Deploy

- [ ] Streamlit app loads and responds
- [ ] Admin panel searches work
- [ ] Customer upload form submits
- [ ] Check Date calculator displays results
- [ ] GAS endpoint logs new uploads
- [ ] Email notification received
- [ ] ZIP export downloads successfully
- [ ] No errors in logs

### Post-Deployment

- [ ] Monitor logs for 30 min
- [ ] Test critical workflows
- [ ] Verify email notifications
- [ ] Check Drive for new files
- [ ] Confirm Sheet updated

## Unresolved Questions

- Should GAS deployment be automated via CI/CD?
- What is the acceptable downtime for each component?
- Should there be a staging environment?
- How often should backups be tested?

