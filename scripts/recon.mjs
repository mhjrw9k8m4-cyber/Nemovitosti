#!/usr/bin/env node
// Farmy.cz — jak číst nabídky pozemků na prodej? (API / __NEXT_DATA__ / sitemap)
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow', ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

const home = await get('https://farmy.cz/');
console.log('home:', home.s, home.t.length + 'B');
console.log('JS app:', /__NEXT_DATA__|__NUXT__|id="app"|id="root"/.test(home.t));
// odkazy na katalog/nabídky/pozemky/prodej
const links = [...new Set([...home.t.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]).filter((h) => /pozemk|prodej|nabidk|katalog|inzer|nemovit/i.test(h)))].slice(0, 20);
console.log('odkazy:', JSON.stringify(links, null, 0));

// __NEXT_DATA__ blok?
const nd = home.t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nd) {
  console.log('__NEXT_DATA__ délka:', nd[1].length);
  try { const j = JSON.parse(nd[1]); console.log('build/props klíče:', JSON.stringify(Object.keys(j)), JSON.stringify(Object.keys(j.props || {}))); } catch { console.log('  (nelze parsovat)'); }
}

// zkusíme typické API / feed cesty
console.log('\n-- tipy na API/feed --');
for (const p of ['/api/nemovitosti', '/api/inzeraty', '/api/listings', '/api/nabidky', '/api/v1/adverts', '/rss.xml', '/feed', '/export/xml', '/sitemap.xml']) {
  const r = await get('https://farmy.cz' + p);
  console.log(p, '→', r.s, r.ct, (r.t || '').length + 'B', /<item>|<rss|"data"|"id"|<url>/i.test(r.t || '') ? '(struktura?)' : '');
}

// zkusíme přímo stránku výpisu pozemků na prodej (běžné cesty)
console.log('\n-- výpis pozemků --');
for (const p of ['/pozemky', '/prodej/pozemky', '/nemovitosti/pozemky', '/katalog/pozemky', '/nemovitosti?typ=pozemek']) {
  const r = await get('https://farmy.cz' + p);
  console.log(p, '→', r.s, (r.t || '').length + 'B', /pozem/i.test(r.t) ? '(zmiňuje pozemek)' : '');
}
console.log('\nHotovo.');
