// Hlídač vizuálního jazyka (předloha.html).
//
// Spuštění: node scripts/test-predloha.mjs
//
// Systém se nerozpadne naráz — rozpadne se po jednom stínu. Někdo potřebuje
// kartu „o kousek výš", napíše si vlastní hodnotu, a za půl roku je jich
// zase sedmdesát a web je „suchý". Tenhle test to nedovolí: hloubka i tvar
// se musí brát z paletky.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

// Stupnice neplatí jen v šabloně. Stránky aplikace si vlastní podobu píšou
// v hlavičce, do <style>, a hlídač tam dosud nekoukal — právě proto se
// rytmus rozjel nejvíc tam: jedenáct různých zaoblení a jednadvacet
// vlastních stínů, které nikdo neviděl, protože test čte styles.css.
// Vygenerované stránky (pozemek-*, okresy, kraje) se vynechávají: jejich
// hlavička je kopie šablony, takže by se každá odchylka počítala dvatisíckrát.
/* Vygenerovaná stránka se NEPOZNÁ PODLE JMÉNA. Filtr `pozemek-*` vypadá
   spolehlivě, jenže `pozemek-od-obce.html` je ručně psaný rádce — a takhle
   mi z hlídače vypadl. Pozná se podle obsahu: kopie šablony pozemku nesou
   třídu pz-media, sama šablona (pozemek.html) se hlídat MÁ. */
const RUCNI = (f) => f.endsWith('.html') &&
  !f.startsWith('pozemky-okres-') && !f.endsWith('-kraj.html');
/* Pozor na to, JAK se pozná, že stránka paletku vidí. Nejdřív tu stálo
   prosté `includes('css/styles.css')` — jenže ta slova se na stránce
   objevila i v mé vlastní vysvětlivce („tahle stránka si NENAČÍTÁ
   css/styles.css"), takže kontrola prohlásila opak toho, co bylo pravda,
   a mlčela. Hledá se tedy skutečný odkaz, ne slovo v textu. */
/* A POZOR NA JMÉNO SOUBORU. Stránky načítají očištěnou kopii
   css/styles.min.css (viz scripts/minifikace.mjs), ne zdroj. Když se
   očištění zavedlo, tahle kontrola hlásila 624 odchylek: podle jména
   usoudila, že paletku nevidí ŽÁDNÁ stránka. Platí obě jména —
   rozhoduje, že stránka stylopis vůbec načítá. */
const MA_PALETKU = (html) => /<link[^>]+href="[^"]*css\/styles(?:\.min)?\.css/.test(html);
const zdroje = [{ jmeno: 'css/styles.css', css, maPaletku: true }];
for (const f of readdirSync(ROOT).filter(RUCNI).sort()) {
  const syrove = readFileSync(path.join(ROOT, f), 'utf8');
  if (f !== 'pozemek.html' && syrove.includes('pz-media')) continue;   // kopie šablony
  const bloky = [...syrove.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  if (bloky.length) zdroje.push({ jmeno: f, css: ocisti(bloky.join('\n')),
    maPaletku: MA_PALETKU(syrove) });
}

// Kdyby se hledání <style> bloků rozbilo, test by od té chvíle hlídal jen
// šablonu — a mlčel by přesně o tom, kvůli čemu ho sem píšu.
if (zdroje.length < 6) {
  console.error(`::error::Ze stránek se nenačetly styly (${zdroje.length} zdrojů) — hlídač by hlídal jen šablonu.`);
  process.exit(1);
}

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

/* Stránka bez css/styles.css paletku NEVIDÍ (404 a diagnostika se musí
   zobrazit i při rozbitém stylu). Stupnice pro ni platí dál — jen se píše
   číslem, ne tokenem. Čísla se proto berou ze stejné paletky, aby se obě
   podoby nemohly rozejít. */
const hodnotaTokenu = (jm) => (css.match(new RegExp('\\' + jm + '\\s*:\\s*([^;]+);')) || [])[1]?.trim();
const ZEBRIK_TVARU = new Set(['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill']
  .map(hodnotaTokenu).filter(Boolean));
const srovnej = (s) => String(s).replace(/\s+/g, ' ').trim();
const ZEBRIK_HLOUBKY = new Set(['--e0', '--e1', '--e2', '--e3', '--e3-up', '--glow', '--glow-lg']
  .map(hodnotaTokenu).filter(Boolean).map(srovnej));
/* Pojistka: kdyby se paletka přejmenovala, obě množiny by zůstaly prázdné
   a kontrola by od té chvíle povolovala všechno na samostatných stránkách. */
if (ZEBRIK_TVARU.size < 4 || ZEBRIK_HLOUBKY.size < 4) {
  console.error('::error::Z paletky se nepodařilo přečíst stupnici tvarů a hloubky — kontrola by mlčela.');
  process.exit(1);
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
for (const z of zdroje) {
  for (const m of z.css.matchAll(/box-shadow:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (v.startsWith('var(') || v === 'none' || v.includes('inset') || v.includes('currentColor')) continue;
    if (!z.maPaletku && ZEBRIK_HLOUBKY.has(srovnej(v))) continue;   // číslem, ale ze stupnice
    const rozptyl = Math.max(0, ...vrstvy(v).map((c) => { const n = cisla(c); return n.length >= 3 ? Math.abs(n[2]) : 0; }));
    if (rozptyl >= 6) vlastni.push(z.jmeno + ': ' + v.slice(0, 64));
  }
}
hlas('Vlastní stín mimo paletku', vlastni,
  'Použijte var(--e1) až var(--e3), --e3-up pro panel zdola, --glow pro značkovou záři.');

/* ---------- 1b. v předpisu @media nesmí být proměnná ----------
   Zápis `max-width:` stojí i v PODMÍNCE responzivního dotazu. Když jsem
   srovnával šířky na žebřík, přepsal se mi i tam: z
   `@media (max-width:1040px)` se stalo `@media (max-width:var(--m-siroky))`.
   To je neplatný dotaz, takže CELÝ blok pravidel přestal platit — a padlo
   s ním 35 bodů zlomu najednou. Na stránce to nikde nesvítí červeně:
   zápatí jen místo dvou sloupců ukázalo pět a mapa na mobilu se rozsypala.
   Proměnná v podmínce @media nefunguje ANI ZÁMĚRNĚ (hodnota by musela být
   známá před výpočtem stylů), takže tu není co povolovat. */
{
  const vmedia = [];
  for (const z of zdroje) {
    for (const m of z.css.matchAll(/@media([^{]*)\{/g)) {
      if (/var\(/.test(m[1])) vmedia.push(z.jmeno + ': @media' + m[1].trim().slice(0, 50));
    }
  }
  hlas('Proměnná v podmínce @media', vmedia,
    'Dotaz je neplatný a celý blok se zahodí. Napište hodnotu číslem.');
}

/* ---------- 1c. samostatná stránka nesmí sahat do paletky ----------
   404 si schválně NENAČÍTÁ css/styles.css: má se zobrazit i tehdy, když
   web nejede. Dosadil jsem do ní var(--m-karta) a proměnná byla
   nedefinovaná — deklarace se zahodila a karta se roztáhla z 498 px na
   976. Prohlížeč na to neupozorní ničím. */
{
  const osirele = [];
  for (const z of zdroje) {
    if (z.jmeno === 'css/styles.css') continue;
    const cely = readFileSync(path.join(ROOT, z.jmeno), 'utf8');
    if (MA_PALETKU(cely)) continue;                       // paletku má
    const vlastni = new Set([...z.css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    for (const m of z.css.matchAll(/var\(\s*(--[\w-]+)\s*(,|\))/g)) {
      if (m[2] === ',') continue;                            // má záchranu
      if (!vlastni.has(m[1])) osirele.push(z.jmeno + ': var(' + m[1] + ')');
    }
  }
  hlas('Samostatná stránka použila proměnnou z paletky', osirele,
    'Stránka bez css/styles.css paletku nevidí — napište hodnotu, nebo doplňte var(--x, záchrana).');
}

/* ---------- 1d. táž vlastnost dvakrát v jednom pravidle ----------
   Ten pozdější zápis tiše vyhraje a ten dřívější jako by tam nebyl.
   Takhle se u .opp-hot neprojevil token pro proklad: pravidlo mělo
   letter-spacing dvakrát, token stál první a 0.02em za ním. V souboru
   to vypadá normálně a prohlížeč nic nehlásí.
   VÝJIMKA: dvojice je někdy záměr — `height:76vh; height:76dvh` je
   záchrana pro prohlížeč, který novější jednotku neumí. Taková dvojice
   se nepočítá, ale jen když se liší právě tou novější jednotkou. */
{
  const ZACHRANA = /(dvh|svh|lvh|dvw|svw|lvw|color-mix|oklch|oklab|clamp)\(|\d(dvh|svh|lvh|dvw|svw|lvw)\b/;
  const dvojite = [];
  for (const z of zdroje) {
    for (const m of z.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      if (sel.startsWith('@')) continue;
      const vlast = {};
      for (const d of m[2].split(';')) {
        const i = d.indexOf(':');
        if (i < 1) continue;
        const v = d.slice(0, i).trim().toLowerCase();
        if (!/^[a-z-]+$/.test(v)) continue;
        (vlast[v] = vlast[v] || []).push(d.slice(i + 1).trim());
      }
      for (const [v, hodnoty] of Object.entries(vlast)) {
        if (hodnoty.length < 2) continue;
        /* Záchrana pro starší prohlížeč: pozdější zápis nese novější
           jednotku nebo funkci, dřívější ne. */
        if (hodnoty.slice(1).every((h) => ZACHRANA.test(h)) && !ZACHRANA.test(hodnoty[0])) continue;
        dvojite.push(`${z.jmeno}: ${sel.slice(0, 46)} — ${v} ×${hodnoty.length}`);
      }
    }
  }
  hlas('Táž vlastnost dvakrát v jednom pravidle', dvojite,
    'Ten pozdější zápis tiše vyhraje. Nechte jeden, nebo oddělte pravidla.');
}

/* ---------- 1e. transition:all ----------
   Web má zvyk vypisovat, co se animuje. Jediná výjimka (.filter-chip)
   měla následek: `all` animuje i OBRYS, takže prstenec po stisku
   tabulátoru nenaskočil, ale dojížděl — a kdo prochází web klávesnicí
   rychle, nevidí, kde stojí. `all` navíc animuje i to, co teprve někdo
   v budoucnu do pravidla dopíše. */
{
  const vsechno = [];
  for (const z of zdroje) {
    for (const m of z.css.matchAll(/transition:\s*all\b[^;}]*/g)) {
      vsechno.push(z.jmeno + ': ' + m[0].slice(0, 54));
    }
  }
  hlas('transition:all', vsechno,
    'Vypište vlastnosti. `all` animuje i obrys zaostření a cokoli, co se do pravidla přidá později.');
}

/* ---------- 2. tvary ---------- */
// 2 a 3 px jsou vlasové proužky, 50 % a 999 px jsou kruhy — ty nejsou „tvar karty".
// „inherit" není nový tvar — prvek jen přebírá zaoblení rodiče, takže
// se škále nevymyká. Ostatní hodnoty musí být z paletky.
const POVOLENA = new Set(['2px', '3px', '50%', '999px', 'inherit']);
const tvary = [];
for (const z of zdroje) {
  for (const m of z.css.matchAll(/border-radius:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (v.includes('var(')) continue;               // z paletky (i rohový zápis)
    if (POVOLENA.has(v)) continue;
    if (!z.maPaletku && ZEBRIK_TVARU.has(v)) continue;   // číslem, ale ze stupnice
    // Rohový zápis smí mít jen nuly a vlasové hodnoty; cokoli většího patří
    // do paletky, jinak by se škála obešla zadními vrátky.
    if (v.split(/\s+/).every((x) => x === '0' || POVOLENA.has(x))) continue;
    tvary.push(z.jmeno + ': ' + v.slice(0, 40));
  }
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
  /* Totéž platí pro styly psané v hlavičce stránky, a tam to bolí stejně:
     na upozorněních se PĚT ploch odkazovalo na var(--card) — proměnnou,
     která v paletce vůbec není (žije jen ve vlastním :root diagnostiky).
     Karty, vstupní pole i prstenec u tečky tím zůstaly bez podkladu
     a nikdo si toho roky nevšiml. Stránka smí použít i to, co si sama
     nadeklaruje. */
  const nedeklarovane = [];
  for (const z of zdroje) {
    const vlastni = new Set([...z.css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const m of z.css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
      if (deklarovane.has(m[1]) || vlastni.has(m[1])) continue;
      const zaznam = (z.jmeno === 'css/styles.css' ? '' : z.jmeno + ': ') + m[1];
      if (!nedeklarovane.includes(zaznam)) nedeklarovane.push(zaznam);
    }
  }
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
let stinu = 0, zTokenu = 0;
for (const z of zdroje) {
  stinu += (z.css.match(/box-shadow:/g) || []).length;
  zTokenu += (z.css.match(/box-shadow:\s*var\(/g) || []).length;
}
console.log(`\nVizuální jazyk: ${stinu} stínů ve ${zdroje.length} zdrojích, z toho ${zTokenu} z paletky`);
if (chyb) {
  console.log(rest.join('\n'));
  console.error(`\n::error::${chyb} odchylek od předlohy (predloha.html).`);
  process.exit(1);
}
console.log('Hloubka i tvary se berou z paletky.\n');
