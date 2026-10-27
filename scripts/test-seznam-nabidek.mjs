/* Test: názvy obcí v seznamu nabídek stojí na jedné svislici.
   ==================================================================
   Spuštění: node scripts/test-seznam-nabidek.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TOHLE VZNIKLO. Naměřeno na pozemky-stavebni.html, prvních
   14 řádků: levý okraj názvu měl TŘI různé hodnoty — 195, 266 a 273 px.
   Rozdíl 78 px uvnitř jednoho seznamu, kde pod sebou stojí „Jizerní
   Vtelno" a o dva řádky níž odsazené „Lovosice".

   Příčina: každý řádek je vlastní mřížka a sloupec s odznakem byl
   `auto`. Řádek bez odznaku ho zúžil na nulu, s „Dražba" na 71 px,
   s „Exekuce" na 78 — a mřížky spolu nemluví. Na stránkách s jedním
   druhem nabídky to vidět nebylo (odznak mají všechny řádky nebo žádný);
   vylézalo to na přehledech, kde se druhy míchají.

   CO SE MĚŘÍ. Výsledek, ne zápis: v každém SLOUPCI seznamu musí mít
   všechny názvy týž levý okraj. Stránky se berou takové, kde se druhy
   míchají — na jednodruhové by kontrola prošla i rozbitá.

   A OD 27. 10. JEŠTĚ DRUHÁ VĚC: výpis stojí na širokém displeji ve
   dvou sloupcích (§173 v docs/optimalizace.md). Sloupce se počítají
   z mřížky a měří se, že se karta v užším sloupci nerozsype — tedy
   že se parametry nezalomí na druhý řádek, což byl důvod, proč se
   karta při té změně přeskládala.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const STRANKY = ['pozemky-stavebni.html', 'pozemky-lesni.html',
  'pozemky-do-1-milionu.html', 'pozemky-stredocesky-kraj.html'];

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Seznam nabídek', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nSeznam nabídek na vstupní stránce');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Seznam nabídek: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const krive = [], prazdne = [], prelite = [];
  let sOdznaky = 0, radkuCelkem = 0;
  for (const stranka of STRANKY) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const out = [];
      for (const seznam of document.querySelectorAll('.okr-list')) {
        /* SVISLICE SE MĚŘÍ UVNITŘ SLOUPCE. Od 27. 10. stojí výpis na
           širokém displeji ve DVOU sloupcích (§173), takže levých
           okrajů jsou v jednom seznamu přirozeně dva — jeden na
           sloupec. Řádky se proto rozdělí podle levého okraje KARTY
           a svislice se žádá v každé skupině zvlášť; počet skupin se
           pak porovná s počtem sloupců z mřížky, aby se za „sloupec"
           nedalo vydávat rozsypané odsazení. */
        /* Pod 1200 px je výpis `flex` v jednom sloupci; tam
           gridTemplateColumns hlásí „none", a to je jeden sloupec,
           ne nula. */
        const csS = getComputedStyle(seznam);
        const sloupcuVMrizce = csS.display === 'grid'
          ? csS.gridTemplateColumns.split(' ').filter(Boolean).length : 1;
        const skupiny = new Map();
        for (const polozka of seznam.querySelectorAll('.okr-item')) {
          const m = polozka.querySelector('.okr-place');
          if (!m) continue;
          const klic = Math.round(polozka.getBoundingClientRect().left);
          if (!skupiny.has(klic)) skupiny.set(klic, []);
          skupiny.get(klic).push(Math.round(m.getBoundingClientRect().left));
        }
        const ruznychVeSkupinach = Math.max(1, ...[...skupiny.values()]
          .map((v) => [...new Set(v)].length));
        const mista = [...seznam.querySelectorAll('.okr-item .okr-place')]
          .map((e) => Math.round(e.getBoundingClientRect().left));
        /* Odznak se nesmí přelít do názvu. Sloupec je pevný, takže
           kdyby ho někdo zúžil pod šířku slova „Exekuce", názvy by
           pořád stály na svislici — jen by přes ně ležel odznak.
           Zarovnání a nepřekrývání jsou dvě různé otázky. */
        let prekryv = 0;
        for (const polozka of seznam.querySelectorAll('.okr-item')) {
          const z = polozka.querySelector('.okr-badge');
          const m = polozka.querySelector('.okr-place');
          if (!z || !m) continue;
          if (Math.round(z.getBoundingClientRect().right) > Math.round(m.getBoundingClientRect().left)) prekryv++;
        }
        out.push({ pocet: mista.length, prekryv,
          odznaku: seznam.querySelectorAll('.okr-badge').length,
          sloupcu: skupiny.size, sloupcuVMrizce,
          ruznych: ruznychVeSkupinach,
          min: mista.length ? Math.min(...mista) : null,
          max: mista.length ? Math.max(...mista) : null });
      }
      return out;
    });
    if (!m.length || !m.some((s) => s.pocet >= 5)) { prazdne.push(stranka); continue; }
    for (const s of m) {
      if (s.pocet < 2) continue;
      radkuCelkem += s.pocet;
      if (s.odznaku > 0) sOdznaky++;
      if (s.ruznych !== 1) {
        krive.push(`${stranka}: ${s.ruznych} různých levých okrajů uvnitř sloupce (${s.min}–${s.max} px) na ${s.pocet} řádcích`);
      }
      /* A sloupce musí být tolik, kolik jich mřížka deklaruje — jinak
         by se kontrola výš dala uspokojit tím, že si každý řádek
         udělá vlastní „sloupec". */
      if (s.sloupcu !== s.sloupcuVMrizce) {
        krive.push(`${stranka}: karty stojí v ${s.sloupcu} svislicích, mřížka má ${s.sloupcuVMrizce} sloupců`);
      }
      if (s.prekryv) {
        prelite.push(`${stranka}: ${s.prekryv} odznaků zasahuje do názvu`);
      }
    }
  }
  pravda('je co měřit — seznamy nabídek se našly a nejsou prázdné',
    prazdne.length === 0 && radkuCelkem >= 40,
    `bez seznamu: ${prazdne.join(', ') || '—'}; řádků celkem ${radkuCelkem}`);
  /* Past na kontrolu, která by platila jen díky tomu, že se zkouší
     stránky bez odznaků. Tam jsou okraje stejné samy od sebe a chyba
     by prošla. */
  pravda('a aspoň jeden z nich odznaky opravdu obsahuje',
    sOdznaky >= 1, 'žádný zkoušený seznam neměl odznak — kontrola by nic neřešila');
  pravda('názvy obcí v každém seznamu stojí na jedné svislici',
    krive.length === 0, krive.join('\n      '));
  pravda('a odznak „Dražba" ani „Exekuce" do názvu nezasahuje',
    prelite.length === 0, prelite.join('\n      '));

  /* --- DVA SLOUPCE NA ŠIROKÉM DISPLEJI ----------------------------
     Měřeno 27. 10.: obsah má strop 1096 px a karta výpisu brala celou
     jeho šířku, takže mezi parametry a cenou zůstávalo přes 600 px
     prázdna. Dva sloupce zkrátily výpis okresu z 3 177 na 1 952 px
     a lesních pozemků ze 7 564 na 4 573 px.
     Hranice je 1200 px a je naměřená: na 1100 px se parametry zalomily
     ve 12 řádcích z 32, na 1200 px v žádném. */
  const SIRKY = [[1199, 1], [1200, 2], [1440, 2]];
  const spatne = [];
  let merenychKaret = 0;
  for (const [W, cekano] of SIRKY) {
    await p.setViewportSize({ width: W, height: 900 });
    for (const stranka of ['pozemky-okres-benesov.html', 'pozemky-lesni.html']) {
      await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
      await p.waitForTimeout(600);
      const v = await p.evaluate(() => {
        const l = document.querySelector('.okr-list');
        if (!l) return null;
        const radky = (e) => Math.round(e.getBoundingClientRect().height
          / parseFloat(getComputedStyle(e).lineHeight));
        let zlomene = 0, vsech = 0;
        l.querySelectorAll('.okr-meta').forEach((e) => { vsech++; if (radky(e) > 1) zlomene++; });
        const cs = getComputedStyle(l);
        return { sloupcu: cs.display === 'grid'
          ? cs.gridTemplateColumns.split(' ').filter(Boolean).length : 1, zlomene, vsech };
      });
      if (!v) { spatne.push(`${W}px ${stranka}: výpis se nenašel`); continue; }
      merenychKaret += v.vsech;
      if (v.sloupcu !== cekano) spatne.push(`${W}px ${stranka}: ${v.sloupcu} sloupců místo ${cekano}`);
      if (v.zlomene) spatne.push(`${W}px ${stranka}: ${v.zlomene} z ${v.vsech} parametrů se zalomilo`);
    }
  }
  // PŘEDPOKLAD: bez vykreslených karet by kontrola níž prošla naprázdno
  pravda('je co měřit i u sloupců (karty se vykreslily)', merenychKaret > 100,
    `karet celkem ${merenychKaret}`);
  pravda('výpis stojí od 1200 px ve dvou sloupcích a parametry se nezalomí',
    spatne.length === 0, spatne.slice(0, 6).join('\n      '));

  /* --- JEDEN RÁM NA VŠECH TYPECH REGIONÁLNÍCH STRÁNEK -------------
     Naměřeno 27. 10. na 1 440 px: na krajských stránkách stál výpis
     rovnou na ploše stránky (nadpis 24 px, karty na svislici nadpisu
     stránky, 152 px), kdežto na okresních, druhových a cenových byl
     navíc zabalený do BÍLÉ KARTY — tedy bílé karty v bílé kartě,
     s obsahem odsazeným o 20 px a s menším nadpisem. Týž obsah ve
     dvou různých rámech; majitel tenhle druh rozdílu popsal slovy
     „věci mají různou velikost, celé to musíš sjednotit".
     Sjednoceno na krajskou podobu: karta je karta nabídky, ne rám
     kolem seznamu karet. */
  await p.setViewportSize({ width: 1440, height: 900 });
  const RAMY = ['pozemky-okres-benesov.html', 'pozemky-jihocesky-kraj.html',
    'pozemky-lesni.html', 'pozemky-do-1-milionu.html', 'nove-pozemky.html'];
  const ramy = [];
  for (const stranka of RAMY) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(600);
    const v = await p.evaluate(() => {
      const l = document.querySelector('.okr-list');
      const h1 = document.querySelector('h1');
      if (!l || !h1) return null;
      const tl = (e) => { const r = document.createRange(); r.selectNodeContents(e);
        const b = r.getBoundingClientRect(); return b.width ? Math.round(b.left) : null; };
      const obal = l.closest('.okr-blok, .add-card');
      const h2 = obal && obal.querySelector('h2');
      return { h1: tl(h1), seznam: Math.round(l.getBoundingClientRect().left),
        ram: obal ? String(obal.className).split(' ')[0] : 'žádný',
        /* Karta v kartě se dá najít i přímo, ne jen přes odsazení. */
        vKarte: document.querySelectorAll('.add-card .okr-list').length,
        nadpis: h2 ? getComputedStyle(h2).fontSize : null };
    });
    ramy.push({ stranka, v });
  }
  // PŘEDPOKLAD: bez naměřených stránek by kontroly níž prošly naprázdno
  pravda(`rámy výpisu se změřily na ${RAMY.length} typech stránek`,
    ramy.every((x) => x.v && x.v.nadpis), JSON.stringify(ramy.filter((x) => !x.v || !x.v.nadpis)));
  if (ramy.every((x) => x.v && x.v.nadpis)) {
    const ruzneRamy = [...new Set(ramy.map((x) => x.v.ram))];
    const ruzneNadpisy = [...new Set(ramy.map((x) => x.v.nadpis))];
    const posunute = ramy.filter((x) => x.v.seznam !== x.v.h1)
      .map((x) => `${x.stranka}: nadpis ${x.v.h1}, výpis ${x.v.seznam}`);
    pravda('výpis má na všech typech regionálních stránek týž rám',
      ruzneRamy.length === 1, 'rámy: ' + ruzneRamy.join(', '));
    pravda('a nadpis nad ním tutéž velikost', ruzneNadpisy.length === 1,
      'velikosti: ' + ruzneNadpisy.join(', '));
    pravda('a stojí na svislici nadpisu stránky', posunute.length === 0,
      posunute.join(' | '));
    const vKarte = ramy.filter((x) => x.v.vKarte > 0).map((x) => `${x.stranka}: ${x.v.vKarte}`);
    pravda('žádný výpis karet nestojí uvnitř další karty', vKarte.length === 0,
      vKarte.join(' | '));
  }
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
