// Testy centra upozornění (js/upozorneni-feed.js).
//
// Spuštění: node scripts/test-upozorneni.mjs
//
// Upozornění se čtou letmo, většinou při něčem jiném. Když je věta špatně
// („5 nové pozemky"), působí web jako automat; když je špatně pořadí nebo
// seskupení, přehlédne se to důležité. Proto se tohle hlídá testem.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = createRequire(import.meta.url)(path.join(ROOT, 'js', 'upozorneni-feed.js'));

let bezi = 0, spadlo = 0;
const vysledky = [];
function je(skupina, popis, vyslo, cekano) {
  bezi++;
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a !== b) { spadlo++; vysledky.push(`  ✕ ${skupina}: ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

const TED = Date.parse('2026-09-19T12:00:00Z');
const POZ = ['nový pozemek', 'nové pozemky', 'nových pozemků'];

/* ---------------- čeština ---------------- */
// Tohle je ta nejviditelnější drobnost: „5 nové pozemky" pozná každý Čech
// a okamžitě to vypadá jako strojový překlad.
je('čeština', 'jedna', F.cislovka(1, POZ), '1 nový pozemek');
je('čeština', 'dva', F.cislovka(2, POZ), '2 nové pozemky');
je('čeština', 'čtyři', F.cislovka(4, POZ), '4 nové pozemky');
je('čeština', 'pět', F.cislovka(5, POZ), '5 nových pozemků');
je('čeština', 'jedenáct', F.cislovka(11, POZ), '11 nových pozemků');
je('čeština', 'dvacet jedna', F.cislovka(21, POZ), '21 nových pozemků');
je('čeština', 'nula', F.cislovka(0, POZ), '0 nových pozemků');

je('formát', 'cena s mezerami', F.cena(1450000), '1 450 000 Kč');
je('formát', 'cena do tisíce', F.cena(800), '800 Kč');
je('formát', 'chybějící cena se neukáže jako nula', F.cena(0), 'cena neuvedena');
je('formát', 'výměra s mezerami', F.vymera(12500), '12 500 m²');
je('formát', 'chybějící výměra je prázdná', F.vymera(0), '');

/* ---------------- čas ---------------- */
je('čas', 'právě teď', F.relativniCas('2026-09-19T11:59:40Z', TED), 'právě teď');
je('čas', 'minuty', F.relativniCas('2026-09-19T11:55:00Z', TED), 'před 5 minutami');
je('čas', 'jedna minuta', F.relativniCas('2026-09-19T11:58:30Z', TED), 'před 1 minutou');
je('čas', 'hodiny', F.relativniCas('2026-09-19T09:00:00Z', TED), 'před 3 hodinami');
je('čas', 'včera', F.relativniCas('2026-09-18T11:00:00Z', TED), 'včera');
je('čas', 'dny', F.relativniCas('2026-09-16T11:00:00Z', TED), 'před 3 dny');
je('čas', 'starší dostane datum', F.relativniCas('2026-09-01T11:00:00Z', TED), '1. 9. 2026');
je('čas', 'chybějící čas nespadne', F.relativniCas(null, TED), '');
je('čas', 'nesmysl nespadne', F.relativniCas('tohle není datum', TED), '');
// Hodiny na serveru a v telefonu se můžou lišit o pár vteřin. „před -3 min"
// by vypadalo jako porucha.
je('čas', 'čas z budoucnosti se neukáže záporně', F.relativniCas('2026-09-19T12:05:00Z', TED), 'právě teď');

/* ---------------- ze zpráv ---------------- */
const VL = [
  { listing_id: 'L1', buyer_id: 'B1', place: 'Kolín', okres: 'Kolín', is_owner: true,
    last_body: 'Dobrý den, je pozemek volný?', last_at: '2026-09-19T11:00:00Z', unread: 2 },
  { listing_id: 'L2', buyer_id: 'B2', place: 'Tábor', okres: 'Tábor', is_owner: false,
    last_body: 'Ano, je.', last_at: '2026-09-17T11:00:00Z', unread: 0 },
];
const zZprav = F.zeZprav(VL);
je('zprávy', 'přečtené vlákno se neukazuje', zZprav.length, 1);
je('zprávy', 'majiteli se řekne, že píše zájemce', zZprav[0].titulek, '2 nové zprávy od zájemce');
je('zprávy', 'je vidět, o který pozemek jde', zZprav[0].misto, 'Kolín · okr. Kolín');
je('zprávy', 'odkaz vede rovnou do konverzace', zZprav[0].odkaz.indexOf('zpravy.html?l=L1&b=B1&o=1'), 0);
je('zprávy', 'ukázka textu je s sebou', zZprav[0].ukazka, 'Dobrý den, je pozemek volný?');
je('zprávy', 'zájemci se řekne, že píše majitel',
  F.zeZprav([Object.assign({}, VL[1], { unread: 1 })])[0].titulek, '1 nová zpráva od majitele');

/* ---------------- z hlídání ---------------- */
const D = (o) => Object.assign({ type: 'sale', okres: 'Tábor', place: 'Tábor', druh: 'stavební pozemek',
  parcel: '1/1', price: 450000, area: 800, first_seen: '2026-09-19' }, o);
const DATA = [D(), D({ parcel: '2/2', first_seen: '2026-09-18' }), D({ parcel: '3/3', first_seen: '2026-09-17' }),
  D({ parcel: '4/4', first_seen: '2026-09-16' }), D({ okres: 'Brno', place: 'Brno', parcel: '9/9' })];
const HLED = [{ id: 's1', label: 'Tábor', okres: 'Tábor', seen_keys: [] }];
const zH = F.zeHlidani(HLED, DATA);
je('hlídání', 'jedno upozornění na hledání', zH.length, 1);
je('hlídání', 'počet sedí (Brno se nepočítá)', zH[0].pocet, 4);
je('hlídání', 'věta je česky', zH[0].titulek, '4 nové pozemky');
je('hlídání', 'je vidět které hledání', zH[0].misto, 'Hlídání „Tábor"');
// Seznam nesmí být nekonečný — tři ukázky a zbytek číslem.
je('hlídání', 'ukázka je omezená', zH[0].polozky.length, F.UKAZKA);
je('hlídání', 'zbytek se dopočítá', zH[0].dalsich, 1);
je('hlídání', 'nejnovější je první', zH[0].polozky[0].popis.indexOf('Tábor'), 0);
je('hlídání', 'v ukázce je výměra i cena',
  zH[0].polozky[0].popis, 'Tábor · 800 m² · 450 000 Kč');
je('hlídání', 'označit jako viděné dostane VŠECHNY klíče, ne jen ukázku',
  zH[0].vsechnyKlice.length, 4);
je('hlídání', 'čas bere z nejnovějšího pozemku', zH[0].cas.slice(0, 10), '2026-09-19');
je('hlídání', 'viděné se nepočítají',
  F.zeHlidani([{ id: 's1', label: 'T', okres: 'Tábor', seen_keys: DATA.slice(0, 3).map((d) => require_key(d)) }], DATA)[0].pocet, 1);
function require_key(d) {
  const bez = (x) => String(x == null ? '' : x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return [d.type || '', bez(d.okres), bez(d.place), d.parcel || '', d.price || '', d.area || ''].join('|').slice(0, 240);
}
je('hlídání', 'všechno viděné → žádné upozornění',
  F.zeHlidani([{ id: 's1', okres: 'Tábor', seen_keys: DATA.map(require_key) }], DATA).length, 0);
// Robot data podepisuje teprve od téhle verze; starší záznamy datum nemají
// a nesmí kvůli tomu spadnout ani předbíhat.
je('hlídání', 'pozemky bez data nespadnou',
  F.zeHlidani(HLED, [D({ first_seen: undefined })])[0].pocet, 1);
je('hlídání', 'pozemek bez data jde dospodu',
  F.zeHlidani(HLED, [D({ parcel: 'x', first_seen: undefined }), D({ parcel: 'y', first_seen: '2026-09-19' })])[0].polozky[0].klic.indexOf('|y|') > 0, true);

/* ---------------- celý seznam ---------------- */
const vse = F.sestav({ vlakna: VL, hledani: HLED, data: DATA });
je('seznam', 'spojí obě strany', vse.length, 2);
je('seznam', 'nejnovější nahoře', vse[0].druh, 'pozemky');   // 19. 9. vs. zpráva 11:00
je('součty', 'zprávy a pozemky zvlášť', F.pocty(vse), { zpravy: 2, pozemky: 4, celkem: 6 });
je('filtr', 'jen zprávy', F.filtruj(vse, 'zprava').length, 1);
je('filtr', 'jen pozemky', F.filtruj(vse, 'pozemky').length, 1);
je('filtr', 'bez filtru vše', F.filtruj(vse, null).length, 2);

/* ---------------- seskupení podle času ---------------- */
const sk = F.seskupPodleCasu([
  { cas: '2026-09-19T10:00:00Z' }, { cas: '2026-09-16T10:00:00Z' }, { cas: '2026-08-01T10:00:00Z' }
], TED);
je('skupiny', 'tři koše', sk.map((k) => k.nadpis), ['Dnes', 'Tento týden', 'Starší']);
je('skupiny', 'prázdné koše se neukazují', F.seskupPodleCasu([{ cas: '2026-09-19T10:00:00Z' }], TED).map((k) => k.nadpis), ['Dnes']);
// Datum nese až robot; u starších záznamů chybí. Tvrdit o nich „Starší"
// by byl výmysl — a vypadalo by to, že je uživatel dávno minul.
je('skupiny', 'bez času se netváří jako staré', F.seskupPodleCasu([{ cas: null }], TED)[0].nadpis, 'Čeká na vás');
je('skupiny', 'nedatované jde první',
  F.seskupPodleCasu([{ cas: '2026-09-19T10:00:00Z' }, { cas: null }], TED).map((k) => k.nadpis), ['Čeká na vás', 'Dnes']);
je('skupiny', 'prázdný vstup nespadne', F.seskupPodleCasu([], TED), []);

/* ---------------- prázdno ---------------- */
je('prázdno', 'nic k zobrazení', F.sestav({}), []);
je('prázdno', 'nulové počty', F.pocty([]), { zpravy: 0, pozemky: 0, celkem: 0 });

/* ---------------- výsledek ---------------- */
console.log(`\nCentrum upozornění: ${bezi} testů`);
if (spadlo) {
  console.log(vysledky.join('\n'));
  console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
