/* Test: seznam nabídek se stránkuje a jde projít celý.
 *
 * Spuštění: node scripts/test-strany.mjs
 *
 * PROČ. Dřív se seznam jen prodlužoval: začínal na osmi, tlačítko
 * přidávalo dvanáct na konec. Mělo to dvě vady a ta druhá byla vážná:
 *
 *   · člověk jel pořád dolů, klepl, jel dál a nikdy nebyl na konci;
 *   · seznam měl STROP 96 POLOŽEK a pak už jen oznámil, že zbytek je na
 *     mapě. Při 1 994 nabídkách se jich tedy 1 898 v seznamu nedalo
 *     zobrazit vůbec — a nebylo to nikde vidět, protože ta hláška zněla
 *     jako nabídka, ne jako omezení.
 *
 * Tenhle test hlídá obojí: že stránky fungují jako stránky, a hlavně že
 * se opravdu dá dojít až na konec.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
await import('./falesna-supabase-chat.mjs');

const BASE = 'http://127.0.0.1:8310';
const NA_STRANKU = 24;
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(3000);

const stav = () => p.evaluate(() => {
  const kde = (document.querySelector('.ops-kde') || {}).textContent || '';
  const m = /Strana\s+([\d\s ]+)\s+z\s+([\d\s ]+)/.exec(kde);
  const c = (x) => Number(String(x || '').replace(/[\s ]/g, ''));
  const poc = (document.querySelector('#map-count') || {}).textContent || '';
  const mm = /(\d[\d\s ]*)\s*na mapě/.exec(poc);
  return {
    karet: document.querySelectorAll('.opp-item').length,
    strana: m ? c(m[1]) : null, stran: m ? c(m[2]) : null,
    naMape: mm ? c(mm[1]) : null,
    /* Porovnává se data-id, ne název obce: dvě různé nabídky můžou být
       v téže obci (Police nad Metují, Rohatce), takže podle jmen by
       „strany se nepřekrývají" padalo na správném chování. */
    mista: [...document.querySelectorAll('.opp-item')].map((e) => e.getAttribute('data-id')),
    predVyp: !!(document.querySelector('.ops-btn[data-krok="-1"]') || {}).disabled,
    dalVyp: !!(document.querySelector('.ops-btn[data-krok="1"]') || {}).disabled,
  };
});
const dal = async (krok) => { await p.click(`.ops-btn[data-krok="${krok}"]`); await p.waitForTimeout(1100); };

const s1 = await stav();
pravda('seznam se vykreslil a ví, kolik je nabídek', (s1.naMape || 0) > 100, JSON.stringify(s1.naMape));
pravda('patka se stranami tam je', s1.stran !== null, 'nenalezeno „Strana X z Y"');
pravda(`na první straně je ${NA_STRANKU} karet`, s1.karet === NA_STRANKU, `karet ${s1.karet}`);
pravda('počet stran sedí s počtem nabídek',
  s1.stran === Math.ceil(s1.naMape / NA_STRANKU), `${s1.stran} stran na ${s1.naMape} nabídek`);
pravda('na první straně je „Předchozí" vypnuté', s1.predVyp === true);
pravda('a „Další" zapnuté', s1.dalVyp === false);

await dal(1);
const s2 = await stav();
pravda('„Další" posune na druhou stranu', s2.strana === 2, `strana ${s2.strana}`);
pravda('a ukáže JINÉ nabídky',
  s2.mista.length && s2.mista.every((x, i) => x !== s1.mista[i]),
  `první: ${s1.mista[0]} / ${s2.mista[0]}`);
const prekryv = s2.mista.filter((x) => s1.mista.includes(x));
pravda('strany se nepřekrývají', prekryv.length === 0, `společné: ${prekryv.join(', ')}`);

await dal(-1);
pravda('„Předchozí" vrátí zpět', (await stav()).strana === 1);

/* --- TO PODSTATNÉ: jde dojít až na konec --------------------------- */
{
  const cil = s1.stran;
  await p.evaluate(() => {
    /* Na poslední stranu se neklepe osmdesátkrát — nastaví se rovnou.
       Jde o to, jestli konec vůbec existuje, ne o cestu k němu. */
    const b = document.querySelector('.ops-btn[data-krok="1"]');
    if (b) for (let i = 0; i < 200 && !b.disabled; i++) b.click();
  });
  await p.waitForTimeout(2000);
  const posl = await stav();
  pravda('poslední strana je dosažitelná', posl.strana === cil, `došel na ${posl.strana} z ${cil}`);
  pravda('a na ní je „Další" vypnuté', posl.dalVyp === true);
  pravda('a pořád je na ní co ukazovat', posl.karet > 0, `karet ${posl.karet}`);
  /* Dřív tu byl strop 96 položek. Kdyby se vrátil, poslední strana by
     vyšla na čtvrtou a tahle kontrola by to ukázala. */
  pravda('strop se nevrátil: stran je víc, než kolik by jich dalo 96 položek',
    cil > Math.ceil(96 / NA_STRANKU), `stran ${cil}`);
}

/* --- změna filtru vrací na první stranu ---------------------------- */
{
  await p.click('[data-type="drazba"]').catch(() => {});
  await p.waitForTimeout(1500);
  const f = await stav();
  pravda('po změně filtru je člověk zase na první straně', f.strana === 1 || f.stran === null,
    `strana ${f.strana} z ${f.stran}`);
  if (f.stran !== null) {
    pravda('a počet stran odpovídá zúženému výběru',
      f.stran === Math.ceil(f.naMape / NA_STRANKU), `${f.stran} stran na ${f.naMape} nabídek`);
  }
}

await ctx.close(); await prohlizec.close();
console.log(`\nStránkování seznamu: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Stránkování: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
process.exit(0);
