/**
 * Google Apps Script — CouplePix Voice Gift Pages (standalone)
 *
 * Deploy this file to its OWN GAS project (separate from google-apps-script-complete.js).
 * This gives the voice feature its own Sheet, its own Drive folders, its own quota,
 * its own web-app URL — fully isolated from the photo-upload pipeline.
 *
 * Serves TWO products off one sheet, discriminated by the `type` column:
 * voice gifts and love counters. A blank type means voice, so rows written
 * before the column existed keep working untouched.
 *
 * Endpoints:
 *   GET  ?action=listVoice[&status=pending|published|archived|all][&type=voice|counter]
 *   GET  ?action=getVoice&id=SLUG
 *   GET  ?action=getCounter&id=SLUG
 *   GET  ?action=audioProxy&id=FILEID
 *   POST action=initUpload     (phone, order_id, filename, mimeType, size)
 *   POST action=finishUpload   (phone, order_id, fileId, text_message, imgData, imgFilename)
 *   POST action=submitCounter  (see docs/love-counter-submit-contract.md)
 *   POST action=publishVoice   (phone, order_id[, type])
 *   POST action=archiveVoice   (phone, order_id, target_status[, type])
 *   POST action=updatePeaks    (slug, peaks, audio_duration)
 *   POST action=editVoice      (phone, order_id, type + whitelisted fields; see contract doc)
 *   POST action=replaceMedia   (phone, order_id, type, slot + data|remove; see contract doc)
 *
 * Setup (one-time, after paste into new GAS project):
 *   1. Run intialSetup() from the editor — binds Spreadsheet, creates Script Properties placeholders.
 *   2. Project Settings → Script Properties → fill:
 *        - VOICE_AUDIO_FOLDER_ID  (Drive folder ID for audio uploads)
 *        - VOICE_IMAGE_FOLDER_ID  (Drive folder ID for images, both products)
 *   3. Run authorizeUrlFetch() once to grant external_request scope.
 *   4. Deploy → New deployment → Web app → Execute as Me, Anyone access.
 *
 * REDEPLOYING: use Manage deployments and bump the version of the EXISTING
 * deployment. A new deployment mints a new /exec URL, and five files hardcode
 * the current one (voice-upload.js, voice-page.js, admin-voice-tab.js,
 * love-counter-upload.js, cloudflare-worker-voice-proxy.js).
 *
 * After appending to VOICE_SHEET_HEADERS, run migrateCounterColumns() before
 * deploying — see that function.
 */

const VOICE_SHEET_NAME = 'voice_pages';
// Columns are addressed by name via indexOf everywhere, never by position, so
// this list may be APPENDED to safely. Never reorder or remove — existing rows
// are positional on disk. After appending, run migrateCounterColumns() once to
// widen the live sheet; ensureVoiceSheet_ only writes headers for a NEW sheet.
const VOICE_SHEET_HEADERS = [
    'timestamp', 'phone', 'order_id', 'text_message',
    'audio_file_id', 'audio_url', 'image_file_id', 'image_url',
    'status', 'slug', 'published_at',
    // Pre-computed by customer's browser during upload so recipient page
    // can render waveform instantly without re-decoding the audio.
    'peaks', 'audio_duration',

    // ── Love Counter ────────────────────────────────────────────────────────
    // Row discriminator. Blank on every pre-existing row, which is read as
    // 'voice' rather than backfilled — see rowType_().
    'type',
    // Raw 'YYYY-MM-DD', written apostrophe-prefixed. Without the apostrophe
    // Sheets casts it to a date cell, getValues() hands back a JS Date, and
    // JSON.stringify serialises Vietnam midnight as the PREVIOUS day.
    'start_date',
    'male_name', 'female_name',
    'male_image_file_id', 'male_image_url',
    'female_image_file_id', 'female_image_url',
    'bg_file_id', 'bg_url',
    'title', 'heart_text', 'audio_title'
];

// Values written into `type`. A blank cell means VOICE — see rowType_().
const ROW_TYPE_VOICE = 'voice';
const ROW_TYPE_COUNTER = 'counter';
const VOICE_RECIPIENT_EMAIL = 'crush@crushroom.vn';
// Branded custom domain, attached to the same Vercel deployment. URLs minted
// before the switch (crushroom-form.vercel.app) keep working — Vercel serves
// both hosts — so already-printed QRs are unaffected. Do NOT deploy a change
// to these bases unless the domain actually serves the app: publish is where
// a slug becomes a printed QR, and a dead host cannot be corrected afterwards.
const VOICE_PAGE_BASE_URL = 'https://qr.crushroom.vn/voice?id=';
// Love Counter rows publish to their own page — the two render nothing alike,
// and a shared page would ship the waveform player to counter visitors.
const COUNTER_PAGE_BASE_URL = 'https://qr.crushroom.vn/counter?id=';

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
        if (action === 'getCounter') return handleGetCounter_(e);
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
        if (action === 'submitCounter') return handleSubmitCounter_(e);
        if (action === 'publishVoice') return handlePublishVoice_(e);
        if (action === 'archiveVoice') return handleArchiveVoice_(e);
        if (action === 'updatePeaks') return handleUpdatePeaks_(e);
        if (action === 'editVoice') return handleEditVoice_(e);
        if (action === 'replaceMedia') return handleReplaceMedia_(e);
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
 * ONE-TIME (idempotent): widen the existing sheet with any headers added to
 * VOICE_SHEET_HEADERS since it was created.
 *
 * ensureVoiceSheet_ writes the header row only when the sheet does not exist,
 * so appending names in code does nothing to a live sheet on its own. Run this
 * from the editor after any append, BEFORE deploying code that reads or writes
 * the new columns — otherwise indexOf returns a position past the sheet's real
 * width and values land in the wrong cells.
 *
 * Safe to re-run: it only appends names that are genuinely missing, and never
 * reorders, renames or clears anything. Existing data is untouched.
 */
function migrateCounterColumns() {
    var sheet = ensureVoiceSheet_();
    var lastCol = sheet.getLastColumn();
    var existing = lastCol > 0
        ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); })
        : [];

    var missing = VOICE_SHEET_HEADERS.filter(function (h) { return existing.indexOf(h) === -1; });

    if (!missing.length) {
        Logger.log('Nothing to do — all ' + VOICE_SHEET_HEADERS.length + ' headers already present.');
        return;
    }

    // Guard: the code list must be a superset of the sheet, in the same order
    // for the shared prefix. If the sheet has a column the code does not know
    // about, positions have diverged and blind appending would corrupt reads.
    for (var i = 0; i < existing.length; i++) {
        if (existing[i] && VOICE_SHEET_HEADERS[i] !== existing[i]) {
            throw new Error(
                'ABORTED — column ' + (i + 1) + ' is "' + existing[i] + '" in the sheet but "' +
                VOICE_SHEET_HEADERS[i] + '" in code. Reconcile by hand; do not append.'
            );
        }
    }

    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sheet.setFrozenRows(1);
    Logger.log('Added ' + missing.length + ' column(s): ' + missing.join(', '));
    Logger.log('Sheet now has ' + sheet.getLastColumn() + ' columns; code expects ' + VOICE_SHEET_HEADERS.length + '.');
}

/**
 * Widen a positional row array to the full header width, padding with ''.
 *
 * Row writes build a positional array and hand it to
 * setValues(getRange(r, 1, 1, VOICE_SHEET_HEADERS.length)). setValues throws
 * unless the array width matches the range width exactly, so every append to
 * VOICE_SHEET_HEADERS would otherwise break every existing writer. Pad instead
 * of hand-counting: the writer lists the values it knows, this fills the rest.
 */
function padRow_(values) {
    var out = values.slice();
    while (out.length < VOICE_SHEET_HEADERS.length) out.push('');
    if (out.length > VOICE_SHEET_HEADERS.length) {
        throw new Error('row has ' + out.length + ' values but only ' +
            VOICE_SHEET_HEADERS.length + ' columns are defined');
    }
    return out;
}

/**
 * Fail loudly if the live sheet is narrower than the code expects.
 *
 * Guards the case where code that knows about new columns is deployed before
 * migrateCounterColumns() has widened the sheet. Without this the write still
 * "succeeds" against a short header row and values land under the wrong names.
 */
function assertSheetWidth_(sheet) {
    var width = sheet.getLastColumn();
    if (width < VOICE_SHEET_HEADERS.length) {
        throw new Error('sheet has ' + width + ' columns but code expects ' +
            VOICE_SHEET_HEADERS.length + ' — run migrateCounterColumns() first');
    }
}

/**
 * Row type, treating a blank cell as 'voice'.
 * Pre-existing rows predate the column and are never backfilled — backfilling
 * would rewrite production data for no gain.
 */
function rowType_(row) {
    var i = VOICE_SHEET_HEADERS.indexOf('type');
    var v = (i === -1 || row[i] === undefined) ? '' : String(row[i]).trim().toLowerCase();
    return v || ROW_TYPE_VOICE;
}

/**
 * Find a row by (phone, order_id, type). Returns { rowIdx, row } or null.
 *
 * Type is part of the key because one customer can buy a voice gift and a love
 * counter on the SAME order. Keyed on phone+order alone, both rows collide and
 * the first match wins, so a submission or publish silently writes the wrong
 * row. Omitting `type` means voice, which keeps every existing caller correct
 * and matches pre-existing rows through rowType_'s blank-is-voice rule.
 *
 * Normalizes stored phone before compare — Sheets auto-casts leading-zero strings
 * to numbers ("0918260494" → 918260494), so we re-normalize both sides.
 */
function voiceFindRowByKey_(phone, orderId, type) {
    var wantType = String(type || ROW_TYPE_VOICE).trim().toLowerCase();
    var sheet = ensureVoiceSheet_();
    var data = sheet.getDataRange().getValues();
    var iPhone = VOICE_SHEET_HEADERS.indexOf('phone');
    var iOrder = VOICE_SHEET_HEADERS.indexOf('order_id');
    for (var i = 1; i < data.length; i++) {
        var rowPhone = normalizeVNPhone_(String(data[i][iPhone]));
        if (rowPhone === phone &&
            String(data[i][iOrder]) === orderId &&
            rowType_(data[i]) === wantType) {
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
            csvSafe_(peaks), audioDuration,
            // `type` — written explicitly on new rows. Pre-existing rows keep a
            // blank cell, which rowType_ reads as voice.
            ROW_TYPE_VOICE
        ];

        assertSheetWidth_(sheet);
        var rowIdx = existing ? existing.rowIdx : sheet.getLastRow() + 1;
        sheet.getRange(rowIdx, 1, 1, VOICE_SHEET_HEADERS.length).setValues([padRow_(rowValues)]);

        try {
            var subject = '[Voice Gift] New upload — order ' + orderId;
            var body = 'Phone: ' + phone + '\n'
                + 'Order ID: ' + orderId + '\n'
                + 'Admin: https://qr.crushroom.vn/admin#voice\n'
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
        // Absent type means "every type", so the existing admin call keeps
        // returning what it always did. Pass type=voice or type=counter to narrow.
        var typeFilter = String(e.parameter.type || 'all').trim().toLowerCase();
        var sheet = ensureVoiceSheet_();
        var data = sheet.getDataRange().getValues();
        if (data.length < 2) return jsonOut({ ok: true, rows: [] });

        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        var rows = [];
        for (var i = data.length - 1; i >= 1; i--) {
            var row = data[i];
            var rowStatus = String(row[iStatus]).toLowerCase();
            if (statusFilter !== 'all' && rowStatus !== statusFilter) continue;
            if (typeFilter !== 'all' && rowType_(row) !== typeFilter) continue;
            var obj = {};
            VOICE_SHEET_HEADERS.forEach(function (h, idx) { obj[h] = row[idx]; });
            // Explicit so the client never has to reproduce the blank-is-voice rule.
            obj.type = rowType_(row);
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
        // Absent type means voice, so the existing admin keeps working unchanged.
        var type = String(e.parameter.type || ROW_TYPE_VOICE).trim().toLowerCase();
        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });

        var sheet = ensureVoiceSheet_();
        var found = voiceFindRowByKey_(phone, orderId, type);
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

        // Each type has its own public page, so the printed QR must point at the
        // right one. Publish is where the slug becomes a URL, so it decides.
        var baseUrl = (type === ROW_TYPE_COUNTER) ? COUNTER_PAGE_BASE_URL : VOICE_PAGE_BASE_URL;
        return jsonOut({ ok: true, slug: slug, url: baseUrl + slug, type: type });
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

        // Mirror of getCounter's check: a counter slug must not resolve through
        // the voice endpoint, or voice.html would render a counter row as a
        // voice gift with an empty message.
        if (rowType_(found.row) !== ROW_TYPE_VOICE) {
            return jsonOut({ ok: false, error: 'not_found' });
        }

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
        var type = String(e.parameter.type || ROW_TYPE_VOICE).trim().toLowerCase();

        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (targetStatus !== 'archived' && targetStatus !== 'pending') {
            return jsonOut({ ok: false, error: 'target_status must be "archived" or "pending"' });
        }

        var sheet = ensureVoiceSheet_();
        var found = voiceFindRowByKey_(phone, orderId, type);
        if (!found) return jsonOut({ ok: false, error: 'row_not_found' });

        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        sheet.getRange(found.rowIdx, iStatus + 1).setValue(targetStatus);
        return jsonOut({ ok: true, status: targetStatus });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}

// ============================================================
//  ADMIN FIELD EDIT
//  Parameter contract: docs/love-counter-submit-contract.md → "editVoice"
// ============================================================

/**
 * The only fields action=editVoice may touch, per row type.
 * Everything else — identity (phone, order_id, type), lifecycle (status, slug,
 * published_at), file IDs/URLs, peaks — is unreachable by construction:
 * validateEditFields_ iterates THIS map, never the request's keys.
 * Length caps mirror handleSubmitCounter_ / handleFinishUpload_.
 */
var EDITABLE_FIELDS_BY_TYPE = {
    voice: {
        text_message: { max: 1000, required: false }
    },
    counter: {
        start_date: { date: true, required: true },
        male_name: { max: 40, required: true },
        female_name: { max: 40, required: true },
        title: { max: 120, required: false },
        heart_text: { max: 60, required: false },
        audio_title: { max: 120, required: false },
        text_message: { max: 200, required: false }
    }
};

/**
 * Pure validation core for editVoice — no Spreadsheet/Utilities calls, so the
 * Node test harness can extract and run it directly.
 *
 * Partial-update semantics: a field absent from params stays untouched; a field
 * sent as an empty string clears the cell when the rule allows it and errors
 * when it is required. todayVN is passed in as 'YYYY-MM-DD'.
 *
 * Returns { errors: [message...], updates: { field: cellValue } } with cell
 * values already csvSafe_'d / apostrophe-prefixed, ready for setValue.
 */
function validateEditFields_(type, params, todayVN) {
    if (!Object.prototype.hasOwnProperty.call(EDITABLE_FIELDS_BY_TYPE, type)) {
        return { errors: ['unknown_type'], updates: {} };
    }
    var spec = EDITABLE_FIELDS_BY_TYPE[type];
    var errors = [];
    var updates = {};
    Object.keys(spec).forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(params, field)) return;
        var rule = spec[field];
        var raw = String(params[field] == null ? '' : params[field]).trim();
        if (!raw) {
            if (rule.required) { errors.push(field + ' cannot be empty'); return; }
            updates[field] = '';
            return;
        }
        if (rule.date) {
            // Same three rules as handleSubmitCounter_ — anything can POST here.
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { errors.push('start_date must be YYYY-MM-DD'); return; }
            if (raw > todayVN) { errors.push('start_date cannot be in the future'); return; }
            if (raw < '1900-01-01') { errors.push('start_date is out of range'); return; }
            // Apostrophe-prefixed like submitCounter: without it Sheets casts to
            // a date cell and JSON serialises VN midnight as the previous day.
            updates[field] = "'" + raw;
            return;
        }
        updates[field] = csvSafe_(raw.slice(0, rule.max));
    });
    return { errors: errors, updates: updates };
}

/**
 * POST action=editVoice
 * Identity (all required): phone, order_id, type — type is explicit here,
 * unlike publish/archive: an edit aimed at a counter row that silently landed
 * on the blank-type voice row would corrupt the wrong product.
 *
 * Writes are per-cell, never a row rewrite, so an edit cannot clobber columns
 * it does not know about. Status/slug are deliberately untouched: a staff edit
 * is already reviewed, so a published row stays published.
 */
function handleEditVoice_(e) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
        return jsonOut({ ok: false, error: 'busy, please retry' });
    }
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        var type = String(e.parameter.type || '').trim().toLowerCase();
        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (!type) return jsonOut({ ok: false, error: 'type required' });

        var todayVN = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
        var result = validateEditFields_(type, e.parameter, todayVN);
        if (result.errors.length) return jsonOut({ ok: false, error: result.errors[0] });

        var fields = Object.keys(result.updates);
        if (!fields.length) return jsonOut({ ok: false, error: 'nothing_to_update' });

        var sheet = ensureVoiceSheet_();
        assertSheetWidth_(sheet);
        var found = voiceFindRowByKey_(phone, orderId, type);
        if (!found) return jsonOut({ ok: false, error: 'row_not_found' });

        fields.forEach(function (field) {
            var col = VOICE_SHEET_HEADERS.indexOf(field);
            sheet.getRange(found.rowIdx, col + 1).setValue(result.updates[field]);
        });
        return jsonOut({ ok: true, updated: fields });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    } finally {
        lock.releaseLock();
    }
}

// ============================================================
//  ADMIN MEDIA REPLACEMENT
//  Parameter contract: docs/love-counter-submit-contract.md → "replaceMedia"
// ============================================================

/**
 * The only media slots action=replaceMedia may touch, per row type. Iterated
 * via hasOwnProperty lookup like EDITABLE_FIELDS_BY_TYPE, so an unknown or
 * prototype-key slot fails closed and no slot can name a non-media column.
 *
 * mirrorThumb: the male avatar doubles as the row thumbnail (the contract
 * handleSubmitCounter_ established), so replacing it must keep both pairs in
 * step. removable: only counter audio — audio is optional for a counter, but
 * IS the product for a voice gift, and the images are required by both pages.
 */
var MEDIA_SLOTS_BY_TYPE = {
    voice: {
        image: { fileField: 'image_file_id', urlField: 'image_url', kind: 'image' },
        audio: { fileField: 'audio_file_id', urlField: 'audio_url', kind: 'audio' }
    },
    counter: {
        male: { fileField: 'male_image_file_id', urlField: 'male_image_url', kind: 'image', mirrorThumb: true },
        female: { fileField: 'female_image_file_id', urlField: 'female_image_url', kind: 'image' },
        bg: { fileField: 'bg_file_id', urlField: 'bg_url', kind: 'image' },
        audio: { fileField: 'audio_file_id', urlField: 'audio_url', kind: 'audio', removable: true }
    }
};

/**
 * Pure cell-update map for one media slot — extractable by the Node tests.
 *
 * Audio slots ALWAYS overwrite peaks + audio_duration (blank when the caller
 * sent none): peaks belonging to the previous audio are worse than no peaks,
 * since the page falls back to decorative bars on blank.
 */
function buildMediaCellUpdates_(spec, fileId, url, peaksJson, audioDuration) {
    var updates = {};
    updates[spec.fileField] = fileId;
    updates[spec.urlField] = url;
    if (spec.kind === 'audio') {
        updates.peaks = csvSafe_(String(peaksJson || ''));
        updates.audio_duration = audioDuration || 0;
    }
    if (spec.mirrorThumb) {
        updates.image_file_id = fileId;
        updates.image_url = url;
    }
    return updates;
}

/**
 * POST action=replaceMedia
 * Params: phone, order_id, type, slot, then either remove=1 (removable slots
 * only) or data (base64) + filename + mime (audio; images are always JPEG).
 * Optional for audio: peaks, audio_duration.
 *
 * Old Drive files are never deleted — they are the recovery path. Status and
 * slug are untouched, same staff-is-the-reviewer rule as editVoice.
 */
function handleReplaceMedia_(e) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
        return jsonOut({ ok: false, error: 'busy, please retry' });
    }
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        var type = String(e.parameter.type || '').trim().toLowerCase();
        var slot = String(e.parameter.slot || '').trim().toLowerCase();
        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (!type) return jsonOut({ ok: false, error: 'type required' });

        if (!Object.prototype.hasOwnProperty.call(MEDIA_SLOTS_BY_TYPE, type)) {
            return jsonOut({ ok: false, error: 'unknown_type' });
        }
        var slots = MEDIA_SLOTS_BY_TYPE[type];
        if (!Object.prototype.hasOwnProperty.call(slots, slot)) {
            return jsonOut({ ok: false, error: 'unknown_slot' });
        }
        var spec = slots[slot];

        var isRemove = String(e.parameter.remove || '') === '1';
        if (isRemove && !spec.removable) {
            return jsonOut({ ok: false, error: 'slot_not_removable' });
        }

        // Row lookup BEFORE the Drive save: a bad identity must not leave an
        // orphaned anyone-with-link file in the folder.
        var sheet = ensureVoiceSheet_();
        assertSheetWidth_(sheet);
        var found = voiceFindRowByKey_(phone, orderId, type);
        if (!found) return jsonOut({ ok: false, error: 'row_not_found' });

        var fileId = '';
        var url = '';
        if (!isRemove) {
            var data = String(e.parameter.data || '');
            if (!data) return jsonOut({ ok: false, error: 'data required' });
            var stem = phone + '_' + orderId + '_' + slot;
            if (spec.kind === 'image') {
                var imageFolderId = scriptProp.getProperty('VOICE_IMAGE_FOLDER_ID');
                if (!imageFolderId) return jsonOut({ ok: false, error: 'VOICE_IMAGE_FOLDER_ID not configured' });
                var name = String(e.parameter.filename || '').trim() || (stem + '.jpg');
                var saved = saveImageToDrive_(data, name, imageFolderId);
                fileId = saved.fileId;
                url = saved.url;
            } else {
                var audioFolderId = scriptProp.getProperty('VOICE_AUDIO_FOLDER_ID');
                if (!audioFolderId) return jsonOut({ ok: false, error: 'VOICE_AUDIO_FOLDER_ID not configured' });
                var mime = String(e.parameter.mime || 'audio/mpeg').trim();
                var audioName = String(e.parameter.filename || '').trim() || (stem + '.m4a');
                var blob = Utilities.newBlob(Utilities.base64Decode(data), mime, audioName);
                fileId = DriveApp.getFolderById(audioFolderId).createFile(blob).getId();
                url = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
            }
            try { setAnyoneCanView_(fileId); } catch (permErr) {
                Logger.log('Warning: could not share ' + slot + ': ' + permErr);
            }
        }

        var updates = buildMediaCellUpdates_(
            spec, fileId, url,
            e.parameter.peaks || '',
            parseFloat(e.parameter.audio_duration || '0') || 0
        );
        Object.keys(updates).forEach(function (field) {
            var col = VOICE_SHEET_HEADERS.indexOf(field);
            sheet.getRange(found.rowIdx, col + 1).setValue(updates[field]);
        });
        return jsonOut({ ok: true, slot: slot, file_id: fileId, url: url, removed: isRemove });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    } finally {
        lock.releaseLock();
    }
}

// ============================================================
//  LOVE COUNTER
//  Additive only — nothing above this line changes for voice rows.
//  Parameter contract: docs/love-counter-submit-contract.md
// ============================================================

/**
 * Build a full-width row from a { headerName: value } object.
 *
 * Writers name their fields instead of counting positions. Column order then
 * lives in exactly one place (VOICE_SHEET_HEADERS), which is the drift that
 * silently broke three admin reads when it was allowed to live in two.
 * Unlisted columns are written blank.
 */
function rowFromObject_(obj) {
    return VOICE_SHEET_HEADERS.map(function (h) {
        return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
    });
}

/**
 * Normalise a stored start_date back to 'YYYY-MM-DD'.
 * Apostrophe-prefixed writes come back as a clean string, but a cell edited by
 * hand in the Sheets UI comes back as a Date — resolve that in Vietnam time so
 * it never slips a day.
 */
function toDateString_(v) {
    if (v instanceof Date && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    }
    return String(v == null ? '' : v).trim();
}

/** Save one optional base64 image. Returns { fileId, url } or null when absent. */
function saveCounterImage_(base64Data, filename, fallbackName, folderId) {
    var data = String(base64Data || '');
    if (!data) return null;
    var name = String(filename || '').trim() || fallbackName;
    var result = saveImageToDrive_(data, name, folderId);
    try { setAnyoneCanView_(result.fileId); } catch (permErr) {
        Logger.log('Warning: could not share ' + name + ': ' + permErr);
    }
    return result;
}

/**
 * POST action=submitCounter
 *
 * Required: phone, order_id, start_date, male_name, female_name,
 *           maleData, femaleData
 * Optional: bgData, audioData (+ audioFilename, audioMime, audio_title,
 *           peaks, audio_duration), title, heart_text, text_message
 *
 * Upserts on (phone, order_id, 'counter'). A re-submission resets status to
 * pending for staff review but KEEPS the slug — see below.
 */
function handleSubmitCounter_(e) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
        return jsonOut({ ok: false, error: 'busy, please retry' });
    }
    try {
        var phone = normalizeVNPhone_(e.parameter.phone);
        var orderId = String(e.parameter.order_id || '').trim();
        var startDate = String(e.parameter.start_date || '').trim();
        var maleName = String(e.parameter.male_name || '').trim().slice(0, 40);
        var femaleName = String(e.parameter.female_name || '').trim().slice(0, 40);

        if (!phone) return jsonOut({ ok: false, error: 'phone required' });
        if (!orderId) return jsonOut({ ok: false, error: 'order_id required' });
        if (!maleName || !femaleName) return jsonOut({ ok: false, error: 'both names required' });

        // The form's min/max attributes are a UI affordance, not a guarantee —
        // anything can POST here, so the same rules are enforced again.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return jsonOut({ ok: false, error: 'start_date must be YYYY-MM-DD' });
        }
        var todayVN = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
        if (startDate > todayVN) {
            return jsonOut({ ok: false, error: 'start_date cannot be in the future' });
        }
        if (startDate < '1900-01-01') {
            return jsonOut({ ok: false, error: 'start_date is out of range' });
        }

        var imageFolderId = scriptProp.getProperty('VOICE_IMAGE_FOLDER_ID');
        var audioFolderId = scriptProp.getProperty('VOICE_AUDIO_FOLDER_ID');
        if (!imageFolderId) {
            return jsonOut({ ok: false, error: 'VOICE_IMAGE_FOLDER_ID not configured' });
        }

        var stem = phone + '_' + orderId;
        var male = saveCounterImage_(e.parameter.maleData, e.parameter.maleFilename, stem + '_male.jpg', imageFolderId);
        if (!male) return jsonOut({ ok: false, error: 'male photo required' });
        var female = saveCounterImage_(e.parameter.femaleData, e.parameter.femaleFilename, stem + '_female.jpg', imageFolderId);
        if (!female) return jsonOut({ ok: false, error: 'female photo required' });
        var bg = saveCounterImage_(e.parameter.bgData, e.parameter.bgFilename, stem + '_bg.jpg', imageFolderId);

        // Audio is optional for a counter — the day count is the product.
        var audioFileId = '';
        var audioUrl = '';
        var audioData = e.parameter.audioData || '';
        if (audioData) {
            if (!audioFolderId) return jsonOut({ ok: false, error: 'VOICE_AUDIO_FOLDER_ID not configured' });
            try {
                var audioMime = String(e.parameter.audioMime || 'audio/mpeg').trim();
                var audioName = String(e.parameter.audioFilename || (stem + '.m4a')).trim();
                var audioBlob = Utilities.newBlob(Utilities.base64Decode(audioData), audioMime, audioName);
                audioFileId = DriveApp.getFolderById(audioFolderId).createFile(audioBlob).getId();
                try { setAnyoneCanView_(audioFileId); } catch (_) { }
                audioUrl = 'https://drive.google.com/file/d/' + audioFileId + '/view?usp=sharing';
            } catch (audioErr) {
                return jsonOut({ ok: false, error: 'audio save failed: ' + audioErr });
            }
        }

        var sheet = ensureVoiceSheet_();
        assertSheetWidth_(sheet);
        var existing = voiceFindRowByKey_(phone, orderId, ROW_TYPE_COUNTER);

        // Keep the slug across a re-submission. The QR is printed on a physical
        // bracelet already in the customer's hands, so minting a new slug would
        // permanently brick it. Status still returns to pending so staff review
        // the changed content before it goes back up.
        var iSlug = VOICE_SHEET_HEADERS.indexOf('slug');
        var iPublishedAt = VOICE_SHEET_HEADERS.indexOf('published_at');
        var keptSlug = existing ? String(existing.row[iSlug] || '') : '';
        var keptPublishedAt = existing ? String(existing.row[iPublishedAt] || '') : '';

        var values = rowFromObject_({
            timestamp: new Date().toISOString(),
            // Apostrophe forces text so the leading zero survives.
            phone: "'" + phone,
            order_id: csvSafe_(orderId),
            text_message: csvSafe_(String(e.parameter.text_message || '').slice(0, 200)),
            audio_file_id: audioFileId,
            audio_url: audioUrl,
            // The male avatar doubles as the row thumbnail, so the existing admin
            // card renders counter rows with no admin-side change.
            image_file_id: male.fileId,
            image_url: male.url,
            status: 'pending',
            slug: keptSlug,
            published_at: keptPublishedAt,
            peaks: csvSafe_(String(e.parameter.peaks || '')),
            audio_duration: parseFloat(e.parameter.audio_duration || '0') || 0,
            type: ROW_TYPE_COUNTER,
            // Apostrophe-prefixed for the same reason as phone: without it Sheets
            // casts to a date cell, getValues hands back a Date, and JSON puts
            // Vietnam midnight into the PREVIOUS day in UTC.
            start_date: "'" + startDate,
            male_name: csvSafe_(maleName),
            female_name: csvSafe_(femaleName),
            male_image_file_id: male.fileId,
            male_image_url: male.url,
            female_image_file_id: female.fileId,
            female_image_url: female.url,
            bg_file_id: bg ? bg.fileId : '',
            bg_url: bg ? bg.url : '',
            title: csvSafe_(String(e.parameter.title || '').slice(0, 120)),
            heart_text: csvSafe_(String(e.parameter.heart_text || '').slice(0, 60)),
            audio_title: csvSafe_(String(e.parameter.audio_title || '').slice(0, 120))
        });

        var rowIdx = existing ? existing.rowIdx : sheet.getLastRow() + 1;
        sheet.getRange(rowIdx, 1, 1, VOICE_SHEET_HEADERS.length).setValues([values]);

        try {
            MailApp.sendEmail(
                VOICE_RECIPIENT_EMAIL,
                '[Love Counter] New submission — order ' + orderId,
                'Phone: ' + phone + '\n'
                + 'Order ID: ' + orderId + '\n'
                + 'Couple: ' + maleName + ' & ' + femaleName + '\n'
                + 'Start date: ' + startDate + '\n'
                + 'Has audio: ' + (audioFileId ? 'yes' : 'no') + '\n'
                + 'Admin: https://qr.crushroom.vn/admin#voice\n'
            );
        } catch (mailErr) {
            Logger.log('MailApp failed (quota?): ' + mailErr);
        }

        return jsonOut({ ok: true, rowIndex: rowIdx, updated: !!existing });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    } finally {
        lock.releaseLock();
    }
}

/**
 * GET action=getCounter&id=SLUG
 * Public JSON for a published counter page; not_found otherwise.
 *
 * Fields are listed explicitly rather than echoing the row, so a column added
 * later stays private until it is deliberately exposed here.
 */
function handleGetCounter_(e) {
    try {
        var slug = String(e.parameter.id || '').trim();
        if (!slug) return jsonOut({ ok: false, error: 'id (slug) required' });

        var found = voiceFindRowBySlug_(slug);
        if (!found) return jsonOut({ ok: false, error: 'not_found' });

        // A voice slug must not resolve through the counter endpoint, or the
        // page would render an empty counter for a real voice gift.
        if (rowType_(found.row) !== ROW_TYPE_COUNTER) {
            return jsonOut({ ok: false, error: 'not_found' });
        }

        var iStatus = VOICE_SHEET_HEADERS.indexOf('status');
        if (String(found.row[iStatus]) !== 'published') {
            return jsonOut({ ok: false, error: 'not_found' });
        }

        var obj = {};
        VOICE_SHEET_HEADERS.forEach(function (h, idx) { obj[h] = found.row[idx]; });

        return jsonOut({
            ok: true,
            // Raw YYYY-MM-DD. The page computes the day count client-side, so it
            // keeps ticking over instead of freezing behind a cached render.
            start_date: toDateString_(obj.start_date),
            male_name: obj.male_name,
            female_name: obj.female_name,
            male_image_url: obj.male_image_url,
            male_image_file_id: obj.male_image_file_id,
            female_image_url: obj.female_image_url,
            female_image_file_id: obj.female_image_file_id,
            bg_url: obj.bg_url,
            bg_file_id: obj.bg_file_id,
            title: obj.title,
            heart_text: obj.heart_text,
            text_message: obj.text_message,
            audio_title: obj.audio_title,
            audio_url: obj.audio_url,
            audio_file_id: obj.audio_file_id,
            peaks: obj.peaks || '',
            audio_duration: obj.audio_duration || 0,
            published_at: obj.published_at
        });
    } catch (err) {
        return jsonOut({ ok: false, error: String(err) });
    }
}
