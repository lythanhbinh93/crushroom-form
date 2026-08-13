/**
 * Regression tests for the shared simple-gift form logic, loading the REAL
 * functions out of assets/simple-gift-upload.js.
 *
 * What these guard:
 *  1. Step gating: the link is required on link gifts, the photo on image
 *     gifts, and optional steps never block.
 *  2. Payload shape matches the submitGift contract: kept image → keepImage=1
 *     and NO image key; media_link only on link gifts; message optional.
 *  3. The client link check mirrors the server allowlist (server stays
 *     authoritative — this only powers inline validation).
 *
 * Run: node tests/simple-gift-form-steps.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'simple-gift-upload.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const gasSrc = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script-voice.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function grab(source, re, name) {
  const m = source.match(re);
  if (!m) throw new Error('could not locate ' + name);
  return m[0];
}

const H = new Function(
  [
    grab(src, /var SG_LINK_HOSTS = \[[\s\S]*?\];/, 'SG_LINK_HOSTS'),
    grab(src, /function sgIsAllowedLink\(url\) \{[\s\S]*?\n\}/, 'sgIsAllowedLink'),
    grab(src, /function sgRequirementMet\(requirement, s\) \{[\s\S]*?\n\}/, 'sgRequirementMet'),
    grab(src, /function sgBuildPayload\(s\) \{[\s\S]*?\n\}/, 'sgBuildPayload'),
    grab(src, /function sgIsLocked\(sub\) \{[\s\S]*?\n\}/, 'sgIsLocked')
  ].join('\n') + ';return { SG_LINK_HOSTS, sgIsAllowedLink, sgRequirementMet, sgBuildPayload, sgIsLocked };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('-- client allowlist mirrors the server --');
const serverHosts = JSON.parse(
  grab(gasSrc, /var GIFT_LINK_HOSTS = \[[\s\S]*?\];/, 'server hosts')
    .replace('var GIFT_LINK_HOSTS = ', '').replace(/;$/, '').replace(/'/g, '"'));
ok('same hosts, same order', JSON.stringify(H.SG_LINK_HOSTS) === JSON.stringify(serverHosts));

console.log('\n-- step gating --');
const s = { phoneValid: true, order: 'A1', link: 'https://youtu.be/dQw4w9WgXcQ', photoSet: true, message: '' };
ok('phone step needs valid phone + order',
   H.sgRequirementMet('phone', s) && !H.sgRequirementMet('phone', { ...s, phoneValid: false }) &&
   !H.sgRequirementMet('phone', { ...s, order: ' ' }));
ok('link step needs an allowlisted https link',
   H.sgRequirementMet('link', s) && !H.sgRequirementMet('link', { ...s, link: 'https://evil.vn/x' }) &&
   !H.sgRequirementMet('link', { ...s, link: '' }));
ok('photo step needs a photo', H.sgRequirementMet('photo', s) && !H.sgRequirementMet('photo', { ...s, photoSet: false }));
ok('optional steps never block', H.sgRequirementMet('none', { ...s, link: '', photoSet: false, message: '' }));

console.log('\n-- payload contract --');
const base = { type: 'link', phone: '+84912345678', orderId: 'A1',
  link: ' https://youtu.be/dQw4w9WgXcQ ', message: ' hi ', image: { dataB64: '', kept: false } };
const linkP = H.sgBuildPayload(base);
ok('link payload: action/type/link trimmed, no image keys',
   linkP.action === 'submitGift' && linkP.type === 'link' &&
   linkP.media_link === 'https://youtu.be/dQw4w9WgXcQ' && linkP.text_message === 'hi' &&
   !('imgData' in linkP) && !('keepImage' in linkP));
const imgP = H.sgBuildPayload({ ...base, type: 'image', image: { dataB64: 'DATA', kept: false } });
ok('image payload: fresh photo, no media_link',
   imgP.imgData === 'DATA' && !('media_link' in imgP) && !('keepImage' in imgP));
const keptP = H.sgBuildPayload({ ...base, type: 'image', image: { dataB64: '', kept: true } });
ok('kept photo → keepImage=1 and NO image key',
   keptP.keepImage === '1' && !('imgData' in keptP));

console.log('\n-- publish-lock predicate + wiring pins --');
ok('published locks, pending does not',
   H.sgIsLocked({ status: 'published' }) && !H.sgIsLocked({ status: 'pending' }) && !H.sgIsLocked(null));
ok('hydration is skipped for a locked submission (source pin)',
   /sgIsLocked\(resp\.submission\)[\s\S]{0,80}else hydrateFromSubmission/.test(src));
ok('server published_locked maps to the locked panel (source pin)',
   /published_locked'\) \{[\s\S]{0,120}showLockedPanel\(\)/.test(src));
ok('crop geometry matches the voice form (admin mirrors depend on it)',
   /viewport: \{ width: 280, height: 280, type: 'square' \}/.test(src) &&
   /size: \{ width: 400, height: 400 \},\s*format: 'jpeg',\s*quality: 0\.85/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
