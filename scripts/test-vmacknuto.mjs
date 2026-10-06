/* Test: co má obsah, nesmí být vmáčknuté do ničeho.
 *
 * Spuštění: node scripts/test-vmacknuto.mjs
 *   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ. Výpis pozemků na úvodu měl na displeji 1280×900 výšku 31 px —
 * při obsahu 9 836 px. Všech 1 956 nabídek bylo vmáčknutých do jednoho
 * řádku a nikdo si toho nevšiml, protože stránka se nerozbila: seznam
 * se dal posouvat, jen do něj nebylo vidět. Způsobilo to pravidlo
 * z úplně jiného místa (tlačítko v liště nad výpisem se roztáhlo na
 * 302×232 px a sebralo sloupci výšku).
 *
 * ŽÁDNÝ Z OSMDESÁTI TESTŮ TO NECHYTIL. Kontrolovaly barvy, kontrast,
 * dotykové terče, posuny rozvržení, překryvy — ale ne to, jestli se do
 * seznamu vejde aspoň jedna položka.
 *
 * PRAVIDLO SE KALIBRUJE SAMO. Nehlídá se pevná výška, ale poměr
 * k obsahu: posuvná oblast musí být aspoň tak vysoká, aby se do ní
 * vešlo první dítě celé. Tím pravidlo platí stejně pro seznam nabídek
 * (položka 150 px) jako pro našeptávač (řádek 36 px), aniž by se
 * kdekoli psalo číslo.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKY = ['index.html', 'pozemky-okres-tabor.html', 'hlidani.html',
  'upozorneni.html', 'zpravy.html', 'muj-inzerat.html', 'porovnani.html'];
const SIRKY = [[390, 844], [1280, 900]];

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
let posuvnych = 0;
let vypisSePosouva = false;

for (const [w, h] of SIRKY) {
  for (const s of STRANKY) {
    const ctx = await prohlizec.newContext({ viewport: { width: w, height: h }, locale: 'cs-CZ' });
    await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
    await ctx.addInitScript(() => {
      localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
        refresh_token: 'ref-majitel',
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(2600);

    const v = await p.evaluate(() => {
      const out = []; let nalezeno = 0;
      for (const e of document.querySelectorAll('*')) {
        const st = getComputedStyle(e);
        if (!/auto|scroll/.test(st.overflowY)) continue;
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        // posuvná je jen ta oblast, která má co posouvat
        if (e.scrollHeight <= e.clientHeight + 4) continue;
        // a musí mít viditelné dítě, podle kterého se měří
        const dite = [...e.children].find((c) => c.getBoundingClientRect().height > 0);
        if (!dite) continue;
        nalezeno++;
        const vyskaDitete = Math.round(dite.getBoundingClientRect().height);
        if (e.clientHeight + 2 < vyskaDitete) {
          out.push((e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
            + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ').filter(Boolean)[0] : ''))
            + `: vidět ${Math.round(e.clientHeight)} px, první položka má ${vyskaDitete} px`
            + ` (obsah ${Math.round(e.scrollHeight)} px)`);
        }
      }
      const seznam = document.getElementById('opp-list');
      const vypisPosuvny = !!seznam && seznam.scrollHeight > seznam.clientHeight + 4;
      return { out, nalezeno, vypisPosuvny };
    });

    posuvnych += v.nalezeno;
    if (s === 'index.html' && w === 1280 && v.vypisPosuvny) vypisSePosouva = true;
    pravda(`${s} @${w}px: do každé posuvné oblasti se vejde aspoň jedna položka`,
      v.out.length === 0, v.out.slice(0, 4).join('\n      '));
    await ctx.close();
  }
}

/* POJISTKA PROTI MĚŘENÍ PRÁZDNA. Bez posuvné oblasti by všechny kontroly
   výš „prošly" o ničem — projely by prázdný seznam.
   Nekontroluje se počet. Nejdřív jsem sem napsal „aspoň čtyři posuvné
   oblasti" podle ničeho a změřená skutečnost byla jedna: ze sedmi stránek
   ve dvou šířkách má přetékající obsah jediné místo. Ostatní oblasti mají
   sice overflow:auto, ale posouvat nemají co, takže se jich pravidlo
   netýká.
   Drží se tedy to jedno konkrétní místo, kvůli kterému test vznikl: výpis
   pozemků na úvodu v šířce 1280 px. Když se jednou přestane posouvat
   (nenačetla se data, rozpadlo se přihlášení), kontrola nad ním by mlčky
   prošla — a tahle řádka to zastaví. */
pravda('výpis pozemků na úvodu @1280px se opravdu posouvá', vypisSePosouva,
  'nenašel se — stránka se nenačetla, nebo v ní nejsou žádné nabídky');

await prohlizec.close();
console.log('\n=== vmáčknuté oblasti ===');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`::error::Vmáčknuto: ${chyb} kontrol neprošlo.`); process.exit(1); }
process.exit(0);
