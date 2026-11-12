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

/* NIC Z KARTY NESMÍ VYČNÍVAT (#301).
   Majitel našel na snímku z telefonu kartu s nápisem uříznutým hranou
   a jinde pilulky ležící 65 px MIMO stránku — a ani jeden z hlídačů
   vzhledu to neviděl, protože všichni měřili RECEPT (písmo, barvu,
   obrys), ne polohu. Recept přitom může být dokonalý a obsah stejně
   leze ven.
   CO SE MĚŘÍ. U každého viditelného potomka karty se porovná jeho
   vodorovná krabice s krabicí karty, a karta sama s šířkou okna.
   Tolerance je 1 px na zaokrouhlení prohlížeče; stín a obrys se do
   getBoundingClientRect nepočítají, takže měřit se smí natvrdo.
   PROČ JEN VODOROVNĚ. Svisle karta roste s obsahem a „vyčnívat" dolů
   je normální stav rozvržení. Vada, kterou majitel našel, je vždycky
   vodorovná: na telefonu není kam uhnout.
   CO SE VYJÍMÁ A PROČ. Prvky, které mají vyčnívat z podstaty: odznak
   přes roh snímku (.opp-odznak), skrytý text pro odečítače
   (.visually-hidden, 1 px s overflow:hidden) a cokoli, co si samo
   nastaví position:fixed — to z karty vystupuje záměrně.
   A HLAVNĚ: CO NĚKDO NAD TÍM OŘEZÁVÁ, TO VIDĚT NENÍ. Napoprvé tahle
   kontrola našla na úvodu osm nálezů a všechny byly nevinné: jsou to
   dlaždice <image> uvnitř náhledové mapy, které z ní čouhají o 58 až
   207 px — jenže mapa má `overflow:hidden`, takže je ořeže a na
   obrazovce po nich není ani čárka. Tak mapa funguje a vada to není.
   Nález se proto počítá, jen když mezi prvkem a kartou (kartu
   včetně) NIKDO neořezává. Pro vadu, kterou majitel našel, to platí:
   tam nic neořezávalo a nápis opravdu ležel mimo. */
const VYCNIVA = `(() => {
  const k = document.querySelector('.opp-item, .okr-item');
  if (!k) return null;
  const K = k.getBoundingClientRect();
  if (!K.width) return null;
  const ven = [];
  for (const e of k.querySelectorAll('*')) {
    if (!e.getClientRects().length) continue;
    const c = getComputedStyle(e);
    if (c.position === 'fixed') continue;
    if (e.classList.contains('visually-hidden')) continue;
    if (e.closest('.opp-odznak')) continue;
    let orezano = false;
    for (let o = e.parentElement; o && o !== k; o = o.parentElement) {
      const oc = getComputedStyle(o);
      if (oc.overflowX !== 'visible' || oc.overflowY !== 'visible') { orezano = true; break; }
    }
    if (orezano) continue;
    const r = e.getBoundingClientRect();
    const vlevo = Math.round(K.left - r.left);
    const vpravo = Math.round(r.right - K.right);
    if (vlevo > 1 || vpravo > 1) {
      /* SVG má className jako SVGAnimatedString, ne řetězec — jméno se
         proto skládá z tagu a atributu, aby hlášení dávalo smysl. */
      const jm = e.tagName.toLowerCase()
        + (e.id ? '#' + e.id : '')
        + (e.getAttribute('class') ? '.' + e.getAttribute('class').trim().split(/\s+/).join('.') : '');
      ven.push(jm + ' ' +
        (vlevo > 1 ? 'vlevo o ' + vlevo + ' px' : '') +
        (vpravo > 1 ? (vlevo > 1 ? ', ' : '') + 'vpravo o ' + vpravo + ' px' : ''));
    }
  }
  return { ven: ven.slice(0, 6), pocet: ven.length,
    kartaVen: Math.round(Math.max(0 - K.left, K.right - innerWidth)),
    /* Náhled nesmí být prázdná barevná plocha: buď v něm leží obrázek,
       nebo aspoň něco vidět (text, kresba). „Bílá díra" z majitelova
       snímku byla právě tohle — deska bez obsahu. */
    nahledPrazdny: (() => {
      const n = k.querySelector('.opp-foto, .okr-foto, .opp-nahled');
      if (!n) return false;
      if (n.querySelector('img, svg, picture')) return false;
      return (n.textContent || '').trim() === '';
    })() };
})()`;

const naLezeno = { nadpis: {}, cena: {} };
const vycnivani = [];

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
    const vy = await p.evaluate(VYCNIVA);
    if (vy) vycnivani.push(Object.assign({ kde: klic }, vy));
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

/* --- NIC NEVYČNÍVÁ ------------------------------------------------ */
pravda(`je co měřit — karta se našla na ${vycnivani.length} místech`,
  vycnivani.length >= STRANKY.length,
  'karta se našla jen ' + vycnivani.length + '× — měřilo by se prázdno');
for (const v of vycnivani) {
  pravda(`${v.kde}: nic z karty nevyčnívá do stran`,
    v.pocet === 0, v.ven.join(' · '));
  pravda(`${v.kde}: a karta sama se vejde do okna`,
    v.kartaVen <= 1, 'přesahuje o ' + v.kartaVen + ' px');
  pravda(`${v.kde}: náhled není prázdná plocha`, v.nahledPrazdny === false,
    'náhled nemá ani obrázek, ani text');
}

console.log('\nKarta nabídky: jedno písmo na všech typech stránek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`\n::error::Karta nabídky: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
