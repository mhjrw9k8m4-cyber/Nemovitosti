// Zkouška: vlastní rozbalovací seznam se dá obsloužit — myší i klávesou.
//
// Spuštění: node scripts/test-rozbalovac.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Systémový <select> je na iPhonu ošklivý, tak má web vlastní (js/dropdown.js).
// Vlastní ovládací prvek si ale musí sám zajistit všechno, co ten systémový
// umí zdarma — a dvě věci chyběly:
//
//   1) Panel se zavíral při JAKÉMKOLI rolování, včetně rolování sebe sama.
//      Řazení má 11 voleb, 419 px obsahu do 278 px okna — poslední čtyři
//      tedy nešlo vybrat vůbec. Zavřely se pod rukou.
//   2) Fokus se do panelu nikdy nepřesunul a šipky nic nedělaly. Panel navíc
//      visí na konci <body>, takže tabulátorem byl až za celou stránkou.
//      Kdo nepoužívá myš, neměl jak volbu vybrat.
//
// Zavírání při rolování STRÁNKY je naopak správné: panel je připíchnutý na
// pevné souřadnice a s obsahem by se rozešel. Zkouška hlídá obojí.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (LEAFLET && /unpkg\.com\/leaflet/.test(u.href)) {
    const f = u.pathname.split('/').pop();
    const c = path.join(LEAFLET, f);
    if (fs.existsSync(c)) return r.fulfill({ status: 200, body: fs.readFileSync(c),
      contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript' });
  }
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: "window.PK_SUPABASE_URL='" + BASE + "';window.PK_SUPABASE_KEY='anon';" }));
const p = await ctx.newPage();
await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

/* Stránka má scroll-behavior:smooth. Dorolování k prvku tedy chvíli běží a
   rolování stránky panel zavírá (správně) — bez tohohle čekání by se zkouška
   hádala s dojíždějícím rolováním a padala náhodně. */
await p.evaluate(() => {
  const b = document.querySelector('#map-sort');
  if (b && b.closest('.cdd')) b.closest('.cdd').scrollIntoView({ block: 'center' });
});
await p.waitForTimeout(1500);

function zkontrolujPanel(s) {
  if (s && s.chybiPanel) { pravda('panel rozbalovače se v stránce našel', false, 'žádný .cdd-panel'); return false; }
  return true;
}
async function otevri() {
  await p.evaluate(() => {
    const r = document.querySelector('#map-sort').closest('.cdd');
    r.querySelector('.cdd-btn').click();
  });
  await p.waitForTimeout(350);
}
function stav() {
  return p.evaluate(() => {
    const root = document.querySelector('#map-sort').closest('.cdd');
    const btn = root.querySelector('.cdd-btn');
    /* Panel se hledá podle aria-controls. Když ho tlačítko nemá (tak to bylo
       dřív), vezme se náhradní cestou ten viditelný — ať zkouška ohlásí, co
       je špatně, místo aby spadla na null. */
    const panel = document.getElementById(btn.getAttribute('aria-controls') || '')
      || Array.prototype.slice.call(document.querySelectorAll('.cdd-panel'))
        .find((x) => getComputedStyle(x).display !== 'none')
      || document.querySelector('.cdd-panel');
    if (!panel) return { chybiPanel: true };
    const v = Array.prototype.slice.call(panel.children);
    const a = document.activeElement;
    const pr = panel.getBoundingClientRect();
    const posl = v[v.length - 1] ? v[v.length - 1].getBoundingClientRect() : null;
    return {
      otevren: getComputedStyle(panel).display !== 'none',
      rozbaleno: btn.getAttribute('aria-expanded'),
      roleP: panel.getAttribute('role'),
      voleb: v.length,
      znacka: v[0] ? v[0].tagName : '',
      roleV: v[0] ? v[0].getAttribute('role') : '',
      scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
      scrollTop: panel.scrollTop,
      fokusVPanelu: panel.contains(a),
      fokusNaTlacitku: a === btn,
      fokusIndex: v.indexOf(a),
      poslednividet: posl ? (posl.top >= pr.top - 1 && posl.bottom <= pr.bottom + 1) : false,
      odsazeniOdTlacitka: (() => {
        const pr = panel.getBoundingClientRect(), br = btn.getBoundingClientRect();
        return Math.round(pr.top - br.bottom);
      })(),
      maAriaControls: !!btn.getAttribute('aria-controls'),
      hodnota: document.querySelector('#map-sort').value,
      posledniHodnota: v[v.length - 1] ? v[v.length - 1].getAttribute('data-value') : '',
    };
  });
}

await otevri();
let s = await stav();
pravda('seznam se po klepnutí rozbalí', s.otevren && s.rozbaleno === 'true',
  'otevřen ' + s.otevren + ', aria-expanded ' + s.rozbaleno);
pravda('obsah se do okna panelu nevejde (jinak zkoušky o rolování nic neměří)',
  s.scrollHeight > s.clientHeight + 2,
  'obsah ' + s.scrollHeight + ' px do okna ' + s.clientHeight + ' px — tady není co rolovat');
pravda('tlačítko říká, který seznam ovládá (aria-controls)', !!s.maAriaControls);
pravda('panel je seznam voleb a volby jsou volby (ne tlačítka s cizí rolí)',
  s.roleP === 'listbox' && s.znacka === 'DIV' && s.roleV === 'option',
  'panel ' + s.roleP + ', volba ' + s.znacka + ' s rolí ' + s.roleV);
pravda('po rozbalení stojí fokus na právě vybrané volbě', s.fokusVPanelu && s.fokusIndex >= 0,
  'fokus v panelu ' + s.fokusVPanelu + ', index ' + s.fokusIndex);

// --- rolování uvnitř panelu ho nesmí zavřít ---
const predIndex = s.fokusIndex;
await p.evaluate(() => {
  const btn = document.querySelector('#map-sort').closest('.cdd').querySelector('.cdd-btn');
  const panel = document.getElementById(btn.getAttribute('aria-controls') || '')
    || Array.prototype.slice.call(document.querySelectorAll('.cdd-panel'))
      .find((x) => getComputedStyle(x).display !== 'none');
  if (panel) panel.scrollTop = panel.scrollHeight;   // dolistovat až na konec
});
await p.waitForTimeout(350);
s = await stav();
pravda('rolování uvnitř seznamu ho nezavře', s.otevren, 'seznam se při rolování zavřel');
pravda('a dolistovat na konec jde (spodní volby byly dřív nedosažitelné)',
  s.scrollTop > 0 && s.poslednividet,
  'odrolováno ' + s.scrollTop + ' px, poslední volba vidět: ' + s.poslednividet);

// --- klávesy ---
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(150);
let s2 = await stav();
pravda('šipka dolů posune fokus na další volbu', s2.fokusIndex === predIndex + 1,
  'z ' + predIndex + ' na ' + s2.fokusIndex);
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(150);
s2 = await stav();
pravda('a šipka nahoru zpátky', s2.fokusIndex === predIndex, 'index ' + s2.fokusIndex);
await p.keyboard.press('End');
await p.waitForTimeout(150);
s2 = await stav();
pravda('End skočí na poslední volbu', s2.fokusIndex === s2.voleb - 1, 'index ' + s2.fokusIndex + ' z ' + s2.voleb);
const chtena = s2.posledniHodnota;
await p.keyboard.press('Enter');
await p.waitForTimeout(350);
s2 = await stav();
pravda('Enter poslední volbu vybere (tou klávesou to dřív nešlo vůbec)',
  !s2.otevren && s2.hodnota === chtena,
  'zavřeno ' + !s2.otevren + ', hodnota „' + s2.hodnota + '", čekáno „' + chtena + '"');
pravda('a fokus se vrátí na tlačítko', s2.fokusNaTlacitku,
  'fokus je jinde — člověk by nevěděl, kde na stránce stojí');

// --- Escape ---
await otevri();
await p.keyboard.press('Escape');
await p.waitForTimeout(250);
s2 = await stav();
pravda('Escape seznam zavře a fokus vrátí na tlačítko', !s2.otevren && s2.fokusNaTlacitku,
  'zavřeno ' + !s2.otevren + ', fokus na tlačítku ' + s2.fokusNaTlacitku);

/* --- dojíždějící rolování ho zavřít NESMÍ ---
   Stránka má scroll-behavior:smooth a na telefonu dojíždí setrvačnost.
   Kdo klepl na rozbalovač chvíli po klepnutí na odkaz nebo po švihnutí
   prstem, viděl, jak se seznam otevře a v tomtéž okamžiku zase zmizí —
   zvenčí to vypadá, že tlačítko nefunguje. */
await p.evaluate(async () => {
  /* Nejdřív skočit jinam, jinak nemá plynulé rolování kam jet a zkouška
     nic neměří — přesně na to jsem naletěl: sabotáž ji neshodila, protože
     stránka už u toho tlačítka stála. */
  window.scrollTo({ top: 0, behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 350));
  const root = document.querySelector('#map-sort').closest('.cdd');
  root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise((r) => setTimeout(r, 120));   // rolování ještě běží
  root.querySelector('.cdd-btn').click();
});
await p.waitForTimeout(800);
s2 = await stav();
pravda('rolování, které běželo už před otevřením, seznam nezavře', s2.otevren,
  'seznam se zavřel dřív, než si ho stačil kdokoli přečíst');
pravda('a panel zůstane u svého tlačítka', s2.otevren && Math.abs(s2.odsazeniOdTlacitka) <= 24,
  'panel je od tlačítka ' + s2.odsazeniOdTlacitka + ' px — odjel pryč');
await p.waitForTimeout(500);

/* --- rolování STRÁNKY ho naopak zavřít MÁ ---
   Kolečkem, ne window.scrollBy: rozbalovač pozná rolování, které člověk
   OPRAVDU začal, právě podle vstupu (kolečko, prst, klávesa). Skriptem
   posunutá stránka je z jeho pohledu totéž jako dojíždějící setrvačnost
   po klepnutí na odkaz — a tu zavírat nesmí. Zkouška proto musí rolovat
   tak, jak roluje člověk, jinak měří něco jiného, než na čem záleží. */
/* Po předchozím bloku seznam ZŮSTÁVÁ otevřený — o to tam šlo. Klepnutí
   na tlačítko by ho tedy zavřelo, ne otevřelo, a kontrola níž by měřila
   opak toho, co má. Zavře se proto Escapem a otevře znovu. */
await p.keyboard.press('Escape');
await p.waitForTimeout(250);
await otevri();
/* NEJDŘÍV OVĚŘIT, ŽE JE VŮBEC OTEVŘENO. Bez toho tahle kontrola projde
   i tehdy, když se seznam neotevřel — „zavřený" je pak pravda z jiného
   důvodu a sabotáž (nezavírat nikdy) se propašuje. Vyzkoušeno: přesně
   tak se tudy protáhla. */
s2 = await stav();
pravda('seznam se před rolováním otevřel (jinak zkouška nic neměří)', s2.otevren,
  'neotevřel se — kontrola níž by byla pravdivá z jiného důvodu');
// Kolečko myši musí mířit na STRÁNKU, ne do panelu: rolování uvnitř panelu
// se schválně přeskakuje (jinak by se seznam zavíral při listování volbami).
const mimoPanel = await p.evaluate(() => {
  const r = document.querySelector('.cdd-panel:not([hidden])');
  const pr = r ? r.getBoundingClientRect() : null;
  // bod v levé části okna, mimo panel
  return { x: 60, y: pr && pr.left < 200 ? Math.round(pr.bottom + 60) : 400 };
});
await p.mouse.move(mimoPanel.x, mimoPanel.y);
await p.mouse.wheel(0, 120);
await p.waitForTimeout(400);
s2 = await stav();
pravda('rolování stránky seznam zavře (je připíchnutý, s obsahem by se rozešel)', !s2.otevren,
  'zůstal otevřený, i když stránka odrolovala');

await ctx.close();
await prohlizec.close();

console.log('\nRozbalovací seznam — myší i klávesou');
console.log(zpravy.join('\n'));
console.log('\n' + ok + ' v pořádku, ' + chyb + ' chyb\n');
if (chyb) { console.log('::error::Rozbalovací seznam: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
