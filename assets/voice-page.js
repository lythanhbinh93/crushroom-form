/**
 * voice-page.js — renders the public voice-gift page with WaveSurfer audio UI.
 *
 * Flow:
 *  1. Parse ?id=SLUG from URL.
 *  2. fetch VOICE_AUDIO_PROXY_URL/voice/SLUG → {ok, text_message, audio_url, image_url, audio_file_id, image_file_id, published_at, peaks, audio_duration}
 *     (CF Worker proxies + edge-caches GAS getVoice for ~10x faster repeat hits)
 *  3. Render image + text immediately; trigger audio load.
 *  4. Audio: <audio> / WaveSurfer streams directly from VOICE_AUDIO_PROXY_URL/<fileId>.
 *
 * WHY a Cloudflare Worker proxies audio: Drive's direct media URLs set
 * `Cross-Origin-Resource-Policy: same-site` + `Content-Disposition: attachment`,
 * which block browser audio playback from non-Google origins. The Worker re-streams
 * Drive bytes with proper CORS + inline disposition + Range support, replacing the
 * old GAS base64 proxy (3-6 s decode latency on a 6 MB file).
 */

var VOICE_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';
// Streaming proxy. Update after `wrangler deploy` of cloudflare-worker-voice-proxy.js.
var VOICE_AUDIO_PROXY_URL = 'https://voice-proxy.crushroom.workers.dev';

// ── DOM refs ────────────────────────────────────────────────────────────────
var elLoading   = document.getElementById('gift-loading');
var elError     = document.getElementById('gift-404');
var elRoot      = document.getElementById('gift-root');
var elImage     = document.getElementById('gift-image');
var elText      = document.getElementById('gift-text');
var elDate      = document.getElementById('gift-date');
var elAudioLoad = document.getElementById('gift-audio-loading');
var elPlayer    = document.getElementById('player-container');
var elPlayBtn   = document.getElementById('playPauseButton');
var elPlayIcon  = document.getElementById('playIcon');
var elTime      = document.getElementById('timeDisplay');

// ── Helpers ────────────────────────────────────────────────────────────────

function getSlug() {
  return (new URLSearchParams(window.location.search).get('id') || '').trim();
}

/**
 * Convert Drive share URL → thumbnail URL (reliable image-serving endpoint).
 * Pattern: https://drive.google.com/file/d/{ID}/view → https://drive.google.com/thumbnail?id={ID}&sz=w{size}
 */
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

function formatDate(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  } catch (_) { return ''; }
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

function showLoading() {
  elLoading.hidden = false;
  elError.hidden   = true;
  elRoot.hidden    = true;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderGift(data) {
  // Image
  var imgSrc = normalizeThumbUrl(data.image_url || '', 800);
  var imgIsDrive = imgSrc && imgSrc.indexOf('drive.google.com') !== -1;
  if (imgSrc && imgIsDrive) {
    elImage.src = imgSrc;
    elImage.onerror = function () { elImage.hidden = true; };
    elImage.hidden = false;
  }

  // Text — textContent prevents XSS from customer input
  var msg = (data.text_message || '').trim();
  elText.textContent = msg;

  // Date
  var dateStr = formatDate(data.published_at);
  if (dateStr) elDate.textContent = '· ' + dateStr;

  // Reveal card (audio loads async underneath)
  elLoading.hidden = true;
  elError.hidden   = true;
  elRoot.hidden    = false;

  // Audio — fast path if we have precomputed peaks; decorative fallback otherwise.
  loadAudio(data);
}

// ── Audio playback (fast path + legacy fallback) ───────────────────────────

var wavesurfer = null;

function loadAudio(data) {
  var audioFileId = data.audio_file_id || extractDriveFileId(data.audio_url || '');
  if (!audioFileId) {
    elAudioLoad.textContent = 'Không có file âm thanh';
    return;
  }
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
  if (elImage.complete) adjustWaveformWidth();
  else elImage.addEventListener('load', adjustWaveformWidth);

  try {
    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: '#878787',
      progressColor: '#fff',
      barWidth: 2,
      height: 80,
      url: streamUrl,
      peaks: [peaks],
      duration: duration
    });

    // With peaks + duration, WaveSurfer skips fetch+decode; ready fires instantly.
    elTime.textContent = formatTime(duration);
    elAudioLoad.hidden = true;
    elPlayer.hidden = false;
    adjustWaveformWidth();

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
      renderDecorativeBarsWithPlayer(streamUrl);
    });
  } catch (e) {
    console.warn('WaveSurfer init failed, falling back to decorative bars:', e);
    renderDecorativeBarsWithPlayer(streamUrl);
  }
}

function renderDecorativeBarsWithPlayer(streamUrl) {
  // Render static bar pattern (CSS-only) and use plain <audio> for playback.
  var wf = document.getElementById('waveform');
  if (wf) {
    wf.innerHTML = '';
    wf.classList.add('voice-bars-decorative');
    for (var i = 0; i < 80; i++) {
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

  audio.addEventListener('loadedmetadata', function () {
    elTime.textContent = formatTime(audio.duration);
    elAudioLoad.hidden = true;
    elPlayer.hidden = false;
    adjustWaveformWidth();
  });
  audio.addEventListener('error', function () {
    elAudioLoad.hidden = false;
    elAudioLoad.textContent = 'Không tải được âm thanh';
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

function adjustWaveformWidth() {
  var cover = elImage;
  var waveform = document.getElementById('waveform');
  if (cover && !cover.hidden && waveform && cover.offsetWidth > 0) {
    waveform.style.maxWidth = cover.offsetWidth + 'px';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  var slug = getSlug();
  if (!slug) { showError(); return; }

  showLoading();
  fetch(VOICE_AUDIO_PROXY_URL + '/voice/' + encodeURIComponent(slug))
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) { showError(); return; }
      renderGift(resp);
    })
    .catch(function (err) {
      console.error('getVoice failed:', err);
      showError();
    });
}

// WaveSurfer script has `defer`, so run init after DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
