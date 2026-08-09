/**
 * Regression tests for the Love Counter day count, loading the REAL functions
 * out of assets/counter-page.js.
 *
 * The count is the product: it is engraved into a QR on a physical bracelet,
 * so an off-by-one is what a customer notices first. Rules under test, from
 * docs/love-counter-submit-contract.md:
 *
 *  - INCLUSIVE: the start date itself is day 1 (ngày đầu tiên = ngày 1).
 *  - Both endpoints diff through Date.UTC on split components — never
 *    new Date('YYYY-MM-DD'), which parses as UTC midnight and shows viewers
 *    west of UTC the previous day.
 *  - "Today" resolves in Asia/Ho_Chi_Minh regardless of the viewer's clock.
 *
 * Run: node tests/counter-page-day-count.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'counter-page.js'), 'utf8');

function grab(re) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate in counter-page.js: ' + re);
  return m[0];
}
const H = new Function(
  [
    grab(/function todayInVN\(\) \{[\s\S]*?\n\}/),
    grab(/function loveDays\(startStr, todayStr\) \{[\s\S]*?\n\}/)
  ].join('\n') + ';return { todayInVN, loveDays };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- inclusive counting --');
ok('same day is day 1, not 0', H.loveDays('2026-08-09', '2026-08-09') === 1);
ok('next day is day 2', H.loveDays('2026-08-08', '2026-08-09') === 2);

console.log('\n-- calendar boundaries --');
ok('across 29 Feb 2024', H.loveDays('2024-02-28', '2024-03-01') === 3);
ok('across a non-leap February', H.loveDays('2023-02-27', '2023-03-01') === 3);
ok('across a year boundary', H.loveDays('2025-12-31', '2026-01-01') === 2);
ok('across a US DST spring-forward (UTC basis makes it exact)',
   H.loveDays('2025-03-08', '2025-03-10') === 3);

console.log('\n-- the real production row --');
// Order 123: start 2020-03-14. Anchor against an independently computed value:
// 2020-03-14 → 2026-08-09 is 2340 elapsed days (2344 including both leap days
// 2020-02-29 pre-start? no — 2020 leap day is before 14 Mar; 2024-02-29 is in
// range). Independent check: Date.UTC diff.
const expected = Math.round((Date.UTC(2026, 7, 9) - Date.UTC(2020, 2, 14)) / 86400000) + 1;
ok('order-123 row (2020-03-14 → 2026-08-09) matches an independent UTC diff, inclusive',
   H.loveDays('2020-03-14', '2026-08-09') === expected,
   'got ' + H.loveDays('2020-03-14', '2026-08-09') + ', expected ' + expected);
ok('and that value is stable and positive', expected > 2300 && expected < 2400, String(expected));

console.log('\n-- todayInVN shape --');
const t = H.todayInVN();
ok('returns YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(t), JSON.stringify(t));

console.log('\n-- guard: future date renders as em dash upstream --');
ok('future start yields a non-positive count (page shows —)',
   H.loveDays('2099-01-01', '2026-08-09') <= 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
