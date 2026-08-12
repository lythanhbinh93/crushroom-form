/**
 * cloudflare-worker-voice-proxy.js — streaming proxy for Drive-hosted voice audio
 * + cached metadata proxy for GAS getVoice.
 *
 * Routes:
 *   GET /voice/<slug>     → cached JSON proxy of GAS getVoice (60min edge TTL)
 *   GET /admin/list       → cached JSON proxy of GAS listVoice for the admin
 *                           voice tab (serve-cached + background revalidate;
 *                           ?fresh=1 bypasses and repopulates)
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
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Metadata route: /voice/<slug>
    if (path.startsWith('/voice/')) {
      return handleVoiceMeta(req, path.slice('/voice/'.length));
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

async function handleVoiceMeta(req, slug) {
  if (!/^[\w-]{6,16}$/.test(slug)) {
    return new Response(JSON.stringify({ ok: false, error: 'bad slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Explicit Cache API: more reliable than cf.cacheTtl for GAS responses
  // (GAS 302-redirects to session-token URLs which break cf-key caching).
  // Namespace is versioned: v1 cached ANY HTTP-200 body, and GAS answers
  // HTTP 200 even for {ok:false,"not_found"} — so a QR scanned minutes
  // before publish poisoned the edge (1h) and the phone (10min) with
  // not_found and the printed link looked dead. voice-meta2 orphans every
  // v1 entry on deploy; good entries re-warm on first hit.
  const cache = caches.default;
  const cacheKey = new Request(`https://voice-proxy.crushroom.workers.dev/__cache__/voice-meta2/${slug}`, {
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
    `${GAS_VOICE_URL}?action=getVoice&id=${encodeURIComponent(slug)}`, 3);
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
