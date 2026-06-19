/**
 * Google Apps Script — CouplePix Voice Gift Pages (standalone)
 *
 * Deploy this file to its OWN GAS project (separate from google-apps-script-complete.js).
 * This gives the voice feature its own Sheet, its own Drive folders, its own quota,
 * its own web-app URL — fully isolated from the photo-upload pipeline.
 *
 * Endpoints:
 *   GET  ?action=listVoice[&status=pending|published|archived|all]
 *   GET  ?action=getVoice&id=SLUG
 *   POST action=initUpload    (phone, order_id, filename, mimeType, size)
 *   POST action=finishUpload  (phone, order_id, fileId, text_message, imgData, imgFilename)
 *   POST action=publishVoice  (phone, order_id)
 *   POST action=archiveVoice  (phone, order_id, target_status)
 *
 * Setup (one-time, after paste into new GAS project):
 *   1. Run intialSetup() from the editor — binds Spreadsheet, creates Script Properties placeholders.
 *   2. Project Settings → Script Properties → fill:
 *        - VOICE_AUDIO_FOLDER_ID  (Drive folder ID for audio uploads)
 *        - VOICE_IMAGE_FOLDER_ID  (Drive folder ID for voice-gift images)
 *   3. Run authorizeUrlFetch() once to grant external_request scope.
 *   4. Deploy → New deployment → Web app → Execute as Me, Anyone access.
 */

const VOICE_SHEET_NAME = 'voice_pages';
const VOICE_SHEET_HEADERS = [
    'timestamp', 'phone', 'order_id', 'text_message',
    'audio_file_id', 'audio_url', 'image_file_id', 'image_url',
    'status', 'slug', 'published_at',
    // Pre-computed by customer's browser during upload so recipient page
    // can render waveform instantly without re-decoding the audio.
    'peaks', 'audio_duration'
];
const VOICE_RECIPIENT_EMAIL = 'crush@crushroom.vn';
const VOICE_PAGE_BASE_URL = 'https://crushroom-form.vercel.app/voice.html?id=';

const scriptProp = PropertiesService.getScriptProperties();

// ============================================================
//  SETUP
// ============================================================

function intialSetup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    scriptProp.setProperty('key', ss.getId());
    if (!scriptProp.getProperty('VOICE_AUDIO_FOLDER_ID')) {
        scriptProp.setProperty('VOICE_AUDIO_FOLDER_ID', '');
        Logger.log('ACTION REQUIRED: Set VOICE_AUDIO_FOLDER_ID in Script Properties (Drive folder ID for audio files).');
    }
    if (!scriptProp.getProperty('VOICE_IMAGE_FOLDER_ID')) {
        scriptProp.setProperty('VOICE_IMAGE_FOLDER_ID', '');
        Logger.log('ACTION REQUIRED: Set VOICE_IMAGE_FOLDER_ID in Script Properties (Drive folder ID for voice-gift images).');
    }
    ensureVoiceSheet_();
    Logger.log('Setup complete. Sheet: ' + VOICE_SHEET_NAME + ' (Spreadsheet ID: ' + ss.getId() + ')');
}

// Run ONCE from the editor to grant UrlFetchApp the external_request scope.
function authorizeUrlFetch() {
    const res = UrlFetchApp.fetch('https://www.google.com/');
    Logger.log('status: ' + res.getResponseCode());
}

// ============================================================
//  ROUTERS
// ============================================================

function doGet(e) {
    try {
        const action = e.parameter.action;
        if (action === 'listVoice') return handleListVoice_(e);
        // getVoice and audioProxy are recipient-facing: no admin login required.
        if (action === 'getVoice') return handleGetVoice_(e);
        if (action === 'audioProxy') return handleAudioProxy_(e);
        return jsonOut({ ok: false, error: 'Invalid action' });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

function doPost(e) {
    try {
        const action = e.parameter && e.parameter.action;
        if (action === 'initUpload') return handleInitUpload_(e);
        if (action === 'finishUpload') return handleFinishUpload_(e);
        if (action === 'publishVoice') return handlePublishVoice_(e);
        if (action === 'archiveVoice') return handleArchiveVoice_(e);
        if (action === 'updatePeaks') return handleUpdatePeaks_(e);
        return jsonOut({ ok: false, error: 'Invalid action' });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

// ============================================================
//  SHARED HELPERS (duplicated from google-apps-script-complete.js
//  to keep this file self-contained per brainstorm decision)
// ============================================================

function jsonOut(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// Canonical VN phone: digits only. Two normalization steps:
//  1) Strip leading VN country code 84 when digits is 11-12 long (mobile/landline w/ country code).
//  2) Auto-prepend 0 when result is 9 digits starting 3-9 (VN mobile w/o leading 0).
function normalizeVNPhone_(raw) {
    var digits = String(raw || '').replace(/\D/g, '');
    if (digits.length >= 11 && digits.length <= 12 && digits.indexOf('84') === 0) {
        digits = digits.slice(2);
    }
    if (digits.length === 9 && /^[3-9]/.test(digits)) digits = '0' + digits;
    return digits;
}

/**
 * Guard against CSV/formula-injection: a leading =, +, -, @, tab, or CR
 * lets a cell value execute as a spreadsheet formula when opened in Excel/Sheets.
 * Prefix those with a single quote (Sheets stores as text, hides the quote).
 * Only apply to CUSTOMER-CONTROLLED fields (order_id, text_message, peaks).
 */
function csvSafe_(v) {
    v = String(v == null ? '' : v);
    return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

// ============================================================
//  SHEET + DRIVE HELPERS
// ============================================================

/** Lazy-create voice_pages sheet with header row if absent. */
function ensureVoiceSheet_() {
    var doc = SpreadsheetApp.openById(scriptProp.getProperty('key'));
    var sheet = doc.getSheetByName(VOICE_SHEET_NAME);
    if (!sheet) {
        sheet = doc.insertSheet(VOICE_SHEET_NAME);
        sheet.getRange(1, 1, 1, VOICE_SHEET_HEADERS.length).setValues([VOICE_SHEET_HEADERS]);
        sheet.setFrozenRows(1);
    }
    return sheet;
}

/**
 * Find a row by (phone, order_id). Returns { rowIdx, row } or null.
 * Normalizes stored phone before compare — Sheets auto-casts leading-zero strings
 * to numbers ("0918260494" → 918260494), so we re-normalize both sides.
 */
function voiceFindRowByKey_(phone, orderId) {
    var sheet = ensureVoiceSheet_();
    var data = sheet.getDataRange().getValues();
    var iPhone = VOICE_SHEET_HEADERS.indexOf('phone');
    var iOrder = VOICE_SHEET_HEADERS.indexOf('order_id');
    for (var i = 1; i < data.length; i++) {
        var rowPhone = normalizeVNPhone_(String(data[i][iPhone]));
        if (rowPhone === phone && String(data[i][iOrder]) === orderId) {
            return { rowIdx: i + 1, row: data[i] };
        }
    }
    return null;
}

/** Find a row by slug. Returns { rowIdx, row } or null. */
function voiceFindRowBySlug_(slug) {
    var sheet = ensureVoiceSheet_();
    var data = sheet.getDataRange().getValues();
    var iSlug = VOICE_SHEET_HEADERS.indexOf('slug');
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][iSlug]) === slug) {
            return { rowIdx: i + 1, row: data[i] };
        }
    }
    return null;
}

/**
 * Create a Drive resumable upload session (Drive REST v2).
 * Returns the Location URL string. Raw UrlFetchApp — no Advanced Service required.
 */
function createResumableUploadSession_(filename, mimeType, size, folderId) {
    var token = ScriptApp.getOAuthToken();
    var metadata = JSON.stringify({
        title: filename,
        mimeType: mimeType,
        parents: [{ id: folderId }]
    });
    var response = UrlFetchApp.fetch(
        'https://www.googleapis.com/upload/drive/v2/files?uploadType=resumable',
        {
            method: 'post',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType,
                'X-Upload-Content-Length': String(size)
            },
            payload: metadata,
            muteHttpExceptions: true
        }
    );
    var code = response.getResponseCode();
    if (code !== 200) {
        throw new Error('Drive resumable init failed: HTTP ' + code + ' — ' + response.getContentText().slice(0, 300));
    }
    var location = response.getHeaders()['Location'] || response.getHeaders()['location'];
    if (!location) throw new Error('Drive API did not return a Location header');
    return location;
}

/** Save base64-encoded image bytes to a Drive folder. Returns { fileId, url }. */
function saveImageToDrive_(base64Data, filename, folderId) {
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, 'image/jpeg', filename);
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    return { fileId: file.getId(), url: file.getUrl() };
}

/** Set a Drive file to anyone-with-link viewer. */
function setAnyoneCanView_(fileId) {
    DriveApp.getFileById(fileId).setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
    );
}

/** Generate a 10-char hex slug that does not collide. Retries up to 5 times. */
function genUniqueSlug_() {
    var sheet = ensureVoiceSheet_();
    var data = sheet.getDataRange().getValues();
    var iSlug = VOICE_SHEET_HEADERS.indexOf('slug');
    var existing = {};
    for (var i = 1; i < data.length; i++) {
        var s = String(data[i][iSlug]);
        if (s) existing[s] = true;
    }
    for (var attempt = 0; attempt < 5; attempt++) {
        var candidate = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
        if (!existing[candidate]) return candidate;
    }
    return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

// ============================================================
//  ENDPOINT HANDLERS
// ============================================================

/**
 * POST action=initUpload
 * Params: phone, order_id, filename, mimeType, size
 * Returns: { ok, uploadUrl, sessionId }
 * sessionId is a stable client-side reference (phone_orderId). Real file ID
 * comes back to the client from Drive after it completes the PUT, and is
 * passed to finishUpload as `fileId`.
 */
function handleInitUpload_(e) {
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        var filename = String(e.parameter.filename || '').trim();
        var mimeType = String(e.parameter.mimeType || 'audio/mpeg').trim();
        var size = parseInt(e.parameter.size, 10);

        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (!filename) return jsonOut({ ok: false, error: 'filename required' });
        if (isNaN(size) || size <= 0) return jsonOut({ ok: false, error: 'size must be a positive integer' });

        var audioFolderId = scriptProp.getProperty('VOICE_AUDIO_FOLDER_ID');
        if (!audioFolderId) return jsonOut({ ok: false, error: 'VOICE_AUDIO_FOLDER_ID not configured in Script Properties' });

        var uploadUrl = createResumableUploadSession_(filename, mimeType, size, audioFolderId);
        return jsonOut({ ok: true, uploadUrl: uploadUrl, sessionId: phone + '_' + orderId });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

/**
 * POST action=finishUpload
 * Params:
 *   Required: phone, order_id, text_message
 *   Audio source — EITHER:
 *     (a) fileId  — Drive ID from a completed resumable upload (server-side callers; initUpload feeds this path)
 *     (b) audioData (base64) + audioFilename + audioMime — direct upload through GAS
 *         (PIVOT: Drive resumable PUT fails browser CORS, so browser posts audio base64 here)
 *   Optional: imgData (base64 JPEG), imgFilename
 * Upserts voice_pages row (re-upload overwrites → status resets to pending).
 */
function handleFinishUpload_(e) {
    var lock = LockService.getScriptLock();
    lock.tryLock(30000);
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        var audioFileId = String(e.parameter.fileId || '').trim();
        var audioData = e.parameter.audioData || '';
        var audioFilename = String(e.parameter.audioFilename || (phone + '_' + orderId + '.m4a')).trim();
        var audioMime = String(e.parameter.audioMime || 'audio/mpeg').trim();
        var textMessage = String(e.parameter.text_message || '').slice(0, 1000);
        var imgData = e.parameter.imgData || '';
        var imgFilename = String(e.parameter.imgFilename || (phone + '_' + orderId + '.jpg')).trim();
        var peaks = String(e.parameter.peaks || '');
        var audioDuration = parseFloat(e.parameter.audio_duration || '0') || 0;

        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (!audioFileId && !audioData) return jsonOut({ ok: false, error: 'audio required (fileId or audioData)' });

        var audioFolderId = scriptProp.getProperty('VOICE_AUDIO_FOLDER_ID');
        var imageFolderId = scriptProp.getProperty('VOICE_IMAGE_FOLDER_ID');

        // PIVOT path: save base64 audio to Drive (browser-CORS-safe alternative to resumable PUT)
        if (!audioFileId && audioData) {
            if (!audioFolderId) return jsonOut({ ok: false, error: 'VOICE_AUDIO_FOLDER_ID not configured' });
            try {
                var audioBytes = Utilities.base64Decode(audioData);
                var audioBlob = Utilities.newBlob(audioBytes, audioMime, audioFilename);
                var audioFile = DriveApp.getFolderById(audioFolderId).createFile(audioBlob);
                audioFileId = audioFile.getId();
            } catch (audioErr) {
                return jsonOut({ ok: false, error: 'audio save failed: ' + audioErr });
            }
        }

        try { setAnyoneCanView_(audioFileId); } catch (permErr) {
            Logger.log('Warning: could not set audio permissions: ' + permErr);
        }

        var audioUrl = 'https://drive.google.com/file/d/' + audioFileId + '/view?usp=sharing';
        var imageFileId = '';
        var imageUrl = '';

        if (imgData && imageFolderId) {
            try {
                var imgResult = saveImageToDrive_(imgData, imgFilename, imageFolderId);
                imageFileId = imgResult.fileId;
                imageUrl = imgResult.url;
                try { setAnyoneCanView_(imageFileId); } catch (_) { }
            } catch (imgErr) {
                Logger.log('Warning: image save failed: ' + imgErr);
            }
        }

        var sheet = ensureVoiceSheet_();
        var existing = voiceFindRowByKey_(phone, orderId);

        var now = new Date().toISOString();
        // Prefix phone with apostrophe so Sheets stores as text and preserves leading 0.
        // (Without this, "0918260494" auto-casts to number 918260494 and breaks lookups.)
        // csvSafe_ wraps customer-controlled text fields to prevent formula injection.
        var rowValues = [
            now, "'" + phone, csvSafe_(orderId), csvSafe_(textMessage),
            audioFileId, audioUrl, imageFileId, imageUrl,
            'pending', '', '',
            csvSafe_(peaks), audioDuration
        ];

        var rowIdx = existing ? existing.rowIdx : sheet.getLastRow() + 1;
        sheet.getRange(rowIdx, 1, 1, VOICE_SHEET_HEADERS.length).setValues([rowValues]);

        try {
            var subject = '[Voice Gift] New upload — order ' + orderId;
            var body = 'Phone: ' + phone + '\n'
                + 'Order ID: ' + orderId + '\n'
                + 'Admin: https://crushroom-form.vercel.app/admin.html#voice\n'
                + 'Message preview: ' + textMessage.slice(0, 200) + '\n';
            MailApp.sendEmail(VOICE_RECIPIENT_EMAIL, subject, body);
        } catch (mailErr) {
            Logger.log('MailApp failed (quota?): ' + mailErr);
        }

        return jsonOut({ ok: true, rowIndex: rowIdx });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    } finally {
        lock.releaseLock();
    }
}

/**
 * GET action=listVoice[&status=pending|published|archived|all]
 * Returns rows newest-first.
 */
function handleListVoice_(e) {
    try {
        var statusFilter = String(e.parameter.status || 'pending').toLowerCase();
        var sheet = ensureVoiceSheet_();
        var data = sheet.getDataRange().getValues();
        if (data.length < 2) return jsonOut({ ok: true, rows: [] });

        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        var rows = [];
        for (var i = data.length - 1; i >= 1; i--) {
            var row = data[i];
            var rowStatus = String(row[iStatus]).toLowerCase();
            if (statusFilter !== 'all' && rowStatus !== statusFilter) continue;
            var obj = {};
            VOICE_SHEET_HEADERS.forEach(function (h, idx) { obj[h] = row[idx]; });
            obj._rowIndex = i + 1;
            rows.push(obj);
        }
        return jsonOut({ ok: true, rows: rows });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

/**
 * POST action=publishVoice
 * Params: phone, order_id
 * Idempotent re-publish: keeps existing slug, bumps published_at.
 */
function handlePublishVoice_(e) {
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });

        var sheet = ensureVoiceSheet_();
        var found = voiceFindRowByKey_(phone, orderId);
        if (!found) return jsonOut({ ok: false, error: 'row_not_found' });

        var iSlug = VOICE_SHEET_HEADERS.indexOf('slug');
        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        var iPublishedAt = VOICE_SHEET_HEADERS.indexOf('published_at');

        var slug = String(found.row[iSlug] || '').trim();
        if (!slug) slug = genUniqueSlug_();

        var now = new Date().toISOString();
        sheet.getRange(found.rowIdx, iSlug + 1).setValue(slug);
        sheet.getRange(found.rowIdx, iStatus + 1).setValue('published');
        sheet.getRange(found.rowIdx, iPublishedAt + 1).setValue(now);

        return jsonOut({ ok: true, slug: slug, url: VOICE_PAGE_BASE_URL + slug });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

/**
 * POST action=updatePeaks slug=SLUG peaks=JSON audio_duration=NUM
 * Backfill helper: writes peaks + audio_duration onto an existing row.
 * Used by admin "Backfill peaks" tool to upgrade legacy rows to the fast path.
 * CF Worker /voice/<slug> cache stays stale up to TTL — recipients catch up
 * as cache expires (or via re-publish prefetch).
 */
function handleUpdatePeaks_(e) {
    try {
        var slug = String(e.parameter.slug || '').trim();
        if (!slug) return jsonOut({ ok: false, error: 'slug required' });

        var peaks = String(e.parameter.peaks || '').trim();
        var audioDuration = parseFloat(e.parameter.audio_duration || '0') || 0;
        if (!peaks) return jsonOut({ ok: false, error: 'peaks required' });
        if (audioDuration <= 0) return jsonOut({ ok: false, error: 'audio_duration required' });

        var sheet = ensureVoiceSheet_();
        var found = voiceFindRowBySlug_(slug);
        if (!found) return jsonOut({ ok: false, error: 'row_not_found' });

        var iPeaks = VOICE_SHEET_HEADERS.indexOf('peaks');
        var iDur = VOICE_SHEET_HEADERS.indexOf('audio_duration');
        // csvSafe_ guards against a crafted peaks string injecting a formula into Sheets.
        sheet.getRange(found.rowIdx, iPeaks + 1).setValue(csvSafe_(peaks));
        sheet.getRange(found.rowIdx, iDur + 1).setValue(audioDuration);

        return jsonOut({ ok: true, slug: slug });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

/**
 * GET action=getVoice&id=SLUG
 * Returns public JSON if published; 404 JSON otherwise.
 */
function handleGetVoice_(e) {
    try {
        var slug = String(e.parameter.id || '').trim();
        if (!slug) return jsonOut({ ok: false, error: 'id (slug) required' });

        var found = voiceFindRowBySlug_(slug);
        if (!found) return jsonOut({ ok: false, error: 'not_found' });

        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        if (String(found.row[iStatus]) !== 'published') {
            return jsonOut({ ok: false, error: 'not_found' });
        }

        var obj = {};
        VOICE_SHEET_HEADERS.forEach(function (h, idx) { obj[h] = found.row[idx]; });
        return jsonOut({
            ok: true,
            text_message: obj.text_message,
            audio_url: obj.audio_url,
            audio_file_id: obj.audio_file_id,
            image_url: obj.image_url,
            image_file_id: obj.image_file_id,
            published_at: obj.published_at,
            peaks: obj.peaks || '',
            audio_duration: obj.audio_duration || 0
        });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

/**
 * GET action=audioProxy&id=FILEID
 * Reads audio file bytes from Drive and returns as base64 JSON.
 *
 * WHY: Direct Drive URLs set Cross-Origin-Resource-Policy: same-site and
 * Content-Disposition: attachment, which block browser <audio> playback
 * from any non-Google origin. By proxying through GAS (our own origin),
 * the client can decode the base64 into a Blob and create a same-origin
 * object URL that <audio> accepts.
 *
 * Trade-off: no streaming — client waits for full download before play.
 * Acceptable for short voice messages (typical 1-3MB).
 *
 * Response: { ok: true, mime: "audio/mpeg", data: "<base64>" }
 */
function handleAudioProxy_(e) {
    try {
        var fileId = String(e.parameter.id || '').trim();
        if (!fileId) return jsonOut({ ok: false, error: 'id required' });

        // Verify file is in our configured audio folder (defense-in-depth against
        // file ID enumeration that could read arbitrary script-owner files).
        var folderId = scriptProp.getProperty('VOICE_AUDIO_FOLDER_ID');
        if (!folderId) return jsonOut({ ok: false, error: 'VOICE_AUDIO_FOLDER_ID not configured' });

        var file = DriveApp.getFileById(fileId);
        var parents = file.getParents();
        var inFolder = false;
        while (parents.hasNext()) {
            if (parents.next().getId() === folderId) { inFolder = true; break; }
        }
        if (!inFolder) return jsonOut({ ok: false, error: 'forbidden' });

        var blob = file.getBlob();
        var mime = blob.getContentType() || 'audio/mpeg';
        var data = Utilities.base64Encode(blob.getBytes());
        return jsonOut({ ok: true, mime: mime, data: data });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

/**
 * POST action=archiveVoice
 * Params: phone, order_id, target_status ('archived' | 'pending')
 * DRY: same handler toggles archive/restore.
 */
function handleArchiveVoice_(e) {
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        var targetStatus = String(e.parameter.target_status || 'archived').trim().toLowerCase();

        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (targetStatus !== 'archived' && targetStatus !== 'pending') {
            return jsonOut({ ok: false, error: 'target_status must be "archived" or "pending"' });
        }

        var sheet = ensureVoiceSheet_();
        var found = voiceFindRowByKey_(phone, orderId);
        if (!found) return jsonOut({ ok: false, error: 'row_not_found' });

        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        sheet.getRange(found.rowIdx, iStatus + 1).setValue(targetStatus);
        return jsonOut({ ok: true, status: targetStatus });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}
