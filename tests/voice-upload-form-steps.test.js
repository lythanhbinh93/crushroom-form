/**
 * Regression tests for the voice stepper form's pure logic, loading the REAL
 * functions out of assets/voice-upload.js.
 *
 * What these guard:
 *  1. Audio stays REQUIRED — the rebuild made the photo optional, and this
 *     suite pins that the same loosening can never silently reach the audio
 *     gate (audio IS the product).
 *  2. Payload parity — finishUpload's non-audio keys match the pre-rebuild
 *     form for identical inputs; keep-flags replace keys only for kept slots.
 *
 * Run: node tests/voice-upload-form-steps.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'voice-upload.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in voice-upload.js: ' + re);
  return m[0];
}

const H = new Function(
  [
    grab(/function vcValidateStep\(step, s\) \{[\s\S]*?\n\}/),
    grab(/function vcBuildFinishPayload\(s\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { vcValidateStep, vcBuildFinishPayload };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- step gating --');
const good = { phoneValid: true, order: 'ORD-1', message: 'yêu em', audioSet: true };
ok('a complete state passes every gate', [0, 1, 2, 3, 4].every(i => H.vcValidateStep(i, good)));
ok('step 0 blocks a bad phone', !H.vcValidateStep(0, { ...good, phoneValid: false }));
ok('step 1 (photo) never blocks — photo is optional', H.vcValidateStep(1, { ...good, message: '' }));
ok('step 2 blocks an empty message', !H.vcValidateStep(2, { ...good, message: '  ' }));
ok('step 2 allows a 1000-char message', H.vcValidateStep(2, { ...good, message: 'x'.repeat(1000) }));
ok('step 3 blocks missing audio — audio IS the product', !H.vcValidateStep(3, { ...good, audioSet: false }));
ok('kept audio satisfies the audio gate', H.vcValidateStep(3, { ...good, audioSet: true }));
ok('step 4 re-checks audio', !H.vcValidateStep(4, { ...good, audioSet: false }));
ok('step 4 re-checks the message', !H.vcValidateStep(4, { ...good, message: '' }));

console.log('\n-- payload parity: non-audio keys match the pre-rebuild form --');
const fresh = H.vcBuildFinishPayload({
  phone: '+84918260494', orderId: 'ORD-1', message: ' yêu em ',
  image: { dataB64: 'IDATA', filename: 'i.jpg', kept: false }
});
ok('fresh-image key set matches the legacy non-audio payload',
   JSON.stringify(Object.keys(fresh).sort()) ===
   JSON.stringify(['action', 'imgData', 'imgFilename', 'order_id', 'phone', 'text_message']),
   JSON.stringify(Object.keys(fresh).sort()));
ok('action is finishUpload (NOT submitCounter — separate handlers by contract)',
   fresh.action === 'finishUpload');
ok('message is trimmed', fresh.text_message === 'yêu em');
const noImage = H.vcBuildFinishPayload({
  phone: 'p', orderId: 'o', message: 'm', image: { dataB64: '', filename: '', kept: false }
});
ok('no image sends the legacy empty pair', noImage.imgData === '' && noImage.imgFilename === '');

console.log('\n-- keep-flag payloads (returning customer) --');
const kept = H.vcBuildFinishPayload({
  phone: 'p', orderId: 'o', message: 'm', image: { dataB64: '', filename: '', kept: true }
});
ok('kept image → keepImage=1 and NO image keys',
   kept.keepImage === '1' && !('imgData' in kept) && !('imgFilename' in kept));
ok('fresh image never carries a keep flag', !('keepImage' in fresh));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
