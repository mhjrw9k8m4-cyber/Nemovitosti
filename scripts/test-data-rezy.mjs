#!/usr/bin/env node
/* ŘEZY DAT MUSÍ DÁT DOHROMADY CELEK
   ==================================================================
   Řez okresu je kopie části dat. Kopie se rozcházejí — a u dat je to
   horší než u kódu, protože rozejitá kopie vypadá úplně normálně:
   soubor se stáhne, JSON se přečte, čísla se zobrazí. Jen jsou stará.

   Kontroluje se:
     1. že každý okres z celku má svůj řez a žádný nepřebývá,
     2. že se součet řezů rovná celku — nabídka po nabídce, podle klíče,
     3. že hlavička řezu (datum obnovy) souhlasí s celkem,
     4. že rejstřík data/index.json popisuje to, co na disku opravdu je,
     5. že tvar nabídky v řezu je týž jako v celku (aby stačilo přepnout
        adresu a nic jiného),
     6. že to vůbec k něčemu je — tedy že řez je řádově menší než celek.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from './generate-data-rezy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const celek = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const vse = celek.opportunities || [];
pravda(`celek se přečetl (${vse.length} nabídek)`, vse.length > 500, `nabídek ${vse.length}`);

const dirOkres = path.join(ROOT, 'data', 'okres');
pravda('adresář s řezy existuje', fs.existsSync(dirOkres), 'data/okres/ chybí');
if (!fs.existsSync(dirOkres) || !vse.length) {
  console.log(zpravy.join('\n')); process.exit(1);
}

/* 1) každý okres má řez, žádný nepřebývá */
const okresyVDatech = [...new Set(vse.map((o) => o.okres).filter(Boolean))].sort();
const soubory = fs.readdirSync(dirOkres).filter((f) => f.endsWith('.json'));
const chybi = okresyVDatech.filter((o) => !soubory.includes(`${slug(o)}.json`));
pravda(`každý okres z dat má svůj řez (${okresyVDatech.length})`,
  chybi.length === 0, `chybí: ${chybi.slice(0, 4).join(', ')}`);

/* 2) součet řezů = celek, nabídka po nabídce */
const klic = (o) => [o.place, o.parcel, o.okres, o.price, o.area, o.lat, o.lng].join('|');
const vCelku = new Map(vse.map((o) => [klic(o), o]));
const vRezech = new Map();
let bajtuNejvetsi = 0, bajtuNejmensi = Infinity;
const spatnaHlavicka = [], cizi = [];
for (const f of soubory) {
  const r = JSON.parse(fs.readFileSync(path.join(dirOkres, f), 'utf8'));
  const b = fs.statSync(path.join(dirOkres, f)).size;
  bajtuNejvetsi = Math.max(bajtuNejvetsi, b);
  if ((r.opportunities || []).length) bajtuNejmensi = Math.min(bajtuNejmensi, b);
  if (r.updated !== celek.updated || r.updated_at !== celek.updated_at) spatnaHlavicka.push(f);
  for (const o of r.opportunities || []) {
    vRezech.set(klic(o), o);
    /* Nabídka z jiného okresu v řezu je tišší vada než chybějící:
       číslo na stránce okresu by pak bylo vyšší, než má být. */
    if (r.rez && r.rez.nazev && o.okres !== r.rez.nazev) cizi.push(`${f}: ${o.okres}`);
  }
}
pravda('a hlavička (datum obnovy) každého řezu souhlasí s celkem',
  spatnaHlavicka.length === 0, `${spatnaHlavicka.length}: ` + spatnaHlavicka.slice(0, 3).join(', '));
pravda('v řezu nestojí nabídka z jiného okresu',
  cizi.length === 0, cizi.slice(0, 3).join('; '));

const nejsouVRezech = [...vCelku.keys()].filter((k) => !vRezech.has(k));
const nejsouVCelku = [...vRezech.keys()].filter((k) => !vCelku.has(k));
pravda(`součet řezů se rovná celku (${vRezech.size} nabídek)`,
  nejsouVRezech.length === 0 && nejsouVCelku.length === 0,
  `v celku a ne v řezech: ${nejsouVRezech.length}, v řezech a ne v celku: ${nejsouVCelku.length}`);

/* 5) tvar nabídky je týž */
const pole = (o) => Object.keys(o).sort().join(',');
const tvaryCelek = new Set(vse.map(pole));
const tvaryRez = new Set([...vRezech.values()].map(pole));
const noveTvary = [...tvaryRez].filter((t) => !tvaryCelek.has(t));
pravda('nabídka v řezu má tytéž klíče jako v celku (stačí přepnout adresu)',
  noveTvary.length === 0, `${noveTvary.length} neznámých tvarů`);

/* 4) rejstřík */
const rejstrikCesta = path.join(ROOT, 'data', 'index.json');
pravda('rozcestník data/index.json existuje', fs.existsSync(rejstrikCesta));
if (fs.existsSync(rejstrikCesta)) {
  const R = JSON.parse(fs.readFileSync(rejstrikCesta, 'utf8'));
  const sedi = [];
  for (const r of R.rezy || []) {
    const c = path.join(ROOT, r.soubor);
    if (!fs.existsSync(c)) { sedi.push(`${r.soubor} neexistuje`); continue; }
    const obsah = JSON.parse(fs.readFileSync(c, 'utf8'));
    if ((obsah.opportunities || []).length !== r.pocet) {
      sedi.push(`${r.soubor}: rejstřík ${r.pocet}, soubor ${(obsah.opportunities || []).length}`);
    }
  }
  pravda(`rozcestník popisuje to, co na disku je (${(R.rezy || []).length} řezů)`,
    sedi.length === 0, sedi.slice(0, 3).join('; '));
  pravda('a jmenuje okresy každého kraje (krajské řezy se schválně nedělají)',
    R.kraje && Object.keys(R.kraje).length >= 10
    && Object.values(R.kraje).every((k) => Array.isArray(k.okresy) && k.okresy.length),
    'chybí soupis krajů nebo je prázdný');
  const soucetKraju = Object.values(R.kraje || {}).reduce((s, k) => s + k.pocet, 0);
  pravda('a počty v krajích dávají dohromady celek',
    soucetKraju === vse.filter((o) => o.okres).length,
    `kraje ${soucetKraju}, celek ${vse.length}`);
}

/* 6) k čemu to je */
pravda(`největší řez je řádově menší než celek (${(bajtuNejvetsi / 1024).toFixed(0)} kB`
  + ` proti ${(fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size / 1024).toFixed(0)} kB)`,
  bajtuNejvetsi < fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size / 3,
  'řezy nejsou o mnoho menší — k čemu by pak byly');

console.log('\nŘezy dat po okresech');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Řezy dat: ${chyb} kontrol neprošlo.`); process.exit(1); }
