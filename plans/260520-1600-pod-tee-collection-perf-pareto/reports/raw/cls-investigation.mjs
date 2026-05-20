// CLS investigation script — captures LayoutShift entries with target elements
// Run: node cls-investigation.mjs <url>
// Example: node cls-investigation.mjs http://127.0.0.1:9292/collections/all

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");

const url = process.argv[2] || "http://127.0.0.1:9292/collections/all";
const viewport = process.argv[3] === "mobile"
  ? { width: 412, height: 823, isMobile: true, deviceScaleFactor: 2 }
  : { width: 1366, height: 768, isMobile: false, deviceScaleFactor: 1 };

console.error(`[cls-investigation] url=${url} viewport=${JSON.stringify(viewport)}`);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  // Use system Chrome to avoid Chromium download
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
});

const page = await browser.newPage();
await page.setViewport(viewport);

// Inject CLS observer BEFORE navigation so we capture all shifts from page load.
await page.evaluateOnNewDocument(() => {
  window.__cls = { total: 0, entries: [] };
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      const sources = (entry.sources || []).map((s) => {
        const n = s.node;
        if (!n) return { selector: "<null>" };
        let selector = n.tagName ? n.tagName.toLowerCase() : "?";
        if (n.id) selector += "#" + n.id;
        if (n.classList && n.classList.length)
          selector += "." + Array.from(n.classList).join(".");
        // Walk up 2 ancestors for context
        let ctx = [];
        let p = n.parentElement;
        for (let i = 0; i < 2 && p; i++) {
          let s2 = p.tagName.toLowerCase();
          if (p.id) s2 += "#" + p.id;
          if (p.classList && p.classList.length)
            s2 += "." + Array.from(p.classList).join(".");
          ctx.unshift(s2);
          p = p.parentElement;
        }
        return {
          selector: ctx.concat(selector).join(" > "),
          previousRect: s.previousRect && {
            x: s.previousRect.x,
            y: s.previousRect.y,
            width: s.previousRect.width,
            height: s.previousRect.height,
          },
          currentRect: s.currentRect && {
            x: s.currentRect.x,
            y: s.currentRect.y,
            width: s.currentRect.width,
            height: s.currentRect.height,
          },
        };
      });
      window.__cls.total += entry.value;
      window.__cls.entries.push({
        value: entry.value,
        startTime: entry.startTime,
        sources,
      });
    }
  });
  obs.observe({ type: "layout-shift", buffered: true });
});

await page.goto(url, { waitUntil: "load", timeout: 60000 });

// Settle: wait for any post-load shifts (fonts, lazy images intersecting viewport)
await new Promise((r) => setTimeout(r, 5000));

// Trigger lazy-load shifts by scrolling so below-the-fold images are forced to load.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 150));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 500));
});

const result = await page.evaluate(() => window.__cls);
await browser.close();

// Sort entries by value desc — biggest contributors first.
result.entries.sort((a, b) => b.value - a.value);

// Aggregate by selector — sum contributions per element.
const bySelector = {};
for (const e of result.entries) {
  for (const s of e.sources) {
    bySelector[s.selector] = (bySelector[s.selector] || 0) + e.value;
  }
}
const ranked = Object.entries(bySelector)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log(
  JSON.stringify(
    {
      url,
      viewport,
      totalCLS: result.total,
      entryCount: result.entries.length,
      top20BySelector: ranked.map(([sel, val]) => ({ selector: sel, totalShift: +val.toFixed(4) })),
      topEntries: result.entries.slice(0, 10).map((e) => ({
        value: +e.value.toFixed(4),
        startTime: Math.round(e.startTime),
        sources: e.sources.map((s) => s.selector),
      })),
    },
    null,
    2,
  ),
);
