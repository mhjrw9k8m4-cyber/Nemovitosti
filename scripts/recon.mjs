#!/usr/bin/env node
// Průzkum dalších legálních a bezplatných zdrojů dražeb pozemků.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', ...opts });
    const t = await r.text();
    return { ok: r.ok, status: r.status, ct: r.headers.get('content-type'), len: t.length, text: t };
  } catch (e) { return { ok: false, status: 0, err: e.message, text: '' }; }
}

// 1) exdrazby.cz — najít API endpoint v JS bundlu
console.log('=== exdrazby.cz: hledám API v JS bundlu ===');
const home = await get('https://www.exdrazby.cz/');
const bundle = (home.text.match(/src="(\/static\/js\/main[^"]+\.js)"/) || [])[1];
console.log('JS bundle:', bundle || '(nenalezen)');
if (bundle) {
  const js = await get('https://www.exdrazby.cz' + bundle);
  console.log('bundle:', js.status, js.len, 'B');
  // hledáme řetězce s /api/, axios base URL, endpointy
  const urls = [...new Set([...js.text.matchAll(/["'`](\/(?:api|rest|graphql|v\d)\/[^"'`\s]{0,60})["'`]/gi)].map((m) => m[1]))].slice(0, 30);
  console.log('cesty /api|/rest|/graphql:', JSON.stringify(urls));
  const abs = [...new Set([...js.text.matchAll(/https?:\/\/[a-z0-9.\-]*exdrazby[^"'`\s]{0,60}/gi)].map((m) => m[0]))].slice(0, 20);
  console.log('absolutní exdrazby URL:', JSON.stringify(abs));
  const apiHosts = [...new Set([...js.text.matchAll(/https?:\/\/api[a-z0-9.\-]*\.[a-z]{2,}[^"'`\s]{0,40}/gi)].map((m) => m[0]))].slice(0, 20);
  console.log('api.* hosty:', JSON.stringify(apiHosts));
}

// 2) zkusíme pár typických API cest napřímo
console.log('\n=== exdrazby.cz: přímé tipy na API ===');
for (const p of ['/api/auctions', '/api/drazby', '/api/v1/auctions', '/rest/auctions', '/api/search']) {
  const r = await get('https://www.exdrazby.cz' + p);
  console.log(p, '→', r.status, r.ct, r.len + 'B', r.text.slice(0, 80).replace(/\s+/g, ' '));
}

// 3) ISIR (insolvenční rejstřík) — veřejná data ministerstva spravedlnosti
console.log('\n=== ISIR / justice.cz open data ===');
for (const u of [
  'https://isir.justice.cz/isir/common/index.do',
  'https://dataor.justice.cz/',
  'https://data.justice.cz/',
]) {
  const r = await get(u);
  console.log(u, '→', r.status, r.ct, r.len + 'B');
}

console.log('\nHotovo.');
