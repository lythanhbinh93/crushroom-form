/**
 * Parity tests for the app.py → GAS port: cleanSku_ / safeNote_ / buildSlotName_.
 * Loads the REAL functions out of google-apps-script-fulfillment.js (no copy) by stubbing the
 * single GAS global referenced at top level (PropertiesService) and eval'ing the source — so this
 * verifies the shipped code, and catches drift from app.py's clean_sku/safe_note/expand_slots.
 *
 * Run: node tests/app-py-port-parity.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

// Top-level `const scriptProp = PropertiesService.getScriptProperties()` is the only GAS call that
// runs on load; stub it. The three helpers under test use no GAS globals.
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } };

const src = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-fulfillment.js'), 'utf8');
let H = {};
// Direct sloppy-mode eval: function declarations leak to this scope; capture the three we test.
eval(src + '\n; H = { cleanSku_: cleanSku_, safeNote_: safeNote_, buildSlotName_: buildSlotName_ };');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.error('FAIL ' + label + '\n   got : ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want)); }
}

// ---- cleanSku_ (app.py clean_sku) ----
eq('cleanSku COUPLEPIX lower', H.cleanSku_('couplepix-dcw'), 'DCW');
eq('cleanSku COUPLEPIX + trailing token', H.cleanSku_('COUPLEPIX-DCM SILVER'), 'DCM');
eq('cleanSku spaces dropped', H.cleanSku_('  abc def  '), 'ABCDEF');
eq('cleanSku plain', H.cleanSku_('CPFE107807'), 'CPFE107807');
eq('cleanSku null', H.cleanSku_(null), '');
eq('cleanSku bare COUPLEPIX-', H.cleanSku_('couplepix-'), 'COUPLEPIX-');

// ---- safeNote_ (app.py safe_note) ----
eq('safeNote slash→dash + drop space', H.safeNote_('Vòng tay/dây'), 'Vòngtay-dây');
eq('safeNote colon→dash', H.safeNote_('size: M'), 'size-M');
eq('safeNote strip symbols', H.safeNote_('a@b#c'), 'abc');
eq('safeNote empty', H.safeNote_(''), '');
eq('safeNote null', H.safeNote_(null), '');
eq('safeNote keeps VN diacritics', H.safeNote_('Đường'), 'Đường');
eq('safeNote 35-char cap', H.safeNote_('abcdefghijklmnopqrstuvwxyz0123456789XYZ'), 'abcdefghijklmnopqrstuvwxyz012345678');

// ---- buildSlotName_ (app.py expand_slots naming) ----
eq('slot name with note', H.buildSlotName_(1, '1234', 'DCM', 'note'), '1._1234_DCM_note');
eq('slot name no note', H.buildSlotName_(2, '0000', 'DCW', ''), '2._0000_DCW');

console.log((fail === 0 ? 'PASS' : 'FAIL') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
