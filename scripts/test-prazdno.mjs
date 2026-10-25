// Test: pod obsahem nezůstává díra a kotvy nekončí pod hlavičkou.
//
// Spuštění: node scripts/test-prazdno.mjs   (potřebuje prohlížeč)
//
// DVĚ VĚCI, KTERÉ NAHLÁSIL ČLOVĚK, NE ZKOUŠKA — a obě byly skutečné.
//
// 1) PRÁZDNO POD OBSAHEM. Stránky hlídání, upozornění a mého inzerátu
//    měly `main.ceka-na-skript{min-height:calc(100vh - 90px)}`. Záměr byl
//    dobrý: než doběhnou skripty, vyhradit první obrazovku, ať obsah
//    neodskočí. Jenže o kus níž už stálo `body{display:flex;
//    min-height:calc(100vh - hlavička)}` a `body > main{flex:1 0 auto}`,
//    což dělá totéž — a druhá výška se k tomu PŘIČETLA. Navíc se počítala
//    od celé výšky okna, přestože main začíná až pod hlavičkou.
//    Naměřeno na krátkém obsahu: main 754 px, obsah skončil na 393 px,
//    patička začala na 847 px — tedy 454 px prázdna. Po zrušení 8 px.
//
// 2) KOTVY POD HLAVIČKOU. Hlavička je pevná a měří 85 px. Odsazení pro
//    kotvy přitom dělalo jediné pravidlo `section[id]{scroll-margin-top:
//    80px}` — o pět pixelů míň, než hlavička měří, a jen pro <section>
//    s id. Cíl tedy skončil POD hlavičkou a člověk nevidí, kam skočil.
//
// Obě kontroly měří vykreslenou stránku, ne stylopis: právě proto, že
// v stylopisu to vypadalo v pořádku na obou místech zvlášť.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { PORT } from './port-zkousky.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

let ok = 0, chyb = 0; const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Prázdno', zpravy);
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const TYPY = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const srv = createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': TYPY[path.extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/* Stránky, které obsah dostávají až ze skriptu — tedy ty, kterých se
   vyhrazená výška týkala — plus pár běžných pro srovnání. */
const STRANKY = ['hlidani.html', 'muj-inzerat.html', 'zpravy.html',
  'kontakt.html', 'kupni-smlouva-pozemek.html', 'podminky.html'];
/* Kolik prázdna se ještě snese. Odstup mezi posledním obsahem a patičkou
   je normální (sekce mají spodní odsazení); 454 px není. */
const MEZ = 170;

async function otevri(sirka) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: sirka, height: 844 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  return ctx;
}

const diry = [];
let zmereno = 0;
for (const sirka of [390, 1280]) {
  const ctx = await otevri(sirka);
  for (const st of STRANKY) {
    const p = await ctx.newPage();
    await p.addInitScript("try{localStorage.setItem('pk_rezim_v1','light')}catch(e){}");
    await p.goto(`http://127.0.0.1:${PORT}/${st}`, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const v = await p.evaluate(() => {
      const m = document.querySelector('main');
      const f = document.querySelector('footer');
      if (!m || !f) return null;
      const cs = getComputedStyle(m);
      /* NEJDŘÍV STRUKTURA, AŽ POTOM GEOMETRIE — a tohle je ten důvod.
         Zkoušel jsem to měřit jen geometricky (mezera mezi posledním
         obsahem a patičkou) a sabotáž mi neprošla do červena: na
         nepřihlášené stránce je obsah vysoký, takže se vyhrazená výška
         neprojeví. Projeví se až na krátkém obsahu — tedy přesně tam,
         kde to člověk viděl, a kam se zkouška bez přihlášení nedostane.
         Proto se kontroluje i to, že si main žádnou vlastní nejmenší
         výšku nenese: rozvržení ji nepotřebuje, body je flex a
         `body > main{flex:1 0 auto}` první obrazovku vyhradí samo. */
      const mh = cs.minHeight;
      const vlastniVyska = mh && mh !== 'auto' && mh !== '0px';
      const vse = [...m.querySelectorAll('*')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.width > 0 && getComputedStyle(e).visibility !== 'hidden';
      });
      const spodek = vse.length ? Math.max(...vse.map((e) => e.getBoundingClientRect().bottom + window.scrollY)) : 0;
      const fy = f.getBoundingClientRect().top + window.scrollY;
      return { minHeight: mh, vlastniVyska, prazdno: Math.round(fy - spodek),
               stranka: document.documentElement.scrollHeight, okno: window.innerHeight };
    });
    await p.close();
    if (!v) continue;
    zmereno++;
    if (v.vlastniVyska) diry.push(`${st} @${sirka}px: main si nese min-height ${v.minHeight} — rozvržení ji nepotřebuje a na krátkém obsahu z ní vznikne díra`);
    else if (v.stranka > v.okno + 2 && v.prazdno > MEZ) {
      diry.push(`${st} @${sirka}px: ${v.prazdno} px prázdna pod obsahem (stránka ${v.stranka} px)`);
    }
  }
  await ctx.close();
}
/* PŘEDPOKLAD: bez změřených stránek by „žádná díra" byla pravda o ničem. */
pravda(`je co měřit (${zmereno} vykreslených stránek)`, zmereno >= 10, 'jen ' + zmereno);
pravda(`pod obsahem nezůstává díra (mez ${MEZ} px)`, diry.length === 0, diry.join('\n      '));

/* --- Kotvy ---------------------------------------------------------- */
const podHlavickou = [];
let kotevZkouseno = 0;
/* ZKOUŠÍ SE TO, CO NENÍ <section>. Odsazení pro kotvy dělalo jediné
   pravidlo `section[id]`, takže cíl na jiné značce odsazení NEMĚL a
   skončil celý pod hlavičkou. V repozitáři jsou takové dva druhy:
   odkaz „Přeskočit na obsah" míří na <main id="obsah"> (na 33 ručně
   psaných stránkách — tedy právě ta cesta, kterou chodí člověk od
   klávesnice a odečítače obrazovky), a pravidla-inzerce.html#nahlasit
   míří na <div>. Na <section> defekt vidět nebyl, protože hlavička se
   při odrolování smrskne z 85 na 69 px a osmdesátka jí stačila. */
const KOTVY = [
  ['pravidla-inzerce.html', '#nahlasit'],
  ['podminky.html', '#obsah'],
  ['kupni-smlouva-pozemek.html', '#obsah'],
  ['index.html', '#mapa'],
];
{
  const ctx = await otevri(390);
  for (const [stranka, kotva] of KOTVY) {
    const p = await ctx.newPage();
    await p.addInitScript("try{localStorage.setItem('pk_rezim_v1','light')}catch(e){}");
    await p.goto(`http://127.0.0.1:${PORT}/${stranka}`, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const je = await p.evaluate((h) => !!document.querySelector(h), kotva);
    if (!je) { await p.close(); continue; }
    /* Posune se o kus dolů, ať skok na kotvu opravdu nějaký je —
       a ať hlavička není ve svém smrsklém stavu zvýhodněná. */
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(200);
    await p.evaluate((h) => { location.hash = h; }, kotva);
    await p.waitForTimeout(1200);
    const v = await p.evaluate((h) => {
      const c = document.querySelector(h), hl = document.getElementById('header');
      const vys = hl ? hl.getBoundingClientRect().height : 0;
      const r = c.getBoundingClientRect();
      return { top: Math.round(r.top), hlavicka: Math.round(vys), znacka: c.tagName.toLowerCase(),
               odsazeni: getComputedStyle(c).scrollMarginTop,
               odsazeniKorene: getComputedStyle(document.documentElement).scrollPaddingTop };
    }, kotva);
    kotevZkouseno++;
    /* Nekontroluje se jen, kde cíl skončil (to u kotvy na vrchu stránky
       nic neřekne), ale i že odsazení vůbec existuje a je aspoň tak
       velké jako hlavička. Bez toho sabotáž „zpátky na 80 px" projde. */
    const odsazeniPx = Math.max(parseFloat(v.odsazeni) || 0, parseFloat(v.odsazeniKorene) || 0);
    if (v.top < v.hlavicka - 1) {
      podHlavickou.push(`${stranka}${kotva} <${v.znacka}>: vrch ${v.top} px, hlavička ${v.hlavicka} px`);
    } else if (odsazeniPx < v.hlavicka) {
      /* MĚŘENÁ VÝŠKA, NE NAPSANÉ ČÍSLO. Dřív tu stálo `< 85` — výška
         hlavičky z doby, kdy ji psali. Když se hlavička na telefonu
         zmenšila na 65 px, odsazení kotev se zmenšilo s ní (počítá se
         z --vyska-hlavicky) a kontrola spadla, přestože kotva skončila
         přesně tam, kde má. Číslo naladěné na včerejší rozvržení
         nehlídá rozvržení, hlídá to číslo. */
      podHlavickou.push(`${stranka}${kotva} <${v.znacka}>: odsazení jen ${odsazeniPx} px, hlavička měří ${v.hlavicka} px`);
    }
    await p.close();
  }
  await ctx.close();
}
pravda(`kotvy se opravdu zkoušely (${kotevZkouseno})`, kotevZkouseno >= 3, 'jen ' + kotevZkouseno);
pravda('žádná kotva neskončí pod hlavičkou', podHlavickou.length === 0, podHlavickou.join('\n      '));

/* --- 3) CO SE VYKRESLÍ, MUSÍ BÝT VIDĚT -------------------------------
 *
 * Třetí díra, a tahle byla nejhorší, protože v ní obsah BYL. Oddíl
 * „Pozemky přímo od majitelů" na úvodní stránce dostává obsah ze skriptu
 * a ten mu při tom přepisoval `className` na
 * `'odl-wrap odl-empty reveal is-visible'`. Na `.is-visible` ale není
 * v žádném stylopisu jediné pravidlo (ověřeno i v očištěných kopiích);
 * viditelnost dělá `.reveal.in{opacity:1}`. Blok tedy zůstal na
 * `opacity:0` s posunem 22 px — naměřeno 259 px obsahu na telefonu
 * a 227 px na monitoru, pod nadpisem zela díra a výzva „Zatím tu žádné
 * nejsou — buďte první" se nikdy neukázala.
 *
 * Pozorovatel z bootu to zachránit nemohl: `querySelectorAll('.reveal')`
 * se čte na začátku a tenhle blok se staví až po dotažení dat; přepsání
 * className by mu navíc `in` smazalo, i kdyby ho přidat stihl.
 *
 * Měří se spočítaná opacity, ne jméno třídy: právě proto, že jméno
 * vypadalo správně a nefungovalo. */
{
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  /* Na výsledek, ne na čas: blok dostane obsah teprve z dat. */
  await p.waitForFunction(() => {
    const e = document.getElementById('user-listings');
    return !!e && e.children.length > 0;
  }, null, { timeout: 60000 }).catch(() => {});
  /* A pak na VÝSLEDEK, ne na čas: `.reveal` má přechod 0,4 s, takže
     hned po přidání `in` je opacity ještě někde mezi nulou a jedničkou.
     Čeká se tedy, až dojede — a když nedojede, kontrola níž to řekne
     i s tím, co na prvku zůstalo. */
  await p.waitForFunction(() => {
    const e = document.getElementById('user-listings');
    return !!e && getComputedStyle(e).opacity === '1';
  }, null, { timeout: 10000 }).catch(() => {});
  const m = await p.evaluate(() => {
    const e = document.getElementById('user-listings');
    if (!e) return null;
    const cs = getComputedStyle(e);
    return { deti: e.children.length, trida: e.className,
      opacity: parseFloat(cs.opacity), vyska: Math.round(e.getBoundingClientRect().height),
      vidi: [...e.children].filter((x) => x.getClientRects().length).length };
  });
  // PŘEDPOKLAD: bez obsahu by se neměřila viditelnost, ale prázdno
  pravda('oddíl „přímo od majitelů" dostal obsah, je co měřit',
    !!m && m.deti > 0 && m.vyska > 50,
    m ? `dětí ${m.deti}, výška ${m.vyska} px` : 'prvek #user-listings na stránce není');
  if (m && m.deti > 0) {
    pravda(`a je vidět (opacity ${m.opacity}, výška ${m.vyska} px, vidět ${m.vidi} z ${m.deti})`,
      m.opacity === 1 && m.vidi === m.deti,
      `třída „${m.trida}" — na .is-visible není pravidlo, viditelnost dělá .reveal.in`);
  }
  await ctx.close();
}

await prohlizec.close();
srv.close();

console.log('\nPrázdno pod obsahem a kotvy pod hlavičkou');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 6)) {
    console.log('::error::Prázdno: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Prázdno: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
