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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { slug } from './generate-data-rezy.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const celek = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const syrove = celek.opportunities || [];
/* ŘEZ JE TO, CO WEB UKAZUJE — tedy celek BEZ duplicit, a odstraněné
   TOUŽ funkcí jako na mapě. Dokud se tu srovnávalo se syrovým souborem,
   mluvila kontrola jiným jazykem než stránky: rejstřík tvrdil u Hodonína
   121 pozemků, stránka 119, a nic to nehlásilo. */
const PKH = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));
/* A NEJEN BEZ DUPLICIT — taky bez dražeb po termínu. Proběhlá dražba
   není nabídka a okresní stránky ji nepočítají odjakživa; řezy ji
   počítaly dál, takže web o Praze-východ tvrdil 54 na stránce a 55
   v datech. Pozná se to jediný den v roce, totiž den po dražbě.
   Podmínka je společná, viz js/terminy.js. */
createRequire(import.meta.url)(path.join(ROOT, 'js', 'terminy.js'));
const T = globalThis.PK_TERMINY;
const bezDuplicit = PKH.bezDuplicit(syrove);
const vse = bezDuplicit.filter((o) => !T.poTerminu(o));
pravda(`celek se přečetl (${syrove.length} nabídek, bez duplicit ${vse.length})`,
  syrove.length > 500, `nabídek ${syrove.length}`);
pravda('a duplicity v něm opravdu jsou (jinak kontroly níž nic nerozliší)',
  syrove.length > vse.length, `syrově ${syrove.length}, bez duplicit ${vse.length}`);
/* Odstranit se smí jen hrstka. Kdyby pravidlo začalo zahazovat skutečné
   nabídky, řezy by tichounku zhubly a tahle mez to zastaví. */
pravda('a odstraní se jich jen hrstka, ne desetina webu',
  syrove.length - vse.length < syrove.length * 0.05,
  `odstraněno ${syrove.length - vse.length} z ${syrove.length}`);

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
    /* Vstup cenového modelu (uroven: 'model') nenese „opportunities",
       ale sloupce — počet se u něj čte z délky sloupce s výměrou.
       Měří ho scripts/test-model-vstup.mjs; tady jde jen o to, aby
       rejstřík nelhal o tom, co na disku je. */
    const kolik = r.uroven === 'model'
      ? (Array.isArray(obsah.a) ? obsah.a.length : -1)
      : (obsah.opportunities || []).length;
    if (kolik !== r.pocet) {
      sedi.push(`${r.soubor}: rejstřík ${r.pocet}, soubor ${kolik}`);
    }
  }
  /* A ten jeden model v rejstříku být MUSÍ — jinak by se dal tiše
     přestat vyrábět a stránky pozemků by zase sáhly po celku. */
  pravda('rejstřík jmenuje i vstup cenového modelu',
    (R.rezy || []).some((r) => r.uroven === 'model' && r.soubor === 'data/model.json'),
    'data/model.json v rozcestníku není');
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
  pravda('a rejstřík přiznává, kolik duplicit z celku odpadlo',
    R.celek && R.celek.pocet === vse.length
    && R.celek.pocet_v_souboru === syrove.length
    && R.celek.duplicit === syrove.length - bezDuplicit.length
    && R.celek.po_terminu === bezDuplicit.length - vse.length,
    `rejstřík: ${JSON.stringify(R.celek)}`);
}

/* 5b) POČET V ŘEZU SE MUSÍ ROVNAT ČÍSLU NA STRÁNCE OKRESU.
   Tohle je ta kontrola, která chyběla. Řezy a stránky vznikají ze
   stejných dat, ale každé svým skriptem — a dokud se nikde nesrovnávaly,
   mohly si tiše odporovat: u deseti okresů tvrdil řez o jeden až tři
   pozemky víc než stránka, protože stránka duplicity odstraňuje a řez
   ne. Číslo na stránce je to, co člověk vidí; číslo v datech je to, co
   si odnese stroj. Dvě různá čísla pro tutéž věc jsou vada bez ohledu
   na to, které z nich je „správnější". */
{
  const nesedi = [];
  let zmereno = 0;
  for (const r of (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8')).rezy || [])) {
    const stranka = path.join(ROOT, `pozemky-okres-${slug(r.nazev)}.html`);
    if (!fs.existsSync(stranka)) continue;
    const h = fs.readFileSync(stranka, 'utf8');
    /* Číslo se bere z věty „… 119 pozemků …" — mezery v něm mohou být
       nezlomitelné (sazba), tak se odstraní obojí. */
    const m = /(\d[\d\u00a0\u202f ]*)\s*pozemk/.exec(h);
    if (!m) continue;
    zmereno++;
    const naStrance = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    if (naStrance !== r.pocet) nesedi.push(`${r.nazev}: stránka ${naStrance}, řez ${r.pocet}`);
  }
  pravda(`srovnalo se ${zmereno} okresních stránek s řezy (jinak kontrola měří prázdno)`,
    zmereno >= 70, `jen ${zmereno}`);
  pravda('a u každého okresu stojí v datech totéž číslo jako na jeho stránce',
    nesedi.length === 0, `${nesedi.length}: ` + nesedi.slice(0, 5).join('; '));
}

/* 6) k čemu to je */
pravda(`největší řez je řádově menší než celek (${(bajtuNejvetsi / 1024).toFixed(0)} kB`
  + ` proti ${(fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size / 1024).toFixed(0)} kB)`,
  bajtuNejvetsi < fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size / 3,
  'řezy nejsou o mnoho menší — k čemu by pak byly');

console.log('\nŘezy dat po okresech');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Řezy dat: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
