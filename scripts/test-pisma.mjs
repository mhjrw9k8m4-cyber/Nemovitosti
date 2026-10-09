#!/usr/bin/env node
/* PODŘEZANÁ PÍSMA MUSÍ POKRÝT TO, CO WEB UKAZUJE
   ==================================================================
   Spuštění: node scripts/test-pisma.mjs   (nepotřebuje prohlížeč)

   Písma byla 253 kB a nesla 1 474 glyfů; web ukazuje 159 různých znaků.
   Po podřezání je to 149 kB — největší jediná úspora na webu, protože
   písma se stahují na každé stránce a dělala tam tři čtvrtiny bajtů.
   Jak se podřezávají, stojí ve fonts/PUVOD.md.

   Úspora má ale cenu jen tehdy, když se nic neztratilo. Riziko není
   v tom, co web ukazuje DNES — to se naměřilo — ale v tom, co ukáže
   ZÍTRA: inzeráty jsou cizí text a může v nich stát německé ö, polské ł
   nebo turecké ş. Znak, který v podřezaném písmu není, se vykreslí
   systémovým — v jednom slově uprostřed věty, a nikdo si toho nevšimne,
   dokud se nekoukne zblízka.

   Tahle zkouška proto bere VŠECHNY znaky, které web obsahuje (stránky,
   opsané inzeráty, stylopis), a ověřuje, že leží v podřezané sadě. Sadu
   nečte z písem — ty jsou binární a Node je neumí — ale z fonts/PUVOD.md,
   kde je napsaná. Když se rozejde zápis v PUVOD.md s tím, co se opravdu
   podřezalo, pozná se to na @font-face: rozsahy v stylopisu musí ležet
   v téže sadě.

   Co se tím NEhlídá: že soubor opravdu obsahuje, co sada říká. To by
   znamenalo číst woff2 v Node. Hlídá se místo toho velikost (podřezané
   písmo je o dost menší než plné) a to, že se sada, stylopis a obsah
   nerozejdou.
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
  console.log('\nPodřezaná písma');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Písma: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* ---- 1) soubory a jejich velikost ---- */
const SOUBORY = ['inter-latin.woff2', 'inter-latin-ext.woff2',
  'fraunces-latin.woff2', 'fraunces-latin-ext.woff2'];
const STROP = 70 * 1024;   // plné soubory měly 47–83 kB; podřezané 15–61 kB
let bajtu = 0;
const chybi = [], velke = [];
for (const f of SOUBORY) {
  const c = path.join(KOREN, 'fonts', f);
  if (!fs.existsSync(c)) { chybi.push(f); continue; }
  const v = fs.statSync(c).size;
  bajtu += v;
  if (v > STROP) velke.push(`${f} má ${(v / 1024).toFixed(0)} kB`);
}
pravda('všechna čtyři písma jsou na disku', chybi.length === 0, chybi.join(', '));
if (chybi.length) hotovo();
pravda(`dohromady váží ${(bajtu / 1024).toFixed(0)} kB (plná písma měla 253 kB)`,
  bajtu < 180 * 1024, `${(bajtu / 1024).toFixed(0)} kB — podřezání se nejspíš ztratilo`);
pravda('a žádné samo není větší než podřezané být má', velke.length === 0, velke.join('; '));

/* ---- 2) sada znaků je napsaná v fonts/PUVOD.md ---- */
const puvod = fs.readFileSync(path.join(KOREN, 'fonts', 'PUVOD.md'), 'utf8');
const sadaText = (/SADA='([^']+)'/.exec(puvod) || [])[1] || '';
pravda('fonts/PUVOD.md nese sadu znaků, na kterou se podřezává',
  sadaText.length > 50, 'v PUVOD.md není SADA=…');
if (!sadaText) hotovo();
pravda('a celý příkaz, kterým se to zopakuje',
  /pyftsubset/.test(puvod) && /varLib\.instancer/.test(puvod), 'chybí příkaz');

/** „U+0100-017F,U+2122" → funkce, která řekne, jestli kód leží v sadě. */
function rozsahy(text) {
  const kusy = text.replace(/\s+/g, '').split(',').filter(Boolean);
  const out = [];
  for (const k of kusy) {
    const m = /^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/.exec(k);
    if (!m) throw new Error('nerozumím kusu sady: ' + k);
    const a = parseInt(m[1], 16);
    out.push([a, m[2] ? parseInt(m[2], 16) : a]);
  }
  return out;
}
const SADA = rozsahy(sadaText);
const vSade = (cp) => SADA.some(([a, b]) => cp >= a && cp <= b);
/* KONTROLA KONTROLY: na vymyšlených kódech musí rozhodnout správně,
   jinak by „všechno je v sadě" platilo i o prázdné sadě. */
pravda('sada se přečetla a rozhoduje (ř ano, čínský znak ne)',
  vSade(0x159) && vSade(0x41) && !vSade(0x4E2D) && !vSade(0x1F332),
  `ř=${vSade(0x159)}, A=${vSade(0x41)}, 中=${vSade(0x4E2D)}, 🌲=${vSade(0x1F332)}`);

/* ---- 3) co web obsahuje, musí v sadě být ---- */
/* ZNAKY, KTERÉ NEUMÍ ANI PLNÁ PÍSMA. Naměřeno proti původním souborům
   z Google Fonts: těchto šestnáct v nich není, takže padají na systémové
   písmo už dnes a podřezáním se nic nezměnilo. Jsou tu vyjmenované,
   a ne odfiltrované pravidlem, aby se seznam nemohl tiše rozrůst. */
const MIMO_PISMA = new Set([...'‌→↔↗↩≤●♥✓✕✨', '\u{1F332}', '\u{1F333}',
  '\u{1F447}', '\u{1F514}', '\u{1F5D1}'].map((c) => c.codePointAt(0)));
const ZDROJE = [];
for (const f of fs.readdirSync(KOREN)) if (f.endsWith('.html')) ZDROJE.push(f);
ZDROJE.push('css/styles.css', 'data/popisy.json', 'data/opportunities.json');
const znaky = new Map();   // kód → kde se poprvé viděl
for (const rel of ZDROJE) {
  const c = path.join(KOREN, rel);
  if (!fs.existsSync(c)) continue;
  const s = fs.readFileSync(c, 'utf8');
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === 10 || cp === 13 || cp === 9) continue;
    if (!znaky.has(cp)) znaky.set(cp, rel);
  }
}
pravda(`prohledalo se ${ZDROJE.length} zdrojů a našlo ${znaky.size} různých znaků`,
  ZDROJE.length > 2000 && znaky.size > 100, `zdrojů ${ZDROJE.length}, znaků ${znaky.size}`);
const venku = [];
for (const [cp, kde] of znaky) {
  if (vSade(cp) || MIMO_PISMA.has(cp)) continue;
  venku.push(`${String.fromCodePoint(cp)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')}, ${kde})`);
}
pravda('a každý z nich leží v podřezané sadě',
  venku.length === 0,
  `${venku.length} mimo sadu: ` + venku.slice(0, 8).join(', ')
  + '\n      → doplňte je do SADY v fonts/PUVOD.md a podřezejte písma znovu,'
  + '\n        jinak se vykreslí systémovým písmem uprostřed věty');

/* ---- 4) stylopis musí souhlasit se soubory ---- */
const css = fs.readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
const faces = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => m[1]);
pravda(`v stylopisu jsou čtyři @font-face (${faces.length})`, faces.length === 4, `${faces.length}`);
const spatnaVaha = faces.filter((f) => !/font-weight:400 800/.test(f));
pravda('a každý hlásí tu osu váhy, kterou soubory nesou (400 800)',
  spatnaVaha.length === 0, `${spatnaVaha.length} jiných — soubory mají osu 400–800`);
/* Nejmenší a největší váha, o kterou si stylopis říká, musí do osy
   spadnout. Jinak by prohlížeč dopočítával, co v souboru není. */
const vahy = [...css.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/font-weight\s*:\s*(\d{3})\b/g)]
  .map((m) => +m[1]).filter((v) => v !== 400 || true);
const mimoOsu = [...new Set(vahy.filter((v) => v < 400 || v > 800))];
pravda(`stylopis si říká o váhy ${[...new Set(vahy)].sort().join(', ')} — všechny v ose`,
  mimoOsu.length === 0, `mimo osu 400–800: ${mimoOsu.join(', ')}`);
/* A rozsahy znaků v @font-face nesmí slibovat víc, než sada obsahuje. */
const slibyVenku = [];
for (const f of faces) {
  const ur = (/unicode-range:([^;]+)/.exec(f) || [])[1];
  if (!ur) continue;
  for (const [a, b] of rozsahy(ur)) {
    /* Stačí ověřit krajní body a pár bodů uvnitř: rozsahy jsou spojité. */
    for (const cp of [a, b, Math.floor((a + b) / 2)]) {
      if (!vSade(cp)) { slibyVenku.push(`U+${cp.toString(16).toUpperCase()}`); break; }
    }
  }
}
pravda('a rozsahy v @font-face neslibují znaky mimo podřezanou sadu',
  slibyVenku.length === 0,
  `${slibyVenku.length}: ` + slibyVenku.slice(0, 6).join(', ')
  + ' — prohlížeč by o soubor požádal a stejně sáhl po systémovém písmu');

/* ---- 5) stránky písma přednačítají ---- */
{
  const bez = [];
  let sPreload = 0;
  for (const f of fs.readdirSync(KOREN)) {
    if (!f.endsWith('.html')) continue;
    const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
    if (!/<link[^>]+rel="stylesheet"[^>]+css\/(?:styles|zaklad)/.test(s)) continue;
    sPreload++;
    if (!/<link[^>]+rel="preload"[^>]+as="font"[^>]+fonts\//.test(s)) bez.push(f);
  }
  pravda(`stránky se stylopisem se našly (${sPreload})`, sPreload > 2000, `jen ${sPreload}`);
  pravda('a každá písma přednačítá (jinak si je prohlížeč objedná o kolo později)',
    bez.length === 0, `${bez.length}: ` + bez.slice(0, 3).join(', '));
}

hotovo();
