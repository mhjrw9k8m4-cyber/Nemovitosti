/* Test: každý odkaz do nového okna má rel s "noopener".
 * ====================================================================
 * Spuštění: node scripts/test-nove-okno.mjs   (bez prohlížeče)
 *
 * PROČ. Odkaz s `target="_blank"` dá otevřené stránce `window.opener`
 * — živé držadlo na okno, ze kterého se na ni kleplo. Cizí stránka
 * s ním nepřečte naše údaje (jiná adresa, prohlížeč to nepustí), ale
 * umí jediné, a to stačí: přepsat `opener.location`. Člověk klepne na
 * odkaz do inzertního webu, přečte si ho, vrátí se na naši kartu — a
 * je na cizí přihlašovací stránce, která se naší jen podobá. Říká se
 * tomu reverse tabnabbing.
 *
 * Naměřeno 23. 10.: odkazů do nového okna je v repozitáři 2 790 a
 * `noopener` měly VŠECHNY — jenže hlídala to jediná kontrola na jediném
 * odkazu (scripts/test-mapa-pozemku.mjs:1415). Celé to tedy stálo na
 * tom, že nikdo nikdy nezapomene.
 *
 * KDE TY ODKAZY JSOU (aby bylo vidět, co se hlídá):
 *   · 2 770 v hotových stránkách — a sedí v 106 souborech: 77 okresních
 *     výpisů a 29 dalších ručně psaných stránek,
 *   · 11 v šablonách generátorů ve scripts/ (odtud ty okresní),
 *   · 6 staví skript za běhu — ve skutečnosti tři místa v js/pozemek.js
 *     a js/smlouva-stranka.js, každé dvakrát, protože vedle zdroje leží
 *     i jeho zmenšená kopie v js/min/. Tam se `rel` nastavuje vlastním
 *     přiřazením, ne v značce.
 * Na 2 232 stránkách pozemků žádný `target="_blank"` NENÍ: odkaz na
 * zdroj si tam stránka postaví až v prohlížeči, a to je právě to šesté
 * místo. Zapomenout má tedy kde ve třech různých vrstvách.
 *
 * Moderní prohlížeče dávají `rel="noopener"` u `target="_blank"` samy
 * (Safari 12.1, Chrome 88, Firefox 79 a výš). Hlídáme to i tak: na
 * starším telefonu, na WebView v aplikaci nebo v nějaké čtečce ta
 * výchozí hodnota být nemusí, a napsat ji nic nestojí.
 *
 * CO SE HLÍDÁ
 *   A) měří se na čem (jinak by zkouška mohla projít nad prázdnem)
 *   B) každý `target="_blank"` má ve své značce `noopener`
 *   C) nikde se neotevírá okno skriptem (`window.open`) — to by tudy
 *      proklouzlo, protože `rel` u něj neexistuje
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

/* Co se prohlíží: hotové stránky (co prohlížeč opravdu dostane),
   moduly v js/ (skládají značky za běhu) a generátory ve scripts/
   (skládají hotové stránky při sestavení). Mimo jsou vendor/ (cizí
   knihovna), node_modules/ a .git/. */
const PRESKOC = new Set(['.git', 'node_modules', 'vendor', 'docs']);
const soubory = [];
(function chod(d) {
  for (const f of readdirSync(d).sort()) {
    if (PRESKOC.has(f)) continue;
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) chod(p);
    else if (/\.(html|js|mjs)$/.test(f)) soubory.push(path.relative(KOREN, p));
  }
})(KOREN);

/* Komentáře pryč. V komentáři smí `target="_blank"` stát klidně bez
   `noopener` — vysvětluje se jím, co se stalo, ne co se servíruje.
   (Stálo to tak ve třech poznámkách v scripts/test-karta-vede-spravne.mjs
   a bez tohohle kroku by z nich zkouška udělala tři nálezy.) */
function bezKomentaru(t, html) {
  /* Konce řádků musí zůstat, jinak by se čísla řádků v nálezu
     posunula o všechno, co se zahodilo, a ukazovala vedle. */
  const prazdno = (s) => s.replace(/[^\n]/g, ' ');
  let s = t.replace(/\/\*[\s\S]*?\*\//g, prazdno);
  if (html) s = s.replace(/<!--[\s\S]*?-->/g, prazdno);
  // „//" jen tam, kde to komentář opravdu je: ne v „https://"
  return s.replace(/(^|[^:\w"'`])\/\/[^\n]*/g, (m, p1) => p1 + prazdno(m.slice(p1.length)));
}

const CIL = /target\s*=\s*\\?["\'`]_blank/g;
let nalezeno = 0, vybirani = 0, mimoZnacku = 0;
const bezNoopener = [];
const okno = [];     // window.open

/* Poslední otevírací značka `<a` před místem — a jen pokud se mezi ní
   a tím místem nezavřela. Tím se pozná, že `target` stojí UVNITŘ
   odkazu, a ne až někde za ním. (`<article` se nepočítá, proto
   `<a` musí končit mezerou nebo `>`.) */
function vZnacceA(t, i) {
  const pred = t.slice(Math.max(0, i - 600), i);
  let zac = -1;
  for (const m of pred.matchAll(/<a[\s>]/g)) zac = m.index;
  if (zac < 0) return -1;
  const mezi = pred.slice(zac);
  return mezi.includes('>') ? -1 : Math.max(0, i - 600) + zac;
}

for (const s of soubory) {
  const hrubo = readFileSync(path.join(KOREN, s), 'utf8');
  const t = bezKomentaru(hrubo, /\.html$/.test(s));
  const radek = (i) => t.slice(0, i).split('\n').length;
  let m;
  CIL.lastIndex = 0;
  while ((m = CIL.exec(t))) {
    /* `[target="_blank"]` je VYBÍRÁNÍ odkazu (selektor v querySelector),
       ne jeho stavění — tam se žádné `rel` psát nedá. Bez téhle výjimky
       hlásila zkouška dva nálezy ve scripts/test-karta-vede-spravne.mjs,
       kde se tím hledá tlačítko na zdroj. Počet se vypisuje, ať je
       vidět, kolik toho výjimka spolkla. */
    if (t[m.index - 1] === '[') { vybirani++; continue; }
    nalezeno++;
    const zacA = vZnacceA(t, m.index);
    if (zacA < 0) {
      /* Mimo značku `<a`: typicky `el.target = '_blank'` ve skriptu.
         Okno je pak 300 znaků na obě strany — `rel` se u takového
         odkazu nastavuje zvlášť, a musí být vidět poblíž. */
      mimoZnacku++;
      const kolem = t.slice(Math.max(0, m.index - 300), Math.min(t.length, m.index + 300));
      if (!/noopener/.test(kolem)) bezNoopener.push(s + ':' + radek(m.index) + ' (mimo <a>)');
      continue;
    }
    const konec = t.indexOf('>', m.index);
    const znacka = t.slice(zacA, konec < 0 ? m.index + 300 : konec + 1);
    if (!/noopener/.test(znacka)) bezNoopener.push(s + ':' + radek(m.index));
  }
  // Otevření okna skriptem: `rel` u něj není, musí se předat sama volba.
  for (const w of t.matchAll(/window\.open\s*\(/g)) {
    const chvost = t.slice(w.index, w.index + 300);
    if (!/noopener/.test(chvost)) okno.push(s + ':' + radek(w.index));
  }
}

/* A) Měří se na čem. Bez tohohle by zkouška prošla i nad repozitářem,
   ve kterém se žádný odkaz do nového okna nenašel — a tvrdila, že je
   vše v pořádku. 23. 10. bylo naměřeno 2 799. */
pravda(`odkazy do nového okna se našly (${nalezeno})`, nalezeno >= 2000,
  'našlo se jich jen ' + nalezeno + ' — zkouška by neměřila nic');
pravda(`a prohlédlo se na čem (${soubory.length} souborů)`, soubory.length >= 2000,
  'souborů jen ' + soubory.length);

// B) Každý má noopener.
pravda('každý odkaz do nového okna má rel s "noopener"', bezNoopener.length === 0,
  bezNoopener.length + ' bez noopener: ' + bezNoopener.slice(0, 8).join(', ') +
  (bezNoopener.length > 8 ? ' …' : ''));

// C) Okno skriptem.
pravda('žádné okno se neotevírá skriptem bez noopener', okno.length === 0,
  'window.open bez noopener: ' + okno.slice(0, 5).join(', '));

console.log('\nOdkazy do nového okna');
console.log(zpravy.join('\n'));
console.log(`\n  · prohlédnuto souborů: ${soubory.length}, odkazů do nového okna: ${nalezeno}`);
console.log(`  · z toho mimo značku <a> (staví je skript): ${mimoZnacku}; vybírání selektorem (nepočítá se): ${vybirani}`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odkazy do nového okna: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
