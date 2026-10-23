/* Test: aria-controls a spol. musí ukazovat na prvek, který existuje.
 *
 * Spuštění: node scripts/test-aria-cile.mjs
 *   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ. Tyhle atributy jsou jediná vazba, kterou čtečka obrazovky má:
 * aria-controls říká „tohle tlačítko ovládá tamten panel", for u popisku
 * říká „patřím k tomuhle poli". Když cíl zmizí nebo se přejmenuje, nikde
 * se to neprojeví — stránka vypadá stejně, jen čtečka přestane vědět,
 * co k čemu patří. Přesně taková vada se nepozná pohledem.
 *
 * DRUHÁ VĚC, KTEROU TENHLE TEST MĚŘÍ: že každý ovladač má přístupné
 * JMÉNO. Je to tatáž vada z téhož důvodu — tlačítko bez jména se
 * odečítači ohlásí jako „tlačítko" a pohledem se to nepozná, protože
 * na obrazovce je na něm ikona. Naměřeno (oddíl 95): z 946 ovladačů na
 * dvanácti typech stránek neměl jméno jeden jediný, a byl to textarea,
 * který spoléhal na placeholder. Placeholder jméno pole NENÍ: zmizí,
 * jak se začne psát. Proto se tu počítá zvlášť a placeholder se za
 * jméno nebere.
 *
 * ZE STRÁNKY, NE ZE ZDROJÁKU. Zkusil jsem to nejdřív hledat v HTML a
 * vyšlo dvanáct nálezů, všech dvanáct planých: hlidani.html si záložky
 * skládá v JavaScriptu, takže ve zdrojáku stojí `id="hl-t-' + id + '"`
 * a textové hledání v tom vidí id „'" nebo „+". Ptát se musí prohlížeč,
 * až když je stránka hotová.
 */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Stránky, které mají záložky, rozbalovátka, formuláře a panely —
   tam tyhle vazby vůbec jsou. */
const STRANKY = ['hlidani.html', 'zpravy.html', 'muj-inzerat.html',
  'index.html', 'pridat.html', 'kolik-stoji-koupe-pozemku.html',
  'kupni-smlouva-pozemek.html', 'hypoteka-na-pozemek.html', 'kontakt.html'];
/* A jedna stránka pozemku. Přidala se kvůli jménům ovladačů — jediný
   nález z měření byl právě tam (poznámka u pozemku) a bez ní by ho
   zkouška neviděla. Bere se první podle abecedy, ať je volba
   zapsatelná a nezávisí na datech. */
const pozemek = readdirSync(new URL('..', import.meta.url))
  .filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
if (pozemek) STRANKY.push(pozemek);

let ok = 0, chyb = 0; const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Vazby ARIA', zpravy);
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
let vazeb = 0, ovladacu = 0; const poStrankach = {};

for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  /* PŘIHLÁŠENÝ, JINAK TENHLE TEST NIC NEMĚŘÍ. Záložky na Hlídání se
     skládají v JavaScriptu a právě ony byly důvod, proč test vznikl —
     jenže odhlášenému se místo nich vykreslí výzva k přihlášení.
     Změřeno: bez přihlášení našel na hlidani.html jedinou vazbu.
     Stejný falešný účet používá scripts/test-konzole.mjs. */
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1500);

  const v = await p.evaluate(() => {
    const ATR = ['aria-controls', 'aria-labelledby', 'aria-describedby',
      'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage'];
    const nalez = []; let pocet = 0;
    const popisPrvku = (e) => e.tagName.toLowerCase()
      + (e.id ? '#' + e.id : '')
      + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').filter(Boolean)[0] : '');
    for (const a of ATR) {
      document.querySelectorAll('[' + a + ']').forEach((e) => {
        const hodnota = (e.getAttribute(a) || '').trim();
        if (!hodnota) return;                 // prázdný atribut je úmyslné „nic"
        for (const cil of hodnota.split(/\s+/)) {
          pocet++;
          if (!document.getElementById(cil)) nalez.push(`${popisPrvku(e)}  ${a}="${cil}"`);
        }
      });
    }
    /* label for= se chová stejně, ale míří i na name= u radiových
       skupin v některých starých vzorech — kontrolujeme jen for na
       <label>, kde je cílem vždy id. */
    document.querySelectorAll('label[for]').forEach((e) => {
      const cil = (e.getAttribute('for') || '').trim();
      if (!cil) return;
      pocet++;
      if (!document.getElementById(cil)) nalez.push(`label („${(e.textContent || '').trim().slice(0, 30)}")  for="${cil}"`);
    });
    /* ---- přístupná jména ovladačů ---- */
    const JMENO = (e) => {
      const al = (e.getAttribute('aria-label') || '').trim();
      if (al) return al;
      const lb = e.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb.split(/\s+/).map((i) => {
          const x = document.getElementById(i); return x ? (x.textContent || '').trim() : '';
        }).join(' ').trim();
        if (t) return t;
      }
      const txt = (e.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
      const ti = (e.getAttribute('title') || '').trim();
      if (ti) return ti;
      const img = e.querySelector('img[alt]');
      if (img && (img.getAttribute('alt') || '').trim()) return img.getAttribute('alt').trim();
      if (e.id) {
        const l = document.querySelector('label[for="' + e.id + '"]');
        if (l && (l.textContent || '').trim()) return (l.textContent || '').trim();
      }
      const l2 = e.closest ? e.closest('label') : null;
      if (l2 && (l2.textContent || '').trim()) return (l2.textContent || '').trim();
      return '';   // placeholder se za jméno NEBERE — viz hlavička
    };
    const OVLADACE = 'button, a[href], input:not([type="hidden"]), select, textarea,'
      + ' [role="button"], [role="tab"], [role="switch"]';
    const bezJmena = []; let ovladacu = 0;
    document.querySelectorAll(OVLADACE).forEach((e) => {
      ovladacu++;
      if (!JMENO(e)) {
        const r = e.getBoundingClientRect();
        bezJmena.push(popisPrvku(e) + (r.width > 0 && r.height > 0 ? '' : ' (zrovna skrytý)'));
      }
    });
    return { nalez: [...new Set(nalez)], pocet, bezJmena: [...new Set(bezJmena)], ovladacu };
  });

  vazeb += v.pocet;
  poStrankach[s] = v.pocet;
  ovladacu += v.ovladacu;
  pravda(`${s}: každá vazba vede na existující prvek (${v.pocet})`,
    v.nalez.length === 0, v.nalez.slice(0, 8).join('\n      '));
  pravda(`${s}: a každý ovladač má přístupné jméno (${v.ovladacu})`,
    v.bezJmena.length === 0, v.bezJmena.slice(0, 8).join('\n      '));
  await ctx.close();
}

/* POJISTKY PROTI MĚŘENÍ PRÁZDNA. Nestačí jedno velké číslo: nejdřív
   jsem sem napsal „aspoň 60 vazeb" podle ničeho a skutečnost byla 52.
   Mez je proto podle měření (52 dnes), a hlavně se zvlášť hlídá
   Hlídání — to je ta stránka, kvůli které test vznikl, a jediná, kde
   vazby staví JavaScript. Odhlášenému jich tam našel JEDNU, přihlášenému
   patnáct. Kdyby se přihlášení rozbilo, spadne tahle kontrola, a ne
   až někdo za půl roku. */
/* 52 → 43 PO ODEBRÁNÍ HAMBURGERU. Tlačítko neslo aria-controls="nav"
   a aria-expanded na každé měřené stránce, takže s ním zmizelo devět
   vazeb. Mez se proto snížila na naměřenou skutečnost — ne proto, aby
   zkouška prošla, ale aby zase hlídala těsně: kdyby teď ubyla jediná
   další, pozná se to. */
pravda(`a bylo vůbec co měřit (${vazeb} vazeb)`, vazeb >= 43,
  `nalezeno jen ${vazeb} vazeb — stránky se nenačetly`);
/* Druhá pojistka proti měření prázdna, zvlášť pro jména: mez je podle
   měření: na těchhle deseti stránkách 678. (Celé měření v oddílu 95 jich
   na dvanácti stránkách našlo 946 — jiný seznam stránek a delší čekání,
   proto jiné číslo.) */
pravda(`a bylo co měřit u jmen (${ovladacu} ovladačů)`, ovladacu >= 500,
  `nalezeno jen ${ovladacu} ovladačů — stránky se nenačetly`);
pravda(`a záložky na Hlídání se opravdu postavily (${poStrankach['hlidani.html'] || 0})`,
  (poStrankach['hlidani.html'] || 0) >= 10,
  'přihlášení nezabralo — bez něj se místo záložek vykreslí výzva k přihlášení a test nic neměří');

await prohlizec.close();
console.log('=== aria-cile ===');
console.log(zpravy.join('\n'));
console.log(`${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`::error::Vazby ARIA: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
/* Falešný server drží smyčku událostí naživu — bez tohohle by test po
   dopsání výsledku visel, až dokud by ho dávka nezabila. */
process.exit(0);
