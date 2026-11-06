// Test: předpis pro čtení výpisu čte po ZÁZNAMECH, ne napříč stránkou.
//
// Spuštění: node scripts/test-predpis-zdroje.mjs   (nepotřebuje síť)
//
// PROČ VZNIKL. Obecná čtečka má tři cesty a na výpisu dražebníka
// zabere jen ta nejslabší („signál"), která prochází celou stránku
// najednou a páruje čísla podle blízkosti. Změřeno 5. 11. na
// verejnedrazby.cz: týž areál měl jednou výměru 3 013 m² a jednou
// 2 666, provozní budova 406 i 2 666. Takový zdroj se zapojit nedá —
// na web by šla nepravda, ne mezera.
//
// ČÍM SE TU MĚŘÍ. Vzorek NENÍ vymyšlený. Je to doslovný přepis toho,
// co vrátilo ohledání živého výpisu
// https://www.verejnedrazby.cz/vypis-aukci dne 6. 11. 2026 (běhy
// 42149142802 a následující) — včetně mezer, teček v tisícovkách
// a zkomolenin („jiná plochá"). Kdyby se tu psal text „jak by to asi
// vypadalo", zkouška by prověřovala domněnku, ne web (§449).
import { zZaznamu, vymeraSPopiskem } from './cteni-zdroje.mjs';
import { PREDPISY, POPISKY_VYMERY, POPISKY_PLOCHY_STAVBY, kategorieZNazvu, podilZNazvu } from './predpisy-zdroju.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* NAMĚŘENÝ VZOREK. Pět záznamů z jedné stránky výpisu, přepsané
   doslova, plus odkazy tak, jak na té stránce stojí. Schválně jsou
   mezi nimi dvě nabídky, které NEJSOU pozemek (usedlost, garáž),
   jeden spoluvlastnický podíl a jeden název se dvěma výměrami —
   tedy přesně ty případy, na kterých „signál" padal. */
const VZOREK = `
<a href="/aukce/prodej-stavebniho-pozemku-urceneho-k-developerskemu-zameru-pozemky-celkem-2-919m2-ul-slepa-merhautova-centrum-brna-8066/">odkaz</a>
<a href="/aukce/prodej-byvale-zemedelske-usedlosti-3-stavby-uzitna-plocha-371-m2-pozemky-celkem-11-770-m2-bojanov-u-dolni-libochove-8069/">odkaz</a>
<a href="/aukce/prodej-souboru-3-pozemku-lesni-pozemek-stran-jina-plocha-celkova-vymera-5-221-m2-bojanov-u-dolni-libochove-zdar-nad-sazavou-8070/">odkaz</a>
<a href="/aukce/prodej-garaze-vymera-20-m2-vlastni-pozemek-elektrina-ul-mirova-cheb-karlovarsky-kraj-8133/">odkaz</a>
<a href="/aukce/prodej-spoluvlastnickeho-podilu-o-velikosti-id-1-20-na-pozemku-orna-puda-celkova-vymera-1-144-m2-k-u-sadova-u-sovetic-8067/">odkaz</a>
<div>
Aktivní Prodej stavebního pozemku určeného k developerskému záměru, pozemky celkem 2.919m2, ul. Slepá - Merhautova, centrum Brna ( Výběrové řízení - 3 kola) Čas do konce: 8 hodin 42 minut (06.11.2026 12:00:00) Min. cena: 51 265 280 Kč Evid. číslo: A8066
Aktivní Prodej bývalé zemědělské usedlosti, 3 stavby - užitná plocha 371 m2, pozemky celkem 11.770 m2, Bojanov u Dolní Libochové ( Výběrové řízení - 3 kola) Čas do konce: 8 hodin 42 minut (06.11.2026 12:00:00) Min. cena: 3 103 000 Kč Evid. číslo: A8069
Aktivní Prodej souboru 3 pozemků-lesní pozemek, stráň, jiná plochá, celková výměra 5.221 m2, Bojanov u Dolní Libochové, Žďár nad Sázavou ( Výběrové řízení - 3 kola) Čas do konce: 8 hodin 42 minut (06.11.2026 12:00:00) Min. cena: 167 000 Kč Evid. číslo: A8070
Aktivní Prodej garáže, výměra 20 m², vlastní pozemek, elektřina, ul. Mírová, Cheb, Karlovarský kraj ( Výběrové řízení dynamické) Čas do konce: 6 dní 10 hodin (12.11.2026 14:00:00) Cena: 122 000 Kč Evid. číslo: A8133
Aktivní Prodej spoluvlastnického podílu o velikosti id. 1/20 na pozemku - orná půda, celková výměra 1.144 m2, k.ú. Sadová u Sovětic ( Výběrové řízení - 3 kola) Čas do konce: 7 dní 8 hodin (13.11.2026 12:00:00) Min. cena: 2 750 Kč Evid. číslo: A8067
</div>`;

const PREDPIS = PREDPISY['verejnedrazby.cz'];
const ZAKLAD = 'https://www.verejnedrazby.cz/vypis-aukci';

console.log('\nPředpis pro čtení výpisu');

/* ---- 1) rozkrojí se to na tolik nabídek, kolik jich tam je ------- */
const n = zZaznamu(VZOREK, ZAKLAD, PREDPIS);
pravda('z pěti záznamů vyjde pět nabídek', n.length === 5, `vyšlo ${n.length}`);

/* ---- 2) TO HLAVNÍ: každé číslo zůstalo u své nabídky ------------- */
/* Tohle je celý důvod, proč tahle cesta vznikla. Kdyby se četlo
   napříč stránkou, první nabídka by dostala cenu nebo výměru některé
   z dalších — a to se nepozná jinak než tím, že se zkontrolují
   VŠECHNY dvojice naráz, ne jedna ukázková. */
/* ČEKANÉ HODNOTY SE 6. 11. ZMĚNILY (§453) a není to uvolnění meze.
   U 8069 (usedlost) tu dřív stálo 11 770 m², tedy výměra POZEMKU.
   Ostrý pokus ukázal, že se tím o stavbách píše nepravda: u bytu
   vyšlo „67 m²“, přestože byt má 129 a 67 je pozemek pod ním.
   Od té doby platí: u pozemku výměra pozemku, u stavby plocha
   stavby, a výměra pozemku se u stavby vede zvlášť. */
const ceka = [
  { cislo: '8066', cena: 51265280, vymera: 2919 },   // stavební pozemek
  { cislo: '8069', cena: 3103000, vymera: 371 },     // usedlost: užitná plocha, ne 11 770 m² pozemku
  { cislo: '8070', cena: 167000, vymera: 5221 },     // lesní pozemek
  { cislo: '8133', cena: 122000, vymera: 20 },       // garáž: obecné „výměra“
  { cislo: '8067', cena: 2750, vymera: 1144 },       // podíl na orné půdě
];
const sedi = ceka.every((c, i) => n[i] && n[i].cislo === c.cislo
  && n[i].cena === c.cena && n[i].vymera === c.vymera);
pravda('cena i výměra zůstaly u SVÉ nabídky (všech pět dvojic)', sedi,
  n.map((x) => `${x.cislo}: ${x.cena} Kč / ${x.vymera} m²`).join(' | '));

/* ---- 3) výměra se bere podle popisku, ne první v pořadí ---------- */
/* „užitná plocha 371 m2, pozemky celkem 11.770 m2“ — první číslo je
   podlahová plocha budovy. Kdo vezme je, pošle na web usedlost
   o 371 m² jako pozemek. */
const usedlost = n.find((x) => x.cislo === '8069');
pravda('u STAVBY vyhraje plocha stavby, ne výměra pozemku',
  usedlost && usedlost.vymera === 371,
  usedlost ? `vyšlo ${usedlost.vymera} m² (pozemek je 11 770)` : 'záznam 8069 chybí');
pravda('a výměra pozemku se u ní přesto vede, jen zvlášť',
  usedlost && usedlost.vymeraPozemku === 11770,
  usedlost ? `vymeraPozemku ${usedlost.vymeraPozemku}` : '—');
/* U POZEMKU to platí obráceně a musí se měřit taky: kdyby se
   pravidlo přehodilo celé, tahle kontrola padne. */
pravda('u POZEMKU zůstává výměra pozemku',
  n.find((x) => x.cislo === '8070').vymera === 5221,
  String(n.find((x) => x.cislo === '8070').vymera));

/* ---- 4) odkaz se páruje číslem, ne pořadím ----------------------- */
/* Kdyby se braly odkazy po pořadí, stačila by jedna reklama mezi
   nabídkami a celý výpis by se posunul o jedna. */
const les = n.find((x) => x.cislo === '8070');
pravda('odkaz sedí k nabídce podle evidenčního čísla',
  les && /-8070\/$/.test(les.odkaz || ''), les ? String(les.odkaz) : 'záznam 8070 chybí');
pravda('a je to celá adresa, ne cesta', les && /^https:\/\/www\.verejnedrazby\.cz\//.test(les.odkaz || ''),
  les ? String(les.odkaz) : '—');

/* ---- 5) co není pozemek, se za pozemek nevydává ------------------ */
/* Na výpisu jsou garáže, byty i areály. Web o nemovitostech mluvit
   umí (§245) — ale „garáž" nesmí skončit jako „pozemek", jinak bude
   na mapě pozemků stát garáž o 20 m². */
const garaz = kategorieZNazvu(n.find((x) => x.cislo === '8133').nazev);
pravda('garáž se zařadí jako stavba, ne jako pozemek',
  garaz && garaz.kategorie === 'stavba' && garaz.druh === 'garáž', JSON.stringify(garaz));
const lesK = kategorieZNazvu(les.nazev);
pravda('lesní pozemek se zařadí jako pozemek', lesK && lesK.druh === 'lesní pozemek', JSON.stringify(lesK));
const usedlostK = kategorieZNazvu(usedlost.nazev);
pravda('usedlost se zařadí jako stavba', usedlostK && usedlostK.kategorie === 'stavba',
  JSON.stringify(usedlostK));

/* ---- 5b) §453: CO NENÍ NEMOVITOST, NA WEB NEPATŘÍ --------------- */
/* Ostrý pokus 6. 11. našel na výpisu i tohle: „Prodej souboru
   pohledávek v celkové souhrnné výši 36 104 441,80 Kč" a „Osobní
   automobil NISSAN NV200, 2012, 201 915 km". Dřív se tvářily jako
   NEÚPLNÁ nabídka (chybí výměra) — jenže ony nejsou neúplné, jsou
   cizí, a na web o nemovitostech nepatří vůbec. */
{
  const auto = kategorieZNazvu('Prodej Osobní automobil NISSAN NV200, 2012, RZ: 9U83831, 201.915 km');
  pravda('automobil se pozná jako „není nemovitost“',
    auto && auto.kategorie === 'jiné', JSON.stringify(auto));
  const pohl = kategorieZNazvu('Prodáno Prodej souboru pohledávek v celkové souhrnné výši 36.104.441,80,-Kč');
  pravda('a pohledávky taky', pohl && pohl.kategorie === 'jiné', JSON.stringify(pohl));
  /* A pozor na opačnou chybu: kdyby to pravidlo chytalo moc, zmizely
     by i skutečné nabídky. Tyhle dvě musí projít dál. */
  pravda('ale pozemek ani dům tím nezmizí',
    kategorieZNazvu(les.nazev).kategorie === 'pozemek'
    && kategorieZNazvu(usedlost.nazev).kategorie === 'stavba');
}

/* ---- 5c) §453: dům s garáží je DŮM ----------------------------- */
/* Naměřeno: „VEŘEJNÁ DRAŽBA - RD 6+1, garáž, ÚP 206m2 a
   spoluvlastnické podíly id. 1/2 na pozemcích, pozemky celkem
   1400m2" se zařadilo jako GARÁŽ, protože garáž stála v pořadí
   první. Pořadí je součást pravidla, ne vkus. */
{
  const rd = kategorieZNazvu('VEŘEJNÁ DRAŽBA - RD 6+1, garáž, ÚP 206m2 a spoluvlastnické podíly id. 1/2 na pozemcích, pozemky celkem 1400m2');
  pravda('rodinný dům s garáží je dům, ne garáž', rd && rd.druh === 'dům', JSON.stringify(rd));
  /* A samotná garáž zůstane garáží — jinak by se pořadí jen obrátilo. */
  const g = kategorieZNazvu('Prodej garáže, výměra 20 m², vlastní pozemek, elektřina');
  pravda('a samotná garáž zůstane garáží', g && g.druh === 'garáž', JSON.stringify(g));
  /* „podlahová plocha" není druh: dřív dělala z domu byt. */
  const dum = kategorieZNazvu('Prodej RD podlahová plocha 184 m2, stodola, vedlejší stavby');
  pravda('a „podlahová plocha“ sama z domu byt nedělá', dum && dum.druh === 'dům', JSON.stringify(dum));
}

/* ---- 5d) §453: popisky plochy stavby z druhého pokusu ---------- */
/* Mezi neúplnými nabídkami druhého ostrého pokusu stálo tohle —
   plochy staveb, jen jinak pojmenované. Bez nich se nabídka
   zahodila jako „chybí výměra", přestože ji uvádí. */
{
  const zkus = (nazev, ceka) => {
    const k = kategorieZNazvu(nazev);
    const v = vymeraSPopiskem(nazev, POPISKY_PLOCHY_STAVBY, true);
    pravda(`plocha stavby se najde: „${nazev.slice(0, 44)}…“`, v === ceka,
      `vyšlo ${v}, čekalo se ${ceka} (druh ${k && k.druh})`);
  };
  zkus('Prodej rozsáhlého areálu (sklady,výroba,administrativa), plocha budov 52.235m2, vlastní vlečka', 52235);
  zkus('Prodej dvojpodlažního RD s dispozicí využití podkroví, obytná plocha 90 m2, pozemek 135 m2', 90);
  zkus('Výrobní areál kovovýroby, užitná plocha budov 1.813 m2, pozemky 5.277 m2', 1813);
  /* A protipól: u téhle nabídky plocha stavby UVEDENÁ NENÍ a číslo
     298 stojí bez popisku. Prázdno je tu správná odpověď — vzít
     „pozemky celkem" by byla zase ta nepravda. */
  const bez = vymeraSPopiskem('Prodej provozní budovy (administrativa, kanceláře) 298 m2, s halou a skladem 539 m2, pozemky celkem 1 200 m2',
    POPISKY_PLOCHY_STAVBY, true);
  pravda('a kde plocha stavby popisek nemá, zůstane prázdno', bez === null, String(bez));
}

/* ---- 5e) §454: movitý majetek z třetího ostrého pokusu ---------- */
/* Dražební web vede nemovitosti a movitý majetek v jednom výpisu.
   Z 31 nezařazených záznamů třetího pokusu bylo 29 movitých věcí —
   a dokud se nepoznají, buď spadnou do „nepoznáno", nebo se na web
   dostane vysokozdvižný vozík. Názvy jsou opsané z měření, ne
   vymyšlené. */
{
  const movita = [
    'Prodáno Regály na palety 64 metrů jedna řada - celkem 4 řady',
    'Prodáno Vysokozdvižný elektrický vozík BALKANCAR, nosnost 1000 kg, rok výroby 1976',
    'Prodáno Prodej zásob fotovoltaiky - střídače napětí, panely, konstrukce, rozvaděče',
    'Prodáno Prodej 7.686 ks pánského a dámského oblečení a doplňků',
    'Prodáno IVECO DAILY UNIJET 35C15 DAILY 35 C 1, VIN: ZCFC35A8005672550',
    'Prodáno Soubor kancelářského nábytku a vybavení, z majetku PAMA Poděbrady s.r.o.',
    'Prodáno Soubor 5 ks stavebních hákových kontejnerů, z majetku PAMA Poděbrady s.r.o.',
    'Prodáno Autojeřáb Tatra 148-2 AD 20 ČKD, RZ S018916, 1981, stav tachometru 13.809 km',
    'Prodáno Drtič suti KOMPLET K-JC 503, rok výroby 2023',
    'Prodáno Kolový traktor ZETOR PROXIMA 6421, 2006, 1915 MTH',
    'Prodáno Prodej souboru strojů, zařízení, nářadí, nástrojů "Nové Dvory"',
    'UZAVŘENÁ AUKCE - 2. kolo Výběrového řízení prodej obchodního závodu Liberty Engineering',
  ];
  const minula = movita.filter((n) => {
    const k = kategorieZNazvu(n);
    return !k || k.druh !== 'není nemovitost';
  });
  pravda(`všech ${movita.length} naměřených movitých věcí se pozná`, minula.length === 0,
    `neprošlo ${minula.length}: ${minula.map((n) => n.slice(0, 50)).join(' | ')}`);

  /* A PROTIPÓL. Soupis movitých věcí je nebezpečný druhým směrem:
     kdyby zabral příliš, zmizely by nemovitosti. „Výrobní areál"
     obsahuje „výrob", „hákový kontejner" i „areál" slovo „stav" —
     tohle hlídá, že se nabídky, kvůli kterým zdroj zapojujeme,
     nepropadnou mezi harampádí. */
  const nemovite = [
    ['VEŘEJNÁ DRAŽBA - RD - užitná plocha 63,77 m2, pozemky celkem 459 m2, Mladkov', 'dům'],
    ['Výrobní areál kovovýroby v centru města Varnsdorf, užitná plocha budov 1.813 m2', 'areál'],
    ['Prodej bytové jednotky (domu), podlahová plocha 129 m2, pozemek 67 m2', 'byt'],
    ['Prodej garáže 18 m2, Brno', 'garáž'],
    ['Prodej stavebního pozemku 1 200 m2, Nová Bystřice', 'stavební pozemek'],
  ];
  for (const [nazev, cekaDruh] of nemovite) {
    const k = kategorieZNazvu(nazev);
    pravda(`a nemovitost zůstane nemovitostí: ${cekaDruh}`, k && k.druh === cekaDruh,
      `vyšlo ${k ? k.druh : 'null'} u „${nazev.slice(0, 50)}…"`);
  }
}

/* ---- 5f) §454: mrtvá hranice slova v předpisu ------------------- */
/* `/\bstroj(?:e|ů|ní zařízení)\b/` nikdy nesedlo, protože za „ů"
   žádná hranice slova není (`ů` není `\w`). Hlídá to i obecně
   scripts/test-mrtva-hranice.mjs; tady se měří DŮSLEDEK na větě,
   kterou web doopravdy poslal. */
{
  const k = kategorieZNazvu('Prodáno Prodej souboru strojů, zařízení, nářadí, nástrojů "Nové Dvory", z majetku ALBO');
  pravda('„souboru strojů" se pozná jako movitá věc', k && k.druh === 'není nemovitost',
    `vyšlo ${k ? k.druh : 'null'} — hranice za „ů" nesedne, patří tam (?![\\p{L}])`);
}

/* ---- 6) spoluvlastnický podíl se pozná -------------------------- */
/* U podílu je cena za zlomek a výměra celá, takže „cena za metr" by
   lhala dvacetinásobně. Web podíly vede zvlášť a tohle je vstup do
   toho rozhodnutí. */
const podil = podilZNazvu(n.find((x) => x.cislo === '8067').nazev);
pravda('podíl id. 1/20 se v názvu najde', podil === '1/20', String(podil));
pravda('a u celé nabídky se žádný podíl nehlásí', podilZNazvu(les.nazev) === null,
  String(podilZNazvu(les.nazev)));

/* ---- 7) bez předpisu se nic nepředstírá ------------------------- */
/* Když pro zdroj předpis není, vrátí se prázdno a rozhodne některá
   z ostatních cest. Mlčet je tu správná odpověď — vymyslet si
   nabídky by bylo horší než žádné. */
pravda('bez předpisu nevyjde nic (a nic se nevymýšlí)',
  zZaznamu(VZOREK, ZAKLAD, null).length === 0);

/* ---- 8) seznam popisků v obou souborech souhlasí ---------------- */
/* Čtečka má zálohu pro volání bez seznamu. Kdyby se ty dva seznamy
   rozešly, četlo by se podle pořadí, které nikdo nezamýšlel — a to je
   přesně ten druh rozcházení, který se bez hlídače nepozná. */
pravda('záložní pořadí popisků ve čtečce souhlasí s předpisem',
  vymeraSPopiskem('užitná plocha 371 m2, pozemky celkem 11.770 m2')
    === vymeraSPopiskem('užitná plocha 371 m2, pozemky celkem 11.770 m2', POPISKY_VYMERY),
  'čtečka a předpis dávají jiné číslo');

console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb`);
if (chyb) {
  console.log(`::error::Předpis pro čtení: ${chyb} kontrol neprošlo. Co padlo: ${pricinaChyb(zpravy)}`);
  process.exit(1);
}
