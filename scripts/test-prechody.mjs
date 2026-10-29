// Test: co se při najetí nebo zaměření mění, to se mění měkce.
//
// Spuštění: node scripts/test-prechody.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Rozbor stylopisu 29. 10. našel 150 míst,
// která v :hover/:focus-visible/.active/:checked mění vzhled — barvu,
// pozadí, rám, stín, posun, průhlednost nebo filtr. U 93 z nich nebyl
// na tu vlastnost ŽÁDNÝ přechod: část webu reagovala měkce (karta ve
// výpisu, dlaždice), část cukla (pole formuláře, drobečky, odkazy
// v patičce, zavírací křížky). To je ten pocit „skoro hotové".
//
// PROČ SE TO MĚŘÍ V PROHLÍŽEČI, a ne ve stylopisu. Ze zápisu se nepozná,
// že .auth-eye je <button> a že na něj platí pravidlo pro rodinu
// ovladačů. Rozbor stylopisu proto hlásil padesát míst, která ve
// skutečnosti přechod mají. Čte se tedy VYPOČTENÝ styl: co prohlížeč
// doopravdy animuje.
//
// CO SE SCHVÁLNĚ NEHLÍDÁ: outline (prstenec zaměření má naskočit hned)
// a rozměry (ty by překreslovaly rozvržení na každém snímku).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Přechody', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Seznam míst se čte ze stylopisu, ne opisuje do zkoušky: když někdo
   přidá nový stav při najetí, zkouška si ho najde sama. */
/* KRESBA IKONY SE POČÍTÁ TAKY. Do 29. 10. tu fill ani stroke nebyly,
   takže hlídač neviděl, že „uložený" pozemek zabarví ikonu skokem
   (.opp-fav.on svg, .msv-ulozene.on svg). Měřeno bylo 27 pravidel pro
   fill a 28 pro stroke, z toho jen po dvou s přechodem (§217). */
const VLASTNOSTI = ['background-color', 'border-color', 'color', 'box-shadow', 'transform',
  'opacity', 'filter', 'fill', 'stroke'];
const css = ['../css/styles.css', '../css/pozemek-vlozeny.css']
  .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const mista = new Map();          // základní selektor → vlastnosti měněné stavem
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const telo = m[2];
  for (let sel of m[1].split(',')) {
    sel = sel.trim().split('\n').pop().trim();
    /* STAV SE NA WEBU PÍŠE DVĚMA ZPŮSOBY. Pseudotřídou (:hover) a TŘÍDOU,
       kterou nasadí JavaScript (.on u uloženého pozemku, .active
       u zapnutého filtru). Do 29. 10. tu byla jen první polovina —
       a tím hlídači unikalo přesně to, co jsem chtěl nově hlídat:
       „uložený" pozemek zabarvil ikonu skokem (.opp-fav.on svg).
       Doloženo sabotáží: po vyjmutí fill/stroke z receptu zkouška
       nejdřív NEPADLA, protože to místo vůbec neměřila (§217). */
    const STAV = /:(hover|focus-visible|active|checked)\b|\.(on|active|sel|vybran|zapnut|otevren)\b|\[aria-(pressed|selected|expanded)="true"\]/;
    if (!sel || sel.startsWith('@') || !STAV.test(sel)) continue;
    if (/::(before|after|-webkit-scrollbar)/.test(sel)) continue;   // pseudoprvek z DOM nevytáhneme
    const zaklad = sel
      .replace(/:(hover|focus-visible|focus|active|checked)\b/g, '')
      .replace(/\.(on|active|sel|vybran|zapnut|otevren)\b/g, '')
      .replace(/\[aria-(pressed|selected|expanded)="true"\]/g, '')
      .trim();
    if (!zaklad || zaklad.includes('*')) continue;
    for (const v of VLASTNOSTI) {
      const jm = v === 'background-color' ? 'background' : v;
      if (new RegExp('(^|;|\\s)' + jm + '\\s*:').test(telo)) {
        if (!mista.has(zaklad)) mista.set(zaklad, new Set());
        mista.get(zaklad).add(v);
      }
    }
  }
}

const STRANKY = ['index.html', 'cena-pozemku.html', 'hlidani.html', 'porovnani.html',
  'pridat.html', 'profil.html', 'kontakt.html', 'drazby-pozemku.html', 'muj-inzerat.html',
  'zpravy.html', 'pozemky-okres-zlin.html', 'inzerce.html',
  (adresaPozemku() || {}).url || 'pozemek.html'];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') {
    return r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  }
  return r.abort();
});
const p = await ctx.newPage();
const nalezeno = new Map();       // selektor → { chybi:[], kde }
let zmereno = 0;
let pokrytiCelkem = 0, pokrytiMeknou = 0;
for (const s of STRANKY) {
  await p.goto(BASE + '/' + s, { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(1800);
  const r = await p.evaluate((seznam) => {
    const out = [];
    for (const [sel, vlast] of seznam) {
      let prvky = [];
      try { prvky = [...document.querySelectorAll(sel)]; } catch (e) { continue; }
      const e = prvky.find((x) => { const rc = x.getBoundingClientRect(); return rc.width > 2 && rc.height > 2; });
      if (!e) continue;
      const cs = getComputedStyle(e);
      const vlastnosti = cs.transitionProperty.split(',').map((x) => x.trim());
      const casy = cs.transitionDuration.split(',').map((x) => parseFloat(x) || 0);
      const umi = (v) => vlastnosti.some((x, i) => (x === v || x === 'all') && (casy[i % casy.length] || 0) > 0);
      const chybi = vlast.filter((v) => !umi(v));
      out.push({ sel, chybi, mereno: true });
    }
    /* A POKRYTÍ CELÉ STRÁNKY, ne jen míst se stavem. Majitel: „udělej
       přechody úplně na všem, co se dá, ale jen jednoduché." Měří se
       proto, kolik viditelných prvků s textem nebo kresbou se vůbec
       UMÍ změnit měkce. Mapa se nepočítá — knihovna si dlaždice
       a značky překresluje sama (viz pravidlo v stylopisu). */
    let celkem = 0, meknou = 0;
    for (const e of document.querySelectorAll('*')) {
      const rc = e.getBoundingClientRect();
      if (!rc.width || !rc.height) continue;
      if (e.closest('.leaflet-container, .leaflet-pane, .kraj-lock, .pzm-mapa, .vm-mapa, .opp-map')) continue;
      const tg = e.tagName.toLowerCase();
      if (tg === 'html' || tg === 'body' || tg === 'script' || tg === 'style') continue;
      if (!e.textContent.trim() && !/^(svg|path|circle|rect|g|line|polygon|use|img|hr)$/.test(tg)) continue;
      const cs2 = getComputedStyle(e);
      celkem++;
      if (cs2.transitionProperty !== 'none' && parseFloat(cs2.transitionDuration) > 0) meknou++;
    }
    return { out, pokryti: { celkem, meknou } };
  }, [...mista].map(([k, v]) => [k, [...v]])).catch(() => ({ out: [], pokryti: { celkem: 0, meknou: 0 } }));
  pokrytiCelkem += r.pokryti.celkem;
  pokrytiMeknou += r.pokryti.meknou;
  for (const x of r.out) {
    zmereno++;
    if (x.chybi.length && !nalezeno.has(x.sel)) nalezeno.set(x.sel, { chybi: x.chybi, kde: s });
    if (!x.chybi.length) nalezeno.delete(x.sel);
  }
}
await prohlizec.close();

pravda(`je co měřit — míst se stavem při najetí nebo zaměření: ${mista.size}`,
  mista.size >= 80 && zmereno >= 80, `v stylopisu ${mista.size}, na stránkách změřeno ${zmereno}`);

const seznam = [...nalezeno].map(([sel, x]) => `${sel} — bez přechodu: ${x.chybi.join(', ')} (${x.kde})`);
pravda('co se při najetí nebo zaměření mění, mění se měkce',
  seznam.length === 0, seznam.slice(0, 20).join('\n      ') +
  (seznam.length > 20 ? `\n      … a dalších ${seznam.length - 20}` : ''));

/* POKRYTÍ. Naměřeno 29. 10. PŘED nasazením lehkého přechodu na texty
   a ikony: 4 023 viditelných prvků mimo mapu, z toho 1 821 (45 %)
   se umělo změnit měkce. Po nasazení 3 987 ze 4 023, tedy 99 %
   (zbytek jsou html, body a pár prvků uvnitř mapových vrstev).
   Mez je 95 %: níž už to znamená, že se pravidlo ztratilo nebo že
   ho někdo přebil, ne že se vzorek o kus posunul. */
const podil = pokrytiCelkem ? Math.round(pokrytiMeknou / pokrytiCelkem * 100) : 0;
pravda(`texty a ikony se mění měkce (${podil} % z ${pokrytiCelkem} prvků mimo mapu)`,
  pokrytiCelkem >= 2000 && podil >= 95,
  `změřeno ${pokrytiMeknou} z ${pokrytiCelkem}; čekáno aspoň 95 % a vzorek aspoň 2 000 prvků`);

/* ---- STISK: jedno gesto na celý web ----
   Naměřeno 29. 10.: 31 pravidel pro :active a SEDM různých gest —
   translateY(1px), scale(.97), scale(.99), scale(.94), scale(1.2),
   posun do strany, posun o nulu. Web tím reagoval na kliknutí
   pokaždé jinak. Teď je jedno: o pixel dolů.
   Čte se zápis, ne vypočtený styl: stisk se v prohlížeči nedá
   spolehlivě vyvolat na všech prvcích najednou, a hodnota je tu
   doslovná, takže zápis stačí. */
const STISK = 'translateY(1px)';
const VYJIMKY_STISK = new Map([
  /* Záložka „Uložit" nedělá stisk, ale POTVRZENÍ: poskočí, aby bylo
     vidět, že se rozhodnutí zapsalo. */
  ['.opp-fav:active', 'scale(1.2)'],
]);
const jinyStisk = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const t = m[2].match(/transform\s*:\s*([^;}]+)/);
  if (!t) continue;
  for (let sel of m[1].split(',')) {
    sel = sel.trim().split('\n').pop().trim();
    if (!/:active\b/.test(sel)) continue;
    const hod = t[1].trim();
    if (VYJIMKY_STISK.get(sel) === hod) continue;
    if (!hod.includes(STISK)) jinyStisk.push(`${sel}: ${hod}`);
  }
}
pravda(`stisk je jedno gesto (${STISK})`, jinyStisk.length === 0, jinyStisk.join('\n      '));
/* A výjimka, která by přestala platit, by tu jen tiše ležela. */
const mrtveVyjimky = [...VYJIMKY_STISK.keys()].filter((k) => !css.includes(k.split(':active')[0] + ':active'));
pravda('a vypsaná výjimka ze stisku opravdu existuje', mrtveVyjimky.length === 0, mrtveVyjimky.join(', '));

console.log('\nPřechody: co se mění, mění se měkce');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Přechody: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
