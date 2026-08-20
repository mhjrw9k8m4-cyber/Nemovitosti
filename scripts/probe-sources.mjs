// Průzkum v11 — najít SEZNAM endpoint (jiný název) + záloha: max ID z homepage + RSC.
const API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)', accept: 'application/json' };
const get = async (u, h = {}) => { const r = await fetch(u, { headers: { ...UA, ...h }, signal: AbortSignal.timeout(25000) }); return { s: r.status, ct: r.headers.get('content-type') || '', t: await r.text() }; };
const out = [];

// list endpoint kandidáti (jiná podstatná jména)
const cands = ['auction-list', 'auctions/public', 'public/auctions', 'auctions/ongoing', 'auctions/current', 'homepage', 'homepage/auctions', 'catalog', 'auctions/filtered', 'auction/list', 'auctions/browse', 'auctions/planned'];
for (const c of cands) {
  try { const r = await get(`${API}/${c}?page=0&size=5`); let i = `${c} -> ${r.s}`; if (r.s < 300 && /json/i.test(r.ct)) { const j = JSON.parse(r.t); const arr = j.content || j.items || j.data || j.results || (Array.isArray(j) ? j : null); i += ` ✅ pole:${Array.isArray(arr) ? arr.length : '?'} top:${Object.keys(j).slice(0, 6)}`; } out.push(i); } catch (e) { out.push(`${c} -> ${e.message}`); }
}

// homepage: nejvyšší ID (rozsah pro zálohu) + kolik land linků
try {
  const h = await get('https://www.okdrazby.cz/');
  const ids = [...new Set([...h.t.matchAll(/\/drazba\/(\d+)-/g)].map(m => +m[1]))].sort((a, b) => b - a);
  out.push(`homepage: ID rozsah ${ids[ids.length - 1]}..${ids[0]} (${ids.length} ks)`);
} catch (e) { out.push('homepage: ' + e.message); }

// RSC pozemky: escaped id
try {
  const r = await get('https://www.okdrazby.cz/drazby/pozemky?_rsc=1', { RSC: '1' });
  const esc = [...new Set([...r.t.matchAll(/\\"id\\":(\d{3,7})/g)].map(m => m[1]))];
  const auc = [...new Set([...r.t.matchAll(/auctions[\/\\]+(\d{3,7})/g)].map(m => m[1]))];
  out.push(`RSC ${r.t.length}B: \\"id\\":${esc.length} | auctions/ID:${auc.length}`);
  const fi = r.t.search(/lowestSubmission|auctionSecurity|"name"|Seninka|pozemk/i);
  if (fi > -1) out.push('RSC vzorek: ' + r.t.slice(fi - 30, fi + 200).replace(/\s+/g, ' '));
} catch (e) { out.push('RSC: ' + e.message); }

// bounded brute-force test: 5 ID kolem 26367 — poznám land+aktivní?
try {
  for (const id of [26366, 26367, 26370, 26371]) {
    const r = await get(`${API}/auctions/${id}`);
    if (r.s === 200) { const j = JSON.parse(r.t); out.push(`  #${id}: ${j.statusLocalized} | cat:${JSON.stringify(j.categoriesLocalized)} | ${(j.name || '').slice(0, 40)}`); }
    else out.push(`  #${id}: ${r.s}`);
  }
} catch (e) { out.push('brute test: ' + e.message); }

console.log('\n===== V11 =====');
for (const l of out) console.log(l);
console.log('--- hotovo ---');
