/**
 * qa/lib/report.mjs
 * Append-only markdown report writer for pod-tee block-rebuild QA pipeline.
 *
 * Severity tagging:
 *   P0 — any failure causes exit code 1 (phase is blocked)
 *   P1 — logged as warning; exit code 0 but flagged for user attention
 *   P2 — logged as info; always exit code 0
 *
 * Exit code derivation:
 *   - If any P0 result has ok=false → process.exit(1)
 *   - Otherwise → process.exit(0)
 */

import { appendFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, "..", "reports");

/**
 * @typedef {Object} ReportResult
 * @property {string} step
 * @property {boolean} ok
 * @property {string} detail
 * @property {"P0"|"P1"|"P2"} severity
 * @property {string} [viewport] - viewport id that produced this result
 */

/**
 * Build a datestamp string for report filenames: YYYYMMDD-HHMM
 */
export function datestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/**
 * Write a full markdown report for a phase QA run.
 * File is written fresh (not appended) for each run.
 *
 * @param {string} phase - e.g. "phase-01"
 * @param {ReportResult[]} results - all assertion results across all viewports
 * @param {Object} [meta] - extra metadata to include in the header
 * @returns {Promise<string>} path to the written report file
 */
export async function writeReport(phase, results, meta = {}) {
  await mkdir(REPORTS_DIR, { recursive: true });

  const stamp = datestamp();
  const filename = `${phase}-${stamp}.md`;
  const filepath = join(REPORTS_DIR, filename);

  const p0Fails = results.filter((r) => r.severity === "P0" && !r.ok);
  const p1Fails = results.filter((r) => r.severity === "P1" && !r.ok);
  const p2Items = results.filter((r) => r.severity === "P2");
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;

  const exitCode = p0Fails.length > 0 ? 1 : 0;
  const verdict = exitCode === 0
    ? (p1Fails.length > 0 ? "PASS WITH P1 FLAGS" : "PASS")
    : "FAIL (P0)";

  const lines = [
    `# QA Report — ${phase} — ${stamp}`,
    ``,
    `**Verdict:** ${verdict}  `,
    `**Exit code:** ${exitCode}  `,
    `**Results:** ${passed}/${total} passed  `,
    `**Preview theme:** 158279991548  `,
    `**Run at:** ${new Date().toISOString()}  `,
  ];

  // Extra meta fields
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`**${k}:** ${v}  `);
  }

  // P0 failures (blocking)
  if (p0Fails.length > 0) {
    lines.push(``, `## P0 Failures (blocking)`, ``);
    for (const r of p0Fails) {
      lines.push(`- [x] **${r.step}**${r.viewport ? ` [${r.viewport}]` : ""}  `);
      lines.push(`  ${r.detail}`);
    }
  }

  // P1 flags (non-blocking but need attention)
  if (p1Fails.length > 0) {
    lines.push(``, `## P1 Flags (non-blocking)`, ``);
    for (const r of p1Fails) {
      lines.push(`- [ ] **${r.step}**${r.viewport ? ` [${r.viewport}]` : ""}  `);
      lines.push(`  ${r.detail}`);
    }
  }

  // All results table
  lines.push(``, `## All Results`, ``, `| Sev | Step | Viewport | Pass | Detail |`, `|---|---|---|---|---|`);
  for (const r of results) {
    const pass = r.ok ? "✓" : "✗";
    const vp = r.viewport ?? "—";
    const detail = (r.detail ?? "").replace(/\|/g, "\\|").slice(0, 120);
    lines.push(`| ${r.severity} | ${r.step} | ${vp} | ${pass} | ${detail} |`);
  }

  // P2 info
  if (p2Items.length > 0) {
    lines.push(``, `## P2 Info (log only)`, ``);
    for (const r of p2Items) {
      lines.push(`- **${r.step}**${r.viewport ? ` [${r.viewport}]` : ""}: ${r.detail}`);
    }
  }

  await writeFile(filepath, lines.join("\n") + "\n", "utf8");
  return filepath;
}

/**
 * Print a compact summary to stdout.
 * @param {ReportResult[]} results
 */
export function printSummary(results) {
  console.log("\n═══ QA SUMMARY ═══");
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const vp = r.viewport ? ` [${r.viewport}]` : "";
    console.log(`${icon} [${r.severity}] ${r.step}${vp}: ${String(r.detail ?? "").slice(0, 100)}`);
  }
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const p0Fails = results.filter((r) => r.severity === "P0" && !r.ok).length;
  const p1Flags = results.filter((r) => r.severity === "P1" && !r.ok).length;
  console.log(`\n${passed}/${total} passed | P0 failures: ${p0Fails} | P1 flags: ${p1Flags}`);
}

/**
 * Derive the process exit code from results.
 * P0 failure → 1, otherwise → 0.
 * @param {ReportResult[]} results
 * @returns {0|1}
 */
export function exitCode(results) {
  return results.some((r) => r.severity === "P0" && !r.ok) ? 1 : 0;
}
