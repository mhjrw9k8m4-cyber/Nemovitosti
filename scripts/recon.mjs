#!/usr/bin/env node
// Detail: proč se ztrácejí nucené dražby (exekuce) + jak číst SPÚ (prodej).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

// ---------- EXEKUCE: dump nucených s pozemkem ----------
console.log('=== CEVD nucené s pozemkem — proč se filtrují ===');
try {
  const y = new Date().getFullYear();
  const r = await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA });
  const data = await r.json();
  const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  let shown = 0;
  for (const rec of arr) {
    const zi = rec.zakladniInformace || {};
    if (!/nucen/i.test(zi.typDrazby || '')) continue;
    for (const p of (rec.predmetyDrazby || [])) {
      for (const v of (p.veci || [])) {
        const vn = v.vecNemovita;
        if (!vn || !vn.pozemek || vn.jednotka || vn.stavba) continue;
        const ku = vn.katastralniUzemi || {};
        console.log(JSON.stringify({
          stav: p.stavPredmetu,
          okres: ku.okres, obec: ku.obec || ku.nazev,
          vymera: vn.pozemek.vymera, druh: vn.pozemek.druhPozemku,
          vyvol: p.vyvolavaciCena && p.vyvolavaciCena.castka && p.vyvolavaciCena.castka.vyse,
          obvykla: p.obvyklaCena && p.obvyklaCena.vyse,
          nazev: (v.nazev || '').slice(0, 50),
        }));
        shown++;
        break;
      }
      if (shown >= 12) break;
    }
    if (shown >= 12) break;
  }
} catch (e) { console.log('chyba:', e.message); }

// ---------- PRODEJ: struktura SPÚ ----------
console.log('\n=== SPÚ (spu.gov.cz): odkazy na prodej/nabídky + open data ===');
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: UA, redirect: 'follow', ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
const home = await get('https://spu.gov.cz/');
console.log('home:', home.s, home.t.length + 'B');
if (home.t) {
  const links = [...new Set([...home.t.matchAll(/href="([^"]+)"/gi)].map((m) => m[1])
    .filter((h) => /prode|nabid|pozemk|drazb|zamer|volne/i.test(h)))].slice(0, 25);
  console.log('relevantní odkazy:', JSON.stringify(links, null, 0));
}
// zkusíme sitemap a robots — hledáme strojově čitelný seznam
for (const p of ['/robots.txt', '/sitemap.xml']) {
  const r = await get('https://spu.gov.cz' + p);
  console.log(p, '→', r.s, (r.t || '').slice(0, 200).replace(/\s+/g, ' '));
}
console.log('\nHotovo.');
