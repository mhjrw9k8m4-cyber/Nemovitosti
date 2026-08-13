#!/usr/bin/env node
// (1) ikatastr.cz – jak vyznačit konkrétní parcelu URL parametrem?
// (2) Bezrealitky – má inzerát druh pozemku (stavební/zahrada/les)?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u) { try { const r = await fetch(u, { headers: UA }); const t = await r.text(); return { s: r.status, t }; } catch (e) { return { s: 0, t: '', err: e.message }; } }

// ---- ikatastr param scheme ----
console.log('=== ikatastr.cz URL parametry ===');
const home = await get('https://www.ikatastr.cz/');
const js = [...new Set([...home.t.matchAll(/src="([^"]+\.js[^"]*)"/gi)].map((m) => m[1]))];
console.log('skripty:', JSON.stringify(js.slice(0, 8)));
// stáhni hlavní bundle a hledej názvy hash parametrů
for (const s of js.filter((x) => /app|main|bundle|ikatastr/i.test(x)).slice(0, 3)) {
  const u = s.startsWith('http') ? s : 'https://www.ikatastr.cz/' + s.replace(/^\//, '');
  const b = await get(u);
  const params = [...new Set([...b.t.matchAll(/["'`](kde|marker|parcela|par|bod|gps|mi|info|znacka|hledej|q|x|y|lat|lon|centrum)["'`]\s*[:=]/gi)].map((m) => m[1]))];
  console.log(`  ${u.slice(-40)} (${b.s}, ${b.t.length}B) params:`, JSON.stringify(params.slice(0, 20)));
  const kdeCtx = b.t.indexOf('kde'); if (kdeCtx >= 0) console.log('    "kde" kontext:', b.t.slice(kdeCtx - 30, kdeCtx + 80).replace(/\s+/g, ' '));
}

// ---- Bezrealitky: pole s druhem pozemku ----
console.log('\n=== Bezrealitky: druh pozemku v inzerátu ===');
const q = `query{ listAdverts(limit:3, order:TIMEORDER_DESC, offerType:[PRODEJ], estateType:[POZEMEK]){ list{ id title(locale: CS) mainCategory{ name(locale: CS) } surfaceLand tags{ name(locale: CS) } } } }`;
const r = await fetch('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
const j = await r.json().catch(() => null);
console.log(JSON.stringify(j).slice(0, 700));
console.log('\nHotovo.');
