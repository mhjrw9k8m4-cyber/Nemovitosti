#!/usr/bin/env node
// Najdi datové volání SPÚ /nabidky (CakePHP, render z val.Nabidky*).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, accept: 'application/json, text/javascript, */*', ...(opts.headers || {}) }, ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
const page = await get('https://spu.gov.cz/nabidky');
console.log('page:', page.s, page.t.length + 'B');

// 1) script soubory
const scripts = [...new Set([...page.t.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]))];
console.log('scripts:', JSON.stringify(scripts.slice(0, 20)));

// 2) kontext kolem 'Nabidky' a ajax volání v inline JS
const t = page.t;
for (const kw of ['ajax', 'getJSON', '.load(', 'url:', 'NabidkyVymera', 'loadNabidky', 'nabidky/', 'action:', '.json']) {
  let i = -1, n = 0;
  while ((i = t.indexOf(kw, i + 1)) >= 0 && n < 3) { console.log(`"${kw}": …${t.slice(i - 40, i + 80).replace(/\s+/g, ' ')}…`); n++; }
}

// 3) endpointy podle CakePHP konvence (.json)
console.log('\n-- tipy na datový endpoint --');
for (const p of ['/nabidky.json', '/nabidky/index.json', '/nabidky/search.json', '/nabidky/data', '/nabidky/nabidky.json', '/nabidky/getNabidky', '/nabidky/prehled-cela-cr.json', '/frontend/webroot/nabidky.json']) {
  const r = await get('https://spu.gov.cz' + p);
  console.log(p, '→', r.s, r.ct, (r.t || '').length + 'B', (r.t || '').slice(0, 80).replace(/\s+/g, ' '));
}
console.log('\nHotovo.');
