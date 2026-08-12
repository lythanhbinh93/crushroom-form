/**
 * Regression tests for canonical Drive file naming, loading the REAL
 * driveFileName_ / audioExtFromMime_ out of google-apps-script-voice.js.
 *
 * What these guard:
 *  1. Every media file lands in Drive as <phone>_<order>[_slot].<ext> so staff
 *     can find a customer's files by searching the phone number.
 *  2. No save path lets a client-supplied filename (IMG_3121.jpeg,
 *     "Ghi âm.m4a", …) become the Drive name again — that regression is
 *     exactly what made the folders unsearchable.
 *  3. Audio extensions follow the posted MIME type instead of trusting the
 *     client name.
 *
 * Run: node tests/gas-drive-file-naming.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'google-apps-script-voice.js');
const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in google-apps-script-voice.js: ' + re);
  return m[0];
}

const H = new Function(
  [
    grab(/function driveFileName_\(phone, orderId, slot, ext\) \{[\s\S]*?\n\}/),
    grab(/function audioExtFromMime_\(mime\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { driveFileName_, audioExtFromMime_ };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- canonical name shape --');
ok('slot name is phone_order_slot.ext',
   H.driveFileName_('0912345678', 'DH123', 'male', 'jpg') === '0912345678_DH123_male.jpg');
ok('slotless name is phone_order.ext',
   H.driveFileName_('0912345678', 'DH123', '', 'm4a') === '0912345678_DH123.m4a');

console.log('\n-- audio extension follows MIME --');
ok('audio/mpeg -> mp3', H.audioExtFromMime_('audio/mpeg') === 'mp3');
ok('audio/mp4 -> m4a', H.audioExtFromMime_('audio/mp4') === 'm4a');
ok('audio/x-m4a -> m4a', H.audioExtFromMime_('audio/x-m4a') === 'm4a');
ok('audio/wav -> wav', H.audioExtFromMime_('audio/wav') === 'wav');
ok('audio/webm -> webm', H.audioExtFromMime_('audio/webm') === 'webm');
ok('unknown/blank -> m4a', H.audioExtFromMime_('') === 'm4a');

console.log('\n-- every save path names via driveFileName_ (source pins) --');
const finishSrc = grab(/function handleFinishUpload_\(e\) \{[\s\S]*?\n    \}\n\}/);
ok('finishUpload audio name is canonical',
   finishSrc.indexOf("driveFileName_(phone, orderId, 'audio', audioExtFromMime_(audioMime))") !== -1);
ok('finishUpload image name is canonical',
   finishSrc.indexOf("driveFileName_(phone, orderId, 'image', 'jpg')") !== -1);
ok('finishUpload no longer names by the client audioFilename',
   !/audioFilename = String\(e\.parameter\.audioFilename/.test(finishSrc));
ok('finishUpload no longer names by the client imgFilename',
   !/imgFilename = String\(e\.parameter\.imgFilename/.test(finishSrc));

const counterSrc = grab(/function handleSubmitCounter_\(e\) \{[\s\S]*?\n\}/);
['male', 'female', 'bg'].forEach(function (slot) {
  ok('submitCounter ' + slot + ' image name is canonical',
     counterSrc.indexOf("driveFileName_(phone, orderId, '" + slot + "', 'jpg')") !== -1);
});
ok('submitCounter audio name is canonical',
   counterSrc.indexOf("driveFileName_(phone, orderId, 'audio', audioExtFromMime_(audioMime))") !== -1);
ok('submitCounter passes no client *Filename param into a save',
   !/saveCounterImage_\(e\.parameter\.\w+, e\.parameter\.\w*[Ff]ilename/.test(counterSrc));

const replaceSrc = grab(/function handleReplaceMedia_\(e\) \{[\s\S]*?\n\}/);
ok('replaceMedia image name is canonical',
   replaceSrc.indexOf("driveFileName_(phone, orderId, slot, 'jpg')") !== -1);
ok('replaceMedia audio name is canonical',
   replaceSrc.indexOf('driveFileName_(phone, orderId, slot, audioExtFromMime_(mime))') !== -1);
ok('replaceMedia no longer prefers the client filename',
   !/String\(e\.parameter\.filename \|\| ''\)\.trim\(\) \|\|/.test(replaceSrc));

const initSrc = grab(/function handleInitUpload_\(e\) \{[\s\S]*?\n\}/);
ok('initUpload resumable session name is canonical',
   initSrc.indexOf("driveFileName_(phone, orderId, 'audio', audioExtFromMime_(mimeType))") !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
