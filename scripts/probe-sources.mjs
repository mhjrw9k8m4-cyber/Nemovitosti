// Průzkum v10 — jaké parametry chce /auctions/search|filter|list (400 tělo je prozradí).
const API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)', accept: 'application/json' };
const get = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) }); return { s: r.status, t: await r.text() }; };
const out = [];
for (const p of ['search', 'filter', 'list']) {
  for (const q of ['', '?page=0&size=10', '?status=ongoing', '?auctionStatus=PLANNED&page=0&size=10', '?category=LAND&page=0&size=10&sort=finish,asc', '?type=8&page=0&size=10', '?phase=prepared,ongoing&page=0&size=12']) {
    try { const r = await get(`${API}/auctions/${p}${q}`); const ok = r.s < 300 && r.t.length > 50; out.push(`${p}${q} -> ${r.s}${ok ? ' ✅ ' + r.t.slice(0, 120) : ' ' + r.t.slice(0, 150)}`); if (ok) break; } catch (e) { out.push(`${p}${q} -> ${e.message}`); }
  }
}
console.log('\n===== V10 =====');
for (const l of out) console.log(l);
console.log('--- hotovo ---');
