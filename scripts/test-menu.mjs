/* Test: mobilní menu je jedno a funguje všude stejně.
   ==================================================================
   Spuštění: node scripts/test-menu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Obsluha menu ležela v repozitáři ve ČTRNÁCTI kopiích a JEDENÁCTI
   různých podobách. To není estetický problém, to byla vada na
   nejrozšířenější části webu: kopie v js/pozemek.js (tedy na 1 999
   stránkách pozemků) umělo jen přepnout třídu — nezavíralo se Escapem
   ani klepnutím na odkaz. Kdo si na telefonu otevřel menu a klepl na
   odkaz, dostal novou stránku s menu roztaženým přes ni.

   Proto se hlídá obojí:
     1. že je obsluha na JEDNOM místě (js/menu.js) a že si ji žádná
        stránka ani skript nedrží po svém,
     2. že se menu doopravdy chová jak má — a měří se to na STRÁNCE
        POZEMKU, tedy tam, kde to bylo rozbité.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nMobilní menu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Menu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* ---- 1) jedno místo ------------------------------------------- */
/* Vzor bere i druhý argument: js/menu.js píše
   nav.classList.toggle('open', otevreno), kdežto kopie psaly
   toggle('open'). Bez toho by kontrola „modul obsluhu opravdu má"
   padala na vlastním modulu. */
const VZOR_OBSLUHY = /nav\.classList\.toggle\('open'/;
const kopie = [];
for (const f of fs.readdirSync(KOREN)) {
  if (!f.endsWith('.html')) continue;
  if (/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f) || f.startsWith('pozemky-okres-') || /-kraj\.html$/.test(f)) continue;
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  const vlozene = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  if (VZOR_OBSLUHY.test(vlozene)) kopie.push(f);
}
for (const f of fs.readdirSync(path.join(KOREN, 'js'))) {
  if (!f.endsWith('.js') || f === 'menu.js') continue;
  if (VZOR_OBSLUHY.test(fs.readFileSync(path.join(KOREN, 'js', f), 'utf8'))) kopie.push('js/' + f);
}
pravda('obsluha menu je jen v js/menu.js',
  kopie.length === 0,
  `${kopie.length} vlastních kopií: ` + kopie.slice(0, 5).join(', '));
pravda('a js/menu.js ji opravdu má (jinak kontrola výš nic neznamená)',
  VZOR_OBSLUHY.test(fs.readFileSync(path.join(KOREN, 'js', 'menu.js'), 'utf8')),
  'v js/menu.js obsluha není');

/* Každá stránka, která přepínač má, si musí modul načíst. */
const bezModulu = [];
let sPrepinacem = 0;
for (const f of fs.readdirSync(KOREN)) {
  if (!f.endsWith('.html')) continue;
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (!/class="[^"]*nav-toggle/.test(s)) continue;
  sPrepinacem++;
  if (!/<script[^>]+src="js\/(?:min\/)?menu\.js/.test(s)) bezModulu.push(f);
}
pravda(`stránky s přepínačem se našly (${sPrepinacem})`, sPrepinacem > 100, `jen ${sPrepinacem}`);
pravda('a každá si načte js/menu.js',
  bezModulu.length === 0,
  `${bezModulu.length} bez modulu: ` + bezModulu.slice(0, 5).join(', '));

/* ---- 2) a doopravdy to funguje — na stránce pozemku ----------- */
const detail = fs.readdirSync(KOREN).find((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
pravda('našla se stránka pozemku, na které se to dá změřit', !!detail, 'žádná pozemek-*.html');
if (!detail) hotovo();

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${detail}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);

  const stav = () => p.evaluate(() => ({
    otevreno: document.getElementById('nav').classList.contains('open'),
    expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
    label: document.querySelector('.nav-toggle').getAttribute('aria-label'),
    zamek: document.body.classList.contains('nav-open'),
  }));

  pravda('na začátku je menu zavřené', !(await stav()).otevreno);

  await p.click('.nav-toggle');
  await p.waitForTimeout(200);
  let s = await stav();
  pravda('klepnutí na přepínač menu otevře', s.otevreno, JSON.stringify(s));
  pravda('a odečítač se dozví, že je otevřené',
    s.expanded === 'true' && /Zavřít/i.test(s.label || ''), JSON.stringify(s));
  pravda('a stránka pod ním se nedá rolovat', s.zamek, JSON.stringify(s));

  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  s = await stav();
  pravda('Escape menu zavře (na stránce pozemku to dřív nešlo)', !s.otevreno, JSON.stringify(s));
  pravda('a odečítač se to dozví taky', s.expanded === 'false' && /Otevřít/i.test(s.label || ''), JSON.stringify(s));

  await p.click('.nav-toggle');
  await p.waitForTimeout(200);
  /* Klepnutí na odkaz v menu. Odkaz vede jinam, takže se jen ověří, že
     se menu zavřelo — navigaci přeruší beforeunload/timeout, proto se
     klikne s preventDefault. */
  await p.evaluate(() => {
    const a = document.querySelector('#nav a');
    a.addEventListener('click', (e) => e.preventDefault(), { once: true });
    a.click();
  });
  await p.waitForTimeout(200);
  pravda('klepnutí na odkaz v menu ho zavře (na stránce pozemku to dřív nešlo)',
    !(await stav()).otevreno, JSON.stringify(await stav()));

  await p.click('.nav-toggle');
  await p.waitForTimeout(200);
  /* MIMO PANEL SE MUSÍ ZMĚŘIT, NE ODHADNOUT. Dřív tu stálo pevné
     mouse.click(5, 700) — to platilo, dokud nabídka visela z lišty.
     Od přestavby stojí dnem na spodní hraně okna, takže ten bod leží
     UVNITŘ ní a zkouška měřila nesmysl. Klepne se tedy nad panel —
     a nejdřív se ověří, že tam panel opravdu není. */
  const mimo = await p.evaluate(() => {
    const r = document.getElementById('nav').getBoundingClientRect();
    const h = document.querySelector('header').getBoundingClientRect();
    return { y: Math.round((h.bottom + r.top) / 2), nadPanelem: Math.round(r.top - h.bottom) };
  });
  pravda(`nad nabídkou zůstává místo, kam se dá klepnout (${mimo.nadPanelem} px)`,
    mimo.nadPanelem >= 40, 'nabídka sahá až pod hlavičku — kontrola níž by neměřila nic');
  await p.mouse.click(195, mimo.y);
  await p.waitForTimeout(200);
  pravda('a klepnutí mimo menu ho taky zavře', !(await stav()).otevreno, JSON.stringify(await stav()));

  pravda('a nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));
} finally {
  await prohlizec.close();
}
hotovo();
