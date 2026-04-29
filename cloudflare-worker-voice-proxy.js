/**
 * cloudflare-worker-voice-proxy.js — streaming proxy for Drive-hosted voice audio
 * + cached metadata proxy for GAS getVoice
 * + upload proxy: POST /upload-voice-audio (Phase 2.1)
 *
 * Routes:
 *   GET  /voice/<slug>          → cached JSON proxy of GAS getVoice (60min edge TTL)
 *   GET  /<driveFileId>         → streaming Drive audio with CORS + Range support
 *   POST /upload-voice-audio    → service-account upload to Drive resumable session
 *   OPTIONS /upload-voice-audio → CORS preflight for upload route
 *
 * Why:
 *   - Audio: Drive sets CORP: same-site + Content-Disposition: attachment, blocking
 *     <audio> playback. Worker re-streams with CORS + inline disposition.
 *   - Metadata: GAS web apps have 1-2s round-trip even on warm hits. Edge cache
 *     drops repeat-listener load to <200ms.
 *   - Upload: Lifts 35MB GAS doPost ceiling to ~90MB via Drive resumable sessions
 *     authenticated with a service account JWT (no browser-exposed credentials).
 *
 * Required secrets (wrangler secret put):
 *   DRIVE_SA_JSON   — full GCP service account JSON key (stringified)
 *   VOICE_FOLDER_ID — Google Drive folder ID to place uploaded audio
 *
 * Deploy: wrangler deploy
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const GAS_VOICE_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

/** Maximum allowed upload body size (bytes). Cloudflare free tier body cap is 100 MB. */
const MAX_UPLOAD_BYTES = 90 * 1024 * 1024; // 90 MB

/** Accepted audio MIME types for upload. */
const ALLOWED_MIMES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
]);

/**
 * Allowed CORS origins for the upload route (stricter than public audio routes).
 * Shopify storefront origins added defensively; remove if form is never embedded
 * via couplepix.liquid template on these domains.
 */
const UPLOAD_ALLOWED_ORIGINS = [
  'https://crushroom-form.vercel.app',
  // Shopify storefront origins — uncomment when form embedded via couplepix.liquid template.
  'https://crushroom.vn',
  'https://www.crushroom.vn',
];

/** Cache key for the service account access token stored in caches.default. */
const SA_TOKEN_CACHE_KEY = 'https://internal.voice-proxy.workers.dev/__sa-token__';

// ─── Main Router ─────────────────────────────────────────────────────────────

export default {
  /**
   * @param {Request} req
   * @param {object} env  — Cloudflare Worker env bindings (secrets, vars)
   */
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Upload route — must be handled before the GET-only gate below.
    if (path === '/upload-voice-audio') {
      if (req.method === 'OPTIONS') return uploadPreflight(req);
      if (req.method === 'POST') return handleUpload(req, url, env);
      return new Response('method not allowed', { status: 405 });
    }

    // Existing routes (GET / HEAD only).
    if (req.method === 'OPTIONS') return preflight();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    // Metadata route: /voice/<slug>
    if (path.startsWith('/voice/')) {
      return handleVoiceMeta(req, path.slice('/voice/'.length));
    }

    // Audio route: /<driveFileId>
    return handleAudio(req, path.slice(1));
  },
};

// ─── Upload Route ─────────────────────────────────────────────────────────────

/**
 * POST /upload-voice-audio
 * Query params:
 *   filename — desired Drive filename (sanitized server-side; default: voice_<ts>.mp3)
 *   mime     — audio MIME type (default: audio/mpeg)
 *
 * Body: raw audio bytes (Content-Type: audio/mpeg|mp4|aac|webm|ogg)
 *
 * Returns: { ok: true, driveFileId, mime, size, durationMs }
 *       or { ok: false, error } with appropriate HTTP status.
 */
async function handleUpload(req, url, env) {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  // ── CORS origin check ──────────────────────────────────────────────────────
  const origin = req.headers.get('origin') || '';
  if (!isUploadOriginAllowed(origin)) {
    return uploadJson({ ok: false, error: 'origin_forbidden' }, 403, origin);
  }

  // ── Body size guard ────────────────────────────────────────────────────────
  // Content-Length is best-effort; enforce hard cap via ArrayBuffer read below.
  const clHeader = req.headers.get('content-length');
  if (clHeader && parseInt(clHeader, 10) > MAX_UPLOAD_BYTES) {
    return uploadJson({ ok: false, error: 'payload_too_large' }, 413, origin);
  }

  // ── MIME validation (query param + magic-byte sniff) ─────────────────────
  const rawMime = (url.searchParams.get('mime') || req.headers.get('content-type') || 'audio/mpeg')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_MIMES.has(rawMime)) {
    return uploadJson({ ok: false, error: 'unsupported_mime', mime: rawMime }, 400, origin);
  }

  // ── Filename sanitization ──────────────────────────────────────────────────
  const rawFilename = url.searchParams.get('filename') || `voice_${Date.now()}.mp3`;
  const filename = sanitizeFilename(rawFilename);

  // ── Secrets presence check ─────────────────────────────────────────────────
  if (!env.DRIVE_SA_JSON || !env.VOICE_FOLDER_ID) {
    console.error(`[${requestId}] missing worker secrets DRIVE_SA_JSON or VOICE_FOLDER_ID`);
    return uploadJson({ ok: false, error: 'worker_misconfigured' }, 500, origin);
  }

  // ── Validate Content-Length pre-stream; reject if missing or oversized ─────
  const clInt = clHeader ? parseInt(clHeader, 10) : null;
  if (!clInt || clInt <= 0) {
    return uploadJson({ ok: false, error: 'content_length_required' }, 411, origin);
  }
  // (already checked clHeader > MAX_UPLOAD_BYTES above, but re-guard after parse)
  if (clInt > MAX_UPLOAD_BYTES) {
    return uploadJson({ ok: false, error: 'payload_too_large' }, 413, origin);
  }

  // ── Read first chunk for magic-byte MIME sniff, then stream remainder ──────
  //
  // KNOWN TRADE-OFF (H3): Full streaming to Drive would require a TransformStream
  // to prepend the already-read first chunk back into the body. The single-401-retry
  // logic also depends on a replayable body. We therefore buffer the full body here.
  // For files ≤ ~10 MB this is safe on Workers free tier (128 MB limit + V8 overhead).
  // For 90 MB uploads on paid tier (256 MB limit) it remains within bounds under light
  // concurrency. Full streaming is deferred to a dedicated refactor once the 401-retry
  // strategy is redesigned to not need body replay.
  let bodyBuffer;
  try {
    bodyBuffer = await req.arrayBuffer();
  } catch (err) {
    return uploadJson({ ok: false, error: 'body_read_error' }, 400, origin);
  }

  if (bodyBuffer.byteLength > MAX_UPLOAD_BYTES) {
    return uploadJson({ ok: false, error: 'payload_too_large' }, 413, origin);
  }
  if (bodyBuffer.byteLength === 0) {
    return uploadJson({ ok: false, error: 'empty_body' }, 400, origin);
  }

  // ── Magic-byte MIME sniff (defense-in-depth against mislabelled uploads) ───
  const sniffed = sniffAudioMime(new Uint8Array(bodyBuffer, 0, Math.min(16, bodyBuffer.byteLength)));
  if (sniffed && sniffed !== rawMime) {
    return uploadJson(
      { ok: false, error: 'mime_mismatch', declared: rawMime, detected: sniffed },
      400,
      origin
    );
  }

  // ── Service account token (cached 50min) ───────────────────────────────────
  let accessToken;
  try {
    accessToken = await getAccessToken(env);
  } catch (err) {
    console.error(`[${requestId}] getAccessToken failed:`, err.message);
    return uploadJson({ ok: false, error: 'auth_failed' }, 502, origin);
  }

  // ── Drive upload (with single 401 retry) ──────────────────────────────────
  let driveFileId;
  try {
    driveFileId = await uploadToDrive({
      accessToken,
      env,
      filename,
      mime: rawMime,
      body: bodyBuffer,
      requestId,
      // On 401, clear token cache and retry once with a fresh token.
      onTokenExpired: async () => {
        await invalidateTokenCache();
        return getAccessToken(env);
      },
    });
  } catch (err) {
    console.error(`[${requestId}] uploadToDrive failed:`, err.message);
    const status = err.driveStatus >= 500 ? 502 : (err.driveStatus || 502);
    return uploadJson({ ok: false, error: err.driveError || 'drive_upstream' }, status, origin);
  }

  const durationMs = Date.now() - t0;
  return uploadJson(
    { ok: true, driveFileId, mime: rawMime, size: bodyBuffer.byteLength, durationMs },
    200,
    origin
  );
}

/**
 * OPTIONS /upload-voice-audio — CORS preflight.
 * Returns 204 with upload-specific CORS headers.
 */
function uploadPreflight(req) {
  const origin = req.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Content-Length',
    'Access-Control-Max-Age': '86400',
    // H1: Vary: Origin prevents CDN from serving a preflight cached for one origin to another.
    // Critical for long-lived (86400s) preflight caches.
    'Vary': 'Origin',
  };
  if (isUploadOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return new Response(null, { status: 204, headers });
}

// ─── Drive Upload Logic ───────────────────────────────────────────────────────

/**
 * Opens a Drive resumable upload session and PUTs all bytes in a single request.
 *
 * @param {object} opts
 * @param {string} opts.accessToken
 * @param {object} opts.env
 * @param {string} opts.filename
 * @param {string} opts.mime
 * @param {ArrayBuffer} opts.body
 * @param {string} opts.requestId
 * @param {Function} opts.onTokenExpired — async; returns a fresh access token
 * @returns {Promise<string>} Drive file ID
 */
async function uploadToDrive({ accessToken, env, filename, mime, body, requestId, onTokenExpired }) {
  let token = accessToken;

  for (let attempt = 0; attempt <= 1; attempt++) {
    // Step 1: initiate resumable session
    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,mimeType,size',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mime,
          'X-Upload-Content-Length': String(body.byteLength),
        },
        body: JSON.stringify({
          name: filename,
          mimeType: mime,
          parents: [env.VOICE_FOLDER_ID],
        }),
      }
    );

    if (initRes.status === 401 && attempt === 0) {
      // Token expired mid-flight — refresh and retry.
      token = await onTokenExpired();
      continue;
    }

    if (!initRes.ok) {
      const errText = await initRes.text().catch(() => '');
      console.error(`[${requestId}] Drive init session ${initRes.status}: ${errText}`);
      const e = new Error('drive_init_failed');
      e.driveStatus = initRes.status;
      e.driveError = initRes.status >= 500 ? 'drive_upstream' : 'drive_init_failed';
      throw e;
    }

    const sessionUrl = initRes.headers.get('location');
    if (!sessionUrl) {
      const e = new Error('drive_no_session_url');
      e.driveStatus = 502;
      e.driveError = 'drive_upstream';
      throw e;
    }

    // Step 2: PUT all bytes to session URL.
    const putRes = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mime,
        'Content-Length': String(body.byteLength),
      },
      body: body,
    });

    if (putRes.status === 401 && attempt === 0) {
      token = await onTokenExpired();
      continue;
    }

    // Drive returns 200 or 201 on completion.
    if (putRes.status !== 200 && putRes.status !== 201) {
      const errText = await putRes.text().catch(() => '');
      console.error(`[${requestId}] Drive PUT ${putRes.status}: ${errText}`);
      const e = new Error('drive_put_failed');
      e.driveStatus = putRes.status;
      e.driveError = putRes.status >= 500 ? 'drive_upstream' : 'drive_put_failed';
      throw e;
    }

    const data = await putRes.json();
    if (!data.id) {
      const e = new Error('drive_no_file_id');
      e.driveStatus = 502;
      e.driveError = 'drive_upstream';
      throw e;
    }

    return data.id;
  }

  // Both attempts exhausted (should not normally reach here).
  const e = new Error('drive_auth_retry_exhausted');
  e.driveStatus = 502;
  e.driveError = 'drive_upstream';
  throw e;
}

// ─── Service Account Token Cache ─────────────────────────────────────────────

/**
 * Returns a valid Google access token for the service account.
 * Checks caches.default first (50min TTL). On miss, mints a new JWT,
 * exchanges it for a token, and stores it in the cache.
 *
 * @param {object} env — Worker env with DRIVE_SA_JSON secret
 * @returns {Promise<string>} access_token
 */
async function getAccessToken(env) {
  const cache = caches.default;
  const cacheReq = new Request(SA_TOKEN_CACHE_KEY, { method: 'GET' });

  const cached = await cache.match(cacheReq);
  if (cached) {
    const { access_token } = await cached.json();
    return access_token;
  }

  const sa = JSON.parse(env.DRIVE_SA_JSON);
  const accessToken = await mintServiceAccountToken(sa);

  // Cache for 50 minutes (3000 s). Google tokens last 1h; 50min gives 10min margin.
  const toCache = new Response(JSON.stringify({ access_token: accessToken }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3000',
    },
  });
  await cache.put(cacheReq, toCache);

  return accessToken;
}

/**
 * Invalidates the cached service account token so the next call to
 * getAccessToken() mints a fresh one.
 */
async function invalidateTokenCache() {
  const cache = caches.default;
  await cache.delete(new Request(SA_TOKEN_CACHE_KEY, { method: 'GET' }));
}

// ─── JWT / OAuth2 ─────────────────────────────────────────────────────────────

/**
 * Mints a Google OAuth2 access token for the given service account using
 * RS256 JWT assertion (no external library — crypto.subtle only).
 *
 * @param {object} sa — parsed service account JSON key
 * @returns {Promise<string>} access_token
 */
async function mintServiceAccountToken(sa) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp,
    })
  );

  const signingInput = `${header}.${claim}`;
  const privateKey = await importRsaPrivateKey(sa.private_key);
  const signatureBytes = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const signature = b64urlBytes(new Uint8Array(signatureBytes));
  const assertion = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(`oauth2 token exchange failed ${tokenRes.status}: ${errText}`);
  }

  const { access_token } = await tokenRes.json();
  if (!access_token) throw new Error('oauth2 response missing access_token');
  return access_token;
}

/**
 * Imports a PEM-encoded RSA private key for use with crypto.subtle.
 *
 * @param {string} pem — PKCS8 PEM string (-----BEGIN PRIVATE KEY-----)
 * @returns {Promise<CryptoKey>}
 */
async function importRsaPrivateKey(pem) {
  // Strip PEM armor and decode base64 to DER bytes.
  const der = Uint8Array.from(
    atob(
      pem
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s+/g, '')
    ),
    (c) => c.charCodeAt(0)
  );

  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ─── CORS Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if origin is allowed for the upload route.
 * Accepts exact matches in UPLOAD_ALLOWED_ORIGINS and localhost on any port.
 *
 * @param {string} origin
 * @returns {boolean}
 */
function isUploadOriginAllowed(origin) {
  if (UPLOAD_ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow localhost on any port for local dev.
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

/**
 * Builds a JSON response with upload-route CORS headers.
 * Always echoes Origin back when allowed; omits header when forbidden.
 *
 * @param {object} body
 * @param {number} status
 * @param {string} origin
 * @returns {Response}
 */
function uploadJson(body, status, origin) {
  const headers = {
    'Content-Type': 'application/json',
    // H1: Vary: Origin prevents any caching layer from serving a response built for
    // one origin to a different origin (e.g. localhost:5173 vs localhost:3000 in dev).
    'Vary': 'Origin',
  };
  if (isUploadOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Content-Length';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

// ─── Magic-byte MIME Sniff ────────────────────────────────────────────────────

/**
 * Sniffs the audio MIME type from the first 16 bytes of a body.
 * Returns the detected MIME string, or null if not recognised.
 *
 * Magic byte references:
 *   audio/mpeg  — FF Ex | FF Fx (sync word), or 49 44 33 (ID3 tag)
 *   audio/mp4   — bytes 4-7 = 66 74 79 70 ('ftyp')
 *   audio/aac   — FF F1 | FF F9 (ADTS sync)
 *   audio/webm  — 1A 45 DF A3 (EBML header)
 *   audio/ogg   — 4F 67 67 53 ('OggS')
 *
 * @param {Uint8Array} bytes — first ≤16 bytes of the upload body
 * @returns {string|null}
 */
function sniffAudioMime(bytes) {
  if (!bytes || bytes.length < 2) return null;

  // MP3: ID3 tag header or MPEG sync word (FF Ex / FF Fx)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes.length >= 3 && bytes[2] === 0x33) {
    return 'audio/mpeg'; // ID3v2 tag
  }
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
    // MPEG sync — distinguish AAC ADTS (FF F1 / FF F9) from MP3
    const layer = (bytes[1] >> 1) & 0x03;
    if (layer === 0 && (bytes[1] === 0xF1 || bytes[1] === 0xF9)) {
      return 'audio/aac';
    }
    return 'audio/mpeg';
  }

  // M4A/MP4: bytes 4-7 = 'ftyp'
  if (bytes.length >= 8 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'audio/mp4';
  }

  // WebM: EBML magic 1A 45 DF A3
  if (bytes.length >= 4 &&
      bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    return 'audio/webm';
  }

  // OGG: 'OggS' = 4F 67 67 53
  if (bytes.length >= 4 &&
      bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }

  return null; // Unrecognised — pass through without blocking (permissive sniff)
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Sanitizes a filename for Drive:
 * - Strips path separators (/ \)
 * - Truncates to 200 chars
 * - Falls back to a timestamp-based name if empty after stripping
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  const stripped = name.replace(/[/\\]/g, '').trim();
  if (!stripped) return `voice_${Date.now()}.mp3`;
  return stripped.slice(0, 200);
}

/**
 * Base64url-encodes a UTF-8 string.
 * @param {string} str
 * @returns {string}
 */
function b64url(str) {
  return b64urlBytes(new TextEncoder().encode(str));
}

/**
 * Base64url-encodes a Uint8Array.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function b64urlBytes(bytes) {
  // btoa works on binary strings; Workers runtime has btoa globally.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Existing Routes (unchanged) ─────────────────────────────────────────────

async function handleVoiceMeta(req, slug) {
  if (!/^[\w-]{6,16}$/.test(slug)) {
    return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Explicit Cache API: more reliable than cf.cacheTtl for GAS responses
  // (GAS 302-redirects to session-token URLs which break cf-key caching).
  const cache = caches.default;
  const cacheKey = new Request(`https://voice-proxy.crushroom.workers.dev/__cache__/voice-meta/${slug}`, {
    method: 'GET',
  });

  let cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstream = await fetch(
    `${GAS_VOICE_URL}?action=getVoice&id=${encodeURIComponent(slug)}`,
    { method: 'GET', redirect: 'follow' }
  );
  const body = await upstream.text();

  const cacheHeaders = new Headers({
    'Content-Type': 'application/json',
    // Edge cache 1h. Browser cache 10min — repeat visits skip even the edge.
    'Cache-Control': 'public, max-age=600, s-maxage=3600',
  });
  const toCache = new Response(body, { status: upstream.status, headers: cacheHeaders });
  // Only cache 200 responses to avoid persisting transient errors.
  if (upstream.status === 200) {
    await cache.put(cacheKey, toCache.clone());
  }

  const respHeaders = new Headers(cacheHeaders);
  respHeaders.set('X-Cache', 'MISS');
  Object.entries(corsHeaders()).forEach(([k, v]) => respHeaders.set(k, v));
  return new Response(body, { status: upstream.status, headers: respHeaders });
}

async function handleAudio(req, fileId) {
  if (!/^[\w-]{20,}$/.test(fileId)) {
    return new Response('bad id', { status: 400, headers: corsHeaders() });
  }

  // `uc?export=media` returns raw media bytes (no virus-scan interstitial prep).
  // Voice files are <5 MB.
  const driveUrl = `https://drive.google.com/uc?export=media&id=${fileId}`;
  const range = req.headers.get('range');

  // CF edge cache: keyed by file ID + Range. Content is immutable.
  const upstream = await fetch(driveUrl, {
    method: req.method,
    headers: range ? { Range: range } : {},
    redirect: 'follow',
    cf: {
      cacheTtl: 86400,
      cacheEverything: true,
      cacheKey: `voice-proxy:${fileId}${range ? ':' + range : ''}`,
    },
  });

  const headers = new Headers();
  for (const k of ['content-type', 'content-length', 'content-range', 'etag', 'last-modified', 'accept-ranges']) {
    const v = upstream.headers.get(k);
    if (v) headers.set(k, v);
  }
  if (!headers.has('accept-ranges')) headers.set('Accept-Ranges', 'bytes');
  if (!headers.has('content-type')) headers.set('Content-Type', 'audio/mpeg');
  headers.set('Content-Disposition', 'inline');
  // File ID maps 1:1 to immutable content → safe to cache aggressively.
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

  return new Response(upstream.body, { status: upstream.status, headers });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };
}

function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
