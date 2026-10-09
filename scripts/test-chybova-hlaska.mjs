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

console.log('\nChybová hláška pro CI');
console.log(zpravy.join('\n'));
console.log(`\nZkoušek s jmenovitou hláškou: ${sHlaskou}`);
if (chyb) {
  console.log('::error::Chybová hláška: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
console.log(`\n${ok} v pořádku, 0 chyb\n`);
