#!/usr/bin/env node
/* Sonda v2: struktura HTML Portálu dražeb — odkazy na detaily, jak vypadá
 * karta dražby (cena, výměra, typ, lokalita), stránkování, filtr pozemků. */

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; PozemkomatBot/0.1; +https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const P = 'https://www.portaldrazeb.cz';

async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  return { status: r.status, txt: Buffer.from(await r.arrayBuffer()).toString('utf8') };
}

for (const path of ['/drazby/online', '/drazby/pripravovane']) {
  try {
    const { status, txt } = await get(P + path);
    console.log(`\n===== ${path} status=${status} len=${txt.length} =====`);
    // 1) odkazy na detaily dražeb
    const hrefs = [...new Set([...txt.matchAll(/href="([^"]*(?:drazb|drazba|detail)[^"]*)"/gi)].map((m) => m[1]))];
    console.log('Odkazy (detaily) — prvních 20:');
    hrefs.slice(0, 20).forEach((h) => console.log('  ' + h));
    console.log('celkem unikátních odkazů s drazb/detail: ' + hrefs.length);
    // 2) karta: úsek HTML kolem prvního výskytu "Kč"
    const idx = txt.indexOf('Kč');
    if (idx > 0) {
      console.log('\n--- HTML kolem první ceny (900 zn.) ---');
      console.log(txt.slice(Math.max(0, idx - 700), idx + 200).replace(/\s+/g, ' '));
    }
    // 3) kde se mluví o pozemku (typ nemovitosti)
    const pIdx = txt.toLowerCase().indexOf('pozem');
    if (pIdx > 0) {
      console.log('\n--- HTML kolem "pozem" (500 zn.) ---');
      console.log(txt.slice(Math.max(0, pIdx - 250), pIdx + 250).replace(/\s+/g, ' '));
    }
    // 4) stránkování / počet výsledků
    const pag = txt.match(/(page=\d+|stranka=\d+|\?p=\d+|data-page)/i);
    console.log('\nstránkování: ' + (pag ? pag[0] : 'nenalezeno v úvodu'));
    const cnt = txt.match(/(\d[\d\s]{1,6})\s*(?:dražeb|výsledk|nemovitost)/i);
    console.log('počet výsledků: ' + (cnt ? cnt[0] : '—'));
  } catch (e) { console.log(path + ' CHYBA ' + e.message); }
}
console.log('\n### HOTOVO');
