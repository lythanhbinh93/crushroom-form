/**
 * Regression tests for the resolution of the gift cover photo, loading the REAL
 * crop and request sizes out of the customer forms, the admin replacement
 * slots, and the two recipient pages.
 *
 * The crop these forms produce is the ONLY copy of the photo that is ever
 * stored: the backend writes those bytes to Drive unchanged and keeps no
 * original, so a photo saved too small can never be recovered — only
 * re-uploaded by the customer. Both gift pages fetch it through Drive's
 * `thumbnail?id=…&sz=w…` endpoint, which serves min(requested, stored) and
 * NEVER upscales.
 *
 * That combination shipped broken: a 400×400 master displayed on a card up to
 * 600 CSS px wide, on 2–3× phone screens, with the page politely asking for
 * `sz=w800` it could never receive. Every voice and image gift published before
 * 2026-09-09 is soft for that reason.
 *
 * Two invariants, and the second is the one that is easy to lose: raising the
 * master alone achieves NOTHING if a page still asks Drive for less than it.
 *
 *   1. every full-size customer photo master is >= MIN_MASTER, square;
 *   2. every page that displays one requests >= the master it displays.
 *
 * The Love Counter avatars are deliberately NOT covered: they render inside a
 * small circle, so 400 is the right master there (pinned by
 * tests/love-counter-form-crop-geometry.test.js).
 *
 * Run: node tests/photo-master-resolution.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const MIN_MASTER = 1200;

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

/** The literal size passed to croppie.result() in a customer upload form. */
function cropMaster(file) {
  const m = read(file).match(
    /croppie\.result\(\{\s*type: 'blob',\s*size: \{ width: (\d+), height: (\d+) \},\s*format: 'jpeg',\s*quality: ([\d.]+)/
  );
  if (!m) throw new Error('croppie.result crop size not found in ' + file);
  return { width: +m[1], height: +m[2], quality: +m[3] };
}

/** Every sz=w<N> width a file requests from Drive's thumbnail endpoint. */
function requestedWidths(file) {
  const src = read(file);
  const out = [];
  let m;
  const literal = /sz=w(\d+)/g;
  while ((m = literal.exec(src)) !== null) out.push(+m[1]);
  // voice-page.js routes through normalizeThumbUrl(url, size): collect the
  // explicit call sites and the `size || N` default they fall back to.
  const dflt = src.match(/&sz=w' \+ \(size \|\| (\d+)\)/);
  if (dflt) out.push(+dflt[1]);
  const calls = src.match(/normalizeThumbUrl\([^)]*?,\s*(\d+)\)/g) || [];
  calls.forEach((c) => out.push(+c.match(/(\d+)\)$/)[1]));
  return out;
}

console.log('-- customer crop masters --');
[
  ['voice-upload.js', 'voice gift cover'],
  ['simple-gift-upload.js', 'image / link / video gift cover']
].forEach(([file, label]) => {
  const c = cropMaster(file);
  ok(label + ' master is >= ' + MIN_MASTER + 'px', c.width >= MIN_MASTER, c.width + 'px');
  ok(label + ' master is square', c.width === c.height, c.width + 'x' + c.height);
  ok(label + ' keeps JPEG quality >= 0.8', c.quality >= 0.8, String(c.quality));
});

console.log('\n-- recipient pages request the whole master --');
const voiceMaster = cropMaster('voice-upload.js').width;
const giftMaster = cropMaster('simple-gift-upload.js').width;

// The cover request is the LARGEST sz=w in each page: both files also build
// small in-form or in-list thumbnails, which are correctly smaller.
const voiceReq = Math.max(...requestedWidths('voice-page.js'));
const giftReq = Math.max(...requestedWidths('gift-page.js'));
ok('voice.html requests >= its master', voiceReq >= voiceMaster, 'w' + voiceReq + ' vs ' + voiceMaster);
ok('gift.html requests >= its master', giftReq >= giftMaster, 'w' + giftReq + ' vs ' + giftMaster);

// The bare default matters on its own: a caller that omits the size argument
// must not silently fall back to a downscale.
const voiceDefault = read('voice-page.js').match(/&sz=w' \+ \(size \|\| (\d+)\)/);
ok('voice-page normalizeThumbUrl default is >= the master',
   voiceDefault && +voiceDefault[1] >= voiceMaster,
   voiceDefault ? 'w' + voiceDefault[1] : 'default not found');

console.log('\n-- admin media replacement matches the customer forms --');
/**
 * Staff replacing a photo must store the same master the customer form does,
 * or a replacement silently downgrades the gift. Square 280 viewport slots are
 * the full-size covers; the 240 circle slots are Love Counter avatars.
 */
const adminSrc = read('admin-voice-tab.js');
const squareSlots = adminSrc.match(
  /viewport: \{ width: 280, height: 280, type: 'square' \},\s*boundary: \{[^}]*\},\s*output: \{ width: (\d+), height: (\d+) \}/g
) || [];
ok('found the 4 square replacement slots (voice, link, image, video)', squareSlots.length === 4,
   String(squareSlots.length));
squareSlots.forEach((slot, i) => {
  const n = +slot.match(/output: \{ width: (\d+)/)[1];
  ok('square replacement slot ' + (i + 1) + ' output matches the customer master',
     n === voiceMaster, n + ' vs ' + voiceMaster);
});

const circleSlots = adminSrc.match(
  /viewport: \{ width: 240, height: 240, type: 'circle' \},\s*boundary: \{[^}]*\},\s*output: \{ width: (\d+), height: (\d+) \}/g
) || [];
ok('Love Counter avatar slots stay 400 (small circular render)',
   circleSlots.length === 2 && circleSlots.every((s) => /output: \{ width: 400/.test(s)),
   String(circleSlots.length));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
