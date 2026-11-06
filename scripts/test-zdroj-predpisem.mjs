// Test: dražební zdroj čtený podle předpisu (§464).
//
// Spuštění: node scripts/test-zdroj-predpisem.mjs   (bez sítě)
//
// Obecná cesta (JSON-LD → mikrodata → signály) umí jen prodeje; dražbu
// z ní nejde popsat tak, aby si web nevymýšlel. Dražební výpis proto
// čte PŘEDPIS a `zdrojePodlePredpisu` ho zapojuje do nočního robota.
// Stahování se sem podstrčí, takže zkouška nepotřebuje síť ani cizí
// web — měří se ROZHODOVÁNÍ, ne dostupnost.
//
// Fixtura je psaná podle skutečného výpisu verejnedrazby.cz, jak ho
// změřilo devět ostrých pokusů 6. 11.: stav aukce stojí PŘED názvem,
// název končí závorkou s typem řízení a „Čas do konce:", evidenční
// číslo je za záznamem a na výpise jsou i movité věci.
import { zdrojePodlePredpisu } from './fetch-opportunities.mjs';
import { zZaznamu, slovnikMist, mistoZTextu } from './cteni-zdroje.mjs';
import { PREDPISY, ZAPOJENE_PREDPISY } from './predpisy-zdroju.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nZdroj čtený podle předpisu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Zdroj podle předpisu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const STRANKA = `<html><body><div>145 aukcí
 Aktivní Prodej stavebního pozemku 1 250 m2, Libáň ( Veřejná dražba - elektronická) Čas do konce: 3 dny
 Cena: 1 250 000 Kč <a href="/aukce/prodej-pozemku-liban-8070/">detail</a> Evid. číslo: A8070
 Prodáno Prodej RD, zastavěná plocha 134 m2, Žatec ( Veřejná dražba) Čas do konce: Ukončeno
 Cena: 2 746 666 Kč <a href="/aukce/rd-zatec-8071/">detail</a> Evid. číslo: A8071
 Aktivní Kolový traktor ZETOR PROXIMA 6421 ( Uzavřená aukce) Čas do konce: 1 den
 Cena: 450 000 Kč <a href="/aukce/traktor-8072/">detail</a> Evid. číslo: A8072
 Aktivní Prodej RD 5+kk s užitnou plochou 216 m2, Žatec ( Veřejná dražba) Čas do konce: 5 dnů
 Cena: 3 500 000 Kč <a href="/aukce/rd-5kk-zatec-8073/">detail</a> Evid. číslo: A8073
</div></body></html>`;

const DRIVE = [
  { place: 'Libáň', okres: 'Jičín', lat: 50.3836, lng: 15.2155 },
  { place: 'Žatec', okres: 'Louny', lat: 50.3271, lng: 13.5457 },
];
const slovnik = slovnikMist(DRIVE);
const okresy = new Set(DRIVE.map((o) => o.okres));
const nastroje = (stahni, smimeCist) => ({
  stahni, smimeCist, zZaznamu, predpisy: PREDPISY, mistoZTextu, slovnik, okresy,
  ua: 'zkouška', pauza: 0,
});
/* Obsah má jen první stránka; další vrací prázdno jako výpis, který
   došel na konec. Zároveň se tím počítá, kolikrát se sáhlo na web. */
let dotazu = 0;
const stahniFixturu = async (url) => {
  dotazu++;
  return { ok: true, text: async () => (/pos=/.test(url) ? '' : STRANKA) };
};
const smimeAno = async () => ({ dovoleno: true });

const vysledek = await zdrojePodlePredpisu(['verejnedrazby.cz'], nastroje(stahniFixturu, smimeAno));
const n = vysledek.nabidky;
const z = vysledek.zdroje[0] || {};
const rozpad = z.rozpadCtecky || {};

/* --- 1) co se na web dostane a co ne --- */
pravda('z výpisu projdou jen celé a živé nabídky (2 ze 4)', n.length === 2,
  JSON.stringify(n.map((x) => x.place + ' / ' + x.price)));
pravda('skončená aukce („Prodáno") na web nepatří',
  !n.some((x) => /8071/.test(String(x.url))) && rozpad.skoncilo === 1, JSON.stringify(rozpad));
pravda('movitá věc (kolový traktor) se zahodí a důvod ji pojmenuje správně',
  !n.some((x) => /traktor/.test(String(x.url))) && rozpad.neniNemovitost === 1 && rozpad.bezVymery === 0,
  JSON.stringify(rozpad));

/* --- 2) co nabídka nese --- */
const pozemek = n.find((x) => x.okres === 'Jičín') || {};
pravda('pozemek má obec, okres, cenu, výměru i odkaz',
  pozemek.place === 'Libáň' && pozemek.price === 1250000 && pozemek.area === 1250
    && /verejnedrazby\.cz\/aukce\/.*8070/.test(String(pozemek.url)), JSON.stringify(pozemek));
pravda('a je to dražba, ne prodej', pozemek.type === 'drazba', String(pozemek.type));
pravda('druh se pozná z názvu', pozemek.druh === 'stavební pozemek', String(pozemek.druh));
pravda('u pozemku se kategorie do dat nepíše (pozemek je výchozí stav)',
  pozemek.kat === undefined, JSON.stringify(pozemek.kat));
const dum = n.find((x) => x.okres === 'Louny') || {};
pravda('u stavby se kategorie do dat napíše', dum.kat === 'stavba', JSON.stringify(dum.kat));
pravda('klíč nabídky stojí na evidenčním čísle', pozemek._key === 'pr-verejnedrazby.cz-8070',
  String(pozemek._key));
pravda('v popisu je evidenční číslo i jméno dražebníka',
  /ev\. č\. 8070/.test(String(pozemek.extra)) && /Veřejné dražby/.test(String(pozemek.extra)),
  String(pozemek.extra));

/* --- 3) stav zdroje se zapisuje jako u každého jiného --- */
pravda('zdroj se hlásí jménem a stavem',
  z.nazev === 'Veřejné dražby' && z.stav === 'ok' && z.pocet === 2,
  JSON.stringify({ nazev: z.nazev, stav: z.stav, pocet: z.pocet }));
pravda('a přiznává, kolik záznamů přečetl', rozpad.zaznamu === 4, JSON.stringify(rozpad));

/* --- 4) robots.txt je první a výjimka žádná --- */
dotazu = 0;
const zakazano = await zdrojePodlePredpisu(['verejnedrazby.cz'],
  nastroje(stahniFixturu, async () => ({ dovoleno: false, duvod: 'Disallow: /' })));
pravda('když robots.txt nedovoluje, nestáhne se ani jedna stránka',
  zakazano.nabidky.length === 0 && dotazu === 0, `dotazů: ${dotazu}`);
pravda('a zdroj to řekne stavem „nesmíme", ne tichou nulou',
  (zakazano.zdroje[0] || {}).stav === 'nesmíme', JSON.stringify(zakazano.zdroje[0]));
const nevime = await zdrojePodlePredpisu(['verejnedrazby.cz'],
  nastroje(stahniFixturu, async () => ({ dovoleno: false, nejdePrecist: true, duvod: 'robots.txt nedojel' })));
pravda('„nevíme" se od „nesmíme" rozlišuje (§337)',
  (nevime.zdroje[0] || {}).stav === 'robots neznámý', JSON.stringify(nevime.zdroje[0]));

/* --- 5) host bez předpisu není tichá nula --- */
const bezPredpisu = await zdrojePodlePredpisu(['neexistuje.example'], nastroje(stahniFixturu, smimeAno));
pravda('host bez předpisu se ohlásí jako chyba, ne jako prázdný zdroj',
  (bezPredpisu.zdroje[0] || {}).stav === 'chyba' && bezPredpisu.nabidky.length === 0,
  JSON.stringify(bezPredpisu.zdroje[0]));

/* --- 6) registr zapojených předpisů --- */
pravda('registr zapojených předpisů obsahuje verejnedrazby.cz',
  ZAPOJENE_PREDPISY.includes('verejnedrazby.cz'), JSON.stringify(ZAPOJENE_PREDPISY));
pravda('a každý zapojený host má svůj předpis s výpisem i jménem',
  ZAPOJENE_PREDPISY.every((h) => PREDPISY[h] && PREDPISY[h].vypis && PREDPISY[h].jmeno),
  JSON.stringify(ZAPOJENE_PREDPISY.filter((h) => !PREDPISY[h])));
pravda('dražební předpis má určený živý stav — jinak by se prodané vydávalo za nabídku',
  ZAPOJENE_PREDPISY.every((h) => PREDPISY[h].typ !== 'drazba'
    || (Array.isArray(PREDPISY[h].zivyStav) && PREDPISY[h].zivyStav.length > 0)),
  JSON.stringify(ZAPOJENE_PREDPISY.map((h) => [h, PREDPISY[h].zivyStav])));

hotovo();
