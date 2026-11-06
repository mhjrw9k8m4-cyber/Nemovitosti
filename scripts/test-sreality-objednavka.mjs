// Test: co se u Apify objedná, se musí i zkontrolovat (§463).
//
// Spuštění: node scripts/test-sreality-objednavka.mjs   (bez sítě, bez placení)
//
// NALEZENO MĚŘENÍM 6. 11. První ostrý běh placeného actoru dostal
// objednávku `{ category_main_cb: 3, category_type_cb: 1 }` — tak se ty
// parametry jmenují ve vyhledávání Sreality. Actor je nezná: mlčky je
// zahodil a pustil svůj výchozí vstup, tedy byty na prodej v Praze.
// Z 1 666 záznamů byl pozemek ŽÁDNÝ, a přesto se 44 z nich dostalo na
// web jako pozemky (výměru jim dodala jiná vada, §462).
//
// Dvě pravidla z toho:
//   1) vstup se jmenuje tak, jak ho čeká ACTOR (category, transaction,
//      region/regionIds) — ne tak, jak se jmenuje na webu zdroje;
//   2) odpověď se kontroluje proti objednávce. Když přijdou záznamy
//      a mezi nimi ani jeden pozemek, je to SELHÁNÍ zdroje, ne jeho
//      klidný den — tiché prázdno by vypadalo na výpadek (§231).
//
// A protože se u tohohle actoru platí ZA VÝSLEDEK ($3 za tisíc,
// změřeno: 1 666 záznamů = $4,998), hlídá se i strop účtu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { pozemkyZApify } from './fetch-opportunities.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nObjednávka u Apify');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Objednávka u Apify: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Záznam opsaný ze SKUTEČNÉ datové sady (run bcdYVhmEHrBhuaMYu, první
   položka). Zkrácený o pole, která se nečtou, jinak beze změny. */
const BYT = {
  adId: '1999811916',
  detailUrl: 'https://www.sreality.cz/detail/prodej/byt/4+kk/nove-mesto/1999811916',
  title: 'Prodej bytu 4+kk 190 m²',
  category: 'apartment', categoryCode: 1,
  transactionType: 'sale', transactionCode: 1,
  price: 39900000, pricePerSqm: 210000, usableArea: 190,
  locality: 'Praha - Nové Město', city: 'Praha', cityPart: 'Nové Město', street: 'Ke dvoru',
  latitude: 50.0762903701291, longitude: 14.4167272614899,
};
/* Pozemek v témže tvaru — tak má vypadat to, co se objednávalo. */
const POZEMEK = {
  adId: '3000000001',
  detailUrl: 'https://www.sreality.cz/detail/prodej/pozemek/bydleni/liban/3000000001',
  title: 'Prodej pozemku pro bydlení 1 250 m²',
  category: 'land', categoryCode: 3,
  transactionType: 'sale', transactionCode: 1,
  price: 1250000, pricePerSqm: 1000, usableArea: 1250, estateArea: 1250,
  locality: 'Libáň', city: 'Libáň', cityPart: '',
  latitude: 50.3836, longitude: 15.2155,
};

/* --- 1) odpověď se kontroluje proti objednávce --- */
let hozeno = null;
try { pozemkyZApify([BYT, { ...BYT, adId: '2' }]); } catch (e) { hozeno = e; }
pravda('odpověď samých bytů je SELHÁNÍ, ne nula pozemků',
  !!hozeno && hozeno.objednavkaNevyslysena === true,
  hozeno ? hozeno.message : 'nic se nehodilo — bytová odpověď prošla jako klidný den');
pravda('a v hlášce stojí, co actor doopravdy poslal',
  !!hozeno && /apartment/.test(String(hozeno.message)),
  hozeno ? hozeno.message : '—');

const smes = pozemkyZApify([BYT, POZEMEK, { ...BYT, adId: '3' }]);
pravda('ze směsi projdou jen pozemky', smes.pozemky.length === 1 && smes.pozemky[0].adId === POZEMEK.adId,
  JSON.stringify(smes.pozemky.map((x) => x.adId)));
pravda('a rozpad podle kategorie se spočítá celý (ne jen to, co prošlo)',
  smes.poKategorii.apartment === 2 && smes.poKategorii.land === 1, JSON.stringify(smes.poKategorii));
pravda('pozemek se pozná i podle čísla kategorie, když jméno chybí',
  pozemkyZApify([{ ...POZEMEK, category: undefined }]).pozemky.length === 1,
  'categoryCode 3 = pozemek');

/* PRÁZDNÁ ODPOVĚĎ JE JINÝ STAV než odpověď o něčem jiném: zdroj nic
   neposlal, což se posuzuje jinde (hlídka výpadků). Tady se nesmí
   hodit výjimka, jinak by se z každého klidného dne stalo selhání. */
let hozenoPrazdne = null;
try { pozemkyZApify([]); } catch (e) { hozenoPrazdne = e; }
pravda('prázdná odpověď není selhání objednávky',
  hozenoPrazdne === null && pozemkyZApify([]).pozemky.length === 0,
  hozenoPrazdne ? hozenoPrazdne.message : '—');

/* --- 2) vstup se jmenuje tak, jak ho čeká actor --- */
const src = readFileSync(path.join(KOREN, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
const telo = (src.match(/async function fetchSreality\(\)[\s\S]*?\n}/) || [''])[0];
pravda('fetchSreality se dá v robotovi najít', telo.length > 400, 'přejmenovalo se?');
const vstup = (telo.match(/const input = \{[\s\S]*?\n {4}\};/) || [''])[0];
pravda('objednávka se dá najít', vstup.length > 40, vstup.slice(0, 80));
for (const klic of ['category:', 'transaction:', 'maxListings:']) {
  pravda(`objednávka mluví jménem, které actor zná: ${klic}`, vstup.includes(klic), vstup.slice(0, 200));
}
pravda('objednávají se POZEMKY na prodej',
  /category:\s*'land'/.test(vstup) && /transaction:\s*'sale'/.test(vstup), vstup.slice(0, 200));
/* Komentář o té vadě se nepočítá za vadu — zrovna v fetchSreality je
   popsaná i s těmi starými jmény, aby se nezapomnělo proč. */
const teloBezKomentaru = telo
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((r) => { const i = r.indexOf('//'); return i === -1 ? r : r.slice(0, i); }).join('\n');
pravda('a jména z webu Sreality (category_main_cb) už v objednávce nejsou',
  !/category_main_cb|category_type_cb|maxItems/.test(teloBezKomentaru),
  'actor je nezná a mlčky je zahodí — pak pustí svůj výchozí vstup');
const kraje = (telo.match(/const KRAJE = \[[^\]]*\]/) || [''])[0];
pravda('kraje se posílají všechny (14), ne jen Praha', kraje.split(',').length === 14, kraje);

/* --- 3) strop účtu ---
   Cena je za VÝSLEDEK, ne za běh: $3/tisíc, změřeno. Strop v kódu je
   tedy strop útraty a nesmí zmizet ani nenápadně vyrůst. */
const stropKod = (telo.match(/APIFY_SREALITY_STROP \|\| (\d+)/) || [])[1];
pravda('strop počtu výsledků je nastavený (a je to strop útraty)', !!stropKod, 'v kódu chybí');
pravda(`strop drží účet pod $10 za běh (je ${stropKod}, tedy ~$${((Number(stropKod) || 0) * 0.003).toFixed(2)})`,
  Number(stropKod) > 0 && Number(stropKod) * 0.003 <= 10, String(stropKod));

/* --- 4) výměra a místo z POLÍ, ne z textu ---
   Obě vady, které poslaly byty na web, byly ve čtení z textu: výměra
   z názvu (§462) a obec z prvního kusu adresy, kde stála ulice. */
pravda('výměra se bere z pole zdroje a z názvu teprve, když pole není',
  /num\(e\.estateArea[\s\S]{0,200}\|\|\s*parseArea\(name\)/.test(telo),
  (telo.match(/const area = [\s\S]*?;/) || [''])[0].slice(0, 160));
pravda('obec se bere z pole `city`, ne z prvního kusu adresy',
  /String\(e\.city \|\| e\.cityPart/.test(telo),
  (telo.match(/const place = [\s\S]*?;/) || [''])[0].slice(0, 160));
pravda('klíč nabídky stojí na čísle inzerátu (adId), ne na ceně',
  /_key: 'sr-' \+ \(e\.adId/.test(telo), (telo.match(/_key: [^\n]*/) || [''])[0]);

hotovo();
