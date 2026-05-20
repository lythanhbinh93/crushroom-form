#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const PREVIEW_URL = 'https://crushroom.myshopify.com';
const PREVIEW_THEME_ID = '158279991548';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function runLighthouse(url, viewport) {
  return new Promise((resolve) => {
    const args = [
      'lighthouse@13.3.0',
      url,
      viewport === 'mobile' ? '--emulated-form-factor=mobile' : '--preset=desktop',
      '--throttling-method=simulate',
      '--output=json',
      `--output-path=${path.join(__dirname, `round3-preview-${viewport}-1.json`)}`,
      '--quiet',
      `--chrome-flags="--headless --disable-gpu --no-sandbox"`,
      '--only-categories=performance',
    ];

    console.log(`Running Lighthouse (${viewport})...`);
    const proc = spawn('npx', args, {
      cwd: __dirname,
      shell: true,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      console.log(`  Process exited with code ${code}`);
      if (stderr && !stderr.includes('EPERM')) {
        console.error(`  stderr: ${stderr.slice(0, 200)}`);
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function extractMetrics(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf8');
    const data = JSON.parse(content);
    const perf = data.lighthouseResult?.categories?.performance?.score ?? null;
    const metrics = data.lighthouseResult?.audits?.metrics?.details?.items?.[0] ?? {};
    return {
      score: perf ? Math.round(perf * 100) : null,
      fcp: metrics.firstContentfulPaint ? (metrics.firstContentfulPaint / 1000).toFixed(2) : null,
      lcp: metrics.largestContentfulPaint ? (metrics.largestContentfulPaint / 1000).toFixed(2) : null,
      tbt: metrics.totalBlockingTime ? (metrics.totalBlockingTime).toFixed(0) : null,
      cls: metrics.cumulativeLayoutShift ?? null,
    };
  } catch (e) {
    console.error(`  Error parsing ${filepath}: ${e.message}`);
    return { error: e.message };
  }
}

async function main() {
  const url = `${PREVIEW_URL}?preview_theme_id=${PREVIEW_THEME_ID}`;

  console.log('=== Round 3 Lighthouse Verification (Preview URL) ===\n');
  console.log('Target (round-2 baseline):');
  console.log('  Mobile: 80 perf / FCP 1.9s / LCP 3.2s / TBT 340ms / CLS 0');
  console.log('  Desktop: 91-92 perf / LCP ~1.5s / TBT ~0ms / CLS 0\n');

  // Desktop
  console.log('=== DESKTOP ===');
  await runLighthouse(url, 'desktop');
  const desktopMetrics = await extractMetrics(path.join(__dirname, 'round3-preview-desktop-1.json'));
  console.log(
    `  Result: Perf ${desktopMetrics.score}pt, LCP ${desktopMetrics.lcp}s, TBT ${desktopMetrics.tbt}ms, CLS ${desktopMetrics.cls}\n`
  );

  // Mobile
  console.log('=== MOBILE ===');
  await runLighthouse(url, 'mobile');
  const mobileMetrics = await extractMetrics(path.join(__dirname, 'round3-preview-mobile-1.json'));
  console.log(
    `  Result: Perf ${mobileMetrics.score}pt, FCP ${mobileMetrics.fcp}s, LCP ${mobileMetrics.lcp}s, TBT ${mobileMetrics.tbt}ms, CLS ${mobileMetrics.cls}\n`
  );

  // Summary
  console.log('=== SUMMARY ===');
  const deskReg = desktopMetrics.score >= 91 ? 'PASS' : 'WARN';
  const mobReg = mobileMetrics.score >= 80 ? 'PASS' : 'WARN';
  console.log(`  Desktop: ${deskReg} (${desktopMetrics.score}pt vs target 91+)`);
  console.log(`  Mobile:  ${mobReg} (${mobileMetrics.score}pt vs target 80+)`);

  const fcpDelta = mobileMetrics.fcp ? (1.9 - parseFloat(mobileMetrics.fcp)).toFixed(2) : 'unknown';
  console.log(`\n  FCP improvement: ~${fcpDelta}s (target: -100ms from deferred CSS)`);

  console.log('\n✓ Lighthouse tests complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
