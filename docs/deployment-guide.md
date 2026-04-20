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

