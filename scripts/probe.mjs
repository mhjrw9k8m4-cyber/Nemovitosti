#!/usr/bin/env node
/* Dočasná sonda: na runneru (má internet) zjistí, co jde z oficiálních
 * veřejných zdrojů stáhnout a v jaké struktuře. Výstup čteme z logu Actions.
 * Po zjištění se tento soubor i workflow smažou. */

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; PozemkomatBot/0.1; +https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

async function probe(label, url, opts = {}) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', ...opts });
    const ct = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    const txt = buf.toString('utf8');
    const kw = ['pozem', 'dražb', 'drazb', 'aukce', 'aukc', 'Kč', 'm2', 'm²', 'vyvolávac', 'exekuc', 'parcel'];
    const hits = kw.filter((k) => txt.toLowerCase().includes(k.toLowerCase()));
    // pokus o JSON
    let jsonInfo = '';
    if (ct.includes('json') || txt.trim().startsWith('{') || txt.trim().startsWith('[')) {
      try { const j = JSON.parse(txt); jsonInfo = ' JSON-keys=' + (Array.isArray(j) ? '[array len ' + j.length + ']' : Object.keys(j).slice(0, 12).join(',')); } catch { jsonInfo = ' (vypadá jako JSON, ale neparsuje)'; }
    }
    console.log(`\n### ${label}\n  URL: ${url}\n  status=${r.status} ct=${ct} len=${buf.length}\n  klíčová slova: ${hits.join(', ') || '—'}${jsonInfo}`);
    console.log('  úvod: ' + txt.replace(/\s+/g, ' ').slice(0, 360));
  } catch (e) {
    console.log(`\n### ${label}\n  URL: ${url}\n  CHYBA: ${e.message}`);
  }
}

const P = 'https://www.portaldrazeb.cz';
const U = 'https://www.nabidkamajetkustatu.cz';

await probe('PortalDrazeb / homepage', P + '/');
await probe('PortalDrazeb / online list', P + '/drazby/online');
await probe('PortalDrazeb / mapa data?', P + '/drazby/mapa');
await probe('PortalDrazeb / api auctions', P + '/api/auctions');
await probe('PortalDrazeb / auctions.json', P + '/auctions.json');
await probe('PortalDrazeb / rss', P + '/rss');
await probe('PortalDrazeb / sitemap', P + '/sitemap.xml');

await probe('UZSVM / homepage', U + '/');
await probe('UZSVM / nms homepage', 'https://www.nms.gov.cz/');
await probe('UZSVM / rss', U + '/rss');
await probe('UZSVM / sitemap', U + '/sitemap.xml');

console.log('\n### HOTOVO');
