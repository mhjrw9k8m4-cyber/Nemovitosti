// Zkouška: patří ta poloha do okresu, který se u ní tvrdí?
//
// Spuštění: node scripts/test-okres-poloha.mjs   (nepotřebuje prohlížeč)
//
// Robot zná u nabídky okres z dražební vyhlášky, ale souřadnice si musí
// dohledat podle názvu obce (Nominatim). Názvy obcí se v Česku opakují:
// Dubenců, Březových nebo Slatin je několik. Když se vezme špatná,
// špendlík skončí o 250 km vedle — a s ním i okresní stránka, do které
// nabídka spadne, i ceny, s nimiž se srovnává.
//
// Bránilo se tomu kruhem kolem středu okresu (55 km). To je ale jen
// náhražka: kruh sahá i do okresů vedlejších, takže Slatina u Znojma
// prošla jako „okres Brno-město" (od středu Brna 47 km). Hranice okresu
// je přesná odpověď a máme ji v datech, tak se ptáme jí.
//
// Druhá polovina zkoušky je o uložených odpovědích: strop 55 km přišel
// později než mezipaměť, a ta se nikdy nepřepočítala — osm obcí tak
// dostávalo špatnou polohu dál, protože „už jednou uložená byla".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kmVenZOkresu } from './okres-podle-gps.mjs';
import { polohaSediSOkresem, prorezMezipamet, okresZAdresyInzeratu } from './fetch-opportunities.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}
function blizko(popis, vyslo, cekano, tolerance) {
  pravda(popis, typeof vyslo === 'number' && Math.abs(vyslo - cekano) <= tolerance,
    'čekáno ' + cekano + ' ± ' + tolerance + ', vyšlo ' + vyslo);
}

/* --- Vzdálenost od okresu ------------------------------------------- */
// Střed Brna leží v okrese Brno-město, tam je vzdálenost nula.
blizko('bod uvnitř okresu má od něj nulovou vzdálenost',
  kmVenZOkresu(49.195, 16.608, 'Brno-město'), 0, 0);
// Koberovy: obec přímo na hranici, 80 m za ní. Správná poloha.
blizko('obec těsně za hranicí okresu vyjde v desítkách metrů',
  kmVenZOkresu(50.62405, 15.21881, 'Jablonec nad Nisou'), 0.075, 0.03);
// Slatina u Znojma vydávaná za Slatinu v Brně: jiná obec téhož jména.
blizko('jiná obec téhož jména vyjde v desítkách kilometrů',
  kmVenZOkresu(49.01569, 16.02626, 'Brno-město'), 36.8, 0.5);
pravda('u okresu, který neznáme, se nic nepředstírá',
  kmVenZOkresu(49.195, 16.608, 'Okres Vymyšlený') === null);
pravda('a stejně tak u nesmyslných souřadnic',
  kmVenZOkresu(null, undefined, 'Brno-město') === null);

/* --- Rozhodnutí, které z toho robot dělá ---------------------------- */
pravda('poloha uvnitř okresu se bere', polohaSediSOkresem(49.195, 16.608, 'Brno-město') === true);
pravda('obec těsně za hranicí okresu se bere taky', polohaSediSOkresem(50.62405, 15.21881, 'Jablonec nad Nisou') === true);
pravda('obec ve VEDLEJŠÍM okrese se bere (vyhláška a hranice se u nich rozcházejí běžně)',
  polohaSediSOkresem(48.94, 16.55, 'Břeclav') === true,
  'Přibice leží v Brně-venkově 3 km od Břeclavi a jejich poloha je správná');
pravda('jiná obec téhož jména na druhém konci republiky se NEbere',
  polohaSediSOkresem(49.01569, 16.02626, 'Brno-město') === false);
pravda('a rozhoduje se i tam, kde kruh kolem středu okresu mlčel (jinak by oprava nebyla k ničemu)',
  (function () {
    const stred = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'okresy.json'), 'utf8')).okresy['Brno-město'];
    const r = Math.PI / 180, dLat = (49.01569 - stred[0]) * r, dLng = (16.02626 - stred[1]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(stred[0] * r) * Math.cos(49.01569 * r) * Math.sin(dLng / 2) ** 2;
    const km = 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return km < 55;
  })(),
  'od středu Brna je ta špatná Slatina dál než 55 km — pak tahle zkouška neměří, o co jde');

/* --- Uložené odpovědi ----------------------------------------------- */
{
  const vzorek = {
    'koberovy|jablonec nad nisou': [50.62405, 15.21881],   // 80 m za hranicí — nechat
    'přibice|břeclav': [48.94, 16.55],                     // vedlejší okres — nechat
    'slatina|brno-město': [49.01651, 16.02313],            // jiná obec, 37 km — zahodit
    'březová|opava': [49.9214, 14.0656],                   // jiná obec, 261 km — zahodit
    'cast|49.348,18.045': null,                            // název čtvrti, ne poloha
    'nesmysl|okres vymyšlený': [50, 15],                   // neznámý okres — nechat
  };
  const pred = Object.keys(vzorek).length;
  const zahozeno = prorezMezipamet(vzorek, false);
  pravda('ze vzorku se zahodily právě dvě špatné odpovědi', zahozeno === 2, 'zahozeno ' + zahozeno);
  pravda('a zůstalo v něm všechno ostatní', Object.keys(vzorek).length === pred - 2,
    'zbylo ' + Object.keys(vzorek).join(', '));
  pravda('obec na hranici okresu se nezahodila', 'koberovy|jablonec nad nisou' in vzorek);
  pravda('ani obec ve vedlejším okrese', 'přibice|břeclav' in vzorek);
  pravda('název čtvrti se nepoplete se souřadnicemi', 'cast|49.348,18.045' in vzorek);
  pravda('a neznámý okres se nechá být', 'nesmysl|okres vymyšlený' in vzorek);
  pravda('špatné odpovědi jsou pryč',
    !('slatina|brno-město' in vzorek) && !('březová|opava' in vzorek));
}

/* --- Že si to robot opravdu takhle zapojil -------------------------- */
{
  const z = fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
  /* Tři místa se ptají „sedí ta poloha k tomu okresu?": dohledání podle
     jména, souřadnice od zdroje a odpověď z mezipaměti. Každé si to dřív
     odpovídalo vlastním kruhem kolem středu; opisy se rozcházely. Teď
     smí na strop 55 km sáhnout jedině to jedno společné pravidlo. */
  const vyskyty = (z.match(/OKRES_DOSAH_KM/g) || []).length;
  const vKomentari = (z.match(/OKRES_DOSAH_KM\)/g) || []).length;
  pravda('na strop od středu okresu sahá jen jedno místo v kódu', vyskyty - vKomentari <= 2,
    'OKRES_DOSAH_KM se v kódu objevuje ' + vyskyty + 'krát — tři opisy téhož pravidla se rozejdou');
  pravda('všechna tři místa se ptají společného pravidla',
    (z.match(/polohaSediSOkresem\(/g) || []).length >= 4,
    'volání polohaSediSOkresem je jen ' + (z.match(/polohaSediSOkresem\(/g) || []).length);
  pravda('okres z textu popisu nepřebíjí okres z hranice',
    /if \(om && !zHranice\)/.test(z),
    'text okres z GPS přebíjel — komentář v kódu přitom říká „z GPS (spolehlivé), jinak z textu"');
  pravda('a sbírat dat se začne jen při přímém spuštění (jinak by tuhle zkoušku nešlo napsat)',
    /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\)/.test(z));
}

/* ---- OKRES Z ADRESY INZERÁTU ROZSOUDÍ HOMONYMA ----
   Jména obcí se opakují a geokodér nerozhoduje podle inzerátu, ale podle
   toho, co zná. NAMĚŘENO 11. 11. na ostrých datech: ze 218 nabídek,
   u kterých jde okres z adresy inzerátu přečíst, mělo 21 na webu JINÝ
   okres — Záblatí z Prachatic viselo ve Žďáru nad Sázavou, Kluky z Písku
   v Mladé Boleslavi, byt v Prokopa Holého z Hradce Králové v Olomouci.
   Každá taková nabídka má cizí špendlík, cizí okresní stránku i srovnání
   ceny z cizího kraje.
   Čte se konzervativně — jen jméno okresního města CELÉ za slovem
   o druhu nabídky, nebo víceslovné jméno na konci. Proto tu stojí
   i pasti: „moravsky-pisek" není Písek (Moravský Písek je v okrese
   Hodonín) a „jesenik-nad-odrou" není Jeseník. */
{
  const vzorky = [
    ['https://www.bezrealitky.cz/x/1-nabidka-prodej-pozemku-prachatice', 'Prachatice'],
    ['https://www.bezrealitky.cz/x/2-nabidka-prodej-domu-tachov', 'Tachov'],
    ['https://www.bezrealitky.cz/x/3-nabidka-prodej-bytu-prokopa-holeho-hradec-kralove', 'Hradec Králové'],
    ['https://www.bezrealitky.cz/x/4-nabidka-prodej-pozemku-moravsky-pisek', null],
    ['https://www.bezrealitky.cz/x/5-nabidka-prodej-pozemku-jesenik-nad-odrou', null],
    ['https://www.bezrealitky.cz/x/6-nabidka-prodej-bytu-praha-5', null],
    ['', null],
  ];
  const spatne = vzorky.filter(([u, c]) => okresZAdresyInzeratu(u) !== c)
    .map(([u, c]) => `${u.slice(-42)} → ${JSON.stringify(okresZAdresyInzeratu(u))}, čekáno ${JSON.stringify(c)}`);
  pravda(`okres se z adresy inzerátu čte správně (${vzorky.length} vzorků včetně pastí)`,
    spatne.length === 0, spatne.join('\n      '));

  const nabidky = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'))
    .opportunities || []);
  let citelnych = 0;
  const odporuji = [];
  for (const o of nabidky) {
    if (!o.url || !o.okres) continue;
    const z = okresZAdresyInzeratu(o.url);
    if (!z) continue;
    citelnych++;
    if (z !== o.okres) odporuji.push(`${o.place}: adresa říká ${z}, data mají ${o.okres}`);
  }
  // PŘEDPOKLAD: bez čitelných adres by kontrola níž prošla o prázdnu
  pravda(`je co srovnávat — u ${citelnych} nabídek jde okres z adresy přečíst`,
    citelnych >= 50, 'čitelných adres jen ' + citelnych);
  pravda('žádná nabídka si s adresou inzerátu neodporuje v okrese',
    odporuji.length === 0,
    `odporuje ${odporuji.length}: ` + odporuji.slice(0, 4).join(' | '));

  /* A JEŠTĚ TVAR ZDROJE, protože kontrola nad daty by po odebrání
     pravidla zůstala zelená: data už opravená jsou a vada by se
     projevila teprve příštím během robota, tedy v noci a bez svědka.
     Hlídá se tedy obojí — co v datech je, i že pravidlo pořád platí. */
  const robot = fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
  pravda('klíč slovníku obcí nese i okres z adresy (jinak si dvě „Kamenice" přepíšou jeden záznam)',
    /const klic = place\.toLowerCase\(\) \+ \(okresZUrl \? '@' \+ okresZUrl : ''\)/.test(robot),
    'v robotovi se klíč skládá jen z názvu obce');
  pravda('a když geokodér ukáže do jiného okresu, rozhoduje adresa',
    /if \(okresZUrl && okres !== okresZUrl\)/.test(robot),
    'rozsouzení podle adresy inzerátu v robotovi není');
}

console.log('\nPoloha vs okres — patří k sobě?');
console.log(zpravy.join('\n'));
console.log('\n' + ok + ' v pořádku, ' + chyb + ' chyb\n');
if (chyb) { console.log('::error::Poloha vs okres: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
