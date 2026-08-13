/**
 * Regression tests for the admin edit modal's payload builder, loading the
 * REAL functions out of assets/admin-voice-tab.js.
 *
 * What these guard:
 *  1. `type` must ALWAYS ride in the payload — the server treats an absent
 *     type as voice, so a counter edit without it lands on the wrong row.
 *  2. Changed-fields-only: a field the staff did not touch must not be sent,
 *     or an edit would clobber a concurrent customer re-submission's value.
 *  3. The client field list must equal the server whitelist — a drifted field
 *     is silently ignored server-side and shows as a stale value after Refresh.
 *
 * Run: node tests/admin-voice-tab-edit.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-voice-tab.js'), 'utf8').replace(/\r\n/g, '\n');
const gasSrc = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-voice.js'), 'utf8').replace(/\r\n/g, '\n');

function grab(source, re, label) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate ' + label + ': ' + re);
  return m[0];
}

const H = new Function(
  [
    grab(adminSrc, /const EDIT_FIELDS_BY_TYPE = [\s\S]*?\}\);/, 'EDIT_FIELDS_BY_TYPE'),
    grab(adminSrc, /function rowTypeOf\(row\) \{[\s\S]*?\n  \}/, 'rowTypeOf'),
    grab(adminSrc, /function toDateInputValue\(v\) \{[\s\S]*?\n  \}/, 'toDateInputValue'),
    grab(adminSrc, /function buildEditPayload\(row, formValues\) \{[\s\S]*?\n  \}/, 'buildEditPayload')
  ].join('\n') +
  ';return { EDIT_FIELDS_BY_TYPE, rowTypeOf, toDateInputValue, buildEditPayload };'
)();

const GAS = new Function(
  grab(gasSrc, /var EDITABLE_FIELDS_BY_TYPE = \{[\s\S]*?\n\};/, 'EDITABLE_FIELDS_BY_TYPE') +
  ';return { EDITABLE_FIELDS_BY_TYPE };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- client field list must equal the server whitelist, per type --');
['voice', 'counter', 'link', 'image'].forEach(function (type) {
  ok(type + ' fields match the GAS whitelist exactly',
     JSON.stringify(Object.keys(H.EDIT_FIELDS_BY_TYPE[type]).sort()) ===
     JSON.stringify(Object.keys(GAS.EDITABLE_FIELDS_BY_TYPE[type]).sort()),
     JSON.stringify(Object.keys(H.EDIT_FIELDS_BY_TYPE[type]).sort()));
});

console.log('\n-- identity: type always included, blank-type legacy rows resolve voice --');
const legacyRow = { phone: '0912345678', order_id: 'ORD-1', text_message: 'old' };
const p1 = H.buildEditPayload(legacyRow, { text_message: 'new' });
ok('payload carries action=editVoice', p1.action === 'editVoice');
ok('payload carries full identity', p1.phone === '0912345678' && p1.order_id === 'ORD-1');
ok('blank-type row sends type=voice', p1.type === 'voice');
const counterRow = { phone: '09', order_id: 'O1', type: 'counter', male_name: 'A', female_name: 'B', start_date: '2020-03-14' };
ok('counter row sends type=counter', H.buildEditPayload(counterRow, { male_name: 'An' }).type === 'counter');

console.log('\n-- changed-fields-only --');
const p2 = H.buildEditPayload(counterRow, { male_name: 'An', female_name: 'B', start_date: '2020-03-14' });
ok('untouched fields are not sent', !('female_name' in p2) && !('start_date' in p2), JSON.stringify(p2));
ok('changed field is sent', p2.male_name === 'An');
ok('no change at all -> null (no request)',
   H.buildEditPayload(counterRow, { male_name: 'A', female_name: 'B' }) === null);
ok('whitespace-only difference is not a change',
   H.buildEditPayload(counterRow, { male_name: '  A  ' }) === null);

console.log('\n-- clearing an optional field IS a change --');
const rowWithTitle = { phone: '09', order_id: 'O1', type: 'counter', title: 'Old title' };
const p3 = H.buildEditPayload(rowWithTitle, { title: '' });
ok('empty string sent when snapshot was non-empty', p3 !== null && p3.title === '');

console.log('\n-- cross-type leakage --');
const voiceRow = { phone: '09', order_id: 'O1', text_message: 'msg' };
const p4 = H.buildEditPayload(voiceRow, { text_message: 'msg2', male_name: 'leak', start_date: '2020-01-01' });
ok('voice payload never includes counter-only fields',
   !('male_name' in p4) && !('start_date' in p4), JSON.stringify(p4));
ok('unknown row type -> null', H.buildEditPayload({ type: 'bogus' }, { text_message: 'x' }) === null);
['constructor', '__proto__'].forEach(function (evil) {
  ok('prototype-key type "' + evil + '" -> null',
     H.buildEditPayload({ type: evil }, { text_message: 'x' }) === null);
});

console.log('\n-- toDateInputValue: the listVoice prefill quirk --');
ok('clean YYYY-MM-DD passes through', H.toDateInputValue('2020-03-14') === '2020-03-14');
ok('hand-edited cell (ISO datetime, VN midnight as prev day UTC) resolves in VN time',
   H.toDateInputValue('2020-03-13T17:00:00.000Z') === '2020-03-14',
   H.toDateInputValue('2020-03-13T17:00:00.000Z'));
ok('blank -> empty', H.toDateInputValue('') === '');
ok('garbage -> empty, not Invalid Date', H.toDateInputValue('not a date') === '');
console.log('\n-- start_date change detection uses the normalised value --');
const isoRow = { phone: '09', order_id: 'O1', type: 'counter', start_date: '2020-03-13T17:00:00.000Z' };
ok('same date in ISO form is not a change',
   H.buildEditPayload(isoRow, { start_date: '2020-03-14' }) === null);
ok('a real date change is sent',
   H.buildEditPayload(isoRow, { start_date: '2021-01-01' }).start_date === '2021-01-01');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
