// Test: neposkakuje stránka při načítání?
//
// Spuštění: node scripts/test-stabilita.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// „Celá stránka a mapa mi připadají strašně nestabilní." Je to měřitelné:
// prohlížeč sám hlásí každý posun rozvržení (layout-shift) a součtu se
// říká CLS. Mez „v pořádku" je 0,1. Naměřeno před opravami:
//
//   muj-inzerat 0,55 · pozemek 0,56 · pridat 0,22 · hlidani 0,20
//   upozorneni 0,20 · index 0,11          (všechno na telefonu 390 px)
//
// Příčina byla pokaždé táž: stránka se vykreslí v jednom stavu a skript ji
// hned přepíše do jiného, vyššího. Přihlašovací karta naskočila o 588 px,
// detail pozemku o 1 672 px, pruh živých faktů o 128 px.
//
// MĚŘÍ SE NÁSLEDEK, ne zápis v kódu: co prohlížeč opravdu přemaloval.
// Pojistka u každé stránky hlídá, že se vůbec něco vykreslilo — na prázdné
// stránce je CLS taky nula a taková zelená by nic neznamenala.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Mez je PŘÍSNĚJŠÍ než obecné doporučení (0,1). Po opravách je na všech
   stránkách nula nebo skoro nula, takže 0,05 je místo, kam se nedá
   dostat omylem — a zároveň nechává prostor pro drobnosti typu lišty
   „přihlášen jako…", která se ukáže až po ověření tokenu. */
const MEZ = 0.05;

const STRANKY = [
  ['index.html', '.opp-item, .map-count'],
  ['pridat.html', '#auth-gate, #prodej-card'],
  ['pozemek-tabor-nemysl-16a8tol.html', '.pz-media, .pz-empty'],
  ['pozemky-okres-tabor.html', '.okr-item'],
  ['hlidani.html', '#hl-root *'],
  ['upozorneni.html', '#up-root *'],
  ['muj-inzerat.html', '#mi-auth, #mi-panel'],
];

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/* Telefon i monitor. Na telefonu je to horší (obsah se vejde méně, takže
   se posune víc toho, co je zrovna vidět), ale rozbít se dá obojí. */
for (const [sirka, vyska, jmeno] of [[390, 844, 'telefon'], [1280, 900, 'monitor']]) {
  for (const [stranka, coMusiByt] of STRANKY) {
    const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: vyska } });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
      if (r.request().resourceType() === 'image') {
        return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
      }
      return LEAFLET ? r.abort() : r.continue();
    });
    await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
    if (LEAFLET) {
      await ctx.route('https://unpkg.com/leaflet@**', (r) => {
        const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
        if (!existsSync(f)) return r.abort();
        return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript',
          body: readFileSync(f) });
      });
      await ctx.route(`${BASE}/${stranka}`, async (r) => {
        const o = await r.fetch();
        return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
          body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
      });
    }
    const p = await ctx.newPage();
    /* Pozorovatel musí být nasazený DŘÍV, než se začne kreslit — proto
       init-skript, ne evaluate po načtení. */
    await p.addInitScript(() => {
      window.__cls = 0; window.__kdo = [];
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (e.hadRecentInput) continue;
            window.__cls += e.value;
            window.__kdo.push(Math.round(e.startTime) + ' ms, ' + e.value.toFixed(3) + ': '
              + (e.sources || []).map((s) => {
                const n = s.node;
                return n ? (n.tagName || '?') + (n.id ? '#' + n.id : '')
                  + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : '') : '?';
              }).join(', '));
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) { /* prohlížeč to neumí — pozná se podle prázdného __kdo */ }
    });
    await p.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const v = await p.evaluate((sel) => ({
      cls: +window.__cls.toFixed(4),
      kdo: window.__kdo,
      obsah: document.querySelectorAll(sel).length,
      merilo: typeof PerformanceObserver !== 'undefined',
    }), coMusiByt);
    pravda(`${jmeno} · ${stranka}: vykreslil se obsah (jinak zkouška nic neměří)`,
      v.merilo && v.obsah > 0, `prvků „${coMusiByt}": ${v.obsah}`);
    pravda(`${jmeno} · ${stranka}: rozvržení neposkakuje (CLS ${v.cls} ≤ ${MEZ})`,
      v.cls <= MEZ, v.kdo.join(' | '));
    await ctx.close();
  }
}

await prohlizec.close();
console.log('\nStabilita rozvržení při načítání (CLS)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Stabilita: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
