/**
 * Regression tests for the submitCounter keep-flags, loading the REAL
 * resolveKeptMedia_ out of google-apps-script-voice.js.
 *
 * What these guard (contract doc → "submitCounter keep-flags"):
 *  1. A keep-flag can never conjure media out of nothing — no existing row, or
 *     an existing row with a blank cell, resolves to null and the fresh-data
 *     requirement applies unchanged.
 *  2. Fresh data wins over a keep-flag (the handler ORs fresh first; here we
 *     pin the helper's side of the deal: it resolves independently of fresh
 *     data, so the OR is the only precedence rule).
 *  3. Slot→column mapping cannot drift: each flag reads exactly its own
 *     file/url pair.
 *
 * Run: node tests/gas-submit-counter-keep-flags.test.js   (exit 0 = all pass)
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
    grab(/const VOICE_SHEET_HEADERS = \[[\s\S]*?\];/),
    grab(/function rowFromObject_\(obj\) \{[\s\S]*?\n\}/),
    grab(/function resolveKeptMedia_\(params, existingRow\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { VOICE_SHEET_HEADERS, rowFromObject_, resolveKeptMedia_ };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const fullRow = H.rowFromObject_({
  male_image_file_id: 'M1', male_image_url: 'u:M1',
  female_image_file_id: 'F1', female_image_url: 'u:F1',
  bg_file_id: 'B1', bg_url: 'u:B1',
  audio_file_id: 'A1', audio_url: 'u:A1',
  image_file_id: 'M1', image_url: 'u:M1', type: 'counter'
});
const ALL_FLAGS = { keepMale: '1', keepFemale: '1', keepBg: '1', keepAudio: '1' };

console.log('-- flags ignored when no existing row --');
const noRow = H.resolveKeptMedia_(ALL_FLAGS, null);
ok('every slot resolves null without a row',
   noRow.male === null && noRow.female === null && noRow.bg === null && noRow.audio === null);

console.log('\n-- flags honoured against a full row --');
const kept = H.resolveKeptMedia_(ALL_FLAGS, fullRow);
ok('male keeps its own file/url pair', kept.male && kept.male.fileId === 'M1' && kept.male.url === 'u:M1');
ok('female keeps its own pair', kept.female && kept.female.fileId === 'F1' && kept.female.url === 'u:F1');
ok('bg keeps its own pair', kept.bg && kept.bg.fileId === 'B1' && kept.bg.url === 'u:B1');
ok('audio keeps its own pair', kept.audio && kept.audio.fileId === 'A1' && kept.audio.url === 'u:A1');

console.log('\n-- unset flags resolve null even with a row present --');
const partial = H.resolveKeptMedia_({ keepMale: '1' }, fullRow);
ok('only the flagged slot resolves',
   partial.male !== null && partial.female === null && partial.bg === null && partial.audio === null);
ok('a flag value other than "1" is not a flag',
   H.resolveKeptMedia_({ keepMale: 'true' }, fullRow).male === null);

console.log('\n-- keeping an empty slot is just… nothing --');
const sparseRow = H.rowFromObject_({
  male_image_file_id: 'M1', male_image_url: 'u:M1', type: 'counter'
});
const sparse = H.resolveKeptMedia_(ALL_FLAGS, sparseRow);
ok('blank bg/audio/female cells resolve null despite the flags',
   sparse.male !== null && sparse.female === null && sparse.bg === null && sparse.audio === null);
ok('whitespace-only cell counts as blank',
   H.resolveKeptMedia_(ALL_FLAGS, H.rowFromObject_({ bg_file_id: '  ' })).bg === null);

console.log('\n-- fresh-wins precedence lives in the handler: pin the OR order --');
// The handler must OR fresh media FIRST (save || kept). Assert the source
// keeps that order for all three image slots so a refactor cannot flip it.
const handlerSrc = grab(/function handleSubmitCounter_\(e\) \{[\s\S]*?\n\}/);
['male', 'female', 'bg'].forEach(function (slot) {
  const re = new RegExp('saveCounterImage_\\([^)]*\\) \\|\\| keptMedia\\.' + slot);
  ok(slot + ' resolves fresh-first (save || kept)', re.test(handlerSrc));
});
ok('fresh audio branches before kept audio',
   handlerSrc.indexOf('if (audioData) {') !== -1 &&
   handlerSrc.indexOf('} else if (keptMedia.audio) {') > handlerSrc.indexOf('if (audioData) {'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
