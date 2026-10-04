// Staví časovou řadu cenových hladin z HISTORIE GITU.
//
// Spuštění: node scripts/historie-cen.mjs        (zapíše data/historie-cen.json)
//           node scripts/historie-cen.mjs --kontrola   (jen vypíše, nezapisuje)
//
// PROČ Z GITU, A NE Z DATABÁZE. Web je statický: data/opportunities.json
// se commituje při každém běhu robota, tedy čtyřikrát denně. Tím pádem
// časová řada UŽ EXISTUJE — v historii repozitáře — a sahá zpátky ke dni,
// kdy robot poprvé běžel. Není proto co zavádět ani zapínat; stačí to
// přečíst. Žádná časová databáze by k tomu nic nepřidala: dokud se data
// vejdou do jednoho souboru a čtou se jednou za šest hodin, byl by to
// server navíc u webu, který žádný nemá.
//
// JEDEN BOD NA DEN, a to z POSLEDNÍHO commitu toho dne. Robot běží
// čtyřikrát denně a čtyři body na den nic nepřidají — jen by zubatily
// graf podle toho, v kolik hodin kdo co vložil.
//
// HLADINA SE POČÍTÁ DNEŠNÍM PRAVIDLEM, i pro stará data. Je to schválně:
// kdyby se každý den počítal pravidlem, které platilo tehdy, byl by každý
// skok v řadě nerozeznatelný od změny metody. Celá řada se proto staví
// znovu od začátku pokaždé, když se pravidlo změní (--prepocitat).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIL = path.join(KOREN, 'data', 'historie-cen.json');
const ZDROJ = 'data/opportunities.json';
/* VERZE 2: hladiny se počítají BEZ DUPLICIT.
   Do verze 1 se model stavěl ze syrového snímku, tedy i z nabídek, které
   jsou v datech dvakrát. Mapa, stránky okresů i stránka pozemku je přitom
   odstraňují (js/hlidani-logika.js: bezDuplicit) a model staví až z toho,
   co zbude — řada v grafu tedy popisovala jinou hromádku než čísla pod
   ním. Naměřeno na dnešním snímku: 2 018 nabídek syrově proti 1 995 bez
   duplicit, a model se tím rozešel u 315 percentilů a 405 odhadů.
   Zvýšení čísla přepočítá celou řadu, takže v ní nevznikne schod. */
const VERZE = 2;          // zvýšit, když se změní pravidlo výpočtu → řada se přepočítá
/* Od jakého denního skoku už řada nepopisuje ceny, ale výměnu nabídek.
   Tři procenta za den jsou u půdy nereálná: celostátní řady s velkým
   vzorkem se drží do 0,6 %, a i nejklidnější okresní do 2,6 %. */
const MEZ_SKOKU = 3;

const pouze = process.argv.includes('--kontrola');
const prepocitat = process.argv.includes('--prepocitat');

createRequire(import.meta.url)(path.join(KOREN, 'js', 'ceny.js'));
const PKH = createRequire(import.meta.url)(path.join(KOREN, 'js', 'hlidani-logika.js'));
if (!PKH || typeof PKH.bezDuplicit !== 'function') {
  console.error('::error::js/hlidani-logika.js nedalo bezDuplicit — řada by se stavěla i z duplicit');
  process.exit(1);
}
const CENY = globalThis.PK_CENY;
if (!CENY || typeof CENY.postav !== 'function') {
  console.error('js/ceny.js se nenačetlo — bez něj by se hladina počítala jinak než na webu.');
  process.exit(1);
}

const git = (...a) => execFileSync('git', a, { cwd: KOREN, maxBuffer: 1 << 28 });

/* Poslední commit každého dne, od nejstaršího. */
function dnyZHistorie() {
  const log = git('log', '--format=%H %cI', '--', ZDROJ).toString().trim();
  if (!log) return [];
  const podleDne = new Map();
  for (const r of log.split('\n')) {
    const [sha, kdy] = r.split(' ');
    const den = kdy.slice(0, 10);
    // log jde od nejnovějšího, takže první výskyt dne JE ten poslední commit
    if (!podleDne.has(den)) podleDne.set(den, sha);
  }
  return [...podleDne.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/* Hladiny pro jeden snímek dat. Klíč je „úroveň|název|druh". */
function hladinyZeSnimku(syrove) {
  /* Táž funkce jako v prohlížeči (js/hlidani-logika.js), ne vlastní
     pravidlo: duplicita musí znamenat totéž na všech stranách. */
  const nabidky = PKH.bezDuplicit(syrove);
  const model = CENY.postav(nabidky);
  const out = new Map();
  const okresy = new Set(), kraje = new Set(), druhy = new Set();
  for (const o of nabidky) {
    if (o.okres) okresy.add(o.okres);
    const k = CENY.OKRES_KRAJ[o.okres];
    if (k) kraje.add(k);
    druhy.add(CENY.druhGroup(o.druh));
  }
  const vloz = (uroven, nazev, g) => {
    const h = model.hladinaMista(uroven, nazev, g);
    if (h) out.set(uroven + '|' + (nazev || '') + '|' + g, h);
  };
  for (const g of druhy) {
    for (const o of okresy) vloz('okres', o, g);
    for (const k of kraje) vloz('kraj', k, g);
    vloz('cr', '', g);
  }
  return out;
}

/* ---- načti, co už je spočítané ---- */
let stare = { verze: VERZE, dny: [], rady: {} };
/* Soubor se čte VŽDYCKY, i když se má stavět znovu — jinak by pojistka
   níž neměla s čím porovnávat a nevěděla by, o kolik dnů historie se
   chystáme přijít. (Přesně na tohle pojistka napoprvé nefungovala:
   při --prepocitat zůstalo stare.dny prázdné, takže test „ztratí se
   historie?" vyšel vždycky, že ne.) */
let naDisku = 0;
if (existsSync(CIL)) {
  try {
    const n = JSON.parse(readFileSync(CIL, 'utf8'));
    if (n && Array.isArray(n.dny)) naDisku = n.dny.length;
    if (n && n.verze === VERZE && Array.isArray(n.dny) && !prepocitat) stare = n;
    else if (n && n.verze !== VERZE) console.log('• jiná verze pravidla výpočtu — řada se staví znovu od začátku');
  } catch (e) { console.log('• ' + CIL + ' se nedal přečíst, staví se znovu'); }
}

const vsechnyDny = dnyZHistorie();
if (!vsechnyDny.length) { console.error('v historii gitu není ' + ZDROJ); process.exit(1); }

/* MĚLKÝ KLON NESMÍ SEŽRAT HISTORII.
   actions/checkout bere ve výchozím nastavení jen jeden commit, takže
   `git log` v CI ukáže JEDEN den. Dopočítávání to snese — staré dny se
   opíšou ze souboru a přidá se dnešek — ale přestavba od začátku (jiná
   verze pravidla nebo --prepocitat) by z dvaceti dnů udělala jeden
   a nikdo by si toho nevšiml, protože soubor by pořád vypadal platně.
   Historie se zpátky vzít nedá, tak se tady radši zastavíme. */
const prestavba = prepocitat || stare.dny.length === 0;
if (prestavba && naDisku > vsechnyDny.length) {
  console.error(`ZASTAVENO: v souboru je ${naDisku} dnů, ale v historii gitu jen `
    + `${vsechnyDny.length}. Přestavba by o historii přišla.`);
  console.error('Mělký klon? Potřebuje plnou historii: git fetch --unshallow'
    + ' (v CI actions/checkout s fetch-depth: 0).');
  console.error('Jestli to tak má opravdu být, spusťte znovu s --opravdu.');
  if (!process.argv.includes('--opravdu')) process.exit(2);
}
const hotove = new Set(stare.dny);
const chybi = vsechnyDny.filter(([den]) => !hotove.has(den));

console.log(`dnů v historii: ${vsechnyDny.length} (${vsechnyDny[0][0]} … ${vsechnyDny[vsechnyDny.length - 1][0]})`);
console.log(`už spočítaných: ${stare.dny.length}, dopočítat: ${chybi.length}`);

/* ---- dopočítej chybějící dny ---- */
const noveHladiny = new Map();   // den → Map(klíč → {zaM2, vzorek})
for (const [den, sha] of chybi) {
  let nabidky;
  try {
    const txt = git('show', sha + ':' + ZDROJ).toString();
    const j = JSON.parse(txt);
    nabidky = Array.isArray(j) ? j : (j.opportunities || []);
  } catch (e) {
    console.log(`  ${den}: snímek se nedal přečíst (${String(e).split('\n')[0]}) — den se přeskakuje`);
    continue;
  }
  if (!nabidky.length) { console.log(`  ${den}: prázdný snímek — přeskakuje se`); continue; }
  noveHladiny.set(den, hladinyZeSnimku(nabidky));
  console.log(`  ${den}: ${nabidky.length} nabídek → ${noveHladiny.get(den).size} hladin`);
}

/* ---- dnešek z PRACOVNÍHO STROMU, ne jen z commitů ----
   Robot nejdřív přepíše data/opportunities.json a teprve pak commituje.
   Kdyby se řada stavěla jen z commitů, byl by v ní poslední stav vždycky
   o jeden běh pozadu. Soubor na disku je novější než poslední commit,
   tak se bere on — a den, který už z commitu vyšel, se jím přepíše. */
{
  const dnes = new Date().toISOString().slice(0, 10);
  let liziSe = true;
  try { git('diff', '--quiet', 'HEAD', '--', ZDROJ); liziSe = false; } catch (e) { liziSe = true; }
  if (liziSe) {
    try {
      const j = JSON.parse(readFileSync(path.join(KOREN, ZDROJ), 'utf8'));
      const nab = Array.isArray(j) ? j : (j.opportunities || []);
      if (nab.length) {
        noveHladiny.set(dnes, hladinyZeSnimku(nab));
        console.log(`  ${dnes}: ${nab.length} nabídek z pracovního stromu (novější než poslední commit)`);
      }
    } catch (e) { console.log('  pracovní strom se nedal přečíst: ' + String(e).split('\n')[0]); }
  }
}

/* ---- slož řadu: dny setříděné, pole zarovnaná na dny ---- */
const dny = [...new Set([...stare.dny, ...noveHladiny.keys()])].sort();
const klice = new Set(Object.keys(stare.rady));
for (const m of noveHladiny.values()) for (const k of m.keys()) klice.add(k);

const rady = {};
for (const k of klice) {
  const puv = stare.rady[k] || { cena: [], vzorek: [] };
  const cena = [], vzorek = [];
  for (const den of dny) {
    const i = stare.dny.indexOf(den);
    if (noveHladiny.has(den)) {
      const h = noveHladiny.get(den).get(k);
      cena.push(h ? Math.round(h.zaM2 * 10) / 10 : null);
      vzorek.push(h ? h.vzorek : null);
    } else if (i >= 0) {
      cena.push(puv.cena[i] === undefined ? null : puv.cena[i]);
      vzorek.push(puv.vzorek[i] === undefined ? null : puv.vzorek[i]);
    } else { cena.push(null); vzorek.push(null); }
  }
  // Řada, ve které není ani jedno číslo, nemá v souboru co dělat.
  if (!cena.some((x) => x !== null)) continue;

  /* NEJVĚTŠÍ DENNÍ SKOK — a podle něj se pozná, o které řadě se smí
     mluvit. Cena půdy se za jeden den nehne o procenta; když se hladina
     přes noc změní o desítky procent, nezdražila půda, jen se VYMĚNILY
     NABÍDKY, ze kterých se medián počítá. Medián je proti tomu odolný
     jen potud, pokud je co mediánovat.
     Naměřeno na dvaceti dnech: 60 řad s malým vzorkem mívá největší
     skok 8,9 %, kdežto celostátní orná půda (vzorek 831) 0,2 %.
     Velikost vzorku ale sama o sobě nerozhoduje — okres Hodonín má
     64 nabídek a skáče, okres Beroun osm a stojí. Rozhoduje proto
     naměřená klidnost té konkrétní řady, ne odhad podle počtu. */
  var predchozi = null, skok = 0;
  for (var i = 0; i < cena.length; i++) {
    if (cena[i] === null) continue;
    if (predchozi) skok = Math.max(skok, Math.abs(cena[i] - predchozi) / predchozi * 100);
    predchozi = cena[i];
  }
  /* Zaokrouhlit AŽ POTOM by znamenalo, že v souboru stojí „skok: 3,
     klidna: false" při mezi 3 — tedy údaj, který si sám odporuje.
     Rozhoduje proto totéž číslo, které se zapisuje. */
  const skokZ = Math.round(skok * 10) / 10;
  rady[k] = { cena, vzorek, skok: skokZ, klidna: skokZ <= MEZ_SKOKU };
}

const vysledek = {
  verze: VERZE,
  postaveno: new Date().toISOString().slice(0, 10),
  /* Co ta čísla jsou, přímo v souboru — ať to nemusí nikdo dohledávat
     v kódu, až se na graf bude někdo ptát. */
  popis: 'Medián nabídkové ceny za m² (Kč) podle dne, místa a druhu pozemku. '
    + 'Počítá se z nabídek na prodej stejným pravidlem jako odhad na webu '
    + '(js/ceny.js), nejméně z ' + CENY.postav([]).MIN_VZOREK + ' nabídek. '
    + 'Jsou to ceny nabídkové, ne za kolik se pozemky prodaly. '
    + 'POZOR: hladina se mění i tím, že přibudou a zmizí nabídky, ne jen tím, '
    + 'že se mění ceny. Řady označené klidna:false se proto nemají ukazovat — '
    + 'u nich převažuje výměna nabídek nad pohybem cen (práh ' + MEZ_SKOKU + ' % za den).',
  /* Mez pro JISTOTU, ne pro počítání: pod ní se u čísla na stránce píše
     „na cenu okresu je to málo". Nese se v souboru proto, že graf běží
     v prohlížeči, kde js/ceny.js (kde ta mez je definovaná) načtený
     není — a opsat ji do grafu by znamenalo třetí kopii téhož čísla.
     Bez toho se na stránce okresu stávalo, že medián z 23 nabídek měl
     výhradu, a graf nad ním z téhož vzorku žádnou: oko přitom čte
     spíš tvar čáry než poznámku pod číslem. */
  dost: CENY.DOST_NABIDEK,
  klic: 'úroveň|název|druh — úroveň je okres, kraj nebo cr',
  dny,
  rady,
};

const json = JSON.stringify(vysledek);
console.log(`\nřad: ${Object.keys(rady).length}, dnů: ${dny.length}, velikost: ${(json.length / 1024).toFixed(1)} kB`);
const naplnenost = Object.values(rady).reduce((s, r) => s + r.cena.filter((x) => x !== null).length, 0);
console.log(`naměřených bodů: ${naplnenost} z ${Object.keys(rady).length * dny.length} možných`);

if (pouze) { console.log('\n--kontrola: nic se nezapisovalo'); process.exit(0); }
writeFileSync(CIL, json + '\n');
console.log('zapsáno ' + path.relative(KOREN, CIL));
