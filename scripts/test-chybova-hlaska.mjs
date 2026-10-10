/* HLÁŠKA, KTEROU SI PŘEČTE ČLOVĚK V CI
 * ------------------------------------
 * Z běhu zkoušek se do přehledu v CI dostane jedině řádek `::error::`.
 * Dokud na něm stál pouhý počet („Stabilita: 1 kontrol neprošlo."),
 * diagnóza začínala tím, že se celý běh musel zopakovat místně — a
 * u zkoušek, které místně projdou, nezačala vůbec. Tahle zkouška
 * hlídá obojí: že funkce `pricinaChyb` jmenuje, co padlo, a že si ji
 * VŠECHNY zkoušky na svém `::error::` řádku opravdu volají. Jinak by
 * se příští nová zkouška tiše vrátila k tomu, co se právě opravilo.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { bezKomentaru } from './bez-komentaru.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0; let chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- co funkce dělá ------------------------------------------------ */
{
  const h = pricinaChyb(['  ✓ tohle prošlo',
    '  ✕ CLS při otevření\n      0,0712 > mez 0,05']);
  pravda('jméno padlé kontroly je v hlášce', /CLS při otevření/.test(h), h);
  pravda('a důvod z druhé řádky taky', /0,0712 > mez 0,05/.test(h), h);
  pravda('prošlé kontroly se do hlášky nepletou', !/tohle prošlo/.test(h), h);
  pravda('hláška je jednořádková (víc `::error::` neunese)',
    h.indexOf('\n') === -1, JSON.stringify(h));
}
pravda('bez padlých kontrol je hláška prázdná',
  pricinaChyb(['  ✓ a', '  ✓ b']) === '', JSON.stringify(pricinaChyb(['  ✓ a'])));
pravda('snese i prázdné pole', pricinaChyb([]) === '' && pricinaChyb(undefined) === '',
  'spadlo nebo vrátilo text');
{
  const mnoho = [];
  for (let i = 1; i <= 9; i++) mnoho.push(`  ✕ kontrola ${i}`);
  const h = pricinaChyb(mnoho);
  pravda('z devíti padlých vypíše čtyři a zbytek sečte',
    /kontrola 4/.test(h) && !/kontrola 5/.test(h) && /dalších 5/.test(h), h);
}
{
  const dlouhe = ['  ✕ ' + 'x'.repeat(3000)];
  const h = pricinaChyb(dlouhe);
  pravda('dlouhou hlášku zkrátí sama, ne až přehled CI',
    h.length <= 920 && /…$/.test(h), `délka ${h.length}`);
}

/* --- a že si ji zkoušky volají ------------------------------------- */
const soubory = readdirSync(path.join(KOREN, 'scripts'))
  .filter((f) => /^test-.*\.mjs$/.test(f));
const bezHlasky = [];
let sHlaskou = 0;
for (const f of soubory) {
  /* Tenhle soubor si bere sám sebe za vzorek a hledá v něm tytéž
     vzorce, jaké hledá v ostatních — takže by se nahlásil vždy. */
  if (f === 'test-chybova-hlaska.mjs') continue;
  const s = readFileSync(path.join(KOREN, 'scripts', f), 'utf8');
  /* Zkoušky, které počet padlých kontrol nepíšou (hlásí chybu jinak),
     se netýkají — hlídá se právě ten jeden ustálený tvar. */
  if (!/kontrol neprošlo/.test(s)) continue;
  const radky = s.split('\n').filter((r) => /::error::/.test(r) && /kontrol neprošlo/.test(r));
  const vsechny = radky.length > 0 && radky.every((r) => /pricinaChyb\(/.test(r));
  if (vsechny) sHlaskou++; else bezHlasky.push(f);
}
pravda('zkoušek s počtem padlých kontrol je dost na to, aby to něco znamenalo',
  sHlaskou + bezHlasky.length >= 150, `nalezeno ${sHlaskou + bezHlasky.length}`);
pravda('a všechny na svém `::error::` řádku jmenují, co padlo',
  bezHlasky.length === 0, `bez hlášky: ${bezHlasky.join(', ')}`);

/* --- A ŽE JE HLÁŠKA, CO DO NÍ PŘIJDE -------------------------------
   Důvod se do `::error::` dostane jako text. Když na jeho místě stojí
   ČÍSLO, autor skoro jistě zamýšlel porovnání a druhý argument zůstal
   počtem — a kontrola pak tvrdí OPAK své vlastní věty, protože každý
   nenulový počet je pravda. Přesně tohle se stalo v
   scripts/test-klic-ulozenych.mjs: `pravda(…, jinak.length, 0)`
   procházelo právě tehdy, když vada byla, a spadlo, až když se
   spravila. V celém repozitáři to byl jeden jediný výskyt, takže
   stačí hlídat, aby zůstal nulový. */
/* Komentáře se musí vyhodit, jinak si lint najde sám sebe: vysvětlení
   nad ním ten špatný tvar cituje. Táž funkce slouží scripts/rozdel-styly.mjs,
   proto stojí vedle v bez-komentaru.mjs. */
function argumenty(text, od) {
  let hloubka = 1; let kus = ''; const ven = []; let i = od; let uvozovka = null;
  while (i < text.length && hloubka > 0) {
    const c = text[i];
    if (uvozovka) {
      kus += c;
      if (c === '\\') { kus += text[i + 1]; i += 2; continue; }
      if (c === uvozovka) uvozovka = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { uvozovka = c; kus += c; i++; continue; }
    if (c === '(' || c === '[' || c === '{') { hloubka++; kus += c; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      hloubka--;
      if (hloubka === 0) { ven.push(kus); break; }
      kus += c; i++; continue;
    }
    if (c === ',' && hloubka === 1) { ven.push(kus); kus = ''; i++; continue; }
    kus += c; i++;
  }
  return ven.map((a) => a.trim());
}
{
  const spatne = [];
  let volani = 0;
  for (const f of soubory) {
    const s = bezKomentaru(readFileSync(path.join(KOREN, 'scripts', f), 'utf8'));
    const re = /\bpravda\(/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const a = argumenty(s, m.index + m[0].length);
      if (a.length < 2) continue;
      volani++;
      const radek = s.slice(0, m.index).split('\n').length;
      const vyslo = a[1].replace(/\s+/g, ' ');
      const proc = a.length > 2 ? a[2].replace(/\s+/g, ' ') : null;
      if (proc !== null && /^-?\d+(\.\d+)?$/.test(proc)) {
        spatne.push(`${f}:${radek} důvod je číslo (${proc}), výsledek „${vyslo}"`);
      } else if (/\.(length|size)$/.test(vyslo) && !/[=<>!&|?]/.test(vyslo)) {
        spatne.push(`${f}:${radek} výsledek je počet „${vyslo}", ne pravda/nepravda`);
      }
    }
  }
  pravda('kontrol je dost na to, aby to něco znamenalo', volani > 2000, `nalezeno ${volani}`);
  pravda('žádná kontrola nemá na místě důvodu číslo ani počet místo pravdy',
    spatne.length === 0, spatne.slice(0, 4).join(' | '));
}

console.log('\nChybová hláška pro CI');
console.log(zpravy.join('\n'));
console.log(`\nZkoušek s jmenovitou hláškou: ${sHlaskou}`);
if (chyb) {
  console.log('::error::Chybová hláška: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
console.log(`\n${ok} v pořádku, 0 chyb\n`);
