// Test: hotové stránky neposílají návštěvníkovi komentáře ze zdroje.
//
// Spuštění: node scripts/test-komentare-v-strankach.mjs  (bez prohlížeče)
//
// PROČ. Komentáře jsou v tomhle repozitáři to nejcennější, co v souborech
// je — vysvětlují, proč kus kódu vypadá, jak vypadá. Jen je nemá smysl
// posílat do prohlížeče. Pro stylopis (scripts/minifikace.mjs) a pro
// vložený <style> na stránce pozemku (bezKomentaruVeStylu) to platilo
// odjakživa; komentáře v HTML tím krokem nikdy neprošly.
//
// NAMĚŘENO:
//   · 2 140 stránek pozemků  19,90 MB gzipem → 17,27 MB (1,26 kB na otevření)
//   ·   104 regionálních      835 kB         →   675 kB (1,53 kB na otevření)
//
// A jeden z těch komentářů byl na hotové stránce dokonce NEPRAVDIVÝ:
// „TENHLE SOUBOR JE VZOR, NE STRÁNKA. Bez `?p=` v adrese je na něm
// jediná věta ‚Načítám pozemek…'." To platí o předloze pozemek.html,
// ne o pozemek-benesov-benesov-1sjtz7b.html, kde celý obsah stojí
// v HTML. Kopírovalo se to na 2 140 stránek.
//
// CO SE NEHLÍDÁ: ruční stránky (index.html, hlidani.html…). Ty jsou
// zároveň zdrojem i tím, co se posílá — komentář v nich je jediný výklad
// toho značkování a vyhodit ho by znamenalo přijít o něj. Hlídají se jen
// stránky, které někdo generuje z předlohy, protože u nich zdroj zůstává
// v generátoru.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { bezKomentaruVHtml } from './text.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* JEN STRÁNKY, KTERÉ OPRAVDU NĚKDO GENERUJE — ne všechno, co začíná na
   „pozemek-". Je to táž past, kterou generátor u sebe popisuje: rádce
   pozemek-od-obce.html („Jak koupit pozemek od obce") a pozemky-od-lidi.html
   jsou RUČNÍ stránky, jen mají shodný začátek jména. Jméno stránky pozemku
   končí otiskem klíče — týmž vzorem se výš poznávají i soubory ke smazání
   a řádky v mapě webu. */
const JE_POZEMEK = /^pozemek-[a-z0-9-]+-[0-9a-z]{5,8}\.html$/;
const RUCNI = new Set(['pozemek-od-obce.html', 'pozemky-od-lidi.html']);
const vsechny = fs.readdirSync(KOREN).filter((f) => /\.html$/.test(f));
const generovane = vsechny.filter((f) =>
  !RUCNI.has(f) && (JE_POZEMEK.test(f) || /^pozemky-/.test(f) || f === 'data.html'));
pravda('ruční stránky se shodným začátkem jména se nehlídají',
  [...RUCNI].every((f) => !generovane.includes(f)) && [...RUCNI].every((f) => vsechny.includes(f)),
  'seznam ručních stránek nesedí se souborovým systémem');
pravda('je co měřit — generované stránky se našly', generovane.length > 100,
  `našlo se jich ${generovane.length}`);

const sKomentarem = [];
let gzSKom = 0, gzBez = 0;
for (const f of generovane) {
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
  /* Hledá se jen mimo <script> a <style>: tam „<!--" může být kus kódu. */
  const mimo = h.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  if (/<!--[\s\S]*?-->/.test(mimo)) sKomentarem.push(f);
  gzSKom += gzipSync(h).length;
  gzBez += gzipSync(bezKomentaruVHtml(h)).length;
}
pravda('generované stránky neposílají komentáře', sKomentarem.length === 0,
  `${sKomentarem.length} jich komentář má, např. ${sKomentarem.slice(0, 3).join(', ')}`
  + ' — běželo sestavení (scripts/oprav.mjs)?');
/* Pojistka proti bezzubosti: kdyby se čistič rozbil tak, že nic nedělá,
   kontrola výš by prošla jen díky tomu, že komentáře nikdo nepíše.
   Tohle měří, že úklid OPRAVDU něco ušetřil proti předloze. */
const predloha = fs.readFileSync(path.join(KOREN, 'pozemek.html'), 'utf8');
pravda('a předloha je přitom komentáři plná (jinak by se nehlídalo nic)',
  (predloha.match(/<!--[\s\S]*?-->/g) || []).length >= 3,
  'v pozemek.html nejsou komentáře — čistič by neměl co dělat');
pravda('čistič je funkční — na předloze komentáře opravdu ubere',
  bezKomentaruVHtml(predloha).length < predloha.length - 200,
  'bezKomentaruVHtml z předlohy nic neubral');
/* A že nesahá na to, na co nemá. */
const zkouska = '<p>a</p><script>var x = "<!-- ne -->";</script><!-- pryc -->'
  + '<style>/* c */ .a{color:red}</style>';
const po = bezKomentaruVHtml(zkouska);
pravda('uvnitř <script> komentář nechá být', po.includes('"<!-- ne -->"'), po);
pravda('uvnitř <style> taky', po.includes('/* c */'), po);
pravda('a ten mimo odstraní', !po.includes('<!-- pryc -->'), po);

zpravy.push(`  · naměřeno: ${generovane.length} generovaných stránek,`
  + ` ${(gzSKom / 1024 / 1024).toFixed(2)} MB gzipem`
  + (gzSKom > gzBez ? ` (bez komentářů by to bylo ${(gzBez / 1024 / 1024).toFixed(2)} MB)` : ' — už bez komentářů'));

console.log('\nKomentáře v hotových stránkách');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Komentáře ve stránkách: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
