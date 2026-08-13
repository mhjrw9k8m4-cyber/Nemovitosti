#!/usr/bin/env node
// Prodej: struktura nabidkamajetku.cz (ÚZSVM). Exekuce: kolik živých nucených.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

// ---------- EXEKUCE: stav živých nucených dražeb ----------
console.log('=== CEVD nucené — rozložení stavů + živé (Uveřejněno) ===');
try {
  const y = new Date().getFullYear();
  const data = await (await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA })).json();
  const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  const stavy = {};
  let liveNucenaLand = 0, liveNucenaAny = 0;
  for (const rec of arr) {
    const zi = rec.zakladniInformace || {};
    if (!/nucen/i.test(zi.typDrazby || '')) continue;
    for (const p of (rec.predmetyDrazby || [])) {
      stavy[p.stavPredmetu] = (stavy[p.stavPredmetu] || 0) + 1;
      if (p.stavPredmetu === 'Uveřejněno') {
        liveNucenaAny++;
        for (const v of (p.veci || [])) { const vn = v.vecNemovita; if (vn && vn.pozemek) { liveNucenaLand++; break; } }
      }
    }
  }
  console.log('stavy nucených předmětů:', JSON.stringify(stavy));
  console.log('ŽIVÝCH nucených předmětů:', liveNucenaAny, '| z toho s pozemkem:', liveNucenaLand);
} catch (e) { console.log('chyba:', e.message); }

// ---------- PRODEJ: nabidkamajetku.cz struktura ----------
console.log('\n=== nabidkamajetku.cz (ÚZSVM) ===');
const home = await get('https://nabidkamajetku.cz/');
console.log('home:', home.s, home.t.length + 'B');
// embedded JSON? (Nuxt/Next/Angular state)
console.log('má __NUXT__/__NEXT_DATA__/ng-state:', /__NUXT__|__NEXT_DATA__|ng-state|window\.__/.test(home.t));
// odkazy na detaily/kategorie
const links = [...new Set([...home.t.matchAll(/href="([^"]+)"/gi)].map((m) => m[1])
  .filter((h) => /pozemk|nemovit|katalog|nabid|detail|vyhled|kategorie|majetek/i.test(h)))].slice(0, 25);
console.log('odkazy:', JSON.stringify(links, null, 0));
// zkusíme běžné API/list cesty
for (const p of ['/api/nabidky', '/api/v1/nabidky', '/nabidky', '/katalog', '/vyhledavani', '/api/search', '/api/majetek', '/sitemap.xml', '/robots.txt']) {
  const r = await get('https://nabidkamajetku.cz' + p);
  console.log(p, '→', r.s, r.ct, (r.t || '').length + 'B', (r.t || '').slice(0, 90).replace(/\s+/g, ' '));
}
console.log('\nHotovo.');
