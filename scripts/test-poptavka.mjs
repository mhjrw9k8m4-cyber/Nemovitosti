#!/usr/bin/env node
/* SKÓRE PRO POŘADÍ VÝPISU: V DATECH MUSÍ BÝT TOTÉŽ, CO BY SPOČÍTAL PROHLÍŽEČ
   ==================================================================
   Spuštění: node scripts/test-poptavka.mjs   (nepotřebuje prohlížeč)

   Úvodní stránka řadí výchozí pořadí „Doporučené" podle skóre, které
   pro každou nabídku sahá po odhadu ceny z okolí. Naměřeno v prohlížeči
   na telefonu 390 px: 3 899 volání odhadu pro 1 925 různých pozemků na
   JEDNO vykreslení, zatímco na obrazovce je 24 karet. Skóre se proto
   počítá při sestavení do pole `dm` v data/mapa.json
   (scripts/generate-data-rezy.mjs) a prohlížeč je jen přečte.

   TOHLE JE ZKOUŠKA, NA KTERÉ TA ZKRATKA STOJÍ. Předpočítané číslo má
   cenu jen tehdy, když se rovná tomu, co by vyšlo v prohlížeči — jinak
   web řadí podle něčeho jiného, než o čem si myslí, a nikdo si toho
   nevšimne, protože pořadí „vypadá rozumně" vždycky.

   Rozejít se to může třemi cestami a každá tu má svou kontrolu:
     1. někdo změní formuli v js/ceny.js a nepřestaví data,
     2. někdo si formuli OPÍŠE do js/main.js nebo do generátoru a kopie
        se rozejdou — přesně to už jednou stálo cenový verdikt mezi
        mapou a stránkou pozemku, viz hlavička js/ceny.js,
     3. robot přiveze nová data a `dm` v nich chybí.
   ================================================================== */
import fs from 'node:fs';
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
  console.log('\nSkóre pro pořadí výpisu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Skóre pořadí: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Model se načítá do VLASTNÍHO okna, ne do globálního — jinak by si dvě
   zkoušky v jednom procesu přepsaly PK_CENY navzájem. */
const okno = {};
new Function('window', fs.readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))(okno);
const CENY = okno.PK_CENY;
pravda('cenový model se načetl a dává poptavka()',
  !!(CENY && CENY.postav && typeof CENY.poptavka === 'function'),
  'js/ceny.js nedalo postav nebo poptavka');
if (!CENY || !CENY.postav || !CENY.poptavka) hotovo();

const cesta = path.join(KOREN, 'data', 'mapa.json');
pravda('data/mapa.json existuje', fs.existsSync(cesta),
  'spusťte node scripts/oprav.mjs');
if (!fs.existsSync(cesta)) hotovo();
const rez = JSON.parse(fs.readFileSync(cesta, 'utf8'));
const DATA = rez.opportunities || [];
pravda('řez má nabídky', DATA.length > 100, 'nabídek: ' + DATA.length);
if (DATA.length < 100) hotovo();

/* ---------- 1. v datech se skóre rovná spočítanému ---------- */
/* Model se staví PŘESNĚ jako v prohlížeči: postav(DATA, null, PRESNOST),
   kde DATA je tenhle řez a PRESNOST je jeho pole `chyba` (js/main.js,
   boot). Kdyby se tohle rozešlo, zkouška by měřila jiný model než web
   a prošla by i u špatných čísel. */
const MODEL = CENY.postav(DATA, null, rez.chyba);
pravda('model z řezu se postavil a dává poptavka()',
  !!(MODEL && typeof MODEL.poptavka === 'function'),
  'postav() z data/mapa.json nedalo poptavka');
if (!MODEL || typeof MODEL.poptavka !== 'function') hotovo();

const chybi = DATA.filter((d) => typeof d.dm !== 'number');
pravda(`skóre nese každá nabídka (${DATA.length})`, chybi.length === 0,
  chybi.length + ' nabídek je bez pole `dm` — spusťte node scripts/oprav.mjs; '
  + 'prohlížeč by si je dopočítal sám, ale za cenu odhadu u každé z nich');

const rozdilne = [];
for (const d of DATA) {
  const mel = MODEL.poptavka(d);
  if (mel !== d.dm) rozdilne.push(`${d._id}: v datech ${d.dm}, spočítáno ${mel}`);
}
pravda(`skóre v datech se rovná spočítanému u všech ${DATA.length} nabídek`,
  rozdilne.length === 0,
  rozdilne.length + ' se liší, např.: ' + rozdilne.slice(0, 3).join(' | ')
  + ' — buď se změnila formule v js/ceny.js a nepřestavěla data '
  + '(node scripts/oprav.mjs), nebo data přivezl robot bez přestavby');

/* ---------- 2. formule je jen na jednom místě ---------- */
/* Hledají se KUSY FORMULE, ne jméno funkce: kopie se dělá opsáním těla,
   a ten, kdo ji opíše, si ji zpravidla přejmenuje. Komentáře se
   odstraňují — rozhoduje kód, ne próza o něm. Prózu si tahle místa
   ponechat MUSÍ, protože v ní stojí, proč se to tak počítá. */
function bezKomentaru(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const RYSY = [
  ['tabulka příplatků za typ', /drazba\s*:\s*22[\s\S]{0,80}?exekuce\s*:\s*18/],
  ['přepočet slevy na body', /45\s*\/\s*35/],
  ['dolní mez skóre', /Math\.max\(\s*6\s*,\s*Math\.round\(\s*9\s*\+/],
];
const JEDINY = path.join('js', 'ceny.js');
const prohledat = [JEDINY, path.join('js', 'main.js'), path.join('js', 'pozemek.js'),
  path.join('scripts', 'generate-data-rezy.mjs'), path.join('scripts', 'generate-parcel-pages.mjs')]
  .filter((p) => fs.existsSync(path.join(KOREN, p)));
for (const [jmeno, rys] of RYSY) {
  const kde = prohledat.filter((p) => rys.test(bezKomentaru(fs.readFileSync(path.join(KOREN, p), 'utf8'))));
  pravda(`${jmeno} je jen v ${JEDINY} (nalezeno v ${kde.length})`,
    kde.length === 1 && kde[0] === JEDINY,
    'nalezeno v: ' + (kde.join(', ') || 'nikde — změnila se formule?')
    + ' — dvě kopie se rozejdou, viz hlavička js/ceny.js');
}

/* ---------- 3. záložní cesta pro data bez skóre ---------- */
/* Náhradní data v js/main.js a starý soubor z mezipaměti prohlížeče
   pole `dm` nemají. Pořadí pak musí vyjít stejné, jen pomaleji —
   a bez cenového modelu alespoň podle typu nabídky. */
pravda('main.js čte předpočítané skóre z pole `dm`',
  /typeof d\.dm === 'number'/.test(fs.readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8')),
  'js/main.js nikde nečte d.dm — předpočítané číslo by leželo nevyužité');
const bezOdhadu = CENY.poptavka({ type: 'drazba' }, null);
pravda('skóre se spočítá i bez odhadu ceny (dražba → 31)', bezOdhadu === 31,
  'vyšlo ' + bezOdhadu + ' — bez modelu zbývají jen body za typ nabídky');
pravda('skóre nikdy nespadne pod šest', CENY.poptavka({ type: 'nic' }, null) >= 6,
  'dolní mez 6 drží výpis pohromadě i u nabídek bez typu');

/* ---------- 4. volba štítku „Doporučujeme" je týž prvek ---------- */
/* Pořadí se nejdřív seřadí a pak se hledá první vyhovující, místo aby se
   filtrovalo a teprve pak řadilo. Oba způsoby mají dát TÝŽ prvek: nabídku
   s nejvyšším skóre, která projde oběma podmínkami, a při shodě skóre tu
   dřívější. Porovnává se to na celé databázi a na řezu každého okresu,
   ne na vzorku — výběr jedné nabídky z dvou tisíc se na vzorku nepozná. */
function stary(vis) {
  const r = vis.slice()
    .filter((d) => { const o = MODEL.odhad(d); return !(o && (o.pochybna || o.nejisty)); })
    .filter((d) => !MODEL.spravniCena(d))
    .sort((a, b) => b.dm - a.dm).slice(0, 1);
  return r[0] ? r[0]._id : null;
}
function novy(vis) {
  const p = vis.slice().sort((a, b) => b.dm - a.dm);
  for (const d of p) {
    const o = MODEL.odhad(d);
    if (o && (o.pochybna || o.nejisty)) continue;
    if (MODEL.spravniCena(d)) continue;
    return d._id;
  }
  return null;
}
const vyrezy = [DATA];
for (const o of [...new Set(DATA.map((d) => d.okres))]) vyrezy.push(DATA.filter((d) => d.okres === o));
const neshody = vyrezy.filter((v) => v.length >= 5 && stary(v) !== novy(v));
pravda(`štítek „Doporučujeme" sedne na týž pozemek (${vyrezy.length} výřezů)`,
  neshody.length === 0,
  neshody.length + ' výřezů vybralo jinou nabídku než před přepsáním');

hotovo();
