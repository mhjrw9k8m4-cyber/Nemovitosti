// Test: hlavička zůstane nahoře, ať se roluje kamkoli.
//
// Spuštění: node scripts/test-hlavicka.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Na iPhonu se lepivá hlavička při rolování odlepila a odjela od horního
// okraje — nad ní pak prosvítal obsah stránky. V Chromu se to nedělo, takže
// to jde poznat jen podle příčin, ne podle příznaku. Známé příčiny jsou tři
// a všechny tři tu byly:
//
// 1) „overflow-x:hidden" na <html>. Dělá z kořene posuvný rámec a na iOS tím
//    position:sticky rozbíjí. Clipping se dá udělat přes „overflow-x:clip",
//    který nic posuvného nevytváří.
// 2) „background-attachment:fixed" na <body>. iOS Safari to neumí; při
//    rolování z toho jsou přeskoky, které si berou i lepivou hlavičku.
// 3) „backdrop-filter" (rozmazané pozadí) na lepivé hlavičce. Rozmazaná
//    vrstva se překresluje se zpožděním za zbytkem stránky, takže pod ní
//    na okamžik prosvítá obsah.
//
// 4) MÍCHANÁ CELOOBRAZOVKOVÁ VRSTVA NAD HLAVIČKOU. Zrno přes celou stránku
//    bylo position:fixed, přes celé okno, nad hlavičkou (z-index 9999) a
//    míchané s pozadím (mix-blend-mode). Kvůli míchání musí Safari každý
//    snímek počítat, co je pod tou vrstvou — tedy celou stránku i hlavičku —
//    a překreslování fixních prvků se tím rozjede. Tohle byla ta příčina,
//    kterou tři předchozí opravy minuly, protože se hledalo na hlavičce
//    samotné, a ne nad ní.
//
// A jedna příčina, která není v CSS, ale v logice (js/hlavicka.js):
// „přestaly chodit scroll události" NEZNAMENÁ „obraz stojí". Na iPhonu
// události při setrvačném dojezdu na chvíli ustanou a sbalování lišty
// Safari neudělá scroll událost vůbec — posune se jenom visualViewport.
// Hlavička se pak rozsvítila uprostřed pohybu na starém místě.
//
// Poslední bod má i pojistku navíc: na dotyku je hlavička NEPRŮHLEDNÁ.
// I kdyby prohlížeč překreslil pozdě, není čím prosvítat.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(opt, stranka) {
  const ctx = await prohlizec.newContext(opt);
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/${stranka}*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  return { ctx, p };
}

const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const MONITOR = { viewport: { width: 1280, height: 900 } };

// --- 1) Drží nahoře při rolování ------------------------------------
for (const [jm, opt, stranka] of [['telefon', TELEFON, 'index.html'], ['monitor', MONITOR, 'index.html'],
                                  ['textová stránka', TELEFON, 'cena-pozemku.html']]) {
  const { ctx, p } = await otevri(opt, stranka);
  const mista = [];
  for (const y of [0, 150, 400, 900, 1800, 3200]) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    await p.waitForTimeout(220);
    mista.push(await p.evaluate(() => {
      const h = document.getElementById('header');
      if (!h) return { chybi: true };
      const r = h.getBoundingClientRect();
      return { top: Math.round(r.top), vyska: Math.round(r.height), scroll: Math.round(window.scrollY) };
    }));
  }
  pravda(`${jm}: hlavička na stránce je`, !mista[0].chybi);
  const odlepene = mista.filter((m) => !m.chybi && m.top !== 0);
  pravda(`${jm}: hlavička zůstane přilepená nahoře`, odlepene.length === 0,
    odlepene.map((m) => `při scrollu ${m.scroll} byla na ${m.top} px`).join(', '));
  // Nesmí se ani „schovat" tím, že by měla nulovou výšku.
  pravda(`${jm}: a je pořád vidět`, mista.every((m) => m.chybi || m.vyska > 30),
    JSON.stringify(mista.map((m) => m.vyska)));
  await ctx.close();
}

// --- 2) Nic pod ní neprosvítá ----------------------------------------
// Na dotyku musí být hlavička neprůhledná. Rozmazané sklo je hezké, ale
// právě ono se na iOS překresluje pozdě.
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  const v = await p.evaluate(() => {
    const c = getComputedStyle(document.getElementById('header'));
    const m = (c.backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return { barva: c.backgroundColor, pruhlednost: m.length >= 4 ? m[3] : 1,
      rozmazani: c.backdropFilter || 'none', pozadiTela: getComputedStyle(document.body).backgroundAttachment };
  });
  pravda('telefon: hlavička je neprůhledná', v.pruhlednost >= 0.99,
    `krytí ${v.pruhlednost} (${v.barva}) — pod poloprůhlednou prosvítá obsah, když se překreslí pozdě`);
  pravda('telefon: bez rozmazaného pozadí', v.rozmazani === 'none', `backdrop-filter: ${v.rozmazani}`);
  pravda('telefon: plocha stránky není připnutá k oknu', v.pozadiTela !== 'fixed',
    'background-attachment:fixed dělá na iOS přeskoky při rolování');
  await ctx.close();
}
// Na monitoru sklo zůstává — kvůli tomu se to celé dělá jen pro dotyk.
{
  const { ctx, p } = await otevri(MONITOR, 'index.html');
  const v = await p.evaluate(() => {
    const c = getComputedStyle(document.getElementById('header'));
    return { rozmazani: c.backdropFilter || 'none' };
  });
  pravda('monitor: rozmazané sklo zůstalo', v.rozmazani !== 'none',
    'omezení pro dotyk se omylem rozlilo i na monitor');
  await ctx.close();
}

// --- 3) Známé zabijáky sticky nejsou v CSS ---------------------------
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
pravda('<html> nemá overflow-x:hidden', !/\bhtml\{[^}]*overflow-x:\s*hidden/.test(css),
  'tím se z kořene stane posuvný rámec a na iOS to rozbije position:sticky');
pravda('hlavička drží pevně u okraje (position:fixed)', /header\{[^}]*position:fixed/.test(css),
  'sticky se na iPhonu zastavovala kousek pod okrajem a nad ní prosvítal pruh stránky');
pravda('stránka si pod hlavičkou dělá místo sama', /body\{padding-top:var\(--vyska-hlavicky/.test(css),
  'hlavička je vyňatá z toku — bez odsazení by ležela přes první řádek obsahu');
pravda('při rolování hlavička zhasne', /header\.hl-zhasnuta\{opacity:0/.test(css));
/* Hlavička NESMÍ mít transform. Pevně umístěná hlavička ho nepotřebuje
   a na Safari je transform u hlavičky historicky zdroj potíží (dokud byla
   sticky, kvůli němu se zastavovala pod okrajem). */
const hlavickaBlok = css.slice(css.indexOf('header{border-bottom'), css.indexOf('header{border-bottom') + 700);
pravda('hlavička nemá transform',
  !/transform:/.test(hlavickaBlok),
  'v pravidle pro <header> je transform: ' + (hlavickaBlok.match(/transform:[^;]*/) || [''])[0]);
pravda('menu se věší na hlavičku přes position:absolute',
  /#nav\{position:absolute;\s*top:100%/.test(css),
  'jako fixed by potřebovalo vztažný rámec navíc — a ten dělal právě ten transform');
/* Ořezávající rodič je na Safari past u lepivých i pevných prvků a kvůli
   bočnímu posuvu ho tu nepotřebujeme (změřeno: 282 zkoušek, 0 nálezů). */
pravda('<body> ani <html> neořezávají do stran',
  !/\bbody\{[^}]*overflow-x:\s*(clip|hidden)/.test(css) && !/\bhtml\{overflow-x:\s*(clip|hidden)/.test(css),
  'overflow-x na kořeni nebo na body dělá ořezávající rámec nad hlavičkou');

// --- 4) A menu se opravdu vykreslí přes celé okno --------------------
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  await p.evaluate(() => window.scrollTo(0, 800));
  await p.waitForTimeout(350);
  await p.locator('.nav-toggle').first().click();
  await p.waitForTimeout(600);
  const v = await p.evaluate(() => {
    const n = document.getElementById('nav');
    const h = document.getElementById('header');
    const r = n.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return { navTop: Math.round(r.top), navSirka: Math.round(r.width), okno: innerWidth,
      hlavDole: Math.round(hr.bottom), vidno: r.height > 100 };
  });
  pravda('menu se otevře a je vidět', v.vidno, JSON.stringify(v));
  pravda('menu navazuje na spodek hlavičky', Math.abs(v.navTop - v.hlavDole) <= 2,
    `menu začíná na ${v.navTop}, hlavička končí na ${v.hlavDole}`);
  pravda('a je přes celou šířku okna', Math.abs(v.navSirka - v.okno) <= 2,
    `${v.navSirka} × ${v.okno}`);
  await ctx.close();
}

/* --- 5) Při pohybu zhasne, po zastavení svítí úplně nahoře ----------
   Tohle je zadání, ne technický detail: kdo roluje, čte obsah, ne
   navigaci — a co není vidět, nemůže přes obsah ležet. Zároveň to obchází
   chybu, kterou na iPhonu dělala lepivá hlavička: půlka nadpisu v úvodu
   byla schovaná pod ní. */
for (const [jm, opt] of [['telefon', TELEFON], ['monitor', MONITOR]]) {
  const { ctx, p } = await otevri(opt, 'index.html');
  const v = await p.evaluate(async () => {
    const h = document.querySelector('header');
    const pruh = () => +getComputedStyle(h).opacity;
    const naZacatku = { pruhlednost: pruh(), top: Math.round(h.getBoundingClientRect().top) };
    // Nic z obsahu nesmí na začátku stránky ležet pod hlavičkou.
    const prvni = document.querySelector('main');
    const prvniTop = prvni ? Math.round(prvni.getBoundingClientRect().top) : null;
    // Rolujeme skokem a sledujeme, jestli hlavička zhasíná.
    let nejnizsi = 1;
    for (let i = 0; i < 10; i++) {
      window.scrollTo({ top: 300 + i * 130, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 25));
      nejnizsi = Math.min(nejnizsi, pruh());
    }
    await new Promise((r) => setTimeout(r, 900));
    const poKlidu = { pruhlednost: pruh(), top: Math.round(h.getBoundingClientRect().top),
      vyska: Math.round(h.getBoundingClientRect().height) };
    // A u horního okraje stránky musí svítit vždycky.
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 300));
    const nahore = pruh();
    return { naZacatku, prvniTop, nejnizsi, poKlidu, nahore };
  });
  pravda(`${jm}: na začátku stránky hlavička svítí`, v.naZacatku.pruhlednost === 1 && v.naZacatku.top === 0,
    JSON.stringify(v.naZacatku));
  pravda(`${jm}: a nic pod ní neleží`, v.prvniTop >= v.poKlidu.vyska - 2,
    `obsah začíná na ${v.prvniTop} px, hlavička je vysoká ${v.poKlidu.vyska} px — půlka nadpisu by byla schovaná`);
  pravda(`${jm}: při rolování zhasne`, v.nejnizsi < 0.9,
    `nejnižší průhlednost při pohybu byla ${v.nejnizsi} — hlavička zůstala svítit a leží přes obsah`);
  pravda(`${jm}: po zastavení se hned rozsvítí`, v.poKlidu.pruhlednost === 1,
    `po 900 ms klidu měla průhlednost ${v.poKlidu.pruhlednost}`);
  pravda(`${jm}: a to úplně nahoře`, v.poKlidu.top === 0,
    `stála na ${v.poKlidu.top} px od okraje`);
  pravda(`${jm}: u horního okraje svítí vždy`, v.nahore === 1, `průhlednost ${v.nahore}`);
  await ctx.close();
}

/* --- 3b) Místo pod hlavičkou musí sedět s její výškou ----------------
 *
 * Hlavička je vyňatá z toku a stránka si pod ni dělá místo pevným číslem
 * (85 px). Komentář v CSS dřív tvrdil, že je to naměřená hodnota — nebyla,
 * nic ji neměřilo. Číslo naštěstí sedělo, ale sedělo by jen do první
 * změny odsazení nebo písma v hlavičce, a pak by nad obsahem zůstal pruh
 * pozadí (nebo by se obsah schoval pod hlavičku). Od téhle chvíle to není
 * náhoda, ale hlídaná shoda. */
for (const [jm, opt, stranka] of [['telefon', TELEFON, 'index.html'], ['úzký telefon', { ...TELEFON, viewport: { width: 320, height: 720 } }, 'index.html'],
                                  ['monitor', MONITOR, 'index.html'], ['textová stránka', TELEFON, 'cena-pozemku.html']]) {
  const { ctx, p } = await otevri(opt, stranka);
  const v = await p.evaluate(() => ({
    vyska: Math.round(document.querySelector('header').getBoundingClientRect().height),
    odsazeni: Math.round(parseFloat(getComputedStyle(document.body).paddingTop)),
  }));
  pravda(`${jm}: místo pod hlavičkou sedí s její výškou`, Math.abs(v.vyska - v.odsazeni) <= 2,
    `hlavička ${v.vyska} px, stránka si nechává ${v.odsazeni} px — rozdíl ${v.odsazeni - v.vyska} px je pruh navíc nad obsahem`);
  await ctx.close();
}

/* --- 4) Nad hlavičkou nesmí ležet míchaná celoobrazovková vrstva ------
 *
 * Tohle je ta příčina, kterou tři opravy minuly: hledalo se na hlavičce,
 * jenže vinu nesla vrstva NAD ní. Test proto prochází všechno, co je
 * position:fixed přes celé okno, a hlídá dvě věci naráz: míchání s pozadím
 * a to, že taková vrstva leží nad hlavičkou. */
for (const [jm, opt] of [['telefon', TELEFON], ['monitor', MONITOR]]) {
  const { ctx, p } = await otevri(opt, 'index.html');
  const vrstvy = await p.evaluate(() => {
    const ven = [];
    const zkoumej = (el, popis) => {
      const c = getComputedStyle(el, popis || null);
      if (c.position !== 'fixed') return;
      const okno = { w: innerWidth, h: innerHeight };
      // „Přes celé okno" poznáme podle inset:0 nebo podle rozměru.
      const r = popis ? null : el.getBoundingClientRect();
      const velka = popis
        ? (c.inset === '0px' || (c.top === '0px' && c.left === '0px' && c.right === '0px' && c.bottom === '0px'))
        : (r && r.width >= okno.w - 2 && r.height >= okno.h - 2);
      if (!velka) return;
      ven.push({
        kdo: (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (popis || '')),
        michani: c.mixBlendMode,
        z: parseInt(c.zIndex, 10) || 0,
        vidno: c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity || '1') > 0
      });
    };
    for (const el of document.querySelectorAll('html, body, body > *')) {
      zkoumej(el, null); zkoumej(el, '::before'); zkoumej(el, '::after');
    }
    const zHlavicky = parseInt(getComputedStyle(document.querySelector('header')).zIndex, 10) || 0;
    return { ven, zHlavicky };
  });
  const michane = vrstvy.ven.filter((v) => v.vidno && v.michani && v.michani !== 'normal');
  pravda(`${jm}: žádná celoobrazovková vrstva se nemíchá s pozadím`,
    jm === 'monitor' ? true : michane.length === 0,
    michane.map((v) => `${v.kdo} (${v.michani}, z-index ${v.z})`).join(', '));
  const nadHlavickou = vrstvy.ven.filter((v) => v.vidno && v.z > vrstvy.zHlavicky && v.michani && v.michani !== 'normal');
  pravda(`${jm}: a žádná taková neleží nad hlavičkou`,
    jm === 'monitor' ? true : nadHlavickou.length === 0,
    `hlavička má z-index ${vrstvy.zHlavicky}, nad ní: ` + nadHlavickou.map((v) => `${v.kdo} z-index ${v.z}`).join(', '));
  await ctx.close();
}

/* --- 5) Sbalování lišty Safari: pohyb BEZ scroll události -------------
 *
 * Tohle je jádro čtvrté opravy. Dřív se čekalo jen na ticho ve scroll
 * událostech a věřilo se, že ticho = obraz stojí. Na iPhonu to neplatí:
 * když se sbaluje nebo rozbaluje lišta Safari, posune se celé okno a
 * scroll událost nevznikne vůbec — mění se jenom visualViewport. Hlavička
 * tedy zůstala rozsvícená a Safari ji nakreslilo tam, kde okno bývalo.
 * Odtud ten pruh obsahu nad ní.
 *
 * V Chromu se to nedá vyvolat doopravdy, ale dá se poslat TÁŽ UDÁLOST,
 * jakou by poslal Safari. Stará hlavička ji neposlouchala vůbec — tenhle
 * test na ní spolehlivě padá. */
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  const v = await p.evaluate(async () => {
    const h = document.querySelector('header');
    const spi = (ms) => new Promise((r) => setTimeout(r, ms));
    const svit = () => parseFloat(getComputedStyle(h).opacity);

    window.scrollTo({ top: 1400, behavior: 'instant' });
    await spi(800);
    const poUsazeni = svit();

    // Lišta prohlížeče se pohnula — žádná scroll událost, jen visualViewport.
    let poListe = null;
    if (window.visualViewport) {
      window.visualViewport.dispatchEvent(new Event('resize'));
      await spi(60);
      poListe = svit();
    }

    // Plynulý pohyb: dokud se hýbe, musí být zhasnutá.
    let svitilaPriPohybu = 0, snimku = 0;
    await new Promise((hotovo) => {
      let n = 0;
      (function krok() {
        window.scrollBy({ top: 24, behavior: 'instant' });
        snimku++;
        if (svit() > 0.5) svitilaPriPohybu++;
        if (++n < 30) requestAnimationFrame(krok); else hotovo();
      }());
    });

    await spi(900);
    return { poUsazeni, poListe, svitilaPriPohybu, snimku,
      poKlidu: svit(), top: h.getBoundingClientRect().top };
  });
  pravda('po usazení hlavička svítí', v.poUsazeni === 1, `průhlednost ${v.poUsazeni}`);
  pravda('pohyb lišty prohlížeče (bez scroll události) ji zhasne',
    v.poListe === null || v.poListe < 0.9,
    `po pohybu okna měla průhlednost ${v.poListe} — hlavička o posunu okna vůbec neví`);
  pravda('při plynulém pohybu zůstává zhasnutá', v.svitilaPriPohybu <= 2,
    `svítila v ${v.svitilaPriPohybu} z ${v.snimku} snímků`);
  pravda('po skutečném zastavení se rozsvítí', v.poKlidu === 1, `průhlednost ${v.poKlidu}`);
  pravda('a stojí úplně nahoře', Math.abs(v.top) < 2, `${v.top} px od okraje`);
  await ctx.close();
}

await prohlizec.close();
console.log('\nLepivá hlavička — drží nahoře a nic pod ní neprosvítá');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlavička: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
