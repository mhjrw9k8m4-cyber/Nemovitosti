// Průzkum v9 — najít SEZNAM/SEARCH endpoint + pole s cenou + RSC enumerace ID.
const API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)', accept: 'application/json' };
const get = async (u, opt = {}) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000), ...opt }); return { s: r.status, ct: r.headers.get('content-type') || '', t: await r.text() }; };
const out = [];

// 1) pole s cenou z detailu
try {
  const j = JSON.parse((await get(`${API}/auctions/26367`)).t);
  const money = Object.entries(j).filter(([k]) => /price|bid|security|estimat|minimal|castka|amount|value|deposit|reserve/i.test(k));
  out.push('CENOVÁ pole detailu: ' + JSON.stringify(money).slice(0, 500));
  out.push('biddingMethodAttributes: ' + JSON.stringify(j.biddingMethodAttributes).slice(0, 400));
  out.push('categoriesLocalized: ' + JSON.stringify(j.categoriesLocalized).slice(0, 200) + ' | county:' + j.county + ' | region:' + j.region);
} catch (e) { out.push('detail chyba: ' + e.message); }

// 2) SEARCH/LIST endpointy
const guesses = [
  `${API}/auctions/search?page=0&size=10`,
  `${API}/auctions/filter?page=0&size=10`,
  `${API}/auctions/list?page=0&size=10`,
  `${API}/search/auctions?page=0&size=10`,
  `${API}/search?page=0&size=10`,
  `${API}/catalogue?page=0&size=10`,
  `${API}/auction/search?page=0&size=10`,
];
for (const u of guesses) {
  try { const r = await get(u); let i = `${u.replace(API,'')} -> ${r.s}`; if (/json/i.test(r.ct) && r.s < 400) { const j = JSON.parse(r.t); const arr = j.content || j.items || j.data || j.results || (Array.isArray(j) ? j : null); i += ` OK pole:${Array.isArray(arr) ? arr.length : '?'} top:${Object.keys(j).slice(0,6).join(',')}`; } out.push(i); } catch (e) { out.push(`${u.replace(API,'')} -> ${e.message}`); }
}
// POST search?
try { const r = await get(`${API}/auctions/search`, { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ page: 0, size: 10 }) }); out.push(`POST /auctions/search -> ${r.s} ${r.ct.slice(0,16)} ${r.t.slice(0,120)}`); } catch (e) { out.push('POST search: ' + e.message); }

// 3) RSC enumerace ID pozemků (fallback)
try {
  const r = await get('https://www.okdrazby.cz/drazby/pozemky?_rsc=1', { headers: { ...UA, RSC: '1' } });
  const ids = [...new Set([...r.t.matchAll(/auctions\/(\d+)\/images/g)].map(m => m[1]))];
  const ids2 = [...new Set([...r.t.matchAll(/"id":(\d{3,7})/g)].map(m => m[1]))];
  out.push(`RSC pozemky: ${r.t.length}B | ID z images:${ids.length} ${ids.slice(0,5)} | "id":${ids2.length}`);
} catch (e) { out.push('RSC chyba: ' + e.message); }

console.log('\n===== V9 =====');
for (const l of out) console.log(l);
console.log('--- hotovo ---');
