// Test: karta nabídky se čte stejně na všech typech stránek.
//
// Spuštění: node scripts/test-karta-nabidky.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM a
//    PK_LEAFLET_DIR — viz ostatní zkoušky v prohlížeči)
//
// PROČ VZNIKLA. Karta na okresních, krajských a druhových stránkách si
// už dřív vzala plochu, obrys, stín i snímek z karty na úvodní stránce
// — „jedna karta na celý web" (viz komentář u .okr-item ve stylopisu).
// Co se tehdy nesrovnalo, je PÍSMO. Naměřeno 30. 10.:
//
//     nadpis karty   úvod 16/600 (monitor 18/600)  ·  okresy 16/700
//     cena           úvod 24/700                    ·  okresy 20/700
//
// Dva řezy na jeden nadpis a dvě velikosti na jednu cenu. Oko to vedle
// sebe pozná, i když to neumí pojmenovat — majitel přesně tohle řekl
// o celé kartě: „věci mají různou velikost, druh textu, celé to musíš
// sjednotit."
//
// CO SE MĚŘÍ: vykreslená velikost a řez, ne zápis ve stylopisu. A na
// OBOU šířkách, protože nadpis se na monitoru schválně zvětšuje —
// zkouška by jinak prošla i s kartou, která roste jen na jedné z nich.
//
// CO SE SCHVÁLNĚ NEMĚŘÍ: že je nadpisem na úvodu DRUH a na okresní
// stránce OBEC. To je rozdíl obsahu (seznam nabídek proti seznamu
// míst), ne vzhledu.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { pripravenoVypis, domUtichlo } from './zkouska-pripraveno.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Karta nabídky', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
  return !!vyslo;
}

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const KOREN = new URL('..', import.meta.url).pathname;
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));

/* Stránky se vybírají podle toho, co v repozitáři OPRAVDU je — jména
   okresů a krajů se mění s daty a napevno zapsané by zkouška jednou
   měřila prázdno. */
const soubory = readdirSync(KOREN);
const vyber = (p) => soubory.find((f) => p.test(f)) || null;
const STRANKY = ['index.html',
  'nove-pozemky.html',
  vyber(/^pozemky-okres-[a-z-]+\.html$/),
  vyber(/^pozemky-[a-z-]+-kraj\.html$/),
  vyber(/^pozemky-stavebni\.html$/)].filter(Boolean);

const RECEPT = (sel) => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e || !e.getClientRects().length) return null;
  const c = getComputedStyle(e);
  return Math.round(parseFloat(c.fontSize)) + '/' + c.fontWeight;
})()`;

const naLezeno = { nadpis: {}, cena: {} };

for (const [w, h, jm] of [[390, 844, 'telefon'], [1280, 900, 'monitor']]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700,
    deviceScaleFactor: 2, locale: 'cs-CZ', permissions: [] });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });

  for (const s of STRANKY) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    if (s === 'index.html') await pripravenoVypis(p).catch(() => {});
    await domUtichlo(p, 700);
    const v = await p.evaluate(([a, b2]) => [eval(a), eval(b2)],
      [RECEPT('.opp-item .opp-druh, .okr-item .okr-place'),
       RECEPT('.opp-item .opp-price, .okr-item .okr-cena b')]);
    const klic = jm + ' · ' + s;
    if (v[0]) (naLezeno.nadpis[v[0]] = naLezeno.nadpis[v[0]] || []).push(klic);
    if (v[1]) (naLezeno.cena[v[1]] = naLezeno.cena[v[1]] || []).push(klic);
    await p.close();
  }
  await ctx.close();
}
await prohlizec.close();

/* Pojistka: kdyby se karta přejmenovala, měřilo by se prázdno a zkouška
   by prošla, aniž by cokoli viděla. */
const kolik = (co) => Object.values(co).reduce((a, b) => a + b.length, 0);
pravda(`je co měřit — karta nabídky na ${STRANKY.length} typech stránek × 2 šířky`,
  kolik(naLezeno.nadpis) >= 2 * STRANKY.length - 1,
  `nadpis karty se našel jen ${kolik(naLezeno.nadpis)}×`);
pravda('a cena taky', kolik(naLezeno.cena) >= 2 * STRANKY.length - 1,
  `cena se našla jen ${kolik(naLezeno.cena)}×`);

const vypis = (co) => Object.entries(co)
  .map(([recept, kde]) => `${recept} (${kde.join(', ')})`).join('  |  ');

/* Nadpis se na monitoru schválně zvětšuje, takže se nehledá JEDEN
   recept, ale jeden recept NA ŠÍŘKU. */
for (const sirka of ['telefon', 'monitor']) {
  const recepty = Object.entries(naLezeno.nadpis)
    .filter(([, kde]) => kde.some((k) => k.startsWith(sirka)))
    .map(([r]) => r);
  pravda(`nadpis karty má na ${sirka}u jeden recept (${recepty.join(', ')})`,
    recepty.length === 1, 'nalezeno: ' + vypis(naLezeno.nadpis));
}
const ceny = Object.keys(naLezeno.cena);
pravda(`cena na kartě má jeden recept na celém webu (${ceny.join(', ')})`,
  ceny.length === 1, 'nalezeno: ' + vypis(naLezeno.cena));

console.log('\nKarta nabídky: jedno písmo na všech typech stránek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`\n::error::Karta nabídky: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
