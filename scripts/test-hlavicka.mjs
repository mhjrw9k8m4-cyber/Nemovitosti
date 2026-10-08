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
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
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
    /* A pak počkat, až hlavička DOJEDE. Přijíždí animací hlPrijezd, která
       ji na 0,42 s posune o 7 px nahoru — to je záměr popsaný v css u těch
       klíčových snímků. Měřit 220 ms po odrolování tedy znamená občas
       trefit rozjetý posun a vyčíst −7 až −4 px místo nuly. Na tomhle
       stroji animace do 220 ms doběhla a zkouška mlčela; na běžci GitHubu
       ne, a padala tam od 24. září na každém pushi. Čeká se proto na
       dojetí, ne na pevný čas — tvrzení „hlavička stojí na nule" zůstává
       stejně přísné, jen se měří v klidu. */
    await p.waitForFunction(() => {
      const h = document.getElementById('header');
      if (!h) return true;
      if (h.classList.contains('hl-prijezd')) return false;
      if (!h.getAnimations) return true;
      return h.getAnimations().every((a) => a.playState !== 'running');
    }, null, { timeout: 4000 }).catch(() => {});
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
/* TADY SE MĚŘILO, ŽE PANEL NABÍDKY ZŮSTÁVÁ ABSOLUTE — jako fixed by se
   nepočítal podle okna, ale podle hlavičky (backdrop-filter dělá vztažný
   rámec i pro pevně polohované potomky). Panel je zrušený: nabídka je
   vodorovný pás uvnitř hlavičky, takže se nikam nepolohuje a tenhle
   problém zmizel i se svou obezličkou. Místo toho se hlídá, že si web
   pod lepivou hlavičkou nechává dost místa — to je vada, kterou pás
   doopravdy způsobil (hlavička 119 px proti rezervě 85 px) a kterou
   zachytily kontroly níž. */
pravda('rezerva pod lepivou hlavičkou je napsaná proměnnou, ne natvrdo',
  /--vyska-hlavicky/.test(css) && /body\{padding-top:var\(--vyska-hlavicky/.test(css),
  'bez proměnné se rezerva a skutečná výška rozejdou při první změně hlavičky');
/* Ořezávající rodič je na Safari past u lepivých i pevných prvků a kvůli
   bočnímu posuvu ho tu nepotřebujeme (změřeno: 282 zkoušek, 0 nálezů). */
pravda('<body> ani <html> neořezávají do stran',
  !/\bbody\{[^}]*overflow-x:\s*(clip|hidden)/.test(css) && !/\bhtml\{overflow-x:\s*(clip|hidden)/.test(css),
  'overflow-x na kořeni nebo na body dělá ořezávající rámec nad hlavičkou');

// --- 4) Nabídka je vidět bez otevírání a vejde se do hlavičky -------
/* Tady se dřív otevíral panel pod křížkem a měřilo se, že sedá dnem
   na spodní hranu okna. Panel i křížek jsou pryč: nabídka je vodorovný
   pás odkazů přímo v hlavičce, protože navigace, kterou nikdo
   neotevře, je navigace, která není. Měří se tedy to, co teď platí. */
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  await p.waitForTimeout(400);
  const v = await p.evaluate(() => {
    const n = document.getElementById('nav');
    const h = document.getElementById('header');
    const r = n.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const a = [...n.querySelectorAll('a')].filter((x) => x.getClientRects().length);
    return { odkazu: a.length, vHlavicce: !!n.closest('header'),
      navDole: Math.round(r.bottom), hlavDole: Math.round(hr.bottom),
      hlavVyska: Math.round(hr.height), okno_v: innerHeight,
      jednaRada: new Set(a.map((x) => Math.round(x.getBoundingClientRect().top))).size };
  });
  pravda('nabídka je vidět bez otevírání', v.odkazu >= 5, `vidět je ${v.odkazu} odkazů`);
  pravda('a je v hlavičce', v.vHlavicce && v.navDole <= v.hlavDole + 1,
    `v hlavičce: ${v.vHlavicce}, dno pásu ${v.navDole}, dno hlavičky ${v.hlavDole}`);
  pravda('pás je jedna řada (posouvá se do strany, nezalamuje se)', v.jednaRada === 1,
    `odkazy jsou ve ${v.jednaRada} řadách`);
  /* Hlavička je lepivá, takže každý její pixel chybí obsahu. S pásem
     má dvě řady; naměřeno 119 px na 390×844 (bez něj 82). Mez 150 px
     je tam, kam se nedá dostat omylem. */
  pravda(`a nepřeroste (${v.hlavVyska} px z ${v.okno_v})`, v.hlavVyska <= 150,
    `${v.hlavVyska} px — lepivá hlavička bere obsahu každý pixel`);
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
    /* První snímky se nepočítají: v tu chvíli hlavička teprve DOhasíná
       (má na to jedenáct setin vteřiny) a je poctivé jí to nechat. Měří se
       až ustálený pohyb — tedy jestli se během rolování zase nerozsvítí.
       Bez toho kontrola padala, když byl stroj pod zátěží a snímky se
       protáhly. */
    let svitilaPriPohybu = 0, snimku = 0;
    await new Promise((hotovo) => {
      let n = 0;
      const zacatek = Date.now();
      (function krok() {
        window.scrollBy({ top: 24, behavior: 'instant' });
        if (Date.now() - zacatek > 200) {
          snimku++;
          if (svit() > 0.5) svitilaPriPohybu++;
        }
        if (++n < 40) requestAnimationFrame(krok); else hotovo();
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
  pravda('při plynulém pohybu zůstává zhasnutá', v.svitilaPriPohybu === 0,
    `svítila v ${v.svitilaPriPohybu} z ${v.snimku} snímků ustáleného pohybu`);
  pravda('po skutečném zastavení se rozsvítí', v.poKlidu === 1, `průhlednost ${v.poKlidu}`);
  pravda('a stojí úplně nahoře', Math.abs(v.top) < 2, `${v.top} px od okraje`);
  await ctx.close();
}

/* --- 6) Příjezd se musí dát stihnout okem ----------------------------
 *
 * Hlavička se vracela za čtrnáct setin vteřiny, což na telefonu vypadá,
 * že se zjevila — „připlave rychlostí světla a působí to zvláštně".
 * Návrat má být krátká lehká animace (kolem půl vteřiny), odchod naopak
 * okamžitý, jinak hlavička při rolování leží přes obsah. Jsou to dvě
 * různá čísla pro dva různé směry, a test hlídá obě. */
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  const v = await p.evaluate(async () => {
    const h = document.querySelector('header');
    const spi = (ms) => new Promise((r) => setTimeout(r, ms));
    const cas = (el, vlastnost) => {
      const c = getComputedStyle(el);
      const jm = c.transitionProperty.split(',').map((x) => x.trim());
      const d = c.transitionDuration.split(',').map((x) => parseFloat(x) || 0);
      const i = jm.indexOf(vlastnost);
      return i >= 0 ? d[i] : (jm.indexOf('all') >= 0 ? d[jm.indexOf('all')] : 0);
    };
    window.scrollTo({ top: 1400, behavior: 'instant' });
    await spi(900);
    // Příjezd je animace (ne přechod mezi stavy), aby hlavička v klidu
    // neměla žádnou transformaci — čte se tedy doba animace.
    h.classList.add('hl-prijezd');
    const ca = getComputedStyle(h);
    const prichod = parseFloat(ca.animationDuration) || 0;
    const jmenoAnimace = ca.animationName;
    h.classList.remove('hl-prijezd');
    const odchod = cas(h, 'opacity');
    /* A hlavně: příjezd se musí opravdu VYKRESLIT postupně, ne jen mít
       hezkou hodnotu v CSS. Projde se to skutečnou cestou — zarolovat,
       zastavit — a sleduje se průhlednost po malých krocích. Když se
       hlavička jen přepne, žádný mezistav se nenajde. */
    window.scrollBy({ top: 300, behavior: 'instant' });
    await spi(40);
    let mezistavu = 0, posunuta = 0;
    for (let i = 0; i < 45; i++) {
      const c2 = getComputedStyle(h);
      const o = parseFloat(c2.opacity);
      if (o > 0.05 && o < 0.95) mezistavu++;
      /* A ani v půlce příjezdu se hlavička nesmí nikam posouvat: to je
         přesně to „naskočení", na které přišla stížnost. */
      if (c2.transform && c2.transform !== 'none') posunuta++;
      await spi(30);
    }
    /* A ještě jedna past, na kterou jsem sám naletěl: běžící animace
       příjezdu si drží průhlednost sama, takže by přebila zhasnutí a
       hlavička by při novém rolování ještě půl vteřiny svítila přes
       obsah. Zastavit — nechat příjezd rozběhnout — a hned zas rolovat. */
    await spi(900);
    window.scrollBy({ top: 200, behavior: 'instant' });
    await spi(250);                       // příjezd se zrovna rozjel
    window.scrollBy({ top: 200, behavior: 'instant' });
    await spi(140);
    const pripohybuZnovu = parseFloat(getComputedStyle(h).opacity);
    await spi(900);
    return { prichod, jmenoAnimace, odchod, mezistavu, posunuta, pripohybuZnovu,
      transformVKlidu: getComputedStyle(h).transform,
      konec: parseFloat(getComputedStyle(h).opacity) };
  });
  pravda('příjezd hlavičky trvá aspoň třetinu vteřiny', v.prichod >= 0.3,
    `${v.prichod} s — to je pro oko cvaknutí, ne animace`);
  pravda('ale ne víc než vteřinu', v.prichod <= 1, `${v.prichod} s`);
  pravda('příjezd je vlastní animace, ne holé přepnutí stavu',
    v.jmenoAnimace === 'hlPrijezd', `animace se jmenuje „${v.jmenoAnimace}"`);
  /* Dřív tu stálo „a doprovází ho posun": hlavička přijížděla o sedm
     pixelů shora. Ukázalo se to jako chyba — hlavička nikam neodjela,
     jen zhasla, takže posun na návratu vypadal, že „naskočí jak hokejista
     na led". Prolnutí na místě je teď POŽADAVEK, ne shoda náhod. */
  pravda('a je to prolnutí na místě — hlavička se při něm nikam neposouvá',
    v.posunuta === 0, `v ${v.posunuta} ze 45 vzorků měla transform`);
  pravda('v klidu taky žádnou transformaci nemá',
    v.transformVKlidu === 'none', `transform: ${v.transformVKlidu}`);
  pravda('odchod je naopak rychlý', v.odchod <= 0.2,
    `${v.odchod} s — hlavička by při rolování doplouvala přes obsah`);
  pravda('a příjezd se opravdu vykresluje postupně, ne přepnutím',
    v.mezistavu >= 6, `jen ${v.mezistavu} mezistavů z 45 vzorků — hlavička se přepne (nebo plyne moc krátce)`);
  pravda('rozjetý příjezd nepřebije zhasnutí při novém rolování',
    v.pripohybuZnovu < 0.5,
    `hlavička měla ${v.pripohybuZnovu} — doplouvá přes obsah, i když už se zase roluje`);
  pravda('a nakonec je úplně vidět', v.konec === 1, `${v.konec}`);
  await ctx.close();
}

/* --- 7) „Omezit pohyb" neznamená „cvakat" -----------------------------
 *
 * Kdo má na telefonu zapnuté omezení pohybu, dostával hlavičku
 * z rámce na rámec: pravidlo znělo animation:none. Jenže omezení pohybu
 * má nahradit POSUNY a zvětšování prolínáním — samo prolnutí pohyb není
 * a systém ho používá právě jako náhradu. Návrat proto zůstává prolnutím,
 * jen kratším. Bez téhle kontroly by se to dalo kdykoli vrátit zpět na
 * animation:none a nikdo by to nepoznal. */
{
  const { ctx, p } = await otevri({ ...TELEFON, reducedMotion: 'reduce' }, 'index.html');
  const v = await p.evaluate(async () => {
    const h = document.querySelector('header');
    const spi = (ms) => new Promise((r) => setTimeout(r, ms));
    window.scrollTo({ top: 1400, behavior: 'instant' });
    await spi(900);
    /* Pojistka: kdyby hlavička po zastavení vůbec nezhasínala, měřilo by
       se prázdno a kontrola by prošla, ať je v CSS cokoli. */
    window.scrollBy({ top: 300, behavior: 'instant' });
    await spi(30);
    const priPohybu = parseFloat(getComputedStyle(h).opacity);
    let mezistavu = 0;
    for (let i = 0; i < 40; i++) {
      const o = parseFloat(getComputedStyle(h).opacity);
      if (o > 0.05 && o < 0.95) mezistavu++;
      await spi(20);
    }
    await spi(700);
    return { priPohybu, mezistavu, konec: parseFloat(getComputedStyle(h).opacity) };
  });
  pravda('s omezeným pohybem hlavička při rolování pořád zhasíná (jinak zkouška nic neměří)',
    v.priPohybu < 0.95, `průhlednost při pohybu ${v.priPohybu}`);
  pravda('a vrací se prolnutím, ne cvaknutím', v.mezistavu >= 3,
    `jen ${v.mezistavu} mezistavů ze 40 vzorků — hlavička se přepne naráz`);
  pravda('a nakonec je úplně vidět', v.konec === 1, `${v.konec}`);
  await ctx.close();
}

/* --- 8) ODEBRÁNO: jméno značky dvakrát na jedné stránce --------------
 *
 * Tahle sekce porovnávala písmo „Parcelka" v hlavičce a v patičce
 * (v hlavičce bezpatkové, v patičce patkové). Už není co porovnávat:
 * patička jako rozcestík šla na přání celá pryč (commit bf1dcf195d)
 * a s ní i .foot-brand. Značka teď stojí na stránce jediné místo.
 *
 * Proč se to tu nenechává „najdi, co je k dispozici": v patičce zůstalo
 * jméno v řádku „© 2026 Parcelka", a ten je psaný strojovým
 * písmem záměrně, celý. Porovnávání s ním by padalo z důvodu, který
 * vadou není — a zkouška, která padá pro nic, přestane být brána vážně.
 * Kdyby se patička se značkou někdy vrátila, patří sem zpátky i tohle. */

await prohlizec.close();
console.log('\nLepivá hlavička — drží nahoře a nic pod ní neprosvítá');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlavička: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
