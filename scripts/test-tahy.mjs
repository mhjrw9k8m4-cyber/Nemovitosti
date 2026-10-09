// Test: ikony mají jeden tah — 1,5 px, ať jsou jakkoli velké.
//
// Spuštění: node scripts/test-tahy.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Ikony jsou kreslené do viewBoxu 24 a zmenšují se na 13 až 56 px.
// Tah se zmenšuje s nimi, takže aby vypadal pořád stejně, musí se
// stroke-width u každé velikosti LIŠIT: vykreslený tah je
// šířka × stroke-width ÷ viewBox a ten má vyjít 1,5 px.
//
// Je to past, do které se dá snadno spadnout z obou stran:
//  • Kdo vidí v CSS čísla 2,77 / 2,25 / 1,57 / 1,89, chce je „srovnat"
//    na jedno — a tím malé ikony ztenčí na vlas a velké ztuční.
//  • Kdo přidá ikonu a stroke-width vynechá, zdědí cizí hodnotu
//    a vypadne ze soustavy, aniž by si toho kdokoli všiml. Přesně
//    tak vypadly čtyři ikony: .msf-chev kreslila 1,33 px, .auth-ico
//    1,35 px, .auth-mark 2,18 px a ikona v .pf-empty-ico 2,13 px
//    (ta kvůli atributu stroke-width="1.6" přímo v HTML).
//
// Proto se neměří ČÍSLA V CSS, ale VYKRESLENÝ TAH v prohlížeči —
// jediná hodnota, kterou člověk doopravdy vidí.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKY = ['/index.html', '/hlidani.html', '/porovnani.html', '/kontakt.html',
  '/muj-inzerat.html', '/zpravy.html', '/cena-pozemku.html', '/drazby-pozemku.html',
  '/podminky.html', '/ochrana-udaju.html'];
const CIL = 1.5;
const TOLERANCE = 0.1;   // 1,40–1,60 px: pokryje zaokrouhlení stroke-width na dvě místa

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const p = await prohlizec.newPage({ viewport: { width: 1280, height: 900 } });
const vsechny = [];
const nezmereno = [];

for (const url of STRANKY) {
  await p.goto(BASE + url, { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const out = [], mimo = [];
    for (const sv of document.querySelectorAll('svg')) {
      const rc = sv.getBoundingClientRect();
      if (rc.width < 4) continue;                    // skryté a nulové nemají co měřit
      const cs = getComputedStyle(sv);
      if (cs.stroke === 'none' || cs.visibility === 'hidden') continue;
      const sw = parseFloat(cs.strokeWidth);
      /* Jaký viewBox tah škáluje? Buď vlastní, nebo ze <symbol>, na který
         <use> míří — ikony ze spritu vlastní viewBox nemají. */
      let vb = sv.viewBox && sv.viewBox.baseVal && sv.viewBox.baseVal.width;
      if (!vb) {
        const u = sv.querySelector('use');
        const id = u && (u.getAttribute('href') || u.getAttribute('xlink:href') || '').slice(1);
        const sym = id && document.getElementById(id);
        vb = sym && sym.viewBox && sym.viewBox.baseVal && sym.viewBox.baseVal.width;
      }
      const jmeno = sv.getAttribute('class')
        || (sv.parentElement && sv.parentElement.getAttribute('class'))
        || sv.parentElement && sv.parentElement.tagName.toLowerCase() || '?';
      if (!vb || !isFinite(sw)) { mimo.push({ jmeno, vb: vb || null, sw }); continue; }
      out.push({ tah: +(sw * rc.width / vb).toFixed(2), sw, w: +rc.width.toFixed(1), vb, jmeno });
    }
    return { out, mimo };
  });
  for (const x of r.out) vsechny.push({ ...x, kde: url });
  for (const x of r.mimo) nezmereno.push({ ...x, kde: url });
}
await prohlizec.close();

/* PŘEDPOKLAD: bez naměřených ikon by všechny kontroly prošly naprázdno.
   Čtyřicet je bezpečně pod skutečností (naměřeno 47 na pěti stránkách)
   a zároveň dost nad nulou, aby zachytilo rozbité načítání. */
pravda(`je co měřit — ikon s tahem na ${STRANKY.length} stránkách`, vsechny.length >= 40,
  `naměřeno jen ${vsechny.length} ikon — kontroly níž by prošly naprázdno`);
if (vsechny.length < 40) {
  console.log('\nTah ikon');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  console.log('::error::Tah ikon: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}

const mimo = vsechny.filter((x) => Math.abs(x.tah - CIL) > TOLERANCE);
pravda(`každá ikona kreslí tah ${CIL} px (± ${TOLERANCE})`, mimo.length === 0,
  mimo.slice(0, 12).map((x) => `${x.tah} px — ${x.jmeno} (${x.w}px, sw ${x.sw}, vb ${x.vb}, ${x.kde})`)
    .join('\n      ') + (mimo.length > 12 ? `\n      … a dalších ${mimo.length - 12}` : ''));

/* Různých velikostí má být víc než jedna — jinak soustava nic neřeší
   a test by hlídal shodu, která vznikla sama. */
const velikosti = new Set(vsechny.map((x) => x.w));
pravda('a dělá to při různých velikostech ikon (jinak soustava nic neřeší)',
  velikosti.size >= 4, `velikostí: ${[...velikosti].sort((a, b) => a - b).join(', ')} px`);

/* Různých stroke-width má být taky víc — potvrzuje, že se kompenzuje,
   a ne že jsou všechny ikony náhodou stejně velké. */
const sirky = new Set(vsechny.map((x) => x.sw));
pravda('a dělá to různými stroke-width (tedy se opravdu kompenzuje)',
  sirky.size >= 4, `stroke-width: ${[...sirky].sort((a, b) => a - b).join(', ')}`);

pravda('a u každé ikony se tah dá vůbec změřit (viewBox i stroke-width)',
  nezmereno.length === 0,
  nezmereno.slice(0, 8).map((x) => `${x.jmeno} — viewBox ${x.vb}, stroke-width ${x.sw} (${x.kde})`).join('\n      '));

console.log('\nTah ikon');
console.log(zpravy.join('\n'));
console.log(`  (změřeno ${vsechny.length} ikon na ${STRANKY.length} stránkách, ` +
  `${velikosti.size} velikostí, ${sirky.size} různých stroke-width)`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Tah ikon: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
