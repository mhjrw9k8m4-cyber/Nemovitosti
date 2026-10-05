// Test: kód BPEJ se přečte z odpovědi úřadu, a nic se nevymyslí.
//
// Spuštění: node scripts/test-bpej.mjs   (nepotřebuje prohlížeč ani síť)
//
// Služby úřadů jsou z prostředí, kde se tohle psalo, nedostupné — proxy
// vrací na mapy.spucr.cz, services.cuzk.gov.cz i geoportal.gov.cz nulu.
// Jediný způsob, jak parsování ověřit, je tedy dát mu odpověď přímo;
// přesně tak se v tomhle repozitáři zkouší i čtení dražeb z CEVD.
//
// Odpovědi jsou tři a každá služba posílá jinou: JSON (GeoServer),
// GML/XML (ČÚZK) a HTML tabulka (ArcGIS).
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const B = createRequire(import.meta.url)(path.join(ROOT, 'js', 'bpej.js'));

let ok = 0, chyb = 0; const zpravy = [];
function je(popis, vyslo, cekano) {
  if (JSON.stringify(vyslo) === JSON.stringify(cekano)) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${JSON.stringify(cekano)}, vyšlo ${JSON.stringify(vyslo)}`); }
}
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- Dotaz na bod ---------------------------------------------------- */
const SLUZBA = { url: 'https://mapy.spucr.cz/geoserver/bpej/wms', vrstvy: 'bpej:bpej' };
const u = B.dotazUrl(SLUZBA, 49.19048, 16.6156);
pravda('dotaz míří na službu z dat, ne na vymyšlenou adresu', u.indexOf(SLUZBA.url) === 0, u);
pravda('a je to GetFeatureInfo', /REQUEST=GetFeatureInfo/.test(u));
pravda('ptá se na tutéž vrstvu, kterou kreslí', /QUERY_LAYERS=bpej%3Abpej/.test(u) && /LAYERS=bpej%3Abpej/.test(u));
/* Pixel, na který se ptáme, musí ležet UPROSTŘED výřezu — jinak by odpověď
   patřila jinému místu, než na které se díváme. Tady se to spočítá
   nezávisle na modulu, ne stejným vzorcem. */
{
  const q = Object.fromEntries(u.split('?')[1].split('&').map((x) => x.split('=')));
  const bbox = decodeURIComponent(q.BBOX).split(',').map(Number);
  const sirka = +q.WIDTH, x = +q.X, y = +q.Y;
  je('dotazovaný pixel je přesně uprostřed výřezu', [x, y], [(sirka - 1) / 2, (sirka - 1) / 2]);
  const stredLng = (bbox[0] + bbox[2]) / 2, stredLat = (bbox[1] + bbox[3]) / 2;
  pravda('a střed výřezu je ten bod, na který se ptáme',
    Math.abs(stredLng - 16.6156) < 1e-9 && Math.abs(stredLat - 49.19048) < 1e-9,
    `střed ${stredLat}, ${stredLng}`);
  /* Výřez musí být malý: na velkém by odpověď patřila sousední půdě. */
  const sirkaStupne = bbox[2] - bbox[0];
  pravda(`výřez je úzký (${(sirkaStupne * 111000).toFixed(0)} m)`, sirkaStupne * 111000 < 80);
}
pravda('bez souřadnic se dotaz nesestaví', B.dotazUrl(SLUZBA, NaN, 16.6) === null);
pravda('a bez služby taky ne', B.dotazUrl(null, 49.1, 16.6) === null);

/* --- Tři formáty odpovědi -------------------------------------------- */
je('GeoServer (JSON)', B.kodZOdpovedi(JSON.stringify({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { KOD_BPEJ: '50810', TRIDA: 'II.' } }],
})), '50810');
je('ČÚZK (GML)', B.kodZOdpovedi(
  '<?xml version="1.0"?><wfs:FeatureCollection><gml:featureMember>'
  + '<bpej:BPEJ><bpej:KOD_BPEJ>5.08.10</bpej:KOD_BPEJ></bpej:BPEJ>'
  + '</gml:featureMember></wfs:FeatureCollection>'), '50810');
je('ArcGIS (HTML tabulka)', B.kodZOdpovedi(
  '<html><body><table><tr><th>BPEJ</th><td>2.41.00</td></tr>'
  + '<tr><th>Třída ochrany</th><td>I.</td></tr></table></body></html>'), '24100');
je('prostý text', B.kodZOdpovedi('Vrstva bpej\nBPEJ = 71400\n'), '71400');

/* --- Zápis kódu ------------------------------------------------------ */
je('slitý zápis', B.normalizuj('50810'), '50810');
je('s tečkami', B.normalizuj('5.08.10'), '50810');
je('s pomlčkami', B.normalizuj('5-08-10'), '50810');
je('s mezerami', B.normalizuj('5 08 10'), '50810');

/* --- A TEĎ PASTI, protože tady se parser splete tiše ------------------ */
je('prázdná odpověď nevrací nic', B.kodZOdpovedi(''), null);
je('null nevrací nic', B.kodZOdpovedi(null), null);
je('odpověď bez kódu nevrací nic',
  B.kodZOdpovedi(JSON.stringify({ features: [] })), null);
/* Tohle je ta hlavní past: služba odpoví, ale o BPEJ v ní nic není.
   Kdyby se tvar 1+2+2 hledal v celém dokumentu, našel by se v čísle
   parcely nebo v souřadnici a web by vypsal cizí číslo jako bonitu. */
je('parcelní číslo se za BPEJ nevydává',
  B.kodZOdpovedi(JSON.stringify({ features: [{ properties: { PARCELA: '4701/4', VYMERA: 721 } }] })), null);
je('ani souřadnice v hlavičce dokumentu',
  B.kodZOdpovedi('<?xml version="1.0"?><wfs:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2.1">'
    + '<gml:boundedBy><gml:Envelope srsName="EPSG:5514"/></gml:boundedBy></wfs:FeatureCollection>'), null);
/* Když kód JE pod svým jménem, musí vyhrát nad vším ostatním v odpovědi. */
je('pojmenovaný atribut má přednost před jiným pětimístným číslem',
  B.kodZOdpovedi(JSON.stringify({ features: [{ properties: { CISLO: '12345', KOD_BPEJ: '50810' } }] })), '50810');
je('a funguje i malými písmeny',
  B.kodZOdpovedi(JSON.stringify({ features: [{ properties: { bpej: '50810' } }] })), '50810');
/* NEZNÁMÉ JMÉNO ATRIBUTU = NIC. Tohle je ta kontrola, kvůli které
   v modulu žádná hádající záloha není: dokud se jméno nepřidá do JMENA,
   nevrátí se radši nic. Předtím tam záloha byla a brala první pětimístné
   číslo v odpovědi — a sabotáž ukázala, že to moje pasti nerozeznají. */
je('kód pod neznámým jménem se radši nevydá',
  B.kodZOdpovedi(JSON.stringify({ features: [{ properties: { NECO_JINEHO: '50810' } }] })), null);
je('ani prostý pětimístný text bez jména',
  B.kodZOdpovedi('50810'), null);
je('chybný zápis (čtyři číslice) se nepřijme', B.normalizuj('5081'), null);
je('ani text', B.normalizuj('nevím'), null);

console.log('\nBPEJ: dotaz na bod a čtení odpovědi');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::BPEJ: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::BPEJ: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
