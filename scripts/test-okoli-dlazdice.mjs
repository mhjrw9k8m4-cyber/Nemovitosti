/* Test: v okně „Vyberte své okolí" se nepřepíná naslepo.
   ===================================================================
   Spuštění: node scripts/test-okoli-dlazdice.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ VZNIKL. Majitel 2. 11.: „jedna z nejlepších funkcí, ale celé se
   to rozjíždí." Naměřeno v prohlížeči (telefon 390 px):

     · počet nabídek stál jen u JEDNOHO doporučeného okruhu („Zkusit
       20 km — je tam 18 pozemků"); u ostatních se dal zjistit jedině
       přepnutím, tedy naslepo. Přitom se čísla pro všech pět okruhů
       počítají v jednom průchodu už dnes (poOkruzich);
     · při „0 pozemků" svítila DVĚ zelená tlačítka — rada a vedle ní
       plné „Zobrazit pozemky", které vede na prázdný seznam;
     · text návrhu byl slepený: „Horka IIokres Kutná Hora1". Ve flexu
       to není vidět, ale odečítač i vyhledávač čtou text. Táž vada
       shodila CI 888 („9otázek").

   CO SE MĚŘÍ. Že dlaždice nesou čísla a ta čísla ROSTOU s okruhem
   (nesmyslné pořadí by prošlo i nad náhodnými čísly), že při nule
   zůstane jedna hlavní akce, a že text návrhu jde rozdělit na slova.
   =================================================================== */
import { chromium } from 'playwright-core';
import { BASE } from './falesna-supabase-chat.mjs';
import { naPohled } from './zkouska-pohled.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
hlasPad('Okolí', zpravy, () => chyb);

await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
const ctx = await prohlizec.newContext({ bypassCSP: true,
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  locale: 'cs-CZ', serviceWorkers: 'block',
  /* Uprostřed Šumavy na pět kilometrů nic není — jediná cesta,
     jak se v hlídači dostat na skutečnou nulu (viz dole). */
  permissions: ['geolocation'], geolocation: { latitude: 49.0217, longitude: 13.4972 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(2500);
await naPohled(p, 'mapa');
await p.waitForTimeout(2000);
/* OTEVŘENÍ SE MĚŘÍ V TÉŽE ÚLOZE, VE KTERÉ SE KLEPLO. Do 2. 11. bylo
   otevření jediná úloha prohlížeče o 339 ms (telefon, procesor 4×) a
   panel se objevil až za 603 ms — majitelovo „občas nereaguje".
   Od §331 se panel vloží, nechá vykreslit a mapa se staví až pak.
   Kontroluje se pořadí, ne čas: hned po klepnutí musí být panel
   v DOMu i s ovladači, a Leaflet v něm JEŠTĚ NESMÍ být. Čas by zestaral
   s rychlostí stroje, pořadí ne. */
const hned = await p.evaluate(() => {
  const b = document.getElementById('map-near');
  if (b) b.click();
  const ov = document.querySelector('.vm-ov');
  return {
    panel: !!ov,
    pole: !!(ov && ov.querySelector('#vm-q')),
    dlazdic: ov ? ov.querySelectorAll('.vm-km').length : 0,
    krizek: !!(ov && ov.querySelector('.vm-x')),
    mapaUz: !!(ov && ov.querySelector('.leaflet-container, #vm-mapa canvas, #vm-mapa .leaflet-tile')),
  };
});
pravda('panel je v DOMu hned po klepnutí, i s hledáním a dlaždicemi',
  hned.panel && hned.pole && hned.dlazdic >= 4 && hned.krizek, JSON.stringify(hned));
pravda('a mapa se v téže úloze JEŠTĚ nestaví (panel se stihne vykreslit)',
  hned.mapaUz === false, JSON.stringify(hned));
await p.waitForFunction(() => document.querySelector('#vm-mapa canvas, #vm-mapa .leaflet-tile'),
  null, { timeout: 40000 }).catch(() => {});
await p.waitForTimeout(1500);
/* A dostaví se — jinak by „panel bez mapy" prošlo jako vylepšení. */
pravda('a o chvíli později mapa v okně je',
  await p.evaluate(() => !!document.querySelector('#vm-mapa canvas, #vm-mapa .leaflet-tile')));

const dlazdice = () => p.evaluate(() => [].slice.call(document.querySelectorAll('.vm-km')).map((l) => {
  const i = l.querySelector('input'); const b = l.querySelector('b');
  return { km: Number((i || {}).value || 0), text: b ? (b.textContent || '') : null };
}));

const pred = await dlazdice();
pravda(`okno má pět dlaždic okruhu (jinak není co měřit) — ${pred.length}`,
  pred.length >= 4, JSON.stringify(pred));
/* Dokud není místo vybrané, číslo by lhalo o okolí středu republiky. */
pravda('dokud není vybrané místo, dlaždice žádné číslo netvrdí',
  pred.every((d) => d.text === ''), JSON.stringify(pred));

// --- výběr obce -------------------------------------------------------
const pole = await p.$('#vm-q');
pravda('v okně je pole na hledání obce', !!pole, '#vm-q se nenašlo');
if (pole) {
  await pole.fill('Horka');
  await p.waitForTimeout(1500);
  /* ČTE SE textContent, NE innerText. innerText prochází rozvržením,
     a to mezi dvěma prvky ve flexu vloží zalomení i tam, kde ve zdroji
     žádná mezera není — slepený text by v něm vypadal v pořádku.
     (Ověřeno sabotáží: s innerText hlídač odstraněnou mezeru NENAŠEL.)
     Odečítač ani vyhledávač rozvržení nepotřebují a čtou právě tohle. */
  const navrh = await p.evaluate(() => {
    const li = document.querySelector('.vm-navrhy li');
    if (!li) return null;
    const t = (li.textContent || '').trim();
    return { text: t, slov: t.split(/\s+/).length };
  });
  pravda('našeptávač nabídl obec', !!navrh, 'žádný návrh');
  if (navrh) {
    /* MĚŘÍ SE OBA ŠVY ZVLÁŠŤ, ne „počet slov". Slepení má dvě
       podoby — „Horka IIokres" (obec k okresu) a „Hora1" (okres
       k počtu) — a každá vzniká jinou chybějící mezerou. Kontrola
       na počet slov ani jednu z nich nepozná: ubrat jednu mezeru
       počet slov nezmění (ověřeno sabotáží, hlídač tehdy prošel). */
    pravda('a mezi obcí a okresem je mezera (ne „Horka IIokres")',
      !/\Sokres/.test(navrh.text),
      `návrh: „${navrh.text}"`);
    pravda('a počet na konci je taky odtržený (ne „Hora1")',
      /\s\d+$/.test(navrh.text),
      `návrh: „${navrh.text}"`);
    await p.evaluate(() => { const li = document.querySelector('.vm-navrhy li'); if (li) li.click(); });
    await p.waitForTimeout(2200);
  }
}

const po = await dlazdice();
const cisla = po.map((d) => Number(d.text));
pravda('po výběru obce nese každá dlaždice počet',
  po.every((d) => d.text !== null && d.text !== '' && isFinite(Number(d.text))),
  JSON.stringify(po));
/* Čísla musí NERŮST s okruhem — větší kruh nemůže mít míň nabídek.
   Bez téhle kontroly by prošla i náhodná čísla. */
let roste = true;
for (let i = 1; i < cisla.length; i++) if (cisla[i] < cisla[i - 1]) roste = false;
pravda('a čísla s okruhem neklesají (větší kruh nemá míň nabídek)', roste,
  po.map((d) => `${d.km} km → ${d.text}`).join(', '));
/* Gauge: samé nuly by prošly i jako „neklesající". */
pravda('a aspoň v největším okruhu něco je (jinak se neměří nic)',
  cisla[cisla.length - 1] > 0, po.map((d) => `${d.km}→${d.text}`).join(' '));

// --- nula nesmí mít dvě hlavní akce ----------------------------------
/* NULU NEJDE TREFIT HLEDÁNÍM. Našeptávač nabízí jen místa, u kterých
   nějaký pozemek stojí (ověřeno: „Kraslice", „Boží Dar" nevrátí nic),
   takže ve 2 km je vždycky aspoň ten jeden. Skutečnou nulu dá jen
   střed mimo nabídky — proto si hlídač nechá podstrčit polohu
   uprostřed Šumavy a klepne na „Moje poloha". */
await p.evaluate(() => { const g = document.getElementById('vm-gps'); if (g) g.click(); });
await p.waitForTimeout(3000);
/* Okruh zůstal z výběru obce; na nulu je potřeba ten nejtěsnější. */
await p.evaluate(() => {
  const i = document.querySelector('input[name="vm-km"][value="2"]');
  if (i && !i.checked) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(1500);
const nula = await p.evaluate(() => {
  const x = document.getElementById('vm-ok');
  const txt = (document.getElementById('vm-pocet') || {}).innerText || '';
  const dl = [].slice.call(document.querySelectorAll('.vm-km')).map((l) => ({
    km: Number(l.querySelector('input').value),
    n: (l.querySelector('b') || {}).textContent }));
  return { nula: /^\s*0\s/.test(txt), dlazdice: dl,
    tise: x ? x.classList.contains('vm-ok-tise') : null,
    plocha: x ? getComputedStyle(x).backgroundColor : null,
    rada: ((document.getElementById('vm-rada') || {}).textContent || '').trim(),
    ukazka: txt.split('\n')[0] };
});
pravda('poloha mimo nabídky vede na nulu (jinak se stav nuly neměří)',
  nula.nula === true, `počet: „${nula.ukazka}"`);
if (nula.nula) {
  pravda('při nule potvrzení ustoupí (jedna hlavní akce na obrazovku)',
    nula.tise === true && /rgb\(255, 255, 255\)/.test(nula.plocha || ''),
    `tiše=${nula.tise}, plocha ${nula.plocha}`);
  /* A ať je kam jít: dlaždice musí ukázat, který okruh už něco má. */
  pravda('a dlaždice ukážou, od kterého okruhu něco je',
    nula.dlazdice.some((d) => Number(d.n) > 0),
    nula.dlazdice.map((d) => `${d.km}→${d.n}`).join(' '));
}

await ctx.close();
await prohlizec.close();
console.log('\nOkolí — dlaždice okruhu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Okolí: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
