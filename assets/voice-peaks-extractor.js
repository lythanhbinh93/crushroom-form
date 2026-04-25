/**
 * voice-peaks-extractor.js — pre-decode audio in customer's browser to
 * extract waveform peaks. Stored alongside the audio so the recipient page
 * can render the waveform without re-decoding.
 *
 * Peaks are SIGNED [-1, 1]: per bucket we keep the sample with largest
 * |amplitude| but preserve its sign, matching WaveSurfer's render contract.
 *
 * Returns null on any failure — upload proceeds without peaks; recipient
 * falls back to a CSS-only decorative bar pattern.
 */
window.extractPeaks = function (file, buckets) {
  buckets = buckets || 200;
  return file.arrayBuffer()
    .then(function (buf) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('AudioContext unsupported');
      var probe = new Ctx();
      return probe.decodeAudioData(buf).then(function (audioBuf) {
        if (probe.close) probe.close();
        var ch = audioBuf.getChannelData(0);
        var step = Math.max(1, Math.floor(ch.length / buckets));
        var peaks = new Array(buckets);
        for (var b = 0; b < buckets; b++) {
          var peak = 0;
          var start = b * step;
          var end = Math.min(start + step, ch.length);
          for (var i = start; i < end; i++) {
            var v = ch[i];
            if (Math.abs(v) > Math.abs(peak)) peak = v;
          }
          peaks[b] = +peak.toFixed(4);
        }
        return { peaks: peaks, duration: audioBuf.duration };
      });
    })
    .catch(function (err) {
      console.warn('[peaks] extraction failed, will upload without peaks:', err);
      return null;
    });
};
