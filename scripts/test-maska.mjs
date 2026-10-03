/* Test: okolí mapy je ztlumené, Česko vystupuje — a pořád jde klikat.
 *
 * Spuštění: node scripts/test-maska.mjs
 *
 * PROČ. Podklad mapy je OpenStreetMap, kde cizina končí až na okraji
 * dlaždice: Lipsko, Vídeň i Kalisz byly stejně výrazné jako Jihlava
 * a oko nemělo kam jít dřív. Řeší to závoj přes zbytek světa s dírami
 * tam, kde je Česko (prstence krajů z data/kraje.json).
 *
 * Tři věci se na tom dají rozbít, každá jinak:
 *   · DÍRY. Při pravidle „sudá/lichá" je prstenců patnáct, ne čtrnáct —
 *     Středočeský má druhý přesně tam, kde je Praha. Kdyby se vynechal,
 *     Praha by se zakryla.
 *   · BARVA. Napoprvé tu byla barva plochy stránky a změřeno to nedělalo
 *     NIC: podklad je už tak bledý, takže se bledým závojem ztlumit nedá.
 *     Proto se měří JAS, ne přítomnost prvku.
 *   · KLIKÁNÍ. Závoj přes celý svět leží nad mapou. Kdyby chytal
 *     události, nešlo by vybrat kraj — a mapa by byla mrtvá.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(5000);

const o = await p.evaluate(() => {
  const m = document.querySelector('.pk-maska');
  if (!m) return null;
  const s = getComputedStyle(m);
  return { vypln: s.fill, krytí: Number(s.fillOpacity),
    pravidlo: s.fillRule || m.getAttribute('fill-rule'),
    /* Každý prstenec začíná „M". Svět + čtrnáct krajů + vnitřní prstenec
       Středočeského = šestnáct. */
    prstencu: (m.getAttribute('d') || '').split(/M/).length - 1 };
});
pravda('závoj je na mapě', !!o, 'prvek .pk-maska nenalezen');
if (o) {
  pravda('a kreslí se pravidlem sudá/lichá (bez něj by díry nevznikly)', o.pravidlo === 'evenodd', o.pravidlo);
  pravda('a má svět plus všech patnáct prstenců krajů', o.prstencu >= 16, `prstenců ${o.prstencu}`);
  pravda('a je průsvitný (plné krytí by cizinu smazalo)', o.krytí > 0 && o.krytí < 0.5, `krytí ${o.krytí}`);
}

/* --- TO PODSTATNÉ: je ten rozdíl vidět? --------------------------- */
const png = await p.locator('.map-canvas').screenshot();
const vzorky = await p.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const vz = (x, y, w, h) => {
    const d = g.getImageData(x, y, w, h).data;
    let jas = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { jas += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    return Math.round(jas / n);
  };
  const W = img.width, H = img.height, s = Math.round(Math.min(W, H) * 0.09);
  /* Při výchozím pohledu na celou ČR je střed výřezu v Česku a pravý
     dolní roh v cizině (Rakousko / Slovensko). Projekce není potřeba. */
  return { uvnitr: vz(Math.round(W / 2 - s / 2), Math.round(H / 2 - s / 2), s, s),
    venku: vz(W - s - 4, H - s - 4, s, s), rozmer: W + '×' + H };
}, 'data:image/png;base64,' + png.toString('base64'));

pravda('mapa se vyfotila (jinak by se měřilo nic)', vzorky.uvnitr > 0 && vzorky.venku > 0, JSON.stringify(vzorky));
/* Bez závoje je cizina SVĚTLEJŠÍ než Česko (219 proti 202) a splývá.
   Se závojem musí být tmavší, a to znatelně — ne o pár jednotek. */
pravda('cizina je znatelně tmavší než Česko',
  vzorky.uvnitr - vzorky.venku >= 10,
  `Česko ${vzorky.uvnitr}, cizina ${vzorky.venku} — rozdíl ${vzorky.uvnitr - vzorky.venku} (bez závoje je to −17)`);

/* --- a mapa pořád funguje ----------------------------------------- */
await p.evaluate(() => document.querySelector('.map-canvas').scrollIntoView({ block: 'center' }));
await p.waitForTimeout(1000);
const bod = await p.evaluate(() => {
  const r = document.querySelector('.map-canvas').getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const e = document.elementFromPoint(x, y);
  return { x, y, pod: e ? e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '') : '' };
});
pravda('uprostřed mapy je pod kurzorem mapa, ne závoj',
  /leaflet-interactive/.test(bod.pod), `pod kurzorem: ${bod.pod}`);
await p.mouse.click(bod.x, bod.y);
await p.waitForTimeout(1800);
const vybrano = await p.evaluate(() => ((document.querySelector('#kraj-head') || {}).textContent || '').trim());
pravda('a klepnutím jde pořád vybrat kraj', /kraj|Praha|Vysočina/i.test(vybrano), `vybráno: „${vybrano.slice(0, 40)}"`);

await ctx.close(); await prohlizec.close();
console.log(`\nZtlumené okolí mapy: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Ztlumené okolí mapy: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
process.exit(0);
