#!/usr/bin/env node
/* VSTUP CENOVÉHO MODELU: MALÝ SOUBOR MUSÍ DÁT TOTÉŽ CO VELKÝ
   ==================================================================
   Spuštění: node scripts/test-model-vstup.mjs   (nepotřebuje prohlížeč)

   Stránka pozemku dřív stahovala celá data (638 kB, 56,5 kB přes drát),
   přestože z nich potřebuje dvě věci: sebe — a tu má v řezu svého
   okresu — a celostátní cenový model. Model přitom z nabídky čte jen
   šest polí: okres, druh, typ, výměru, cenu a příznak podílu.

   Proto vzniká data/model.json: tytéž nabídky, ale sloupcově a se
   slovníky. Naměřeno: 42,6 kB surově a 12,0 kB přes drát, tedy
   o 79 % méně přes drát a patnáctkrát méně práce pro parser.

   TAHLE ZKOUŠKA JE TA, NA KTERÉ TO CELÉ STOJÍ. Zkratka má cenu jen
   tehdy, když z ní vyjde TOTÉŽ číslo. Kdyby se model z malého souboru
   lišil jen o kousek, web by u jednoho pozemku tvrdil jedno na mapě
   a druhé na jeho stránce — a to je přesně ta vada, kterou už jednou
   stálo 310 stránek (viz scripts/test-shoda.mjs).

   Porovnává se na VŠECH nabídkách a na všech funkcích modelu, které
   o ceně něco tvrdí, ne na vzorku. A porovnává se proti plným datům,
   ne proti vlastnímu přepočítání.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nVstup cenového modelu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Vstup modelu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const PKH = require_(path.join(KOREN, 'js', 'hlidani-logika.js'));
const okno = {};
new Function('window', fs.readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))(okno);
const CENY = okno.PK_CENY;
pravda('cenový model se načetl', !!(CENY && CENY.postav && CENY.rozbalModel),
  'js/ceny.js nedalo postav nebo rozbalModel');
if (!CENY || !CENY.rozbalModel) hotovo();

const cestaCelek = path.join(KOREN, 'data', 'opportunities.json');
const cestaModel = path.join(KOREN, 'data', 'model.json');
pravda('data/model.json existuje', fs.existsSync(cestaModel),
  'spusťte node scripts/generate-data-rezy.mjs');
if (!fs.existsSync(cestaModel)) hotovo();

const syrove = JSON.parse(fs.readFileSync(cestaCelek, 'utf8')).opportunities || [];
/* Z TÉŽE HROMÁDKY JAKO WEB. Model se všude staví z dat bez duplicit
   (js/main.js, js/pozemek.js, generátor okresních stránek), takže
   i malý soubor musí nést tutéž hromádku — jinak by se lišil z jiného
   důvodu než kvůli sloupcovému tvaru a nebylo by poznat, kvůli kterému. */
const plne = PKH.bezDuplicit(syrove);
const maly = JSON.parse(fs.readFileSync(cestaModel, 'utf8'));
const rozbaleno = CENY.rozbalModel(maly);

pravda(`celek se přečetl (${syrove.length} nabídek, bez duplicit ${plne.length})`,
  plne.length > 500, `nabídek ${plne.length}`);
pravda('malý soubor se rozbalil', Array.isArray(rozbaleno), 'rozbalModel vrátil null');
if (!Array.isArray(rozbaleno)) hotovo();
pravda(`a nese tolik nabídek jako celek bez duplicit (${rozbaleno.length})`,
  rozbaleno.length === plne.length, `malý ${rozbaleno.length}, celek ${plne.length}`);

/* Malý soubor musí být opravdu MALÝ — jinak nemá smysl. */
const bCelek = fs.statSync(cestaCelek).size, bMaly = fs.statSync(cestaModel).size;
pravda(`a je aspoň pětkrát menší než celek (${(bMaly / 1024).toFixed(0)} kB proti ${(bCelek / 1024).toFixed(0)} kB)`,
  bMaly * 5 < bCelek, `malý ${bMaly} B, celek ${bCelek} B`);

/* ---- TO HLAVNÍ: týž výsledek na všech nabídkách ---- */
const mPlny = CENY.postav(plne);
const mMaly = CENY.postav(rozbaleno);
/* druhGroup bere název druhu, ne nabídku — zkouší se zvlášť níž. */
const FUNKCE = ['percentil', 'odhad', 'neduveryhodna'];
let volani = 0, sVerdiktem = 0;
const rozdily = [];
for (const d of plne) {
  for (const f of FUNKCE) {
    volani++;
    const a = JSON.stringify(mPlny[f](d)), b = JSON.stringify(mMaly[f](d));
    if (a !== b && rozdily.length < 6) {
      rozdily.push(`${f} @ ${d.place} (${d.okres}): ${String(a).slice(0, 70)} vs ${String(b).slice(0, 70)}`);
    }
  }
  if (mPlny.percentil(d) || mPlny.odhad(d)) sVerdiktem++;
  volani++;
  if (mPlny.druhGroup(d.druh) !== mMaly.druhGroup(d.druh) && rozdily.length < 6) {
    rozdily.push(`druhGroup @ ${d.druh}: ${mPlny.druhGroup(d.druh)} vs ${mMaly.druhGroup(d.druh)}`);
  }
  const g = mPlny.druhGroup(d.druh);
  for (const [uroven, nazev] of [['okres', d.okres], ['kraj', CENY.OKRES_KRAJ[d.okres]], ['cr', null]]) {
    volani++;
    const a = JSON.stringify(mPlny.hladinaMista(uroven, nazev, g));
    const b = JSON.stringify(mMaly.hladinaMista(uroven, nazev, g));
    if (a !== b && rozdily.length < 6) rozdily.push(`hladinaMista ${uroven}/${nazev}: ${a} vs ${b}`);
  }
}
/* PŘEDPOKLAD: kdyby model nemluvil o ničem, shoda by nic neznamenala. */
pravda(`model o většině nabídek něco tvrdí (${sVerdiktem} z ${plne.length})`,
  sVerdiktem > plne.length * 0.6, `verdikt jen u ${sVerdiktem}`);
pravda(`srovnalo se ${volani} volání modelu (jinak kontrola měří prázdno)`,
  volani > 10000, `jen ${volani}`);
pravda('a model z malého souboru dává VŠUDE totéž co z plných dat',
  rozdily.length === 0, `${rozdily.length} rozdílů:\n      ` + rozdily.join('\n      '));

/* ---- a vstup je čerstvý ---- */
pravda('hlavička malého souboru souhlasí s celkem (není zapomenutý po obnově)',
  maly.updated === JSON.parse(fs.readFileSync(cestaCelek, 'utf8')).updated,
  `malý ${maly.updated}, celek ${JSON.parse(fs.readFileSync(cestaCelek, 'utf8')).updated}`);
pravda('a říká o sobě, že je to řez „model"',
  maly.rez && maly.rez.uroven === 'model' && maly.rez.soubor === 'data/model.json',
  JSON.stringify(maly.rez));
pravda('a má u sebe napsané, co ta pole znamenají',
  typeof maly.popis === 'string' && maly.popis.length > 60, String(maly.popis).slice(0, 60));

hotovo();
