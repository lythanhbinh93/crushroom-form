// Lighthouse mobile baseline harness for the PDP perf Pareto plan.
//
// Runs 3 PDPs x 3 Lighthouse mobile runs against the preview theme,
// persists raw LHR JSON per run, picks the median run per PDP, and
// emits a consolidated baseline-summary.json that the report writer
// (write-baseline-report.mjs) turns into baseline-report.md.
//
// Usage:
//   node lighthouse-baseline.mjs
//   node lighthouse-baseline.mjs --edge=other-handle   (override edge pick)
//   node lighthouse-baseline.mjs --runs=5              (more runs)

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLighthouseMobile } from './lib/lighthouse-runner.mjs';
import { pickMedianLhr } from './lib/median.mjs';
import {
  extractMetrics,
  extractLcpElement,
  extractCls,
  extractLongTasks,
  extractRenderBlocking,
  extractResourceSummary,
  extractThirdParty,
  classifyThirdParty,
} from './lib/analyze-lhr.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN_DIR = resolve(__dirname, '..');
const RAW_DIR = resolve(PLAN_DIR, 'baseline-raw'); // local-only (gitignored by root rule)
const REPORTS_DIR = resolve(PLAN_DIR, 'reports');
const SUMMARY_PATH = resolve(REPORTS_DIR, 'baseline-summary.json');

const PREVIEW_THEME_ID = '158279991548';
const HOST = 'https://dopamiles.co';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [[m[1], m[2] ?? true]] : [];
  }),
);
const RUNS = Number(args.runs) || 3;
const EDGE_OVERRIDE = typeof args.edge === 'string' ? args.edge : null;

const LEAD = 'a-new-chapter-begins';
const MID = 'this-is-a-5k-right-t-shirt';

async function pickEdgePdp() {
  if (EDGE_OVERRIDE) return { handle: EDGE_OVERRIDE, variantsCount: null, source: 'override' };
  // Reuse pick-edge logic inline (avoid spawning a subprocess).
  const limit = 250;
  const all = [];
  for (let p = 1; p <= 20; p++) {
    const res = await fetch(`${HOST}/products.json?limit=${limit}&page=${p}`);
    if (!res.ok) throw new Error(`/products.json page ${p} -> ${res.status}`);
    const j = await res.json();
    const list = j.products || [];
    if (!list.length) break;
    all.push(...list);
    if (list.length < limit) break;
  }
  if (!all.length) throw new Error('No products returned from /products.json');
  const ranked = all
    .map((p) => ({ handle: p.handle, title: p.title, variantsCount: (p.variants || []).length }))
    .sort((a, b) => b.variantsCount - a.variantsCount);
  const winner = ranked[0];
  return { handle: winner.handle, title: winner.title, variantsCount: winner.variantsCount, source: 'auto-max-variants', totalProducts: all.length };
}

function previewUrl(handle) {
  return `${HOST}/products/${handle}?_ab=0&_fd=0&_sc=1&preview_theme_id=${PREVIEW_THEME_ID}`;
}

async function ensureDirs() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(REPORTS_DIR, { recursive: true });
}

async function runPdp(slot, handle) {
  const url = previewUrl(handle);
  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    const startedAt = new Date().toISOString();
    console.log(`[${slot}:${handle}] run ${i}/${RUNS} starting at ${startedAt}`);
    const t0 = Date.now();
    const lhr = await runLighthouseMobile(url);
    const elapsedMs = Date.now() - t0;
    const score = Math.round((lhr.categories.performance.score ?? 0) * 100);
    console.log(`  -> perf ${score}, elapsed ${(elapsedMs / 1000).toFixed(1)}s`);
    const rawPath = resolve(RAW_DIR, `${handle}-run-${i}.json`);
    await writeFile(rawPath, JSON.stringify(lhr));
    runs.push({ index: i, rawPath: `baseline-raw/${handle}-run-${i}.json`, score, elapsedMs });
  }
  // Load LHRs from memory (we still have them) — re-read for median selection.
  const lhrs = [];
  for (let i = 1; i <= RUNS; i++) {
    const { readFile } = await import('node:fs/promises');
    const txt = await readFile(resolve(RAW_DIR, `${handle}-run-${i}.json`), 'utf8');
    lhrs.push(JSON.parse(txt));
  }
  const median = pickMedianLhr(lhrs);
  return { slot, handle, url, runs, median };
}

function analyzeMedian(lhr) {
  const thirdParty = extractThirdParty(lhr).map((t) => ({ ...t, classification: classifyThirdParty(t) }));
  return {
    lighthouseVersion: lhr.lighthouseVersion,
    fetchTime: lhr.fetchTime,
    finalDisplayedUrl: lhr.finalDisplayedUrl,
    metrics: extractMetrics(lhr),
    lcpElement: extractLcpElement(lhr),
    cls: extractCls(lhr),
    longTasks: extractLongTasks(lhr),
    renderBlocking: extractRenderBlocking(lhr),
    resourceSummary: extractResourceSummary(lhr),
    thirdParty,
  };
}

async function main() {
  await ensureDirs();
  const edge = await pickEdgePdp();
  console.log(`Edge PDP: ${edge.handle} (${edge.variantsCount ?? '?'} variants, source=${edge.source})`);

  const pdps = [
    { slot: 'lead', handle: LEAD, label: 'Lead — hero designs / default merchandising' },
    { slot: 'mid', handle: MID, label: 'Mid — multi-color, media-order resolution path' },
    { slot: 'edge', handle: edge.handle, label: `Edge — ${edge.variantsCount ?? '?'} variants (auto-picked: ${edge.source})` },
  ];

  const results = [];
  for (const p of pdps) {
    const r = await runPdp(p.slot, p.handle);
    const analysis = analyzeMedian(r.median.lhr);
    results.push({
      ...p,
      url: r.url,
      runs: r.runs,
      allScores: r.median.allScores.map((s) => Math.round(s * 100)),
      medianScoreIndex: r.median.index,
      analysis,
    });
  }

  // Verdict: every PDP median >= 90?
  const allPass = results.every((r) => r.analysis.metrics.perfScore >= 90);

  const summary = {
    generatedAt: new Date().toISOString(),
    runner: 'lighthouse-baseline.mjs',
    lighthouseVersion: results[0]?.analysis.lighthouseVersion || null,
    runsPerPdp: RUNS,
    previewThemeId: PREVIEW_THEME_ID,
    host: HOST,
    edgePick: edge,
    pdps: results,
    verdict: {
      everyPdpMeetsGate: allPass,
      gate: 90,
      perPdp: results.map((r) => ({
        slot: r.slot,
        handle: r.handle,
        perfScore: r.analysis.metrics.perfScore,
        pass: r.analysis.metrics.perfScore >= 90,
      })),
      recommendedNextPhase: allPass ? 'Phase 04 (publish gate) — auto-cancel P2/P3' : 'Phase 02 (fix top bottleneck)',
    },
  };

  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${SUMMARY_PATH}`);
  console.log('\nVerdict:');
  for (const v of summary.verdict.perPdp) {
    console.log(`  ${v.slot.padEnd(5)} ${v.handle.padEnd(40)} perf ${v.perfScore}  ${v.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`Every-PDP >=90: ${allPass}`);
  console.log(`Next: ${summary.verdict.recommendedNextPhase}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
