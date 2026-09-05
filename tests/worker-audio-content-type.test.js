/**
 * Regression tests for the worker's audio Content-Type recovery, loading the
 * REAL helpers out of cloudflare-worker-voice-proxy.js.
 *
 * What these guard:
 *  1. Drive's uc?export=media serves every non-MP3 upload as
 *     application/octet-stream. iOS AVFoundation refuses to open an untyped
 *     stream on an extension-less URL (Chromium sniffs the container and hides
 *     the problem), so the worker must recover the type from the magic bytes.
 *     Trigger: voice?id=970658f1c6 — a QuickTime clip uploaded as "audio".
 *  2. A trustworthy upstream label (audio/mpeg on the compressed happy path)
 *     is returned untouched — MP3 rows never pay for the sniff.
 *  3. The async resolver degrades to the pre-sniff label on every failure
 *     (non-OK upstream, sniff throw, sniff 4xx) and never buffers more than
 *     the sniff window even when Drive ignores the Range.
 *  4. The audio route wires the resolver in and never copies Drive's opaque
 *     label straight through.
 *
 * Run: node tests/worker-audio-content-type.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-worker-voice-proxy.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(re, label) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in worker: ' + label);
  return m[0];
}

// `fetch` is injected so the async resolver runs against canned responses.
const build = new Function(
  'fetch',
  [
    grab(/const AUDIO_SNIFF_BYTES = [^\n]*;/, 'AUDIO_SNIFF_BYTES'),
    grab(/function isOpaqueContentType\(contentType\) \{[\s\S]*?\n\}/, 'isOpaqueContentType'),
    grab(/function audioContentTypeFromBytes\(bytes, upstreamType\) \{[\s\S]*?\n\}/, 'audioContentTypeFromBytes'),
    grab(/async function resolveAudioContentType\(driveUrl, fileId, upstream\) \{[\s\S]*?\n\}/, 'resolveAudioContentType'),
    grab(/async function readLeadingBytes\(stream, limit\) \{[\s\S]*?\n\}/, 'readLeadingBytes'),
  ].join('\n') + ';return { isOpaqueContentType, audioContentTypeFromBytes, resolveAudioContentType, readLeadingBytes, AUDIO_SNIFF_BYTES };'
);
const H = build(function () { throw new Error('fetch not stubbed'); });

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const T = H.audioContentTypeFromBytes;
const OPAQUE = 'application/octet-stream';

// Leading bytes as a real container writes them; padded to the sniff window.
function head(bytes) {
  const out = new Uint8Array(H.AUDIO_SNIFF_BYTES);
  out.set(bytes.slice(0, out.length));
  return out;
}
function fourcc(box, brand) {
  // MP4/MOV: [size:4][ 'ftyp' ][major brand:4]
  return head([0, 0, 0, 0x14, ...Buffer.from(box), ...Buffer.from(brand)]);
}

console.log('-- opaque-label detection --');
ok('octet-stream is opaque', H.isOpaqueContentType(OPAQUE));
ok('application/binary is opaque', H.isOpaqueContentType('application/binary'));
ok('missing label is opaque', H.isOpaqueContentType('') && H.isOpaqueContentType(null));
ok('parameters do not hide an opaque label', H.isOpaqueContentType('application/octet-stream; charset=binary'));
ok('audio/mpeg is trusted', !H.isOpaqueContentType('audio/mpeg'));

console.log('\n-- trusted upstream label passes through --');
ok('audio/mpeg kept even when bytes say QuickTime',
   T(fourcc('ftyp', 'qt  '), 'audio/mpeg') === 'audio/mpeg');
ok('audio/mp4 kept verbatim', T(new Uint8Array(0), 'audio/mp4') === 'audio/mp4');

console.log('\n-- container signatures --');
ok('QuickTime brand (the 970658f1c6 file) → video/quicktime',
   T(fourcc('ftyp', 'qt  '), OPAQUE) === 'video/quicktime');
ok('QuickTime without ftyp (moov first) → video/quicktime',
   T(fourcc('moov', '\0\0\0l'), OPAQUE) === 'video/quicktime');
ok('QuickTime without ftyp (wide first) → video/quicktime',
   T(fourcc('wide', '\0\0\0\0'), OPAQUE) === 'video/quicktime');
ok('M4A brand → audio/mp4', T(fourcc('ftyp', 'M4A '), OPAQUE) === 'audio/mp4');
ok('M4B brand → audio/mp4', T(fourcc('ftyp', 'M4B '), OPAQUE) === 'audio/mp4');
ok('isom brand → video/mp4', T(fourcc('ftyp', 'isom'), OPAQUE) === 'video/mp4');
ok('mp42 brand → video/mp4', T(fourcc('ftyp', 'mp42'), OPAQUE) === 'video/mp4');
ok('ID3-tagged MP3 → audio/mpeg', T(head([...Buffer.from('ID3'), 4, 0, 0]), OPAQUE) === 'audio/mpeg');
ok('raw MPEG frame sync (0xFFF3) → audio/mpeg', T(head([0xff, 0xf3, 0x84, 0xc4]), OPAQUE) === 'audio/mpeg');
ok('raw MPEG frame sync (0xFFFB) → audio/mpeg', T(head([0xff, 0xfb, 0x90, 0x00]), OPAQUE) === 'audio/mpeg');
ok('WAV → audio/wav', T(head([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]), OPAQUE) === 'audio/wav');
ok('AIFF → audio/aiff', T(head([...Buffer.from('FORM'), 0, 0, 0, 0, ...Buffer.from('AIFF')]), OPAQUE) === 'audio/aiff');
ok('AIFC → audio/aiff', T(head([...Buffer.from('FORM'), 0, 0, 0, 0, ...Buffer.from('AIFC')]), OPAQUE) === 'audio/aiff');
ok('Ogg → audio/ogg', T(head(Buffer.from('OggS')), OPAQUE) === 'audio/ogg');
ok('FLAC → audio/flac', T(head(Buffer.from('fLaC')), OPAQUE) === 'audio/flac');
ok('WebM/EBML → audio/webm', T(head([0x1a, 0x45, 0xdf, 0xa3]), OPAQUE) === 'audio/webm');
ok('CAF → audio/x-caf', T(head(Buffer.from('caff')), OPAQUE) === 'audio/x-caf');

console.log('\n-- degradation --');
ok('unknown bytes fall back to audio/mpeg (pre-sniff behaviour)',
   T(head([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), OPAQUE) === 'audio/mpeg');
ok('empty sniff falls back to audio/mpeg', T(new Uint8Array(0), OPAQUE) === 'audio/mpeg');
ok('RIFF without WAVE is not wav', T(head(Buffer.from('RIFF....AVI ')), OPAQUE) !== 'audio/wav');
ok('FORM without AIFF is not aiff', T(head(Buffer.from('FORM....XXXX')), OPAQUE) !== 'audio/aiff');
ok('0xFF followed by a non-sync byte is not treated as a frame (no throw, falls back)',
   (function () { try { return T(new Uint8Array([0xff, 0x00]), OPAQUE) === 'audio/mpeg'; } catch (e) { return false; } })());
ok('plain ArrayBuffer input accepted', T(fourcc('ftyp', 'qt  ').buffer, OPAQUE) === 'video/quicktime');

// ---------------------------------------------------------------------------
// Async resolver against canned fetch responses
// ---------------------------------------------------------------------------
function upstreamOf(status, contentType) {
  const h = new Headers();
  if (contentType != null) h.set('content-type', contentType);
  return { ok: status >= 200 && status < 300, status, headers: h };
}
function streamOf(chunks) {
  let i = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (i < chunks.length) ctrl.enqueue(new Uint8Array(chunks[i++]));
      else ctrl.close();
    },
  });
}
function resolverWith(fetchImpl) {
  return build(fetchImpl).resolveAudioContentType;
}
const QT_HEAD = Array.from(fourcc('ftyp', 'qt  '));
const URL_ = 'https://drive.google.com/uc?export=media&id=fileA';

(async function () {
  console.log('\n-- async resolver --');

  let calls = 0;
  let r = resolverWith(async function () { calls++; return new Response(streamOf([QT_HEAD]), { status: 206 }); });
  ok('trusted label returns without a sniff fetch',
     await r(URL_, 'fileA', upstreamOf(200, 'audio/mpeg')) === 'audio/mpeg' && calls === 0);
  ok('non-OK upstream keeps its label and skips the sniff',
     await r(URL_, 'fileA', upstreamOf(404, OPAQUE)) === OPAQUE && calls === 0);
  ok('non-OK upstream with no label falls back to audio/mpeg',
     await r(URL_, 'fileA', upstreamOf(502, null)) === 'audio/mpeg' && calls === 0);
  ok('opaque label on a 206 upstream sniffs and resolves QuickTime',
     await r(URL_, 'fileA', upstreamOf(206, OPAQUE)) === 'video/quicktime' && calls === 1);
  ok('missing label sniffs too',
     await r(URL_, 'fileA', upstreamOf(200, null)) === 'video/quicktime' && calls === 2);

  let seen = null;
  r = resolverWith(async function (url, init) { seen = { url, init }; return new Response(streamOf([QT_HEAD]), { status: 206 }); });
  await r(URL_, 'fileA', upstreamOf(200, OPAQUE));
  ok('sniff requests bytes 0-11 of the same Drive URL',
     seen && seen.url === URL_ && seen.init.headers.Range === 'bytes=0-' + (H.AUDIO_SNIFF_BYTES - 1));
  ok('sniff uses its own cache key, outside the client Range key space',
     seen && seen.init.cf.cacheKey === 'voice-proxy:sniff:fileA' && seen.init.cf.cacheEverything === true);

  r = resolverWith(async function () { throw new Error('network down'); });
  ok('sniff fetch throwing degrades to audio/mpeg, not an error',
     await r(URL_, 'fileA', upstreamOf(200, OPAQUE)) === 'audio/mpeg');

  r = resolverWith(async function () { return new Response('nope', { status: 403 }); });
  ok('sniff 4xx degrades to audio/mpeg',
     await r(URL_, 'fileA', upstreamOf(200, OPAQUE)) === 'audio/mpeg');

  r = resolverWith(async function () { return new Response(null, { status: 204 }); });
  ok('sniff with no body degrades to audio/mpeg',
     await r(URL_, 'fileA', upstreamOf(200, OPAQUE)) === 'audio/mpeg');

  // Drive ignoring the Range: a 200 with a multi-megabyte body. The reader
  // must stop after the sniff window and cancel the rest.
  let pulled = 0;
  const big = new ReadableStream({
    pull(ctrl) {
      pulled++;
      // 5 header bytes, then the rest of the header inside a 64 KiB chunk, then endless filler.
      const chunk = pulled === 1 ? QT_HEAD.slice(0, 5)
        : pulled === 2 ? QT_HEAD.slice(5).concat(new Array(65536).fill(7))
        : new Array(65536).fill(7);
      ctrl.enqueue(new Uint8Array(chunk));
    },
  });
  r = resolverWith(async function () { return new Response(big, { status: 200 }); });
  const bigType = await r(URL_, 'fileA', upstreamOf(200, OPAQUE));
  ok('sniff across chunk boundaries still resolves (5 + N bytes)', bigType === 'video/quicktime', bigType);
  ok('sniff stops reading after the window instead of buffering the file', pulled <= 3, 'pulled=' + pulled);

  const bytes = await H.readLeadingBytes(streamOf([[1, 2], [3, 4, 5], [6, 7, 8, 9, 10, 11, 12, 13, 14]]), H.AUDIO_SNIFF_BYTES);
  ok('readLeadingBytes concatenates chunks up to the limit',
     bytes.length === H.AUDIO_SNIFF_BYTES && bytes[0] === 1 && bytes[11] === 12);
  const short = await H.readLeadingBytes(streamOf([[1, 2, 3]]), H.AUDIO_SNIFF_BYTES);
  ok('readLeadingBytes returns fewer bytes for a short stream', short.length === 3);

  console.log('\n-- audio route wiring pins --');
  const audioRoute = grab(/async function handleAudio\(req, fileId\) \{[\s\S]*?\n\}/, 'handleAudio');
  ok('route sets Content-Type through the resolver',
     /headers\.set\('Content-Type', await resolveAudioContentType\(driveUrl, fileId, upstream\)\)/.test(audioRoute));
  ok('route no longer copies the upstream content-type header verbatim',
     !/'content-type'/.test(audioRoute));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
