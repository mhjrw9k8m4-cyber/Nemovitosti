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
import { zdrojePodlePredpisu, mistoZeJmenaAukce } from './fetch-opportunities.mjs';
import { zZaznamu, slovnikMist, mistoZTextu, obecZNazvuAukce } from './cteni-zdroje.mjs';
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
 Aktivní Prodej stavebního pozemku 1 250 m2, Libáň ( Veřejná dražba - elektronická) Čas do konce: 3 dny 4 hodiny (09.12.2026 10:00:00)
 Cena: 1 250 000 Kč <a href="/aukce/prodej-pozemku-liban-8070/">detail</a> Evid. číslo: A8070
 Prodáno Prodej RD, zastavěná plocha 134 m2, Žatec ( Veřejná dražba) Čas do konce: Ukončeno (04.11.2026 16:00:00)
 Cena: 2 746 666 Kč <a href="/aukce/rd-zatec-8071/">detail</a> Evid. číslo: A8071
 Aktivní Kolový traktor ZETOR PROXIMA 6421 ( Uzavřená aukce) Čas do konce: 1 den 2 hodiny (08.11.2026 12:00:00)
 Cena: 450 000 Kč <a href="/aukce/traktor-8072/">detail</a> Evid. číslo: A8072
 Aktivní Prodej RD 5+kk s užitnou plochou 216 m2, Žatec ( Veřejná dražba) Čas do konce: 5 dnů 1 hodina (11.11.2026 14:00:00)
 Cena: 3 500 000 Kč <a href="/aukce/rd-5kk-zatec-8073/">detail</a> Evid. číslo: A8073
 Aktivní Prodej stavebního pozemku 800 m2, Zlaté Hory ( Veřejná dražba) Čas do konce: 2 dny 3 hodiny (12.11.2026 10:00:00)
 Cena: 900 000 Kč <a href="/aukce/pozemek-zlate-hory-8074/">detail</a> Evid. číslo: A8074
 Aktivní Prodej pozemku 500 m2, Libáň ( Veřejná dražba) Čas do konce: 2 dny
 Cena: 500 000 Kč <a href="/aukce/pozemek-liban-8075/">detail</a> Evid. číslo: A8075
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
pravda('z výpisu projdou jen celé a živé nabídky se známým místem a termínem (2 z 6)',
  n.length === 2, JSON.stringify(n.map((x) => x.place + ' / ' + x.price)));
/* DRAŽBA BEZ TERMÍNU NA WEB NEPATŘÍ: dvě dražby téhož pozemku se bez
   data v kanálu novinek nedají rozlišit a člověk neví, do kdy má čas. */
pravda('dražba bez termínu se zahodí a důvod ji pojmenuje',
  rozpad.bezTerminu === 1 && !n.some((x) => /8075/.test(String(x.url))), JSON.stringify(rozpad));
pravda('a termín se píše do popisu týmž tvarem jako u ostatních dražeb',
  n.every((x) => /^dražba \d{4}-\d{2}-\d{2} · ev\. č\. /.test(String(x.extra))),
  JSON.stringify(n.map((x) => x.extra)));
pravda('obec, kterou slovník nezná, se bez ověření NEDOPLNÍ dohadem',
  rozpad.bezMista === 1 && !n.some((x) => /8074/.test(String(x.url))), JSON.stringify(rozpad));
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
/* A JE TO KLÍČ, KTERÝ WEB ZNÁ. Předpis rozlišuje hrubě (stavba),
   data mají jmenovité klíče (dum, byt, areal, garaz, jine) — psát do
   dat „stavba" znamená psát tam neznámé slovo (§464). */
pravda('u stavby se kategorie do dat napíše, a je to známý klíč',
  dum.kat === 'dum', JSON.stringify(dum.kat));
pravda('klíč nabídky stojí na evidenčním čísle', pozemek._key === 'pr-verejnedrazby.cz-8070',
  String(pozemek._key));
pravda('v popisu je evidenční číslo i jméno dražebníka',
  /ev\. č\. 8070/.test(String(pozemek.extra)) && /Veřejné dražby/.test(String(pozemek.extra)),
  String(pozemek.extra));

/* --- 3) stav zdroje se zapisuje jako u každého jiného --- */
pravda('zdroj se hlásí jménem a stavem',
  z.nazev === 'Veřejné dražby' && z.stav === 'ok' && z.pocet === 2,
  JSON.stringify({ nazev: z.nazev, stav: z.stav, pocet: z.pocet }));
pravda('a přiznává, kolik záznamů přečetl', rozpad.zaznamu === 6, JSON.stringify(rozpad));

/* --- 3b) obec z názvu ověřená geokodérem (§465) ---
   Slovník zná jen obce, které už v datech jsou. Dražby ale přinášejí
   nové: první ostrý běh takhle ztratil 7 živých nabídek z 18. Jméno
   z názvu se proto zkusí OVĚŘIT; geokodér se sem podstrčí, takže
   zkouška nepotřebuje síť. */
let ptaliSeNa = [];
const zJmenaFalesne = async (nazev) => {
  const k = obecZNazvuAukce(nazev);
  ptaliSeNa.push(...k);
  return k.includes('Zlaté Hory')
    ? { place: 'Zlaté Hory', okres: 'Jeseník', lat: 50.2636, lng: 17.3971 } : null;
};
const sGeo = await zdrojePodlePredpisu(['verejnedrazby.cz'],
  { ...nastroje(stahniFixturu, smimeAno), zJmena: zJmenaFalesne });
const zlate = sGeo.nabidky.find((x) => /8074/.test(String(x.url))) || {};
pravda('s ověřeným jménem projde i obec, kterou slovník nezná (3 z 6)',
  sGeo.nabidky.length === 3, JSON.stringify(sGeo.nabidky.map((x) => x.place)));
pravda('a nese obec, okres i souřadnice z geokodéru, ne střed okresu',
  zlate.place === 'Zlaté Hory' && zlate.okres === 'Jeseník'
    && zlate.lat === 50.2636 && zlate.lng === 17.3971, JSON.stringify(zlate));
pravda('ptá se jen na jména, která se z názvu dají přečíst',
  ptaliSeNa.includes('Zlaté Hory'), JSON.stringify(ptaliSeNa));
const zJmenaMarne = async () => null;
const bezGeo = await zdrojePodlePredpisu(['verejnedrazby.cz'],
  { ...nastroje(stahniFixturu, smimeAno), zJmena: zJmenaMarne });
pravda('když se jméno neověří, nabídka zůstane bez místa — nic se nevymyslí',
  bezGeo.nabidky.length === 2 && bezGeo.zdroje[0].rozpadCtecky.bezMista === 1,
  JSON.stringify(bezGeo.zdroje[0].rozpadCtecky));

/* Kandidáti opsaní ze SKUTEČNÝCH názvů, které běh 42264341229
   ztratil. Tohle je to měření, kvůli kterému §465 vzniklo. */
const SKUTECNE = [
  ['Výrobní areál kovovýroby v centru města Varnsdorf, užitná plocha budov 1.813 m2, pozemky 5.277 m2, z majetku METAL OKA, s.r.o.', 'Varnsdorf'],
  ['Prodej garáže, výměra 20 m², vlastní pozemek, elektřina, ul. Mírová, Cheb, Karlovarský kraj', 'Cheb'],
  ['Prodej spoluvlastnického podílu o velikosti id. 1/20 na pozemku - orná půda, celková výměra 1.144 m2, k.ú. Sadová u Sovětic', 'Sadová u Sovětic'],
  ['Prodej RD podlahová plocha 184 m2, stodola, vedlejší stavby, pozemky celkem 2371 m2, Dolní Hořice, Jihočeský kraj', 'Dolní Hořice'],
  ['Prodej bývalého komplexu AURUM, hotel 53 lůžek, obchodní prostory, užitná plocha 1189 m2, pozemky celkem 7063 m2, Zlaté Hory', 'Zlaté Hory'],
  ['Prodej dvojpodlažního RD s dispozicí využití podkroví, obytná plocha 90 m2, pozemek 135 m2, ul. Antonína Trapla, Boskovice', 'Boskovice'],
  ['Prodej výrobně skladovacího areálu, UP 3.013 m2, pozemky 20.522 m2, Hranice-Slavíč, z majetku MORKUS Morava s.r.o.', 'Hranice-Slavíč'],
];
for (const [nazev, cekam] of SKUTECNE) {
  pravda(`z názvu vyjde obec „${cekam}"`, obecZNazvuAukce(nazev).includes(cekam),
    JSON.stringify(obecZNazvuAukce(nazev)) + ' ← ' + nazev.slice(0, 70));
}
pravda('a z názvu bez místa nevyjde nic (radši nic než vymyšlená obec)',
  obecZNazvuAukce('Prodej souboru pohledávek v celkové výši 36 104 441,80 Kč').length === 0,
  JSON.stringify(obecZNazvuAukce('Prodej souboru pohledávek v celkové výši 36 104 441,80 Kč')));
/* Ověřování: kandidát, kterého geokodér nenajde, se zahodí. */
pravda('mistoZeJmenaAukce bez nálezu v geokodéru vrací null',
  (await mistoZeJmenaAukce('Prodej pozemku, Zlaté Hory', async () => null)) === null, 'vrátilo místo');
pravda('a s nálezem dá okres z HRANIC, ne z jména',
  (await mistoZeJmenaAukce('Prodej pozemku, Zlaté Hory', async () => [50.2636, 17.3971]) || {}).okres === 'Jeseník',
  JSON.stringify(await mistoZeJmenaAukce('Prodej pozemku, Zlaté Hory', async () => [50.2636, 17.3971])));

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
