/**
 * Regression tests for the worker's /video/* upload relay, loading the REAL
 * pure planners out of cloudflare-worker-voice-proxy.js.
 *
 * What these guard:
 *  1. videoSessionPlan is the abuse gate for opening Drive sessions on the
 *     shop account: identity params required, 500MB size cap, video/* mime.
 *  2. videoChunkPlan's session-prefix check is a security boundary — the
 *     client echoes the session URI per chunk, and without the check the
 *     route would relay arbitrary bodies to arbitrary hosts (SSRF).
 *  3. Chunk math matches Drive's resumable contract: Content-Range strings,
 *     256KiB alignment for non-final chunks, 308 Range → next offset.
 *
 * Run: node tests/worker-video-relay.test.js   (exit 0 = all pass)
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

const H = new Function(
  [
    grab(/const VIDEO_MAX_BYTES = [^\n]*;/, 'VIDEO_MAX_BYTES'),
    grab(/const VIDEO_CHUNK_MAX = [^\n]*;/, 'VIDEO_CHUNK_MAX'),
    grab(/const DRIVE_CHUNK_UNIT = [^\n]*;/, 'DRIVE_CHUNK_UNIT'),
    grab(/const DRIVE_UPLOAD_PREFIX = [^\n]*;/, 'DRIVE_UPLOAD_PREFIX'),
    grab(/const VIDEO_EXT_BY_MIME = \{[\s\S]*?\};/, 'VIDEO_EXT_BY_MIME'),
    grab(/function videoSessionPlan\(params\) \{[\s\S]*?\n\}/, 'videoSessionPlan'),
    grab(/function videoChunkPlan\(p\) \{[\s\S]*?\n\}/, 'videoChunkPlan'),
    grab(/function parseDriveRange\(rangeHeader\) \{[\s\S]*?\n\}/, 'parseDriveRange')
  ].join('\n') + ';return { videoSessionPlan, videoChunkPlan, parseDriveRange, VIDEO_MAX_BYTES };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const S = H.videoSessionPlan;
const C = H.videoChunkPlan;
const R = H.parseDriveRange;
const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=xyz123';

console.log('-- create-session gate --');
const good = S({ phone: '+84 912 345 678', order: 'DH-42', size: 104857600, mime: 'video/mp4' });
ok('valid params accepted', !good.error);
ok('canonical Drive name <digits>_<order>_video.<ext>', good.name === '84912345678_DH-42_video.mp4', good.name);
ok('mov extension from quicktime mime',
   S({ phone: '0912345678', order: 'A', size: 5, mime: 'video/quicktime' }).name === '0912345678_A_video.mov');
ok('unknown video/* mime falls back to mp4',
   S({ phone: '0912345678', order: 'A', size: 5, mime: 'video/x-weird' }).name.slice(-4) === '.mp4');
ok('order sanitized to word chars',
   S({ phone: '0912345678', order: ' DH 42/../x ', size: 5, mime: 'video/mp4' }).name === '0912345678_DH42x_video.mp4');
ok('phone required', !!S({ phone: 'abc', order: 'A', size: 5, mime: 'video/mp4' }).error);
ok('order required', !!S({ phone: '0912345678', order: '///', size: 5, mime: 'video/mp4' }).error);
ok('size over 500MB rejected', !!S({ phone: '0912345678', order: 'A', size: 524288001, mime: 'video/mp4' }).error);
ok('size exactly 500MB accepted', !S({ phone: '0912345678', order: 'A', size: 524288000, mime: 'video/mp4' }).error);
ok('zero/absent size rejected', !!S({ phone: '0912345678', order: 'A', size: 0, mime: 'video/mp4' }).error &&
   !!S({ phone: '0912345678', order: 'A', mime: 'video/mp4' }).error);
ok('non-video mime rejected', !!S({ phone: '0912345678', order: 'A', size: 5, mime: 'audio/mpeg' }).error &&
   !!S({ phone: '0912345678', order: 'A', size: 5, mime: '' }).error);
ok('null input safe', !!S(null).error);

console.log('\n-- chunk relay: SSRF guard --');
ok('real Drive session accepted', !C({ session: SESSION, offset: 0, total: 8388608, len: 8388608 }).error);
ok('other host rejected',
   C({ session: 'https://evil.example.com/upload', offset: 0, total: 100, len: 100 }).error === 'bad session');
ok('Drive prefix embedded mid-URL rejected',
   C({ session: 'https://evil.example.com/?u=https://www.googleapis.com/upload/drive/v3/files',
       offset: 0, total: 100, len: 100 }).error === 'bad session');
ok('oversized session URI rejected',
   C({ session: SESSION + 'x'.repeat(2048), offset: 0, total: 100, len: 100 }).error === 'bad session');

console.log('\n-- chunk relay: range math --');
const mid = C({ session: SESSION, offset: 8388608, total: 104857600, len: 8388608 });
ok('mid chunk Content-Range', mid.contentRange === 'bytes 8388608-16777215/104857600', mid.contentRange);
ok('mid chunk not final', mid.final === false);
const fin = C({ session: SESSION, offset: 104800000, total: 104857600, len: 57600 });
ok('final chunk may be unaligned', !fin.error && fin.final === true);
ok('non-final chunk must be 256KiB-aligned',
   C({ session: SESSION, offset: 0, total: 104857600, len: 1000000 }).error === 'chunk not 256KiB-aligned');
ok('chunk past end rejected',
   C({ session: SESSION, offset: 104857600, total: 104857600, len: 1 }).error === 'chunk past end');
ok('total above cap rejected',
   C({ session: SESSION, offset: 0, total: H.VIDEO_MAX_BYTES + 1, len: 262144 }).error === 'bad total');
ok('oversized single chunk rejected',
   !!C({ session: SESSION, offset: 0, total: 104857600, len: 67108864 }).error);
ok('negative/NaN offset rejected',
   !!C({ session: SESSION, offset: -1, total: 100, len: 10 }).error &&
   !!C({ session: SESSION, offset: 'x', total: 100, len: 10 }).error);

console.log('\n-- 308 Range parsing --');
ok('bytes=0-8388607 → next 8388608', R('bytes=0-8388607') === 8388608);
ok('nothing persisted yet → null', R(null) === null && R('') === null);
ok('garbage → null', R('bytes=*') === null);

console.log('\n-- route wiring pins --');
ok('POST allowed only for /video/*',
   /path\.startsWith\('\/video\/'\)/.test(src) && /handleVideoRelay\(path, url, req, env\)/.test(src));
ok('completion sets anyone-with-link reader',
   /shareFileAnyoneReader/.test(src) && /role: 'reader', type: 'anyone'/.test(src));
ok('chunk PUT carries Content-Range from the plan', /'Content-Range': plan\.contentRange/.test(src));
ok('CORS allows the session header', /'Range, Content-Type, X-Session'/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
