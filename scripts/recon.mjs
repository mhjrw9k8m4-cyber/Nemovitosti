#!/usr/bin/env node
// SPÚ /nabidky/getNabidky — zjisti parametry (typ_nabidky) a pole odpovědi.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, 'x-requested-with': 'XMLHttpRequest', ...(opts.headers || {}) }, ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
const page = await (await fetch('https://spu.gov.cz/nabidky', { headers: UA })).text();

// 1) hodnoty selectu typ_nabidky (kódy druhů nabídek)
const opts = [...page.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)].map((m) => [m[1], m[2].trim()]).filter(([v, l]) => /prode|pozemk|§|zákon|nájem|pacht/i.test(l));
console.log('typ_nabidky options:', JSON.stringify(opts.slice(0, 20), null, 0));

// 2) JS blok kolem getNabidky (jak se skládá POST)
let i = page.indexOf('getNabidky');
while (i >= 0) { console.log('\ngetNabidky ctx:', page.slice(i - 220, i + 220).replace(/\s+/g, ' ')); i = page.indexOf('getNabidky', i + 1); if (i > 40000) break; }

// 3) šablona řádku — všechna pole val.Nabidky*
const fields = [...new Set([...page.matchAll(/val\.(Nabidky\w+)/g)].map((m) => m[1]))];
console.log('\npole odpovědi:', JSON.stringify(fields));

// 4) reálné volání getNabidky s různými typy
console.log('\n-- POST getNabidky --');
for (const [v] of opts.slice(0, 6)) {
  const body = new URLSearchParams({ typ_nabidky: v, okres: '', stranka: '1', razeni: '' }).toString();
  const r = await get('https://spu.gov.cz/nabidky/getNabidky', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  let info = r.t.slice(0, 120).replace(/\s+/g, ' ');
  try { const j = JSON.parse(r.t); info = 'JSON pole délky ' + (Array.isArray(j) ? j.length : '?') + ' :: ' + JSON.stringify(Array.isArray(j) ? j[0] : j).slice(0, 300); } catch {}
  console.log(`typ=${v} → ${r.s} ${r.t.length}B :: ${info}`);
}
console.log('\nHotovo.');
