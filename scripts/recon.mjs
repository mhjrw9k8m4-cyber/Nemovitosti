#!/usr/bin/env node
// Bezrealitky GraphQL — přesné schéma: pole inzerátu + enumy filtrů.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function gql(query, variables) {
  const r = await fetch('https://api.bezrealitky.cz/graphql/', {
    method: 'POST', headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return { s: r.status, j: await r.json().catch(() => null), t: '' };
}

// argumenty listAdverts + pole typu Advert + enumy
const q = `{
  query: __type(name:"Query"){ fields{ name args{ name type{ kind name ofType{ kind name ofType{ kind name } } } } } }
  advert: __type(name:"Advert"){ fields{ name type{ kind name ofType{ kind name } } } }
  estate: __type(name:"EstateType"){ enumValues{ name } }
  offer: __type(name:"OfferType"){ enumValues{ name } }
  order: __type(name:"ResultOrder"){ enumValues{ name } }
}`;
const r = await gql(q, {});
console.log('status', r.s);
const d = r.j && r.j.data;
if (d) {
  const la = (d.query.fields || []).find((f) => f.name === 'listAdverts');
  console.log('\nlistAdverts args:');
  (la ? la.args : []).forEach((a) => {
    const t = a.type; const tn = t.name || (t.ofType && (t.ofType.name || (t.ofType.ofType && t.ofType.ofType.name)));
    console.log('  ', a.name, ':', tn, '(' + t.kind + ')');
  });
  console.log('\nAdvert pole (jen relevantní):');
  (d.advert.fields || []).forEach((f) => {
    if (/id|uri|price|surface|area|gps|lat|lng|address|estate|offer|disposition|image|title|name|locality|region/i.test(f.name)) {
      const tn = f.type.name || (f.type.ofType && f.type.ofType.name);
      console.log('  ', f.name, ':', tn, '(' + f.type.kind + ')');
    }
  });
  console.log('\nEstateType:', JSON.stringify((d.estate && d.estate.enumValues || []).map((e) => e.name)));
  console.log('OfferType:', JSON.stringify((d.offer && d.offer.enumValues || []).map((e) => e.name)));
  console.log('ResultOrder:', JSON.stringify((d.order && d.order.enumValues || []).map((e) => e.name)));
} else {
  console.log('bez dat:', JSON.stringify(r.j).slice(0, 400));
}
console.log('\nHotovo.');
