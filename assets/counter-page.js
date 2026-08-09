/**
 * counter-page.js — renders the public Love Counter page.
 *
 * Flow:
 *  1. Parse ?id=SLUG from URL.
 *  2. fetch GAS ?action=getCounter&id=SLUG directly. No Cloudflare Worker route
 *     on purpose: the /voice/<slug> cache belongs to the voice page, and at this
 *     product's traffic a 1-2 s cold GAS round-trip is acceptable. The day
 *     count is computed CLIENT-SIDE precisely so nothing here depends on when
 *     the page was fetched or cached.
 *  3. Render background, title, heart with live day count, couple, message.
 *  4. Audio (optional): stream from the Worker /<fileId> route — counter audio
 *     is saved into the same Drive folder as voice audio, so the existing
 *     streaming proxy serves it unchanged. WaveSurfer peaks fast path with the
 *     same decorative-bars fallback as voice-page.js.
 *
 * Day count is INCLUSIVE (start date = day 1, "ngày đầu tiên = ngày 1") and is
 * resolved in Asia/Ho_Chi_Minh regardless of the viewer's clock: the couple's
 * count is the truth, not the scanning phone's timezone. Both endpoints of the
 * diff go through Date.UTC, so DST anywhere is irrelevant.
 * See docs/love-counter-submit-contract.md.
 */

var COUNTER_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';
// Streaming audio proxy — same Worker the voice page uses.
var VOICE_AUDIO_PROXY_URL = 'https://voice-proxy.crushroom.workers.dev';

// ── DOM refs ────────────────────────────────────────────────────────────────
var elLoading    = document.getElementById('counter-loading');
var elError      = document.getElementById('counter-404');
var elRoot       = document.getElementById('counter-root');
var elBg         = document.getElementById('counter-bg');
var elTitle      = document.getElementById('counter-title');
var elHeartText  = document.getElementById('counter-heart-text');
var elDays       = document.getElementById('counter-days');
var elMaleImg    = document.getElementById('male-avatar');
var elMaleName   = document.getElementById('male-name');
var elFemaleImg  = document.getElementById('female-avatar');
var elFemaleName = document.getElementById('female-name');
var elMessage    = document.getElementById('counter-message');
var elAudioBlock = document.getElementById('audio-block');
var elAudioTitle = document.getElementById('audio-title');
var elPlayBtn    = document.getElementById('playPauseButton');
var elPlayIcon   = document.getElementById('playIcon');
var elTime       = document.getElementById('timeDisplay');

// ── Helpers (same shapes as voice-page.js) ─────────────────────────────────

function getSlug() {
  return (new URLSearchParams(window.location.search).get('id') || '').trim();
}

/** Drive share URL → thumbnail endpoint, the one Drive serves reliably to <img>. */
function normalizeThumbUrl(url, size) {
  if (!url) return '';
  var s = String(url).trim();
  var m = s.match(/[-\w]{25,}/);
  if (!m || s.indexOf('drive.google.com') === -1) return s;
  return 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w' + (size || 800);
}

function extractDriveFileId(url) {
  if (!url) return '';
  var s = String(url).trim();
  var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
  if (m) return m[1];
  if (s.indexOf('drive.google.com') !== -1) {
    var m2 = s.match(/[-\w]{25,}/);
    if (m2) return m2[0];
  }
  return '';
}

function formatTime(seconds) {
  var minutes = Math.floor(seconds / 60);
  var secs = Math.floor(seconds % 60);
  return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}

function showError() {
  elLoading.hidden = true;
  elRoot.hidden    = true;
  elError.hidden   = false;
}

// ── Day count ──────────────────────────────────────────────────────────────

/** Today's date in Vietnam as 'YYYY-MM-DD' (en-CA formats exactly that). */
function todayInVN() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/**
 * Inclusive days between two 'YYYY-MM-DD' strings: same day → 1.
 * Never new Date('YYYY-MM-DD') — that parses as UTC midnight and shifts a day
 * for any viewer west of UTC. Date.UTC on split components is exact.
 */
function loveDays(startStr, todayStr) {
  var a = String(startStr).split('-').map(Number);
  var b = String(todayStr).split('-').map(Number);
  return Math.round(
    (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000
  ) + 1;
}

var startDate = '';
var renderedForDay = '';

/** (Re)paint the number when the Vietnam calendar day differs from last paint. */
function refreshDays() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    // Only reachable via a hand-edited sheet cell — submit validates the format.
    // Still the printed product, so show a deliberate dash, not a blank heart.
    elDays.textContent = '—';
    return;
  }
  var today = todayInVN();
  if (today === renderedForDay) return;
  renderedForDay = today;
  var n = loveDays(startDate, today);
  elDays.textContent = n > 0 ? String(n) : '—';
}

/**
 * Keep the count honest while the page stays open — a love counter is exactly
 * the kind of page that gets left on a screen overnight. visibilitychange
 * catches backgrounded tabs; the interval catches a foreground tab crossing
 * midnight. Both re-render only when the VN date actually changed.
 */
function armDayRollover() {
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshDays();
  });
  setInterval(refreshDays, 60 * 1000);
}

// ── Render ─────────────────────────────────────────────────────────────────

/**
 * Only accept the exact thumbnail form normalizeThumbUrl rebuilds. A substring
 * check on 'drive.google.com' would pass a crafted value straight through to a
 * CSS url() / img src; the rebuilt prefix + [-\w] id is safe by construction.
 */
function isDriveThumbUrl(src) {
  return typeof src === 'string' &&
    src.indexOf('https://drive.google.com/thumbnail?id=') === 0;
}

function renderCounter(data) {
  // Background — inline style beats the CSS gradient fallback only when set.
  var bgSrc = normalizeThumbUrl(data.bg_url || '', 1600);
  if (isDriveThumbUrl(bgSrc)) {
    elBg.style.backgroundImage = 'url("' + bgSrc + '")';
  }

  // All customer strings land via textContent — never innerHTML.
  elTitle.textContent = (data.title || '').trim() || '❤️ Been Love Memory ❤️';
  elHeartText.textContent = (data.heart_text || '').trim();
  elMaleName.textContent = (data.male_name || '').trim();
  elFemaleName.textContent = (data.female_name || '').trim();

  setAvatar(elMaleImg, data.male_image_url);
  setAvatar(elFemaleImg, data.female_image_url);

  var msg = (data.text_message || '').trim();
  if (msg) {
    elMessage.textContent = msg;
    elMessage.hidden = false;
  }

  startDate = String(data.start_date || '').trim();
  refreshDays();
  armDayRollover();

  elLoading.hidden = true;
  elError.hidden   = true;
  elRoot.hidden    = false;

  loadAudio(data);
}

function setAvatar(imgEl, url) {
  var src = normalizeThumbUrl(url || '', 400);
  if (isDriveThumbUrl(src)) {
    imgEl.src = src;
    imgEl.onerror = function () { imgEl.removeAttribute('src'); };
  }
}

// ── Audio (optional; fast path + fallback, same as voice-page.js) ──────────

var wavesurfer = null;

function loadAudio(data) {
  var audioFileId = data.audio_file_id || extractDriveFileId(data.audio_url || '');
  // No audio on a counter is a normal state, not an error — the block stays hidden.
  if (!audioFileId) return;

  var title = (data.audio_title || '').trim();
  if (title) {
    elAudioTitle.textContent = title;
    elAudioTitle.hidden = false;
  }
  elAudioBlock.hidden = false;

  var streamUrl = VOICE_AUDIO_PROXY_URL + '/' + encodeURIComponent(audioFileId);
  var peaks = parsePeaks(data.peaks);
  var duration = parseFloat(data.audio_duration) || 0;

  if (peaks && duration > 0 && typeof WaveSurfer !== 'undefined') {
    initWaveSurferWithPeaks(streamUrl, peaks, duration);
  } else {
    renderDecorativeBarsWithPlayer(streamUrl);
  }
}

function parsePeaks(raw) {
  if (!raw) return null;
  try {
    var arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch (e) {
    console.warn('peaks JSON parse failed:', e);
    return null;
  }
}

function initWaveSurferWithPeaks(streamUrl, peaks, duration) {
  try {
    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: '#878787',
      progressColor: '#fff',
      barWidth: 2,
      height: 64,
      url: streamUrl,
      peaks: [peaks],
      duration: duration
    });

    elTime.textContent = formatTime(duration);

    elPlayBtn.addEventListener('click', function () {
      wavesurfer.playPause();
    });
    wavesurfer.on('play', function () {
      elPlayIcon.classList.remove('fa-circle-play');
      elPlayIcon.classList.add('fa-circle-pause');
    });
    wavesurfer.on('pause', function () {
      elPlayIcon.classList.remove('fa-circle-pause');
      elPlayIcon.classList.add('fa-circle-play');
    });
    wavesurfer.on('finish', function () {
      elPlayIcon.classList.remove('fa-circle-pause');
      elPlayIcon.classList.add('fa-circle-play');
      elTime.textContent = formatTime(duration);
    });
    var lastUpdate = 0;
    wavesurfer.on('audioprocess', function () {
      if (!wavesurfer.isPlaying()) return;
      var now = Date.now();
      if (now - lastUpdate > 200) {
        elTime.textContent = formatTime(wavesurfer.getCurrentTime());
        lastUpdate = now;
      }
    });
    wavesurfer.on('error', function (err) {
      console.warn('WaveSurfer playback error, falling back:', err);
      // Tear down before falling back: destroy the instance and clone-replace
      // the play button to strip its listener. Without this, one tap would
      // drive BOTH players — the WaveSurfer handler bound above and the
      // fallback's own. (voice-page.js carries this same latent flaw.)
      try { wavesurfer.destroy(); } catch (_) { /* already torn down */ }
      var fresh = elPlayBtn.cloneNode(true);
      elPlayBtn.parentNode.replaceChild(fresh, elPlayBtn);
      elPlayBtn = fresh;
      elPlayIcon = fresh.querySelector('i') || elPlayIcon;
      renderDecorativeBarsWithPlayer(streamUrl);
    });
  } catch (e) {
    console.warn('WaveSurfer init failed, falling back to decorative bars:', e);
    renderDecorativeBarsWithPlayer(streamUrl);
  }
}

function renderDecorativeBarsWithPlayer(streamUrl) {
  var wf = document.getElementById('waveform');
  if (wf) {
    wf.innerHTML = '';
    wf.classList.add('voice-bars-decorative');
    for (var i = 0; i < 60; i++) {
      var bar = document.createElement('span');
      bar.className = 'voice-bar';
      wf.appendChild(bar);
    }
  }

  var audio = new Audio();
  audio.preload = 'metadata';
  audio.src = streamUrl;
  document.body.appendChild(audio); // keep in DOM so it streams reliably
  audio.style.display = 'none';

  elTime.textContent = '--:--';
  audio.addEventListener('loadedmetadata', function () {
    elTime.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('error', function () {
    // Optional feature failed — hide the block rather than show a broken player.
    elAudioBlock.hidden = true;
  });

  elPlayBtn.addEventListener('click', function () {
    if (audio.paused) audio.play(); else audio.pause();
  });
  audio.addEventListener('play', function () {
    elPlayIcon.classList.remove('fa-circle-play');
    elPlayIcon.classList.add('fa-circle-pause');
  });
  audio.addEventListener('pause', function () {
    elPlayIcon.classList.remove('fa-circle-pause');
    elPlayIcon.classList.add('fa-circle-play');
  });
  audio.addEventListener('ended', function () {
    elPlayIcon.classList.remove('fa-circle-pause');
    elPlayIcon.classList.add('fa-circle-play');
    elTime.textContent = formatTime(audio.duration);
  });
  var lastUpdate = 0;
  audio.addEventListener('timeupdate', function () {
    if (audio.paused) return;
    var now = Date.now();
    if (now - lastUpdate > 200) {
      elTime.textContent = formatTime(audio.currentTime);
      lastUpdate = now;
    }
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  var slug = getSlug();
  if (!slug) { showError(); return; }

  fetch(COUNTER_GAS_URL + '?action=getCounter&id=' + encodeURIComponent(slug))
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) { showError(); return; }
      renderCounter(resp);
    })
    .catch(function (err) {
      console.error('getCounter failed:', err);
      showError();
    });
}

// WaveSurfer script has `defer`, so run init after DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
