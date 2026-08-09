/**
 * Regression tests for the GAS editVoice validation core, loading the REAL
 * EDITABLE_FIELDS_BY_TYPE + validateEditFields_ out of google-apps-script-voice.js.
 *
 * What these guard:
 *  1. The whitelist IS the security boundary — the endpoint is unauthenticated,
 *     so the only thing keeping status/slug/file IDs safe is that validation
 *     iterates this map and never the request keys.
 *  2. start_date must come back apostrophe-prefixed. Without it Sheets casts
 *     the cell to a date and JSON serialises VN midnight as the PREVIOUS day —
 *     the exact trap this endpoint exists to keep staff out of.
 *  3. Omitted-vs-empty semantics: omitted leaves a cell untouched, empty
 *     clears it (unless required). Getting these backwards silently wipes data.
 *
 * Run: node tests/gas-edit-voice-fields.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'google-apps-script-voice.js');
// CRLF-normalized: git checks this file out with \r\n on Windows, which would
// silently defeat the \n-anchored mutation replacements below.
const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');

function grab(source, re) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate in google-apps-script-voice.js: ' + re);
  return m[0];
}

/** Build the validation harness from a given source string (used twice: real + mutated). */
function buildHarness(source) {
  return new Function(
    [
      grab(source, /function csvSafe_\(v\) \{[\s\S]*?\n\}/),
      grab(source, /var EDITABLE_FIELDS_BY_TYPE = \{[\s\S]*?\n\};/),
      grab(source, /function validateEditFields_\(type, params, todayVN\) \{[\s\S]*?\n\}/)
    ].join('\n') +
    ';return { validateEditFields_, EDITABLE_FIELDS_BY_TYPE };'
  )();
}

const H = buildHarness(src);
const TODAY = '2026-08-09';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- whitelist: the exact editable field set, nothing more --');
ok('voice edits exactly [text_message]',
   JSON.stringify(Object.keys(H.EDITABLE_FIELDS_BY_TYPE.voice)) === '["text_message"]');
ok('counter edits exactly the 7 contract fields',
   JSON.stringify(Object.keys(H.EDITABLE_FIELDS_BY_TYPE.counter).sort()) ===
   JSON.stringify(['audio_title', 'female_name', 'heart_text', 'male_name', 'start_date', 'text_message', 'title']));

console.log('\n-- non-whitelisted params never reach updates, even when posted --');
const sneaky = H.validateEditFields_('counter', {
  male_name: 'An', status: 'published', slug: 'hijacked', phone: '0999',
  male_image_file_id: 'evil', published_at: 'now', type: 'voice', peaks: '[]'
}, TODAY);
ok('updates contains only male_name', JSON.stringify(Object.keys(sneaky.updates)) === '["male_name"]',
   JSON.stringify(sneaky.updates));
ok('no errors for ignored params', sneaky.errors.length === 0);
const sneakyVoice = H.validateEditFields_('voice', { text_message: 'hi', start_date: '2020-01-01' }, TODAY);
ok('voice ignores counter-only fields', JSON.stringify(Object.keys(sneakyVoice.updates)) === '["text_message"]');

console.log('\n-- omitted vs empty: untouched vs cleared vs rejected --');
const partial = H.validateEditFields_('counter', { title: 'New title' }, TODAY);
ok('omitted fields stay out of updates', JSON.stringify(Object.keys(partial.updates)) === '["title"]');
const cleared = H.validateEditFields_('counter', { title: '', heart_text: '  ' }, TODAY);
ok('empty clearable field clears to ""', cleared.updates.title === '' && cleared.updates.heart_text === '');
ok('clearing produces no error', cleared.errors.length === 0);
const emptyReq = H.validateEditFields_('counter', { male_name: '' }, TODAY);
ok('empty required field is rejected', emptyReq.errors.length === 1 && !('male_name' in emptyReq.updates),
   JSON.stringify(emptyReq));
const emptyDate = H.validateEditFields_('counter', { start_date: '' }, TODAY);
ok('empty start_date is rejected', emptyDate.errors.length === 1);

console.log('\n-- start_date: the three submitCounter rules + the apostrophe --');
ok('bad format rejected', H.validateEditFields_('counter', { start_date: '14-03-2020' }, TODAY).errors.length === 1);
ok('future date rejected', H.validateEditFields_('counter', { start_date: '2026-08-10' }, TODAY).errors.length === 1);
ok('today accepted', H.validateEditFields_('counter', { start_date: TODAY }, TODAY).errors.length === 0);
ok('pre-1900 rejected', H.validateEditFields_('counter', { start_date: '1899-12-31' }, TODAY).errors.length === 1);
const goodDate = H.validateEditFields_('counter', { start_date: '2020-03-14' }, TODAY);
ok('accepted date is apostrophe-prefixed', goodDate.updates.start_date === "'2020-03-14",
   JSON.stringify(goodDate.updates.start_date));

console.log('\n-- length caps mirror submitCounter (slice-truncate, not reject) --');
const longName = H.validateEditFields_('counter', { male_name: 'x'.repeat(41) }, TODAY);
ok('41-char name truncates to 40', longName.updates.male_name.length === 40 && longName.errors.length === 0);
const longMsg = H.validateEditFields_('voice', { text_message: 'y'.repeat(1001) }, TODAY);
ok('voice message truncates to 1000', longMsg.updates.text_message.length === 1000);
const counterMsg = H.validateEditFields_('counter', { text_message: 'z'.repeat(201) }, TODAY);
ok('counter message truncates to 200 (not the voice 1000)', counterMsg.updates.text_message.length === 200);

console.log('\n-- formula injection: csvSafe_ applied to every text field --');
const inj = H.validateEditFields_('counter', { title: '=IMPORTRANGE("x","y")', heart_text: '+1', male_name: '@evil' }, TODAY);
ok('leading = is quoted', inj.updates.title.charAt(0) === "'");
ok('leading + is quoted', inj.updates.heart_text.charAt(0) === "'");
ok('leading @ is quoted', inj.updates.male_name.charAt(0) === "'");

console.log('\n-- unknown type fails closed --');
const bogus = H.validateEditFields_('bogus', { text_message: 'x' }, TODAY);
ok('unknown type yields error + zero updates',
   bogus.errors.length === 1 && Object.keys(bogus.updates).length === 0);
['constructor', '__proto__', 'hasOwnProperty'].forEach(function (evil) {
  const r = H.validateEditFields_(evil, { text_message: 'x' }, TODAY);
  ok('prototype-key type "' + evil + '" fails closed',
     r.errors.length === 1 && Object.keys(r.updates).length === 0);
});

console.log('\n-- mutation sensitivity: this suite must catch the regressions it guards --');
// Strip the apostrophe prefix in-memory and prove the date assertion notices.
const mutatedApos = buildHarness(src.replace('updates[field] = "\'" + raw;', 'updates[field] = raw;'));
ok('dropping the start_date apostrophe is caught',
   mutatedApos.validateEditFields_('counter', { start_date: '2020-03-14' }, TODAY).updates.start_date !== "'2020-03-14");
// Widen the whitelist in-memory and prove the sneaky-params assertion notices.
const mutatedList = buildHarness(src.replace(
  "counter: {\n        start_date:", "counter: {\n        slug: { max: 40, required: false },\n        start_date:"));
const sneaky2 = mutatedList.validateEditFields_('counter', { slug: 'hijacked' }, TODAY);
ok('widening the whitelist is caught', 'slug' in sneaky2.updates);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
