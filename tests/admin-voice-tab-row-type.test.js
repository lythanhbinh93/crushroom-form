/**
 * Regression tests for the admin voice tab's row-type handling, loading the REAL
 * functions out of assets/admin-voice-tab.js.
 *
 * These guard a code path whose failure mode is a mis-printed physical product:
 * the URL these functions build is encoded into a QR and printed onto a bracelet
 * that has already shipped, so a wrong value cannot be corrected afterwards.
 *
 *  1. getRowUrl used a single hardcoded voice base, so a love-counter row's
 *     Copy-URL and QR produced a voice.html link. It looked right immediately
 *     after publishing — publishRow stores the server's url — and silently
 *     reverted on the next reload, when rows come back from listVoice with no
 *     url field.
 *  2. makeRowKey was (phone, order_id) and is used as the DOM key, so a voice
 *     gift and a counter bought on ONE order shared a key and publishing one
 *     rewrote the other's badge and URL.
 *  3. `type` is a hand-editable sheet cell. A plain object literal resolved
 *     'constructor' and '__proto__' to truthy inherited values, producing a
 *     non-empty nonsense URL that passed the empty-check and reached the QR.
 *
 * Run: node tests/admin-voice-tab-row-type.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-voice-tab.js'), 'utf8');

// The file is an IIFE, so lift out just the pieces under test by name.
function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in admin-voice-tab.js: ' + re);
  return m[0];
}
const H = new Function(
  [
    grab(/const PAGE_BASE_BY_TYPE = [\s\S]*?\}\);/),
    grab(/const TYPES_WITHOUT_PAGE = \[[^\]]*\];/),
    grab(/function rowTypeOf\(row\) \{[\s\S]*?\n  \}/),
    grab(/function makeRowKey\(row\) \{[\s\S]*?\n  \}/),
    grab(/function getRowUrl\(row\) \{[\s\S]*?\n  \}/),
    grab(/function pageMissingFor_\(row\) \{[\s\S]*?\n  \}/)
  ].join('\n') +
  ';return { rowTypeOf, makeRowKey, getRowUrl, pageMissingFor_, PAGE_BASE_BY_TYPE, TYPES_WITHOUT_PAGE };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- rowTypeOf: blank means voice, matching the server rule --');
ok('blank type resolves to voice', H.rowTypeOf({}) === 'voice');
ok('missing row object is tolerated', H.rowTypeOf(undefined) === 'voice');
ok('explicit counter resolves to counter', H.rowTypeOf({ type: 'counter' }) === 'counter');
ok('case and surrounding space tolerated', H.rowTypeOf({ type: '  COUNTER ' }) === 'counter');

console.log('\n-- makeRowKey: two products on ONE order must not share a DOM key --');
const voiceRow = { phone: '0912345678', order_id: 'ORD-1' };
const counterRow = { phone: '0912345678', order_id: 'ORD-1', type: 'counter' };
ok('same order, different type -> different keys',
   H.makeRowKey(voiceRow) !== H.makeRowKey(counterRow),
   H.makeRowKey(voiceRow) + '  vs  ' + H.makeRowKey(counterRow));
ok('a legacy blank-type row still keys as voice', H.makeRowKey(voiceRow).endsWith('|voice'));

console.log('\n-- getRowUrl: the value that ends up printed on a bracelet --');
const pubVoice = { slug: 'abc123', status: 'published' };
const pubCounter = { slug: 'abc123', status: 'published', type: 'counter' };
ok('voice row resolves to the voice page', H.getRowUrl(pubVoice).indexOf('voice.html') !== -1);
ok('counter row resolves to the counter page', H.getRowUrl(pubCounter).indexOf('counter.html') !== -1);
ok('counter row never resolves to the voice page', H.getRowUrl(pubCounter).indexOf('voice.html') === -1);
ok('a url supplied by the server always wins',
   H.getRowUrl({ slug: 'x', type: 'counter', url: 'https://server/authoritative' }) === 'https://server/authoritative');
ok('no slug yields no URL rather than a guess', H.getRowUrl({ type: 'counter' }) === '');
ok('an unknown type fails closed', H.getRowUrl({ slug: 'x', type: 'bogus' }) === '');

console.log('\n-- getRowUrl: prototype keys must not resolve to a truthy base --');
['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'].forEach(function (evil) {
  const out = H.getRowUrl({ slug: 'abc123', type: evil });
  ok('type="' + evil + '" yields no URL', out === '', JSON.stringify(out));
});

console.log('\n-- pageMissingFor_: gate rows whose public page has not shipped --');
ok('voice pages exist, so voice is not gated', H.pageMissingFor_({ type: 'voice' }) === false);
ok('a legacy blank-type row is not gated', H.pageMissingFor_({}) === false);
ok('counter is gated while counter.html is absent',
   H.pageMissingFor_({ type: 'counter' }) === true);
ok('an unknown type is not gated (it fails closed at getRowUrl instead)',
   H.pageMissingFor_({ type: 'bogus' }) === false);

// Ties the gate to reality: when counter.html lands, this test fails and forces
// the TYPES_WITHOUT_PAGE entry to be removed rather than quietly left behind.
const counterPageExists = fs.existsSync(path.join(__dirname, '..', 'counter.html'));
ok('gate list matches whether counter.html actually exists',
   counterPageExists === (H.TYPES_WITHOUT_PAGE.indexOf('counter') === -1),
   counterPageExists
     ? 'counter.html exists — remove "counter" from TYPES_WITHOUT_PAGE'
     : 'counter.html absent — "counter" correctly still gated');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
