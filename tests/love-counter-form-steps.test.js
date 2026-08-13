/**
 * Regression tests for the Love Counter stepper form's pure logic, loading the
 * REAL functions out of assets/love-counter-upload.js.
 *
 * What these guard:
 *  1. Payload parity — for a new customer the sheet POST must equal the old
 *     stacked form's payload key-for-key (docs/love-counter-submit-contract.md
 *     is authoritative). The rebuild changed the UI, not the wire format.
 *  2. Keep-flag payload logic — a kept slot sends its flag and NO image keys;
 *     fresh data sends image keys and NO flag; bg with neither keeps the
 *     legacy empty-string pair.
 *  3. Step gating mirrors the server rules (names ≤40 non-empty, date valid
 *     and not future, both avatars set whether fresh or kept).
 *
 * Run: node tests/love-counter-form-steps.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'love-counter-upload.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in love-counter-upload.js: ' + re);
  return m[0];
}

const H = new Function(
  [
    grab(/function lcIsValidDateString\(v, todayVN\) \{[\s\S]*?\n\}/),
    grab(/function lcValidateStep\(step, s\) \{[\s\S]*?\n\}/),
    grab(/function lcBuildSubmitPayload\(s, defaultTitle\) \{[\s\S]*?\n\}/),
    grab(/function lcIsLocked\(sub\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { lcIsValidDateString, lcValidateStep, lcBuildSubmitPayload, lcIsLocked };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const TODAY = '2026-08-09';
const DEFAULT_TITLE = '❤️ Been Love Memory ❤️';

console.log('-- step gating --');
const good = {
  phoneValid: true, order: 'ORD-1', maleSet: true, femaleSet: true,
  startDate: '2020-03-14', todayVN: TODAY, maleName: 'Bình', femaleName: 'Như'
};
ok('a complete state passes every gate',
   [0, 1, 2, 3, 4].every(i => H.lcValidateStep(i, good)));
ok('step 0 blocks a bad phone', !H.lcValidateStep(0, { ...good, phoneValid: false }));
ok('step 0 blocks a blank order', !H.lcValidateStep(0, { ...good, order: '  ' }));
ok('step 1 blocks a missing avatar', !H.lcValidateStep(1, { ...good, femaleSet: false }));
ok('kept media counts as set (hydrated resubmission)',
   H.lcValidateStep(1, { ...good, maleSet: true, femaleSet: true }));
ok('step 2 blocks a future date', !H.lcValidateStep(2, { ...good, startDate: '2027-01-01' }));
ok('step 2 blocks a pre-1900 date', !H.lcValidateStep(2, { ...good, startDate: '0202-05-01' }));
ok('step 2 blocks a blank name', !H.lcValidateStep(2, { ...good, maleName: ' ' }));
ok('step 2 blocks a 41-char name', !H.lcValidateStep(2, { ...good, femaleName: 'x'.repeat(41) }));
ok('step 2 allows a 40-char name', H.lcValidateStep(2, { ...good, femaleName: 'x'.repeat(40) }));
ok('step 3 (audio) never blocks — audio is optional', H.lcValidateStep(3, { ...good, maleSet: false }));
ok('step 4 re-checks everything', !H.lcValidateStep(4, { ...good, order: '' }));
ok('same-day start date is valid (day 1)', H.lcIsValidDateString(TODAY, TODAY));

console.log('\n-- payload parity: new customer equals the old stacked form --');
function freshState(overrides) {
  return Object.assign({
    phone: '+84918260494', orderId: 'ORD-1', startDate: '2020-03-14',
    maleName: ' Bình ', femaleName: 'Như', title: '', heartText: ' Bên nhau ',
    textMessage: '',
    male: { dataB64: 'MDATA', filename: 'm.jpg', kept: false },
    female: { dataB64: 'FDATA', filename: 'f.jpg', kept: false },
    bg: { dataB64: '', filename: '', kept: false }
  }, overrides || {});
}
// The exact key set the pre-rebuild form posted for a no-audio submission.
const LEGACY_KEYS = [
  'action', 'type', 'phone', 'order_id', 'start_date', 'male_name',
  'female_name', 'title', 'heart_text', 'text_message',
  'maleData', 'maleFilename', 'femaleData', 'femaleFilename',
  'bgData', 'bgFilename'
];
const p = H.lcBuildSubmitPayload(freshState(), DEFAULT_TITLE);
ok('key set matches the legacy payload exactly',
   JSON.stringify(Object.keys(p).sort()) === JSON.stringify(LEGACY_KEYS.slice().sort()),
   JSON.stringify(Object.keys(p).sort()));
ok('action/type are the contract literals', p.action === 'submitCounter' && p.type === 'counter');
ok('names are trimmed like the old form', p.male_name === 'Bình' && p.heart_text === 'Bên nhau');
ok('blank title falls back to the default like the old form', p.title === DEFAULT_TITLE);
ok('unset bg sends the legacy empty pair', p.bgData === '' && p.bgFilename === '');
ok('start_date passes through raw', p.start_date === '2020-03-14');

console.log('\n-- keep-flag payloads (returning customer) --');
const keptAll = H.lcBuildSubmitPayload(freshState({
  male: { dataB64: '', filename: '', kept: true },
  female: { dataB64: '', filename: '', kept: true },
  bg: { dataB64: '', filename: '', kept: true }
}), DEFAULT_TITLE);
ok('kept male → keepMale=1 and NO image keys',
   keptAll.keepMale === '1' && !('maleData' in keptAll) && !('maleFilename' in keptAll));
ok('kept female → keepFemale=1 and NO image keys',
   keptAll.keepFemale === '1' && !('femaleData' in keptAll));
ok('kept bg → keepBg=1 and NO legacy empty pair',
   keptAll.keepBg === '1' && !('bgData' in keptAll) && !('bgFilename' in keptAll));
const mixed = H.lcBuildSubmitPayload(freshState({
  male: { dataB64: 'NEWDATA', filename: 'new.jpg', kept: false },
  female: { dataB64: '', filename: '', kept: true }
}), DEFAULT_TITLE);
ok('fresh crop wins: data keys present, no keep flag for that slot',
   mixed.maleData === 'NEWDATA' && !('keepMale' in mixed) && mixed.keepFemale === '1');
ok('keep flags never appear for a plain new customer',
   !('keepMale' in p) && !('keepFemale' in p) && !('keepBg' in p) && !('keepAudio' in p));

console.log('\n-- publish-lock predicate --');
ok('published submission locks the form', H.lcIsLocked({ status: 'published' }));
ok('pending submission does not lock', !H.lcIsLocked({ status: 'pending' }));
ok('archived does not lock (restore path stays open)', !H.lcIsLocked({ status: 'archived' }));
ok('missing submission never locks', !H.lcIsLocked(null));
ok('hydration is skipped for a locked submission (source pin)',
   /lcIsLocked\(resp\.submission\)[\s\S]{0,80}else hydrateFromSubmission/.test(src));
ok('server published_locked maps to the locked panel (source pin)',
   /published_locked'\) \{[\s\S]{0,120}showLockedPanel\(\)/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
