#!/usr/bin/env node
/* MĚŘIDLO PRVNÍHO NAČTENÍ
   ==================================================================
   Spuštění: node scripts/mericka-prvniho-nacteni.mjs
             node scripts/mericka-prvniho-nacteni.mjs --bez-offline

   PROČ. S offline režimem přibyl na 2 125 stránek js/offline.js a každá
   stránka navíc objednává sw.js. Offline režim se přitom uplatní až
   PŘÍŠTĚ — při prvním načtení je to čistá přítěž. Tohle měří, jak velká:
   kolik bajtů a kolik milisekund se přidalo tomu, kdo přišel poprvé.

   --bez-offline načte tytéž stránky s vypnutým service workerem
   a zablokovaným js/offline.js, takže se dá rozdíl odečíst. Bez téhle
   druhé poloviny by číslo nic neznamenalo — nebylo by proti čemu.

   MĚŘÍ SE PRÁZDNÁ MEZIPAMĚŤ, nový kontext pro každé načtení: návštěvník
   z vyhledávače nemá v mezipaměti nic. A měří se víckrát, protože jedno
   načtení je šum.
   ================================================================== */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
const BEZ = process.argv.includes('--bez-offline');
const KOLIKRAT = 5;

const STRANKY = [
  ['úvodní', 'index.html'],
  ['pozemek', 'pozemek-benesov-benesov-rsg5bb.html'],
  ['okres', 'pozemky-okres-benesov.html'],
];

const median = (a) => { const b = a.slice().sort((x, y) => x - y); const i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2; };

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
console.log(BEZ ? 'BEZ offline režimu (service worker zakázaný, js/offline.js blokovaný)'
  : 'S offline režimem (jak je web nasazený)');
console.log('');
console.log('stránka   požadavků   bajtů přes drát   do DOMContentLoaded   do load');
try {
  for (const [jmeno, soubor] of STRANKY) {
    const pozadavku = [], bajtu = [], dcl = [], load = [];
    for (let k = 0; k < KOLIKRAT; k++) {
      /* Nový kontext = prázdná mezipaměť i prázdné úložiště. */
      const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 },
        serviceWorkers: BEZ ? 'block' : 'allow' });
      if (BEZ) await ctx.route('**/offline.js*', (r) => r.abort());
      const p = await ctx.newPage();
      let pocet = 0, velikost = 0;
      p.on('response', async (r) => {
        pocet++;
        try {
          const h = await r.allHeaders();
          const d = h['content-length'];
          if (d) velikost += parseInt(d, 10) || 0;
        } catch (e) { /* odpověď mohla zmizet s kontextem */ }
      });
      await p.goto(`${BASE}/${soubor}`, { waitUntil: 'load' });
      /* Registrace service workeru běží až po load, takže se na ni počká —
         jinak by se neměřila vůbec a číslo by bylo falešně dobré. */
      await p.waitForTimeout(1500);
      const t = await p.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return n ? { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd } : null;
      });
      pozadavku.push(pocet); bajtu.push(velikost);
      if (t) { dcl.push(t.dcl); load.push(t.load); }
      await ctx.close();
    }
    console.log(`${jmeno.padEnd(10)}${String(median(pozadavku)).padStart(6)}`
      + `${(median(bajtu) / 1024).toFixed(1).padStart(16)} kB`
      + `${median(dcl).toFixed(0).padStart(18)} ms`
      + `${median(load).toFixed(0).padStart(10)} ms`);
  }
} finally {
  await prohlizec.close();
}
console.log('');
console.log(`(medián z ${KOLIKRAT} načtení, vždy s prázdnou mezipamětí)`);
process.exit(0);
