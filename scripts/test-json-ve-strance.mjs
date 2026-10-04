// Zkouška: JSON uvnitř <script> nesmí jít rozbít textem z cizího webu.
//
// Spuštění: node scripts/test-json-ve-strance.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Generované stránky nesou dvě JSONová data rovnou v HTML: strojový popis
// pro vyhledávače (ld+json) a předání „která nabídka to je" skriptu
// (window.PK_POZEMEK). Skládaly se přes JSON.stringify, který ale
// neescapuje „<". Obsah <script> je v HTML surový text a končí PRVNÍM
// „</scr" + "ipt" — že je ten výskyt uvnitř řetězce v JSONu, nikoho
// nezajímá. Názvy obcí přitom sbírá robot z cizích dražebních rejstříků
// a inzertních webů. Stačilo, aby se do jednoho dostalo
// „</scr" + "ipt><img src=x onerror=…>", a vznikla by statická stránka
// na parcelaka.cz, která spustí cizí kód každému, kdo ji otevře.
//
// Tady se to zkouší přímo: do generátoru jde schválně jedovatý pozemek
// a kontroluje se, co z něj vyleze — jak čtením výsledku, tak otevřením
// té stránky v prohlížeči.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { stranka } from './generate-parcel-pages.mjs';
import { jsonVeStrance } from './json-do-stranky.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}

// Konec skriptu si skládáme ze dvou kusů, ať tenhle soubor sám není past.
const KONEC = '</scr' + 'ipt';
/* Jed schválně BEZ uvozovek: JSON.stringify si dvojité uvozovky uvnitř
   řetězce escapuje sám, takže „onerror=\"…\"" by se v HTML rozpadlo na
   „onerror=\\" a neprovedlo by se — zkouška by pak hlásila „nic se
   nespustilo" i u zcela rozbité stránky. Bez uvozovek se opravdu spustí. */
const JED = 'Kolín' + KONEC + '><img src=x onerror=window.__prusvih=1>';

/* --- 1) Samotná pomůcka na escapování ------------------------------- */
{
  const v = { t: JED, amp: 'A & B', ls: 'a' + String.fromCharCode(0x2028) + 'b' };
  const s = jsonVeStrance(v);
  pravda('escapovaný JSON v sobě nemá konec skriptu', s.toLowerCase().indexOf(KONEC) === -1,
    s.slice(0, 120));
  pravda('a přečte se z něj přesně původní text (nic se nezahodilo)',
    JSON.parse(s).t === JED && JSON.parse(s).amp === 'A & B'
    && JSON.parse(s).ls === 'a' + String.fromCharCode(0x2028) + 'b',
    JSON.stringify(JSON.parse(s)));
  pravda('a projde i jako JavaScript (kvůli window.PK_…)',
    (function () { try { return new Function('return ' + s)().t === JED; } catch (e) { return false; } })(),
    'oddělovače řádků U+2028/U+2029 shodí celý skript, když se nezapíšou unicodově');
  pravda('bez escapování by to konec skriptu obsahovalo (jinak zkouška nic neměří)',
    JSON.stringify(v).toLowerCase().indexOf(KONEC) !== -1);
}

/* --- 2) Stránka pozemku z generátoru -------------------------------- */
const sablona = fs.readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
const jedovaty = {
  place: JED, okres: 'Kolín', parcel: '123/4', druh: 'orná půda',
  area: 1000, price: 500000, lat: 50.02, lng: 15.2, type: 'sale', extra: 'prodej',
};
const h = stranka(sablona, jedovaty);
{
  pravda('jedovatý název se do stránky vůbec dostal (jinak zkouška nic neměří)',
    h.indexOf('&lt;/scr') !== -1,
    've viditelném textu stránky není ani zneškodněná podoba jedu — text se zahodil'
    + ' někde jinde a všechny zkoušky pod tím by mlčely');
  pravda('ve stránce nevznikla značka <img z názvu obce',
    !/<img[^>]*onerror/i.test(h),
    (h.match(/<img[^>]*onerror[^>]*>/i) || [''])[0]);
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h);
  pravda('strojový popis (ld+json) ve stránce je', !!ld);
  if (ld) {
    let o = null, chybaJson = '';
    try { o = JSON.parse(ld[1]); } catch (e) { chybaJson = e.message; }
    pravda('a je to platný JSON', !!o, chybaJson);
    /* Od doplnění drobečků je ve stránce POLE dvou záznamů (Place
       a BreadcrumbList), ne jeden objekt — místo se čte z toho prvního.
       Kontrola si ho proto najde podle typu, ne podle pořadí: jinak by
       se rozbila při každém dalším záznamu, který někdo přidá. */
    const misto = (Array.isArray(o) ? o : [o]).find((x) => x && x['@type'] === 'Place');
    pravda('a vyhledávač z něj přečte původní název obce',
      !!misto && misto.address && misto.address.addressLocality === JED,
      misto ? JSON.stringify(misto.address) : JSON.stringify(o));
  }
  const pk = /window\.PK_POZEMEK=([^\n]*?);<\/script>/.exec(h);
  pravda('předání pozemku skriptu (window.PK_POZEMEK) ve stránce je', !!pk);
  if (pk) {
    let o = null, chybaJs = '';
    try { o = new Function('return ' + pk[1])(); } catch (e) { chybaJs = e.message; }
    pravda('a skript z něj dostane klíč s původním názvem obce',
      !!o && typeof o.k === 'string' && o.k.indexOf(JED) === 0,
      o ? JSON.stringify(o.k) : chybaJs);
  }
}

/* --- 3) Stránky krajů a okresů ------------------------------------- */
/* Tady se nečte výsledek, ale zdroj — a je to schválně. Generátor krajů
   a okresů je jeden dlouhý skript, který se při načtení celý rozběhne
   a přepíše stránky v repozitáři; zavolat z něj jedinou funkci nejde,
   aniž by zkouška sama přegenerovala web. Hlavička je přitom JEDINÉ
   místo, kde ten generátor vkládá JSON do <script> (stránky okresů,
   krajů, dražeb i cen ji všechny skládají přes ni), takže stačí ověřit,
   že tam nezůstal JSON.stringify. Do výpisu nabídek na okresní stránce
   se přitom dostávají názvy obcí z cizích webů — je to tentýž jed jako
   u stránky pozemku. */
{
  const zdroj = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-region-pages.mjs'), 'utf8');
  const radek = /const jsonld = ldArr\.length \? ([A-Za-z.]+)\(/.exec(zdroj);
  pravda('hlavička stránek krajů a okresů skládá ld+json escapovaně', !!radek && radek[1] === 'jsonVeStrance',
    radek ? 'skládá se přes ' + radek[1] : 'řádek s jsonld se v generátoru nenašel — zkouška je na přepsání');
  pravda('a pomůcku si opravdu načítá', /from '\.\/json-do-stranky\.mjs'/.test(zdroj),
    'import scripts/json-do-stranky.mjs v generátoru chybí');
  pravda('a jinde v generátoru už žádný JSON do <script> nejde (jinak by opravu obešel)',
    (zdroj.match(/application\/ld\+json/g) || []).length === 1,
    'míst s ld+json je ' + (zdroj.match(/application\/ld\+json/g) || []).length + ', ne jedno');
}

/* --- 4) A totéž prohlížečem ----------------------------------------- */
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
// Playwright zkouší obsluhy v OBRÁCENÉM pořadí registrace, takže ta
// nejobecnější (vše) musí jít PRVNÍ — jinak by přebila tu konkrétní,
// stránka by se vůbec nenačetla a všechny zkoušky pod tím by mlčely.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: "window.PK_SUPABASE_URL='" + BASE + "';window.PK_SUPABASE_KEY='anon';" }));
await ctx.route('**/__jed-pozemek.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: h }));
const p = await ctx.newPage();
await p.goto(BASE + '/__jed-pozemek.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const v = await p.evaluate(() => {
  const ldEl = document.querySelector('script[type="application/ld+json"]');
  let ldOk = 'chybí', misto = '';
  if (ldEl) {
    try {
      const o = JSON.parse(ldEl.textContent); ldOk = 'ano';
      const m = (Array.isArray(o) ? o : [o]).find((x) => x && x['@type'] === 'Place');
      misto = ((m || {}).address || {}).addressLocality || '';
    }
    catch (e) { ldOk = 'nešel přečíst: ' + e.message; }
  }
  return {
    prusvih: window.__prusvih == null ? 'nic' : String(window.__prusvih),
    obrazky: document.querySelectorAll('img[onerror], img[src="x"]').length,
    pkKlic: (window.PK_POZEMEK && window.PK_POZEMEK.k) || '',
    ldOk: ldOk, misto: misto,
  };
});
pravda('v prohlížeči se z názvu obce nic nespustilo', v.prusvih === 'nic', 'window.__prusvih = ' + v.prusvih);
pravda('a nevznikl žádný obrázek z vloženého kódu', v.obrazky === 0, 'obrázků ' + v.obrazky);
pravda('strojový popis šel v prohlížeči přečíst', v.ldOk === 'ano', v.ldOk);
pravda('a je v něm původní název obce', v.misto === JED, JSON.stringify(v.misto));
pravda('a skript dostal klíč s původním názvem obce', v.pkKlic.indexOf(JED) === 0, JSON.stringify(v.pkKlic));
await ctx.close();
await prohlizec.close();

console.log('\nJSON ve stránce — nejde rozbít cizím textem');
console.log(zpravy.join('\n'));
console.log('\n' + ok + ' v pořádku, ' + chyb + ' chyb\n');
if (chyb) { console.log('::error::JSON ve stránce: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
