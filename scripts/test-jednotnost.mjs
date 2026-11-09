/* Test: celý web má JEDEN krok — jeden okraj, jeden nadpis, jednu kartu.
 *
 * Spuštění: node scripts/test-jednotnost.mjs
 *
 * PROČ VZNIKL. 26. 10. se na dvanácti typech stránek změřilo tohle:
 *   · svislé odstupy oddílů měly DEVĚT hodnot (4, 12, 16, 20, 24, 28,
 *     40, 48, 80 px),
 *   · vodorovný okraj obsahu TŘI (12 px na stránce pozemku, 20 px na
 *     většině, 28 px na okresech, druzích a článcích),
 *   · karta TŘI odsazení (28/28, 20/20, 0/0),
 *   · h1 DVĚ velikosti (24 px na úvodu, pozemku, hlídání a zprávách,
 *     28 px na zbytku) — čtyři pixely nejsou hierarchie, ale nesourodost.
 * Okraj obsahu tedy při přechodu z pozemku na okres SKOČIL. Přesně
 * tohle dělá z webu „sbírku stránek" místo jedné věci, a na rozdíl od
 * barev si toho člověk nevšimne vědomě — jen mu to nesedí.
 *
 * MĚŘÍ SE VYKRESLENÁ STRÁNKA, NE ZÁPIS V SOUBORU. Hodnoty se slévají
 * z tokenů, z media queries a ze tří stylopisů naráz; ze zdroje se
 * nedá poznat, co z toho nakonec vyhraje. Zrovna na tom pohořel
 * test-pismo.mjs: hlídal „velký nadpis má jeden hlas" čtením
 * css/styles.css, jenže stránku pozemku přebíjela třída .pz-place
 * z vloženého stylopisu, kterou h1 dostává z JavaScriptu — takže
 * 2 266 stránek pravidlo porušovalo a hlídač hlásil zeleno.
 *
 * VÝJIMKA, KTERÁ MÁ DŮVOD. .clanek schválně shazuje kartu úplně
 * (0/0): dlouhý text se nečte z rámečku. Je pojmenovaná níž, ne
 * promíjená mlčky.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
const { BASE } = await import('./falesna-supabase-chat.mjs');

let ok = 0, chyb = 0; const zpravy = [];
hlasPad('Jednotný krok webu', zpravy);
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

/* Vzorek pokrývá každý ZPŮSOB, jakým stránka vzniká: ručně psaná,
   generovaná z dat, článek, nástroj za přihlášením i titulní. Kdyby
   se vzorek zúžil na ručně psané, vypadl by z něj zrovna ten typ,
   který má 2 266 kopií. */
const STRANKY = [
  ['úvodní', '/index.html'],
  ['pozemek', '/pozemek-benesov-benesov-1sjtz7b.html'],
  ['okres', '/pozemky-okres-tabor.html'],
  ['druh', '/pozemky-stavebni.html'],
  ['článek', '/cena-pozemku.html'],
  ['přidat', '/pridat.html'],
  ['hlídání', '/hlidani.html'],
  ['zprávy', '/zpravy.html'],
  ['data', '/data.html'],
  ['podmínky', '/podminky.html'],
  ['kontakt', '/kontakt.html'],
  ['pravidla', '/pravidla-inzerce.html'],
];

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
const ctx = await prohlizec.newContext({
  bypassCSP: true, viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ',
});

const namereno = [];
for (const [jmeno, cesta] of STRANKY) {
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + cesta, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const hlavni = document.querySelector('main');
      if (!hlavni) return null;
      const h = document.querySelector('h1');
      const okraje = new Set(), karty = new Set();
      hlavni.querySelectorAll('.wrap,.st-wrap,.pz-wrap').forEach((e) => {
        if (e.getBoundingClientRect().width > 200) {
          okraje.add(parseFloat(getComputedStyle(e).paddingLeft) || 0);
        }
      });
      hlavni.querySelectorAll('.add-card,.st-karta').forEach((e) => {
        if (e.classList.contains('clanek')) return;   // viz hlavička souboru
        const c = getComputedStyle(e);
        karty.add((parseFloat(c.paddingTop) || 0) + '/' + (parseFloat(c.paddingLeft) || 0));
      });
      /* HLAVA STRÁNKY. Od 26. 10. začíná každá stránka s obsahem toutéž
         tmavou deskou — .st-hlava, .okr-band nebo .add-hero podle toho,
         ze které rodiny značek pochází, ale s JEDNÍM pozadím a jednou
         barvou nadpisu. Hlídá se barva, ne jméno třídy: tři jména jsou
         historie, jeden vzhled je pravidlo.
         Stránka pozemku vrací null schválně — její hlava je fotka, ne
         deska, a jednaHodnota() null přeskakuje. */
      const deska = hlavni.querySelector('.st-hlava, .okr-band, .add-hero');
      const dh = deska ? deska.querySelector('h1') : null;
      return {
        h1: h ? getComputedStyle(h).fontSize : null,
        okraje: [...okraje], karty: [...karty],
        deska: deska ? getComputedStyle(deska).backgroundColor : null,
        deskaText: dh ? getComputedStyle(dh).color : null,
      };
    });
    namereno.push([jmeno, m]);
  } catch (e) {
    namereno.push([jmeno, null]);
  }
  await p.close();
}
/* ==================================================================
   STRÁNKY ÚČTU MAJÍ JEDNU SVISLICI (měřeno na širokém okně)
   ==================================================================
   Měření výš běží na 390 px, kde je sloupec jeden a problém se
   neprojeví. Na monitoru se ale stránky účtu rozpadly: naměřeno
   9. 11. na 1280 px, že se KAŽDÝ blok středí sám za sebe a každý má
   jinou šířku, takže levá hrana měla čtyři polohy —

       řádek s nadpisem   280 px (720 široký)
       úvodní věta        360 px (560)
       karta přihlášení   420 px (440)   ← a na „Hlídání" dokonce 361,
                                            protože tam se nestředila
       pás záložek        505 px

   — tedy schodiště. Majitel 9. 11.: „text je moc rozházený, není to
   symetrické." Na telefonu přitom všechno sedělo, takže to hlídač
   běžící jen na 390 px nikdy nemohl vidět.

   HLÍDÁ SE TO, CO JE NA TOM ROZHODNUTÍ PODSTATNÉ, ve dvou větách:
     1. Bloky, které nesou text stránky — řádek s nadpisem, úvodní věta
        a sloupec obsahu —, začínají na TÉŽE svislici. (To chytí první
        vadu: 280 / 360 / 360.)
     2. Každý blok uvnitř sloupce je SOUMĚRNÝ podle jeho středu: co mu
        zbývá vlevo, zbývá i vpravo. Užší karta se tedy středí, ne lepí
        k jedné hraně. (To chytí druhou: karta 361–799 ve sloupci
        360–920.)
   Samotná souměrnost by nestačila — bloky z první vady byly souměrné
   každý zvlášť, jen podle jiné šířky. A samotná shoda hran zase ne:
   karta se do ní nevejde, protože je užší schválně. */
const UCET = [
  ['hlídání', '/hlidani.html', '.hl-wrap'],
  ['zprávy', '/zpravy.html', '.zp-wrap'],
  ['profil', '/muj-inzerat.html', '#mi-saved-wrap'],
];
{
  const sirokyCtx = await prohlizec.newContext({
    bypassCSP: true, viewport: { width: 1280, height: 900 }, locale: 'cs-CZ',
  });
  const rozchodyHran = [], nesoumerne = [];
  let stranek = 0, hran = 0, bloku = 0;
  for (const [jmeno, cesta, obsah] of UCET) {
    const p = await sirokyCtx.newPage();
    try {
      await p.goto(BASE + cesta, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await p.waitForTimeout(1200);
      const m = await p.evaluate((obsahSel) => {
        const box = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return r.width > 20 ? { l: Math.round(r.left), r: Math.round(r.right) } : null;
        };
        const sloupec = box(obsahSel) || box('.uc-hlava');
        if (!sloupec) return null;
        /* MĚŘÍ SE DESKY, NE ODSTAVCE. Souměrnost se smí žádat jen po
           tom, co má vlastní plochu — po kartě s rámem a stínem.
           Odstavec je taky užší než sloupec, ale schválně a jinak:
           má strop na čtecí šířku (--m-text) a začíná u levé hrany
           sloupce, protože text se čte zleva. Kdyby se středil,
           každý odstavec by začínal jinde podle své délky.
           Naměřeno hned při psaní téhle kontroly: `p.rules-note` na
           „Můj profil" měla vlevo 0 px a vpravo 261 px — a je to
           správně. Deska se pozná podle rámu nebo stínu; odstavec
           nemá ani jedno. */
        const vnitrni = [];
        const obal = document.querySelector(obsahSel);
        const kandidati = obal ? Array.from(obal.querySelectorAll(':scope > *, :scope > * > *')) : [];
        for (const e of kandidati) {
          const st = getComputedStyle(e);
          if (st.display === 'none' || st.position === 'absolute' || st.position === 'fixed') continue;
          const jeDeska = parseFloat(st.borderTopWidth) > 0 || st.boxShadow !== 'none';
          if (!jeDeska) continue;
          const r = e.getBoundingClientRect();
          if (r.width < 200 || r.height < 20) continue;
          vnitrni.push({
            kdo: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
              + (typeof e.className === 'string' && e.className
                ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
            l: Math.round(r.left), r: Math.round(r.right),
          });
        }
        return {
          hlava: box('.uc-hlava'),
          uvod: box('.app-hero .sub'),
          sloupec: box(obsahSel),
          vnitrni,
        };
      }, obsah);
      if (!m) { rozchodyHran.push(`${jmeno}: sloupec účtu se nenašel`); continue; }
      stranek++;
      /* 1) Jedna svislice pro text stránky. */
      const textove = [['řádek s nadpisem', m.hlava], ['úvodní věta', m.uvod], ['sloupec obsahu', m.sloupec]]
        .filter(([, b]) => b);
      for (const [co, b] of textove) {
        hran++;
        if (Math.abs(b.l - textove[0][1].l) > 1) {
          rozchodyHran.push(`${jmeno}: ${co} začíná na ${b.l}, ${textove[0][0]} na ${textove[0][1].l}`);
        }
      }
      /* 2) Souměrnost podle středu sloupce. */
      const S = m.sloupec || m.hlava;
      for (const b of m.vnitrni) {
        bloku++;
        const vlevo = b.l - S.l, vpravo = S.r - b.r;
        if (Math.abs(vlevo - vpravo) > 1) {
          nesoumerne.push(`${jmeno}: ${b.kdo} má vlevo ${vlevo} px, vpravo ${vpravo} px`);
        }
      }
    } catch (e) {
      rozchodyHran.push(`${jmeno}: ${String(e && e.message || e).slice(0, 80)}`);
    } finally { await p.close(); }
  }
  await sirokyCtx.close();
  /* POJISTKA PROTI TICHÉMU NIC. Kdyby se obaly přejmenovaly, obě
     kontroly níž by prošly na prázdné množině — a vada by se vrátila
     bez jediného pádu. */
  pravda(`stránky účtu se na širokém okně změřily (${stranek} ze 3)`,
    stranek === UCET.length, `změřeno ${stranek}`);
  pravda(`a bylo co měřit (${hran} hran, ${bloku} bloků)`,
    hran >= 6 && bloku >= 3, `hran ${hran}, bloků ${bloku}`);
  pravda('text stránky účtu začíná na jedné svislici',
    rozchodyHran.length === 0, rozchodyHran.slice(0, 4).join(' | '));
  pravda('a každý blok ve sloupci účtu je souměrný podle jeho středu',
    nesoumerne.length === 0, nesoumerne.slice(0, 4).join(' | '));
}

await prohlizec.close();

const nenactene = namereno.filter(([, m]) => !m).map(([j]) => j);
pravda(`všech ${STRANKY.length} typů stránek se načetlo`, nenactene.length === 0,
  'nenačetlo se: ' + nenactene.join(', '));

const zive = namereno.filter(([, m]) => m);

function jednaHodnota(popis, vyber) {
  const mapa = new Map();
  for (const [jmeno, m] of zive) {
    for (const h of [].concat(vyber(m))) {
      if (h === null || h === undefined) continue;
      if (!mapa.has(h)) mapa.set(h, []);
      if (!mapa.get(h).includes(jmeno)) mapa.get(h).push(jmeno);
    }
  }
  const klice = [...mapa.keys()];
  pravda(`${popis} je na celém webu jeden (${klice.join(', ') || '—'})`,
    klice.length === 1,
    klice.map((k) => `${k} → ${mapa.get(k).join(' ')}`).join('; '));
}

jednaHodnota('pozadí hlavy stránky', (m) => m.deska);
jednaHodnota('barva nadpisu v hlavě', (m) => m.deskaText);
jednaHodnota('vodorovný okraj obsahu', (m) => m.okraje);
jednaHodnota('velikost nadpisu h1', (m) => m.h1);
jednaHodnota('odsazení karty', (m) => m.karty);

console.log('\nJednotný krok webu');
console.log(zpravy.join('\n'));
console.log(`  · měřeno na ${zive.length} typech stránek při šířce 390 px`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jednotnost: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
/* A DOJET TO NAČISTO. Bez tohohle řádku zkouška doměří, vypíše
   výsledek a pak VISÍ: falešný server Supabase (scripts/falesna-
   supabase-chat.mjs) drží smyčku událostí otevřenou. V sadě ji pak
   sebere až časový strop a v logu po ní nezbyde nic — výpis se ztratí
   v nevyprázdněné rouře. Naměřeno: proces běžel 20 minut po tom, co
   měl hotovo. Ostatní zkoušky tenhle řádek mají, tahle ho zapomněla. */
process.exit(0);
