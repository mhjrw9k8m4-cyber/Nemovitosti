#!/usr/bin/env node
/* Sonda v3: najít API endpoint, ze kterého Vue SPA Portálu dražeb tahá
 * seznam dražeb. Stáhneme JS bundly a vyhrabeme cesty/URL, které vypadají
 * jako API pro dražby. */

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; PozemkomatBot/0.1)' };
const P = 'https://www.portaldrazeb.cz';

async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  return { status: r.status, txt: Buffer.from(await r.arrayBuffer()).toString('utf8') };
}

const { txt: html } = await get(P + '/drazby/online');
// JS bundly
const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/gi)].map((m) => m[1]))];
console.log('JS bundly (' + scripts.length + '):');
scripts.forEach((s) => console.log('  ' + s));

// data- atributy na kořeni appky (často nesou API URL nebo initial data)
const dataAttrs = [...html.matchAll(/data-(page|api|url|endpoint|props|component)="([^"]{0,120})"/gi)].slice(0, 15);
console.log('\ndata- atributy (app):');
dataAttrs.forEach((m) => console.log('  data-' + m[1] + '="' + m[2].replace(/&quot;/g, '"').slice(0, 100) + '"'));

// projdeme bundly a hledáme cesty vypadající jako API
const found = new Set();
for (const s of scripts.slice(0, 8)) {
  const url = s.startsWith('http') ? s : P + (s.startsWith('/') ? s : '/' + s);
  let js;
  try { js = (await get(url)).txt; } catch { continue; }
  // řetězce v uvozovkách, které vypadají jako cesta a nesou klíčové slovo
  for (const m of js.matchAll(/["'`](\/[a-z0-9_\-\/{}.:]*(?:drazb|drazeb|aukce|aukc|verejn|public|api|search|list|nemovit)[a-z0-9_\-\/{}.:]*)["'`]/gi)) {
    if (m[1].length < 80) found.add(m[1]);
  }
  // axios/fetch base URL
  for (const m of js.matchAll(/(?:baseURL|apiUrl|API_URL)\s*[:=]\s*["'`]([^"'`]{0,80})["'`]/gi)) found.add('BASE=' + m[1]);
}
console.log('\nMožné API cesty z JS (' + found.size + '):');
[...found].sort().forEach((f) => console.log('  ' + f));
console.log('\n### HOTOVO');
