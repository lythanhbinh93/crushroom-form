/**
 * lark-notify.gs — Lark group-bot notification (separate module).
 * Lives in the same Apps Script project as google-apps-script-complete.js; all .gs
 * files share one global scope, so this reads `scriptProp` from the main file.
 * The main doPost calls notifyLark_(...). Stored here as .js for tooling; in the
 * Apps Script editor it is the `lark-notify` script file.
 * One-time: run setLarkConfig_(webhook, appId, appSecret) once from the editor
 * (or set LARK_WEBHOOK_URL / LARK_APP_ID / LARK_APP_SECRET in Project Settings).
 */

// One-time: run from the Apps Script editor to store Lark credentials in Script Properties
// (keeps them out of source/git). Pass the group-bot webhook URL + custom-app id/secret.
function setLarkConfig_(webhookUrl, appId, appSecret) {
    scriptProp.setProperty('LARK_WEBHOOK_URL', webhookUrl);
    scriptProp.setProperty('LARK_APP_ID', appId);
    scriptProp.setProperty('LARK_APP_SECRET', appSecret);
}

// ===== LARK BOT NOTIFICATION (replaces email) =====
// Hybrid: a Lark custom app uploads each photo to get an img_key; the existing group-bot
// webhook posts an interactive card embedding the photos inline (staff can copy/paste them).
// Credentials live in Script Properties (see setLarkConfig_).

const LARK_BASE = 'https://open.larksuite.com';

// Tenant access token (cached ~2h). Refetched automatically once the cache entry expires.
function getLarkTenantToken_() {
    const cache = CacheService.getScriptCache();
    const hit = cache.get('lark_tenant_token');
    if (hit) return hit;
    const res = UrlFetchApp.fetch(LARK_BASE + '/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
            app_id: scriptProp.getProperty('LARK_APP_ID'),
            app_secret: scriptProp.getProperty('LARK_APP_SECRET')
        })
    });
    const j = JSON.parse(res.getContentText());
    if (j.code !== 0) throw new Error('lark token: ' + res.getContentText());
    cache.put('lark_tenant_token', j.tenant_access_token, Math.max(60, (j.expire || 7200) - 120));
    return j.tenant_access_token;
}

// POST a blob to Lark's image API. Returns the parsed JSON (caller checks code).
function uploadLarkImageBlob_(blob, token) {
    const res = UrlFetchApp.fetch(LARK_BASE + '/open-apis/im/v1/images', {
        method: 'post', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token },
        // No contentType: let UrlFetchApp build multipart/form-data (with boundary) from the Blob.
        payload: { image_type: 'message', image: blob }
    });
    return JSON.parse(res.getContentText());
}

// Upload one Drive photo → img_key. Sends the full-resolution original first (so staff get a
// usable photo); if Lark rejects it (e.g. >10MB), retries with Drive's smaller thumbnail.
// Uses DriveApp.getThumbnail() (auth-aware) rather than the public thumbnail URL, since the
// uploaded files are private to the script owner and the unauthenticated URL would return HTML.
function uploadLarkImage_(fileId, token) {
    const file = DriveApp.getFileById(fileId);
    let j = uploadLarkImageBlob_(file.getBlob(), token);
    if (j.code !== 0) {
        const thumb = file.getThumbnail();  // may be null for unsupported types
        if (thumb) j = uploadLarkImageBlob_(thumb, token);
    }
    if (j.code !== 0) throw new Error('lark img: ' + JSON.stringify(j));
    return j.data.image_key;
}

function larkImgEl_(imgKey, alt) {
    return { tag: 'img', img_key: imgKey, alt: { tag: 'plain_text', content: alt } };
}

function larkItemLine_(idx, it) {
    return {
        tag: 'div', text: {
            tag: 'lark_md',
            content: (idx + 1) + '. ' + it.sku + ' — ' + it.name + ' · [Xem Drive](' + it.fileUrl + ')'
        }
    };
}

// Build + send the staff notification card. Whole body in try/catch: a Lark failure is logged
// only and never breaks the upload response. Per-image failure degrades that slot to text + link.
function notifyLark_(phone, items, samePhoto, message) {
    try {
        const webhook = scriptProp.getProperty('LARK_WEBHOOK_URL');
        if (!webhook) { Logger.log('lark: no webhook configured'); return; }
        if (!items || !items.length) return;

        const token = getLarkTenantToken_();
        const elements = [{
            tag: 'div', text: {
                tag: 'lark_md',
                content: '**SĐT:** ' + (phone || '') + '\n**Số slot:** ' + items.length +
                    (samePhoto ? ' · dùng cho ' + items.length + ' slot (1 ảnh)' : '')
            }
        }, { tag: 'hr' }];

        if (samePhoto) {
            // One shared photo: upload + show once, then list every product line.
            try {
                elements.push(larkImgEl_(uploadLarkImage_(items[0].fileId, token), items[0].name || 'ảnh'));
            } catch (e) {
                Logger.log('img fail (same) ' + items[0].fileId + ': ' + e);
            }
            items.forEach(function (it, i) { elements.push(larkItemLine_(i, it)); });
        } else {
            // Distinct photos: one image per slot; on upload failure show the line only.
            items.forEach(function (it, i) {
                try {
                    elements.push(larkImgEl_(uploadLarkImage_(it.fileId, token), it.name || ('slot ' + (i + 1))));
                } catch (e) {
                    Logger.log('img fail ' + it.fileId + ': ' + e);
                }
                elements.push(larkItemLine_(i, it));
            });
        }

        if (message) {
            elements.push({ tag: 'hr' },
                { tag: 'div', text: { tag: 'lark_md', content: '**Ghi chú khách:** ' + message } });
        }

        const card = {
            config: { wide_screen_mode: true },
            header: {
                template: 'blue',
                title: { tag: 'plain_text', content: 'Khách vừa tải ảnh lên' + (phone ? ' · ' + phone : '') }
            },
            elements: elements
        };

        const res = UrlFetchApp.fetch(webhook, {
            method: 'post', contentType: 'application/json', muteHttpExceptions: true,
            payload: JSON.stringify({ msg_type: 'interactive', card: card })
        });
        const j = JSON.parse(res.getContentText());
        if (j.code !== 0) Logger.log('lark post fail: ' + res.getContentText());
    } catch (e) {
        Logger.log('notifyLark_ failed: ' + e);
    }
}
