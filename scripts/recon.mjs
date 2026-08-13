#!/usr/bin/env node
// Ověř správnou adresu detailu inzerátu (Bezrealitky) + zda SPÚ má detail.
const UA = { 'user-agent': 'Mozilla/5.0 PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function gql(query) { const r = await fetch('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ query }) }); return r.json().catch(() => null); }
async function head(u) {
  try { const r = await fetch(u, { headers: UA, redirect: 'manual' }); return { s: r.status, loc: r.headers.get('location') }; }
  catch (e) { return { s: 0, err: e.message }; }
}

// 1) pole Advertu s URL
const t = await gql(`{ __type(name:"Advert"){ fields{ name } } }`);
const fields = (t && t.data && t.data.__type && t.data.__type.fields || []).map((f) => f.name).filter((n) => /uri|url|link|slug|absolut|path/i.test(n));
console.log('URL pole Advertu:', JSON.stringify(fields));

// 2) vezmi reálný inzerát a jeho uri
const s = await gql(`{ listAdverts(limit:2, order:TIMEORDER_DESC, offerType:[PRODEJ], estateType:[POZEMEK]){ list{ id uri } } }`);
const adv = s && s.data && s.data.listAdverts && s.data.listAdverts.list || [];
console.log('inzeráty:', JSON.stringify(adv));

// 3) otestuj varianty URL detailu
if (adv[0]) {
  const uri = adv[0].uri;
  const cands = [
    'https://www.bezrealitky.cz/nemovitosti-byty-domy/' + uri,
    'https://www.bezrealitky.cz/nabidka/' + uri,
    'https://www.bezrealitky.cz/' + uri,
    'https://www.bezrealitky.cz/nemovitost/' + uri,
  ];
  for (const u of cands) {
    const r = await head(u);
    console.log(u.replace('https://www.bezrealitky.cz', ''), '→', r.s, r.loc ? ('→ ' + r.loc) : '');
  }
}

// 4) SPÚ – má nabídka detail podle Čísla OP? mrkneme na strukturu odkazu
console.log('\n=== SPÚ detail? ===');
const spu = await (await fetch('https://spu.gov.cz/nabidky', { headers: UA })).text();
const links = [...new Set([...spu.matchAll(/href="([^"]*(?:detail|nabidka)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 8);
console.log('SPÚ odkazy detail:', JSON.stringify(links));
console.log('\nHotovo.');
