/* Test: zpráva od cizího člověka se vykreslí jako TEXT.
   ==================================================================
   Spuštění: node scripts/test-escape-zpravy.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ ZVLÁŠŤ OD test-escape-dom.mjs. Ta měří karty a stránku pozemku,
   kde cizí text teče přes ČIŠTĚNÍ DAT (`text()` v js/cisteni.js zahodí
   < > a uvozovku úplně). Zprávy mezi lidmi tudy nejdou vůbec: píše je
   druhý člověk, chodí přes Supabase a do HTML je skládá vlastní kopie
   escapování přímo v zpravy.html. Je to tedy jediné místo na webu,
   kde cizí text stojí a padá na escapování — a zrovna tam to nic
   nehlídalo.

   MĚŘÍ SE OBOJE STRANY. Zájemce napíše nálož, majitel si ji přečte:
   nebezpečnější je ta druhá strana, protože majitel dostane text, který
   nepsal.

   CSP SE SCHVÁLNĚ OBCHÁZÍ (bypassCSP) — jinak by zkouška prošla i nad
   dírou v escapování, protože by skript zastavila hlavička a nebylo by
   poznat, že se cizí text dostal do HTML jako kód. Že platí i ta
   pojistka, měří scripts/test-csp.mjs.

   A SABOTÁŽ JE UVNITŘ. Stránka se umí doručit s vyřazeným escapováním
   (`?bezesc=1`, přepíše se jen ta jedna funkce). Pak se nálož spustit
   MUSÍ — jinak by zkouška mohla být zelená proto, že se nálož vůbec
   neodeslala, a ne proto, že web escapuje.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LISTING = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const UID_MAJITEL = '11111111-1111-4111-8111-111111111111';
const UID_ZAJEMCE = '22222222-2222-4222-8222-222222222222';
/* Tatáž trojice jako v test-escape-dom.mjs: obrázek s onerror, svg
   s onload a značka script. */
const NALOZE = [
  '<img src=x onerror="window.__XSS=1">',
  '"><svg onload="window.__XSS=2"></svg>',
  '</b><script>window.__XSS=3</script>',
];
const ESC_ZDROJ = `.replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; })`;

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Escapování zpráv', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});

async function kontext(uid, token, bezEsc) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 1100, height: 900 }, locale: 'cs-CZ' });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';` }));
  if (bezEsc) {
    /* SABOTÁŽ: té stránce se vyřadí escapování, nic jiného. */
    await ctx.route('**/zpravy.html*', async (r) => {
      const o = await r.fetch();
      const telo = await o.text();
      if (telo.indexOf(ESC_ZDROJ) < 0) throw new Error('escapování v zpravy.html se nenašlo — sabotáž by nic nevyřadila');
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: telo.replace(ESC_ZDROJ, '') });
    });
  }
  await ctx.addInitScript(([u, t]) => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: t, refresh_token: t.replace('tok-', 'ref-'), user: { id: u, email: u + '@test.cz' } }));
    window.__CSP = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__CSP.push(String(e.violatedDirective)));
  }, [uid, token]);
  return ctx;
}

/* Co stránka ukazuje a co se na ní stalo. */
async function stav(p) {
  return p.evaluate(() => ({
    xss: typeof window.__XSS !== 'undefined' ? String(window.__XSS) : null,
    zlePrvky: document.querySelectorAll('img[onerror], svg[onload], [onerror], [onload]').length,
    zleSkripty: [...document.querySelectorAll('script')].filter((x) => /__XSS/.test(x.textContent || '')).length,
    textVidim: (document.body.innerText || '').indexOf('<img src=x onerror=') >= 0,
    zprav: document.querySelectorAll('.zp-b').length,
  }));
}

try {
  /* ---- 1) zájemce napíše tři nálože ---- */
  const cZ = await kontext(UID_ZAJEMCE, 'tok-zajemce');
  const pZ = await cZ.newPage();
  const chybyJs = [];
  pZ.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 90)));
  await pZ.goto(`${BASE}/zpravy.html?l=${LISTING}&new=1&p=Kol%C3%ADn&ok=Kol%C3%ADn`);
  await pZ.waitForSelector('#zc-ta', { timeout: 15000 });
  for (const n of NALOZE) {
    await pZ.fill('#zc-ta', n);
    await pZ.click('#zc-send');
    await pZ.waitForTimeout(700);
  }
  await pZ.waitForTimeout(1200);
  const z = await stav(pZ);
  pravda(`zprávy se odeslaly a vykreslily (${z.zprav})`, z.zprav >= NALOZE.length, `jen ${z.zprav}`);
  pravda('u pisatele se nálož NESPUSTILA', z.xss === null, `__XSS=${z.xss}`);
  pravda('a nevznikl z ní žádný prvek', z.zlePrvky === 0 && z.zleSkripty === 0,
    `prvků ${z.zlePrvky}, skriptů ${z.zleSkripty}`);
  pravda('a text je vidět jako text (escapováno, ne zahozeno)', z.textVidim === true,
    'nálož na stránce není — zkouška by měřila prázdno');
  pravda('bez chyby skriptu', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));

  /* ---- 2) majitel si je přečte (ta nebezpečnější strana) ---- */
  const cM = await kontext(UID_MAJITEL, 'tok-majitel');
  const pM = await cM.newPage();
  await pM.goto(`${BASE}/zpravy.html?l=${LISTING}&b=${UID_ZAJEMCE}`);
  await pM.waitForSelector('#zc-ta', { timeout: 15000 });
  await pM.waitForTimeout(2000);
  const m = await stav(pM);
  pravda(`majitel ty zprávy vidí (${m.zprav})`, m.zprav >= NALOZE.length, `jen ${m.zprav}`);
  pravda('u majitele se nálož NESPUSTILA', m.xss === null, `__XSS=${m.xss}`);
  pravda('a nevznikl z ní žádný prvek', m.zlePrvky === 0 && m.zleSkripty === 0,
    `prvků ${m.zlePrvky}, skriptů ${m.zleSkripty}`);
  pravda('a čte je jako text', m.textVidim === true, 'nálož na stránce není');

  /* ---- 3) SABOTÁŽ: bez escapování se nálož spustit MUSÍ ---- */
  const cS = await kontext(UID_MAJITEL, 'tok-majitel', true);
  const pS = await cS.newPage();
  await pS.goto(`${BASE}/zpravy.html?l=${LISTING}&b=${UID_ZAJEMCE}&bezesc=1`);
  await pS.waitForSelector('#zc-ta', { timeout: 15000 });
  await pS.waitForTimeout(2500);
  const s = await stav(pS);
  pravda('kontrola sabotáží: BEZ escapování se nálož spustí',
    s.xss !== null || s.zlePrvky > 0,
    `__XSS=${s.xss}, prvků ${s.zlePrvky} — pokud ne, neměří se escapování, ale něco jiného`);

  await cZ.close(); await cM.close(); await cS.close();
} finally {
  await prohlizec.close();
}

console.log('\nZpráva od cizího člověka je text, ne kód');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Escapování zpráv: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
