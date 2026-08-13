#!/usr/bin/env node
// Otestuj přesně produkční dotaz na Bezrealitky – ukaž chyby i první záznam.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const query = `query($limit:Int,$offset:Int,$order:ResultOrder,$offerType:[OfferType],$estateType:[EstateType]){
  listAdverts(limit:$limit,offset:$offset,order:$order,offerType:$offerType,estateType:$estateType){
    totalCount
    list{ id uri title address price surface surfaceLand gps{ lat lng } }
  }
}`;
const r = await fetch('https://api.bezrealitky.cz/graphql/', {
  method: 'POST', headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ query, variables: { limit: 3, offset: 0, order: 'TIMEORDER_DESC', offerType: ['PRODEJ'], estateType: ['POZEMEK'] } }),
});
console.log('HTTP', r.status);
const j = await r.json().catch(() => null);
if (j && j.errors) console.log('ERRORS:', JSON.stringify(j.errors).slice(0, 800));
const la = j && j.data && j.data.listAdverts;
console.log('totalCount:', la && la.totalCount, '| vráceno:', la && la.list && la.list.length);
if (la && la.list && la.list[0]) console.log('první:', JSON.stringify(la.list[0]));
// zkusíme i gps jako {latitude longitude} kdyby lat/lng neexistovalo
if (j && j.errors) {
  const q2 = `query{ listAdverts(limit:2,order:TIMEORDER_DESC,offerType:[PRODEJ],estateType:[POZEMEK]){ list{ id uri price surfaceLand gps{ __typename } } } }`;
  const r2 = await fetch('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ query: q2 }) });
  const j2 = await r2.json().catch(() => null);
  console.log('\nGPSPoint test:', JSON.stringify(j2).slice(0, 400));
  // introspection GPSPoint fields
  const q3 = `{ __type(name:"GPSPoint"){ fields{ name } } }`;
  const r3 = await fetch('https://api.bezrealitky.cz/graphql/', { method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ query: q3 }) });
  const j3 = await r3.json().catch(() => null);
  console.log('GPSPoint pole:', JSON.stringify(j3 && j3.data));
}
console.log('\nHotovo.');
