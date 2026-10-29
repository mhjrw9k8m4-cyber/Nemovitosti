// Test: zakliknutí filtru nesmí posunout stránku pod rukou.
//
// Stížnost majitele (29. 10.): „když něco zakliknu, web se posune,
// působí to strašně zaseknuté." Má pravdu a jde to změřit:
//
//  · Zapnutí filtru přepíše počty u VŠECH štítků. Čísla se mění řádově
//    („Příjezd 1 082" → „90"), popisek si bere zbylé místo — a tím se
//    mění i to, jestli se vejde na jeden řádek. Naměřeno na telefonu:
//    mřížka druhů spadla z 302 na 230 px, tedy o 72 px.
//  · Nad panelem přibude řádka odznaků, dalších 44 px.
//
// Obojí je NAD výhledem, takže se posune všechno, na co se člověk dívá.
// Chrome si to srovná sám (overflow-anchor), Safari tu vlastnost nemá —
// a majitel je na iPhonu. Zkouška proto ukotvení VYPÍNÁ: měří se to, co
// vidí on, ne to, co si prohlížeč opraví za nás.
//
// Spuštění: node scripts/test-bez-skoku.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM a
//    PK_LEAFLET_DIR — viz ostatní zkoušky v prohlížeči)
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { rozbalHledani } from './rozbal-hledani.mjs';
import { pripravenoVypis, domUtichlo } from './zkouska-pripraveno.mjs';
import { naSeznam } from './zkouska-pohled.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Bez skoku', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
  return !!vyslo;
}

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 2, locale: 'cs-CZ', permissions: [] });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
}
const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await pripravenoVypis(p);
await naSeznam(p);
await rozbalHledani(p);
await domUtichlo(p, 400);

/* TADY JE CELÝ VTIP: Safari overflow-anchor neumí, takže se měří BEZ něj.
   S ukotvením by zkouška mlčela i s rozbitou stránkou — Chrome by posun
   schoval. (Ověřeno: se zapnutým ukotvením vyjde posun 0 i před opravou.) */
await p.addStyleTag({ content: '*{overflow-anchor:none !important;}' });

// rozbalit „Druh, cena, výměra a další"
await p.evaluate(() => {
  const s = [...document.querySelectorAll('summary, .msf-summary, button')]
    .find((e) => /Druh, cena/.test(e.textContent || ''));
  if (s) s.click();
});
await domUtichlo(p, 900);

/* CO SE MĚŘÍ: ovladač, na který se kleplo, musí po překreslení zůstat
   přesně tam, kde byl — tedy pod prstem. Záchytné body kolem se schválně
   neměří: štítky sítí se při zúžení výběru legitimně schovávají („u
   dražeb nikdo neuvádí vodu") a panel pod nimi se tím posune právem.
   Co posun právem není, je tohle: člověk klepne a odskočí mu to, čeho se
   drží. */
const KDE = '.map-controls .mcv-btn, .map-controls .mc-prep, #map-filters .filter-chip';

/** Najde ovladač podle popisku a vrátí jeho polohu v okně. */
const polohaOvladace = (text) => p.evaluate(([sel, t]) => {
  const el = [...document.querySelectorAll(sel)]
    .find((e) => ((e.querySelector('.mcp-t') || e).textContent || '').trim().indexOf(t) === 0);
  if (!el || !el.getClientRects().length) return null;
  return Math.round(el.getBoundingClientRect().top);
}, [KDE, text]);

/** Klepne na ovladač a vrátí, o kolik se posunul on sám a mřížka druhů. */
async function klepni(text) {
  await p.evaluate(([sel, t]) => {
    const el = [...document.querySelectorAll(sel)]
      .find((e) => ((e.querySelector('.mcp-t') || e).textContent || '').trim().indexOf(t) === 0);
    /* Na 250 px od vršku, ne doprostřed: hlouběji ve stránce by se
       zkrácení výpisu (z 1 884 na 20 nabídek) opřelo o konec dokumentu
       a prohlížeč by posun ořízl sám — a to by zkouška hlásila jako
       vadu, přestože to vada není. */
    if (el) window.scrollTo({ top: window.pageYOffset + el.getBoundingClientRect().top - 250, behavior: 'instant' });
  }, [KDE, text]);
  await domUtichlo(p, 400);
  const pred = await polohaOvladace(text);
  const druhyPred = await p.evaluate(() => {
    const d = document.getElementById('mc-druhy');
    return d ? Math.round(d.getBoundingClientRect().height) : null;
  });
  const slo = await p.evaluate(([sel, t]) => {
    const el = [...document.querySelectorAll(sel)]
      .find((e) => ((e.querySelector('.mcp-t') || e).textContent || '').trim().indexOf(t) === 0);
    if (!el) return false;
    el.click();
    return true;
  }, [KDE, text]);
  await domUtichlo(p, 1200);
  const po = await polohaOvladace(text);
  const druhyPo = await p.evaluate(() => {
    const d = document.getElementById('mc-druhy');
    return d ? Math.round(d.getBoundingClientRect().height) : null;
  });
  return { slo, pred, po, druhyPred, druhyPo };
}

/* Druhy se v datech mění, takže se první štítek mřížky bere podle toho,
   co na stránce opravdu je — ne podle jména napsaného ve zkoušce. */
const prvniDruh = await p.evaluate(() => {
  const b = document.querySelector('#mc-druhy .mcv-btn');
  const t = b && b.querySelector('.mcp-t');
  return t ? (t.textContent || '').trim() : null;
});
pravda('je co měřit — mřížka druhů má štítky', !!prvniDruh,
  'v #mc-druhy není ani jeden .mcv-btn');

for (const co of ['Elektřina', 'Jen celé', 'Končí do 14 dní', 'Dražba', prvniDruh].filter(Boolean)) {
  const v = await klepni(co);
  if (!pravda(`je co měřit — ovladač „${co}" na stránce je`, v.slo && v.pred != null)) continue;
  const d = v.po == null ? null : v.po - v.pred;
  pravda(`„${co}" zůstane po klepnutí pod prstem`, d != null && Math.abs(d) <= 2,
    d == null ? 'ovladač po překreslení zmizel' : `odskočil o ${d} px`
      + ' — přesně tohle majitel popsal jako „web se posune"');
  /* A druhá polovina příčiny: mřížka druhů nesmí měnit výšku jen proto,
     že se změnila čísla. Počty se zaškrtnutím mění řádově (1 082 → 90),
     a kdyby si popisek bral místo podle nich, lámal by se jednou na
     jeden a jednou na dva řádky. Výjimka je klepnutí na druh samotný —
     tam se mřížka překresluje právem (zapnutý štítek zezelená). */
  if (co !== prvniDruh) {
    pravda(`a mřížka druhů u „${co}" nemění výšku`,
      v.druhyPred != null && v.druhyPo === v.druhyPred,
      `${v.druhyPred} px → ${v.druhyPo} px (počet si musí držet stálou šířku, viz .mcv-n)`);
  }
  // vrátit zpátky, ať každé měření začíná ze stejného stavu
  await klepni(co);
}

pravda('při zaklikávání filtrů nespadl žádný skript', chyby.length === 0, chyby[0]);

await ctx.close();
await prohlizec.close();
console.log('\nBez skoku při zaklikávání filtrů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`\n::error::Bez skoku: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
