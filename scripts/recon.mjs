#!/usr/bin/env node
// ÚZSVM /Home/Properties — zjisti formát dat (DataTables endpoint).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, accept: 'application/json, */*', ...(opts.headers || {}) }, ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

// zkusíme GET i POST, s DataTables parametry i bez
const tries = [
  ['GET plain', 'https://nabidkamajetku.cz/Home/Properties', {}],
  ['GET dt', 'https://nabidkamajetku.cz/Home/Properties?draw=1&start=0&length=10', {}],
  ['POST dt', 'https://nabidkamajetku.cz/Home/Properties', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }, body: 'draw=1&start=0&length=10' }],
];
for (const [label, url, opts] of tries) {
  const r = await get(url, opts);
  console.log(`\n=== ${label} → ${r.s} ${r.ct} ${r.t.length}B ===`);
  console.log(r.t.slice(0, 700));
  // pokus o JSON a strukturu
  try {
    const j = JSON.parse(r.t);
    const keys = Object.keys(j);
    console.log('JSON klíče:', JSON.stringify(keys));
    const arr = j.data || j.aaData || (Array.isArray(j) ? j : null);
    if (arr && arr.length) {
      console.log('počet:', arr.length, '| recordsTotal:', j.recordsTotal);
      console.log('první záznam:', JSON.stringify(arr[0]).slice(0, 600));
    }
  } catch { /* není JSON */ }
}
console.log('\nHotovo.');
