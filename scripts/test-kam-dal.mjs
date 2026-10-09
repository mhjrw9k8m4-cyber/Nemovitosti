// Test: rozcestník „Kam dál" na stránce pozemku vede tam, kam slibuje.
//
// Spuštění: node scripts/test-kam-dal.mjs
//
// NALEZENO MĚŘENÍM v prohlížeči. Stránka pozemku má statickou část
// (pro vyhledávače a pro toho, kdo nemá JavaScript) a plný detail,
// který js/pozemek.js po načtení vykreslí NA JEJÍ MÍSTO — přepíše celý
// #pz-detail. Odkaz na okresní stránku stál jen v té statické části,
// takže ho viděl výhradně robot: z vykresleného detailu nevedl ani
// jeden odkaz na okres, kraj ani druh pozemku. Kdo přišel z vyhledávače
// na jednu parcelu (u 1 941 stránek hlavní cesta dovnitř webu), měl
// odsud na výběr mapu, obec v mapě a čtyři srovnatelné pozemky.
//
// Po opravě: 1 941 stránek má rozcestník, 1 416 z nich čtyři dlaždice
// (okres, kraj, druh, rozpočet), 449 tři a 76 dvě — podle toho, které
// regionální stránky dnes vznikly.
//
// Zkouška skládá očekávaný seznam ZNOVU z data/opportunities.json,
// z tabulky scripts/regiony-meta.mjs a ze souborů, které na webu
// opravdu leží — ne z generátoru. Jinak by jen potvrzovala, že je
// generátor sám se sebou v souladu.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mapaSouboru, nabidky, kamDal } from './generate-parcel-pages.mjs';
import * as META from './regiony-meta.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Cenový model dává TOTÉŽ rozřazení druhů, jaké používá mapa i druhové
   stránky (js/ceny.js, druhGroup). Vlastní tabulka druhů by tu byla
   třetí kopie a rozešla by se. */
createRequire(import.meta.url)(path.join(KOREN, 'js', 'ceny.js'));
const CENY = globalThis.PK_CENY;

/* sazba.mjs vkládá do hotového HTML nezlomitelné mezery, takže doslovné
   porovnání s textem ze zdroje by padalo na mezeře. */
const cti = (f) => readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
const jeSoubor = (f) => !!f && existsSync(path.join(KOREN, f));

// ---- očekávaný rozcestník, spočítaný znovu -------------------------
function ocekavanyKamDal(d) {
  const ven = [];
  const of_ = d.okres ? META.okresFile(d.okres) : '';
  if (jeSoubor(of_)) ven.push({ t: `Okres ${d.okres}`, u: of_ });

  const kraj = CENY.OKRES_KRAJ[d.okres];
  const kf = kraj ? META.krajFile(kraj) : '';
  if (kraj && jeSoubor(kf)) ven.push({ t: (META.KRAJ_META[kraj] || {}).disp, u: kf });

  const df = META.druhFile(CENY.druhGroup(d.druh));
  const dm = META.DRUH_STRANKY.find((x) => x.soubor === df);
  if (dm && jeSoubor(df)) {
    ven.push({ t: dm.nom.charAt(0).toUpperCase() + dm.nom.slice(1), u: df });
  }
  if (d.type === 'sale' && d.price > 0) {
    const r = META.ROZPOCTY.find((x) => d.price <= x.strop);
    if (r && jeSoubor(r.soubor)) ven.push({ t: `Pozemky do ${r.kratce}`, u: r.soubor });
  }
  return ven;
}

const mapa = mapaSouboru(nabidky());
const vzorky = [];
for (const { d, soubor } of mapa.values()) {
  if (!existsSync(path.join(KOREN, soubor))) continue;
  const h = cti(soubor);
  const m = h.match(/<script type="application\/json" id="pz-kamdal-data">([\s\S]*?)<\/script>/);
  let ostruvek = null;
  if (m) { try { ostruvek = JSON.parse(m[1]); } catch (e) { ostruvek = 'ROZBITÝ JSON'; } }
  vzorky.push({ d, soubor, h, ostruvek });
}

console.log(`Stránek pozemků na webu: ${vzorky.length}`);
pravda('je co měřit — stránky pozemků se našly a daly se přečíst',
  vzorky.length >= 1500, `našlo se ${vzorky.length}`);

// ---- 1) ostrůvek je na každé stránce, kde má co nabídnout ----------
const maMitOstruvek = vzorky.filter((v) => ocekavanyKamDal(v.d).length > 0);
const chybi = maMitOstruvek.filter((v) => !v.ostruvek || v.ostruvek === 'ROZBITÝ JSON');
pravda('každá stránka pozemku, kam je kam odkázat, rozcestník má',
  chybi.length === 0,
  `bez rozcestníku: ${chybi.length} (např. ${chybi.slice(0, 3).map((x) => x.soubor).join(', ')})`);

const rozbite = vzorky.filter((v) => v.ostruvek === 'ROZBITÝ JSON');
pravda('žádný ostrůvek se nerozpadl při čtení JSONu', rozbite.length === 0,
  rozbite.slice(0, 3).map((x) => x.soubor).join(', '));

// ---- 2) odkazy nevedou do prázdna ---------------------------------
const mrtve = [];
const duplicitni = [];
for (const v of vzorky) {
  if (!Array.isArray(v.ostruvek)) continue;
  const videne = new Set();
  for (const x of v.ostruvek) {
    if (!jeSoubor(x.u)) mrtve.push(`${v.soubor} → ${x.u}`);
    if (videne.has(x.u)) duplicitni.push(`${v.soubor} → ${x.u}`);
    videne.add(x.u);
  }
}
pravda('žádná dlaždice nevede na soubor, který na webu není',
  mrtve.length === 0, `${mrtve.length}×, např. ${mrtve.slice(0, 3).join(' | ')}`);
pravda('žádná adresa se v jednom rozcestníku neopakuje',
  duplicitni.length === 0, duplicitni.slice(0, 3).join(' | '));

// ---- 3) statická část a ostrůvek říkají totéž ---------------------
/* Dvě podoby téhož rozcestníku na jedné stránce: jednu vidí robot,
   druhou člověk. Kdyby se rozešly, nikdo si toho nevšimne — robot
   a člověk si stránku navzájem neukážou. */
const rozesle = [];
for (const v of vzorky) {
  if (!Array.isArray(v.ostruvek) || !v.ostruvek.length) continue;
  const art = v.h.match(/<h2>Kam dál<\/h2><ul>([\s\S]*?)<\/ul>/);
  if (!art) { rozesle.push(`${v.soubor}: statická část rozcestník nemá`); continue; }
  const staticke = [...art[1].matchAll(/<a href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, '&'));
  const zOstruvku = v.ostruvek.map((x) => x.u);
  if (staticke.join('|') !== zOstruvku.join('|')) {
    rozesle.push(`${v.soubor}: statická [${staticke.join(', ')}] vs ostrůvek [${zOstruvku.join(', ')}]`);
  }
}
pravda('statická část a ostrůvek nabízejí týž rozcestník ve stejném pořadí',
  rozesle.length === 0, `${rozesle.length}×, např. ${rozesle.slice(0, 2).join(' || ')}`);

// ---- 4) obsah dlaždic sedí s přepočítaným ------------------------
const spatne = [];
for (const v of vzorky) {
  if (!Array.isArray(v.ostruvek)) continue;
  const cekam = ocekavanyKamDal(v.d);
  const je = v.ostruvek.map((x) => `${x.t}→${x.u}`).join('|');
  const ma = cekam.map((x) => `${x.t}→${x.u}`).join('|');
  if (je !== ma) spatne.push(`${v.soubor}: je [${je}] / přepočítáno [${ma}]`);
}
pravda('dlaždice, jejich jména i pořadí souhlasí s přepočítaným seznamem',
  spatne.length === 0, `${spatne.length}×, např. ${spatne.slice(0, 2).join(' || ')}`);

// ---- 5) rozpočtová dlaždice: jen u prodeje a jen ta správná ------
/* U dražby je cena VYVOLÁVACÍ. „Pozemky do 500 tisíc" by u ní slibovalo
   cenovou hladinu, kterou ta nabídka nemá — vydražit se může za
   trojnásobek. */
const rozpocetUDrazby = [];
const spatnyStrop = [];
let sRozpoctem = 0;
for (const v of vzorky) {
  if (!Array.isArray(v.ostruvek)) continue;
  const r = v.ostruvek.find((x) => /^pozemky-do-/.test(x.u));
  if (!r) continue;
  sRozpoctem++;
  if (v.d.type !== 'sale') { rozpocetUDrazby.push(`${v.soubor} (${v.d.type})`); continue; }
  const meta = META.ROZPOCTY.find((x) => x.soubor === r.u);
  const nejnizsi = META.ROZPOCTY.find((x) => v.d.price <= x.strop && jeSoubor(x.soubor));
  if (!meta || !nejnizsi || meta.soubor !== nejnizsi.soubor || v.d.price > meta.strop) {
    spatnyStrop.push(`${v.soubor}: ${v.d.price} Kč → ${r.u}`);
  }
}
console.log(`Stránek s rozpočtovou dlaždicí: ${sRozpoctem}`);
pravda('je co měřit — rozpočtová dlaždice se na stránkách opravdu objevuje',
  sRozpoctem >= 500, `našlo se ${sRozpoctem}`);
pravda('rozpočtová dlaždice není u dražby ani exekuce (cena je vyvolávací)',
  rozpocetUDrazby.length === 0, rozpocetUDrazby.slice(0, 3).join(', '));
pravda('rozpočtová dlaždice je nejnižší mez, do které se cena vejde',
  spatnyStrop.length === 0, `${spatnyStrop.length}×, např. ${spatnyStrop.slice(0, 3).join(' | ')}`);

// ---- 6) kraj v drobečcích ----------------------------------------
/* Hierarchie webu je Pozemky › kraj › okres › pozemek. Drobečky krajský
   stupeň přeskakovaly, takže z cesty ve výsledku vyhledávače nebylo
   poznat, ve které části země pozemek leží. */
const bezKraje = [];
const dirav = [];
let sKrajem = 0;
for (const v of vzorky) {
  const m = v.h.match(/"@type":"BreadcrumbList","itemListElement":(\[[\s\S]*?\}\])/);
  if (!m) { dirav.push(`${v.soubor}: drobečky vůbec nejsou`); continue; }
  let items;
  try { items = JSON.parse(m[1]); } catch (e) { dirav.push(`${v.soubor}: drobečky nejdou přečíst`); continue; }
  const pozice = items.map((x) => x.position);
  if (pozice.join(',') !== items.map((_, i) => i + 1).join(',')) {
    dirav.push(`${v.soubor}: pozice ${pozice.join(',')}`);
  }
  const kraj = CENY.OKRES_KRAJ[v.d.okres];
  const disp = kraj ? (META.KRAJ_META[kraj] || {}).disp : '';
  if (kraj && jeSoubor(META.krajFile(kraj))) {
    if (items.some((x) => x.name === disp && String(x.item).endsWith(META.krajFile(kraj)))) sKrajem++;
    else bezKraje.push(`${v.soubor} (${disp})`);
  }
}
console.log(`Stránek s krajem v drobečcích: ${sKrajem}`);
pravda('je co měřit — kraj v drobečcích se dá najít', sKrajem >= 1500, `našlo se ${sKrajem}`);
pravda('kraj je v drobečcích všude, kde krajská stránka existuje',
  bezKraje.length === 0, `${bezKraje.length}×, např. ${bezKraje.slice(0, 3).join(', ')}`);
pravda('čísla pozic v drobečcích jdou po sobě bez děr',
  dirav.length === 0, `${dirav.length}×, např. ${dirav.slice(0, 3).join(' | ')}`);

// ---- 6b) podstrčený vzorek: pravidla platí i na tom, co v datech není ----
/* Z dnešních dat se některá pravidla ověřit NEDAJÍ: všech 77 okresů,
   ve kterých dnes nějaký pozemek je, má vlastní stránku, takže zkouška
   „neodkazuj na stránku, která není" by prošla i tehdy, kdyby se
   ověřování vypustilo (vyzkoušeno — vypuštění nic neshodilo). Proto se
   rozcestník skládá i pro vymyšlené nabídky, kde ty případy nastat
   musí. */
{
  const vzor = (navic) => Object.assign({
    okres: 'Benešov', place: 'Bystřice', druh: 'trvalý travní porost',
    type: 'sale', price: 190550, area: 4889,
  }, navic);
  const adresy = (o) => kamDal(o).map((x) => x.u);

  pravda('vymyšlená nabídka z běžného okresu dostane všechny čtyři dlaždice',
    adresy(vzor({})).length === 4, adresy(vzor({})).join(', '));

  const cizi = adresy(vzor({ okres: 'Okres, který neexistuje' }));
  pravda('okres bez vlastní stránky se do rozcestníku nedostane',
    !cizi.some((u) => /^pozemky-okres-/.test(u)), cizi.join(', '));
  pravda('a kraj se s ním nedostane taky — neznámý okres žádný nemá',
    !cizi.some((u) => /-kraj\.html$/.test(u)), cizi.join(', '));

  const ostatni = adresy(vzor({ druh: 'vodní plocha' }));
  pravda('druh bez vlastní stránky (vodní plocha) dlaždici nedostane',
    !ostatni.some((u) => META.DRUH_STRANKY.some((x) => x.soubor === u)), ostatni.join(', '));

  const drahy = adresy(vzor({ price: 9000000 }));
  pravda('cena nad nejvyšší mez rozpočtovou dlaždici nedostane',
    !drahy.some((u) => /^pozemky-do-/.test(u)), drahy.join(', '));

  const drazba = adresy(vzor({ type: 'drazba' }));
  pravda('dražba rozpočtovou dlaždici nedostane ani za nízkou cenu',
    !drazba.some((u) => /^pozemky-do-/.test(u)), drazba.join(', '));

  const bezCeny = adresy(vzor({ price: 0 }));
  pravda('nabídka bez ceny rozpočtovou dlaždici nedostane',
    !bezCeny.some((u) => /^pozemky-do-/.test(u)), bezCeny.join(', '));

  pravda('a pod 200 tisíc se vybere nejnižší mez, ne kterákoli vyhovující',
    adresy(vzor({ price: 150000 })).includes('pozemky-do-200-tisic.html'),
    adresy(vzor({ price: 150000 })).join(', '));
  pravda('nad 200 tisíc se posune na další mez',
    adresy(vzor({ price: 250000 })).includes('pozemky-do-500-tisic.html'),
    adresy(vzor({ price: 250000 })).join(', '));
}

// ---- 7) ostrůvek se opravdu vykresluje ---------------------------
/* Ostrůvek s daty, který nikdo nečte, je mrtvý kód — a vypadá přitom
   jako hotová funkce. Dvě vazby: čtení ostrůvku a vložení do detailu. */
const pz = cti('js/pozemek.js');
pravda('js/pozemek.js ostrůvek #pz-kamdal-data opravdu čte',
  /getElementById\('pz-kamdal-data'\)/.test(pz));
pravda('a vykreslený rozcestník se do detailu opravdu vkládá',
  /kamDalHtml\(\)\s*;/.test(pz) && /pz-actions[\s\S]{0,600}kamDalHtml\(\)/.test(pz));

// ---- 8) dlaždice se dá zmáčknout prstem --------------------------
const sabl = cti('pozemek.html');
const pravidlo = sabl.match(/\.kd-polozka\{([^}]*)\}/);
pravda('dlaždice rozcestníku má vlastní styl', !!pravidlo);
if (pravidlo) {
  const mv = pravidlo[1].match(/min-height:(\d+)px/);
  pravda('a je aspoň 44 px vysoká, aby se do ní dalo klepnout',
    !!mv && Number(mv[1]) >= 44, `min-height: ${mv ? mv[1] + 'px' : 'není'}`);
}

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.log(`\n::error::Kam dál: ${chyb} kontrol neprošlo.`); process.exit(1); }
