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
 * ZE STRÁNKY, NE ZE ZDROJÁKU. Zkusil jsem to nejdřív hledat v HTML a
 * vyšlo dvanáct nálezů, všech dvanáct planých: hlidani.html si záložky
 * skládá v JavaScriptu, takže ve zdrojáku stojí `id="hl-t-' + id + '"`
 * a textové hledání v tom vidí id „'" nebo „+". Ptát se musí prohlížeč,
 * až když je stránka hotová.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Stránky, které mají záložky, rozbalovátka, formuláře a panely —
   tam tyhle vazby vůbec jsou. */
const STRANKY = ['hlidani.html', 'zpravy.html', 'muj-inzerat.html',
  'index.html', 'pridat.html', 'kolik-stoji-koupe-pozemku.html',
  'kupni-smlouva-pozemek.html', 'hypoteka-na-pozemek.html', 'kontakt.html'];

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
let vazeb = 0; const poStrankach = {};

for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
    return { nalez: [...new Set(nalez)], pocet };
  });

  vazeb += v.pocet;
  poStrankach[s] = v.pocet;
  pravda(`${s}: každá vazba vede na existující prvek (${v.pocet})`,
    v.nalez.length === 0, v.nalez.slice(0, 8).join('\n      '));
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
pravda(`a záložky na Hlídání se opravdu postavily (${poStrankach['hlidani.html'] || 0})`,
  (poStrankach['hlidani.html'] || 0) >= 10,
  'přihlášení nezabralo — bez něj se místo záložek vykreslí výzva k přihlášení a test nic neměří');

await prohlizec.close();
console.log('=== aria-cile ===');
console.log(zpravy.join('\n'));
console.log(`${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`::error::Vazby ARIA: ${chyb} kontrol neprošlo.`); process.exit(1); }
/* Falešný server drží smyčku událostí naživu — bez tohohle by test po
   dopsání výsledku visel, až dokud by ho dávka nezabila. */
process.exit(0);
