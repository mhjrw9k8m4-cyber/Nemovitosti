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
pravda('hlavička má i -webkit-sticky pro starší iOS', /position:-webkit-sticky/.test(css));
/* Vysouvací menu uvnitř hlavičky je position:fixed s „top:100%" — tedy
   „pod spodní hranou vztažného rámce". Tím rámcem MUSÍ být hlavička, jinak
   se menu propadne na spodek okna. Rámec dělá transform; dokud ho dělalo
   jen rozmazané sklo, stačilo sklo vypnout a menu zmizelo. */
const hlavickaBlok = css.slice(css.indexOf('header{border-bottom'), css.indexOf('header{border-bottom') + 500);
pravda('hlavička je vztažný rámec pro menu (má transform)',
  /transform:\s*translateZ\(0\)/.test(hlavickaBlok),
  'bez něj „top:100 %" u menu znamená celou výšku okna, ne spodek hlavičky');
pravda('a nespoléhá na to, že rámec udělá rozmazané sklo',
  /transform:\s*translateZ\(0\)/.test(hlavickaBlok) &&
  css.indexOf('transform:translateZ(0)') < css.indexOf('@media (hover:none){\n  header{background:#F7F5F1'),
  'rámec se nesmí ztratit s dekorací');

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

await prohlizec.close();
console.log('\nLepivá hlavička — drží nahoře a nic pod ní neprosvítá');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlavička: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
