/* Test: říká barva odznaku na mapě pravdu o tom, co je pod ním?
 *
 * Spuštění: PW_CHROMIUM=… PK_LEAFLET_DIR=… node scripts/test-shluky.mjs
 *
 * SKUTEČNÁ VADA, KTERÁ TO VYVOLALA. V shlukBarva() stálo bez jakékoli
 * podmínky „dražba a exekuce mají přednost i v menšině":
 *     if (m.exekuce) return TYPE.exekuce.color;
 *     if (m.drazba)  return TYPE.drazba.color;
 * V datech je 1 852 nabídek na prodej (92 %), 127 dražeb (6 %) a 35
 * exekucí (1,7 %). Těch pětatřicet je po republice rozsypaných tak, že
 * skoro každý kraj aspoň jednu má — a stačila jedna, aby celý odznak
 * zčervenal. Dvanáct ze čtrnácti krajových odznaků proto svítilo vínově
 * nebo oranžově nad kobercem modrých teček: mapa tvrdila „tady jsou
 * dražby", zatímco pod ní bylo z devíti desetin zboží na prodej.
 *
 * CO SE HLÍDÁ. Ne pravidlo, ale jeho následek, a tak, aby se to dalo
 * ověřit okem na mapě: BARVA ODZNAKU MUSÍ PATŘIT DRUHU, KTERÝ MÁ ASPOŇ
 * ČTVRTINU NABÍDEK POD NÍM. Kdyby se někdo vrátil k „stačí jedna
 * exekuce", zkouška zčervená, protože exekuce je 1,7 %. A kdyby se
 * naopak zrušila přednost úplně, nestane se nic — to je v pořádku,
 * tohle není zkouška na pořadí, ale na to, aby barva nelhala.
 *
 * Druhá věc: odznaky se nesmí překrývat. Čtrnáct koleček na mapě široké
 * 350 px se bez rozestrkání překrývalo v sedmi dvojicích a jedno bylo
 * zakryté celé — prst pak mířil na jiný kraj, než na který ukazoval.
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');
const PODIL = 0.25;   // stejný práh jako v js/main.js

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const [W, H] of [[390, 844], [1280, 900]]) {
  const ctx = await prohlizec.newContext({ viewport: { width: W, height: H },
    deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
      const f = path.join(LEAFLET, path.basename(u.pathname));
      if (existsSync(f)) return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  const p = await ctx.newPage();
  const nactena = await p.goto(`${BASE}/index.html#mapa`, { waitUntil: 'domcontentloaded' })
    .then((r) => r && r.ok()).catch(() => false);
  if (!nactena) { pravda(`${W} px: úvodní stránka se načetla`, false, 'stránka nedojela'); await ctx.close(); continue; }
  await p.waitForTimeout(3000);
  /* Na telefonu je mapa schovaná za přepínačem „Seznam / Mapa" — bez
     klepnutí má nulovou velikost a Leaflet značky vůbec nerozmístí. */
  const prepinac = await p.$('.mvt-btn[data-mv="mapa"]');
  if (prepinac) {
    await p.evaluate(() => { const t = document.querySelector('.mv-toggle'); if (t) t.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(500);
    try { await prepinac.click({ timeout: 4000 }); }
    catch (e) { await p.evaluate(() => { const x = document.querySelector('.mvt-btn[data-mv="mapa"]'); if (x) x.click(); }); }
    await p.waitForTimeout(1500);
  }
  await p.evaluate(() => { const m = document.querySelector('.leaflet-container'); if (m) m.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(3000);

  const v = await p.evaluate(() => {
    const data = window.PK_SHLUKY || null;
    const odz = [...document.querySelectorAll('.pk-shluk-kraj')].map((obal) => {
      const span = obal.querySelector('.pk-shluk');
      const q = span.getBoundingClientRect();
      return { popis: obal.getAttribute('title') || obal.getAttribute('alt') || '',
        n: parseInt(span.textContent.trim(), 10),
        barva: getComputedStyle(span).getPropertyValue('--sh').trim().toUpperCase(),
        x: q.left + q.width / 2, y: q.top + q.height / 2, r: q.width / 2 };
    });
    return { data, odz };
  });

  /* Pojistka proti průchodu na prázdnu: bez odznaků a bez dat by všechna
     tvrzení níž byla pravdivá o prázdné množině. */
  pravda(`${W} px: na přehledu republiky jsou krajové odznaky`,
    v.odz.length >= 10, `nalezeno ${v.odz.length}`);
  pravda(`${W} px: a ke každému známe rozpad po druzích`,
    !!(v.data && v.data.krajove && v.data.shluky && v.data.shluky.length >= 10
       && v.data.shluky.every((s) => s.typy && Object.keys(s.typy).length)),
    JSON.stringify(v.data && v.data.shluky && v.data.shluky.slice(0, 2)));
  if (!v.odz.length || !(v.data && v.data.shluky)) { await ctx.close(); continue; }

  /* Druhá pojistka: kdyby v datech nebyla ani jedna dražba nebo exekuce,
     neměla by tahle zkouška co chytat a prošla by sama od sebe. */
  const celkem = {};
  for (const s of v.data.shluky) for (const t in s.typy) celkem[t] = (celkem[t] || 0) + s.typy[t];
  pravda(`${W} px: v datech jsou i dražby nebo exekuce, je tedy co plést`,
    (celkem.drazba || 0) + (celkem.exekuce || 0) > 0, JSON.stringify(celkem));

  /* Barva → druh. Čte se z palety stránky, ne z pevně opsaných řetězců,
     aby zkouška nezastarala při změně palety. */
  const paleta = await p.evaluate(() => {
    const st = getComputedStyle(document.documentElement);
    const m = {};
    for (const [t, v2] of [['sale', '--c-sale'], ['drazba', '--c-drazba'], ['exekuce', '--c-exekuce'],
      ['obec', '--c-obec'], ['majitel', '--c-majitel']]) m[st.getPropertyValue(v2).trim().toUpperCase()] = t;
    return m;
  });

  const lzi = [];
  for (const o of v.odz) {
    const jmeno = (o.popis.split('—')[0] || '').trim();
    const s = v.data.shluky.find((x) => x.kraj === jmeno) || v.data.shluky.find((x) => x.n === o.n);
    if (!s) { lzi.push(`${o.popis.slice(0, 30)}: k odznaku se nenašla data`); continue; }
    const druh = paleta[o.barva];
    if (!druh) { lzi.push(`${jmeno}: barva ${o.barva} není z palety druhů`); continue; }
    const podil = (s.typy[druh] || 0) / s.n;
    if (podil < PODIL) {
      lzi.push(`${jmeno}: odznak má barvu druhu „${druh}", ale ten je `
        + `${(s.typy[druh] || 0)} z ${s.n} = ${(podil * 100).toFixed(1)} %`);
    }
  }
  pravda(`${W} px: barva odznaku patří druhu, kterého je pod ním aspoň ${PODIL * 100} % (${v.odz.length} odznaků)`,
    lzi.length === 0, lzi.slice(0, 6).join('\n      '));

  const prekryvy = [];
  for (let i = 0; i < v.odz.length; i++) for (let j = i + 1; j < v.odz.length; j++) {
    const a = v.odz[i], b = v.odz[j];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < a.r + b.r) prekryvy.push(`${a.n} × ${b.n}: ${Math.round(a.r + b.r - d)} px přes sebe`);
  }
  pravda(`${W} px: žádné dva odznaky neleží přes sebe`, prekryvy.length === 0,
    prekryvy.slice(0, 5).join(', '));

  await ctx.close();
}

await prohlizec.close();
console.log('\nOdznaky shluků na mapě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Shluky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
