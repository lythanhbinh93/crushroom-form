/**
 * mint-drive-refresh-token.js — one-time setup for the video upload relay.
 *
 * Mints a Google OAuth refresh token for the SHOP account (scope drive.file:
 * the relay can only touch files it creates) and pipes it — together with the
 * client id/secret — straight into `wrangler secret put`. No secret value is
 * ever printed to the terminal, chat, or a repo file.
 *
 * One-time prep (Google Cloud console, https://console.cloud.google.com):
 *   1. Create/select a project → "APIs & Services" → enable "Google Drive API".
 *   2. OAuth consent screen → External → publish status "In production"
 *      (a "Testing" app's refresh tokens die after 7 days).
 *   3. Credentials → Create credentials → OAuth client ID → type
 *      "Desktop app" (its loopback redirect needs no URI registration).
 *   4. Save the client id + secret into .drive-oauth.json (gitignored) next
 *      to this repo root:  { "client_id": "…", "client_secret": "…" }
 *
 * Then run from the repo root (wrangler.toml lives there):
 *   node scripts/mint-drive-refresh-token.js
 * Sign in AS THE SHOP GOOGLE ACCOUNT in the browser window that opens.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CRED_FILE = path.join(ROOT, '.drive-oauth.json');
const PORT = 8976;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

if (!fs.existsSync(CRED_FILE)) {
  fail('.drive-oauth.json not found — create it per the header comment (step 4).');
}
let creds;
try { creds = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')); } catch (e) {
  fail('.drive-oauth.json is not valid JSON.');
}
if (!creds.client_id || !creds.client_secret) {
  fail('.drive-oauth.json must contain client_id and client_secret.');
}

/** Feed one secret to `wrangler secret put` via stdin — value never echoed. */
function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    // Windows: Node ≥18.20/20.12 refuses spawning .cmd shims directly
    // (EINVAL, CVE-2024-27980 hardening) — go through cmd.exe. The secret
    // still travels via stdin only; `name` is a fixed identifier.
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', 'npx wrangler secret put ' + name],
          { cwd: ROOT, stdio: ['pipe', 'ignore', 'pipe'] })
      : spawn('npx', ['wrangler', 'secret', 'put', name],
          { cwd: ROOT, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code === 0) { console.log('✓ secret ' + name + ' stored'); resolve(); }
      else reject(new Error('wrangler secret put ' + name + ' failed: ' + stderr.slice(0, 300)));
    });
    child.stdin.write(value + '\n');
    child.stdin.end();
  });
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: creds.client_id,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent', // forces a refresh_token even on re-consent
}).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
  const code = url.searchParams.get('code');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(code
    ? '<h2>✓ Authorized — you can close this tab. Check the terminal.</h2>'
    : '<h2>✗ No code returned — check the terminal.</h2>');
  server.close();
  if (!code) fail('Google returned no authorization code.');

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResp.json();
    if (!tokens.refresh_token) {
      fail('Token exchange returned no refresh_token (got: ' +
        Object.keys(tokens).join(', ') + '). Is the consent screen "In production"?');
    }
    await putSecret('GOOGLE_CLIENT_ID', creds.client_id);
    await putSecret('GOOGLE_CLIENT_SECRET', creds.client_secret);
    await putSecret('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    console.log('\n✓ All three secrets stored. Next:');
    console.log('  1. Put the Drive folder id in wrangler.toml → DRIVE_VIDEO_FOLDER_ID');
    console.log('  2. npx wrangler deploy');
    process.exit(0);
  } catch (e) {
    fail(e.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Opening Google consent (sign in as the SHOP account)…');
  console.log('If no browser opens, visit:\n' + authUrl + '\n');
  try {
    if (process.platform === 'win32') {
      // PowerShell keeps the & inside double quotes literal; cmd's start +
      // caret escaping does not survive quoting and mangles the URL.
      spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process "' + authUrl + '"'],
        { stdio: 'ignore', detached: true }).unref();
    } else {
      execSync((process.platform === 'darwin' ? 'open' : 'xdg-open') + " '" + authUrl + "'",
        { stdio: 'ignore' });
    }
  } catch (_) { /* manual copy fallback printed above */ }
});
