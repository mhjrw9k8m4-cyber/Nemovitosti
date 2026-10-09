/* Test: ve stylopisu nezůstávají pravidla, která nemají na čem zabrat.
   ==================================================================
   Spuštění: node scripts/test-mrtve-styly.mjs   (bez prohlížeče)

   PROČ. Když se ze stránky odebere celá sekce, HTML zhubne a stylopis
   ne. Naměřeno: po zrušení uvítacího bloku, cenové mapy okresů a
   Upozornění zbylo v css/styles.css 83 pravidel (16,4 kB zdroje),
   která nemohla zabrat NIKDE — .hero-band, .hero-live, .hero-plot,
   .hero-head, .hero-stats, .ts-n, .hh-stit, .hh-zive, .cen-mapa-*,
   .nav-unread, #view-lide, #map-tip-text, .add-step, .guarantee.
   Stahovalo se to na každé stránce webu a blokovalo vykreslení.

   JAK SE POZNÁ „NEMÁ NA ČEM ZABRAT". Stejná úvaha jako v
   scripts/rozdel-styly.mjs, jen se tokeny neberou ze stránky, ale
   z CELÉHO repozitáře: ze všech HTML, ze všech skriptů (js/, scripts/,
   vendor/) a z textů. Jediný výskyt slova pravidlo zachrání. Chybovat
   se tu smí jen jedním směrem — radši nechat živé, než smazat platné.

   A PŘESTO TO NESTAČÍ, proto ta tabulka výjimek níž. Třídu si kód
   může SLOŽIT: js/main.js píše `'rv-duch rv-duch' + i` a generátor
   regionů `t-${o.type}`. Celé slovo `rv-duch1` ani `t-obec` pak
   v repozitáři nestojí, přesto na stránce vznikne. Leaflet dělá totéž
   se svými `.leaflet-popup-*` (`prefix + '-content-wrapper'`).
   Taková pravidla jsou ŽIVÁ a smazat se nesmí.

   Každá výjimka proto musí mít napsané, KDO tu třídu skládá. A platí
   to obojím směrem: kdyby výjimka přestala být potřeba (třída se
   objeví celá, nebo pravidlo zmizí), kontrola to ohlásí — jinak by
   tabulka tiše rostla a přestala být k něčemu.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rozparsuj, castiSelektoru, muzeZabrat } from './rozdel-styly.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Tokeny, které kód skládá z částí, takže je statické hledání nevidí.
   Klíč je token ze selektoru, hodnota KDO ho skládá. */
const SKLADANE = {
  '.rv-duch1': "js/main.js: '<div class=\"rv-duch rv-duch' + i + '\">' — duchové pod kartou rychlého výběru",
  '.rv-duch2': "js/main.js: totéž, druhý duch",
  '.t-obec': 'scripts/generate-region-pages.mjs: `<span class="okr-badge t-${o.type}">` — druh nabídky; '
    + 'typ „obec" v datech dnes není, ale přijde-li, odznak musí mít barvu',
  '.leaflet-popup-content': 'vendor/leaflet/leaflet.js skládá své třídy jako prefix + \'-content\'',
  '.leaflet-popup-content-wrapper': 'vendor/leaflet/leaflet.js, totéž',
  '.leaflet-popup-tip': 'vendor/leaflet/leaflet.js, totéž',
  '.leaflet-marker-pane': 'vendor/leaflet/leaflet.js skládá jména vrstev jako \'leaflet-\' + jmeno + \'-pane\'',
  '.leaflet-marker-icon': 'vendor/leaflet/leaflet.js: v souboru stojí jen \'leaflet-marker-\', zbytek se dolepuje',
};

/* ---- tokeny z celého repozitáře ------------------------------------ */
const tokeny = { tridy: new Set(), idy: new Set(), atributy: new Set(), slova: new Set() };
let souboru = 0;
function chod(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^(\.git|node_modules)$/.test(e.name)) chod(p); continue; }
    if (!/\.(html|m?js|json|md|sql|yml|xml)$/.test(e.name)) continue;
    /* ZKOUŠKY SE NEPOČÍTAJÍ. Třída zmíněná ve zkoušce není použití —
       naopak, bývá to zkouška na to, že ta třída na stránce UŽ NENÍ
       (scripts/test-ceny-hledani.mjs hlídá, že #cen-mapa zmizela).
       A tenhle soubor by se počítal sám: jména ve tabulce SKLADANE
       by si pravidla udržela naživu a kontrola by nikdy nic nenašla. */
    if (/^test-.*\.mjs$/.test(e.name)) continue;
    if (/^styles(\.min)?\.css$|^zaklad\.min\.css$/.test(e.name)) continue;
    let s; try { s = fs.readFileSync(p, 'utf8'); } catch (x) { continue; }
    souboru++;
    if (e.name.endsWith('.html')) {
      for (const m of s.matchAll(/class="([^"]*)"/g)) for (const w of m[1].split(/\s+/)) if (w) tokeny.tridy.add(w);
      for (const m of s.matchAll(/id="([^"]*)"/g)) if (m[1]) tokeny.idy.add(m[1]);
      for (const m of s.matchAll(/\s([a-zA-Z][a-zA-Z0-9-]*)=/g)) tokeny.atributy.add(m[1].toLowerCase());
    }
    for (const m of s.matchAll(/[\w-]+/g)) tokeny.slova.add(m[0]);
  }
}
chod(KOREN);
pravda(`prohledal se repozitář (${souboru} souborů, ${tokeny.slova.size} slov)`,
  souboru > 2000 && tokeny.slova.size > 20000, `${souboru} souborů, ${tokeny.slova.size} slov`);
pravda('a vidí i třídy, které přidává JavaScript (hl-bez-pasu)',
  tokeny.slova.has('hl-bez-pasu'), 'skripty se nenačetly — kontrola by hlásila mrtvé všechno');
pravda('i třídy cizí knihovny (leaflet-container z vendor/)',
  tokeny.slova.has('leaflet-container'), 'vendor/ se nenačetl');

/* ---- co ve stylopisu nemá na čem zabrat ---------------------------- */
const zdroj = fs.readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
const pravidla = rozparsuj(zdroj);
pravda(`stylopis se rozparsoval (${pravidla.length} pravidel)`, pravidla.length > 1500, `jen ${pravidla.length}`);

const mrtve = [], omluvene = new Set();
for (const p of pravidla) {
  const casti = castiSelektoru(p.selektor);
  if (!casti.length || muzeZabrat(casti, tokeny)) continue;
  /* Je mezi potřebnými tokeny aspoň jeden skládaný? Pak je pravidlo živé. */
  let omluva = null;
  for (const { tokeny: t } of casti) for (const x of t) if (SKLADANE[x]) { omluva = x; break; }
  if (omluva) { omluvene.add(omluva); continue; }
  mrtve.push({ sel: p.selektor.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim(), bajtu: p.do - p.od });
}
const bajtu = mrtve.reduce((s, m) => s + m.bajtu, 0);
pravda(`žádné pravidlo nezůstalo bez toho, na čem by zabralo`,
  mrtve.length === 0,
  `${mrtve.length} pravidel (${(bajtu / 1024).toFixed(1)} kB zdroje) nemá v repozitáři nic, na co by platilo:\n      `
  + mrtve.slice(0, 12).map((m) => m.sel.slice(0, 96)).join('\n      ')
  + '\n      → smažte je, nebo (skládá-li tu třídu kód) doplňte do SKLADANE v tomhle testu i s tím, kdo ji skládá');

/* ---- tabulka výjimek nesmí tiše rostnout --------------------------- */
const nepouzite = Object.keys(SKLADANE).filter((t) => !omluvene.has(t));
pravda(`tabulka výjimek je celá potřeba (${omluvene.size} z ${Object.keys(SKLADANE).length})`,
  nepouzite.length === 0,
  `nepoužité: ${nepouzite.join(', ')} — pravidlo pro ně zmizelo, nebo se ta třída už v repozitáři vyskytuje celá; `
  + 'vyhoďte je ze SKLADANE');
const bezDuvodu = Object.entries(SKLADANE).filter(([, d]) => !d || d.length < 20).map(([t]) => t);
pravda('a každá výjimka má napsané, kdo tu třídu skládá',
  bezDuvodu.length === 0, bezDuvodu.join(', '));

console.log('\nMrtvá pravidla ve stylopisu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Mrtvé styly: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
