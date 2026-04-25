/**
 * cloudflare-worker-voice-proxy.js — streaming proxy for Drive-hosted voice audio
 * + cached metadata proxy for GAS getVoice.
 *
 * Routes:
 *   GET /voice/<slug>     → cached JSON proxy of GAS getVoice (60min edge TTL)
 *   GET /<driveFileId>    → streaming Drive audio with CORS + Range support
 *
 * Why:
 *   - Audio: Drive sets CORP: same-site + Content-Disposition: attachment, blocking
 *     <audio> playback. Worker re-streams with CORS + inline disposition.
 *   - Metadata: GAS web apps have 1-2s round-trip even on warm hits. Edge cache
 *     drops repeat-listener load to <200ms.
 *
 * Deploy: wrangler deploy
 */

const GAS_VOICE_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

export default {
  async fetch(req) {
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

    // Audio route: /<driveFileId>
    return handleAudio(req, path.slice(1));
  },
};

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
