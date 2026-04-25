/**
 * cloudflare-worker-voice-proxy.js — streaming proxy for Drive-hosted voice audio.
 *
 * Why this exists:
 *   Drive's direct media URLs (drive.usercontent.google.com) emit
 *   `Cross-Origin-Resource-Policy: same-site` + `Content-Disposition: attachment`,
 *   which prevent <audio> playback from non-Google origins. The previous fix
 *   (GAS audioProxy → base64 JSON → atob → Blob) added 3-6 s latency on a 6 MB file.
 *   This Worker streams the bytes through with proper CORS + inline disposition,
 *   forwards Range headers (for WaveSurfer scrubbing), and stays in CF free tier
 *   ($0/mo, unmetered egress, 100K req/day).
 *
 * Endpoint:
 *   GET https://<worker>/<driveFileId>
 *
 * Deploy:
 *   wrangler deploy
 */

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return preflight();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    const fileId = new URL(req.url).pathname.slice(1);
    if (!/^[\w-]{20,}$/.test(fileId)) {
      return new Response('bad id', { status: 400, headers: corsHeaders() });
    }

    // `uc?export=media` returns raw media bytes (no virus-scan interstitial prep).
    // Voice files are <5 MB.
    const driveUrl = `https://drive.google.com/uc?export=media&id=${fileId}`;
    const range = req.headers.get('range');

    // CF edge cache: keyed by file ID, content is immutable. WaveSurfer makes 2
    // fetches per play (peaks + MediaElement); cache makes the 2nd one instant
    // and warms for all subsequent listeners.
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
  },
};

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
