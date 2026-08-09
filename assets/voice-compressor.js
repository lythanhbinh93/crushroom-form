/**
 * voice-compressor.js — main-thread API for client-side audio compression.
 * Public API: window.compressAudio(blob, { onProgress })
 *   → Promise<{ blob, mime, durationSec, sizeBytes, transcoded: boolean }>
 * Decode: main thread (AudioContext unavailable in Workers).
 * Resample + MP3 encode: voice-compressor.worker.js (off-UI-thread).
 * Skip rule: audio/mpeg|ogg at ≤80kbps → passthrough (transcoded:false).
 */

(function () {
  'use strict';

  // Lazily created AudioContext — reuse across calls to avoid OS limit on
  // AudioContext instances (Chrome enforces a per-page cap of ~6).
  var _audioCtx = null;

  function getAudioContext() {
    if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext unsupported');
    _audioCtx = new Ctx();
    return _audioCtx;
  }

  // Read a Blob into an ArrayBuffer via FileReader.
  function blobToArrayBuffer(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(blob);
    });
  }

  // Skip-rule: passthrough if audio/mpeg|ogg AND bitrate ≤80kbps.
  // Bitrate estimate = (sizeBytes × 8) / durationSec.
  function shouldSkipTranscode(mime, sizeBytes, durationSec) {
    if (!mime) return false;
    var isCompressed = /^audio\/(mpeg|ogg)/.test(mime);
    if (!isCompressed) return false;
    if (durationSec <= 0) return false;
    var bitrateKbps = (sizeBytes * 8) / durationSec / 1000;
    return bitrateKbps <= 80;
  }

  // Downmix to mono: stereo → average L+R; mono → channel 0 slice.
  function downmixToMono(audioBuffer) {
    var length = audioBuffer.length;
    if (audioBuffer.numberOfChannels === 1) {
      // Slice to own a detached buffer we can transfer to the Worker.
      return audioBuffer.getChannelData(0).slice();
    }
    var left = audioBuffer.getChannelData(0);
    var right = audioBuffer.getChannelData(1);
    var mono = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      mono[i] = (left[i] + right[i]) * 0.5;
    }
    return mono;
  }

  // Spawn Worker, post mono PCM, collect MP3 Blob. Returns Promise<Blob>.
  function encodeWithWorker(samples, sampleRate, onProgress) {
    return new Promise(function (resolve, reject) {
      var worker;
      var settled = false;
      var timeoutId = null;

      // M8: Prefer document.currentScript.src for robust URL resolution.
      // Falls back to script-tag scan for cases where currentScript is null
      // (e.g., async/defer script, some embed contexts).
      function resolveWorkerUrl() {
        // Primary: document.currentScript is set during synchronous script execution.
        if (document.currentScript && document.currentScript.src) {
          return document.currentScript.src.replace('voice-compressor.js',
            'voice-compressor.worker.js');
        }
        // Fallback: scan all script tags.
        var scripts = document.getElementsByTagName('script');
        for (var s = 0; s < scripts.length; s++) {
          if (/voice-compressor\.js/.test(scripts[s].src)) {
            return scripts[s].src.replace('voice-compressor.js',
              'voice-compressor.worker.js');
          }
        }
        // Last resort: relative path (may not work on Shopify /pages/ paths).
        return './assets/voice-compressor.worker.js';
      }

      try {
        var workerUrl = resolveWorkerUrl();
        worker = new Worker(workerUrl);
      } catch (e) {
        reject('WORKER_INIT_FAILED');
        return;
      }

      // M3: 60-second timeout guards against Worker hangs (e.g., Safari CSP that
      // silently swallows errors instead of firing onerror).
      timeoutId = setTimeout(function () {
        if (!settled) {
          settled = true;
          worker.terminate();
          reject('WORKER_TIMEOUT');
        }
      }, 60000);

      function finish(fn) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        fn();
      }

      // M4: preventDefault() suppresses re-throw to window.onerror / Sentry noise.
      worker.onerror = function (evt) {
        evt.preventDefault();
        finish(function () {
          worker.terminate();
          reject(evt.message || 'WORKER_INIT_FAILED');
        });
      };

      worker.onmessage = function (evt) {
        var msg = evt.data;
        if (msg.type === 'progress') {
          if (typeof onProgress === 'function') onProgress(msg.pct);
        } else if (msg.type === 'done') {
          finish(function () {
            worker.terminate();
            // mp3Bytes is an Array of Int8Array chunks from lamejs
            var mp3Blob = new Blob(msg.mp3Bytes, { type: 'audio/mpeg' });
            resolve(mp3Blob);
          });
        } else if (msg.type === 'error') {
          finish(function () {
            worker.terminate();
            reject(msg.msg || 'ENCODE_ERROR');
          });
        }
      };

      // Transfer the underlying ArrayBuffer to avoid a copy across the Worker
      // message boundary (samples buffer is neutered after this call).
      worker.postMessage(
        { samples: samples, sampleRate: sampleRate },
        [samples.buffer]
      );
    });
  }

  // Public API: compress any audio blob → 64kbps mono MP3.
  // opts.onProgress(0–100) called during encode.
  window.compressAudio = function (blob, opts) {
    opts = opts || {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    if (!blob || blob.size === 0) {
      return Promise.reject('EMPTY_BLOB');
    }

    var inputMime = blob.type || '';
    var ctx;

    return blobToArrayBuffer(blob)
      .then(function (arrayBuf) {
        try {
          ctx = getAudioContext();
        } catch (e) {
          return Promise.reject('DECODE_FAILED:' + inputMime);
        }
        return ctx.decodeAudioData(arrayBuf);
      })
      .then(function (audioBuffer) {
        var durationSec = audioBuffer.duration;

        // Skip-rule: passthrough if already a compact MP3/Ogg at ≤80kbps.
        if (shouldSkipTranscode(inputMime, blob.size, durationSec)) {
          return {
            blob: blob,
            mime: inputMime,
            durationSec: durationSec,
            sizeBytes: blob.size,
            transcoded: false
          };
        }

        var samples = downmixToMono(audioBuffer);
        var sampleRate = audioBuffer.sampleRate;

        return encodeWithWorker(samples, sampleRate, onProgress)
          .then(function (mp3Blob) {
            return {
              blob: mp3Blob,
              mime: 'audio/mpeg',
              durationSec: durationSec,
              sizeBytes: mp3Blob.size,
              transcoded: true
            };
          });
      })
      .catch(function (err) {
        // Re-throw structured error codes; wrap raw decode errors.
        if (typeof err === 'string') throw err;
        throw 'DECODE_FAILED:' + inputMime;
      });
  };

}());
