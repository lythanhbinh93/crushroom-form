/**
 * counter-page.js — controller for the public Love Counter page.
 *
 * Flow:
 *  1. Parse ?id=SLUG from URL.
 *  2. fetch GAS ?action=getCounter&id=SLUG directly. No Cloudflare Worker route
 *     on purpose: the /voice/<slug> cache belongs to the voice page, and at this
 *     product's traffic a 1-2 s cold GAS round-trip is acceptable. The day
 *     count is computed CLIENT-SIDE precisely so nothing here depends on when
 *     the page was fetched or cached.
 *  3. Render background, title, heart with live day count, couple, message —
 *     the static paint lives in assets/counter-render.js (window.CounterRender),
 *     SHARED with the upload form's live preview so the preview can never
 *     drift from this page. That script must load before this one.
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

var CR = window.CounterRender;

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

// ── Helpers ────────────────────────────────────────────────────────────────
// URL/time/format helpers all live in CounterRender now — one copy for this
// page and the form preview.

function getSlug() {
  return (new URLSearchParams(window.location.search).get('id') || '').trim();
}

function showError() {
  elLoading.hidden = true;
  elRoot.hidden    = true;
  elError.hidden   = false;
}

// ── Day count (stateful — rollover repaints — so it stays page-side) ──────

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
  var today = CR.todayInVN();
  if (today === renderedForDay) return;
  renderedForDay = today;
  var n = CR.loveDays(startDate, today);
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

function renderCounter(data) {
  // Static paint is the shared renderer's job — same call the form preview makes.
  CR.renderCounterInto({
    bg: elBg,
    title: elTitle,
    heartText: elHeartText,
    maleName: elMaleName,
    femaleName: elFemaleName,
    maleImg: elMaleImg,
    femaleImg: elFemaleImg,
    message: elMessage
  }, data);

  startDate = String(data.start_date || '').trim();
  refreshDays();
  armDayRollover();

  elLoading.hidden = true;
  elError.hidden   = true;
  elRoot.hidden    = false;

  loadAudio(data);
}

// ── Audio (optional; fast path + fallback, same as voice-page.js) ──────────

var wavesurfer = null;

function loadAudio(data) {
  var audioFileId = data.audio_file_id || CR.extractDriveFileId(data.audio_url || '');
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

    elTime.textContent = CR.formatTime(duration);

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
      elTime.textContent = CR.formatTime(duration);
    });
    var lastUpdate = 0;
    wavesurfer.on('audioprocess', function () {
      if (!wavesurfer.isPlaying()) return;
      var now = Date.now();
      if (now - lastUpdate > 200) {
        elTime.textContent = CR.formatTime(wavesurfer.getCurrentTime());
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
    elTime.textContent = CR.formatTime(audio.duration);
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
    elTime.textContent = CR.formatTime(audio.duration);
  });
  var lastUpdate = 0;
  audio.addEventListener('timeupdate', function () {
    if (audio.paused) return;
    var now = Date.now();
    if (now - lastUpdate > 200) {
      elTime.textContent = CR.formatTime(audio.currentTime);
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
