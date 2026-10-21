// Test: jeden styl — pojmenovaná hodnota místo opsaného čísla.
//
// Spuštění: node scripts/test-jeden-styl.mjs   (nepotřebuje prohlížeč)
//
// O velikosti h1 rozhodovalo patnáct pravidel na pěti místech předlohy.
// Vyšlo z toho, že tentýž prvek měl na široké obrazovce:
//     titulní          92 px
//     návod            54 px
//     kraj / okres     50 px
//     detail pozemku   50 px
//     nástroj          28 px
// a k tomu návod i detail měnily velikost SKOKEM přes @media, kdežto
// krajská stránka hned vedle plynula. Rozdíl 50 a 54 px nebylo rozhodnutí,
// byla to nehoda — a právě z takových nehod je web „rozházený".
//
// Teď jsou tři stupně a každý má důvod:
//     --h1-stranka   obsah (2 109 stránek)
//     --h1-domu      titulní, jediný plakát na webu
//     --h1-nastroj   nástroje, kde nadpis nemá křičet
//
// Pravidlo: každé pravidlo, které určuje velikost h1, bere hodnotu
// z některého z těch tří stupňů — nebo stojí v seznamu výjimek s důvodem.
import { readFileSync, readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const zdroj = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const css = zdroj.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const STUPNE = ['--h1-stranka', '--h1-domu', '--h1-nastroj'];

// Výjimky: pravidlo, které velikost h1 mění, ale stupeň nést nemůže.
// Klíč je selektor, hodnota důvod. Bez důvodu tu nemá co dělat.
/* Dvě výjimky tu stály pro .hero-map .hero-head h1 a .hero-head h1 —
   plakát nad mapou na titulní straně. Ten blok ze stránky zmizel
   (uvítací blok zrušen na přání majitele) a .hero-head nezůstalo
   v žádném HTML ani skriptu; pravidla pro něj jsou dnes smazaná.
   Prázdná tabulka je v pořádku: každé pravidlo, které velikost h1
   mění, má dnes nést pojmenovaný stupeň. */
const VYJIMKY = {};

// --- Projdi předlohu a najdi KAŽDÉ pravidlo s font-size u h1 ----------
// Čte se po znacích, protože @media se zavírají a „poslední @media nad
// řádkem" o zanoření nic neříká — měření, které to nehlídalo, u jednoho
// pravidla ohlásilo @media, v němž vůbec nestálo.
const radky = css.split('\n');
const zasobnik = [];
let hlava = '';
const nalezy = [];
for (let i = 0; i < radky.length; i++) {
  const r = radky[i];
  for (const c of r) {
    if (c === '{') { zasobnik.push(hlava.trim()); hlava = ''; }
    else if (c === '}') { zasobnik.pop(); hlava = ''; }
    else hlava += c;
  }
  const fsm = r.match(/font-size\s*:\s*([^;}]+)/);
  if (!fsm) continue;
  const vRadku = r.match(/^\s*([^{@}]+?)\s*\{[^}]*font-size/);
  const sel = vRadku ? vRadku[1].trim()
    : [...zasobnik].reverse().find((x) => x && !x.startsWith('@')) || '';
  if (!/(^|[\s,>+~])h1\b/.test(sel)) continue;
  nalezy.push({ radek: i + 1, sel, hodnota: fsm[1].trim(),
                media: zasobnik.filter((x) => x.startsWith('@media')) });
}

// --- Předpoklady ------------------------------------------------------
pravda('stupně nadpisu jsou v paletě',
  STUPNE.every((t) => new RegExp(`${t}\\s*:`).test(css)),
  'chybí: ' + STUPNE.filter((t) => !new RegExp(`${t}\\s*:`).test(css)).join(', '));
/* Bylo „aspoň pět", dokud existoval plakát nad mapou se dvěma vlastními
   pravidly. Po jeho smazání jsou tři: h1, .okr-hero h1 a .add-hero h1. */
pravda('test našel pravidla, která velikost h1 určují', nalezy.length >= 3,
  `nalezeno jen ${nalezy.length} — čte test vůbec předlohu?`);

// --- Pravidlo ---------------------------------------------------------
const cizi = nalezy.filter((n) => {
  if (STUPNE.some((t) => n.hodnota.includes(`var(${t})`))) return false;
  return !(n.sel in VYJIMKY);
});
pravda('velikost h1 pochází z pojmenovaného stupně, ne z opsaného čísla',
  cizi.length === 0,
  cizi.map((n) => `r.${n.radek} „${n.sel}" = ${n.hodnota} ${n.media.join(' ')}`).join('\n      '));

// --- Obsahové stránky mají jeden a týž stupeň -------------------------
const OBSAH = ['h1', '.okr-hero h1', '.add-hero:not(.app-hero) h1'];
for (const sel of OBSAH) {
  const n = nalezy.find((x) => x.sel === sel);
  pravda(`„${sel}" nese --h1-stranka`,
    !!n && n.hodnota.includes('var(--h1-stranka)'),
    n ? `nese ${n.hodnota}` : 'pravidlo v předloze není — změnil se selektor?');
}

// --- Výjimka musí být odůvodněná a musí být k čemu -------------------
for (const [sel, duvod] of Object.entries(VYJIMKY)) {
  pravda(`výjimka „${sel}" má důvod`, typeof duvod === 'string' && duvod.length >= 30,
    'důvod chybí nebo je příliš krátký');
  pravda(`výjimka „${sel}" se v předloze opravdu vyskytuje`,
    nalezy.some((n) => n.sel === sel),
    'pravidlo v předloze není — výjimka ze seznamu patří pryč');
}

// --- A nadpis nesmí měnit velikost skokem tam, kde nese stupeň -------
const skokem = nalezy.filter((n) => n.media.length > 0
  && STUPNE.some((t) => n.hodnota.includes(`var(${t})`)) === false
  && OBSAH.includes(n.sel));
pravda('obsahový nadpis už velikost nemění přes @media',
  skokem.length === 0,
  skokem.map((n) => `r.${n.radek} „${n.sel}" = ${n.hodnota} v ${n.media.join(' ')}`).join('\n      '));

// =====================================================================
// MŘÍŽKOVÁ TEXTURA
//
// Tutéž mřížku nese několik ploch: proužek na titulní, krajský pás
// a úvod návodů. Dvě z nich měly buňku 52 px a třetí 58 px — rozdíl,
// který nikdo nerozhodl a který se při přechodu mezi stránkami pozná
// jako jiná hrubost podkladu. Velikost i barva čáry je proto v paletě
// a všechny ji berou odtud.
//
// BARVA JE DNES JEN JEDNA. Dokud web měl tmavý režim, byly dvě:
// --mrizka-cara-svetla (inkoust pro světlé plochy) a --mrizka-cara-tmava
// (bílá pro tmavé). Tmavý režim je pryč a ta bílá se mezitím ukázala
// jako vada: dvě mřížky ji braly i na SVĚTLÉM pásu, kde z nich nebylo
// vidět vůbec nic. Obě dnes berou --pas-mrizka, která ukazuje na
// --mrizka-cara-svetla, a bílá varianta je odstraněná.
// =====================================================================
/* --mrizka-bunka-panel (34 px pro panel mobilního menu) tu BÝVAL.
   Menu texturu dávno nemá, token zůstal viset nepoužitý a 20. 10. byl
   smazán — rozteč je dnes jedna. */
const TEXTURA = ['--mrizka-bunka', '--mrizka-cara-svetla'];
pravda('mřížková textura má hodnoty v paletě',
  TEXTURA.every((t) => new RegExp(`${t}\\s*:`).test(css)),
  'chybí: ' + TEXTURA.filter((t) => !new RegExp(`${t}\\s*:`).test(css)).join(', '));

// Najdi každé pravidlo, které mřížku kreslí: dva lineární přechody s 1px čárou.
// Výraz nesmí končit na první závorce — čára je dnes var(--…), a zápis
// „[^)]*1px" proto nenašel ANI JEDNU plochu. Dřív našel tři, protože hledal
// jen jedno konkrétní krytí; ve skutečnosti jich je šest.
const bloky = [];
{
  let hloubka = 0, zacatek = 0, sel = '', h = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') { if (hloubka === 0) { sel = h.trim(); zacatek = i; } hloubka++; h = ''; }
    else if (c === '}') { hloubka--; if (hloubka === 0) bloky.push({ sel, text: css.slice(zacatek, i) }); h = ''; }
    else if (hloubka === 0) h += c;
  }
}
const mrizky = bloky.filter((b) =>
  (b.text.match(/linear-gradient\(to (?:right|bottom),[^;]*?1px/g) || []).length >= 2);
/* Počet je tu schválně přesný, ne „aspoň sedm". Když texturu dostane další
   plocha, má to být rozhodnutí: zvedni číslo a dole ověř, že nová plocha
   bere rozteč i barvu z palety. Kdyby tu stálo „aspoň", přibyla by plocha
   s opsanými čísly a test by mlčel. */
/* PĚT. Sedmá byla vysouvací nabídka na telefonu (#nav::before): mřížka
   patří na plochy, které něco ukazují — mapa, karty, hlavička — a za
   seznamem šesti řádků z ní pod horním okrajem zbyl šedý flek, takže
   panel vypadal ušpiněný, ne značkový. Šestá byl .hero-band::before,
   tedy pás pod uvítacím blokem titulní strany; ten blok je pryč a
   .hero-band nezůstalo v žádném HTML ani skriptu. Obě odebrány záměrně. */
pravda('test našel všech pět ploch s mřížkovou texturou', mrizky.length === 5,
  `nalezeno ${mrizky.length}, čekám 5 — pokud texturu dostala další plocha, `
  + 'zvedni číslo v testu:\n      '
  + mrizky.map((b) => b.sel.trim().slice(0, 34)).join(' | '));

/* JEDEN STUPEŇ PŘEZDÍVKY SE UZNÁ — ALE MUSÍ SE OVĚŘIT, KAM VEDE.
   Patička sdílí barvy s úvodní plochou přes tokeny pásu, takže její
   mřížka bere --pas-mrizka. To není obcházení pravidla: --pas-mrizka
   se sám nedefinuje žádnou barvou, jen ukazuje na --mrizka-cara-svetla.
   Test si proto najde
   všechny tokeny, které se definují JEN odkazem na jednu z těch dvou
   čar, a uzná je. Token s vlastní barvou se neuzná ani náhodou. */
const ZAKLADNI = ['--mrizka-cara-svetla'];
const prezdivky = [];
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*var\((--mrizka-cara-[a-z]+)\)\s*;/g)) {
  if (ZAKLADNI.includes(m[2]) && !prezdivky.includes(m[1])) prezdivky.push(m[1]);
}
/* Přezdívka, která by někde měla i vlastní barvu, se zahodí. */
const nepoctive = prezdivky.filter((t) =>
  new RegExp(t.replace(/[-]/g, '\\-') + '\\s*:\\s*(?!var\\(--mrizka-cara-)', 'g').test(css));
pravda('přezdívky za mřížkovou čáru nikde nenesou vlastní barvu',
  nepoctive.length === 0, nepoctive.join(', '));
const CARY = [...ZAKLADNI, ...prezdivky.filter((t) => !nepoctive.includes(t))]
  .map((t) => 'var(' + t + ')');
const ROZTECE = ['var(--mrizka-bunka)'];
const opsane = mrizky.filter((b) => {
  const bunka = (b.text.match(/background-size:\s*([^;}]+)/) || [])[1] || '';
  const cara = (b.text.match(/linear-gradient\(to right,\s*([^,]+)/) || [])[1] || '';
  return !ROZTECE.some((r) => bunka.includes(r)) || !CARY.some((c) => cara.includes(c));
});
pravda('každá mřížka bere rozteč i barvu čáry z palety',
  opsane.length === 0,
  opsane.map((b) => `„${b.sel.trim().slice(0, 40)}" — rozteč `
    + ((b.text.match(/background-size:\s*([^;}]+)/) || [])[1] || '?').trim()
    + ', čára ' + ((b.text.match(/linear-gradient\(to right,\s*([^,]+)/) || [])[1] || '?').trim()).join('\n      '));

// Rozteče smí být nejvýš dvě — velké plochy a malý panel. Třetí hodnota
// už by byla hrubost bez důvodu, a právě tři jich tu dřív byly.
const roztece = new Set(mrizky.map((b) =>
  ((b.text.match(/background-size:\s*([^;}]+)/) || [])[1] || '').trim()));
pravda('rozteče jsou nejvýš dvě a obě pojmenované', roztece.size <= 2
  && [...roztece].every((r) => ROZTECE.some((t) => r.includes(t))),
  'rozteče: ' + [...roztece].join('  |  '));

// =====================================================================
// PILULKA
//
// Zaoblení pilulky je --r-pill (999px). Hlídač na zaoblení
// (scripts/test-zaobleni.mjs) měří VYKRESLENÉ hodnoty, a to na osmi
// vybraných stránkách — na zápis se tedy nikdo nedíval. Naměřeno
// 20. 10.: 999px stálo opsané na dvanácti místech, z toho dvakrát
// přímo v css/styles.css a pětkrát v css/pozemek-vlozeny.css, odkud
// se vkládá do 2 179 stránek pozemku. Proti 53 místům, která už token
// braly — tedy ne záměr, jen nehoda.
//
// Čísla jsou tady stejná, takže se tím nic nevykreslí jinak. Jde o to,
// aby se dala pilulka jednou změnit: před opravou by se změnila na
// padesáti třech místech a na dvanácti zůstala.
// =====================================================================
/* ZDROJE PRO OBĚ KONTROLY NÍŽ. Čtou se všechny ručně psané stylopisy
   (ne *.min.css — to jsou výstupy) a vložené <style> ručně psaných
   stránek. Vyrobené stránky se nečtou: pozemky-* vlastní <style>
   nemají a pozemek-* do něj dostanou očištěný css/pozemek-vlozeny.css,
   který se čte ze zdroje.
   404 a diagnostika si schválně NENAČÍTAJÍ stylopis: mají vyjít i tehdy,
   když ostatní soubory chybí, takže v nich tokeny k mání nejsou. */
const JE_VYROBENA = /^(pozemek|pozemky)-/;
const BEZ_STYLOPISU = new Set(['404.html', 'diagnostika.html', 'inzerce.html']);
const zdroje = readdirSync('css')
  .filter((f) => f.endsWith('.css') && !f.endsWith('.min.css'))
  .sort()
  .map((f) => ['css/' + f, readFileSync('css/' + f, 'utf8')]);
for (const f of readdirSync('.')) {
  if (!f.endsWith('.html') || JE_VYROBENA.test(f) || BEZ_STYLOPISU.has(f)) continue;
  const h = readFileSync(f, 'utf8');
  if (h.indexOf('<style') >= 0) zdroje.push([f, h]);
}
/* Komentáře pryč, ale délka zůstane — číslo řádku pak ukazuje na
   opravdový řádek souboru. */
const bezKomentaru = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' '));
const kdeJe = (t, i) => t.slice(0, i).split('\n').length;
/* U STRÁNKY SE ČTE JEN VNITŘEK <style>. Zbytek se vybílí na mezery
   stejné délky, aby čísla řádků ukazovala na opravdový řádek souboru.
   Bez toho kontrola barev hlásila predloha.html:179 — jenže tam ten
   #F7F8F8 stojí v odstavci, který úklid přelivů POPISUJE. */
function jenStyl(jmeno, text) {
  if (jmeno.endsWith('.css')) return text;
  let ven = text.replace(/[^\n]/g, ' ');
  for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const zac = m.index + m[0].indexOf(m[1]);
    ven = ven.slice(0, zac) + m[1] + ven.slice(zac + m[1].length);
  }
  return ven;
}

{
  const opsana = [];
  let sTokenem = 0;
  for (const [jmeno, syrove] of zdroje) {
    const t = bezKomentaru(jenStyl(jmeno, syrove));
    sTokenem += (t.match(/border-radius\s*:[^;}]*var\(--r-pill\)/g) || []).length;
    for (const m of t.matchAll(/border-radius\s*:\s*([^;}]*\b999px[^;}]*)/g)) {
      opsana.push(`${jmeno}:${kdeJe(t, m.index)}  border-radius:${m[1].trim()}`);
    }
  }
  pravda(`je co měřit — pilulka se ve zdrojích vyskytuje (${sTokenem}× tokenem)`,
    sTokenem > 10, `jen ${sTokenem} — čte kontrola vůbec stylopisy?`);
  pravda('token --r-pill se nikde nepřepisuje (jinak by „jedna hodnota" nebyla jedna)',
    (zdroje.map(([, t]) => (t.match(/--r-pill\s*:/g) || []).length)
      .reduce((a, b) => a + b, 0)) === 1, 'definic je víc než jedna');
  pravda('pilulka se píše tokenem, ne opsaným číslem — i ve vložených stylech',
    opsana.length === 0,
    opsana.join('\n      ') + '\n      napiš var(--r-pill)');
}

// =====================================================================
// ZAMĚŘENÍ
//
// Procházka tabulátorem přes sedm stránek (97 zaměřitelných prvků)
// našla 20. 10. SEDM různých podob zaměření: tři obrysy (dvě zeleně,
// odstupy 1, 2 i 3 px) a čtyři měkké prstence u polí. O tom, kterou
// podobu prvek dostane, rozhodovalo jen to, které pravidlo ho chytí.
//
// Horší než nejednotnost bylo, co se naměřilo u polí. Ta si obrys
// vypínala a nechávala za sebe změnu barvy okraje plus prstenec:
//     okraj mezi stavy   1,21 – 1,35 : 1
//     prstenec k ploše   1,11 – 1,31 : 1
//     obrys jinde na webu        5,50 : 1
// Pole tak byla jediná místa, kde klávesnicí nebylo poznat, kde člověk
// stojí. Obrys se proto nevypíná a prstenec zůstal jako ozdoba —
// jedna hodnota (--prstenec-pole) místo pěti.
//
// Pravidlo: obrys zaměření je 2px solid var(--znacka-svetla); odstup
// 2 px, nebo -2 px tam, kde se kreslí dovnitř (záložka v pásu).
// Prstenec u pole se bere z tokenu. Výjimky mají napsaný důvod.
// =====================================================================
{
  const OBRYS = '2px solid var(--znacka-svetla)';
  const ODSTUPY = new Set(['2px', '-2px']);
  /* Obrys, který se liší, a proč. Bez důvodu tu nemá co dělat. */
  const VYJIMKY_OBRYS = {
    '.dv-znovu:focus-visible':
      'tlačítko sedí na dražební oranžové ploše, kde by značková zeleň splynula s okrajem',
    '.leaflet-marker-icon:focus-visible .pk-shluk':
      'shluk leží na mapových dlaždicích — na pestrém podkladu se dvoupixelový obrys ztratí',
  };
  /* Kde se obrys vypíná a proč. */
  const VYJIMKY_VYPNUTO = {
    '.vm-pole input':
      'vstup je bez rámečku uvnitř kresleného obalu; zaměření kreslí obal přes :has(input:focus-visible)',
    '.leaflet-container':
      'SVG kraje i canvas mají od Leafletu tabindex, takže by kolem tvaru vznikl obdélník',
  };
  const cizi = [], vypnute = [], cizePrsteny = [];
  let sObrysem = 0, sPrstencem = 0;
  for (const [jmeno, syrove] of zdroje) {
    const t = bezKomentaru(jenStyl(jmeno, syrove));
    for (const m of t.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      const telo = m[2];
      const kde = `${jmeno}:${kdeJe(t, m.index)}`;
      const obrys = (telo.match(/outline\s*:\s*([^;}]+)/) || [])[1];
      if (obrys && /none/.test(obrys)) {
        /* Výjimka se poznává podle toho, že selektor některý z vypsaných
           klíčů OBSAHUJE — seznamy s více selektory se tak nemusí opisovat. */
        if (!Object.keys(VYJIMKY_VYPNUTO).some((k) => sel.includes(k))) {
          vypnute.push(`${kde}  ${sel.slice(0, 56)}`);
        }
        continue;
      }
      if (obrys && /:focus/.test(sel)) {
        sObrysem++;
        const odstup = ((telo.match(/outline-offset\s*:\s*([^;}]+)/) || [])[1] || '').trim();
        const sedi = obrys.trim() === OBRYS && ODSTUPY.has(odstup);
        if (!sedi && !Object.keys(VYJIMKY_OBRYS).some((k) => sel.includes(k))) {
          cizi.push(`${kde}  ${sel.slice(0, 44)} → ${obrys.trim()} off:${odstup || '—'}`);
        }
      }
      if (/:focus/.test(sel)) {
        const bs = (telo.match(/box-shadow\s*:\s*([^;}]+)/) || [])[1];
        if (!bs) continue;
        if (bs.includes('var(--prstenec-pole)')) { sPrstencem++; continue; }
        if (/\b0 0 0 \d/.test(bs)) cizePrsteny.push(`${kde}  ${sel.slice(0, 44)} → ${bs.trim().slice(0, 40)}`);
      }
    }
  }
  pravda(`je co měřit — pravidel s obrysem zaměření je ${sObrysem}`,
    sObrysem > 15, `jen ${sObrysem} — čte kontrola vůbec stylopisy?`);
  pravda('obrys zaměření je všude týž (2px var(--znacka-svetla), odstup 2 nebo -2 px)',
    cizi.length === 0, cizi.join('\n      '));
  pravda('nikde se obrys zaměření nevypíná bez napsaného důvodu',
    vypnute.length === 0,
    vypnute.join('\n      ') + '\n      změna barvy okraje sama dává 1,2 : 1 — to se nepozná');
  pravda(`prstenec u pole se bere z tokenu (${sPrstencem}×)`,
    cizePrsteny.length === 0, cizePrsteny.join('\n      '));
  for (const [sel, duvod] of Object.entries({ ...VYJIMKY_OBRYS, ...VYJIMKY_VYPNUTO })) {
    pravda(`výjimka „${sel}" má napsaný důvod`,
      typeof duvod === 'string' && duvod.length >= 30, 'důvod chybí nebo je příliš krátký');
  }
}

// =====================================================================
// BARVA, KTERÁ UŽ MÁ JMÉNO
//
// Naměřeno 20. 10.: ve vložených stylech ručně psaných stránek stálo
// 13 hexů mimo bílou a černou. Tři z nich byly hodnoty, které paletka
// už pojmenované má — a tři další byly ručně namíchané odstíny barev,
// které jméno mají taky. Jedna z nich navíc nestačila na čtení:
// #178a53 na ploše odznaku dával 3,85 : 1 proti mezi 4,5 : 1.
//
// Hlídá se jen to první: hodnota, kterou token UŽ MÁ, se nemá psát
// číslem. „Namíchal jsem si vlastní odstín" tahle kontrola nepozná
// a ani nemá — od toho je test-barvy, který měří vykreslení.
// =====================================================================
{
  /* Tokeny se čtou z paletky; měří se proti nim všechno ostatní.
     css/styles.css se nečte — tam ty tokeny bydlí. */
  const paleta = new Map();
  const styly = readFileSync('css/styles.css', 'utf8');
  for (const m of styly.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]/g)) {
    const h = m[2].toLowerCase();
    if (!paleta.has(h)) paleta.set(h, m[1]);
  }
  const opsane = [];
  for (const [jmeno, syrove] of zdroje) {
    if (jmeno === 'css/styles.css') continue;
    const t = bezKomentaru(jenStyl(jmeno, syrove))
      /* `var(--token, #zaloha)` je obranná náhrada pro případ, že token
         chybí — ta se opisovat musí, jinak by náhrada nebyla žádná. */
      .replace(/var\(\s*--[a-z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g, 'var()');
    for (const m of t.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const h = m[0].toLowerCase();
      /* BÍLÁ A ČERNÁ SE NEPOČÍTAJÍ. Bílá má v paletce dvě jména
         (--text-ondeep i --plocha-karta) a `color:#fff` na značkové
         ploše je zápis, který používá i sám stylopis (.btn-primary).
         Kontrola by hlásila 40 míst, kde se nic nepokazilo. */
      if (h === '#fff' || h === '#ffffff' || h === '#000' || h === '#000000') continue;
      if (!paleta.has(h)) continue;
      opsane.push(`${jmeno}:${kdeJe(t, m.index)}  ${m[0]} = ${paleta.get(h)}`);
    }
  }
  pravda(`je co měřit — paletka má ${paleta.size} pojmenovaných barev`,
    paleta.size > 20, `jen ${paleta.size} — čte kontrola vůbec paletku?`);
  pravda('žádný vložený styl neopisuje barvu, která už má jméno',
    opsane.length === 0,
    opsane.join('\n      ') + '\n      napiš var(--jméno); obranná náhrada var(--jméno, #…) je v pořádku');
}

// =====================================================================
// POMĚR NÁHLEDU
//
// Náhled fotky má na webu jeden poměr: 16/10. Drží ho .opp-media,
// .okr-item .okr-foto, .ul-thumb, .mp-ram, .pz-media i kostra výpisu.
// Na muj-inzerat.html se ale psal PIXELOVOU VÝŠKOU (`width:100%;
// height:160px`) a vycházel z toho pás — naměřeno v prohlížeči
// 694×160 = 4,34 : 1 na monitoru a 324×160 = 2,02 : 1 na telefonu
// 390 px. Při object-fit:cover z fotky pozemku zbyla prostřední pětina.
// Nehlídalo to nic: scripts/test-nahledy-vypisu.mjs se dívá jen na
// vyrobené stránky s .okr-item.
//
// Pravidlo: pravidlo, které určuje velikost náhledu, nesmí mít pevnou
// pixelovou VÝŠKU, když šířka pevná není. Poměr se píše aspect-ratio
// (a `aspect-ratio:auto` je jeho vypnutí, ne splnění), nebo se krabice
// určí oběma rozměry — tak to mají ikony a čtvercová .rs-foto 44×44.
// Výjimka musí mít napsaný důvod, a musí být pořád potřeba.
// =====================================================================
{
  const JMENO_NAHLEDU = /thumb|foto|media|snimek|nahled|obraz/i;
  const VYJIMKY_POMER = {
    '.map-side .opp-media':
      'vedle seznamu na úvodní stránce stojí velká mapa, takže výřez mapky u karty je to nejvíc zdvojené, co karta má; 150 px je výška, kterou si karta drží jako svoje minimum (změřeno: karta spadne na 362 px a vejde se na notebook 1280×700)',
  };
  const pasy = [], kandidati = new Set();
  let merenych = 0;
  for (const [jmeno, syrove] of zdroje) {
    const t = bezKomentaru(jenStyl(jmeno, syrove));
    for (const m of t.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, ' ');
      const telo = m[2];
      if (!JMENO_NAHLEDU.test(sel)) continue;
      /* `max-height` ani `line-height` to není — před „height" nesmí
         stát pomlčka. */
      if (!/(?<![-\w])height\s*:\s*\d+(?:\.\d+)?px/.test(telo)) continue;
      merenych++;
      if (/aspect-ratio\s*:\s*[\d.]/.test(telo)) continue;
      if (/(?<![-\w])width\s*:\s*\d+(?:\.\d+)?px/.test(telo)) continue;
      kandidati.add(sel);
      if (sel in VYJIMKY_POMER) continue;
      pasy.push(`${jmeno}:${kdeJe(t, m.index)}  ${sel}  {${telo.trim().replace(/\s+/g, ' ')}}`);
    }
  }
  // PŘEDPOKLAD: bez pravidel náhledu by kontrola měřila prázdno
  pravda(`je co měřit — ${merenych} pravidel náhledu určuje výšku pixelem`,
    merenych >= 5, `jen ${merenych} — hledá kontrola vůbec pravidla náhledů?`);
  pravda('žádný náhled nemá pevnou výšku bez pevné šířky (poměr se píše aspect-ratio)',
    pasy.length === 0,
    pasy.join('\n      ') + '\n      napiš aspect-ratio (16/10), nebo urči krabici oběma rozměry');
  for (const [sel, duvod] of Object.entries(VYJIMKY_POMER)) {
    pravda(`výjimka ${sel} má napsaný důvod`,
      typeof duvod === 'string' && duvod.length >= 30,
      'důvod chybí nebo je moc krátký — bez něj tabulka tiše roste');
    /* A platí to obojím směrem: výjimka, která už není potřeba, se má
       zrušit, ne zapomenout. */
    pravda(`a je pořád potřeba (${sel})`, kandidati.has(sel),
      'pravidlo už pevnou výšku bez pevné šířky nemá — výjimku smaž');
  }
}

console.log('\nJeden styl — pojmenovaná hodnota místo opsaného čísla');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${nalezy.length} pravidel určuje velikost h1`);
nalezy.forEach((n) => console.log(`   r.${String(n.radek).padStart(4)}  ${n.hodnota.padEnd(20)} ${n.sel}`));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jeden styl: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
