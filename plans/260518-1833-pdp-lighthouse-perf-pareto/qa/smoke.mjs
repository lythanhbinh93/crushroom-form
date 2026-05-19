// Single-run smoke test of the Lighthouse runner before the full baseline.
import { runLighthouseMobile } from './lib/lighthouse-runner.mjs';

const url = 'https://dopamiles.co/products/a-new-chapter-begins?_ab=0&_fd=0&_sc=1&preview_theme_id=158279991548';
const t0 = Date.now();
const lhr = await runLighthouseMobile(url);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const score = Math.round((lhr.categories.performance.score ?? 0) * 100);
const m = lhr.audits.metrics.details.items[0];
console.log(`elapsed=${elapsed}s  perf=${score}  LCP=${Math.round(m.largestContentfulPaint)}ms  CLS=${m.cumulativeLayoutShift?.toFixed(3)}  TBT=${Math.round(m.totalBlockingTime)}ms  FCP=${Math.round(m.firstContentfulPaint)}ms`);
console.log(`finalUrl=${lhr.finalDisplayedUrl}`);
console.log(`lhVersion=${lhr.lighthouseVersion}`);
