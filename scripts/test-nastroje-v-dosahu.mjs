// Test: nářadí nad výpisem je na dosah, ne na konci seznamu.
//
// Spuštění: node scripts/test-nastroje-v-dosahu.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ. Tohle místo má čtyři podoby a každá vznikla z nějaké chyby:
//   1. Nářadí stálo NAD výpisem jako dvouřádkový pruh a odsouvalo
//      první nabídku o 106 px — to jediné, kvůli čemu sem člověk
//      přišel, bylo až za nástroji na práci s tím, co ještě neviděl.
//   2. Šlo tedy pod seznam, a tím zmizelo: naměřeno 9 625 px, tedy
//      8 781 px za okrajem obrazovky, až za všemi dvaceti čtyřmi
//      kartami. Majitel webu se ozval, že funkce zmizely, a měl
//      pravdu — v seznamu dlouhém sedmnáct tisíc pixelů je „níž"
//      a „pryč" totéž.
//   3. Vkládalo se proto mezi karty (za druhou). Na dosah bylo, ale
//      sedělo uprostřed výpisu jako reklama mezi nabídkami. Majitel:
//      „tohle je taky uprostřed, udělej to tak, jak to vypadá
//      v zahraničí."
//   4. Teď je to řádek pilulek v hlavičce výpisu — nad nabídkami,
//      ale jako JEDEN řádek, co se posouvá do strany, ne jako banner.
//
// Hlídá se proto tohle:
//   · nářadí je v hlavičce výpisu, ne uvnitř seznamu a ne za ním,
//   · je na jednom řádku (zalomené na dva stálo 94 px),
//   · a přežije překreslení výpisu.
// Kolik to stojí první nabídce, měří scripts/test-prvni-obrazovka.mjs.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';
import { hlasPad } from './zkouska-pad.mjs';
/* ČEKÁ SE NA PŘEKRESLENÍ VÝPISU, ne na hodinky — viz
   scripts/zkouska-pripraveno.mjs (vykresleniPo). */
import { pripravenoKdyz, vykresleniPo } from './zkouska-pripraveno.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Nářadí je nad výpisem, takže „na dosah" dnes znamená „na první
   obrazovce": naměřeno 357 px. Mez 844 (jedna obrazovka telefonu)
   nepropustí ani stav „až na konci výpisu" (9 625), ani návrat mezi
   karty (1 058). */
const MEZ_TELEFON = 844;

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Nářadí výpisu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nNářadí výpisu je na dosah');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Nářadí výpisu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});

async function zmer(nast) {
  const ctx = await prohlizec.newContext(Object.assign(
    { viewport: nast.viewport, serviceWorkers: 'block', locale: 'cs-CZ' },
    nast.dotyk ? { isMobile: true, hasTouch: true } : {}));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  // Nářadí je ve VÝPISU; pohled se žádá jménem, ať je výchozí kterýkoli.
  await naSeznam(p);
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const v = await p.evaluate(() => {
    const y = (e) => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    const karta = document.querySelector('#opp-list .opp-item');
    const akce = document.getElementById('mc-akce');
    const rs = document.getElementById('recent-strip');
    return {
      karta: y(karta),
      akce: y(akce),
      akceH: akce ? Math.round(akce.getBoundingClientRect().height) : null,
      akceDeti: akce ? akce.children.length : 0,
      /* A CO KDYŽ NÁSTROJE PŘIBYDOU? Jejich počet závisí na datech
         a na tom, co výpis zrovna skrývá: „Procházet po jednom"
         a „Stáhnout výběr" jsou vždycky, „Zobrazit skryté" a „Dražby
         po termínu" podle okolností. Den po dražbě jich tedy bývá
         víc — a dvousloupcová mřížka je na telefonu zalomila pod sebe
         (naměřeno 96 px místo 44). Zkouška proto třetí nástroj
         PŘIDÁ a změří, že řádek zůstal jeden a jen se dá posunout
         do strany. Na datech to nestojí: kdyby se čekalo na den po
         dražbě, měřilo by se to jednou za čas. */
      akceH3: (() => {
        if (!akce || !akce.firstElementChild) return null;
        const pridane = [];
        while (akce.children.length < 3) {
          const k = akce.firstElementChild.cloneNode(true);
          k.removeAttribute('id');
          akce.appendChild(k);
          pridane.push(k);
        }
        const v = Math.round(akce.getBoundingClientRect().height);
        const posuvny = akce.scrollWidth - akce.clientWidth > 8;
        pridane.forEach((k) => k.remove());
        return { v, posuvny };
      })(),
      akceVeVypisu: !!(akce && akce.closest('#opp-list')),
      rsVeVypisu: !!(rs && rs.closest('#opp-list')),
      /* Že je pruh naposledy prohlédnutých prázdný, je v pořádku (ukazuje
         se až od dvou prohlédnutých) — ověřuje se, KAM byl zařazen. */
      rsPoKarte: !!(rs && rs.previousElementSibling
        && rs.previousElementSibling.classList.contains('opp-item')),
    };
  });
  await ctx.close();
  return v;
}

/** Sáhne na filtr (tedy vynutí překreslení) a podívá se, co přežilo. */
async function zmerPoFiltru() {
  const ctx = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  // Nářadí je ve VÝPISU; pohled se žádá jménem, ať je výchozí kterýkoli.
  await naSeznam(p);
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 });
  /* Nářadí nad výpisem vzniká v témže běhu jako karty, ale pruh `#mc-akce`
     se dosazuje až po nich — čeká se tedy na něj, ne na hodinky. */
  await pripravenoKdyz(p, () => !!document.getElementById('mc-akce'));
  /* Řazením, ne filtrem druhu: mění pořadí, ne počet nabídek, takže
     výpis zůstane plný a kontrola níž má co měřit. */
  await vykresleniPo(p, () => p.evaluate(() => {
    const s = document.getElementById('map-sort');
    if (s) { s.value = 'price_asc'; s.dispatchEvent(new Event('change', { bubbles: true })); }
  }));
  const v = await p.evaluate(() => {
    const y = (e) => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    const a = document.getElementById('mc-akce');
    return {
      akce: a ? y(a) : null,
      rs: !!document.getElementById('recent-strip'),
      karta: y(document.querySelector('#opp-list .opp-item')),
    };
  });
  await ctx.close();
  return v;
}

/** Naplní „naposledy prohlédnuté" a změří, jak pruh vypadá. */
async function zmerPruh() {
  const ctx = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  // Nářadí je ve VÝPISU; pohled se žádá jménem, ať je výchozí kterýkoli.
  await naSeznam(p);
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item[data-pk]').length > 3,
    null, { timeout: 60000 });
  await p.evaluate(() => {
    const k = [...document.querySelectorAll('#opp-list .opp-item[data-pk]')]
      .slice(0, 4).map((e) => e.getAttribute('data-pk'));
    localStorage.setItem('pk_recent_v1', JSON.stringify(k));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('#recent-strip .rs-chip', { timeout: 60000 });
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const rada = document.querySelector('#recent-strip .rs-row');
    const karty = [...document.querySelectorAll('#recent-strip .rs-chip')];
    const rr = rada.getBoundingClientRect();
    let celych = 0;
    for (const k of karty) {
      const r = k.getBoundingClientRect();
      if (r.left >= rr.left - 1 && r.right <= rr.right + 1) celych++;
    }
    /* ŠÍŘKY SE MUSÍ ROVNAT. `flex:0 0 160px` je jen preferovaná šířka;
       automatické minimum pružné položky ji umí roztáhnout podle obsahu
       a pruh pak má rozsypané hrany (naměřeno 150/154/169/191 px). */
    const sirky = karty.map((k) => Math.round(k.getBoundingClientRect().width));
    /* A cena se nesmí krájet — u obce to nevadí (výpustka), u ceny by
       „379 320…" lhalo. */
    const orezCeny = karty.map((k) => {
      const c = k.querySelector('.rs-price');
      return c ? c.scrollWidth - c.clientWidth : 0;
    });
    return {
      karet: karty.length,
      sObrazkem: karty.filter((k) => !!k.querySelector('.rs-foto img')).length,
      celych: celych,
      sirky: sirky,
      stejneSirky: sirky.length > 1 && Math.max(...sirky) - Math.min(...sirky) <= 1,
      orezCeny: Math.max(0, ...orezCeny),
      /* Kousek další karty za hranou říká „pokračuje to" líp než šipka. */
      precnivaDal: rada.scrollWidth - rada.clientWidth > 8,
    };
  });
  await ctx.close();
  return v;
}

try {
  /* DOTYK MUSÍ BÝT ZAPNUTÝ: telefonní rozvržení stojí na `pointer: coarse`,
     ne na šířce okna (CLAUDE.md). */
  const t = await zmer({ viewport: { width: 390, height: 844 }, dotyk: true });
  pravda('na telefonu stojí nářadí NAD první nabídkou, v hlavičce výpisu',
    t.akce !== null && t.karta !== null && t.akce < t.karta,
    `nářadí na ${t.akce} px, první nabídka na ${t.karta} px`);
  pravda(`a je na první obrazovce (do ${MEZ_TELEFON} px), ne na konci výpisu`,
    t.akce !== null && t.akce <= MEZ_TELEFON,
    `nářadí na ${t.akce} px — to je až za kartami, kam nikdo nedoroluje`);
  pravda('a není vražené mezi karty',
    !t.akceVeVypisu, 'nářadí sedí uvnitř #opp-list, tedy mezi nabídkami');
  pravda('a drží se na JEDNOM řádku (zalomené na dva stálo 94 px)',
    t.akceH !== null && t.akceH <= 56, `řádek nářadí je vysoký ${t.akceH} px`);
  pravda('a drží jeden řádek i při třech nástrojích (jen se posune do strany)',
    !!t.akceH3 && t.akceH3.v <= 56 && t.akceH3.posuvny === true,
    t.akceH3 ? `se třemi nástroji je řádek ${t.akceH3.v} px a posouvat `
      + (t.akceH3.posuvny ? 'jde' : 'NEJDE') : 'nářadí nemá co klonovat');
  pravda('naposledy prohlédnuté nejsou mezi kartami, ale nad výpisem',
    !t.rsVeVypisu, 'pruh naposledy prohlédnutých sedí uvnitř #opp-list');

  /* Na monitoru místa nahoře je dost a nic tam nikomu nepřekáží —
     nářadí tedy zůstává NAD výpisem a do seznamu se nelepí. */
  const m = await zmer({ viewport: { width: 1280, height: 900 }, dotyk: false });
  pravda('na monitoru zůstává nářadí NAD výpisem',
    m.akce !== null && m.karta !== null && m.akce < m.karta,
    `nářadí na ${m.akce} px, první nabídka na ${m.karta} px`);
  pravda('a není vražené mezi karty',
    !m.akceVeVypisu, 'na monitoru se nářadí vlezlo dovnitř #opp-list');

  /* A JAK TEN PRUH VYPADÁ, KDYŽ V NĚM NĚCO JE.
     Byl to řádek holých pilulek „puntík — obec — cena" mezi dvěma
     kartami s velkým leteckým snímkem — vedle sousedů jako kus z jiného
     webu. Teď je to malá karta: snímek, místo, cena. Naplní se podle
     atributu data-pk z vykreslených karet, což je přesně klíč, pod
     kterým si pruh pozemky hledá (pkey); vlastní výpočet klíče by se
     mohl rozejít a pruh by zůstal prázdný, aniž by to kde křiklo. */
  /* A TOTÉŽ PO PŘEKRESLENÍ VÝPISU.
     Tohle je ta kontrola, která chyběla. Vložky sedí na telefonu uvnitř
     seznamu a renderList() ho vysype přes `innerHTML = ''` — což smaže
     PRVKY, ne jen text. Bez odložení stranou by je první sáhnutí na
     filtr smazalo nadobro a getElementById by vracel null. Měření po
     prvním vykreslení o tom neřekne nic; vada se ukáže až napodruhé. */
  const po = await zmerPoFiltru();
  pravda('nářadí přežije překreslení výpisu (klepnutí na filtr)',
    po.akce !== null, 'po změně filtru #mc-akce na stránce není — vysypal ho seznam');
  pravda('a pruh naposledy prohlédnutých taky',
    po.rs, 'po změně filtru #recent-strip na stránce není');
  pravda('a nářadí zůstalo v hlavičce výpisu, ne mezi kartami',
    po.akce !== null && po.karta !== null && po.akce < po.karta,
    `nářadí na ${po.akce} px, první nabídka na ${po.karta} px`);

  const pruh = await zmerPruh();
  pravda('v pruhu naposledy prohlédnutých jsou karty, ne holé pilulky',
    pruh.karet >= 2 && pruh.sObrazkem === pruh.karet,
    `karet ${pruh.karet}, z toho se snímkem ${pruh.sObrazkem}`);
  pravda('a vejdou se tam aspoň dvě celé, s kouskem třetí za hranou',
    pruh.celych >= 2 && pruh.precnivaDal,
    `celých v záběru ${pruh.celych}, pokračuje za hranou: ${pruh.precnivaDal}`);
  pravda('všechny karty v pruhu mají stejnou šířku',
    pruh.stejneSirky, `šířky ${JSON.stringify(pruh.sirky)}`);
  pravda('a cena se v nich nekrájí',
    pruh.orezCeny === 0, `nejvíc ořezáno ${pruh.orezCeny} px`);

  zpravy.push(`  · naměřeno: telefon nářadí ${t.akce} px / nabídka ${t.karta} px;`
    + ` monitor nářadí ${m.akce} px / nabídka ${m.karta} px;`
    + ` pruh ${pruh.karet} karet, ${pruh.celych} celých v záběru`);
} catch (e) {
  chyb++;
  zpravy.push('  ✕ test spadl: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();
hotovo();
