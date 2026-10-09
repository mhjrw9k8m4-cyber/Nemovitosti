// Test: vložený styl na stránce pozemku.
//
// Spuštění: node scripts/test-vlozeny-styl.mjs   (nepotřebuje prohlížeč)
//
// Stránka pozemku si nese vlastní <style> přímo v HTML. Má to důvod:
// detail se otevírá z výsledků hledání a čeká se u něj na cenu, takže
// se nemá čekat ještě na druhý soubor. Jenže tenhle styl se VKLÁDÁ DO
// KAŽDÉ z 1 995 vygenerovaných stránek — každý jeho kilobajt tedy stojí
// skoro dva megabajty napříč webem.
//
// Hlídá se trojí:
//  1. VELIKOST. Bez stropu roste nenápadně: každé „jen jedno pravidlo
//     navíc" je ve skutečnosti dva tisíce pravidel navíc.
//  2. BARVY PŘES TOKENY. Barva zapsaná napevno neposlechne paletu —
//     a v tmavém režimu zůstane svítit. Právě tudy přišlo sedm bílých
//     pozadí, která na tmavé stránce zářila, a plocha mapy, která ve
//     světlém režimu blikala černě.
//  3. ŽE SE TO NESTÁVÁ DRUHÝM STYLOPISEM. Co platí pro celý web, patří
//     do css/styles.css. Pravidlo napsané na obou místech se dřív nebo
//     později rozejde — na tomhle webu se to u cen i u rádce už stalo.
import { readFileSync, readdirSync } from 'node:fs';
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

const html = readFileSync(path.join(KOREN, 'pozemek.html'), 'utf8');
const m = html.match(/<style>([\s\S]*?)<\/style>/);
// PŘEDPOKLAD: bez vloženého stylu nemá smysl měřit nic dalšího
pravda('stránka pozemku má vložený styl', !!m, 've pozemek.html žádný <style> není');
if (!m) {
  console.log('\nVložený styl na stránce pozemku');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  console.log('::error::Vložený styl: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
const styl = m[1];
const bez = styl.replace(/\/\*[\s\S]*?\*\//g, '');

/* ---- 1) velikost TOHO, CO SE OPRAVDU POSÍLÁ ----
   Strop se dlouho měřil na předloze, tedy VČETNĚ KOMENTÁŘŮ, protože se
   do stránek vkládaly i ony. To už neplatí: scripts/minifikace.mjs
   čistí vložený styl ve vygenerovaných stránkách stejně jako
   css/styles.css (naměřeno 37,9 kB → 21,5 kB na stránku, 32,9 MB
   napříč 2 062 stránkami). Měřit dál předlohu by znamenalo hlídat
   číslo, které nikdo nestahuje — a hlavně by komentáře zdražovaly styl,
   takže by se vyplatilo je nepsat. Měří se proto hotová stránka.

   Předloha se přesto měří taky, jen volněji: je to jediná stránka,
   která vložený styl posílá i s komentáři (je to ZDROJ, nečistí se),
   a chodí se na ni z mapy. */
const STROP_KB = 24;        // dnešní stav 21,0 kB
const STROP_PREDLOHY_KB = 40;

const hotove = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
pravda('je co měřit — vygenerované stránky pozemků se našly',
  hotove.length >= 500, `našlo se ${hotove.length}`);

let nejvetsi = { f: '', kb: 0 };
let sKomentarem = [];
for (const f of hotove) {
  const h = readFileSync(path.join(KOREN, f), 'utf8');
  const mm = h.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!mm) continue;
  const k = mm[1].length / 1024;
  if (k > nejvetsi.kb) nejvetsi = { f, kb: k };
  if (/\/\*/.test(mm[1])) sKomentarem.push(f);
}
pravda(`vložený styl na hotové stránce se vejde do ${STROP_KB} kB`,
  nejvetsi.kb <= STROP_KB && nejvetsi.kb > 0,
  `nejvíc má ${nejvetsi.f}: ${nejvetsi.kb.toFixed(1)} kB `
  + '— každý kilobajt je ~2 MB napříč webem');
/* A zároveň nesmí zmizet: kdyby ho někdo omylem vyprázdnil, detail by
   se rozsypal a kontrola výš by prošla s přehledem. */
pravda('a není prázdný', nejvetsi.kb > 10, `${nejvetsi.kb.toFixed(1)} kB`);
pravda('do hotových stránek se neposílají komentáře ze stylu',
  sKomentarem.length === 0,
  `${sKomentarem.length} stránek je má, např. ${sKomentarem.slice(0, 3).join(', ')} `
  + '— běželo sestavení (scripts/oprav.mjs)?');

const kb = styl.length / 1024;
pravda(`předloha pozemek.html se vejde do ${STROP_PREDLOHY_KB} kB i s komentáři`,
  kb <= STROP_PREDLOHY_KB, `má ${kb.toFixed(1)} kB`);
/* Komentáře v předloze jsou to, podle čeho se styl upravuje. Kdyby je
   někdo „zoptimalizoval" pryč, ušetří nula bajtů (na čtenáře se
   nedostanou) a přijde se o jediný výklad těch pravidel. */
pravda('a komentáře v předloze zůstávají — na čtenáře se stejně nedostanou',
  styl.length - bez.length > 8000,
  `komentářů je ${((styl.length - bez.length) / 1024).toFixed(1)} kB`);

/* ---- 1b) očištění nesmí nic jiného změnit ----
   Čistič je týž, jakým prochází css/styles.css — ale tohle je styl,
   který drží celou stránku pozemku, a kdyby se na něm spletl, pozná se
   to až na webu. Porovná se proto předloha s hotovou stránkou po
   srovnání na stejný tvar: pryč komentáře, pryč mezery a pryč
   středník před závorkou (ten čistič odstraňuje schválně a v CSS nic
   neznamená). Co zbude, musí být ZNAK PO ZNAKU totéž. */
{
  const naStejno = (x) => x
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '')
    .replace(/;\}/g, '}');
  const vzorek = hotove.slice(0, 5);
  const rozdilne = [];
  for (const f of vzorek) {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    const mm = h.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (!mm) { rozdilne.push(`${f}: vložený styl chybí`); continue; }
    if (naStejno(mm[1]) !== naStejno(styl)) rozdilne.push(f);
  }
  pravda('očištěný styl na stránce je týž jako v předloze — jen bez komentářů a mezer',
    vzorek.length > 0 && rozdilne.length === 0,
    `liší se: ${rozdilne.slice(0, 3).join(', ')}`);
}

/* ---- 2) barvy přes tokeny ---- */
{
  /* Povolené je: var(--token), bílá a černá (ty leží na barevných
     plochách a platí v obou režimech), průhledná, a hodnota uvedená
     jako ZÁLOHA uvnitř var(--token, #hex). */
  const bezZaloh = bez.replace(/var\(\s*--[a-z0-9-]+\s*,[^)]*\)/g, 'var(--x)');
  const napevno = [...bezZaloh.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((x) => x[0].toLowerCase())
    .filter((h) => !['#fff', '#ffffff', '#000', '#000000'].includes(h));
  pravda('barvy se berou z palety, ne se píšou napevno',
    napevno.length === 0,
    'napevno: ' + [...new Set(napevno)].join(', ')
      + ' — taková barva neposlechne paletu a v tmavém režimu zůstane svítit');
  // PŘEDPOKLAD: kdyby se tokeny nepoužívaly vůbec, kontrola výš projde naprázdno
  const tokenu = (bez.match(/var\(--/g) || []).length;
  pravda('a tokenů se opravdu používá hodně (jinak kontrola nic neřeší)',
    tokenu >= 100, `var(--…) použito ${tokenu}×`);
}

/* ---- 3) nestává se z toho druhý stylopis ---- */
{
  const pravidel = (bez.match(/\{/g) || []).length;
  /* Dnes 207. Strop 240 je místo na úpravy, ne na nový oddíl: co platí
     pro celý web, patří do css/styles.css. */
  pravda('nerozrůstá se do druhého stylopisu (nejvýš 240 pravidel)',
    pravidel <= 240, `pravidel: ${pravidel}`);

  /* Třídy, které jsou v OBOU souborech, jsou nejnebezpečnější: tatáž
     třída se dvěma definicemi se rozejde a nikdo si toho nevšimne.
     Hlídají se jen vlastní třídy detailu (pz…), protože obecné
     modifikátory jako .on nebo .primary jsou sdílené záměrně. */
  const globalni = readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* Nestačí hledat, jestli se název třídy v globálním stylopisu vyskytne:
     `a:not(.pz-btn)` ani `.opp-list, .pz-gallery { … }` nejsou druhá
     definice, jen vyjmutí a sdílená drobnost. Nebezpečná je KOLIZE
     VLASTNOSTÍ — tatáž třída, tatáž vlastnost, dvě místa. Přesně tak
     se tu rozešel .pz-verdict: barvu si nastavoval tady i tam. */
  function pravidla(css) {
    const out = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const vlastnosti = new Set();
      for (const d of m[2].split(';')) {
        const k = d.split(':')[0].trim().toLowerCase();
        if (k) vlastnosti.add(k);
      }
      out.push({ sel: m[1].trim().split('\n').pop().trim(), vlastnosti });
    }
    return out;
  }
  const bezNot = (sel) => sel.replace(/:not\([^)]*\)/g, '');
  function podleTridy(css) {
    const map = new Map();
    for (const r of pravidla(css)) {
      for (const t of (bezNot(r.sel).match(/\.(pz[\w-]*)/g) || [])) {
        const c = t.slice(1);
        if (!map.has(c)) map.set(c, new Set());
        for (const v of r.vlastnosti) map.get(c).add(v);
      }
    }
    return map;
  }
  const mistniM = podleTridy(bez), globalniM = podleTridy(globalni);
  const kolize = [];
  for (const [c, vl] of mistniM) {
    const g = globalniM.get(c);
    if (!g) continue;
    const spolecne = [...vl].filter((v) => g.has(v));
    if (spolecne.length) kolize.push(`${c}: ${spolecne.slice(0, 3).join(', ')}`);
  }
  pravda('je co měřit — vlastní třídy detailu', mistniM.size >= 40, `tříd: ${mistniM.size}`);
  pravda('a žádná z nich nemá tutéž vlastnost nastavenou i v css/styles.css',
    kolize.length === 0,
    kolize.slice(0, 6).join('\n      ') + '\n      (dvě místa pro tutéž vlastnost se rozejdou)');
}

console.log('\nVložený styl na stránce pozemku');
console.log(zpravy.join('\n'));
console.log(`  (${kb.toFixed(1)} kB, ${(bez.match(/\{/g) || []).length} pravidel, ` +
  `${(bez.match(/var\(--/g) || []).length}× token)`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Vložený styl: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
