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
    /* DOKUMENTACE SE NEPOČÍTÁ. Markdown je próza o kódu, ne kód:
       věta v docs/ nebo v CLAUDE.md třídu nepoužívá, jen o ní mluví —
       táž vada jako komentář o pár řádků níž, jen o patro vedle.
       Naměřeno 22. 10.: popis kaskádové pasti v docs/optimalizace.md
       napsal `.leaflet-marker-icon` celé, a tím prohlásil výjimku pro
       tuhle třídu za zbytečnou, ačkoli ji Leaflet pořád skládá za běhu.
       Změřeno před změnou: bez .md nezmrtví ANI JEDNO pravidlo (0)
       a potřeba je všech 8 výjimek místo sedmi. */
    if (!/\.(html|m?js|json|sql|yml|xml)$/.test(e.name)) continue;
    /* ZKOUŠKY SE NEPOČÍTAJÍ. Třída zmíněná ve zkoušce není použití —
       naopak, bývá to zkouška na to, že ta třída na stránce UŽ NENÍ
       (scripts/test-ceny-hledani.mjs hlídá, že #cen-mapa zmizela).
       A tenhle soubor by se počítal sám: jména ve tabulce SKLADANE
       by si pravidla udržela naživu a kontrola by nikdy nic nenašla. */
    if (/^test-.*\.mjs$/.test(e.name)) continue;
    if (/^styles(\.min)?\.css$|^zaklad\.min\.css$/.test(e.name)) continue;
    let s; try { s = fs.readFileSync(p, 'utf8'); } catch (x) { continue; }
    souboru++;
    /* KOMENTÁŘ NENÍ POUŽITÍ. Zkouška hledá slova v celém repozitáři,
       takže třídu udržela naživu i věta, která říkala, že ta třída UŽ
       NENÍ. Naměřeno 19. 10.: `.counters` a `.c-num` (sekce
       s počítadly) držela při životě poznámka v js/main.js, která
       doslova psala „celá sekce s počítadly je pryč".
       ČISTÍ SE PODLE JAZYKA, ne naslepo. První pokus pouštěl na HTML
       i pravidla pro komentáře z JavaScriptu — a protože otevírací
       značka komentáře uvnitř skriptu nebo stylu najde svůj konec
       o kus níž, vymazalo to kus stránky: `.photo-preview`
       i `.add-more` se tím staly „mrtvými", ačkoli v pridat.html
       stojí. (A tenhle komentář ukazuje proč: stačí do něj napsat
       uzavírací značku a skončí dřív, než má.) */
    if (/\.html$/.test(e.name)) {
      s = s.replace(/<!--[\s\S]*?-->/g, ' ');
      /* Komentáře uvnitř vloženého stylu — tam je komentář opravdu
         komentářem. Hledá se jen mezi <style> a </style>. */
      s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/g,
        (blok) => blok.replace(/\/\*[\s\S]*?\*\//g, ' '));
    } else if (/\.m?js$/.test(e.name)) {
      s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    }
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
pravda('a vidí i třídy, které přidává JavaScript (hl-zhasnuta)',
  tokeny.slova.has('hl-zhasnuta'), 'skripty se nenačetly — kontrola by hlásila mrtvé všechno');
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

/* ---- a mrtvé ikony ve spritu --------------------------------------
   Táž vada o patro vedle: stránka si v <svg> nese sadu <symbol>, a když
   se z ní odebere místo, kde se ikona kreslila, symbol zůstane. Nikdo
   si toho nevšimne — je neviditelný, jen se stahuje. Naměřeno 19. 10.:
   po smazání mrtvých odznaků v „Jak to funguje" zbyl ve index.html
   osiřelý `i-click`.
   Hledá se v ručně psaných stránkách a ve skriptech, protože `<use>`
   může dopsat i JavaScript; vygenerované stránky pozemků a okresů se
   počítají jako výskyt taky (nesou týž sprite).

   ODKAZ SE NEHLEDÁ JAKO href="#id", ALE JAKO #id. Od chvíle, kdy sadu
   skládá scripts/ikony.mjs, si část kódu odkaz drží v proměnné
   (IKONY_NASTROJU v js/main.js) a do značkování ho vkládá až za běhu,
   takže řetězec href="#i-karty" v žádném souboru nestojí. Užší vzor
   hlásil pět živých ikon jako mrtvé. Jestli odkaz vede na tvar, který
   v sadě není, hlídá scripts/test-ikony.mjs. */
{
  const rucni = fs.readdirSync(KOREN)
    .filter((f) => f.endsWith('.html') && !/^(pozemek|pozemky)-/.test(f));
  const zdrojeOdkazu = [];
  for (const f of rucni) zdrojeOdkazu.push(fs.readFileSync(path.join(KOREN, f), 'utf8'));
  for (const d of ['js', 'scripts']) {
    for (const f of fs.readdirSync(path.join(KOREN, d))) {
      if (!/\.(m?js)$/.test(f) || /^test-/.test(f)) continue;
      zdrojeOdkazu.push(fs.readFileSync(path.join(KOREN, d, f), 'utf8'));
    }
  }
  const vse = zdrojeOdkazu.join('\n');
  const symboly = [];
  for (const f of rucni) {
    const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
    for (const m of h.matchAll(/<symbol[^>]*\sid="([^"]+)"/g)) symboly.push({ f, id: m[1] });
  }
  pravda(`je co měřit — ikony ve spritu (${symboly.length})`, symboly.length >= 10,
    `nalezeno ${symboly.length} symbolů`);
  const osirele = symboly.filter((x) => !new RegExp('#' + x.id + '(?![a-z0-9-])').test(vse));
  pravda('žádná ikona ve spritu není osiřelá (nikde se nekreslí)',
    osirele.length === 0,
    osirele.map((x) => `${x.f}: #${x.id}`).join(', ') + ' — smažte symbol, nebo ikonu někde použijte');
}

/* --- PŘEBITÉ DEKLARACE ----------------------------------------------
   Druhý druh mrtvého kódu. Pravidlo má na čem zabrat, ale jeho
   deklarace stejně nic neudělá: dál v souboru stojí TÝŽ selektor
   v TÉMŽE mediálním kontextu a přebije ji. Pozdější vyhrává, dřívější
   je řádek, který už jen mate čtenáře.

   Naměřeno 27. 10.: 173 takových deklarací u 70 selektorů; 22 pravidel
   bylo mrtvých celých (.kraj-item:hover, .sources, footer, .step…).
   Jedno z nich mělo nad sebou komentář vysvětlující, proč má lišta nad
   výpisem odsazení 20 px — lišta ho nikdy neměla, o dvě pravidla níž
   stálo jiné číslo. Komentář popisoval úmysl, kód dělal něco jiného
   a poznat se to dalo jen měřením v prohlížeči.

   Že úklid nic nezměnil, se dokázalo otiskem vypočtených stylů:
   25 825 prvků na osmnácti typech stránek ve čtyřech šířkách, před
   úklidem a po něm, rozdílů nula. (Postup je v docs/optimalizace.md
   u položky 178; šumem jsou jen úvodní stránka, která střídá nabídky,
   a kolečko „čekám" s běžící animací.)

   CO SE NEPOČÍTÁ ZA MRTVÉ:
     · fallback v TÉMŽE bloku (height:100vh; height:100dvh),
     · dřívější deklarace s !important proti pozdější bez něj,
     · vlastní vlastnosti (--token) — ty se čtou proměnnou, ne kaskádou.
   Porovnává se DOSLOVNÝ zápis selektoru, takže „.a,.b" a „.b,.a" jsou
   dvě různé věci: kontrola chybuje jen směrem k přehlédnutí, nikdy
   neohlásí planý poplach. */
{
  const css = fs.readFileSync(path.join(KOREN, 'css/styles.css'), 'utf8');
  const bez = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const radky = []; let r = 1;
  for (let i = 0; i < bez.length; i++) { radky[i] = r; if (bez[i] === '\n') r++; }
  const bloky = [], stack = [], media = [];
  let zacHlav = 0;
  for (let i = 0; i < bez.length; i++) {
    const ch = bez[i];
    if (ch === '{') {
      const hlav = bez.slice(zacHlav, i).trim().replace(/\s+/g, ' ');
      if (hlav.startsWith('@')) { media.push(hlav); stack.push({ typ: 'media' }); }
      else stack.push({ typ: 'sel', hlav, otev: i });
      zacHlav = i + 1;
    } else if (ch === '}') {
      const t = stack.pop();
      if (t && t.typ === 'media') media.pop();
      else if (t) {
        const deks = [];
        bez.slice(t.otev + 1, i).split(';').forEach((d) => {
          const dd = d.trim(), k = dd.indexOf(':');
          if (k <= 0) return;
          const prop = dd.slice(0, k).trim();
          if (!prop || prop.startsWith('--') || /[{}]/.test(prop)) return;
          deks.push({ prop, dulezite: dd.includes('!important') });
        });
        bloky.push({ media: media.join(' '), sel: t.hlav, radek: radky[t.otev], deks });
      }
      zacHlav = i + 1;
    }
  }
  const posledni = new Map();
  bloky.forEach((b, bi) => b.deks.forEach((d, di) =>
    posledni.set(b.media + '||' + b.sel + '||' + d.prop, { bi, di, dulezite: d.dulezite })));
  const prebite = [];
  bloky.forEach((b, bi) => b.deks.forEach((d, di) => {
    const p = posledni.get(b.media + '||' + b.sel + '||' + d.prop);
    if (!p || p.bi === bi) return;
    if (d.dulezite && !p.dulezite) return;
    prebite.push(`${b.sel}${b.media ? ' ' + b.media : ''} — ${d.prop} z řádku ${b.radek}`
      + ` přebíjí řádek ${bloky[p.bi].radek}`);
  }));
  // PŘEDPOKLAD: bez rozparsovaných bloků by kontrola níž prošla naprázdno
  pravda(`stylopis se rozebral na deklarace (${bloky.length} bloků)`,
    bloky.length > 1500, `jen ${bloky.length} bloků`);
  pravda('žádná deklarace není přebitá týmž selektorem o kus níž',
    prebite.length === 0,
    prebite.slice(0, 8).join('\n      ') + (prebite.length > 8 ? `\n      … a dalších ${prebite.length - 8}` : ''));
}

console.log('\nMrtvá pravidla ve stylopisu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Mrtvé styly: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
