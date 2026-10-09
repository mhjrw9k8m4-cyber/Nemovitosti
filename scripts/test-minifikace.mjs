#!/usr/bin/env node
/* OČIŠTĚNÝ STYLOPIS MUSÍ ŘÍKAT TOTÉŽ CO ZDROJ
   ==================================================================
   css/styles.min.css je to, co si opravdu stáhne návštěvník — zdroj
   css/styles.css už ne. Kdyby se ty dva rozešly, web by se chovat jinak
   než soubor, do kterého se při hledání vady člověk podívá. To je ten
   nejnepříjemnější druh vady: měříte jednu věc a běží druhá.

   Kontroluje se:
     1. že očištěná kopie opravdu odpovídá zdroji (jinak je zapomenutá),
     2. že v ní nezůstal ani jeden komentář (jinak očištění nefunguje —
        a přesně to se stalo: vložený SVG obrázek obsahuje url(%23z),
        tedy závorku v závorce, parser za ní odjel a 174 komentářů
        zůstalo. Stránka se přitom vykreslila správně, takže by si toho
        nikdo nevšiml),
     3. že má TÉŽ PRAVIDLA jako zdroj — selektor po selektoru,
     4. že na ni stránky opravdu odkazují.

   Bod 3 se nepočítá tou funkcí, která očišťuje: to by byla kontrola
   sebe sebou. Selektory se tahají z obou souborů zvlášť a porovnávají
   se jako množiny.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { ocisti, ocistiJs } from './minifikace.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const zdroj = fs.readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
const miniCesta = path.join(KOREN, 'css', 'styles.min.css');
pravda('očištěná kopie existuje', fs.existsSync(miniCesta), 'css/styles.min.css chybí');
if (!fs.existsSync(miniCesta)) { console.log(zpravy.join('\n')); process.exit(1); }
const mini = fs.readFileSync(miniCesta, 'utf8');

/* 1) Není zapomenutá. */
pravda('očištěná kopie odpovídá zdroji (není zapomenutá po úpravě)',
  ocisti(zdroj) === mini,
  'spusťte node scripts/oprav.mjs — css/styles.min.css je ze starší podoby zdroje');

/* 2) Žádné komentáře. */
const zbyle = (mini.match(/\/\*/g) || []).length;
pravda('a nezůstal v ní ani jeden komentář', zbyle === 0, `zbylo ${zbyle} komentářů`);

/* 3) Táž pravidla. Selektory se z obou souborů vytahují SAMOSTATNĚ:
   odstraní se komentáře, soubor se rozseká na bloky podle složených
   závorek a bere se text před každou otevírací závorkou. Není to plný
   parser CSS, ale na porovnání dvou podob TÉHOŽ souboru to stačí —
   a hlavně to nepoužívá tu funkci, která očišťuje. */
/* Porovnávací tvar selektoru. Očištění mění mezery u interpunkce
   („html, body" → „html,body", „(min-width: 700px)" →
   „(min-width:700px)"), takže se musí srovnat na týž tvar OBĚ strany —
   jinak by kontrola hlásila 212 rozdílů, které rozdíly nejsou. Měří se
   přítomnost pravidla, ne jeho sazba.
   Nepoužívá se k tomu funkce ocisti(): tohle je vlastní, mnohem hrubší
   srovnání, a to je záměr — kontrola se nesmí opírat o to, co kontroluje. */
function norm(sel) {
  return sel.replace(/\s+/g, ' ')
    .replace(/\s*([:,>()])\s*/g, '$1')
    .trim();
}
function selektory(css) {
  const bez = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  let hloubka = 0, zacatek = 0;
  for (let i = 0; i < bez.length; i++) {
    const c = bez[i];
    if (c === '{') {
      if (hloubka === 0) {
        const sel = norm(bez.slice(zacatek, i));
        if (sel) out.push(sel);
      }
      hloubka++;
    } else if (c === '}') {
      hloubka = Math.max(0, hloubka - 1);
      if (hloubka === 0) zacatek = i + 1;
    }
  }
  return out;
}
const sZdroj = selektory(zdroj);
const sMini = selektory(mini);
pravda(`ve zdroji se našly selektory (${sZdroj.length}) — jinak se nic neporovnává`,
  sZdroj.length > 500, `nalezeno ${sZdroj.length}`);
/* Porovnává se jako MNOŽINA i jako POČET: selektor smí být v souboru
   víckrát (přebití je v CSS normální) a toho počtu si tu všimneme. */
const spoctiVyskyty = (a) => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
const mZdroj = spoctiVyskyty(sZdroj), mMini = spoctiVyskyty(sMini);
const rozdily = [];
for (const [sel, kolik] of mZdroj) {
  const vMini = mMini.get(sel) || 0;
  if (vMini !== kolik) rozdily.push(`${sel} (zdroj ${kolik}×, očištěný ${vMini}×)`);
}
for (const sel of mMini.keys()) if (!mZdroj.has(sel)) rozdily.push(`${sel} (jen v očištěném)`);
pravda('a očištěná kopie má přesně tytéž selektory, stejně krát',
  rozdily.length === 0, `${rozdily.length} rozdílů: ` + rozdily.slice(0, 3).join('; '));

/* Deklarace: hrubý počet dvojic vlastnost:hodnota musí být týž. */
const deklaraci = (css) => (css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .match(/[-a-zA-Z]+\s*:\s*[^;{}]+/g) || []).length;
const dZdroj = deklaraci(zdroj), dMini = deklaraci(mini);
pravda(`a stejně mnoho deklarací (${dZdroj})`, dZdroj === dMini,
  `zdroj ${dZdroj}, očištěný ${dMini}`);

/* 4) Stránky na ni odkazují, a na zdroj už ne. */
const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
/* Očištěné kopie jsou dvě: plná (index.html, kde stojí mapa) a zkrácená
   css/zaklad.min.css pro zbytek webu — viz scripts/rozdel-styly.mjs.
   Tady se hlídá jen to, že se nikde neservíruje NEočištěný zdroj. */
let naMini = 0; const naZdroj = [];
for (const f of stranky) {
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (/(?:href|src)="css\/(?:styles|zaklad)\.min\.css/.test(s)) naMini++;
  if (/(?:href|src)="css\/styles\.css/.test(s)) naZdroj.push(f);
}
pravda(`stránky odkazují na očištěnou kopii (${naMini})`, naMini > 2000, `jen ${naMini}`);
pravda('a žádná už nestahuje neočištěný zdroj',
  naZdroj.length === 0, `${naZdroj.length}: ` + naZdroj.slice(0, 3).join(', '));

/* A kolik se tím ušetřilo — ať je to v běhu vidět a nedá se to splést
   s „nic to nedělá". */
const usetreno = Buffer.byteLength(zdroj) - Buffer.byteLength(mini);
pravda('a ušetří to aspoň 100 kB', usetreno > 100 * 1024,
  `ušetřeno jen ${(usetreno / 1024).toFixed(1)} kB`);

/* ==================================================================
   OČIŠTĚNÉ SKRIPTY (js/min/)
   ==================================================================
   Totéž co u stylopisu, jen nebezpečnější: u CSS nejhůř přestane
   platit pravidlo, u JavaScriptu se změní chování. Dvě pasti:

   1. KOMENTÁŘ JE ODDĚLOVAČ. Stojí-li blokový komentář mezi `typeof`
      a jménem, dá jeho prosté smazání `typeofy` — platný JavaScript,
      jen jiný. Proto se blokový komentář nahrazuje mezerou, a jestli
      obsahuje konec řádku, tak koncem řádku.
   2. KONEC ŘÁDKU NESE VÝZNAM. Řádkový komentář hned za `return`
      a hodnota až na dalším řádku znamená, že se vrací undefined:
      za `return` je konec řádku a doplní se středník. Smazat ten
      konec řádku by změnilo návratovou hodnotu.

   Nekontroluje se to proti vlastnímu výstupu — to by byla kontrola
   sebe sebou. Kontroluje se:
     a) node --check nad každou kopií (cizí parser, ne náš),
     b) sedm vymyšlených pastí s DOSLOVNĚ ZAPSANÝM očekávaným výstupem,
     c) že v kopii nezůstal ani jeden komentář,
     d) že kopie odpovídá zdroji a že na ni stránky odkazují.
   ================================================================== */
{
  const JS = path.join(KOREN, 'js');
  const MIN = path.join(JS, 'min');
  /* OČIŠTĚNOU KOPII MÁ MÍT JEN TO, CO SI NĚJAKÁ STRÁNKA BERE.
     Ne všechno v js/ je pro prohlížeč: js/druh.js používá stahovač dat
     a js/opakovana-kontrola.js kontrola inzerátů (oba běží v Node),
     a js/mereni-hlavicky.js si úvodní stránka natahuje jen s „?mereni"
     v adrese, a to neočištěný. Kopie těch tří se přesto vyráběly
     a publikovaly — 10,9 kB souborů, které si nikdo nestáhne.
     Hledá se obojí zápis (js/… i js/min/…), protože čerstvě vysázená
     stránka odkazuje na první a po přepisu odkazů na druhý. */
  const vsechny = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));
  const pouzite = new Set();
  for (const f of fs.readdirSync(KOREN)) {
    if (!f.endsWith('.html')) continue;
    const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
    const vzor = /(?:src|href)="js\/(?:min\/)?([A-Za-z0-9_-]+)\.js/g;
    let m;
    while ((m = vzor.exec(h))) pouzite.add(m[1] + '.js');
  }
  const zdroje = vsechny.filter((f) => pouzite.has(f));
  const jenProBuild = vsechny.filter((f) => !pouzite.has(f));
  pravda(`v js/ se našly skripty (${zdroje.length}) — jinak se nic neporovnává`,
    zdroje.length > 40, `nalezeno ${zdroje.length}`);
  pravda('js/min/ existuje', fs.existsSync(MIN), 'spusťte node scripts/minifikace.mjs');

  /* b) PASTI. Očekávaný výstup je napsaný ručně, znak po znaku. Kdyby
     se počítal tou funkcí, co se zkouší, prošlo by cokoli — a opravdu
     to prošlo: první podoba téhle kontroly srovnávala posloupnost
     tokenů, kterou si brala ze stejného rozebírače, a tři sabotáže
     (komentář za nic, konec řádku za mezeru, vzor za dělení) všechny
     prolezly. */
  const PASTI = [
    ['komentář mezi dvěma jmény nesmí jména slepit',
      'var y = 1; var x = typeof/*c*/y; x;',
      'var y = 1; var x = typeof y; x;'],
    ['konec řádku za řádkovým komentářem zůstává (jinak se změní návratová hodnota)',
      'function f(){ return // c\n 1; }\nf();',
      'function f(){ return\n 1; }\nf();'],
    ['apostrof uvnitř vzoru po return nesmí spustit text',
      "function g(y){ return /it's/.test(y); }\n/* k */ var z = 1; g, z;",
      "function g(y){ return /it's/.test(y); }\n  var z = 1; g, z;"],
    ['dělení se nesmí přečíst jako vzor (spolklo by komentář za ním)',
      'var b=1,c=2,e=3,f=4; var a = b / c; /* x */ var d = e / f; a, d;',
      'var b=1,c=2,e=3,f=4; var a = b / c;   var d = e / f; a, d;'],
    ['šablona přes víc řádků se nesahá, i když v ní stojí dvě lomítka',
      'var t = `r1\n// není komentář\nr2`;\n/* k */ var u = 1; t, u;',
      'var t = `r1\n// není komentář\nr2`;\n  var u = 1; t, u;'],
    ['komentář mezi hodnotou a operátorem',
      'var q = 1; var w = q/*c*/+ 1; w;',
      'var q = 1; var w = q + 1; w;'],
    ['blokový komentář s koncem řádku se nahradí koncem řádku',
      'var i = 1 /* a\nb */ + 2; i;',
      'var i = 1\n + 2; i;'],
  ];
  let spatnePasti = 0;
  for (const [popis, vstup, cekano] of PASTI) {
    const vyslo = ocistiJs(vstup);
    if (vyslo !== cekano) {
      spatnePasti++;
      zpravy.push(`  ✕ past: ${popis}\n      čekáno ${JSON.stringify(cekano)}\n      vyšlo  ${JSON.stringify(vyslo)}`);
      chyb++;
    }
  }
  pravda(`všech ${PASTI.length} pastí na očištění skriptů dopadlo, jak má`, spatnePasti === 0,
    `${spatnePasti} pastí selhalo (viz výš)`);

  /* a) + c) + d) nad skutečnými soubory. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-min-'));
  const chybejici = [], zastarale = [], nerozebrane = [], skomentarem = [];
  let predB = 0, poB = 0;
  for (const f of zdroje) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    const cil = path.join(MIN, f);
    if (!fs.existsSync(cil)) { chybejici.push(f); continue; }
    const kopie = fs.readFileSync(cil, 'utf8');
    predB += Buffer.byteLength(src); poB += Buffer.byteLength(kopie);
    if (kopie !== ocistiJs(src)) zastarale.push(f);
    const t = path.join(tmp, f);
    fs.writeFileSync(t, kopie);
    try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }); }
    catch (e) { nerozebrane.push(f + ': ' + String(e.stderr).split('\n')[1]); }
    /* Hledá se hrubě, ale bez výjimek: kdyby „//" patřilo do adresy,
       předchází mu dvojtečka. Naměřeno: v žádné z 51 kopií není ani
       jedno takové místo, takže výjimka není potřeba. */
    if (kopie.includes('/*') || /(^|[^:\\`'"])\/\//.test(kopie)) skomentarem.push(f);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  /* A OBRÁCENĚ: co si žádná stránka nebere, nesmí mít kopii v js/min/.
     Tahle kontrola tu chyběla a právě tudy se tři mrtvé soubory
     publikovaly. Horší než zbytečnost je past: kdo takovou kopii uvidí,
     může ji omylem zapojit do stránky — u mereni-hlavicky.js by si tím
     na web pustil měřidlo pro ladění. */
  pravda(`moduly jen pro build se našly (${jenProBuild.length})`, jenProBuild.length > 0,
    'ani jeden — pak kontrola pod tím nic neměří');
  const zbytecneKopie = jenProBuild.filter((f) => fs.existsSync(path.join(MIN, f)));
  pravda('a žádný z nich nemá očištěnou kopii, kterou si nikdo nestáhne',
    zbytecneKopie.length === 0, `zbytečně se publikuje: ${zbytecneKopie.join(', ')}`);

  pravda('každý skript, který si stránka bere, má očištěnou kopii', chybejici.length === 0,
    `${chybejici.length} chybí: ` + chybejici.slice(0, 3).join(', '));
  pravda('žádná kopie není zapomenutá po úpravě zdroje', zastarale.length === 0,
    `${zastarale.length} neodpovídá: ` + zastarale.slice(0, 3).join(', ') + ' — spusťte node scripts/oprav.mjs');
  pravda('každou kopii přečte node --check (cizí parser, ne náš)', nerozebrane.length === 0,
    nerozebrane.slice(0, 2).join('; '));
  pravda('a v žádné kopii nezůstal komentář', skomentarem.length === 0,
    `${skomentarem.length}: ` + skomentarem.slice(0, 3).join(', '));

  /* Kopie bez zdroje — stránka by stahovala mrtvý kód. */
  const osirele = fs.existsSync(MIN)
    ? fs.readdirSync(MIN).filter((f) => f.endsWith('.js') && !zdroje.includes(f)) : [];
  pravda('a žádná kopie nezbyla po smazaném zdroji', osirele.length === 0,
    osirele.join(', '));

  /* d) Odkazy. */
  let naMinJs = 0; const naZdrojJs = [];
  for (const f of stranky) {
    const t = fs.readFileSync(path.join(KOREN, f), 'utf8');
    if (/src="js\/min\//.test(t)) naMinJs++;
    const bez = t.match(/src="js\/([A-Za-z0-9_-]+)\.js/g) || [];
    if (bez.length) naZdrojJs.push(`${f} (${bez[0]})`);
  }
  pravda(`stránky odkazují na očištěné skripty (${naMinJs})`, naMinJs > 2000, `jen ${naMinJs}`);
  pravda('a žádná už nestahuje neočištěný zdroj skriptu', naZdrojJs.length === 0,
    `${naZdrojJs.length}: ` + naZdrojJs.slice(0, 3).join(', '));

  const usetrenoJs = predB - poB;
  pravda('a ušetří to aspoň 300 kB', usetrenoJs > 300 * 1024,
    `ušetřeno jen ${(usetrenoJs / 1024).toFixed(1)} kB`);
}

console.log('\nOčištěný stylopis a skripty');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Očištěný stylopis a skripty: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
