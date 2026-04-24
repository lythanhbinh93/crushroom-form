/**
 * voice-page.js — renders the public voice-gift page with WaveSurfer audio UI.
 *
 * Flow:
 *  1. Parse ?id=SLUG from URL.
 *  2. fetch VOICE_GAS_URL?action=getVoice&id=SLUG → {ok, text_message, audio_url, image_url, audio_file_id, image_file_id, published_at}
 *  3. Render image + text immediately; trigger audio proxy fetch.
 *  4. Audio: GAS audioProxy → base64 → Blob → object URL → WaveSurfer.load().
 *
 * WHY GAS proxy for audio: Drive's direct media URLs set
 * `Cross-Origin-Resource-Policy: same-site` + `Content-Disposition: attachment`,
 * which block browser audio playback from non-Google origins. Proxying through
 * GAS routes bytes through our own origin, bypassing CORP.
 */

var VOICE_GAS_URL = 'https://script.google.com/macros/s/AKfycbwSPtGU4upgxTUT8XJM6rqZlyUWyJ3U40KXvM0Ga2PLiHk33LI2N9KuRP71bYEJ-6qO/exec';

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

  // Audio — fire the proxy fetch. UI transitions from "loading" → WaveSurfer player.
  var audioFileId = data.audio_file_id || extractDriveFileId(data.audio_url || '');
  if (audioFileId) {
    loadAudioViaProxy(audioFileId);
  } else {
    elAudioLoad.textContent = 'Không có file âm thanh';
  }
}

// ── Audio proxy + WaveSurfer ───────────────────────────────────────────────

var wavesurfer = null;

function loadAudioViaProxy(fileId) {
  var url = VOICE_GAS_URL + '?action=audioProxy&id=' + encodeURIComponent(fileId);
  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok || !resp.data) throw new Error(resp.error || 'audio proxy failed');
      var byteStr = atob(resp.data);
      var bytes = new Uint8Array(byteStr.length);
      for (var i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      var blob = new Blob([bytes], { type: resp.mime || 'audio/mpeg' });
      var blobUrl = URL.createObjectURL(blob);
      initWaveSurfer(blobUrl);
    })
    .catch(function (err) {
      console.error('audio load failed:', err);
      elAudioLoad.textContent = 'Không tải được âm thanh';
    });
}

function adjustWaveformWidth() {
  var cover = elImage;
  var waveform = document.getElementById('waveform');
  if (cover && !cover.hidden && waveform && cover.offsetWidth > 0) {
    waveform.style.maxWidth = cover.offsetWidth + 'px';
  }
}

function initWaveSurfer(blobUrl) {
  if (typeof WaveSurfer === 'undefined') {
    console.error('WaveSurfer not loaded');
    elAudioLoad.textContent = 'Không tải được thư viện phát âm thanh';
    return;
  }

  // Match waveform width to image width — cleaner visual alignment.
  if (elImage.complete) adjustWaveformWidth();
  else elImage.addEventListener('load', adjustWaveformWidth);

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#878787',
    progressColor: '#fff',
    barWidth: 2,
    height: 80
  });

  wavesurfer.load(blobUrl);

  wavesurfer.on('ready', function () {
    elTime.textContent = formatTime(wavesurfer.getDuration());
    elAudioLoad.hidden = true;
    elPlayer.hidden = false;
    adjustWaveformWidth();
  });

  // Throttle time display updates to every 200ms — matches Shopify template.
  var lastUpdate = 0;
  wavesurfer.on('audioprocess', function () {
    if (!wavesurfer.isPlaying()) return;
    var now = Date.now();
    if (now - lastUpdate > 200) {
      elTime.textContent = formatTime(wavesurfer.getCurrentTime());
      lastUpdate = now;
    }
  });

  elPlayBtn.addEventListener('click', function () {
    wavesurfer.playPause();
    var playing = wavesurfer.isPlaying();
    elPlayIcon.classList.toggle('fa-circle-play', !playing);
    elPlayIcon.classList.toggle('fa-circle-pause', playing);
  });

  wavesurfer.on('finish', function () {
    elPlayIcon.classList.remove('fa-circle-pause');
    elPlayIcon.classList.add('fa-circle-play');
    elTime.textContent = formatTime(wavesurfer.getDuration());
  });

  wavesurfer.on('error', function (error) {
    console.error('WaveSurfer error:', error);
    elAudioLoad.hidden = false;
    elAudioLoad.textContent = 'Lỗi phát âm thanh';
    elPlayer.hidden = true;
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  var slug = getSlug();
  if (!slug) { showError(); return; }

  showLoading();
  fetch(VOICE_GAS_URL + '?action=getVoice&id=' + encodeURIComponent(slug))
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
