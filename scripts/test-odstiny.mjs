// Test: web má jednu barevnou teplotu.
//
// Spuštění: node scripts/test-odstiny.mjs   (nepotřebuje prohlížeč)
//
// Tenhle web je teple zelenočerný: --ink-dark je #14231C, tedy odstín 152°.
// Závoje, stíny a ztmavená pozadí ale dlouho byly MODROČERNÉ — odstín okolo
// 210°. Nebyla to jedna nedbalost: naměřeno 18 výskytů proti 83 teplým,
// a ležely zrovna na nejvíc viditelných místech — závoj nad fotkou a tři
// štítky na každé kartě ve výpisu, pozadí dialogu, pozadí mobilního menu,
// náhled snímku. Týž závoj nad týmž snímkem měl na detailu nabídky
// (.sn-popis) teplou hodnotu rgba(12,26,18). Přechodem ze seznamu na detail
// se tedy fotka pod závojem ohřála a nikdo nevěděl proč.
//
// Proto dvě pravidla:
//   A) každá barva v pravidlech patří do některé odstínové rodiny palety
//      (nebo je neutrální: čistě černá, bílá, šedá),
//   B) každá TÉMĚŘ ČERNÁ barva (světlost ≤ 22 %) je teplá (120–170°)
//      nebo neutrální — protože téměř černé barvy jsou právě ty závoje
//      a stíny, kterými se teplota webu pozná.
//
// Výjimka se nezakazuje, jen se musí pojmenovat a odůvodnit níž v seznamu.
// Dokud tam barva není, test ji nahlásí jménem i řádkem.
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const CESTA = new URL('../css/styles.css', import.meta.url);
const zdroj = readFileSync(CESTA, 'utf8');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Komentáře zahodit — ale po řádcích, ať čísla řádků dál platí.
// (Měření, které to neudělalo, hlásilo tři barvy, jež jsou jen zápisem
//  v komentáři o tom, že se stará studená barva ODSTRANILA.)
const css = zdroj.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

function rgb(s) {
  s = s.toLowerCase().replace(/\s+/g, '');
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  m = s.match(/^#([0-9a-f]{6})/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\((\d+),(\d+),(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const l = (mx + mn) / 2;
  return { h: Math.round(h), s: d === 0 ? 0 : Math.round((d / (1 - Math.abs(2 * l - 1))) * 100),
           l: Math.round(l * 100) };
}

const BARVA = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const JE_DEFINICE = /^\s*--[\w-]+\s*:/;
const NEUTRALNI_S = 8;      // pod touhle sytostí barva odstín nemá
const CERNA_L = 22;         // pod touhle světlostí je to závoj nebo stín
const TEPLO_OD = 120, TEPLO_DO = 170;
const SNES_ODSTIN = 12;     // na kolik stupňů od rodiny palety ještě dosáhne

// --- Výjimky ---------------------------------------------------------
// Klíč je přesný zápis barvy. Ke každé patří důvod; bez důvodu tu nemá co dělat.
const VYJIMKY = {
  // (zatím žádná — a je to tak dobře)
};

// --- Rodiny odstínů z palety ----------------------------------------
const rodiny = new Set();
for (const m of css.matchAll(/--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)) {
  const c = rgb(m[1]);
  if (!c) continue;
  const { h, s } = hsl(c);
  if (s >= NEUTRALNI_S) rodiny.add(h);
}

// --- Sběr barev z pravidel ------------------------------------------
const nalezy = [];
css.split('\n').forEach((radek, i) => {
  if (JE_DEFINICE.test(radek)) return;
  for (const m of radek.matchAll(BARVA)) {
    const c = rgb(m[0]);
    if (!c) continue;
    nalezy.push({ zapis: m[0], radek: i + 1, ...hsl(c),
                  selektor: (radek.match(/^\s*([^{]{0,46})/) || [])[1] || '' });
  }
});

const cerne = nalezy.filter((n) => n.l <= CERNA_L);
const barevne = nalezy.filter((n) => n.s >= NEUTRALNI_S);

// --- Předpoklady: test nesmí projít na prázdnu -----------------------
/* Mez je 250, ne 300. Nehlídá se tu velikost souboru, ale jestli se vůbec
   přečetl — nepřečtený dá nulu. Na 300 byla naladěná na tehdejší stav
   a spadla ve chvíli, kdy ze stylu zmizelo 64 pravidel po smazaných
   sekcích (barev v pravidlech 291). To je úklid, ne vada, a test, který
   na úklidu padá, by lidi učil uklízet míň. */
pravda('v předloze jsou barvy k měření', nalezy.length >= 250,
  `nalezeno jen ${nalezy.length} — čte test vůbec css/styles.css?`);
pravda('paleta má odstínové rodiny', rodiny.size >= 10,
  `rodin jen ${rodiny.size}`);
pravda('v předloze jsou téměř černé barvy', cerne.length >= 80,
  `téměř černých jen ${cerne.length} — nezměnila se mez světlosti?`);
pravda('většina téměř černých je teplá, tedy je co hlídat',
  cerne.filter((n) => n.s >= NEUTRALNI_S && n.h >= TEPLO_OD && n.h <= TEPLO_DO).length >= 60,
  'teplých téměř černých je málo — pak tenhle test nehlídá pravidlo webu');

// --- A) každá barva patří do rodiny palety ---------------------------
const mimoRodinu = barevne.filter((n) => {
  if (n.zapis in VYJIMKY) return false;
  return ![...rodiny].some(
    (ph) => Math.min(Math.abs(ph - n.h), 360 - Math.abs(ph - n.h)) <= SNES_ODSTIN);
});
pravda('každá barva v pravidlech patří do některé rodiny palety',
  mimoRodinu.length === 0,
  mimoRodinu.slice(0, 8).map((n) => `r.${n.radek} ${n.zapis} (${n.h}°) — ${n.selektor.trim()}`)
    .join('\n      ') + (mimoRodinu.length > 8 ? `\n      (+${mimoRodinu.length - 8} dalších)` : ''));

// --- B) téměř černá je teplá ----------------------------------------
const studene = cerne.filter((n) => {
  if (n.s < NEUTRALNI_S) return false;          // neutrální černá je v pořádku
  if (n.zapis in VYJIMKY) return false;
  return n.h < TEPLO_OD || n.h > TEPLO_DO;
});
pravda('závoje a stíny jsou zelenočerné, ne modročerné',
  studene.length === 0,
  studene.slice(0, 10).map((n) => `r.${n.radek} ${n.zapis} (${n.h}°, světlost ${n.l} %) — ${n.selektor.trim()}`)
    .join('\n      ') + (studene.length > 10 ? `\n      (+${studene.length - 10} dalších)` : ''));

// --- C) výjimka musí být odůvodněná a musí být k čemu ---------------
for (const [zapis, duvod] of Object.entries(VYJIMKY)) {
  pravda(`výjimka ${zapis} má důvod`, typeof duvod === 'string' && duvod.length >= 20,
    'důvod chybí nebo je prázdný');
  pravda(`výjimka ${zapis} se v předloze opravdu vyskytuje`,
    nalezy.some((n) => n.zapis === zapis),
    'barva v předloze není — výjimka ze seznamu patří pryč');
}

// --- D) závoj nad fotkou má na seznamu i na detailu touž teplotu -----
// Pravidlo se čte CELÉ, od selektoru po závorku. Zkratka „první řádek, který
// selektorem začíná" tu nic neměřila: .sn-popis má přechod až na druhém řádku,
// takže vracela null — a null se pak v rozdílu odstínů tvářil jako nula.
function teplotaZavoje(selektor) {
  const od = css.indexOf(selektor + '{');
  if (od < 0) return null;
  const do_ = css.indexOf('}', od);
  if (do_ < 0) return null;
  const b = [...css.slice(od, do_).matchAll(BARVA)].map((m) => rgb(m[0])).filter(Boolean)
    .map(hsl).filter((x) => x.s >= NEUTRALNI_S && x.l <= CERNA_L);
  return b.length ? b[0].h : null;
}
const naSeznamu = teplotaZavoje('.opp-mgrad');
const naDetailu = teplotaZavoje('.sn-popis');
pravda('závoj nad fotkou je ve výpisu i na detailu nalezen',
  naSeznamu !== null && naDetailu !== null,
  `.opp-mgrad ${naSeznamu}°, .sn-popis ${naDetailu}°`);
pravda('závoj nad fotkou má ve výpisu i na detailu touž teplotu',
  naSeznamu !== null && naDetailu !== null && Math.abs(naSeznamu - naDetailu) <= SNES_ODSTIN,
  naSeznamu === null || naDetailu === null
    ? 'jeden ze závojů se nepodařilo změřit — rozdíl se nedá spočítat'
    : `.opp-mgrad ${naSeznamu}°, .sn-popis ${naDetailu}° — rozdíl ${Math.abs(naSeznamu - naDetailu)}°`);

console.log('\nJedna barevná teplota — závoje a stíny patří k zelenému webu');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${nalezy.length} barev v pravidlech, z nich ${cerne.length} téměř černých, ` +
            `rodin v paletě ${rodiny.size}`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Odstíny: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
