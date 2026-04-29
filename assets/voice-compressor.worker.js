/**
 * voice-compressor.worker.js — Web Worker for audio resampling + MP3 encoding.
 *
 * Receives: { samples: Float32Array, sampleRate: number }
 *   (samples is mono PCM at the original AudioContext sample rate)
 *
 * Posts back:
 *   { type: 'progress', pct: number }   — during encode, every ~10 frames
 *   { type: 'done', mp3Bytes: Int8Array[] } — array of lamejs chunk arrays
 *   { type: 'error', msg: string }       — on any failure
 *
 * Worker is terminated by the caller after 'done' or 'error'.
 */

/* global importScripts, lamejs */

// M7: Load lamejs from vendored local copy (assets/vendor/lame.min.js).
// Vendored from cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js to eliminate:
//   - CDN supply-chain risk (jsdelivr re-publishing)
//   - Shopify strict-CSP 'worker-src: self' blocks on external importScripts
//   - CDN availability dependency
// Relative path resolves relative to the Worker script URL, not the page URL.
// If the Worker is served from a cross-origin URL (e.g., Shopify CDN proxy),
// new Worker() will fail before reaching this line — fix at the call site.
importScripts('./vendor/lame.min.js');

var TARGET_SAMPLE_RATE = 24000; // 24kHz — sufficient for voice (telephony = 8kHz)
var TARGET_BITRATE = 64;        // kbps — 64kbps mono voice is indistinguishable from source
var FRAME_SIZE = 1152;          // lamejs Mp3Encoder required frame size
var PROGRESS_INTERVAL = 10;     // report progress every N frames

/**
 * Linear-interpolation resampler — sufficient for voice at 64kbps.
 * Anti-alias filter is not needed at this quality target.
 *
 * @param {Float32Array} input       PCM samples at inputRate
 * @param {number}       inputRate   Source sample rate (e.g. 44100, 48000)
 * @param {number}       outputRate  Target sample rate (24000)
 * @returns {Float32Array}
 */
function resample(input, inputRate, outputRate) {
  if (inputRate === outputRate) return input;
  var ratio = inputRate / outputRate;
  var outputLength = Math.floor(input.length / ratio);
  var output = new Float32Array(outputLength);
  for (var i = 0; i < outputLength; i++) {
    var srcPos = i * ratio;
    var srcIdx = Math.floor(srcPos);
    var frac = srcPos - srcIdx;
    var a = input[srcIdx] || 0;
    // Guard against reading past the end of input on the last sample.
    var b = srcIdx + 1 < input.length ? input[srcIdx + 1] : a;
    output[i] = a + frac * (b - a);
  }
  return output;
}

/**
 * Convert Float32 PCM [-1, 1] to Int16 PCM [-32768, 32767].
 * Clamp explicitly to handle occasional out-of-range values from decoders.
 *
 * @param {Float32Array} floatSamples
 * @returns {Int16Array}
 */
function floatToInt16(floatSamples) {
  var int16 = new Int16Array(floatSamples.length);
  for (var i = 0; i < floatSamples.length; i++) {
    // Clamp to [-1, 1] before scaling to guard against decoder overshoot.
    var clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    int16[i] = clamped < 0
      ? Math.round(clamped * 32768)
      : Math.round(clamped * 32767);
  }
  return int16;
}

/**
 * Encode Int16 PCM to MP3 using lamejs, reporting progress periodically.
 * Returns an array of Int8Array chunks (lamejs output format).
 *
 * @param {Int16Array} pcm16
 * @returns {Int8Array[]}
 */
function encodeMp3(pcm16) {
  var encoder = new lamejs.Mp3Encoder(1, TARGET_SAMPLE_RATE, TARGET_BITRATE);
  var chunks = [];
  var totalFrames = Math.ceil(pcm16.length / FRAME_SIZE);

  for (var frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    var start = frameIdx * FRAME_SIZE;
    var end = Math.min(start + FRAME_SIZE, pcm16.length);
    // subarray is a view (no copy) — lamejs reads it synchronously.
    var frame = pcm16.subarray(start, end);
    var chunk = encoder.encodeBuffer(frame);
    if (chunk.length > 0) chunks.push(chunk);

    // Report progress every PROGRESS_INTERVAL frames.
    if ((frameIdx + 1) % PROGRESS_INTERVAL === 0 || frameIdx === totalFrames - 1) {
      var pct = Math.round(((frameIdx + 1) / totalFrames) * 100);
      self.postMessage({ type: 'progress', pct: pct });
    }
  }

  // Flush any remaining buffered data from the encoder.
  var finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(finalChunk);

  return chunks;
}

/**
 * Main message handler — entry point for the Worker.
 * Expects { samples: Float32Array, sampleRate: number }.
 */
self.onmessage = function (evt) {
  try {
    var samples = evt.data.samples;
    var sampleRate = evt.data.sampleRate;

    if (!samples || samples.length === 0) {
      self.postMessage({ type: 'error', msg: 'EMPTY_SAMPLES' });
      return;
    }

    // Step 1: Resample to 24kHz (no-op if already at target rate).
    var resampled = resample(samples, sampleRate, TARGET_SAMPLE_RATE);

    // Step 2: Convert Float32 PCM to Int16 PCM (lamejs input format).
    var pcm16 = floatToInt16(resampled);

    // Step 3: Encode to MP3. Progress events fired inside encodeMp3.
    var mp3Chunks = encodeMp3(pcm16);

    self.postMessage({ type: 'done', mp3Bytes: mp3Chunks });
  } catch (e) {
    self.postMessage({ type: 'error', msg: e.message || String(e) });
  }
};
