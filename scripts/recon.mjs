#!/usr/bin/env node
// Bezrealitky: pole s popisem inzerátu (pro detekci druhu: stavební/les/zahrada…)
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function gql(query) { const r = await fetch('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ query }) }); return r.json().catch(() => null); }

// pole typu Advert obsahující desc/text/popis/anot/nadpis
const t = await gql(`{ __type(name:"Advert"){ fields{ name type{ name kind ofType{ name } } } } }`);
const fields = (t && t.data && t.data.__type && t.data.__type.fields) || [];
console.log('textová pole:', JSON.stringify(fields.filter((f) => /desc|text|popis|anot|nadpis|content|body|summary|title/i.test(f.name)).map((f) => f.name)));

// zkusíme description
for (const fld of ['description(locale: CS)', 'text(locale: CS)', 'descriptionNormalized']) {
  const q = `{ listAdverts(limit:2, order:TIMEORDER_DESC, offerType:[PRODEJ], estateType:[POZEMEK]){ list{ id ${fld} } } }`;
  const r = await gql(q);
  if (r && r.data) {
    const s = JSON.stringify(r.data.listAdverts.list).slice(0, 400);
    console.log(`\n${fld} → OK:`, s);
  } else {
    console.log(`\n${fld} → chyba:`, JSON.stringify(r && r.errors && r.errors[0] && r.errors[0].message));
  }
}
console.log('\nHotovo.');
