/**
 * Regression tests for the shared simple-gift form logic, loading the REAL
 * functions out of assets/simple-gift-upload.js.
 *
 * What these guard:
 *  1. Step gating: the link is required on link gifts, the photo on image
 *     gifts, and optional steps never block.
 *  2. Payload shape matches the submitGift contract: kept image → keepImage=1
 *     and NO image key; media_link only on link gifts; message optional.
 *  3. The client link check mirrors the server allowlist (server stays
 *     authoritative — this only powers inline validation).
 *
 * Run: node tests/simple-gift-form-steps.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'simple-gift-upload.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const gasSrc = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-voice.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(source, re, name) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate ' + name);
  return m[0];
}

const H = new Function(
  [
    grab(src, /var SG_LINK_HOSTS = \[[\s\S]*?\];/, 'SG_LINK_HOSTS'),
    grab(src, /var SG_VIDEO_MAX_BYTES = [^\n]*;/, 'SG_VIDEO_MAX_BYTES'),
    grab(src, /var SG_VIDEO_CHUNK = [^\n]*;/, 'SG_VIDEO_CHUNK'),
    grab(src, /function sgIsAllowedLink\(url\) \{[\s\S]*?\n\}/, 'sgIsAllowedLink'),
    grab(src, /function sgVideoFileCheck\(file\) \{[\s\S]*?\n\}/, 'sgVideoFileCheck'),
    grab(src, /function sgRequirementMet\(requirement, s\) \{[\s\S]*?\n\}/, 'sgRequirementMet'),
    grab(src, /function sgBuildPayload\(s\) \{[\s\S]*?\n\}/, 'sgBuildPayload'),
    grab(src, /function sgIsLocked\(sub\) \{[\s\S]*?\n\}/, 'sgIsLocked')
  ].join('\n') + ';return { SG_LINK_HOSTS, SG_VIDEO_MAX_BYTES, SG_VIDEO_CHUNK, sgIsAllowedLink, sgVideoFileCheck, sgRequirementMet, sgBuildPayload, sgIsLocked };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- client allowlist mirrors the server --');
const serverHosts = JSON.parse(
  grab(gasSrc, /var GIFT_LINK_HOSTS = \[[\s\S]*?\];/, 'server hosts')
    .replace('var GIFT_LINK_HOSTS = ', '').replace(/;$/, '').replace(/'/g, '"'));
ok('same hosts, same order', JSON.stringify(H.SG_LINK_HOSTS) === JSON.stringify(serverHosts));

console.log('\n-- step gating --');
const s = { phoneValid: true, order: 'A1', link: 'https://youtu.be/dQw4w9WgXcQ', photoSet: true, message: '' };
ok('phone step needs valid phone + order',
   H.sgRequirementMet('phone', s) && !H.sgRequirementMet('phone', { ...s, phoneValid: false }) &&
   !H.sgRequirementMet('phone', { ...s, order: ' ' }));
ok('link step needs an allowlisted https link',
   H.sgRequirementMet('link', s) && !H.sgRequirementMet('link', { ...s, link: 'https://evil.vn/x' }) &&
   !H.sgRequirementMet('link', { ...s, link: '' }));
ok('drive video link passes the link step',
   H.sgRequirementMet('link', { ...s, link: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view' }));
const videoP = H.sgBuildPayload({ type: 'video', phone: '+84912345678', orderId: 'A1',
  link: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', message: '',
  image: { dataB64: '', kept: false } });
ok('video payload carries media_link like link',
   videoP.type === 'video' && videoP.media_link ===
   'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view');

console.log('\n-- in-form video upload --');
ok('uploaded file id beats a pasted link in the payload', (function () {
  const p = H.sgBuildPayload({ type: 'video', phone: '+84', orderId: 'A',
    link: 'https://youtu.be/dQw4w9WgXcQ', message: '',
    videoFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    image: { dataB64: '', kept: false } });
  return p.video_file_id === '1AbCdEfGhIjKlMnOpQrStUvWxYz012345' && !('media_link' in p);
})());
ok('link gifts never send video_file_id', (function () {
  const p = H.sgBuildPayload({ type: 'link', phone: '+84', orderId: 'A',
    link: 'https://youtu.be/dQw4w9WgXcQ', message: '',
    videoFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    image: { dataB64: '', kept: false } });
  return p.media_link === 'https://youtu.be/dQw4w9WgXcQ' && !('video_file_id' in p);
})());
ok('completed upload satisfies the media step without a link',
   H.sgRequirementMet('link', { ...s, link: '', videoFileId: 'X'.repeat(28) }));
ok('running upload satisfies the media step (submit gates separately)',
   H.sgRequirementMet('link', { ...s, link: '', videoUploading: true }));
ok('file check: good video passes', !!H.sgVideoFileCheck({ type: 'video/mp4', size: 1048576 }).ok);
ok('file check: 500MB boundary', !!H.sgVideoFileCheck({ type: 'video/mp4', size: H.SG_VIDEO_MAX_BYTES }).ok &&
   H.sgVideoFileCheck({ type: 'video/mp4', size: H.SG_VIDEO_MAX_BYTES + 1 }).error === 'too big');
ok('file check: non-video rejected', H.sgVideoFileCheck({ type: 'image/jpeg', size: 5 }).error === 'not video');
ok('file check: typeless file tolerated (mobile browsers omit mime)',
   !!H.sgVideoFileCheck({ type: '', size: 5 }).ok);
ok('file check: empty/no file rejected',
   !!H.sgVideoFileCheck({ type: 'video/mp4', size: 0 }).error && !!H.sgVideoFileCheck(null).error);

console.log('\n-- upload caps mirror the worker relay --');
const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-worker-voice-proxy.js'), 'utf8');
ok('client max bytes equals worker VIDEO_MAX_BYTES',
   workerSrc.indexOf('const VIDEO_MAX_BYTES = ' + H.SG_VIDEO_MAX_BYTES) !== -1);
ok('chunk size is 256KiB-aligned and under the relay cap',
   H.SG_VIDEO_CHUNK % 262144 === 0 && H.SG_VIDEO_CHUNK <= 33554432);
ok('photo step needs a photo', H.sgRequirementMet('photo', s) && !H.sgRequirementMet('photo', { ...s, photoSet: false }));
ok('optional steps never block', H.sgRequirementMet('none', { ...s, link: '', photoSet: false, message: '' }));

console.log('\n-- payload contract --');
const base = { type: 'link', phone: '+84912345678', orderId: 'A1',
  link: ' https://youtu.be/dQw4w9WgXcQ ', message: ' hi ', image: { dataB64: '', kept: false } };
const linkP = H.sgBuildPayload(base);
ok('link payload: action/type/link trimmed, no image keys',
   linkP.action === 'submitGift' && linkP.type === 'link' &&
   linkP.media_link === 'https://youtu.be/dQw4w9WgXcQ' && linkP.text_message === 'hi' &&
   !('imgData' in linkP) && !('keepImage' in linkP));
const imgP = H.sgBuildPayload({ ...base, type: 'image', image: { dataB64: 'DATA', kept: false } });
ok('image payload: fresh photo, no media_link',
   imgP.imgData === 'DATA' && !('media_link' in imgP) && !('keepImage' in imgP));
const keptP = H.sgBuildPayload({ ...base, type: 'image', image: { dataB64: '', kept: true } });
ok('kept photo → keepImage=1 and NO image key',
   keptP.keepImage === '1' && !('imgData' in keptP));

console.log('\n-- publish-lock predicate + wiring pins --');
ok('published locks, pending does not',
   H.sgIsLocked({ status: 'published' }) && !H.sgIsLocked({ status: 'pending' }) && !H.sgIsLocked(null));
ok('hydration is skipped for a locked submission (source pin)',
   /sgIsLocked\(resp\.submission\)[\s\S]{0,80}else hydrateFromSubmission/.test(src));
ok('server published_locked maps to the locked panel (source pin)',
   /published_locked'\) \{[\s\S]{0,120}showLockedPanel\(\)/.test(src));
// This claims parity with the voice form, so it READS the voice form. Pinning
// the numbers here instead let both forms be wrong together: they shipped
// matching 400x400 masters that were too small for either recipient page.
const voiceSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'voice-upload.js'), 'utf8');
const cropOf = (s) => (s.match(/size: \{ width: (\d+), height: (\d+) \},\s*format: 'jpeg',\s*quality: ([\d.]+)/) || []).slice(1).join('x');
ok('crop geometry matches the voice form (admin mirrors depend on it)',
   /viewport: \{ width: 280, height: 280, type: 'square' \}/.test(src) &&
   /viewport: \{ width: 280, height: 280, type: 'square' \}/.test(voiceSrc) &&
   !!cropOf(src) && cropOf(src) === cropOf(voiceSrc),
   cropOf(src) + ' vs voice ' + cropOf(voiceSrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
