#!/usr/bin/env node
// Bezrealitky — je veřejné API (GraphQL) použitelné a povolené?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u, opts = {}) {
  try { const r = await fetch(u, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow', ...opts }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}

// 1) robots.txt API subdomény
const rob = await get('https://api.bezrealitky.cz/robots.txt');
console.log('api robots.txt:', rob.s, JSON.stringify(rob.t.slice(0, 200)));

// 2) GraphQL introspection – zjistíme název dotazu na inzeráty
const introspection = { query: '{ __schema { queryType { fields { name } } } }' };
for (const ep of ['https://api.bezrealitky.cz/graphql/', 'https://api.bezrealitky.cz/']) {
  const r = await get(ep, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(introspection) });
  console.log(`\nGraphQL ${ep} → ${r.s} ${r.ct} ${r.t.length}B`);
  try {
    const j = JSON.parse(r.t);
    const fields = j && j.data && j.data.__schema && j.data.__schema.queryType && j.data.__schema.queryType.fields;
    if (fields) console.log('  dotazy:', JSON.stringify(fields.map((f) => f.name).filter((n) => /advert|estate|listing|nemov|search/i.test(n))));
    else console.log('  odpověď:', r.t.slice(0, 200).replace(/\s+/g, ' '));
  } catch { console.log('  není JSON:', r.t.slice(0, 160).replace(/\s+/g, ' ')); }
}

// 3) zkusíme reálný dotaz na inzeráty pozemků na prodej (běžný tvar listAdverts)
const q = {
  query: `query($limit:Int,$offer:[String],$estate:[String]){ listAdverts(limit:$limit, offerType:$offer, estateType:$estate, order:"TIMEORDER_DESC"){ totalCount list{ id uri mainImage{ url } address gps{ lat lng } price surface disposition estateType offerType } } }`,
  variables: { limit: 3, offer: ['prodej'], estate: ['pozemek'] },
};
const rr = await get('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(q) });
console.log('\nlistAdverts →', rr.s, rr.ct, rr.t.length + 'B');
console.log(rr.t.slice(0, 700));
console.log('\nHotovo.');
