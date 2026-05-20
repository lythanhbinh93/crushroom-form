#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://127.0.0.1:9292';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LIGHTHOUSE_CONFIG = {
  chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox'].join(' '),
  outputPath: path.join(__dirname, 'round3-{url}-{viewport}-{run}.json'),
};

async function runLighthouse(url, viewport, run) {
  const outputFile = path.join(
    __dirname,
    `round3-${url.replace(/\//g, '-').slice(0, 20)}-${viewport}-${run}.json`
  );

  const cmd = [
    'npx lighthouse@13.3.0',
    `"${BASE_URL}${url}"`,
    `--emulated-form-factor=${viewport}`,
    '--throttling-method=simulate',
    '--output=json',
    `--output-path="${outputFile}"`,
    '--quiet',
    `--chrome-flags="${LIGHTHOUSE_CONFIG.chromeFlags}"`,
    '--only-categories=performance',
  ].join(' ');

  console.log(`Running Lighthouse (${url}, ${viewport}, run ${run})...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
    const json = JSON.parse(await fs.readFile(outputFile, 'utf8'));
    const score = json.lighthouseResult?.categories?.performance?.score ?? null;
    const metrics = json.lighthouseResult?.audits?.metrics?.details?.items?.[0] ?? {};
    console.log(
      `  ✓ Perf: ${(score * 100).toFixed(0)}, LCP: ${(metrics.largestContentfulPaint / 1000).toFixed(2)}s`
    );
    return { outputFile, score, metrics };
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    return { outputFile, score: null, error: err.message };
  }
}

async function main() {
  console.log('Round 3 Lighthouse Verification\n');
  console.log(`Target: Compare perf vs round-2 baseline`);
  console.log(`  Mobile: 80 perf / FCP 1.9s / LCP 3.2s`);
  console.log(`  Desktop: 91-92 perf / LCP ~1.5s\n`);

  const results = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    chromePath: CHROME_PATH,
    runs: [],
  };

  // Desktop run
  console.log('=== DESKTOP (1366x768) ===\n');
  const desktopRuns = [];
  for (let i = 1; i <= 1; i++) {
    const result = await runLighthouse('/', 'desktop', i);
    desktopRuns.push(result);
    results.runs.push({ viewport: 'desktop', run: i, ...result });
  }

  // Mobile run
  console.log('\n=== MOBILE (412x823) ===\n');
  const mobileRuns = [];
  for (let i = 1; i <= 1; i++) {
    const result = await runLighthouse('/', 'mobile', i);
    mobileRuns.push(result);
    results.runs.push({ viewport: 'mobile', run: i, ...result });
  }

  // Save summary
  const summaryFile = path.join(__dirname, 'round3-lighthouse-summary.json');
  await fs.writeFile(summaryFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${summaryFile}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
