// Test: popis dat sedí s daty.
//
// Spuštění: node scripts/test-data-rozhrani.mjs   (nepotřebuje prohlížeč)
//
// data/opportunities.json je veřejný soubor — leží na běžné adrese
// a může si ho vzít kdokoli. Doteď u něj ale nebylo napsané NIC: co
// která položka znamená, jak často se mění, co v datech není. Kdo by
// na nich chtěl něco postavit, musel by to hádat ze jmen polí.
//
// Dokumentace, která se rozejde s daty, je HORŠÍ než žádná: podle
// žádné si člověk ověří skutečnost, podle špatné postaví chybu.
// Proto se porovnává v OBOU směrech — pole v datech bez popisu i popis
// bez pole v datech shodí zkoušku.
//
// A hlídá se to, co se dá postavit špatně i při správném popisu: že
// u ceny stojí „nabídková, ne prodejní", a že u podílu je napsané,
// proč cena za metr vychází nízko. To jsou dvě věci, kvůli kterým by
// cizí výpočet nad těmihle daty vyšel nesmyslně.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nPopis dat proti datům');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Popis dat: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const cestaPopis = path.join(KOREN, 'data', 'pole.json');
pravda('popis polí existuje', existsSync(cestaPopis), 'data/pole.json chybí');
if (!existsSync(cestaPopis)) hotovo();
const P = JSON.parse(readFileSync(cestaPopis, 'utf8'));
const D = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const nabidky = D.opportunities || [];

/* ---- 1) obousměrně: popis proti datům ---- */
{
  const vDatech = new Map();
  for (const o of nabidky) {
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      vDatech.set(k, (vDatech.get(k) || 0) + 1);
    }
  }
  // PŘEDPOKLAD: bez dat by obě kontroly prošly naprázdno
  pravda('je co porovnávat — data mají nabídky a pole',
    nabidky.length > 100 && vDatech.size >= 10,
    `nabídek ${nabidky.length}, polí ${vDatech.size}`);

  const bezPopisu = [...vDatech.keys()].filter((k) => !P.pole[k]);
  pravda('každé pole v datech má popis', bezPopisu.length === 0,
    bezPopisu.join(', ') + ' — kdo si data vezme, musel by hádat');
  const navic = Object.keys(P.pole).filter((k) => !vDatech.has(k));
  pravda('a popis nemluví o poli, které v datech není', navic.length === 0,
    navic.join(', '));

  const vHlave = Object.keys(D).filter((k) => k !== 'opportunities');
  const hlavaBez = vHlave.filter((k) => !P.hlava[k]);
  pravda('totéž platí pro hlavičku souboru', hlavaBez.length === 0, hlavaBez.join(', '));

  /* „vždy" musí být pravda. Pole označené za povinné, které u části
     záznamů chybí, je nejhorší druh dokumentace: cizí kód na něj
     spolehne a spadne až na ostrých datech. */
  const lzeOVzdy = Object.entries(P.pole)
    .filter(([k, d]) => d.vzdy && (vDatech.get(k) || 0) !== nabidky.length)
    .map(([k]) => `${k}: popsáno jako „vždy“, ale je u ${vDatech.get(k) || 0} z ${nabidky.length}`);
  pravda('a co je popsané jako „vždy", je opravdu u každé nabídky',
    lzeOVzdy.length === 0, lzeOVzdy.join('\n      '));

  /* A obráceně: „někdy" u pole, které je u všech, je taky nepřesnost —
     jen méně nebezpečná. */
  const lzeONekdy = Object.entries(P.pole)
    .filter(([k, d]) => !d.vzdy && (vDatech.get(k) || 0) === nabidky.length)
    .map(([k]) => k);
  pravda('a co je popsané jako „někdy", opravdu někdy chybí',
    lzeONekdy.length === 0, lzeONekdy.join(', '));
}

/* ---- 2) typy a vyjmenované hodnoty ---- */
{
  const typSedi = (h, popis) => {
    const t = h === null ? 'null' : Array.isArray(h) ? 'pole' : typeof h;
    return popis.split('|').includes(t);
  };
  const spatne = [];
  for (const [k, d] of Object.entries(P.pole)) {
    for (const o of nabidky) {
      if (!(k in o)) continue;
      if (!typSedi(o[k], d.typ)) {
        spatne.push(`${k}: popsáno ${d.typ}, nalezeno ${o[k] === null ? 'null' : typeof o[k]}`);
        break;
      }
    }
  }
  pravda('typ každého pole sedí s tím, co v datech opravdu je',
    spatne.length === 0, spatne.slice(0, 4).join('\n      '));

  const typy = P.pole.type.hodnoty || [];
  const cizi = [...new Set(nabidky.map((o) => o.type))].filter((t) => !typy.includes(t));
  pravda('a vyjmenované druhy nabídky pokrývají všechno, co v datech je',
    cizi.length === 0, 'nepopsané: ' + cizi.join(', '));
}

/* ---- 3) stránka říká to podstatné, co se dá udělat špatně ---- */
{
  const cesta = path.join(KOREN, 'data.html');
  pravda('stránka s popisem dat je vygenerovaná', existsSync(cesta));
  if (existsSync(cesta)) {
    const h = readFileSync(cesta, 'utf8');
    pravda('a říká, že ceny jsou NABÍDKOVÉ, ne prodejní',
      /nabídkov/i.test(h) && /ne za kolik se prodal|ne prodejní/i.test(h));
    pravda('a varuje u spoluvlastnického podílu, proč cena za metr klame',
      /podíl/i.test(h) && /zlomek/i.test(h) && /celou parcelu/i.test(h));
    pravda('a že chybějící síť neznamená „není"',
      /není totéž co|neznamená/i.test(h) && /site/.test(h));
    pravda('a že výměra může chybět', /null/.test(h) && /výměr/i.test(h));
    pravda('a odkazuje na podmínky použití', /podminky\.html/.test(h));
    /* Tabulka musí mít tolik řádků, kolik je polí — jinak se stránka
       vygenerovala jen zpola a nikdo by si toho nevšiml. */
    const radku = (h.match(/<tr><td><code>/g) || []).length;
    pravda('a vypisuje všechna pole, ne jen některá',
      radku === Object.keys(P.pole).length + Object.keys(P.hlava).length,
      `řádků ${radku}, polí ${Object.keys(P.pole).length + Object.keys(P.hlava).length}`);
  }
}

/* ---- 4) velikost: kdo si to bere, má vědět, co stahuje ---- */
{
  const b = statSync(path.join(KOREN, 'data', 'opportunities.json')).size;
  pravda('soubor je pořád v rozumné velikosti (do 2 MB)', b <= 2 * 1024 * 1024,
    `${(b / 1024 / 1024).toFixed(2)} MB — nad dva megabajty už je čas na dělení po krajích`);
}

/* ---- 4b) VYJMENOVANÉ HODNOTY SE BEROU OD ROBOTA -------------
   Pole „type" má v popisu výčet možných hodnot a ten se dá napsat
   z hlavy — což jsem udělal a připsal k nim „majitel". Jenže robot
   takovou nabídku do souboru nikdy nedá: inzeráty od lidí leží
   v databázi a na mapu se berou odtamtud. Kdo by na datech stavěl, psal
   by obsluhu případu, který nikdy nepřijde — a hlavně by si myslel, že
   v souboru inzeráty od lidí najde.
   Výčet se proto porovnává s množinou TYPES ve scripts/fetch-opportunities.mjs,
   tedy s tím, co robot opravdu pustí dovnitř. Čte se ze zdroje: kdyby se
   ta množina přejmenovala, kontrola to řekne, místo aby mlčela. */
{
  const robot = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');
  const m = /const TYPES = new Set\(\[([^\]]*)\]\)/.exec(robot);
  pravda('v robotovi se našla množina povolených typů', !!m,
    'const TYPES = new Set([…]) ve fetch-opportunities.mjs není — přejmenovalo se to?');
  if (m) {
    const uRobota = m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
    const vPopisu = ((P.pole.type || {}).hodnoty || []).slice().sort();
    pravda(`výčet hodnot type sedí s tím, co robot pustí dovnitř (${uRobota.length})`,
      JSON.stringify(uRobota) === JSON.stringify(vPopisu),
      `robot: ${JSON.stringify(uRobota)}, popis: ${JSON.stringify(vPopisu)}`);
  }
}

/* ---- 5) PODMÍNKY NESMĚJÍ ZAKAZOVAT TO, K ČEMU STRÁNKA ZVE ----
   data.html říká „není potřeba klíč, registrace ani domluva — stačí si ho
   stáhnout" a hned pod tím odkazuje na podmínky použití. V podmínkách
   přitom stálo, že se nesmí „hromadné stahování dat". Kdo si přečetl
   obojí, dostal ano i ne — a platí ten dokument, ne ta pozvánka.
   Zákaz má smysl proti obcházení stránek robotem, ne proti souboru, který
   je k tomu připravený; proto se vyžaduje, aby každý zákaz mluvící
   o stahování ve stejném bodě ukázal na data.html. */
{
  const podm = readFileSync(new URL('../podminky.html', import.meta.url), 'utf8');
  const zakazy = [...podm.matchAll(/<ul class="rule-list no">([\s\S]*?)<\/ul>/g)]
    .flatMap((m) => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]));
  pravda(`v podmínkách se našel seznam zákazů (${zakazy.length} bodů)`, zakazy.length >= 2,
    `bodů ${zakazy.length} — změnila se podoba stránky?`);
  const oStahovani = zakazy.filter((t) => /stahov/i.test(t));
  pravda('a některý z nich mluví o stahování (jinak se nic nekontroluje)',
    oStahovani.length > 0, 'žádný zákaz o stahování — zmizel, nebo se přeformuloval?');
  const bezVyjimky = oStahovani.filter((t) => !/data\.html/.test(t));
  pravda('zákaz stahování ukazuje na soubor, který si vzít smíte',
    bezVyjimky.length === 0,
    'zákaz bez odkazu na data.html: ' + bezVyjimky.map((t) => t.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 120)).join(' | '));
  const stranka2 = readFileSync(new URL('../data.html', import.meta.url), 'utf8');
  pravda('a stránka s daty na podmínky dál odkazuje',
    /href="podminky\.html"/.test(stranka2), 'data.html na podmínky neodkazuje');
}

/* ---- KAŽDÝ VEŘEJNĚ STAHOVANÝ SOUBOR DAT MUSÍ BÝT POPSANÝ ----
   Stránka data.html začíná větou „všechny nabídky jsou v jednom
   souboru". U stažených nabídek to platí, ale web si tahá i další
   soubory z data/ — a dva z nich nesou údaje, které
   v opportunities.json vůbec nejsou:
     • data/zlevneni.json — jak se u nabídky měnila cena
     • data/user-listings.json — inzeráty od majitelů
   Druhý je dnes PRÁZDNÝ, takže se ten slib rozbije přesně ve chvíli,
   kdy někdo vloží první inzerát a nikdo se nebude dívat. Proto se to
   hlídá teď.
   Co popis nepotřebuje, je vyjmenované s důvodem — nový soubor spadne
   do „nezařazeno" a vyžádá si rozhodnutí, ne mlčení. */
{
  const VNITRNI = {
    'data/model.json': 'vstup cenového modelu — odvozený z opportunities.json',
    'data/kraje.json': 'obrysy krajů pro mapu, žádné údaje o pozemcích',
    'data/okresy-hrube.json': 'zjednodušené obrysy okresů pro mapu',
    'data/ceny-mist.json': 'medián ceny podle místa — dopočítaný z opportunities.json',
    'data/historie-cen.json': 'cenové hladiny v čase, dopočítané z historie gitu',
    'data/mapove-vrstvy.json': 'nastavení mapových vrstev, ne data o pozemcích',
    /* Tenký řez pro stránku „Na co mám?" — čtyři čísla na nabídku
       (okres, druh, cena, výměra), nic, co by v opportunities.json
       nebylo. Popisovat ho na data.html by znamenalo vydávat výtah
       za další zdroj; kdo chce data, má celý soubor. */
    'data/rozpocet.json': 'výtah z opportunities.json pro výpočet podle rozpočtu',
  };
  /* PROHLEDÁVAJÍ SE VŠECHNY SKRIPTY, ne vyjmenovaná hrstka. Nejdřív
     tu stál seznam deseti souborů a tři výjimky v tabulce výš se podle
     něj jevily jako mrtvé — data/okresy.json a spol. si totiž říká jiný
     skript. Ruční seznam zdrojů by navíc znamenal, že nový skript s novým
     souborem dat tuhle kontrolu obejde. */
  const zdroje = readdirSync(new URL('../js/', import.meta.url))
    .filter((f) => f.endsWith('.js'))
    .map((f) => 'js/' + f);
  pravda('prohledalo se ' + zdroje.length + ' skriptů webu', zdroje.length >= 20,
    'skriptů jen ' + zdroje.length + ' — změnilo se rozložení složek?');
  const tahane = new Set();
  for (const f of zdroje) {
    const t = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const m of t.matchAll(/['"`](data\/[a-z0-9-]+\.json)['"`]/g)) tahane.add(m[1]);
  }
  pravda('a našlo se ' + tahane.size + ' stahovaných souborů dat', tahane.size >= 5,
    'našlo se jen: ' + [...tahane].join(', '));
  const dataHtml = readFileSync(new URL('../data.html', import.meta.url), 'utf8');
  const nepopsane = [...tahane].filter((f) => !dataHtml.includes(f) && !VNITRNI[f]);
  /* POZOR NA TVAR TÉHLE KONTROLY. Napsal jsem ji nejdřív jako
     pravda(popis, JSON.stringify(nepopsane), '[]') — a pravda() bere
     druhý parametr jako pravdivostní hodnotu, takže neprázdný řetězec
     '["data/user-listings.json"]' prošel jako „v pořádku". Kontrola
     tedy mlčela přesně o tom souboru, kvůli kterému vznikla. */
  pravda('každý stahovaný soubor dat je na data.html popsaný, nebo vyjmenovaný jako vnitřní',
    nepopsane.length === 0, 'nepopsané: ' + nepopsane.join(', '));
  /* A OPAČNÝM SMĚREM: co je vyjmenované jako vnitřní, se opravdu musí
     stahovat — jinak seznam výjimek zestárne a zakryje i soubor, který
     už nikdo nečte. */
  const mrtve = Object.keys(VNITRNI).filter((f) => !tahane.has(f));
  pravda('a žádná výjimka neplatí pro soubor, který se už nestahuje',
    mrtve.length === 0, 'mrtvé výjimky: ' + mrtve.join(', '));

  /* A ten slib o inzerátech od majitelů. Nesmí záležet na tom, že je
     jich dnes nula. */
  pravda('data.html říká, že inzeráty od majitelů v souboru nejsou',
    /inzer[áa]ty\s+od\s+majitel/i.test(dataHtml.replace(/<[^>]+>/g, ' ')),
    'stránka o tom mlčí — rozbije se to prvním vloženým inzerátem');
  /* NESTAČÍ, ŽE JMÉNO SOUBORU NA STRÁNCE JE. Napsal jsem to nejdřív
     jako prostý includes('data/zlevneni.json') a sabotáž „sekce
     o historii ceny ze stránky zmizí" neprošla — jméno totiž zůstalo
     v řádku s adresou. Hlídá se proto to, co z toho souboru dělá
     použitelná data: tvar, mez a odkdy to vůbec je. */
  const popisZlevneni = [
    ['jméno souboru', /data\/zlevneni\.json/],
    ['tvar (nabidky: { klíč: [[den, cena]] })', /nabidky\s*:/],
    ['mez 3 %, pod kterou se mlčí', /3[\s\u00a0]*%/],
    ['odkdy se to zapisuje', /14\.[\s\u00a0]*9\.[\s\u00a0]*2026/],
    ['a že jsou to ceny nabídkové', /nabídkov/i],
  ].filter(([, re]) => !re.test(dataHtml));
  pravda('a popisuje historii ceny tak, aby se dala použít',
    popisZlevneni.length === 0, 'na data.html chybí: ' + popisZlevneni.map(([k]) => k).join(', '));
}

hotovo();
