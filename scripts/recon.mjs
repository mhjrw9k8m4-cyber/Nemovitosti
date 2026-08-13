#!/usr/bin/env node
// A) ÚZSVM /Home/Properties formát  B) plný rozbor živých nucených dražeb.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, accept: 'application/json, */*', ...(opts.headers || {}) }, ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

console.log('=== A) ÚZSVM /Home/Properties ===');
for (const [label, url, opts] of [
  ['GET dt', 'https://nabidkamajetku.cz/Home/Properties?draw=1&start=0&length=5', {}],
  ['POST dt', 'https://nabidkamajetku.cz/Home/Properties', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' }, body: 'draw=1&start=0&length=5' }],
]) {
  const r = await get(url, opts);
  console.log(`\n-- ${label} → ${r.s} ${r.ct} ${r.t.length}B`);
  try {
    const j = JSON.parse(r.t);
    console.log('klíče:', JSON.stringify(Object.keys(j)), '| recordsTotal:', j.recordsTotal);
    const arr = j.data || j.aaData || (Array.isArray(j) ? j : null);
    if (arr && arr.length) { console.log('první 2:'); console.log(JSON.stringify(arr[0]).slice(0, 500)); console.log(JSON.stringify(arr[1] || {}).slice(0, 500)); }
  } catch { console.log('náhled:', r.t.slice(0, 300).replace(/\s+/g, ' ')); }
}

console.log('\n=== B) živé nucené dražby (Uveřejněno) — plné pole ===');
try {
  const y = new Date().getFullYear();
  const data = await (await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA })).json();
  const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  let n = 0;
  for (const rec of arr) {
    const zi = rec.zakladniInformace || {};
    if (!/nucen/i.test(zi.typDrazby || '')) continue;
    for (const p of (rec.predmetyDrazby || [])) {
      if (p.stavPredmetu !== 'Uveřejněno') continue;
      const veci = (p.veci || []).map((v) => {
        const vn = v.vecNemovita || {};
        return { poz: !!vn.pozemek, jed: !!vn.jednotka, stav: !!vn.stavba, vymera: vn.pozemek && vn.pozemek.vymera, druh: vn.pozemek && vn.pozemek.druhPozemku, okres: vn.katastralniUzemi && vn.katastralniUzemi.okres, obec: vn.katastralniUzemi && (vn.katastralniUzemi.obec || vn.katastralniUzemi.nazev), nazev: (v.nazev || '').slice(0, 45) };
      });
      console.log(JSON.stringify({ vyvol: p.vyvolavaciCena && p.vyvolavaciCena.castka && p.vyvolavaciCena.castka.vyse, obvykla: p.obvyklaCena && p.obvyklaCena.vyse, veci }));
      if (++n >= 6) break;
    }
    if (n >= 6) break;
  }
  console.log('živých nucených předmětů zobrazeno:', n);
} catch (e) { console.log('chyba:', e.message); }
console.log('\nHotovo.');
