// Hlídač vizuálního jazyka (předloha.html).
//
// Spuštění: node scripts/test-predloha.mjs
//
// Systém se nerozpadne naráz — rozpadne se po jednom stínu. Někdo potřebuje
// kartu „o kousek výš", napíše si vlastní hodnotu, a za půl roku je jich
// zase sedmdesát a web je „suchý". Tenhle test to nedovolí: hloubka i tvar
// se musí brát z paletky.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Komentáře pryč. Bez tohohle test hlásí vlastní vysvětlivky: v komentáři
// se běžně píše „border-radius:14px", a hlídač by to bral jako prohřešek.
const ocisti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

// Sebekontrola: kdyby se odstraňovač komentářů rozbil, test by od té chvíle
// mlčel a nikdo by si toho nevšiml. Tohle ho přistihne hned.
{
  const vzorek = '/* box-shadow:0 9px 19px rgba(0,0,0,.5) v komentáři */\n.a{color:red;}';
  if (ocisti(vzorek).includes('box-shadow')) {
    console.error('::error::Odstraňovač komentářů nefunguje — test by hlásil vlastní vysvětlivky.');
    process.exit(1);
  }
}

const css = ocisti(readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8'));

let chyb = 0;
const rest = [];
function hlas(nadpis, seznam, rada) {
  if (!seznam.length) return;
  chyb += seznam.length;
  rest.push(`\n  ✕ ${nadpis} (${seznam.length}×)\n      ${rada}`);
  seznam.slice(0, 6).forEach((x) => rest.push('      · ' + x));
  if (seznam.length > 6) rest.push(`      · …a dalších ${seznam.length - 6}`);
}

/* ---------- 0. komentáře se musí párovat ----------
   Tohle je první kontrola schválně: když je rozbitý komentář, mlčí
   i všechny ostatní, protože pravidlo, o které jde, do stylů vůbec
   nedoteče — a v souboru přitom vypadá naprosto normálně.

   Stalo se to u .md-verdict.good: vysvětlení nad ním bylo rozdělené na
   dva komentáře a mezi nimi zůstala volná věta s koncovou značkou.
   Prohlížeč takovou větu bere jako rozbité pravidlo a při zotavení
   spolkne i řádek za ní — „Výhodná cena" tak neměla zelený podklad
   karty. Přečtením CSS se to nepozná; jedině spočítáním značek.

   (Při opravě jsem tutéž chybu udělal znovu: koncovou značku jsem
   napsal do vysvětlení jako příklad. Proto se tady o ní mluví opisem
   a proto tahle kontrola existuje.)

   CO TOHLE NECHYTÁ, ať se na to nikdo nespoléhá: navíc otevřený
   komentář. Komentáře v CSS se nevnořují, takže přebývající otevírací
   značku zavře nejbližší koncová — a ta patřila jinému komentáři.
   Párování se tím samo srovná a značky zůstanou v rovnováze, jen se
   mezitím zakomentuje kus pravidel. Počítáním značek to poznat nejde
   a porovnání s tím, co načte prohlížeč, taky ne: ubude to na obou
   stranách stejně. Na tom, aby konkrétní pravidla opravdu došla až
   do stylů, stojí scripts/test-verdikt.mjs — ten se ptá prohlížeče. */
{
  const surove = readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
  const OTEVRI = '/' + '*', ZAVRI = '*' + '/';
  const spatne = [];
  let i = 0, uvnitr = false, radek = 1, zacatek = 0;
  while (i < surove.length) {
    if (surove[i] === '\n') radek++;
    const jeO = surove.startsWith(OTEVRI, i), jeZ = surove.startsWith(ZAVRI, i);
    if (!uvnitr && jeO) { uvnitr = true; zacatek = radek; i += 2; continue; }
    if (!uvnitr && jeZ) { spatne.push(`řádek ${radek}: koncová značka komentáře, ale žádný otevřený`); i += 2; continue; }
    if (uvnitr && jeZ) { uvnitr = false; i += 2; continue; }
    i++;
  }
  if (uvnitr) spatne.push(`komentář otevřený na řádku ${zacatek} se nikde nezavírá`);
  hlas('komentář v css/styles.css se nepáruje', spatne,
    'prohlížeč spolkne i pravidlo za tím místem, a v souboru to vypadá v pořádku');
}

/* ---------- 0b. stavové varianty nesmí zapomenout na proměnnou ----------
   Vzor, na kterém se rozbil verdikt o ceně: základní třída si zavede
   vlastní proměnnou (.md-verdict{--vc:…}), potomek z ní bere barvu
   (.mv-badge{background:var(--vc)}) a stavové varianty ji přepisují —
   ale jen NĚKTERÉ. „Vyšší cena" tak nosila zelený odznak, protože
   .md-verdict.bad proměnnou nenastavovala a zůstala výchozí zeleň.

   Spadne to do očí jedině na obrazovce, a ani tam ne hned: barva je
   správná u tří stavů ze čtyř. Proto se to hlídá tady.

   Kdyby někdy byla varianta bez vlastní hodnoty správně (dva stavy mají
   záměrně tutéž barvu), patří k ní výjimka i s důvodem — ne zrušení
   téhle kontroly. */
{
  const surove = readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
  const bezKom = surove.replace(/\/\*[\s\S]*?\*\//g, '');
  const pravidla = [...bezKom.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].replace(/\s+/g, ' ').trim(), telo: m[2] }));
  const zaklady = {};
  for (const p of pravidla) {
    if (!/^\.[\w-]+$/.test(p.sel)) continue;                 // jen jediná třída
    const vars = [...p.telo.matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1]);
    if (vars.length) zaklady[p.sel] = vars;
  }
  const zapomenute = [];
  for (const [zak, vars] of Object.entries(zaklady)) {
    const varianty = pravidla.filter((p) => new RegExp('^' + zak.replace('.', '\\.') + '\\.[\\w-]+$').test(p.sel));
    if (varianty.length < 2) continue;      // jeden stav není „některé"
    for (const v of vars) {
      const maji = varianty.filter((p) => p.telo.includes(v + ':'));
      if (maji.length && maji.length < varianty.length) {
        zapomenute.push(`${zak} má ${v}; z ${varianty.length} stavů ji nastavuje ${maji.length} — bez ní: ` +
          varianty.filter((p) => !p.telo.includes(v + ':')).map((p) => p.sel).join(', '));
      }
    }
  }
  hlas('stavová varianta zapomíná na proměnnou základu', zapomenute,
    'zůstane jí výchozí hodnota — u verdiktu o ceně to znamenalo zelený odznak u „Vyšší cena"');
}

/* ---------- 1. hloubka ---------- */
// Vlastní stín se pozná podle rozptylu. Obrysy (0 0 0 Npx), vnitřní stíny
// a záře podle barvy prvku mají jiný účel a do škály nepatří.
const vrstvy = (v) => v.split(/,(?![^()]*\))/);
const cisla = (c) => {
  const s = c.replace(/(?<![\d.\w-])0(?![\d.a-z%])/g, '0px');
  return (s.match(/-?\d+(?:\.\d+)?px/g) || []).map(parseFloat);
};
const vlastni = [];
for (const m of css.matchAll(/box-shadow:\s*([^;}]+)/g)) {
  const v = m[1].trim();
  if (v.startsWith('var(') || v === 'none' || v.includes('inset') || v.includes('currentColor')) continue;
  const rozptyl = Math.max(0, ...vrstvy(v).map((c) => { const n = cisla(c); return n.length >= 3 ? Math.abs(n[2]) : 0; }));
  if (rozptyl >= 6) vlastni.push(v.slice(0, 64));
}
hlas('Vlastní stín mimo paletku', vlastni,
  'Použijte var(--e1) až var(--e3), --e3-up pro panel zdola, --glow pro značkovou záři.');

/* ---------- 2. tvary ---------- */
// 2 a 3 px jsou vlasové proužky, 50 % a 999 px jsou kruhy — ty nejsou „tvar karty".
// „inherit" není nový tvar — prvek jen přebírá zaoblení rodiče, takže
// se škále nevymyká. Ostatní hodnoty musí být z paletky.
const POVOLENA = new Set(['2px', '3px', '50%', '999px', 'inherit']);
const tvary = [];
for (const m of css.matchAll(/border-radius:\s*([^;}]+)/g)) {
  const v = m[1].trim();
  if (v.includes('var(')) continue;               // z paletky (i rohový zápis)
  if (POVOLENA.has(v)) continue;
  // Rohový zápis smí mít jen nuly a vlasové hodnoty; cokoli většího patří
  // do paletky, jinak by se škála obešla zadními vrátky.
  if (v.split(/\s+/).every((x) => x === '0' || POVOLENA.has(x))) continue;
  tvary.push(v.slice(0, 40));
}
hlas('Zaoblení mimo paletku', tvary,
  'Použijte var(--r-xs) … var(--r-lg), nebo var(--r-pill) pro štítky.');

/* ---------- 3. paletka existuje ---------- */
const chybi = ['--e0','--e1','--e2','--e3','--e3-up','--glow','--glow-lg',
               '--r-xs','--r-sm','--r-md','--r-lg','--r-pill','--accent-warm']
  .filter((t) => !css.includes(t + ':'));
hlas('Chybí proměnná z paletky', chybi, 'Doplňte ji v :root v css/styles.css.');

/* ---------- 3b. každá použitá proměnná je i nadeklarovaná ----------
   Překlep v názvu proměnné se na webu NEPOZNÁ. `color: var(--text-mute)`
   u nedefinované proměnné není chyba, kterou by prohlížeč nahlásil —
   deklarace se jen zahodí a prvek zdědí barvu rodiče. Vypadá to skoro
   správně a nikdo si toho nevšimne. Takhle tu tiše žily tři řádky
   (čerstvost dat a oddělovač obcí na okresních stránkách), které měly
   být tlumené a nebyly.
   Proto: co se v šabloně použije, musí být v šabloně i nadeklarované.
   Proměnné bez výchozí hodnoty (druhý argument var()) se počítají —
   `var(--x, 0)` má záchranu a chybou není. */
{
  /* Proměnná se dá nastavit i zvenčí — `style="--w:42%"` ze skriptu. Taková
     v šabloně nadeklarovaná být nemůže a chybou není, tak se dohledá tam,
     odkud se vážně nastavuje. */
  const zvenku = ['js/main.js', 'js/pozemek.js', 'js/upozorneni.js', 'js/centrum.js']
    .filter((f) => existsSync(path.join(ROOT, f)))
    .map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const deklarovane = new Set([
    ...[...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    ...[...zvenku.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  ]);
  const nedeklarovane = [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)]
    .map((m) => m[1])
    .filter((t, i, a) => a.indexOf(t) === i)
    .filter((t) => !deklarovane.has(t));
  hlas('Použitá proměnná, která nikde není nadeklarovaná', nedeklarovane,
    'Prohlížeč takovou deklaraci tiše zahodí a prvek zdědí barvu rodiče — chyba se nikde neprojeví.');
}

/* ---------- 4. předloha odpovídá skutečnosti ---------- */
// Vzorník, který ukazuje něco jiného než web, je horší než žádný.
const predloha = ocisti(readFileSync(path.join(ROOT, 'predloha.html'), 'utf8'));
const neznama = [...predloha.matchAll(/'(--[a-z0-9-]+)'/g)].map((m) => m[1])
  .filter((t, i, a) => a.indexOf(t) === i)
  .filter((t) => !css.includes(t + ':'));
hlas('Předloha ukazuje proměnnou, která v šabloně není', neznama,
  'Buď ji doplňte do :root, nebo ji z předlohy odeberte.');

/* ---------- přebarvení značkových tokenů ----------
   Barva se na stránce dá „opravit" dvěma způsoby: ztmavit ji, nebo jí
   změnit odstín. To druhé je ale změna značky, ne úprava kontrastu —
   a přesně tak se na plochu .add-hero (úvod „Přidat pozemek" i „Hlídání
   pozemků") dostala tmavě MODRÁ #22368F. Důvod byl poctivý: na tom
   nejsytějším místě plochy klesne běžný akcent #276646 na 4,2 : 1.
   Jenže totéž umí i tmavší odstín téže zelené — #1F5138 dává 5,6 : 1
   a značka zůstane značkou.
   Hlídá se proto ODSTÍN: kdo token --copper-bright někde přepíše, smí
   ho ztmavit nebo zesvětlit, ale ne přebarvit. Mez 30° je velkorysá;
   modrá byla 79° od zelené.
   Značka má odstíny DVA, ne jeden: zelenou a k ní teplou měď, která na
   tmavém pásu zelenou střídá (--accent-warm-bright). Kontrola proto
   měří vzdálenost k tomu bližšímu z nich — jinak by hlásila #E4C089,
   tedy přesně tu měď, kvůli které ta druhá rodina existuje. */
{
  const hue = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.001) return null;                        // šedá nemá odstín
    let h;
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    return (h + 360) % 360;
  };
  const odchylka = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const vsechny = [...css.matchAll(/--copper-bright:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1]);
  const med = (css.match(/--accent-warm-bright:\s*(#[0-9a-fA-F]{6})/) || [])[1];
  const rodiny = [vsechny[0], med].filter(Boolean).map(hue).filter((h) => h != null);
  const zaklad = rodiny.length ? rodiny[0] : null;
  const jine = [];
  for (const barva of vsechny.slice(1)) {
    const h = hue(barva);
    if (h == null || !rodiny.length) continue;
    const d = Math.round(Math.min.apply(null, rodiny.map((z) => odchylka(h, z))));
    if (d > 30) jine.push(`--copper-bright:${barva} je o ${d}° mimo obě značkové rodiny (${vsechny[0]}, ${med || '?'})`);
  }
  hlas('Značkový token je někde přebarvený na jiný odstín', jine,
    'Kontrast se zvedá ztmavením téže barvy, ne změnou odstínu.');
  if (zaklad == null) {
    chyb++;
    rest.push('\n  ✕ Token --copper-bright se v šabloně nenašel — kontrola odstínu nic neměří.');
  }
}

/* ---------- výsledek ---------- */
const stinu = (css.match(/box-shadow:/g) || []).length;
const zTokenu = (css.match(/box-shadow:\s*var\(/g) || []).length;
console.log(`\nVizuální jazyk: ${stinu} stínů v šabloně, z toho ${zTokenu} z paletky`);
if (chyb) {
  console.log(rest.join('\n'));
  console.error(`\n::error::${chyb} odchylek od předlohy (predloha.html).`);
  process.exit(1);
}
console.log('Hloubka i tvary se berou z paletky.\n');
