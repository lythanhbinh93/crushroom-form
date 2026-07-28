/**
 * Regression tests for two fulfillment fixes, loading the REAL functions out of
 * google-apps-script-fulfillment.js the same way the parity suite does.
 *
 *  1. canWriteback_ — Poscake status codes are categorical, not ordinal, so the old
 *     `status < 2` test wrongly excluded 11 (waitting), a state we sync by default.
 *  2. buildPrintNote_ — the 1500-char cap used to slice the joined string, cutting the
 *     last photo URL in half and handing the supplier a broken link.
 *
 * Run: node tests/fulfillment-writeback-and-note.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

global.PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } };

const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-fulfillment.js'), 'utf8');
let H = {};
eval(src + '\n; H = { canWriteback_: canWriteback_, buildPrintNote_: buildPrintNote_ };');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.error('FAIL ' + label + '\n   got : ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want)); }
}
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL ' + label + (detail ? '\n   ' + detail : '')); }
}

// ---- canWriteback_ : allow-list, not an ordinal comparison ----
eq('writeback new(0)', H.canWriteback_(0), true);
eq('writeback submitted(1)', H.canWriteback_(1), true);
eq('writeback waitting(11)', H.canWriteback_(11), true);   // synced by default; `s < 2` wrongly excluded it
eq('writeback delivered(3)', H.canWriteback_(3), false);
eq('writeback canceled(6)', H.canWriteback_(6), false);
eq('writeback packing(8)', H.canWriteback_(8), false);
eq('writeback pending(9)', H.canWriteback_(9), false);
eq('writeback string "11"', H.canWriteback_('11'), true);  // Poscake returns numbers as strings sometimes
eq('writeback garbage', H.canWriteback_('abc'), false);
eq('writeback null', H.canWriteback_(null), false);

// ---- buildPrintNote_ : whole lines only, never a severed URL ----
const IDX = { line_index: 0, last4: 1, note_size: 2, note_chain: 3, sku: 4, note_print: 5 };
function noteFor(photoCount) {
  const photos = [];
  for (let i = 0; i < photoCount; i++) {
    photos.push({ photo_url: 'https://drive.google.com/uc?export=view&id=FILEID' + String(i).padStart(28, '0') });
  }
  const o = { idx: IDX, rows: [{ row: ['0', '1234', 'M', 'silver', 'CPFE107807', 'ghi chu'] }] };
  return H.buildPrintNote_(o, { '0': photos });
}

const small = noteFor(3);
eq('small note keeps every line', small.split('\n').length, 3);
ok('small note has no warning', small.indexOf('THIẾU') === -1, small);

const big = noteFor(40);                     // ~100 chars/line => well past 1500
ok('big note respects the 1500 cap', big.length <= 1500, 'len=' + big.length);
ok('big note warns about omissions', big.indexOf('THIẾU') !== -1, big.slice(-120));

// the real defect: the final URL used to be chopped mid-string
const bigLines = big.split('\n');
const urlLines = bigLines.filter(function (l) { return l.indexOf('https://') !== -1; });
ok('every emitted URL is intact', urlLines.every(function (l) {
  const url = l.slice(l.indexOf('https://'));
  return /^https:\/\/drive\.google\.com\/uc\?export=view&id=FILEID\d{28}$/.test(url);
}), 'last url line: ' + urlLines[urlLines.length - 1]);

// the warning must report the true number dropped, not a guess
const emitted = urlLines.length;
const m = big.match(/THIẾU (\d+) ảnh/);
ok('warning counts the dropped photos', !!m, big.slice(-120));
if (m) eq('omitted count is exact', parseInt(m[1], 10), 40 - emitted);

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
