/* Test: kontrola fotek běží — a běží z našeho serveru.
   ==================================================================
   Spuštění: node scripts/test-kontrola-fotek.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Fotku u nového inzerátu prohlížejí dva modely: MobileNet (co je na
   fotce vidět) a NSFWJS (jestli to není porno). Celá ta cesta je
   FAIL-OPEN — když se knihovna nenačte, model nedojede nebo klasifikace
   spadne, fotka se propustí. Je to správné rozhodnutí: vyhodit poctivou
   fotku je horší než pustit nepovedenou. Má to ale jeden důsledek:
   ROZBITÁ KONTROLA VYPADÁ ÚPLNĚ STEJNĚ JAKO KONTROLA, KTERÁ NIC
   NENAŠLA. Nic v repozitáři dosud neověřovalo, že vůbec běží.

   A druhá polovina: knihovny se stahovaly z cdn.jsdelivr.net, tedy cizí
   program spuštěný na stránce, kde člověk vyplňuje svůj kontakt, bez
   jakéhokoli ověření obsahu. Přestěhovaly se do vendor/ (viz
   vendor/tfjs/PUVOD.md) a tady se měří, že se tam opravdu chodí —
   kdyby byla cesta špatná, načtení selže tiše a zbytek webu si toho
   nevšimne.

   POZOR NA FOTKU, KTEROU SE TO ZKOUŠÍ. Jednobarevný obrázek se odmítne
   dřív, než na strojovou část vůbec dojde („je skoro jednobarevná —
   vyfoťte prosím pozemek"). Na tohle jsem při psaní naletěl: zkouška
   hlásila, že se knihovny nenačítají, a přitom se jen nikdy
   nedostala tam, kde se načítají. Kreslí se proto obrázek s rozptylem.
   ================================================================== */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nKontrola fotek (že běží a odkud se bere)');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Kontrola fotek: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext();
  await ctx.route('**/config.js*', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';`,
  }));
  const p = await ctx.newPage();

  /* Evidence toho, kam stránka sáhla. Bez ní by se „bere se to z našeho
     serveru" dalo tvrdit jen podle zdrojového kódu — a ten se dá přečíst
     i tehdy, když se soubor na disku nejmenuje, jak se v kódu píše. */
  const zdroje = [];
  const cizi = [];
  p.on('request', (r) => {
    const u = r.url();
    if (/tf\.min\.js|nsfwjs\.min\.js|model\.json/.test(u)) zdroje.push(u.replace(BASE, ''));
    try {
      const h = new URL(u).hostname;
      if (h && h !== '127.0.0.1' && h !== 'localhost') cizi.push(h);
    } catch (e) { /* data: a blob: hostitele nemají */ }
  });
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));

  await p.goto(BASE + '/pridat.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const c = document.getElementById('prodej-card'); if (c) c.hidden = false; });

  /* --- 1) NÁHLED: MobileNet a knihovna z vendor/ --------------- */
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 520; c.height = 520;
    const cx = c.getContext('2d');
    const d = cx.createImageData(520, 520);
    for (let i = 0; i < d.data.length; i += 4) {
      const x = (i / 4) % 520, y = Math.floor((i / 4) / 520);
      d.data[i] = (x * 7 + y * 3) % 256;
      d.data[i + 1] = (y * 5 + 40) % 256;
      d.data[i + 2] = (x * 3 + y * 11) % 256;
      d.data[i + 3] = 255;
    }
    cx.putImageData(d, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'pozemek.png', { type: 'image/png' }));
    const inp = document.getElementById('p-fotky');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const nactenoTf = await p.waitForFunction(() => (window.tf && window.tf.loadLayersModel) ? true : false,
    { timeout: 20000 }).then(() => true).catch(() => false);
  pravda('knihovna pro rozpoznávání se načte', nactenoTf,
    'window.tf se neobjevilo — cesta do vendor/tfjs/ nebo soubor nesedí');
  pravda('a bere se z našeho serveru, ne z cizího CDN',
    zdroje.some((u) => u.startsWith('/vendor/tfjs/tf.min.js')),
    'požadavky na knihovny: ' + JSON.stringify(zdroje));

  /* Posudek se musí k nějakému výsledku dostat. Prázdný text by
     znamenal, že se cesta zasekla — a to je přesně ten stav, který
     fail-open zamlčí. */
  /* ČEKÁ SE NA HOTOVÝ POSUDEK, ne na jakýkoli text. „kontroluji…" je
     mezistav a první verze zkoušky ho brala za výsledek — hlásila pak,
     že model nerozhoduje, i když zrovna rozhodoval. */
  const posudek = await p.waitForFunction(() => {
    const e = document.querySelector('#p-fotky-preview .pp-stav');
    const t = e ? e.textContent.trim() : '';
    return (t && !/kontroluji/i.test(t)) ? t : false;
  }, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
  pravda('a náhled fotky dojde k posudku, ne k mlčení', !!posudek, 'posudek: ' + posudek);
  /* Šum není krajina, takže správná odpověď je „nevypadá jako fotka
     pozemku". Kdyby model mlčel nebo propouštěl všechno, tahle věta tam
     nebude — a kontrola by procházela i s vypnutým modelem. */
  pravda('a model opravdu rozhoduje: na šum řekne, že to není pozemek',
    !!posudek && /nevypadá jako fotka pozemku/.test(posudek), 'posudek: ' + posudek);
  pravda('a model se taky bere od nás', zdroje.some((u) => u.includes('/assets/mobilenet/model.json')),
    'požadavky: ' + JSON.stringify(zdroje));

  /* --- 2) NSFWJS: web si ji bere až při odeslání --------------- */
  /* Při náhledu se nenačítá — spouští ji až odeslání formuláře
     (contentOk v js/pridat.js). Aby se dalo ověřit, že ten druhý
     přestěhovaný soubor a jeho model fungují, načte se tady výslovně.
     Je to kontrola dosažitelnosti, ne průchodu formulářem; proto je
     napsané, co přesně se měří. */
  const tridy = await p.evaluate(async () => {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'vendor/nsfwjs/nsfwjs.min.js';
        s.onload = res; s.onerror = () => rej(new Error('nenačteno'));
        document.head.appendChild(s);
      });
      const m = await window.nsfwjs.load('assets/nsfw-model/', { size: 224 });
      const c = document.createElement('canvas'); c.width = 224; c.height = 224;
      const cx = c.getContext('2d'); cx.fillStyle = '#4a7a5a'; cx.fillRect(0, 0, 224, 224);
      const preds = await m.classify(c);
      return (preds || []).map((x) => x.className).sort();
    } catch (e) { return 'CHYBA: ' + (e && e.message || e); }
  }).catch((e) => 'CHYBA: ' + e.message);
  pravda('posudek slušnosti dojde k výsledku',
    Array.isArray(tridy) && tridy.length >= 3, 'klasifikace vrátila: ' + JSON.stringify(tridy));
  /* Na těchto třech třídách stojí rozhodnutí v js/pridat.js (Porn +
     Hentai ≥ 0,6 nebo Sexy ≥ 0,85 = neprojde). Kdyby se jmenovaly jinak,
     podmínka by mlčky propouštěla všechno. */
  pravda('a pozná třídy, na kterých rozhodnutí stojí (Porn, Sexy, Neutral)',
    Array.isArray(tridy) && ['Porn', 'Sexy', 'Neutral'].every((t) => tridy.includes(t)),
    'třídy: ' + JSON.stringify(tridy));
  pravda('a knihovna i model se berou od nás',
    zdroje.some((u) => u.startsWith('/vendor/nsfwjs/nsfwjs.min.js')),
    'požadavky: ' + JSON.stringify(zdroje));

  /* --- 3) A při tom všem ani jeden cizí server ----------------- */
  pravda('za celou kontrolu fotek se nesáhne na žádný cizí server',
    cizi.length === 0, 'sáhla na: ' + [...new Set(cizi)].join(', '));
  pravda('a nic se při tom nerozbilo', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));
} finally {
  await prohlizec.close();
}
hotovo();
