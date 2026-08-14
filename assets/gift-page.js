/**
 * gift-page.js — public page for the simple gift types (link / image).
 *
 * Renders by the row's `type` from getGift (via the worker's cached
 * /gift/<slug> route, direct GAS as fallback): an image gift is photo +
 * message; a link gift is a YouTube/Spotify/Drive-video embed + optional
 * photo + message.
 *
 * The embed URL is BUILT from validated pieces of the customer link — the raw
 * link never reaches an iframe src. If the link doesn't transform (service
 * changed its URL shape, or the row predates a rule), the page shows a plain
 * anchor instead of a blank hole, so the gift is never empty.
 */

/** True for a plausible YouTube video id. */
function gpIsVideoId(id) {
  return /^[A-Za-z0-9_-]{6,20}$/.test(String(id || ''));
}

/** True for a plausible Drive file id (folder ids share the shape — Drive's
 *  player just shows its own error for those, the page never breaks). */
function gpIsDriveFileId(id) {
  return /^[A-Za-z0-9_-]{20,100}$/.test(String(id || ''));
}

/**
 * Embeddable form of an allowlisted gift link. Returns
 * { kind: 'youtube'|'spotify', src } or null when no safe transform exists.
 * Pure — extracted by the Node tests.
 */
function gpEmbedUrl(link) {
  var m = String(link || '').trim().match(/^https:\/\/([^\/\?#]+)([^\?#]*)(?:\?([^#]*))?/i);
  if (!m) return null;
  var host = m[1].toLowerCase();
  var parts = (m[2] || '').split('/').filter(Boolean);
  var query = m[3] || '';

  if (host === 'youtu.be') {
    return gpIsVideoId(parts[0])
      ? { kind: 'youtube', src: 'https://www.youtube.com/embed/' + parts[0] }
      : null;
  }
  if (host === 'youtube.com' || host === 'www.youtube.com' ||
      host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parts[0] === 'watch') {
      var vid = new URLSearchParams(query).get('v') || '';
      return gpIsVideoId(vid)
        ? { kind: 'youtube', src: 'https://www.youtube.com/embed/' + vid }
        : null;
    }
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && gpIsVideoId(parts[1])) {
      return { kind: 'youtube', src: 'https://www.youtube.com/embed/' + parts[1] };
    }
    return null;
  }
  if (host === 'drive.google.com') {
    // Share-link shapes: file/d/<id>/view and open?id=<id>. The /preview
    // path is Drive's embeddable player (transcoded, adaptive on mobile).
    if (parts[0] === 'file' && parts[1] === 'd' && gpIsDriveFileId(parts[2])) {
      return { kind: 'drive', src: 'https://drive.google.com/file/d/' + parts[2] + '/preview' };
    }
    if (parts[0] === 'open') {
      var fid = new URLSearchParams(query).get('id') || '';
      if (gpIsDriveFileId(fid)) {
        return { kind: 'drive', src: 'https://drive.google.com/file/d/' + fid + '/preview' };
      }
    }
    return null;
  }
  if (host === 'open.spotify.com') {
    // Locale prefix (open.spotify.com/intl-vi/track/…) carries no meaning.
    if (parts[0] && /^intl-/i.test(parts[0])) parts.shift();
    var kinds = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
    if (kinds.indexOf(parts[0]) !== -1 && /^[A-Za-z0-9]{10,30}$/.test(parts[1] || '')) {
      return { kind: 'spotify', src: 'https://open.spotify.com/embed/' + parts[0] + '/' + parts[1] };
    }
    return null;
  }
  return null;
}

/* ── Controller ──────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';
  var PROXY_URL = 'https://voice-proxy.crushroom.workers.dev';

  var elLoading = document.getElementById('gp-loading');
  var elError = document.getElementById('gp-error');
  var elRoot = document.getElementById('gp-root');
  var elImage = document.getElementById('gp-image');
  var elText = document.getElementById('gp-text');
  var elEmbed = document.getElementById('gp-embed');
  var elDate = document.getElementById('gp-date');

  function showError() {
    elLoading.hidden = true;
    elRoot.hidden = true;
    elError.hidden = false;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  }

  function render(data) {
    if (data.image_file_id) {
      elImage.src = 'https://drive.google.com/thumbnail?id=' +
        encodeURIComponent(data.image_file_id) + '&sz=w800';
      elImage.onerror = function () { elImage.hidden = true; };
      elImage.hidden = false;
    }

    // textContent everywhere — customer input never becomes markup.
    var msg = String(data.text_message || '').trim();
    elText.textContent = msg;
    elText.hidden = !msg;

    // Scheme guard mirrors the server allowlist's https requirement — defense
    // in depth for the anchor href, same bar the iframe src already meets.
    if ((data.type === 'link' || data.type === 'video') &&
        data.media_link && /^https:\/\//i.test(data.media_link)) {
      var embed = gpEmbedUrl(data.media_link);
      if (embed) {
        var iframe = document.createElement('iframe');
        iframe.src = embed.src;
        iframe.className = 'gp-iframe gp-iframe-' + embed.kind;
        iframe.setAttribute('allow',
          'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        elEmbed.appendChild(iframe);
      }
      // The raw link under the embed doubles as the fallback when the embed
      // dies later (deleted/private) — the gift is never fully blank.
      var a = document.createElement('a');
      a.href = data.media_link;
      a.textContent = embed ? 'Mở trong ứng dụng ↗' : data.media_link;
      a.className = 'gp-link';
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      elEmbed.appendChild(a);
      elEmbed.hidden = false;
    }

    var dateStr = formatDate(data.published_at);
    if (dateStr) elDate.textContent = '· ' + dateStr;

    elLoading.hidden = true;
    elError.hidden = true;
    elRoot.hidden = false;
  }

  var slug = new URLSearchParams(location.search).get('id') || '';
  if (!/^[\w-]{6,16}$/.test(slug)) { showError(); return; }

  fetch(PROXY_URL + '/gift/' + encodeURIComponent(slug))
    .then(function (r) { if (!r.ok) throw new Error('proxy ' + r.status); return r.json(); })
    .catch(function () {
      // Worker not deployed yet / edge trouble — GAS keeps the page alive.
      return fetch(GAS_URL + '?action=getGift&id=' + encodeURIComponent(slug))
        .then(function (r) { return r.json(); });
    })
    .then(function (data) {
      if (data && data.ok) render(data);
      else showError();
    })
    .catch(showError);
})();
