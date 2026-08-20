// Průzkum v8 — backend JSON API okdrazby (portal/auctions). Klíčový!
const API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)', accept: 'application/json' };
const get = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) }); const ct = r.headers.get('content-type') || ''; const t = await r.text(); return { s: r.status, ct, t }; };
const out = [];

// 1) DETAIL jedné dražby (pozemek 26367)
try {
  const r = await get(`${API}/auctions/26367`);
  out.push(`DETAIL /auctions/26367 -> ${r.s} ${r.ct} ${r.t.length}B`);
  if (/json/i.test(r.ct)) { const j = JSON.parse(r.t); out.push('  klíče: ' + Object.keys(j).join(',')); out.push('  vzorek: ' + JSON.stringify(j).slice(0, 1200)); }
  else out.push('  (není JSON) ' + r.t.slice(0, 150));
} catch (e) { out.push('detail chyba: ' + e.message); }

// 2) SEZNAM + filtry/stránkování
for (const u of [
  `${API}/auctions`,
  `${API}/auctions?page=1&size=20`,
  `${API}/auctions?category=pozemky`,
  `${API}/auctions?type=LAND`,
  `${API}/auctions?estateType=pozemky`,
  `${API}/auctions?realEstateType=LAND&page=1`,
]) {
  try {
    const r = await get(u);
    let info = `${u} -> ${r.s} ${r.ct.slice(0,16)} ${r.t.length}B`;
    if (/json/i.test(r.ct)) {
      const j = JSON.parse(r.t);
      const arr = Array.isArray(j) ? j : (j.content || j.items || j.data || j.results || j.auctions || null);
      info += ` | pole:${Array.isArray(arr) ? arr.length : '?'} | topKlíče:${Object.keys(j).slice(0,8).join(',')}`;
      if (Array.isArray(arr) && arr[0]) info += ` | prvekKlíče:${Object.keys(arr[0]).join(',').slice(0,200)}`;
    }
    out.push(info);
  } catch (e) { out.push(`${u} -> ${e.message}`); }
}
console.log('\n===== API VÝSLEDEK =====');
for (const l of out) console.log(l);
console.log('--- hotovo ---');
