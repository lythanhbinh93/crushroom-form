/**
 * Regression tests for the CF worker's /admin/list cache plan and the
 * voice-meta error-caching fix, loading the REAL adminListPlan out of
 * cloudflare-worker-voice-proxy.js.
 *
 * What these guard:
 *  1. The cache plan: MISS or fresh=1 fetches upstream synchronously; a HIT
 *     serves the cache and only revalidates in the background past the age
 *     threshold. Bad status/type fail closed with an error.
 *  2. The voice-meta poisoning fix: GAS answers HTTP 200 even for
 *     {ok:false,"not_found"}, so caching must gate on the PARSED body being
 *     ok:true — and the cache namespace must stay bumped (voice-meta2) so
 *     entries poisoned by the old worker stay orphaned.
 *  3. The admin tab falls back to direct GAS when the worker route fails,
 *     and every mutation path busts/repopulates the caches.
 *
 * Run: node tests/worker-admin-list-cache.test.js   (exit 0 = all pass)
 */
const fs = require('fs');
const path = require('path');

const workerSrc = fs.readFileSync(
  path.join(__dirname, '..', 'cloudflare-worker-voice-proxy.js'), 'utf8').replace(/\r\n/g, '\n');
const tabSrc = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'admin-voice-tab.js'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, re, name) {
  const m = src.match(re);
  if (!m) throw new Error('could not locate ' + name);
  return m[0];
}

const H = new Function(
  [
    grab(workerSrc, /const ADMIN_LIST_STATUSES = \[[\s\S]*?\];/, 'ADMIN_LIST_STATUSES'),
    grab(workerSrc, /const ADMIN_LIST_TYPES = \[[\s\S]*?\];/, 'ADMIN_LIST_TYPES'),
    grab(workerSrc, /const ADMIN_LIST_REVALIDATE_AGE_S = [\s\S]*?;/, 'ADMIN_LIST_REVALIDATE_AGE_S'),
    grab(workerSrc, /function adminListPlan\(params, cachedAgeSeconds\) \{[\s\S]*?\n\}/, 'adminListPlan')
  ].join('\n') + ';return { adminListPlan, ADMIN_LIST_REVALIDATE_AGE_S };'
)();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

const plan = H.adminListPlan;
const AGE = H.ADMIN_LIST_REVALIDATE_AGE_S;

console.log('-- input validation fails closed --');
ok('bad status errors', !!plan({ status: 'weird' }, null).error);
ok('bad type errors', !!plan({ status: 'pending', type: 'weird' }, null).error);
ok('defaults are pending/all', (() => {
  const p = plan({}, null); return p.status === 'pending' && p.type === 'all';
})());

console.log('\n-- miss and fresh fetch synchronously --');
const miss = plan({ status: 'pending' }, null);
ok('no cache: fetch upstream, not background',
   !miss.serveCache && miss.fetchUpstream && !miss.background);
const fresh = plan({ status: 'pending', fresh: '1' }, 5);
ok('fresh=1 ignores an existing cache entry',
   !fresh.serveCache && fresh.fetchUpstream && !fresh.background);

console.log('\n-- hits serve cache; only old entries revalidate --');
const young = plan({ status: 'pending' }, AGE - 1);
ok('young hit: serve cache, no upstream', young.serveCache && !young.fetchUpstream);
const old = plan({ status: 'pending' }, AGE + 1);
ok('old hit: serve cache AND background refresh',
   old.serveCache && old.fetchUpstream && old.background);

console.log('\n-- worker source pins --');
const adminHandler = grab(workerSrc, /async function handleAdminList\([\s\S]*?\n\}/, 'handleAdminList');
ok('/admin/list route is wired', /path === '\/admin\/list'/.test(workerSrc));
ok('admin list caches only parsed ok:true JSON',
   /okJson = JSON\.parse\(body\)\.ok === true/.test(adminHandler));
ok('background refresh rides waitUntil', /ctx\.waitUntil\(refresh\(\)\)/.test(adminHandler));
ok('client responses are no-store (edge owns freshness)',
   /'Cache-Control': 'no-store'/.test(adminHandler));

const metaHandler = grab(workerSrc, /async function handleVoiceMeta\([\s\S]*?\n\}/, 'handleVoiceMeta');
ok('voice-meta caches only parsed ok:true JSON (not HTTP 200)',
   /okJson = JSON\.parse\(body\)\.ok === true/.test(metaHandler) &&
   /if \(okJson\) \{\s*await cache\.put/.test(metaHandler));
ok('voice-meta cache namespace is bumped past the poisoned v1',
   metaHandler.indexOf('__cache__/voice-meta2/') !== -1 &&
   metaHandler.indexOf('__cache__/voice-meta/') === -1);
ok('voice-meta errors reach the browser as no-store',
   /okJson \? 'public, max-age=600, s-maxage=3600' : 'no-store'/.test(metaHandler));

console.log('\n-- admin tab source pins --');
const fetchListSrc = grab(tabSrc, /function fetchList\(statusFilter, fresh\) \{[\s\S]*?\n  \}/, 'fetchList');
ok('tab tries the worker route first', /\/admin\/list\?status=/.test(fetchListSrc));
ok('tab falls back to direct GAS listVoice on worker failure',
   /catch[\s\S]*action=listVoice&status=/.test(fetchListSrc));
ok('refresh button loads fresh', /refreshBtn\.addEventListener\('click', function \(\) \{ loadVoiceList\(\{ fresh: true \}\); \}\)/.test(tabSrc));
ok('archive reloads fresh', /'Đã archive'\);[\s\S]{0,200}loadVoiceList\(\{ fresh: true \}\)/.test(tabSrc));
ok('publish busts the list caches', /row\.url = data\.url;\s*bustListCache\(\);/.test(tabSrc));
ok('media replacement busts the list caches',
   /renderMediaButtons\(row\);\s*bustListCache\(\);/.test(tabSrc));
const loadSrc = grab(tabSrc, /function loadVoiceList\(opts\) \{[\s\S]*?\n  \}/, 'loadVoiceList');
ok('cached instant paint keeps data over the error screen, with a stale toast',
   /if \(painted\) showToast\('Không làm mới được/.test(loadSrc));
ok('late responses from a superseded load are dropped (filter-switch race)',
   (loadSrc.match(/if \(seq !== loadSeq\) return;/g) || []).length === 2);
ok('cache writes use the filter captured at request time, not the live one',
   /writeListCache\(requested, rows\)/.test(loadSrc) &&
   !/writeListCache\(currentFilter/.test(loadSrc));
ok('worker MISS path returns structured JSON on upstream failure',
   /status: 502/.test(adminHandler));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
