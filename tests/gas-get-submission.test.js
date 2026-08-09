/**
 * Regression tests for the GAS getSubmission endpoint, loading the REAL
 * whitelist, builder and handler out of google-apps-script-voice.js.
 *
 * What these guard:
 *  1. The response whitelist IS the security boundary — the endpoint is
 *     reachable by anyone who can guess (phone, order_id), so the ONLY thing
 *     keeping the slug (the printed QR's capability token) and the stored
 *     phone private is that the builder iterates SUBMISSION_RESPONSE_FIELDS
 *     and never the row's columns.
 *  2. found:false is a success shape, not an error — a blank start is the
 *     normal new-customer path.
 *  3. A hand-edited Date cell must round-trip as 'YYYY-MM-DD' via
 *     toDateString_, never as a serialised Date that slips a day.
 *
 * Run: node tests/gas-get-submission.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'google-apps-script-voice.js');
// CRLF-normalized: git checks this file out with \r\n on Windows, which would
// silently defeat the \n-anchored mutation replacement below.
const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');

function grab(source, re) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate in google-apps-script-voice.js: ' + re);
  return m[0];
}

// GAS-only global: toDateString_ calls Utilities.formatDate for hand-edited
// Date cells. en-CA formats exactly the 'yyyy-MM-dd' the real call produces.
const UtilitiesStub = {
  formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d)
};

/** Build the harness from a given source string (used twice: real + mutated). */
function buildHarness(source) {
  return new Function(
    'Utilities', 'jsonOut', 'voiceFindRowByKey_',
    [
      grab(source, /const VOICE_SHEET_HEADERS = \[[\s\S]*?\];/),
      grab(source, /const ROW_TYPE_VOICE = '[^']*';/),
      grab(source, /const ROW_TYPE_COUNTER = '[^']*';/),
      grab(source, /function normalizeVNPhone_\(raw\) \{[\s\S]*?\n\}/),
      grab(source, /function rowType_\(row\) \{[\s\S]*?\n\}/),
      grab(source, /function toDateString_\(v\) \{[\s\S]*?\n\}/),
      grab(source, /function rowFromObject_\(obj\) \{[\s\S]*?\n\}/),
      grab(source, /var SUBMISSION_RESPONSE_FIELDS = \{[\s\S]*?\n\};/),
      grab(source, /function buildSubmissionResponse_\(row\) \{[\s\S]*?\n\}/),
      grab(source, /function handleGetSubmission_\(e\) \{[\s\S]*?\n\}/)
    ].join('\n') +
    ';return { VOICE_SHEET_HEADERS, rowFromObject_, SUBMISSION_RESPONSE_FIELDS, buildSubmissionResponse_, handleGetSubmission_ };'
  );
}

// jsonOut and the row lookup are injected so the handler runs without a
// Spreadsheet: jsonOut passes the object through, findStub is set per test.
let findResult = null;
let findArgs = null;
const factory = buildHarness(src);
const H = factory(
  UtilitiesStub,
  (obj) => obj,
  (phone, orderId, type) => { findArgs = [phone, orderId, type]; return findResult; }
);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

/**
 * A fully-populated counter row — every private column deliberately non-empty.
 * Values model what getValues() RETURNS, not what the writer wrote: Sheets
 * strips the apostrophe text-marker on read, so phone/start_date come back as
 * plain strings (a hand-edited date cell instead comes back as a Date —
 * covered by an explicit override below).
 */
function counterRow(overrides) {
  return H.rowFromObject_(Object.assign({
    timestamp: '2026-08-01T00:00:00.000Z',
    phone: '0918260494',
    order_id: 'EDIT-TEST',
    text_message: 'lời nhắn',
    audio_file_id: 'AUD1', audio_url: 'https://drive.google.com/file/d/AUD1/view',
    image_file_id: 'MALE1', image_url: 'https://drive.google.com/file/d/MALE1/view',
    status: 'published',
    slug: 'be85af7786',
    published_at: '2026-08-02T00:00:00.000Z',
    peaks: '[1,2]', audio_duration: 128,
    type: 'counter',
    start_date: '2020-03-14',
    male_name: 'Bình', female_name: 'Như',
    male_image_file_id: 'MALE1', male_image_url: 'https://drive.google.com/file/d/MALE1/view',
    female_image_file_id: 'FEM1', female_image_url: 'https://drive.google.com/file/d/FEM1/view',
    bg_file_id: 'BG1', bg_url: 'https://drive.google.com/file/d/BG1/view',
    title: 'Tiêu đề', heart_text: 'Bên nhau', audio_title: 'Bài của mình'
  }, overrides || {}));
}

console.log('-- whitelist: the exact response field set per type, nothing more --');
const counterResp = H.buildSubmissionResponse_(counterRow());
ok('counter response is exactly the 13 contract fields',
   JSON.stringify(Object.keys(counterResp).sort()) === JSON.stringify([
     'audio_file_id', 'audio_title', 'bg_file_id', 'female_image_file_id',
     'female_name', 'has_slug', 'heart_text', 'male_image_file_id',
     'male_name', 'start_date', 'status', 'text_message', 'title'
   ]), JSON.stringify(Object.keys(counterResp).sort()));

const voiceRow = H.rowFromObject_({
  phone: '0918260494', order_id: 'V-1', text_message: 'voice msg',
  audio_file_id: 'VA1', image_file_id: 'VI1', status: 'pending',
  slug: 'voiceslug99', type: 'voice'
});
const voiceResp = H.buildSubmissionResponse_(voiceRow);
ok('voice response is exactly the 5 contract fields',
   JSON.stringify(Object.keys(voiceResp).sort()) === JSON.stringify(
     ['audio_file_id', 'has_slug', 'image_file_id', 'status', 'text_message']
   ), JSON.stringify(Object.keys(voiceResp).sort()));
ok('blank-type legacy row resolves to the voice whitelist',
   JSON.stringify(Object.keys(H.buildSubmissionResponse_(H.rowFromObject_({ order_id: 'L', slug: '' }))).sort()) ===
   JSON.stringify(['audio_file_id', 'has_slug', 'image_file_id', 'status', 'text_message']));

console.log('\n-- the slug and phone are IN the row and NEVER in the response --');
const respJson = JSON.stringify(counterResp);
ok('slug value absent from the counter response', respJson.indexOf('be85af7786') === -1, respJson);
ok('no slug key in either response', !('slug' in counterResp) && !('slug' in voiceResp));
ok('phone value absent from the counter response', respJson.indexOf('0918260494') === -1);
ok('published_at / peaks / urls stay private',
   !('published_at' in counterResp) && !('peaks' in counterResp) &&
   respJson.indexOf('drive.google.com') === -1, respJson);

console.log('\n-- has_slug boolean mapping --');
ok('row with a slug → has_slug true (and true only)', counterResp.has_slug === true);
ok('row without a slug → has_slug false', H.buildSubmissionResponse_(counterRow({ slug: '' })).has_slug === false);
ok('whitespace-only slug → has_slug false', H.buildSubmissionResponse_(counterRow({ slug: '  ' })).has_slug === false);

console.log('\n-- start_date round-trips as YYYY-MM-DD --');
ok('apostrophe-written cell comes back as the raw string', counterResp.start_date === '2020-03-14');
// A hand-edited cell comes back from getValues() as a JS Date at VN midnight
// (UTC+7 ⇒ the UTC instant is 17:00 the previous day — the exact trap).
const handEdited = H.buildSubmissionResponse_(counterRow({ start_date: new Date(Date.UTC(2020, 2, 13, 17, 0, 0)) }));
ok('hand-edited Date cell resolves in VN time, not UTC', handEdited.start_date === '2020-03-14', handEdited.start_date);

console.log('\n-- handler: identity rules and found/not-found shapes --');
findResult = null; findArgs = null;
const noType = H.handleGetSubmission_({ parameter: { phone: '0918260494', order_id: 'X' } });
ok('absent type is rejected, same strictness as editVoice',
   noType.ok === false && noType.error === 'type required');
const badType = H.handleGetSubmission_({ parameter: { phone: '0918260494', order_id: 'X', type: 'gift' } });
ok('unknown type is rejected', badType.ok === false && badType.error === 'unknown_type');
const noPhone = H.handleGetSubmission_({ parameter: { order_id: 'X', type: 'counter' } });
ok('absent phone is rejected', noPhone.ok === false && noPhone.error === 'phone required');

findResult = null;
const notFound = H.handleGetSubmission_({ parameter: { phone: '+84 918 260 494', order_id: 'NOPE', type: 'counter' } });
ok('unknown identity → ok:true found:false (NOT an error)',
   notFound.ok === true && notFound.found === false && !('error' in notFound), JSON.stringify(notFound));
ok('phone was normalised before the lookup', findArgs && findArgs[0] === '0918260494', JSON.stringify(findArgs));

findResult = { rowIdx: 7, row: counterRow() };
const found = H.handleGetSubmission_({ parameter: { phone: '0918260494', order_id: 'EDIT-TEST', type: 'counter' } });
ok('known identity → ok:true found:true with the whitelisted submission',
   found.ok === true && found.found === true &&
   found.submission.male_name === 'Bình' && found.submission.start_date === '2020-03-14');
ok('found response never contains the slug', JSON.stringify(found).indexOf('be85af7786') === -1);

console.log('\n-- mutation sensitivity: widening the whitelist with slug must fail this suite --');
const widened = src.replace("'audio_file_id', 'status'\n    ]", "'audio_file_id', 'status', 'slug'\n    ]");
if (widened === src) throw new Error('mutation anchor not found — update the test');
const M = buildHarness(widened)(UtilitiesStub, (o) => o, () => null);
ok('a whitelist that leaks slug is caught', 'slug' in M.buildSubmissionResponse_(counterRow()));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
