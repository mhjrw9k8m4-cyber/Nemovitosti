/* Test: co o webu ví vyhledávač — sirotci a indexovatelnost.
   ==================================================================
   Spuštění: node scripts/test-vyhledavac.mjs   (bez prohlížeče)

   Stránka, která je v sitemap a nevede na ni ze žádné jiné stránky
   odkaz, je sirotek: web ji nabízí vyhledávačům, ale vlastní
   návštěvník se na ni nedostane. Pro čtenáře je to napsaný text, který
   nikdo nenajde; pro vyhledávač známka, že si web sám své stránky
   necení.

   Naměřeno, než tahle zkouška vznikla: sirotci byli dva —
   „Jak koupit pozemek od obce" (pozemek-od-obce.html) s NULA příchozími
   odkazy, a nová stránka „Víc pozemků pohromadě". U té první byl důvod
   poučný: rádce na stránce pozemku na články odkazuje podmíněně podle
   druhu nabídky, a nabídek typu „od obce" je v datech nula — ta větev
   tedy nikdy nenastane. Odkaz, který závisí na datech, není odkaz.

   Počítají se jen odkazy ve STATICKÉM HTML. Odkaz, který vykreslí až
   skript, vyhledávač ani čtenář s vypnutým JavaScriptem nevidí — a je
   to přesně ten případ, který tu chybu dělá nenápadnou.
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

const sm = fs.existsSync(path.join(KOREN, 'sitemap.xml'))
  ? fs.readFileSync(path.join(KOREN, 'sitemap.xml'), 'utf8') : '';
pravda('sitemap.xml se přečetla', sm.length > 1000, `${sm.length} B`);
const vSitemapu = [...sm.matchAll(/<loc>https?:\/\/[^/]+\/([^<]*)<\/loc>/g)].map((m) => m[1] || 'index.html');
pravda(`a jsou v ní adresy (${vSitemapu.length})`, vSitemapu.length > 100, `jen ${vSitemapu.length}`);

const strany = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
pravda(`stránek na disku je dost (${strany.length})`, strany.length > 100, `jen ${strany.length}`);

/* Kam se odkazuje. Jen relativní odkazy na .html v témže adresáři —
   přesně ty, kterými se web prochází. */
const odkazovane = new Set();
let odkazu = 0;
for (const f of strany) {
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
  for (const m of h.matchAll(/href="([a-z0-9][a-z0-9-]*\.html)/g)) {
    if (m[1] === f) continue;                      // odkaz sám na sebe se nepočítá
    odkazovane.add(m[1]); odkazu++;
  }
}
pravda(`odkazy mezi stránkami se našly (${odkazu})`, odkazu > 1000,
  `jen ${odkazu} — změnil se tvar odkazů?`);

/* Úvodní stránka sirotkem být nemůže: je to kořen. */
const sirotci = vSitemapu.filter((u) => u && u !== 'index.html' && !odkazovane.has(u));
pravda('na každou stránku ze sitemap vede odkaz', sirotci.length === 0,
  sirotci.slice(0, 10).join(', ') + (sirotci.length > 10 ? ` …a dalších ${sirotci.length - 10}` : ''));

/* A naopak: v sitemap nesmí chybět stránka, na kterou se odkazuje
   a která existuje — jinak ji vyhledávač najde až náhodou. Výjimky
   jsou stránky, které se schválně neindexují. */
const neindexovat = new Set();
for (const f of strany) {
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (/name="robots"[^>]*noindex|content="noindex/.test(h)) neindexovat.add(f);
}
pravda(`neindexované stránky jsou poznat (${neindexovat.size})`, neindexovat.size > 0,
  'bez nich by další kontrola hlásila falešné chybějící');
const vSitemapuSet = new Set(vSitemapu);
const chybi = [...odkazovane].filter((u) => strany.includes(u)
  && !vSitemapuSet.has(u) && !neindexovat.has(u));
pravda('a odkazovaná indexovatelná stránka v sitemap nechybí', chybi.length === 0,
  chybi.slice(0, 10).join(', '));

/* ---- INDEXOVATELNOST --------------------------------------------
   pozemek.html je VZOR, ne stránka: bez `?p=` v adrese je na něm jediná
   věta „Načítám pozemek…". Přitom měl `robots: index,follow`, takže web
   nabízel vyhledávači prázdnou skořápku — a míří na ni odkaz z každé
   z 1 943 stránek pozemků („Otevřít na mapě"). Vzor je proto
   `noindex,follow` a generátor to hotovým stránkám otáčí zpátky.

   HLÍDÁ SE TO Z OBOU STRAN. Obrátit tuhle dvojici naruby by potichu
   odindexovalo celý web — a na číslech návštěvnosti by se to projevilo
   za týdny, ne hned. */
const robots = (f) => {
  const m = fs.readFileSync(path.join(KOREN, f), 'utf8').match(/<meta name="robots" content="([^"]*)"/);
  return m ? m[1] : null;
};
pravda('vzor pozemek.html se neindexuje, ale odkazy sleduje',
  /noindex/.test(robots('pozemek.html') || '') && /follow/.test(robots('pozemek.html') || ''),
  `robots: ${robots('pozemek.html')}`);

const stranky = strany.filter((f) => /^pozemek-.+\.html$/.test(f) && f !== 'pozemek.html');
const ukoncena = (f) => /Nabídka už není aktuální/.test(fs.readFileSync(path.join(KOREN, f), 'utf8'));
const zive = stranky.filter((f) => !ukoncena(f));
const konec = stranky.filter(ukoncena);
pravda(`stránek pozemků je dost (${zive.length} živých, ${konec.length} ukončených)`,
  zive.length > 500 && konec.length > 0, `${zive.length}/${konec.length}`);
const zivaBezIndexu = zive.filter((f) => !/index,follow/.test(robots(f) || '') || /noindex/.test(robots(f) || ''));
pravda('a všechny ŽIVÉ se indexují', zivaBezIndexu.length === 0,
  `${zivaBezIndexu.length} stránek bez index,follow — např. ${zivaBezIndexu.slice(0, 3).join(', ')}`);
const ukonceneSIndexem = konec.filter((f) => !/noindex/.test(robots(f) || ''));
pravda('a všechny UKONČENÉ se neindexují', ukonceneSIndexem.length === 0,
  `${ukonceneSIndexem.length} ukončených bez noindex — např. ${ukonceneSIndexem.slice(0, 3).join(', ')}`);

console.log('\nCo o webu ví vyhledávač');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Co o webu ví vyhledávač: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
