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
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
const { BASE } = await import('./falesna-supabase-chat.mjs');

let ok = 0, chyb = 0; const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Ztlumené okolí mapy', zpravy);
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
/* MĚŘÍ SE PŘÍSPĚVEK ZÁVOJE, NE JAS DVOU MÍST.
   Dřív se porovnal střed výřezu (Česko) s pravým dolním rohem (cizina)
   a čekalo se, že Česko je aspoň o 10 jasnější. To ale měří dvě věci
   naráz: závoj NAD cizinou a sytost krajů POD Českem. A právě ta sytost
   se 25. 10. opravila (kraje se dřív stylovaly dřív, než se spočítaly
   jejich počty, takže všechny dostaly krytí pro „žádné nabídky" a nikdo
   je nepřebarvil — viz refreshKrajTips v js/main.js). Jak se kraje
   začaly barvit doopravdy, Česko ztmavlo z 211 na 198 a rozdíl proti
   cizině spadl na 3. Zkouška tím hlásila vadu u závoje, přestože závoj
   byl v pořádku a opravila se jiná věc.

   Měří se proto TÝŽ BOD se závojem a bez něj. To je přesně to, co
   zkouška tvrdí — „závoj cizinu ztmaví" — a sytost krajů do toho
   nemluví. Naměřeno na 1280 px: cizina 232 bez závoje, 195 se závojem,
   tedy −37; Česko 198 v obou případech, tedy 0 (závoj má mít uprostřed
   díru). Mez −10 leží třikrát pod naměřenou hodnotou.

   A JEŠTĚ JEDNA VĚC, KTEROU JE TŘEBA VĚDĚT: v tomhle prostředí mapa
   NEMÁ DLAŽDICE (podkladový server je ze zkoušek nedostupný, naměřeno
   0 hotových dlaždic i po devíti sekundách). Absolutní jasy proto
   popisují mapu bez podkladu a ladit podle nich krytí závoje by
   znamenalo ladit web pro stav, který nikdo nevidí. Rozdíl „se závojem
   proti bez závoje" je ale na podkladu nezávislý: závoj kreslí přes
   všechno, co je pod ním. */
const odber = async (src) => {
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
};
const mapaEl = p.locator('.map-canvas');
const foto = async () => 'data:image/png;base64,' + (await mapaEl.screenshot()).toString('base64');
const vzorky = await p.evaluate(odber, await foto());
/* Závoj se schová a týž bod se vyfotí znovu. Vrací se zpátky, ať
   kontroly níž měří web, a ne to, co jsem mu rozsvítil. */
await p.evaluate(() => { const m = document.querySelector('.pk-maska'); if (m) m.style.display = 'none'; });
await p.waitForTimeout(150);
const bez = await p.evaluate(odber, await foto());
await p.evaluate(() => { const m = document.querySelector('.pk-maska'); if (m) m.style.display = ''; });
await p.waitForTimeout(150);

pravda('mapa se vyfotila (jinak by se měřilo nic)', vzorky.uvnitr > 0 && vzorky.venku > 0, JSON.stringify(vzorky));
pravda('a schování závoje se na snímku projevilo (jinak se porovnávají dva totožné snímky)',
  bez.venku !== vzorky.venku, `cizina se závojem ${vzorky.venku}, bez ${bez.venku}`);
pravda('závoj cizinu znatelně ztmaví',
  bez.venku - vzorky.venku >= 10,
  `cizina bez závoje ${bez.venku}, se závojem ${vzorky.venku} — ubral ${bez.venku - vzorky.venku} (naměřeno −37)`);
/* A DÍRA UPROSTŘED: závoj má Česko vynechat, ne ztmavit taky. Bez téhle
   kontroly by prošel i závoj natažený přes celou mapu — ten by cizinu
   ztmavil stejně a Česko s ní. */
pravda('a Česka se nedotkne (závoj má uprostřed díru)',
  Math.abs(bez.uvnitr - vzorky.uvnitr) <= 3,
  `Česko bez závoje ${bez.uvnitr}, se závojem ${vzorky.uvnitr}`);

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
if (chyb) { console.error(`\n::error::Ztlumené okolí mapy: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
process.exit(0);
