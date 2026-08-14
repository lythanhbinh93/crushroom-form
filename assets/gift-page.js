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
 * Drive file id out of a stored media_link (file/d/<id> or open?id=), '' when
 * the link is not a Drive file link. Feeds the branded player: video rows
 * play through the worker's /video/stream/<id> route so the page never
 * references drive.google.com. Pure — extracted by the Node tests.
 */
function gpDriveFileIdFromLink(link) {
  var s = String(link || '');
  if (!/^https:\/\/drive\.google\.com\//i.test(s)) return '';
  var m = s.match(/\/file\/d\/([A-Za-z0-9_-]{20,100})(?:[\/?#]|$)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]{20,100})(?:[&#]|$)/);
  return m ? m[1] : '';
}

/** m:ss (or h:mm:ss) with no leading cruft. Pure — extracted by the tests. */
function gpFmtTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  var mm = (h && m < 10 ? '0' : '') + m;
  var ss = (s < 10 ? '0' : '') + s;
  return (h ? h + ':' : '') + mm + ':' + ss;
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

    // Video rows with an uploaded (app-created) Drive file get the branded
    // player: bytes stream through OUR worker, no Drive chrome, no source
    // reveal. Everything else — YouTube/Spotify links, hand-pasted Drive
    // files the stream route can't read — keeps the embed path.
    var playerShown = false;
    if (data.type === 'video' && data.media_link) {
      var driveId = gpDriveFileIdFromLink(data.media_link);
      if (driveId) {
        gpMountPlayer(elEmbed, PROXY_URL + '/video/stream/' + driveId, function () {
          mountEmbedFallback(data);
        });
        elEmbed.hidden = false;
        playerShown = true;
      }
    }
    if (!playerShown) mountEmbedFallback(data);

    var dateStr = formatDate(data.published_at);
    if (dateStr) elDate.textContent = '· ' + dateStr;

    elLoading.hidden = true;
    elError.hidden = true;
    elRoot.hidden = false;
  }

  // Scheme guard mirrors the server allowlist's https requirement — defense
  // in depth for the anchor href, same bar the iframe src already meets.
  function mountEmbedFallback(data) {
    if (!(data.type === 'link' || data.type === 'video') ||
        !data.media_link || !/^https:\/\//i.test(data.media_link)) {
      return;
    }
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

  /* ── Branded video player ────────────────────────────────────────────────
     Native <video> + custom chrome; controls auto-hide while playing; seeks
     work because the stream route passes Range through. Markup is static
     strings only — no data ever enters innerHTML. */

  var GP_SVG = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>'
  };

  function gpMountPlayer(container, src, onFail) {
    var wrap = document.createElement('div');
    wrap.className = 'gp-player gp-vp-loading';
    wrap.innerHTML =
      '<video playsinline webkit-playsinline preload="metadata"></video>' +
      '<div class="gp-vp-spin" aria-hidden="true"></div>' +
      '<button class="gp-vp-big" type="button" aria-label="Phát video">' + GP_SVG.play + '</button>' +
      '<div class="gp-vp-bar">' +
        '<button class="gp-vp-toggle" type="button" aria-label="Phát / tạm dừng">' + GP_SVG.play + '</button>' +
        '<span class="gp-vp-time">0:00</span>' +
        '<div class="gp-vp-track"><div class="gp-vp-fill"></div></div>' +
        '<span class="gp-vp-time gp-vp-dur">–:–</span>' +
        '<button class="gp-vp-fs" type="button" aria-label="Toàn màn hình">' + GP_SVG.fs + '</button>' +
      '</div>';
    container.appendChild(wrap);

    var video = wrap.querySelector('video');
    var bigBtn = wrap.querySelector('.gp-vp-big');
    var toggleBtn = wrap.querySelector('.gp-vp-toggle');
    var track = wrap.querySelector('.gp-vp-track');
    var fill = wrap.querySelector('.gp-vp-fill');
    var timeEl = wrap.querySelector('.gp-vp-time');
    var durEl = wrap.querySelector('.gp-vp-dur');
    var fsBtn = wrap.querySelector('.gp-vp-fs');
    var started = false;
    var idleTimer = null;

    // #t=0.001 coaxes iOS into painting the first frame as the poster.
    video.src = src + '#t=0.001';

    function setChromeIdle(idle) {
      wrap.classList.toggle('gp-vp-idle', !!idle);
    }
    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (!video.paused) setChromeIdle(true);
      }, 2600);
    }
    function wake() {
      setChromeIdle(false);
      scheduleIdle();
    }
    function togglePlay() {
      if (video.paused) { video.play().catch(function () {}); }
      else { video.pause(); }
    }

    video.addEventListener('loadedmetadata', function () {
      wrap.classList.remove('gp-vp-loading');
      if (isFinite(video.duration)) durEl.textContent = gpFmtTime(video.duration);
    });
    video.addEventListener('waiting', function () { wrap.classList.add('gp-vp-loading'); });
    video.addEventListener('canplay', function () { wrap.classList.remove('gp-vp-loading'); });
    video.addEventListener('play', function () {
      started = true;
      wrap.classList.add('gp-vp-playing');
      toggleBtn.innerHTML = GP_SVG.pause;
      scheduleIdle();
    });
    video.addEventListener('pause', function () {
      wrap.classList.remove('gp-vp-playing');
      toggleBtn.innerHTML = GP_SVG.play;
      setChromeIdle(false);
    });
    video.addEventListener('timeupdate', function () {
      if (isFinite(video.duration) && video.duration > 0) {
        fill.style.width = (video.currentTime / video.duration) * 100 + '%';
      }
      timeEl.textContent = gpFmtTime(video.currentTime);
    });
    video.addEventListener('error', function () {
      // Refused stream (non-app file, worker trouble): only downgrade when
      // nothing has played — a mid-play hiccup should not rip the player out.
      if (started) return;
      wrap.remove();
      onFail();
    });

    bigBtn.addEventListener('click', togglePlay);
    toggleBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); });
    video.addEventListener('click', function () {
      if (wrap.classList.contains('gp-vp-idle')) { wake(); return; }
      togglePlay();
      wake();
    });

    function seekFromEvent(e) {
      var rect = track.getBoundingClientRect();
      var x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
      var pct = Math.min(1, Math.max(0, x / rect.width));
      if (isFinite(video.duration)) video.currentTime = pct * video.duration;
      fill.style.width = pct * 100 + '%';
      wake();
    }
    track.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      seekFromEvent(e);
      var move = function (ev) { seekFromEvent(ev); };
      var up = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    fsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      // iPhone Safari has no element fullscreen — use the native video one.
      if (video.webkitEnterFullscreen && !wrap.requestFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }
      if (document.fullscreenElement) document.exitFullscreen();
      else if (wrap.requestFullscreen) wrap.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
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
