// Auto-pick the edge PDP for the Lighthouse baseline:
// the dopamiles.co product with the maximum variants.count.
//
// Uses the public /products.json endpoint (no admin auth required).
// Paginates with ?limit=250&page=N until an empty page returns.

const HOST = process.env.SHOP_HOST || 'dopamiles.co';
const LIMIT = 250;
const MAX_PAGES = 20; // safety cap

async function fetchPage(page) {
  const url = `https://${HOST}/products.json?limit=${LIMIT}&page=${page}`;
  const res = await fetch(url, { headers: { 'user-agent': 'pdp-perf-edge-picker/1.0' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const json = await res.json();
  return json.products || [];
}

async function collectAll() {
  const all = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const products = await fetchPage(p);
    if (!products.length) break;
    all.push(...products);
    if (products.length < LIMIT) break;
  }
  return all;
}

function summarize(p) {
  return {
    handle: p.handle,
    title: p.title,
    variantsCount: (p.variants || []).length,
    imagesCount: (p.images || []).length,
    optionsCount: (p.options || []).length,
  };
}

const all = await collectAll();
const ranked = all.map(summarize).sort((a, b) => b.variantsCount - a.variantsCount);

const top = ranked.slice(0, 10);
const winner = ranked[0];

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ winner, top, totalProducts: all.length }, null, 2));
} else {
  console.log(`Total products scanned: ${all.length}`);
  console.log('\nTop 10 by variants.count:');
  for (const r of top) {
    console.log(`  ${r.variantsCount.toString().padStart(3)} variants  ${r.handle}  (${r.title})`);
  }
  console.log(`\nEdge PDP pick: ${winner.handle} (${winner.variantsCount} variants, ${winner.optionsCount} options)`);
}
