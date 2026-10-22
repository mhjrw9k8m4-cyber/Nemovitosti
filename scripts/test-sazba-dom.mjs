/* Test: česká sazba platí i pro text, který skládá PROHLÍŽEČ.
   ==================================================================
   Spuštění: node scripts/test-sazba-dom.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ ZVLÁŠŤ OD scripts/test-sazba.mjs. Ta čte statické HTML — tedy
   to, co vyrobily generátory, a tam pravidlo platí skoro absolutně
   (20 840 nezlomitelných mezer proti jedné obyčejné). Jenže velká část
   toho, co člověk na webu přečte, ve statickém souboru NENÍ: jména obcí
   na kartách, odznaky, shrnutí hlídání, hlášky — to všechno skládá
   JavaScript až v prohlížeči a krokem sestavení to neprojde.

   Naměřeno 22. 10. na osmi typech stránek (1 204 textů): v DOM
   porušovalo pravidlo 11 míst, ve zdrojích týchž stránek ani jedno.
   Byly to tři různé věci dohromady:
     · jméno obce z dat („Lukavec u Lovosic") — v datech má 122 z 1 957
       nabídek v místě jednopísmenné slovo a všechna nesla obyčejnou
       mezeru;
     · číslo a jednotka v textech, které skládá prohlížeč („do 2 000 000
       Kč" na kartě hlídání);
     · ručně psané věty v js/*.js a ve vložených skriptech stránek.

   MĚŘÍ SE TOUŽ FUNKCÍ jako u statických stránek (zbyva ze sazba.mjs),
   aby se neporovnávala dvě pravidla, která se časem rozejdou.

   CO SE NEMĚŘÍ: script, style, pre, code, textarea a cokoli skrytého —
   stejné výjimky jako u statické zkoušky. A text za přihlášením: ten se
   odhlášenému nevykreslí, takže o něm tahle zkouška neví. Proto se
   hlídá i POČET prohlédnutých textů: kdyby se stránka přestala
   vykreslovat, zkouška by jinak prošla nad prázdným DOM.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zbyva } from './sazba.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8310;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Sazba v prohlížeči', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Stránky: od každého druhu jedna. Nejvíc textu skládá prohlížeč na
   úvodní (karty nabídek) a na stránkách účtu. */
const STRANKY = ['index.html', 'hlidani.html', 'zpravy.html', 'muj-inzerat.html',
  'porovnani.html', 'moje-data.html', 'data.html', 'cena-pozemku.html', 'pridat.html'];
/* Nejmenší počet textů, který se na té stránce musí najít — pojistka
   proti měření nad prázdnou stránkou. Naměřeno 22. 10. a sražené dolů,
   ať se nehlásí planě, když přibude nebo ubude jeden odstavec. */
const NEJMENE = { 'index.html': 400, 'hlidani.html': 30, 'zpravy.html': 20,
  'muj-inzerat.html': 30, 'porovnani.html': 40, 'moje-data.html': 40, 'data.html': 120,
  'cena-pozemku.html': 150, 'pridat.html': 50 };

const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end('ne'); }
  s.setHeader('content-type', TYPY[path.extname(f)] || 'application/octet-stream');
  s.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/* STRÁNKA POZEMKU SE NEBERE PRVNÍ V POŘADÍ, ALE TA, KTERÁ MÁ CO MĚŘIT.
   Těch stránek je 2 215 a jméno obce s jednopísmenným slovem má jen 147
   z nich (6,6 %) — „Ostrov u Macochy", „Bezděčí u Velkých Opatovic".
   Kdyby se brala první v abecedě, zkouška by se ptala na obec, kde není
   co pokazit, a cestu „jméno obce z dat projde sazbou až při výpisu" by
   neprošla vůbec. (Přesně takovým pevným vzorkem si 22. 10. jiná zkouška
   nechala ujít chybu a pak spadla na datech — viz oddíl 106.)
   Pozná se to podle titulku, který generátor už osadil: nezlomitelná
   mezera hned za jednopísmenným slovem. */
const PREDLOZKA_V_TITULKU = /<title>[^<]*(^|[\s\u2014-])[aiouvkszAIOUVKSZ]\u00a0/;
const vsechny = (await import('node:fs')).readdirSync(KOREN)
  .filter((f) => /^pozemek-.*\.html$/.test(f));
let pozemek = null;
for (const f of vsechny) {
  if (PREDLOZKA_V_TITULKU.test(readFileSync(path.join(KOREN, f), 'utf8').slice(0, 4000))) { pozemek = f; break; }
}
if (!pozemek) pozemek = vsechny[0];
if (pozemek) { STRANKY.push(pozemek); NEJMENE[pozemek] = 30; }

/* Stránka okresu se bere kterákoli: `data-kde="v okrese …"` má každá
   z nich a je to právě ta hodnota, kterou si graf cen teprve vypíše
   jako viditelný text — na sazbu stránky si tedy nesáhla. */
const okresni = (await import('node:fs')).readdirSync(KOREN)
  .filter((f) => /^pozemky-okres-.*\.html$/.test(f));
if (okresni.length) { STRANKY.push(okresni[0]); NEJMENE[okresni[0]] = 150; }

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  /* Servisní pracovník se vypíná: obsluhuje data/*.json a stránka by
     místo serveru dostala jeho kopii (viz scripts/test-zkousky-meri.mjs). */
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  for (const s of STRANKY) {
    await p.goto(`http://127.0.0.1:${PORT}/${s}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(3500);
    const uzly = await p.evaluate(() => {
      const ven = [];
      const chodec = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const r = n.parentElement;
          if (!r) return NodeFilter.FILTER_REJECT;
          if (/^(script|style|pre|code|textarea|title)$/i.test(r.tagName)) return NodeFilter.FILTER_REJECT;
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const cs = getComputedStyle(r);
          if (cs.display === 'none' || cs.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
          if (r.closest('[hidden]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      for (let n = chodec.nextNode(); n; n = chodec.nextNode()) {
        ven.push({ t: n.nodeValue, kde: n.parentElement.tagName.toLowerCase()
          + (typeof n.parentElement.className === 'string' && n.parentElement.className.trim()
            ? '.' + n.parentElement.className.trim().split(/\s+/)[0] : '') });
      }
      return ven;
    }).catch(() => []);

    pravda(`${s}: je co měřit (aspoň ${NEJMENE[s]} textů)`,
      uzly.length >= NEJMENE[s], `nalezeno ${uzly.length} — stránka se nejspíš nevykreslila`);

    let kazi = 0; const kde = [];
    for (const u of uzly) {
      const n = zbyva(u.t);
      if (n > 0) { kazi += n; if (kde.length < 4) kde.push(u.kde + ': „' + u.t.trim().slice(0, 56) + '"'); }
    }
    pravda(`${s}: jednopísmenné slovo ani číslo s jednotkou nezůstane na konci řádku`,
      kazi === 0, kazi ? `${kazi}× obyčejná mezera tam, kde patří nezlomitelná:\n      ` + kde.join('\n      ') : '');
  }
  await ctx.close();
} finally {
  await prohlizec.close();
  server.close();
}

console.log('\nSazba v textu, který skládá prohlížeč');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Sazba v prohlížeči: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
