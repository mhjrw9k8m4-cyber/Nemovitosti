/* Test: ovládání nad výpisem má jednu velikost.
 * ====================================================================
 * Spuštění: node scripts/test-ovladani-vypisu.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta)
 *
 * PROČ. Nad výpisem stojí na telefonu pět ovladačů ve třech řadách:
 * hledání a přepínač Seznam/Mapa, pod nimi „Uložené" a řazení, pod nimi
 * „Procházet po jednom" a „Stáhnout výběr". Dělají příbuzné věci, ale
 * každý si nesl vlastní velikost:
 *
 *   · přepínač měl vlastní rámeček a výplň, takže vedle 44px pole stál
 *     jako 54px blok;
 *   · nářadí mělo šedou výplň, kdežto pilulky nad ním bílou;
 *   · řazení mělo 12px písmo a strop šířky 150 px, sousední „Uložené"
 *     mělo 13px a 194 px;
 *   · šířky vycházely z délky nápisu (84, 103, 182, 167 px), takže
 *     pravý okraj byl roztřepený.
 *
 * Majitel to poslal vyfocené s větou „všechna políčka mají mít stejnou
 * velikost". Tahle zkouška hlídá, že to tak zůstane — měří SKUTEČNÉ
 * rozměry v prohlížeči, ne zápis v CSS.
 *
 * MĚŘÍ SE NA DVOU ŠÍŘKÁCH. Na 390 px stojí ovladače po dvou vedle sebe,
 * na 320 px pod sebou (dva sloupce by daly 146 px a nápisy by lezly přes
 * rámeček — taky vyfoceno). V obou případech ale platí: co je v jedné
 * řadě, má tutéž velikost.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(e) {
  if (e) zpravy.push('  ✕ zkouška spadla: ' + e.message);
  console.log('\nOvládání nad výpisem — jedna velikost');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb + (e ? 1 : 0)} chyb\n`);
  if (chyb || e) { console.log('::error::Ovládání výpisu: ' + (chyb + (e ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  for (const sirka of [390, 320]) {
    const ctx = await prohlizec.newContext({ serviceWorkers: 'block',
      viewport: { width: sirka, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await naSeznam(p);
    await p.waitForSelector('#mc-vyvoz', { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(1200);

    const v = await p.evaluate(() => {
      const mer = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { w: Math.round(r.width), h: Math.round(r.height), r: cs.borderTopLeftRadius,
          fs: cs.fontSize, bd: cs.borderTopColor, x: Math.round(r.left), y: Math.round(r.top) }; };
      const q = (s) => mer(document.querySelector(s));
      return {
        /* Rámeček i zaoblení nese samo POLE, ne obal kolem něj
           (.map-search je jen pozicovací krabička pro lupu). */
        hledani: q('.mcp-hledani #map-search'), prepinac: q('.mcp-hledani .mv-toggle'),
        ulozene: q('#map-fav'), razeni: q('.ms-vysledky .msv-razeni'),
        rychly: q('#mc-rychly'), vyvoz: q('#mc-vyvoz'),
        pretek: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    const jsou = ['hledani', 'prepinac', 'ulozene', 'razeni', 'rychly', 'vyvoz'].filter((k) => v[k]);
    // PŘEDPOKLAD: bez vykreslených ovladačů by kontroly níž prošly naprázdno
    pravda(`${sirka} px: všech šest ovladačů se vykreslilo`, jsou.length === 6,
      'našly se jen: ' + jsou.join(', '));
    if (jsou.length !== 6) { await ctx.close(); continue; }

    const vse = [v.hledani, v.prepinac, v.ulozene, v.razeni, v.rychly, v.vyvoz];
    const vysky = [...new Set(vse.map((x) => x.h))];
    pravda(`${sirka} px: všechno v té sestavě je stejně vysoké`, vysky.length === 1 && vysky[0] === 44,
      'výšky: ' + JSON.stringify(vse.map((x) => x.h)));

    const radiusy = [...new Set([v.hledani, v.ulozene, v.rychly, v.vyvoz].map((x) => x.r))];
    pravda(`${sirka} px: a má jedno zaoblení`, radiusy.length === 1,
      'zaoblení: ' + JSON.stringify(radiusy));

    /* Dvojice v řadě si musí být rovné. Na 390 px stojí vedle sebe,
       na 320 px pod sebou — a pak mají obě plnou šířku. */
    const stejne = (a, b) => Math.abs(a.w - b.w) <= 1;
    pravda(`${sirka} px: „Uložené" a řazení mají tutéž šířku`, stejne(v.ulozene, v.razeni),
      `${v.ulozene.w} px vs ${v.razeni.w} px`);
    pravda(`${sirka} px: „Procházet po jednom" a „Stáhnout výběr" taky`, stejne(v.rychly, v.vyvoz),
      `${v.rychly.w} px vs ${v.vyvoz.w} px`);
    pravda(`${sirka} px: a obě dvojice jsou stejně široké navzájem`, stejne(v.ulozene, v.rychly),
      `${v.ulozene.w} px vs ${v.rychly.w} px`);

    /* Nápis se nesmí vysypat z rámečku — to byl důvod, proč se pod
       360 px skládá do jednoho sloupce. */
    const vysyp = await p.evaluate(() => {
      const out = [];
      ['#map-fav', '#mc-rychly', '#mc-vyvoz'].forEach((s) => {
        const e = document.querySelector(s); if (!e) return;
        if (e.scrollWidth > e.clientWidth + 1) out.push(s + ': text ' + e.scrollWidth + ' px v ' + e.clientWidth + ' px');
      });
      return out;
    });
    pravda(`${sirka} px: žádný nápis neleze přes rámeček`, vysyp.length === 0, vysyp.join('; '));
    pravda(`${sirka} px: a stránkou nejde pohnout do stran`, !v.pretek, 'obsah je širší než okno');
    await ctx.close();
  }
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
