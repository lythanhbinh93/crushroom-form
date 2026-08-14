/**
 * cloudflare-worker-voice-proxy.js — streaming proxy for Drive-hosted voice audio
 * + cached metadata proxy for GAS getVoice.
 *
 * Routes:
 *   GET /voice/<slug>     → cached JSON proxy of GAS getVoice (60min edge TTL)
 *   GET /gift/<slug>      → same, for GAS getGift (link/image/video gifts)
 *   GET /admin/list       → cached JSON proxy of GAS listVoice for the admin
 *                           voice tab (serve-cached + background revalidate;
 *                           ?fresh=1 bypasses and repopulates)
 *   POST /video/create-session → open a Drive resumable-upload session on the
 *                           shop account (browser→Drive is CORS-blocked, and
 *                           GAS base64 caps at ~35MB — this relay is how a
 *                           customer's ≤500MB video reaches the shop Drive)
 *   POST /video/upload-chunk   → relay one 8MB slice into the session
 *   POST /video/upload-status  → resync the next offset after a network drop
 *   GET /<driveFileId>    → streaming Drive audio with CORS + Range support
 *
 * Why:
 *   - Audio: Drive sets CORP: same-site + Content-Disposition: attachment, blocking
 *     <audio> playback. Worker re-streams with CORS + inline disposition.
 *   - Metadata: GAS web apps have 1-2s round-trip even on warm hits (and
 *     random 8-18s spikes). Edge cache drops repeat loads to <200ms.
 *
 * Deploy: wrangler deploy
 */

const GAS_VOICE_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return preflight();

    const url = new URL(req.url);
    const path = url.pathname;

    // Video upload relay — the only POST surface on this worker.
    if (path.startsWith('/video/')) {
      if (req.method !== 'POST') {
        return videoJson(405, { ok: false, error: 'method not allowed' });
      }
      return handleVideoRelay(path, url, req, env);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    // Metadata routes: /voice/<slug> (voice gifts), /gift/<slug> (link/image)
    if (path.startsWith('/voice/')) {
      return handleGasMeta(path.slice('/voice/'.length), 'getVoice', 'voice-meta2');
    }
    if (path.startsWith('/gift/')) {
      return handleGasMeta(path.slice('/gift/'.length), 'getGift', 'gift-meta1');
    }

    // Admin list route: /admin/list
    if (path === '/admin/list') {
      return handleAdminList(url, ctx);
    }

    // Audio route: /<driveFileId>
    return handleAudio(req, path.slice(1));
  },
};

// ------------------------------------------------------------------
// /admin/list — cached listVoice for the admin voice tab
// ------------------------------------------------------------------

const ADMIN_LIST_STATUSES = ['pending', 'published', 'archived', 'all'];
const ADMIN_LIST_TYPES = ['voice', 'counter', 'all'];
// Age (seconds) past which a served cache entry also triggers a background
// refresh. Small enough that staff browsing sees near-live data; within the
// window a burst of tab switches costs zero GAS calls. (Past it, concurrent
// hits can each spawn a refresh until the first cache.put lands — harmless
// at this operator count.)
const ADMIN_LIST_REVALIDATE_AGE_S = 15;

/**
 * Pure routing decision for /admin/list — no Worker APIs, so the Node test
 * suite extracts and runs it directly.
 *
 * params: { status, type, fresh }; cachedAgeSeconds: null when no cache entry.
 * Returns { error } for bad input, else { status, type, serveCache,
 * fetchUpstream, background } — background=true means the upstream fetch runs
 * via waitUntil AFTER the cached copy is served.
 */
function adminListPlan(params, cachedAgeSeconds) {
  const status = params.status || 'pending';
  const type = params.type || 'all';
  if (ADMIN_LIST_STATUSES.indexOf(status) === -1) return { error: 'bad status' };
  if (ADMIN_LIST_TYPES.indexOf(type) === -1) return { error: 'bad type' };
  if (params.fresh === '1' || cachedAgeSeconds === null) {
    return { status, type, serveCache: false, fetchUpstream: true, background: false };
  }
  return {
    status, type, serveCache: true,
    fetchUpstream: cachedAgeSeconds > ADMIN_LIST_REVALIDATE_AGE_S,
    background: true,
  };
}

async function handleAdminList(url, ctx) {
  const params = {
    status: url.searchParams.get('status') || '',
    type: url.searchParams.get('type') || '',
    fresh: url.searchParams.get('fresh') || '',
  };

  const probe = adminListPlan(params, null);
  if (probe.error) {
    return new Response(JSON.stringify({ ok: false, error: probe.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://voice-proxy.crushroom.workers.dev/__cache__/admin-list/${probe.status}/${probe.type}`,
    { method: 'GET' }
  );

  const cached = params.fresh === '1' ? null : await cache.match(cacheKey);
  const ageS = cached
    ? (Date.now() - Number(cached.headers.get('X-Cached-At') || 0)) / 1000
    : null;
  const plan = adminListPlan(params, ageS);

  const refresh = async () => {
    const upstreamUrl = `${GAS_VOICE_URL}?action=listVoice&status=${plan.status}` +
      (plan.type !== 'all' ? `&type=${plan.type}` : '');
    const upstream = await fetchGasWithRetry(upstreamUrl, 3);
    const body = upstream.body;
    // Cache only parseable ok:true JSON — GAS transiently serves HTML 404
    // interstitials with status 200, and persisting one would blank the tab
    // for every operator until eviction.
    let okJson = false;
    if (upstream.status === 200) {
      try { okJson = JSON.parse(body).ok === true; } catch (_) { /* not JSON */ }
    }
    if (okJson) {
      await cache.put(cacheKey, new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Edge retention only; the worker's age logic governs freshness.
          'Cache-Control': 'public, s-maxage=600',
          'X-Cached-At': String(Date.now()),
        },
      }));
    }
    return { body, status: upstream.status };
  };

  // Browser must always re-ask the worker (it is fast); freshness lives at
  // the edge so a fresh=1 mutation bust is visible to every operator.
  const clientHeaders = () => new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...corsHeaders(),
  });

  if (plan.serveCache) {
    if (plan.fetchUpstream) ctx.waitUntil(refresh());
    const headers = clientHeaders();
    headers.set('X-Cache', 'HIT');
    headers.set('X-Cache-Age', String(Math.round(ageS)));
    return new Response(cached.body, { status: 200, headers });
  }

  // Structured JSON + CORS even when GAS itself is unreachable — an
  // unhandled throw would surface as a CF 1101 page without CORS headers.
  try {
    const fresh = await refresh();
    const headers = clientHeaders();
    headers.set('X-Cache', 'MISS');
    return new Response(fresh.body, { status: fresh.status, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'upstream fetch failed' }), {
      status: 502,
      headers: clientHeaders(),
    });
  }
}

/**
 * GAS transiently serves an HTML interstitial WITH HTTP 200 several times a
 * day (seen thrice on 2026-08-12 alone). The flap is per-request, so retrying
 * usually lands on a healthy instance. Any parseable JSON — including a real
 * {ok:false,"not_found"} — returns immediately; only non-JSON retries.
 * Returns { body, status } of the last attempt.
 */
async function fetchGasWithRetry(url, tries) {
  let last = { body: '', status: 502 };
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { redirect: 'follow' });
    const body = await r.text();
    last = { body, status: r.status };
    if (r.status === 200) {
      try { JSON.parse(body); return last; } catch (_) { /* interstitial — retry */ }
    }
    if (i < tries - 1) await new Promise(function (res) { setTimeout(res, 350); });
  }
  return last;
}

/**
 * Shared cached-metadata proxy for the GAS read-by-slug endpoints
 * (getVoice → /voice/, getGift → /gift/).
 *
 * Explicit Cache API: more reliable than cf.cacheTtl for GAS responses
 * (GAS 302-redirects to session-token URLs which break cf-key caching).
 * Namespaces are versioned: v1 cached ANY HTTP-200 body, and GAS answers
 * HTTP 200 even for {ok:false,"not_found"} — so a QR scanned minutes
 * before publish poisoned the edge (1h) and the phone (10min) with
 * not_found and the printed link looked dead. Bumping a namespace orphans
 * every old entry on deploy; good entries re-warm on first hit.
 */
async function handleGasMeta(slug, action, namespace) {
  if (!/^[\w-]{6,16}$/.test(slug)) {
    return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://voice-proxy.crushroom.workers.dev/__cache__/${namespace}/${slug}`, {
    method: 'GET',
  });

  let cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Cache', 'HIT');
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
    return new Response(cached.body, { status: cached.status, headers });
  }

  const upstream = await fetchGasWithRetry(
    `${GAS_VOICE_URL}?action=${action}&id=${encodeURIComponent(slug)}`, 3);
  const body = upstream.body;

  // Cache ONLY a parseable {ok:true} payload. HTTP status is useless as a
  // gate here (see namespace note above), and errors must stay uncached so
  // publish → scan works the moment the row goes live.
  let okJson = false;
  if (upstream.status === 200) {
    try { okJson = JSON.parse(body).ok === true; } catch (_) { /* not JSON */ }
  }

  if (okJson) {
    await cache.put(cacheKey, new Response(body, {
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/json',
        // Edge cache 1h. Browser cache 10min — repeat visits skip even the edge.
        'Cache-Control': 'public, max-age=600, s-maxage=3600',
      }),
    }));
  }

  const respHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': okJson ? 'public, max-age=600, s-maxage=3600' : 'no-store',
  });
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

// ------------------------------------------------------------------
// /video/* — chunked upload relay into a Drive resumable session
//
// The browser slices the customer's video into 8MB chunks and POSTs them
// here; each is relayed into a Drive resumable-upload session opened on the
// shop's own Google account (OAuth refresh token in secrets, drive.file
// scope — this app can only touch files it created). The session URI Drive
// mints is itself the upload capability: chunk PUTs need no auth header, so
// only create-session and the final permission call spend a token grant.
// ------------------------------------------------------------------

const VIDEO_MAX_BYTES = 524288000; // 500MB — also enforced client-side
const VIDEO_CHUNK_MAX = 33554432;  // sanity cap per relay request (client sends 8MB)
const DRIVE_CHUNK_UNIT = 262144;   // Drive requires non-final chunks in 256KiB multiples
const DRIVE_UPLOAD_PREFIX = 'https://www.googleapis.com/upload/drive/v3/files';

const VIDEO_EXT_BY_MIME = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/3gpp': '3gp', 'video/x-msvideo': 'avi',
};

/**
 * Validation + Drive file naming for create-session. Pure — extracted by the
 * Node tests. Follows the canonical <phone>_<order>_<slot>.<ext> Drive naming
 * the GAS handlers use, so CS can find a video by customer phone.
 */
function videoSessionPlan(params) {
  const digits = String((params && params.phone) || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { error: 'phone required' };
  const order = String((params && params.order) || '').trim().replace(/[^\w-]/g, '').slice(0, 40);
  if (!order) return { error: 'order required' };
  const size = Number((params && params.size) || 0);
  if (!Number.isInteger(size) || size <= 0 || size > VIDEO_MAX_BYTES) return { error: 'bad size' };
  const mime = String((params && params.mime) || '').toLowerCase();
  if (mime.indexOf('video/') !== 0) return { error: 'bad mime' };
  const ext = VIDEO_EXT_BY_MIME[mime] || 'mp4';
  return { name: digits + '_' + order + '_video.' + ext, size: size, mime: mime };
}

/**
 * Validation + Content-Range for one relayed chunk. Pure — extracted by the
 * Node tests. The session prefix check is a security boundary: the client
 * echoes the session URI back per chunk, and without the check this route
 * would relay arbitrary bodies to arbitrary hosts.
 */
function videoChunkPlan(p) {
  const session = String((p && p.session) || '');
  if (session.indexOf(DRIVE_UPLOAD_PREFIX) !== 0 || session.length > 2048) {
    return { error: 'bad session' };
  }
  const offset = Number(p.offset), total = Number(p.total), len = Number(p.len);
  if (!Number.isInteger(offset) || offset < 0) return { error: 'bad offset' };
  if (!Number.isInteger(total) || total <= 0 || total > VIDEO_MAX_BYTES) return { error: 'bad total' };
  if (!Number.isInteger(len) || len <= 0 || len > VIDEO_CHUNK_MAX) return { error: 'bad chunk' };
  if (offset + len > total) return { error: 'chunk past end' };
  const final = offset + len === total;
  if (!final && len % DRIVE_CHUNK_UNIT !== 0) return { error: 'chunk not 256KiB-aligned' };
  return {
    contentRange: 'bytes ' + offset + '-' + (offset + len - 1) + '/' + total,
    final: final,
  };
}

/**
 * Next offset from a Drive 308 Range header ("bytes=0-8388607" → 8388608).
 * null when Drive has persisted nothing yet. Pure — extracted by the tests.
 */
function parseDriveRange(rangeHeader) {
  const m = /bytes=\d+-(\d+)/.exec(String(rangeHeader || ''));
  return m ? Number(m[1]) + 1 : null;
}

async function handleVideoRelay(path, url, req, env) {
  try {
    if (path === '/video/create-session') return await videoCreateSession(req, env);
    if (path === '/video/upload-chunk') return await videoUploadChunk(url, req, env);
    if (path === '/video/upload-status') return await videoUploadStatus(url, req, env);
    return videoJson(404, { ok: false, error: 'not found' });
  } catch (err) {
    // Structured JSON + CORS even on an unexpected throw — a CF 1101 page
    // has no CORS headers and the form would see an opaque network error.
    return videoJson(502, { ok: false, error: 'relay error' });
  }
}

async function videoCreateSession(req, env) {
  let params;
  try { params = await req.json(); } catch (_) { return videoJson(400, { ok: false, error: 'bad json' }); }
  const plan = videoSessionPlan(params);
  if (plan.error) return videoJson(400, { ok: false, error: plan.error });
  if (!env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return videoJson(503, { ok: false, error: 'upload not configured' });
  }

  const token = await driveAccessToken(env);
  const meta = { name: plan.name, mimeType: plan.mime };
  if (env.DRIVE_VIDEO_FOLDER_ID) meta.parents = [env.DRIVE_VIDEO_FOLDER_ID];

  const r = await fetch(DRIVE_UPLOAD_PREFIX + '?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': plan.mime,
      'X-Upload-Content-Length': String(plan.size),
    },
    body: JSON.stringify(meta),
  });
  if (!r.ok) return videoJson(502, { ok: false, error: 'drive session failed (' + r.status + ')' });
  const session = r.headers.get('Location') || '';
  if (session.indexOf(DRIVE_UPLOAD_PREFIX) !== 0) {
    return videoJson(502, { ok: false, error: 'drive session missing' });
  }
  return videoJson(200, { ok: true, session: session });
}

async function videoUploadChunk(url, req, env) {
  const session = req.headers.get('X-Session') || '';
  const buf = await req.arrayBuffer();
  const plan = videoChunkPlan({
    session: session,
    offset: Number(url.searchParams.get('offset')),
    total: Number(url.searchParams.get('total')),
    len: buf.byteLength,
  });
  if (plan.error) return videoJson(400, { ok: false, error: plan.error });

  // Resumable-session PUTs are authorized by the session URI itself.
  const r = await fetch(session, {
    method: 'PUT',
    headers: { 'Content-Range': plan.contentRange },
    body: buf,
  });
  return videoRelayResult(r, env, Number(url.searchParams.get('offset')) + buf.byteLength);
}

async function videoUploadStatus(url, req, env) {
  const session = req.headers.get('X-Session') || '';
  const total = Number(url.searchParams.get('total'));
  if (session.indexOf(DRIVE_UPLOAD_PREFIX) !== 0 || session.length > 2048) {
    return videoJson(400, { ok: false, error: 'bad session' });
  }
  if (!Number.isInteger(total) || total <= 0 || total > VIDEO_MAX_BYTES) {
    return videoJson(400, { ok: false, error: 'bad total' });
  }
  const r = await fetch(session, {
    method: 'PUT',
    headers: { 'Content-Range': 'bytes */' + total },
  });
  return videoRelayResult(r, env, 0);
}

/** Shared 308/200 handling for chunk relays and status probes. */
async function videoRelayResult(r, env, fallbackNext) {
  if (r.status === 308) {
    const next = parseDriveRange(r.headers.get('Range'));
    return videoJson(200, { ok: true, done: false, next: next === null ? fallbackNext : next });
  }
  if (r.status === 200 || r.status === 201) {
    let fileId = '';
    try { fileId = (await r.json()).id || ''; } catch (_) { /* no body */ }
    if (!fileId) return videoJson(502, { ok: false, error: 'drive finalize missing id' });
    const shared = await shareFileAnyoneReader(env, fileId);
    // shared:false still returns the id — the staff publish gate will catch a
    // video that won't embed, and CS can fix sharing in Drive by hand.
    return videoJson(200, { ok: true, done: true, fileId: fileId, shared: shared });
  }
  return videoJson(502, { ok: false, error: 'drive returned ' + r.status });
}

/** Anyone-with-link reader — required for the gift page's preview embed. */
async function shareFileAnyoneReader(env, fileId) {
  try {
    const token = await driveAccessToken(env);
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) + '/permissions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function driveAccessToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token grant failed');
  return j.access_token;
}

function videoJson(status, obj) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, X-Session',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    // X-Session forces a preflight per chunk; without caching that is an
    // extra OPTIONS round trip on every 8MB of a 500MB upload (~63 RTTs).
    'Access-Control-Max-Age': '86400',
  };
}

function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
