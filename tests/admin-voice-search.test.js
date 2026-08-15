/**
 * Regression tests for the voice tab's toolbar search, loading the REAL
 * filterVoiceRows out of assets/admin-voice-tab.js.
 *
 * What these guard:
 *  1. Partial digit queries match phone substrings (CS searches by last-4).
 *  2. An 84-prefixed query finds the stored local 0-form of the same phone.
 *  3. Any query also matches order_id — including digit queries, because
 *     many order ids are numeric.
 *  4. Wiring: typing re-renders through renderVoiceList, and the no-match
 *     empty state echoes the query via textContent (user input never
 *     becomes markup).
 *
 * Run: node tests/admin-voice-search.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-voice-tab.js'), 'utf8').replace(/\r\n/g, '\n');
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(source, re, label) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate ' + label + ': ' + re);
  return m[0];
}

const H = new Function(
  grab(adminSrc, /function filterVoiceRows\(rowList, query\) \{[\s\S]*?\n  \}/, 'filterVoiceRows') +
  ';return { filterVoiceRows };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const F = H.filterVoiceRows;
const ROWS = [
  { phone: '0865330492', order_id: 'AUTO-260814223652-4HSW', type: 'link' },
  { phone: '0396281887', order_id: '396281887', type: 'counter' },
  { phone: '0900000009', order_id: 'P2-TEST', type: 'video' },
  { phone: "'0937 104 294", order_id: 'AUTO-260812133338-VEPF', type: 'voice' },
  { order_id: '(no order)' } // row with no phone must not throw
];

console.log('-- query normalization --');
ok('empty query returns the same array', F(ROWS, '') === ROWS && F(ROWS, '   ') === ROWS);
ok('null/undefined query returns the same array', F(ROWS, null) === ROWS && F(ROWS) === ROWS);

console.log('\n-- phone matching --');
ok('partial digits (last 4)', F(ROWS, '0492').length === 1 && F(ROWS, '0492')[0].phone === '0865330492');
ok('full phone', F(ROWS, '0396281887').length === 1);
ok('spaced/formatted query digits still match', F(ROWS, '086 533 0492').length === 1);
ok('84-prefixed finds the stored 0-form', F(ROWS, '84865330492').length === 1 &&
   F(ROWS, '84865330492')[0].phone === '0865330492');
ok('+84 formatted also works', F(ROWS, '+84 865 330 492').length === 1);
ok('row phone stored with junk still matches', F(ROWS, '0937104294').length === 1 &&
   F(ROWS, '0937104294')[0].order_id === 'AUTO-260812133338-VEPF');

console.log('\n-- order id matching --');
ok('text query matches order id case-insensitively', F(ROWS, 'p2-test').length === 1 &&
   F(ROWS, 'p2-test')[0].order_id === 'P2-TEST');
ok('digit query matches a numeric order id', F(ROWS, '396281887').length === 1 &&
   F(ROWS, '396281887')[0].order_id === '396281887');
ok('partial order text', F(ROWS, 'auto-2608').length === 2);

console.log('\n-- misses --');
ok('no match returns empty', F(ROWS, '9999999999').length === 0 && F(ROWS, 'zzz').length === 0);
ok('phoneless row never throws and never phone-matches', F(ROWS, '(no order)').length === 1);

console.log('\n-- wiring pins --');
const renderSrc = grab(adminSrc, /function renderVoiceList\(rowList\) \{[\s\S]*?\n  \}/, 'renderVoiceList');
ok('render path filters before grouping',
   /filterVoiceRows\(rowList, searchQuery\)/.test(renderSrc));
ok('no-match empty state echoes the query via textContent only',
   /textContent[\s\S]{0,120}Không có kết quả/.test(renderSrc) &&
   !/innerHTML[\s\S]{0,80}Không có kết quả/.test(renderSrc));
ok('typing re-renders and toggles the clear button',
   /searchInput\.addEventListener\('input'[\s\S]{0,200}renderVoiceList\(rows\)/.test(adminSrc) &&
   /searchClear\.hidden = !searchQuery\.trim\(\)/.test(adminSrc));
ok('search is session-only (never persisted)',
   !/localStorage[\s\S]{0,40}searchQuery/.test(adminSrc) &&
   !/setItem\([^)]*search/i.test(adminSrc));
ok('toolbar markup ships the search box + clear button',
   /id="voice-search"/.test(htmlSrc) && /id="voice-search-clear"/.test(htmlSrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
