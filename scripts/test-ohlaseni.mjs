/* Test: krátká hláška (toast) se odečítači opravdu ohlásí.
   ==================================================================
   Spuštění: node scripts/test-ohlaseni.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TO VZNIKLO. Toast je `<div role="status" aria-live="polite"
   hidden>` a všechny tři jeho obsluhy (js/main.js, js/pozemek.js,
   js/pridat.js) nastavovaly text DŘÍV, než oblast odkryly. `hidden`
   znamená display:none, a takový prvek v přístupnostním stromu NENÍ:
   text vložený do skryté živé oblasti není změna, kterou by odečítač
   viděl, a odkrytí prvku, který už text má, se jako aktualizace
   `aria-live` nehlásí spolehlivě (NVDA a JAWS to běžně minou).
   Nese to přitom věty, které člověk jinak nemá odkud zjistit:
   „Nepovedlo se uložit — plná paměť prohlížeče", „Nepodařilo se
   stáhnout…", „Uloženo mezi oblíbené".

   CO SE TU MĚŘÍ A CO NE. Chování konkrétního odečítače v Chromiu
   změřit nejde a tahle zkouška to netvrdí. Měří POŘADÍ: pozorovatel
   změn (MutationObserver) zaznamená, jestli se první odkryl atribut
   `hidden`, nebo se změnil text. Hlídá se tedy mechanismus — živá
   oblast musí být ve stromu dřív, než se jí změní obsah — ne zážitek.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8338;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Ohlášení hlášky', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2' };
const srv = createServer((q, s) => {
  const f = path.join(KOREN, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(KOREN) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': TYPY[path.extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
/* Pozorovatel se nasadí PŘED vyvoláním hlášky a zapisuje pořadí.
   `spoust` je selektor toho, na co by klepl člověk. */
async function zmerPoradi(adresa, spoust, pripravit) {
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${adresa}`, { waitUntil: 'load' });
  if (pripravit) await pripravit(p);
  await p.waitForSelector(spoust, { timeout: 60000 }).catch(() => {});
  const v = await p.evaluate(async (sel) => {
    const t = document.getElementById('toast');
    if (!t) return { chyba: 'prvek #toast na stránce není' };
    t.setAttribute('hidden', '');
    t.textContent = '';
    const kroky = [];
    const mo = new MutationObserver((zmeny) => {
      for (const z of zmeny) {
        if (z.type === 'attributes' && z.attributeName === 'hidden') {
          kroky.push(t.hasAttribute('hidden') ? 'schováno' : 'odkryto');
        } else if (z.type === 'childList' || z.type === 'characterData') {
          const txt = (t.textContent || '').trim();
          kroky.push(txt ? 'text:' + txt.slice(0, 24) : 'text:prázdno');
        }
      }
    });
    mo.observe(t, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    const b = document.querySelector(sel);
    if (!b) { mo.disconnect(); return { chyba: 'spoušť ' + sel + ' na stránce není' }; }
    b.click();
    await new Promise((r) => setTimeout(r, 900));
    mo.disconnect();
    return { kroky, text: (t.textContent || '').trim() };
  }, spoust);
  await p.close();
  return Object.assign({ chybyJs }, v);
}

/* Jedna sada kontrol na jednu obsluhu, ať je u pádu vidět která. */
function zkontroluj(jmeno, v) {
  pravda(`${jmeno}: hláška se dá vyvolat klepnutím`, !v.chyba, v.chyba);
  if (v.chyba) return;
  // PŘEDPOKLAD: bez zaznamenaných kroků by se neměřilo nic
  pravda(`${jmeno}: je co měřit — pozorovatel zaznamenal ${v.kroky.length} změn (${v.kroky.join(' → ')})`,
    v.kroky.length >= 2, 'pozorovatel nezaznamenal nic — hláška se vůbec nevyvolala?');
  pravda(`${jmeno}: hláška má text`, !!v.text, 'toast zůstal prázdný');
  const prvniOdkryti = v.kroky.indexOf('odkryto');
  const prvniText = v.kroky.findIndex((k) => k.startsWith('text:') && k !== 'text:prázdno');
  pravda(`${jmeno}: oblast se odkryje DŘÍV, než se jí vloží text`,
    prvniOdkryti >= 0 && prvniText >= 0 && prvniOdkryti < prvniText,
    `pořadí: ${v.kroky.join(' → ')}`
      + '\n      text vložený do skryté živé oblasti odečítač nevidí (hidden = display:none)');
  pravda(`${jmeno}: nic se u toho nerozbilo`, v.chybyJs.length === 0, v.chybyJs.join(' | '));
}

/* ---- 1) výpis na úvodní stránce (js/main.js) ---- */
zkontroluj('výpis', await zmerPoradi('index.html', '#opp-list .opp-item .opp-skryt',
  (p) => p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 }).catch(() => {})));

/* ---- 2) stránka pozemku (js/pozemek.js) ----
   Kopírování souřadnic hlášku pustí po obou cestách: i když schránka
   není povolená, záložní cesta text označí a taky to oznámí. */
const stranka = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
// PŘEDPOKLAD: bez stránky pozemku se druhá obsluha nedá měřit
pravda('je na čem měřit druhou obsluhu — stránka pozemku', !!stranka, 'žádná pozemek-*.html');
if (stranka) zkontroluj('pozemek', await zmerPoradi(stranka, '#pz-sour-kop'));

/* ---- 3) formulář (js/pridat.js) — pořadí ČTENÉ ZE ZDROJE ----
   Hláška tu visí na odeslání do databáze; měřit ji v prohlížeči by
   znamenalo falešnou Supabase. Čte se tedy tělo showToast() a hlídá
   se v něm jen to pořadí. Slabší kontrola — viz hlavička. */
{
  const zdroj = readFileSync(path.join(KOREN, 'js/pridat.js'), 'utf8');
  const i = zdroj.indexOf('function showToast(');
  const telo = i < 0 ? '' : zdroj.slice(i, i + 900);
  pravda('js/pridat.js: showToast() se ve zdroji najde', i >= 0, 'funkce zmizela nebo se přejmenovala');
  if (i >= 0) {
    const odkryti = telo.indexOf("removeAttribute('hidden')");
    const vlozeni = telo.indexOf('textContent = msg');
    pravda('js/pridat.js: odkrytí je ve zdroji před vložením textu',
      odkryti >= 0 && vlozeni >= 0 && odkryti < vlozeni,
      `odkrytí na ${odkryti}, text na ${vlozeni} (v těle funkce)`);
    pravda('js/pridat.js: a text se vkládá až v dalším snímku (requestAnimationFrame)',
      /requestAnimationFrame\([\s\S]{0,120}textContent = msg/.test(telo),
      'textContent = msg není uvnitř requestAnimationFrame');
  }
}

await ctx.close();
await prohlizec.close();
srv.close();
console.log('\nOhlášení hlášky — živá oblast musí být ve stromu dřív než text');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Ohlášení hlášky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
