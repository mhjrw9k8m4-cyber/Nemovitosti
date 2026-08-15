#!/usr/bin/env node
/* Sonda v5 (poslední): /router.json Portálu dražeb — najít routu pro seznam
 * dražeb / vyhledávání, a hned ji zkusit zavolat a podívat se na odpověď. */

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; PozemkomatBot/0.1)', accept: 'application/json' };
const P = 'https://www.portaldrazeb.cz';

const rj = await fetch(P + '/router.json', { headers: UA });
console.log('router.json status=' + rj.status + ' ct=' + rj.headers.get('content-type'));
let routes = {};
try {
  const j = JSON.parse(await rj.text());
  routes = j.routes || j;
} catch (e) { console.log('router.json neparsuje: ' + e.message); }

const names = Object.keys(routes);
console.log('celkem rout: ' + names.length);
// routy, které vypadají jako seznam/vyhledávání/dražby/mapa/api
const rel = names.filter((n) => /auction|drazb|search|list|map|filtr|hledej|verejn|public|api/i.test(n));
console.log('\nRelevantní routy (' + rel.length + '):');
for (const n of rel.slice(0, 40)) {
  const r = routes[n];
  const tokens = (r && r.tokens) ? r.tokens.map((t) => t[1] || t[3] || '').reverse().join('') : '';
  const path = (r && (r.path || r.pattern)) || tokens || JSON.stringify(r).slice(0, 80);
  console.log('  ' + n + '  ->  ' + (r && r.methods ? r.methods.join(',') : '') + ' ' + path);
}

// zkusíme pár nejpravděpodobnějších GET rout zavolat
const tryNames = rel.filter((n) => /list|search|map|public|verejn|auction.*(list|index|search|map)/i.test(n)).slice(0, 6);
for (const n of tryNames) {
  const r = routes[n];
  let path = (r && (r.path || r.pattern)) || '';
  if (!path && r && r.tokens) path = r.tokens.map((t) => t[1] || '').reverse().join('');
  if (!path || /\{/.test(path)) { console.log('\n(přeskakuji ' + n + ' – parametrická cesta ' + path + ')'); continue; }
  try {
    const rr = await fetch(P + path, { headers: UA });
    const txt = (await rr.text()).slice(0, 300);
    console.log('\nCALL ' + n + ' ' + path + ' -> ' + rr.status + ' ct=' + rr.headers.get('content-type') + '\n  ' + txt.replace(/\s+/g, ' '));
  } catch (e) { console.log('\nCALL ' + n + ' CHYBA ' + e.message); }
}
console.log('\n### HOTOVO');
