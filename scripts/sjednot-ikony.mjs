/* Vepíše sadu ikon (scripts/ikony.mjs) do každé stránky.
   ==================================================================
   Spuštění: node scripts/sjednot-ikony.mjs
     (součást řetězu v scripts/oprav.mjs)

   Tvary ikon se píšou na jednom místě — v scripts/ikony.mjs. Tenhle
   krok z nich udělá sprite (<symbol id="i-…">) a vloží ho hned za
   <body>, aby se každé <use href="#i-…"> na stránce mělo čeho chytit.

   Proč sprite a ne kresba na místě: dokud se tvary psaly přímo do
   značek, měl web 79 různých kreseb na 105 místech — mimo jiné čtyři
   lupy a dvě záložky. Sprite udělá z ikony JMÉNO; dvě různé lupy pak
   nemají kde vzniknout.

   Běží AŽ ZA generátory (ty přepisují stránky celé) a za sjednocením
   lišty a patičky (ty do stránek ikony vkládají).
   ================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sprite, dataUri } from './ikony.mjs';

/* Tři ikony kreslí nabídka jako POZADÍ (background-image), kam se
   <use> nedostane. Berou se z téže tabulky a zapisují se do stylopisu;
   zelená je --znacka-tmava, kterou v data-URI nejde nechat jako
   proměnnou. */
const TOKENY = { profil: 'uzivatel', mapa: 'spendlik', cena: 'cena' };
const ZNACKA = '%23276646';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Sprite se pozná podle třídy, ne podle pořadí — ať jde přepsat i tehdy,
   když se kolem něj ve stránce něco přesune. */
export const VZOR = /<svg class="ik-sada"[\s\S]*?<\/svg>\n?/;
const BODY = /<body\b[^>]*>/;

/* Které ikony stránka potřebuje. Nestačí projít její značkování —
   většinu ikon kreslí až skripty.

   Které skripty to jsou, se dá přečíst ZE STRÁNKY, a jen z ní: moduly
   se načítají buď přes <script src>, nebo odloženě, a i tehdy má
   adresu stránka (<meta name="pk-odlozeny" data-src="…">, viz nactiModul
   v js/main.js a v js/pozemek.js). Žádný modul si jméno jiného souboru
   neskládá sám, takže se nikam dál chodit nemusí.

   NECHODÍ SE PŘES ZMÍNKY V KÓDU. První verze brala i jména souborů
   zmíněná uvnitř modulů — jenže ta jsou skoro vždycky v komentáři
   („viz js/pozemek.js"), a okresní stránka tak dostala celou sadu
   ikon stránky pozemku: 31 symbolů na tři použité.

   Uvnitř modulu se naopak bere ikona celá, i když ji vykreslí jen
   jedna větev kódu. Lepší symbol navíc než <use> bez cíle — to by byla
   neviditelná ikona. */
const ODKAZ = /#(i-[a-z0-9-]+)/g;
const pamet = new Map();

function idyModulu(jm) {
  if (pamet.has(jm)) return pamet.get(jm);
  const idy = new Set();
  try {
    const t = readFileSync(path.join(KOREN, 'js', jm + '.js'), 'utf8');
    for (const m of t.matchAll(ODKAZ)) idy.add(m[1]);
  } catch (e) { /* soubor neexistuje (vendor apod.) — nic nepřidá */ }
  pamet.set(jm, idy);
  return idy;
}

export function idyStranky(html) {
  const idy = new Set();
  for (const m of html.matchAll(ODKAZ)) idy.add(m[1]);
  for (const m of html.matchAll(/(?:src|data-src)="js\/(?:min\/)?([a-z0-9-]+)\.js/g)) {
    idyModulu(m[1]).forEach((i) => idy.add(i));
  }
  return idy;
}

export function sjednotIkony(html) {
  const bezStare = html.replace(VZOR, '');
  const m = bezStare.match(BODY);
  if (!m) return html;              // stránka bez <body> (fragment) se nechá být
  const kam = m.index + m[0].length;
  const kus = sprite(idyStranky(bezStare));
  if (!kus) return bezStare;
  return bezStare.slice(0, kam) + '\n' + kus + bezStare.slice(kam);
}

export function sjednotTokeny(css) {
  let out = css;
  for (const [token, ikona] of Object.entries(TOKENY)) {
    const vzor = new RegExp(`(  --ikona-${token}:)url\\("data:image/svg\\+xml,[^"]*"\\);`);
    if (!vzor.test(out)) continue;
    out = out.replace(vzor, `$1${dataUri(ikona, ZNACKA)};`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const styl = path.join(KOREN, 'css', 'styles.css');
  const predCss = readFileSync(styl, 'utf8');
  const poCss = sjednotTokeny(predCss);
  if (poCss !== predCss) writeFileSync(styl, poCss);
  console.log(`    Ikony v nabídce (pozadí v CSS): ${poCss !== predCss ? 'přepsány' : 'už seděly'}.`);

  const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  let zmeneno = 0, sedelo = 0, bez = 0;
  for (const f of stranky) {
    const cesta = path.join(KOREN, f);
    const pred = readFileSync(cesta, 'utf8');
    const po = sjednotIkony(pred);
    if (po === pred) { if (BODY.test(pred)) sedelo++; else bez++; continue; }
    writeFileSync(cesta, po);
    zmeneno++;
  }
  console.log(`    Sada ikon vložena: ${zmeneno} stránek přepsáno, ${sedelo} už sedělo, ${bez} bez <body>.`);
}
