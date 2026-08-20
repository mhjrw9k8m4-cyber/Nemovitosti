// Průzkum v7 — najít klientské API okdrazby (seznam dražeb). Důležité výstupy na konci.
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)', 'accept-language': 'cs' };
const get = async (u, extra = {}) => { const r = await fetch(u, { headers: { ...UA, ...extra }, redirect: 'follow', signal: AbortSignal.timeout(25000) }); return { s: r.status, ct: r.headers.get('content-type') || '', t: await r.text() }; };

const out = [];
try {
  const home = await get('https://www.okdrazby.cz/');
  // hosty a api URL v HTML
  const hosts = [...new Set([...home.t.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]))].filter(h => /okdrazby|api|amazonaws|cdn|backend/i.test(h));
  out.push('hosty(api-ish): ' + JSON.stringify(hosts.slice(0, 12)));
  const apiUrls = [...new Set([...home.t.matchAll(/["'`](https?:\/\/[^"'`]*(?:api|auction|drazb)[^"'`]*|\/api\/[^"'`]*)["'`]/gi)].map(m => m[1]))];
  out.push('api URL v HTML: ' + JSON.stringify(apiUrls.slice(0, 10)));
  // JS chunky
  const chunks = [...new Set([...home.t.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map(m => m[0]))];
  out.push('JS chunků: ' + chunks.length);
  // projdi pár největších/hlavních chunků a hledej fetch/URL
  let apiHits = new Set();
  for (const c of chunks.slice(0, 8)) {
    try {
      const j = await get('https://www.okdrazby.cz' + c);
      for (const m of j.t.matchAll(/["'`](https?:\/\/[a-z0-9.-]*(?:api|okdrazby|backend)[a-z0-9.\-\/]*|\/api\/[a-z0-9._\-\/?=&]*)["'`]/gi)) apiHits.add(m[1]);
      for (const m of j.t.matchAll(/(drazby|auctions?|items|listing|search)[a-z]*\?[a-z0-9=&_]*/gi)) apiHits.add('?' + m[0]);
    } catch {}
  }
  out.push('API stopy z JS: ' + JSON.stringify([...apiHits].slice(0, 15)));
} catch (e) { out.push('home chyba: ' + e.message); }

// RSC endpoint a API guesses
for (const [u, h] of [
  ['https://www.okdrazby.cz/drazby/pozemky?_rsc=1', { RSC: '1' }],
  ['https://www.okdrazby.cz/api/drazby?category=pozemky', {}],
  ['https://www.okdrazby.cz/api/auctions?type=pozemky', {}],
  ['https://api.okdrazby.cz/drazby', {}],
]) {
  try { const r = await get(u, h); const nd = [...new Set([...r.t.matchAll(/\/drazba\/\d+-/g)].map(m => m[0]))].length; const json = /json/i.test(r.ct); out.push(`${u} -> ${r.s} ${r.ct.slice(0,20)} ${r.t.length}B drazby:${nd}${json ? ' JSON:' + r.t.slice(0,120) : ''}`); } catch (e) { out.push(`${u} -> ${e.message}`); }
}
console.log('\n===== VÝSLEDEK =====');
for (const l of out) console.log(l);
console.log('--- hotovo ---');
