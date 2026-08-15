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
      ? { kind: 'youtube', id: parts[0], src: 'https://www.youtube.com/embed/' + parts[0] }
      : null;
  }
  if (host === 'youtube.com' || host === 'www.youtube.com' ||
      host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parts[0] === 'watch') {
      var vid = new URLSearchParams(query).get('v') || '';
      return gpIsVideoId(vid)
        ? { kind: 'youtube', id: vid, src: 'https://www.youtube.com/embed/' + vid }
        : null;
    }
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && gpIsVideoId(parts[1])) {
      return { kind: 'youtube', id: parts[1], src: 'https://www.youtube.com/embed/' + parts[1] };
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
      // utm_source=generator matches Spotify's own embed-generator snippet —
      // it serves the full themed card player.
      return {
        kind: 'spotify',
        src: 'https://open.spotify.com/embed/' + parts[0] + '/' + parts[1] + '?utm_source=generator'
      };
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

    // Rows whose media_link is an app-created Drive file get the branded
    // player streaming through OUR worker; YouTube links get the same chrome
    // over a chromeless embed. Spotify keeps its own embed, and any media
    // the player can't actually play (foreign Drive files, age-restricted
    // YouTube) falls back to the embed path via the chrome's fail hook.
    var playerShown = false;
    if ((data.type === 'video' || data.type === 'link') && data.media_link) {
      var driveId = gpDriveFileIdFromLink(data.media_link);
      var emb = driveId ? null : gpEmbedUrl(data.media_link);
      if (driveId) {
        gpMountPlayer(elEmbed, PROXY_URL + '/video/stream/' + driveId, function () {
          mountEmbedFallback(data);
        });
        playerShown = true;
      } else if (emb && emb.kind === 'youtube' && emb.id) {
        gpMountYtPlayer(elEmbed, emb.id, function () {
          mountEmbedFallback(data);
        });
        playerShown = true;
      }
      if (playerShown) elEmbed.hidden = false;
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
     One chrome (big play, bar, seek, fullscreen, auto-hide) over two media
     backends: a native <video> streaming through the worker, or a chromeless
     YouTube iframe driven via the widget postMessage API. Markup is static
     strings only — no data ever enters innerHTML (the YouTube id is regex-
     validated by gpIsVideoId before it reaches a URL). */

  var GP_SVG = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>'
  };

  /**
   * Build the shared player shell + chrome and wire the generic behavior.
   *
   * The backend hands over a `media` adapter via chrome.attach():
   *   togglePlay()          flip playback
   *   isPlaying()           true while actually playing (idle auto-hide)
   *   seekToPct(pct)        seek to a fraction of the duration
   *   enterFullscreen(wrap) backend-specific fullscreen
   *   clickEl               element whose taps toggle play
   * and reports state back through the returned chrome object:
   *   ready(), buffering(on), playing(), paused(), duration(sec),
   *   progress(cur, dur), fail()
   * fail() is a no-op once playback has started — a mid-play hiccup must
   * not rip the player out (the rule the native player always had).
   */
  function gpPlayerChrome(container, mediaHtml, extraClass, onFail) {
    var wrap = document.createElement('div');
    wrap.className = 'gp-player gp-vp-loading' + (extraClass ? ' ' + extraClass : '');
    wrap.innerHTML =
      mediaHtml +
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

    var bigBtn = wrap.querySelector('.gp-vp-big');
    var toggleBtn = wrap.querySelector('.gp-vp-toggle');
    var track = wrap.querySelector('.gp-vp-track');
    var fill = wrap.querySelector('.gp-vp-fill');
    var timeEl = wrap.querySelector('.gp-vp-time');
    var durEl = wrap.querySelector('.gp-vp-dur');
    var fsBtn = wrap.querySelector('.gp-vp-fs');
    var media = null;
    var idleTimer = null;

    function setChromeIdle(idle) {
      wrap.classList.toggle('gp-vp-idle', !!idle);
    }
    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (media && media.isPlaying()) setChromeIdle(true);
      }, 2600);
    }
    function wake() {
      setChromeIdle(false);
      scheduleIdle();
    }
    function seekFromEvent(e) {
      var rect = track.getBoundingClientRect();
      var x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
      var pct = Math.min(1, Math.max(0, x / rect.width));
      if (media) media.seekToPct(pct);
      fill.style.width = pct * 100 + '%';
      wake();
    }

    var chrome = {
      wrap: wrap,
      fsBtn: fsBtn,
      started: false,
      ready: function () { wrap.classList.remove('gp-vp-loading'); },
      buffering: function (on) { wrap.classList.toggle('gp-vp-loading', !!on); },
      playing: function () {
        chrome.started = true;
        wrap.classList.add('gp-vp-playing');
        wrap.classList.add('gp-vp-started');
        toggleBtn.innerHTML = GP_SVG.pause;
        scheduleIdle();
      },
      paused: function () {
        wrap.classList.remove('gp-vp-playing');
        toggleBtn.innerHTML = GP_SVG.play;
        setChromeIdle(false);
      },
      duration: function (sec) {
        if (isFinite(sec) && sec > 0) durEl.textContent = gpFmtTime(sec);
      },
      progress: function (cur, dur) {
        if (isFinite(dur) && dur > 0) {
          fill.style.width = (cur / dur) * 100 + '%';
        }
        timeEl.textContent = gpFmtTime(cur);
      },
      fail: function () {
        // Refused media (non-app file, worker trouble, YouTube saying no):
        // only downgrade when nothing has played yet.
        if (chrome.started) return;
        wrap.remove();
        onFail();
      },
      attach: function (m) {
        media = m;
        bigBtn.addEventListener('click', function () { media.togglePlay(); });
        toggleBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          media.togglePlay();
        });
        media.clickEl.addEventListener('click', function () {
          if (wrap.classList.contains('gp-vp-idle')) { wake(); return; }
          media.togglePlay();
          wake();
        });
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
          media.enterFullscreen(wrap);
        });
      }
    };
    return chrome;
  }

  function gpMountPlayer(container, src, onFail) {
    var chrome = gpPlayerChrome(container,
      '<video playsinline webkit-playsinline preload="metadata"></video>', '', onFail);
    var video = chrome.wrap.querySelector('video');

    // #t=0.001 coaxes iOS into painting the first frame as the poster.
    video.src = src + '#t=0.001';

    video.addEventListener('loadedmetadata', function () {
      chrome.ready();
      if (isFinite(video.duration)) chrome.duration(video.duration);
    });
    video.addEventListener('waiting', function () { chrome.buffering(true); });
    video.addEventListener('canplay', function () { chrome.buffering(false); });
    video.addEventListener('play', function () { chrome.playing(); });
    video.addEventListener('pause', function () { chrome.paused(); });
    video.addEventListener('timeupdate', function () {
      chrome.progress(video.currentTime, video.duration);
    });
    video.addEventListener('error', function () { chrome.fail(); });

    // First play tap also enters fullscreen — the tap is the user gesture
    // the fullscreen request needs. Once only: if the viewer exits, resume
    // taps must not drag them back in.
    var autoFsDone = false;
    function goFullscreen() {
      // iPhone Safari has no element fullscreen — use the native video one.
      if (video.webkitEnterFullscreen && !chrome.wrap.requestFullscreen) {
        try { video.webkitEnterFullscreen(); } catch (_) { /* not ready yet */ }
        return;
      }
      if (chrome.wrap.requestFullscreen) {
        var p = chrome.wrap.requestFullscreen();
        if (p && p.catch) p.catch(function () {});
      } else if (video.webkitEnterFullscreen) {
        try { video.webkitEnterFullscreen(); } catch (_) {}
      }
    }

    chrome.attach({
      togglePlay: function () {
        if (video.paused) {
          if (!autoFsDone) { autoFsDone = true; goFullscreen(); }
          video.play().catch(function () {});
        } else { video.pause(); }
      },
      isPlaying: function () { return !video.paused; },
      seekToPct: function (pct) {
        if (isFinite(video.duration)) video.currentTime = pct * video.duration;
      },
      enterFullscreen: function (w) {
        if (document.fullscreenElement) { document.exitFullscreen(); return; }
        goFullscreen();
      },
      clickEl: video
    });
  }

  /**
   * Same chrome over a chromeless YouTube embed (controls=0), driven through
   * the widget postMessage API — no external script. The iframe is created
   * only on the first play tap (lite-youtube pattern): before that the box
   * shows our own poster, so the pre-play frame carries zero YouTube UI, and
   * creating the iframe with autoplay=1 inside the tap's user activation is
   * what lets it start with sound on mobile. If YouTube refuses (age
   * restriction, deleted, embed disabled) the chrome downgrades to the plain
   * embed, which shows YouTube's own message plus the raw link.
   */
  function gpMountYtPlayer(container, videoId, onFail) {
    // Failing while in pseudo-fullscreen must release the scroll lock, or
    // the fallback embed appears on a page that can no longer scroll.
    var chrome = gpPlayerChrome(container,
      '<div class="gp-vp-ytbox">' +
        '<img class="gp-vp-poster" alt="" src="https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg">' +
        '<div class="gp-vp-hit"></div>' +
      '</div>', 'gp-player-yt', function () { setFakeFs(false); onFail(); });
    var box = chrome.wrap.querySelector('.gp-vp-ytbox');
    var poster = chrome.wrap.querySelector('.gp-vp-poster');
    var iframe = null;
    var lastState = -1; // YT states: -1 unstarted, 0 ended, 1 play, 2 pause, 3 buffer, 5 cued
    var dur = 0;
    var failTimer = null;

    chrome.ready(); // the poster paints immediately; duration arrives later

    // iPhone Safari has no element fullscreen and no native <video> to hand
    // off to — fake it: the player expands over the whole viewport instead.
    // Real fullscreen everywhere it exists.
    var fakeFs = !chrome.wrap.requestFullscreen;
    function setFakeFs(on) {
      chrome.wrap.classList.toggle('gp-vp-fakefs', on);
      document.documentElement.classList.toggle('gp-fakefs-lock', on);
    }
    function goFullscreen() {
      if (fakeFs) { setFakeFs(true); return; }
      var p = chrome.wrap.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    }

    function send(func, args) {
      if (!iframe || !iframe.contentWindow) return;
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command', func: func, args: args || [], id: 1, channel: 'widget'
      }), '*');
    }

    function createIframe() {
      chrome.buffering(true);
      iframe = document.createElement('iframe');
      iframe.className = 'gp-vp-ytframe';
      iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('title', '');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId +
        '?enablejsapi=1&autoplay=1&playsinline=1&controls=0&rel=0&iv_load_policy=3&disablekb=1' +
        '&origin=' + encodeURIComponent(location.origin);
      iframe.addEventListener('load', function () {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'listening', id: 1, channel: 'widget'
        }), '*');
      });
      box.insertBefore(iframe, poster);
      // If YouTube never talks back, downgrade instead of spinning forever.
      failTimer = setTimeout(function () { chrome.fail(); }, 8000);
    }

    function onState(state) {
      if (state === lastState) return;
      lastState = state;
      if (state === 1) {
        chrome.wrap.classList.remove('gp-vp-ended');
        chrome.buffering(false);
        chrome.playing();
      } else if (state === 3) {
        chrome.buffering(true);
      } else if (state === 0) {
        chrome.paused();
        chrome.buffering(false);
        // Cover YouTube's end screen with our poster again.
        chrome.wrap.classList.add('gp-vp-ended');
      } else { // -1 unstarted, 2 paused, 5 cued
        chrome.paused();
        chrome.buffering(false);
      }
    }

    window.addEventListener('message', function (e) {
      if (!iframe || e.source !== iframe.contentWindow) return;
      var d;
      try { d = JSON.parse(e.data); } catch (_) { return; }
      if (!d || !d.event) return;
      clearTimeout(failTimer);
      if (d.event === 'onError') { chrome.fail(); return; }
      if (d.event === 'onStateChange') { onState(Number(d.info)); return; }
      if (d.event === 'infoDelivery' && d.info) {
        if (typeof d.info.duration === 'number' && d.info.duration > 0 && d.info.duration !== dur) {
          dur = d.info.duration;
          chrome.duration(dur);
        }
        if (typeof d.info.currentTime === 'number') chrome.progress(d.info.currentTime, dur);
        if (typeof d.info.playerState === 'number') onState(d.info.playerState);
      }
    });

    chrome.attach({
      togglePlay: function () {
        if (!iframe) {
          // First play tap: enter fullscreen (real or faked) inside the
          // same user gesture the iframe creation rides on.
          goFullscreen();
          createIframe(); // autoplay=1 starts playback
          return;
        }
        if (lastState === 1 || lastState === 3) send('pauseVideo');
        else send('playVideo');
      },
      isPlaying: function () { return lastState === 1; },
      seekToPct: function (pct) {
        if (iframe && dur > 0) send('seekTo', [pct * dur, true]);
      },
      enterFullscreen: function () {
        if (fakeFs) {
          setFakeFs(!chrome.wrap.classList.contains('gp-vp-fakefs'));
          return;
        }
        if (document.fullscreenElement) document.exitFullscreen();
        else goFullscreen();
      },
      clickEl: chrome.wrap.querySelector('.gp-vp-hit')
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
