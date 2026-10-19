/* ZBYLÉ OSY SOUSTAVY: průhlednost, vlasová linka, čas nájezdu.
 *
 * Spuštění: node scripts/test-soustava.mjs   (nepotřebuje prohlížeč)
 *
 * Odstupy, zaoblení, velikosti písma, prostrkání, řádkování a vrstvy
 * mají svou zkoušku. Tyhle tři osy ji neměly a vypadaly takhle:
 *
 * PRŮHLEDNOST — 24 hodnot, a OSM z nich byla TÁŽ hodnota zapsaná dvěma
 *   způsoby: .42 vedle 0.42, .45 vedle 0.45, .5/.6/.7/.75/.8/.85 taky.
 *   To nikdo nepozná ani okem, ani hledáním — a `grep opacity:0.85`
 *   najde tři ze devíti míst. Táž vada, na jakou už test-typografie
 *   hlídá prostrkání („.03em vedle -0.03em se nepozná"); tady jen nikdo
 *   nehlídal. Zápis je proto jeden (s vedoucí nulou) a hodnoty jsou na
 *   dvacetinové mřížce: krok 0,05 je nejmenší rozdíl, který na ploše
 *   ještě jde poznat. Mimo mřížku bylo 0.085, 0.12, 0.14, 0.32, 0.42
 *   a 0.78.
 *
 * VLASOVÁ LINKA — 1px (217×), 1.5px (19×), 2px (13×), 3px (7×) a jedno
 *   1.6px u šipky v nabídce. Šestnáct setin pixelu vedle patnácti nikdo
 *   nerozhodl. Dovolené jsou čtyři šířky, každá má svou práci: 1 linka,
 *   1.5 obrys ovladače, 2 zaměření, 3 barevný pruh na kartě.
 *
 * ČAS NÁJEZDU — tady je potřeba rozlišovat, a je to ten nejdůležitější
 *   komentář v souboru. `transition:` mělo surové trvání na JEDNOM místě
 *   z celého stylopisu; zbylých 29 čísel byly ANIMACE, a tam je rozdíl
 *   skutečný: radar pulsuje 2,6 s, třpyt 1,4 s, tři obláčky na pozadí
 *   mají 14, 18 a 16 s ZÁMĚRNĚ různě, aby se nesesynchronizovaly, a
 *   .reveal má žebřík zpoždění 0.09/0.18/0.27/0.36 s, což je jedna
 *   soustava (0,09 × n), ne čtyři náhody. Tohle se nesjednocuje.
 *
 *   Co se sjednotilo, je rodina NÁJEZDŮ A ODEZEV — „panel se objevil",
 *   „číslo se přepočítalo", „karta odletěla". Jedna práce, a deset
 *   trvání: .12, .14, .2, .26, .3, .34, .42, .45, .5. Těch je teď tolik,
 *   kolik je tokenů: var(--cas-rychly) .12s, var(--cas-zakladni) .2s,
 *   var(--cas-pomaly) .4s.
 *
 *   Zkouška proto hlídá jen `transition` a jmenované nájezdové animace;
 *   seznam animací, které si svůj vlastní čas drží, je tady vypsaný
 *   i s důvodem, aby to nebylo smetiště.
 */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

export const PRUHLEDNOST_KROK = 0.05;
export const LINKY = [1, 1.5, 2, 3];
/* Animace s vlastním časem — každá s důvodem, proč do tokenu nepatří. */
export const VLASTNI_CAS = {
  livepulse: 'tep u značky „žije" — vlastní rytmus, ne nájezd',
  undersweep: 'linka pod nadpisem přejede jednou při příjezdu, s prodlevou',
  mePulse: 'kroužek u mé značky — tep',
  pkRadar: 'radar na mapě — pulsuje, nenajíždí',
  mnbTocSe: 'točící se kolečko — rychlost otáčky, ne doba nájezdu',
  skShimmer: 'třpyt na zástupném obsahu — rychlost přejezdu',
  mping: 'pink na mapě — tep',
  toTopNudge: 'šťouchnutí šipky „nahoru" — opakuje se',
};

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const css = readFileSync('css/styles.css', 'utf8');
/* Komentáře se vybílí, délka zůstane — čísla řádků pak ukazují na
   opravdový řádek a z komentářů se do nálezů nic nedostane. */
const bez = css.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
const radek = (i) => bez.slice(0, i).split('\n').length;

/* ---- 1) průhlednost: jeden zápis ---- */
const bezNuly = [];
for (const m of bez.matchAll(/opacity:\s*(\.\d+)/g)) bezNuly.push(`${radek(m.index)}: opacity:${m[1]}`);
pravda('průhlednost se píše s vedoucí nulou (0.85, ne .85 — jinak je to táž hodnota dvakrát)',
  bezNuly.length === 0, bezNuly.slice(0, 8).join('\n      '));

/* ---- 2) průhnost na dvacetinové mřížce ---- */
const mimoMrizku = [];
for (const m of bez.matchAll(/opacity:\s*(0?\.\d+|0|1)(?![0-9])/g)) {
  const v = parseFloat(m[1]);
  if (Math.abs(v / PRUHLEDNOST_KROK - Math.round(v / PRUHLEDNOST_KROK)) > 1e-9) {
    mimoMrizku.push(`${radek(m.index)}: opacity:${m[1]}`);
  }
}
pravda(`a leží na dvacetinové mřížce (krok ${PRUHLEDNOST_KROK})`,
  mimoMrizku.length === 0, mimoMrizku.slice(0, 8).join('\n      '));

/* ---- 3) vlasová linka: čtyři šířky ---- */
const mimoLinky = [];
for (const m of bez.matchAll(/border(?:-top|-right|-bottom|-left)?:\s*([0-9.]+)px/g)) {
  if (LINKY.indexOf(parseFloat(m[1])) < 0) mimoLinky.push(`${radek(m.index)}: ${m[1]}px`);
}
pravda(`rámečky mají jednu ze čtyř šířek (${LINKY.join(', ')} px)`,
  mimoLinky.length === 0, mimoLinky.slice(0, 8).join('\n      '));

/* ---- 4) transition nemá surové trvání ---- */
const suroveP = [];
for (const m of bez.matchAll(/transition(?:-duration)?\s*:\s*([^;}]+)/g)) {
  for (const c of m[1].matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
    if (parseFloat(c[1]) === 0) continue;   // 0s = „neprodlévej", ne trvání
    suroveP.push(`${radek(m.index)}: transition … ${c[0]}`);
  }
}
pravda('přechody berou čas z tokenu (--cas-rychly / --cas-zakladni / --cas-pomaly)',
  suroveP.length === 0, suroveP.slice(0, 8).join('\n      '));

/* ---- 5) nájezdové animace taky ---- */
const suroveA = [];
for (const m of bez.matchAll(/animation\s*:\s*([A-Za-z][\w-]*)([^;}]*)/g)) {
  const jmeno = m[1];
  if (VLASTNI_CAS[jmeno]) continue;                       // doložená výjimka
  const c = /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/.exec(m[2]);
  if (c && parseFloat(c[1]) !== 0) suroveA.push(`${radek(m.index)}: animation:${jmeno} … ${c[0]}`);
}
pravda('a nájezdové animace taky (vlastní čas si drží jen vypsané výjimky)',
  suroveA.length === 0, suroveA.slice(0, 8).join('\n      '));

/* ---- 6) výjimky se nevěří na slovo ---- */
const mrtveVyjimky = Object.keys(VLASTNI_CAS).filter((j) => !new RegExp('@keyframes\\s+' + j + '\\b').test(bez));
pravda('a žádná vypsaná výjimka není mrtvá (ta animace opravdu existuje)',
  mrtveVyjimky.length === 0, mrtveVyjimky.join(', '));

console.log('\nSoustava: průhlednost, linky, čas');
console.log(zpravy.join('\n'));
console.log(`  (výjimek s vlastním časem ${Object.keys(VLASTNI_CAS).length}, každá s napsaným důvodem)`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Soustava: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Novou hodnotu nepřidávej — vyber tu nejbližší, která v soustavě je. Když má'
    + ' animace opravdu mít vlastní rytmus, dopiš ji do VLASTNI_CAS a napiš proč.');
  process.exit(1);
}
