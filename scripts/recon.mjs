#!/usr/bin/env node
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u) { try { const r = await fetch(u, { headers: UA }); const t = await r.text(); return { s: r.status, t }; } catch (e) { return { s: 0, t: '', err: e.message }; } }

// ---- ikatastr bundle: jak čte hash / vyznačení parcely ----
console.log('=== ikatastr ik2d bundle: hash/marker/parcela ===');
const b = await get('https://www.ikatastr.cz/dist/ik2d-26.06.07.js?v3');
console.log('bundle:', b.s, b.t.length + 'B');
for (const kw of ['location.hash', 'kde=', "'kde'", '"kde"', 'marker', 'parcela', 'wsgp', 'identifik', 'centerMarker', 'L.marker', 'setView', 'hash']) {
  const i = b.t.indexOf(kw);
  if (i >= 0) console.log(`  "${kw}" @${i}: …${b.t.slice(i - 25, i + 75).replace(/\s+/g, ' ')}…`);
}

// ---- Bezrealitky: Disposition enum (druh pozemku) + tags ----
console.log('\n=== Bezrealitky: Disposition enum + tagy ===');
async function gql(query) { const r = await fetch('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ query }) }); return r.json().catch(() => null); }
const disp = await gql(`{ __type(name:"Disposition"){ enumValues{ name } } }`);
console.log('Disposition:', JSON.stringify(disp && disp.data && disp.data.__type && disp.data.__type.enumValues.map((e) => e.name)));
const sample = await gql(`{ listAdverts(limit:5, order:TIMEORDER_DESC, offerType:[PRODEJ], estateType:[POZEMEK]){ list{ id title disposition tags(locale: CS) } } }`);
console.log('ukázka inzerátů:', JSON.stringify(sample && sample.data));
console.log('\nHotovo.');
