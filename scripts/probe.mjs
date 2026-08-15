#!/usr/bin/env node
/* Sonda v4 (rozhodující): stáhnout auctions bundle a vypsat VŠECHNY cesty
 * a HTTP volání — buď najdeme statickou API adresu, nebo potvrdíme, že je
 * dynamická (a Portál dražeb pak jako zdroj opustíme). */

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; PozemkomatBot/0.1)' };
const url = 'https://www.portaldrazeb.cz/build/js/web/auctions/auctions.f08f130a.js';
const r = await fetch(url, { headers: UA });
const js = Buffer.from(await r.arrayBuffer()).toString('utf8');
console.log('bundle status=' + r.status + ' len=' + js.length);

// všechny absolutní cesty v uvozovkách
const paths = new Set();
for (const m of js.matchAll(/["'`](\/[a-z0-9][a-z0-9_\-\/{}.:%]{2,70})["'`]/gi)) paths.add(m[1]);
console.log('\nAbsolutní cesty (' + paths.size + '):');
[...paths].sort().slice(0, 60).forEach((p) => console.log('  ' + p));

// kontexty HTTP volání (axios/$http/fetch/get/post)
console.log('\nHTTP volání (kontexty):');
const calls = new Set();
for (const m of js.matchAll(/(?:\$http|axios|fetch|\.get|\.post|\$axios|api)\s*[.(]?\s*[`'"([]?([^`'")\s]{0,60})/gi)) {
  const s = m[0].replace(/\s+/g, ' ').slice(0, 80);
  if (/[/a-z]/i.test(m[1])) calls.add(s);
}
[...calls].slice(0, 40).forEach((c) => console.log('  ' + c));

// hledáme i "url:" v konfiguracích
console.log('\n"url:" konfigurace:');
[...new Set([...js.matchAll(/url\s*:\s*["'`]([^"'`]{2,70})["'`]/gi)].map((m) => m[1]))].slice(0, 30).forEach((u) => console.log('  ' + u));
console.log('\n### HOTOVO');
