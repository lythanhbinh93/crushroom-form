// Extract the bottleneck signals from a Lighthouse LHR JSON.
// All getters are null-safe; missing audits return null/empty arrays so the
// report writer can render "n/a" instead of crashing.

const audit = (lhr, id) => lhr?.audits?.[id];
const items = (lhr, id) => audit(lhr, id)?.details?.items ?? [];

export function extractMetrics(lhr) {
  const m = audit(lhr, 'metrics')?.details?.items?.[0] || {};
  return {
    perfScore: Math.round((lhr?.categories?.performance?.score ?? 0) * 100),
    lcpMs: m.largestContentfulPaint ?? null,
    fcpMs: m.firstContentfulPaint ?? null,
    cls: m.cumulativeLayoutShift ?? null,
    tbtMs: m.totalBlockingTime ?? null,
    ttiMs: m.interactive ?? null,
    speedIndexMs: m.speedIndex ?? null,
    tti: m.interactive ?? null,
  };
}

export function extractLcpElement(lhr) {
  const it = items(lhr, 'largest-contentful-paint-element')[0];
  if (!it) return null;
  const sub = it.items?.[0] || {};
  return {
    selector: sub.node?.selector || it.node?.selector || null,
    snippet: sub.node?.snippet || it.node?.snippet || null,
    nodeLabel: sub.node?.nodeLabel || it.node?.nodeLabel || null,
    phaseTimings: it.items?.slice(1).map((p) => ({ phase: p.phase, timing: p.timing })) || [],
  };
}

export function extractCls(lhr) {
  // Lighthouse 12 audit id is `layout-shifts`; older versions: `layout-shift-elements`.
  const ids = ['layout-shifts', 'layout-shift-elements'];
  for (const id of ids) {
    const list = items(lhr, id);
    if (list.length) {
      return list.slice(0, 5).map((i) => ({
        score: i.score ?? i.cumulativeLayoutShiftMainFrame ?? null,
        selector: i.node?.selector || null,
        snippet: i.node?.snippet || null,
      }));
    }
  }
  return [];
}

export function extractLongTasks(lhr) {
  const list = items(lhr, 'long-tasks');
  return list
    .slice()
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 5)
    .map((t) => ({
      url: t.url || null,
      durationMs: Math.round(t.duration || 0),
      startTimeMs: Math.round(t.startTime || 0),
    }));
}

export function extractRenderBlocking(lhr) {
  const list = items(lhr, 'render-blocking-resources');
  return list.slice(0, 10).map((r) => ({
    url: r.url,
    totalBytes: r.totalBytes ?? null,
    wastedMs: r.wastedMs ?? null,
  }));
}

export function extractResourceSummary(lhr) {
  const list = items(lhr, 'resource-summary');
  const out = {};
  for (const r of list) {
    out[r.resourceType || r.label] = {
      requestCount: r.requestCount ?? null,
      transferSize: r.transferSize ?? null,
    };
  }
  return out;
}

export function extractThirdParty(lhr) {
  const list = items(lhr, 'third-party-summary');
  // Each item: { entity, transferSize, mainThreadTime, blockingTime }
  return list
    .slice()
    .sort((a, b) => (b.blockingTime || 0) - (a.blockingTime || 0))
    .slice(0, 10)
    .map((t) => ({
      entity: typeof t.entity === 'string' ? t.entity : t.entity?.text || null,
      transferSize: t.transferSize ?? null,
      mainThreadTimeMs: Math.round(t.mainThreadTime || 0),
      blockingTimeMs: Math.round(t.blockingTime || 0),
    }));
}

// Map raw third-party entries to a coarse class:
//   - "theme-owned" (dopamiles assets, shopify cdn for theme)
//   - "merchant-installed" (Globo, Judge.me, Loox, Yotpo, Klaviyo, FB Pixel, ...)
//   - "shopify-platform" (analytics, monorail, checkout sdk)
//   - "unknown"
const MERCHANT_PATTERNS = [
  /globo/i,
  /judge\.?me/i,
  /loox/i,
  /yotpo/i,
  /klaviyo/i,
  /facebook|fbcdn|connect\.facebook/i,
  /googletagmanager|google-analytics|gtag/i,
  /tiktok/i,
  /pinterest/i,
];
const SHOPIFY_PLATFORM_PATTERNS = [
  /monorail/i,
  /shopify\.com\/analytics/i,
  /shopify-xr/i,
  /shop\.app/i,
  /shopifyapps\.com/i,
];

export function classifyThirdParty(entry) {
  const label = entry.entity || '';
  if (MERCHANT_PATTERNS.some((p) => p.test(label))) return 'merchant-installed';
  if (SHOPIFY_PLATFORM_PATTERNS.some((p) => p.test(label))) return 'shopify-platform';
  if (/shopify|cdn\.shopify/i.test(label)) return 'theme-owned';
  return 'unknown';
}
