// Measure rendered heights of the 6 below-fold PDP sections.
// Drives `contain-intrinsic-size` values for Phase 2's content-visibility CSS.
//
// Usage:
//   node probe-section-heights.mjs
//
// Output: ../reports/section-heights-probe.json
//
// Re-uses Playwright from the sibling qa pipeline (no separate install).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, '..', 'reports');
const OUT_PATH = resolve(REPORTS_DIR, 'section-heights-probe.json');

// Resolve playwright from sibling plan's node_modules (already installed)
const require = createRequire(
  resolve(__dirname, '..', '..', '260514-1230-pod-tee-publish-and-js-fixes', 'qa', 'package.json'),
);
const { chromium, devices } = require('playwright');

const PREVIEW = '158279991548';
const HOST = 'https://dopamiles.co';
const PDPS = [
  { slot: 'lead', handle: 'a-new-chapter-begins' },
  { slot: 'mid', handle: 'this-is-a-5k-right-t-shirt' },
  { slot: 'edge', handle: 'running-its-how-i-scope' },
];
const SECTIONS = [
  'dopamiles-fbt',
  'dopamiles-niche-favorites',
  'dopamiles-reasons',
  'dopamiles-more-from-niche',
  'dopamiles-reviews-placeholder',
  'dopamiles-faqs',
];

async function probe(handle) {
  const browser = await chromium.launch();
  // Moto G4-ish viewport matches Lighthouse mobile preset.
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  const url = `${HOST}/products/${handle}?_ab=0&_fd=0&_sc=1&preview_theme_id=${PREVIEW}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000); // let any reflows settle

  const heights = await page.evaluate((sections) => {
    const out = {};
    for (const slug of sections) {
      const el = document.querySelector(`[id*="__${slug}"]`);
      if (!el) {
        out[slug] = null;
        continue;
      }
      const rect = el.getBoundingClientRect();
      out[slug] = Math.round(rect.height);
    }
    return out;
  }, SECTIONS);

  await browser.close();
  return heights;
}

async function main() {
  await mkdir(REPORTS_DIR, { recursive: true });
  const probedAt = new Date().toISOString();
  const results = {};
  for (const p of PDPS) {
    console.log(`Probing ${p.slot}: ${p.handle}`);
    results[p.handle] = { slot: p.slot, heights: await probe(p.handle) };
  }

  // Aggregate per-section: min / max / median across the 3 PDPs.
  const summary = {};
  for (const slug of SECTIONS) {
    const vals = Object.values(results).map((r) => r.heights[slug]).filter((v) => v != null);
    if (!vals.length) {
      summary[slug] = { min: null, max: null, median: null, recommended_intrinsic_px: 800 };
      continue;
    }
    const sorted = vals.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    // Round recommended value up to nearest 100 px for stability across products.
    summary[slug] = {
      min: Math.min(...vals),
      max: Math.max(...vals),
      median,
      recommended_intrinsic_px: Math.ceil(median / 100) * 100,
    };
  }

  const out = { probedAt, preview_theme_id: PREVIEW, results, summary };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
  console.log('\nPer-section recommended intrinsic sizes (px):');
  for (const slug of SECTIONS) {
    const s = summary[slug];
    console.log(`  ${slug.padEnd(35)} median ${String(s.median).padStart(4)}px  range [${s.min}-${s.max}]  -> intrinsic ${s.recommended_intrinsic_px}px`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
