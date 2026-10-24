/* Test v prohlížeči: pád ve stránce se opravdu nahlásí.
   ==================================================================
   Spuštění: PW_CHROMIUM=…/chrome node scripts/test-chyby-v-prohlizeci.mjs

   scripts/test-chyby-klienta.mjs zkouší js/chyby.js v Node s podstrčeným
   oknem a supabase/chyby-klienta.sql na opravdovém PostgreSQL. Tahle
   zkouška dělá to, co ani jedna z nich neumí: pustí CELÝ web
   v prohlížeči, rozbije v něm skript — a čeká, jestli hlášení odletí.

   TŘI VĚCI SE TU NEDAJÍ OVĚŘIT JINAK:
     1. ŽE SE HLÁSIČ VŮBEC SPUSTÍ POD VLASTNÍ POLITIKOU CSP. Vložený
        skript v hlavičce je hashovaný; kdyby se hash rozešel s textem
        o jediný znak, prohlížeč ho zakáže a hlásič mlčí navždy.
        Zkouška proto CSP NEOBCHÁZÍ (`bypassCSP` by to zakrylo).
     2. ŽE SE ODCHYTÍ I PÁD SKRIPTU, KTERÝ BĚŽÍ DŘÍV NEŽ ODESÍLAČ.
        Přesně kvůli tomu je odchytávač vložený v hlavičce a ne až
        v odloženém souboru. Měří se tak, že se jeden NEODLOŽENÝ
        skript stránky pozemku podstrčí rozbitý.
     3. ŽE Z TOHO VYJDE JMÉNO NAŠEHO SOUBORU A ŘÁDEK. To je celá
        hodnota hlášení: bez místa je to jen zpráva „něco se stalo".
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Hlášení chyb v prohlížeči', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const TYPY = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});

/* Jedna stránka na podstrčené doméně parcelaka.cz. `volby.rozbij`
   jmenuje soubor, který se má doručit rozbitý; `volby.pred` smí před
   načtením dosadit vlastní stráže (nesledovat…). */
async function otevri(stranka, volby) {
  const v = volby || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const poslano = [];
  const odmitnute = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy/i.test(t)) odmitnute.push(t);
  });
  await ctx.route('https://parcelaka.cz/**', (r) => {
    const u = new URL(r.request().url());
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '') || 'index.html';
    if (v.rozbij && rel === v.rozbij) {
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.pk_rozbite = ;' });
    }
    const f = path.join(KOREN, rel);
    if (!f.startsWith(KOREN) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TYPY[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await ctx.route('**/rest/v1/rpc/zapis_chybu*', (r) => {
    let telo = null;
    try { telo = JSON.parse(r.request().postData() || '{}'); } catch (e) { telo = { nelzePrecist: true }; }
    poslano.push(telo);
    return r.fulfill({ status: 204, body: '' });
  });
  /* Měření návštěvnosti ven nepouštět — ať se nepozná za hlášení. */
  await ctx.route('**/rest/v1/rpc/zapis_navstevu*', (r) => r.fulfill({ status: 204, body: '' }));
  for (const vz of ['**://*.tile.*/**', '**://*.openstreetmap.org/**', '**/_vercel/**']) {
    await ctx.route(vz, (r) => r.fulfill({ status: 204, body: '' })).catch(() => {});
  }
  /* Playwright je podle prohlížeče robot a hlásič roboty schválně
     neposlouchá; pro tyhle případy se tedy musí tvářit jako člověk. */
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch (e) {}
  });
  if (v.pred) await page.addInitScript(v.pred);
  await page.goto('https://parcelaka.cz/' + stranka, { waitUntil: 'load' });
  if (v.poNacteni) await v.poNacteni(page);
  await page.waitForTimeout(900);
  await ctx.close();
  return { poslano, odmitnute };
}

/* Stránka pozemku bere patnáct NEODLOŽENÝCH skriptů — jeden z nich se
   podstrčí rozbitý, tedy spadne dávno předtím, než se vůbec stáhne
   odesílač. */
const POZEMEK = fs.readdirSync(KOREN).filter((f) => /^pozemek-.*\.html$/.test(f)).sort()[0];
{
  const { poslano, odmitnute } = await otevri(POZEMEK, { rozbij: 'js/min/cisteni.js' });
  pravda('pád skriptu, který běží PŘED odesílačem, se nahlásí', poslano.length >= 1,
    'neodletělo nic — a právě tyhle pády jsou důvod, proč je odchytávač vložený v hlavičce');
  const t = poslano[0] || {};
  pravda(`a nese jméno našeho souboru s řádkem („${t.p_zdroj}")`,
    /^js\/min\/cisteni\.js:\d+:\d+$/.test(String(t.p_zdroj)),
    'bez místa je z hlášení jen zpráva „něco se stalo"');
  pravda(`a jméno stránky („${t.p_stranka}")`, t.p_stranka === POZEMEK.toLowerCase(), JSON.stringify(t));
  pravda(`a rodinu prohlížeče s hlavní verzí („${t.p_prohlizec}")`,
    /^chrome-\d+$/.test(String(t.p_prohlizec)), JSON.stringify(t));
  pravda('a hlásič sám není zakázaný politikou CSP stránky', odmitnute.length === 0,
    'prohlížeč odmítl: ' + odmitnute.slice(0, 2).join(' | '));
}

/* Chyba AŽ PO načtení — jiná cesta tímtéž hlásičem. */
{
  const { poslano } = await otevri('kontakt.html', {
    poNacteni: async (page) => {
      await page.evaluate(() => { setTimeout(() => { throw new Error('zkouška pádu po načtení'); }, 0); });
      await page.waitForTimeout(300);
      /* Dvakrát totéž: druhé hlášení už odejít nesmí. */
      await page.evaluate(() => { setTimeout(() => { throw new Error('zkouška pádu po načtení'); }, 0); });
    },
  });
  pravda('chyba po načtení stránky se nahlásí taky',
    poslano.some((x) => /zkouška pádu po načtení/.test(String(x.p_zprava))),
    JSON.stringify(poslano));
  pravda('a táž chyba podruhé už neodejde', poslano.length === 1,
    `odesláno ${poslano.length}× — hlásič by při chybě v kreslení zaplavil databázi`);
}

/* Odmítnutý slib (unhandledrejection) je druhá polovina téhož. */
{
  const { poslano } = await otevri('kontakt.html', {
    poNacteni: async (page) => {
      await page.evaluate(() => { Promise.reject(new Error('odmítnutý slib')); });
    },
  });
  pravda('odmítnutý slib se nahlásí taky',
    poslano.some((x) => /odmítnutý slib/.test(String(x.p_zprava))), JSON.stringify(poslano));
}

/* A stráže platí i v opravdovém prohlížeči, ne jen v podstrčeném okně. */
{
  const { poslano } = await otevri(POZEMEK, {
    rozbij: 'js/min/cisteni.js',
    pred: () => {
      Object.defineProperty(navigator, 'doNotTrack', { get: () => '1', configurable: true });
    },
  });
  pravda('při „nesledovat" se nehlásí nic ani při opravdovém pádu', poslano.length === 0,
    `odesláno ${poslano.length}×`);
}

await browser.close();

console.log('\nHlášení chyb v prohlížeči');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlášení chyb v prohlížeči: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
