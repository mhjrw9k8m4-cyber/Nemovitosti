// Test: nářadí nad výpisem je na dosah, ne na konci seznamu.
//
// Spuštění: node scripts/test-nastroje-v-dosahu.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ. „Projít N pozemků po jednom", „Stáhnout výběr" a pruh naposledy
// prohlédnutých stály NAD výpisem a odsouvaly první nabídku o 106 px —
// to jediné, kvůli čemu sem člověk přišel, bylo až za nářadím na práci
// s tím, co ještě neviděl. Přesunul jsem je tedy pod seznam, a tím je
// zahodil: naměřeno 9 625 px, tedy 8 781 px za okrajem obrazovky, až za
// všemi dvaceti čtyřmi kartami. Majitel webu se ozval, že funkce
// zmizely, a měl pravdu — v seznamu dlouhém sedmnáct tisíc pixelů je
// „níž" a „pryč" totéž.
//
// Hlídají se proto OBĚ meze naráz:
//   · nesmí stát nad první nabídkou (to byla první chyba),
//   · a nesmí být dál než na dosah jednoho švihnutí (to byla druhá).
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Dvě obrazovky telefonu (2 × 844). Naměřený stav je 1 058 px, tedy
   jedno krátké švihnutí; mez 1 688 nechá místo na vyšší kartu, ale
   zdaleka nepropustí stav „až na konci výpisu" (9 625). */
const MEZ_TELEFON = 1688;

let ok = 0, chyb = 0;
const zpravy = [];
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
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 });
  await p.waitForTimeout(1200);
  /* Řazením, ne filtrem druhu: mění pořadí, ne počet nabídek, takže
     výpis zůstane plný a kontrola níž má co měřit. */
  await p.evaluate(() => {
    const s = document.getElementById('map-sort');
    if (s) { s.value = 'price_asc'; s.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await p.waitForTimeout(1800);
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
    return {
      karet: karty.length,
      sObrazkem: karty.filter((k) => !!k.querySelector('.rs-foto img')).length,
      celych: celych,
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
  pravda('na telefonu je nářadí AŽ ZA první nabídkou',
    t.akce !== null && t.karta !== null && t.akce > t.karta,
    `nářadí na ${t.akce} px, první nabídka na ${t.karta} px`);
  pravda(`a přitom nejvýš ${MEZ_TELEFON} px od začátku, ne na konci výpisu`,
    t.akce !== null && t.akce <= MEZ_TELEFON,
    `nářadí na ${t.akce} px — to je až za kartami, kam nikdo nedoroluje`);
  pravda('a je vložené mezi karty, ne pověšené za seznam',
    t.akceVeVypisu, 'nářadí není uvnitř #opp-list');
  pravda('naposledy prohlédnuté jsou taky mezi kartami, hned za první',
    t.rsVeVypisu && t.rsPoKarte,
    `uvnitř výpisu: ${t.rsVeVypisu}, hned za kartou: ${t.rsPoKarte}`);

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
  pravda('a nářadí zůstalo za první nabídkou, ne nad ní',
    po.akce !== null && po.karta !== null && po.akce > po.karta,
    `nářadí na ${po.akce} px, první nabídka na ${po.karta} px`);

  const pruh = await zmerPruh();
  pravda('v pruhu naposledy prohlédnutých jsou karty, ne holé pilulky',
    pruh.karet >= 2 && pruh.sObrazkem === pruh.karet,
    `karet ${pruh.karet}, z toho se snímkem ${pruh.sObrazkem}`);
  pravda('a vejdou se tam aspoň dvě celé, s kouskem třetí za hranou',
    pruh.celych >= 2 && pruh.precnivaDal,
    `celých v záběru ${pruh.celych}, pokračuje za hranou: ${pruh.precnivaDal}`);

  zpravy.push(`  · naměřeno: telefon nářadí ${t.akce} px / nabídka ${t.karta} px;`
    + ` monitor nářadí ${m.akce} px / nabídka ${m.karta} px;`
    + ` pruh ${pruh.karet} karet, ${pruh.celych} celých v záběru`);
} catch (e) {
  chyb++;
  zpravy.push('  ✕ test spadl: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();
hotovo();
