/* PROFIL STARTU: co doopravdy dělá nejdelší úlohu.
   ==================================================================
   Spuštění: node scripts/profil-startu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)
     Nepovinně: PK_PROFIL_STRANKA=pozemek.html, PK_PROFIL_CPU=4

   PROČ TOHLE VZNIKLO. scripts/test-plynulost.mjs hlídá, že se start
   mapy nerozjede do JEDNÉ dlouhé úlohy — měří poměr nejdelšího rámce
   ke všem. To je dobrý hlídač, ale neřekne, CO tu úlohu dělá:
   pozorovatel long-animation-frame hlásí `user-callback` bez zdroje.
   U té zkoušky proto roky stálo „rozdělit ji je vlastní práce
   a potřebuje vlastní instrumentaci". Tenhle skript je ta
   instrumentace — a nepotřebuje k tomu ani jednu značku ve zdroji:
   bere vzorkovaný profil procesoru přes CDP (Profiler.start/stop)
   a sečte VLASTNÍ čas každé funkce.

   PROČ NE performance.mark VE STARTU. Značky by řekly, kolik trvá úsek
   mezi nimi, ale musely by se do js/main.js napsat předem a na správná
   místa — tedy hádat, kde cena leží. Profil to řekne bez hádání
   a neveze s sebou nic do produkce.

   JAK SE TO ČTE. „(idle)" je čekání, „(program)" je práce prohlížeče
   mimo JS (parsování, rozvržení, kreslení). Jména funkcí jsou
   z NEZMENŠENÉHO zdroje — oprav.mjs jména nepřepisuje —, ale čísla
   řádků jsou ze souborů v js/min, takže se podle nich nedá ve zdroji
   skákat; hledej podle jména.

   NAMĚŘENO 11. 11. 2026 (úvodní stránka, telefon 390×844, procesor
   ×4, vzorkování 200 µs). Vzorkovaný profil se mezi běhy hýbe, takže
   tu stojí OBA běhy, ne jeden — v prvním bylo v JS 2 450 ms, v druhém
   2 649 ms:

                               1. běh    2. běh
       sortVis                  243 ms    298 ms   řazení viditelných nabídek
       declump                  230 ms    250 ms   rozestrkání teček na mapě
       ceny                     224 ms    231 ms   cenový model: filtr a setřídění
       nastrojeDoHlavicky       130 ms    129 ms   nástroje v liště
       kmVzdalenost             119 ms    135 ms   vzdálenosti v okolí (z ceny)
       okoliCeny                 76 ms    103 ms   okolí nabídky (z ceny)

   Pořadí je v obou bězích totožné, proto se z něj dá vycházet; na
   absolutní čísla se spoléhat nedá a mez na nich stavět nemá smysl
   (to dělá test-plynulost poměrem, který je bezrozměrný).

   Dvě místa tedy drží start a stojí za rozdělení:
     · CENOVÝ MODEL 419–469 ms (ceny + kmVzdalenost + okoliCeny). Staví se
       v prohlížeči ze dat — PK_CENY.postav(DATA, null, PRESNOST) —
       a je to ZÁMĚR, ne vada: druhý parametr je mapa okres→kraj, ne
       předpočítaný model, a data/model.json nese jen naměřenou chybu
       podle druhu. Předpočítat celý model při sestavení jde, ale je to
       vlastní rozhodnutí: mapa, výpis i stránka pozemku musejí pak
       tvrdit o témž pozemku totéž, jinak si web začne odporovat.
     · VÝPIS A MAPA 473–548 ms (sortVis + declump).
   Co se naopak ukázalo jako plané podezření: dávková smyčka, která
   dopočítává skóre `dm`, je naprázdno. Řez, který úvod stahuje
   (data/mapa.json), nese dm u všech 3 983 nabídek; nulové dm má jen
   data/opportunities.json, což je surový výstup robota, který si
   prohlížeč nestahuje.
   ================================================================== */
import { chromium } from 'playwright-core';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const STRANKA = process.env.PK_PROFIL_STRANKA || 'index.html';
const CPU = Number(process.env.PK_PROFIL_CPU || 4);
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2, bypassCSP: true, serviceWorkers: 'block' });
/* Ven se nic neposílá: cizí hosty zahodíme, config dostane falešnou Supabase. */
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));

const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Profiler.enable');
/* 200 µs místo výchozí milisekundy: při ×4 zpomalení je i krátká
   funkce vidět, a vzorků je pořád řádově tisíce, ne miliony. */
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await p.goto(`${BASE}/${STRANKA}`, { waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(6000);
const { profile } = await cdp.send('Profiler.stop');
await prohlizec.close();

const uzly = new Map();
for (const n of profile.nodes || []) uzly.set(n.id, n);
const vlastni = new Map();
const vzorky = profile.samples || [];
const kroky = profile.timeDeltas || [];
for (let i = 0; i < vzorky.length; i++) {
  const n = uzly.get(vzorky[i]);
  if (!n) continue;
  const f = n.callFrame || {};
  const jm = (f.functionName || '(anonymní)') + '  '
    + String(f.url || '').split('/').pop() + ':' + ((f.lineNumber || 0) + 1);
  vlastni.set(jm, (vlastni.get(jm) || 0) + (kroky[i] || 0) / 1000);
}
const celkem = [...vlastni.values()].reduce((a, b) => a + b, 0);
const rezie = ['(idle)', '(program)', '(garbage collector)', '(root)', '(idle) '];
const vJs = [...vlastni].filter(([jm]) => !rezie.some((r) => jm.startsWith(r)))
  .reduce((a, [, ms]) => a + ms, 0);

console.log(`\nProfil startu: ${STRANKA}, telefon 390×844, procesor ×${CPU}`);
console.log(`  vzorků ${vzorky.length}, změřeno ${Math.round(celkem)} ms,`
  + ` z toho ve vlastním JS ${Math.round(vJs)} ms`);
console.log('\n  NEJDRAŽŠÍ PODLE VLASTNÍHO ČASU (čísla řádků jsou z js/min, hledej podle jména):');
for (const [jm, ms] of [...vlastni].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log('    ' + String(Math.round(ms)).padStart(5) + ' ms  '
    + (ms / celkem * 100).toFixed(1).padStart(5) + ' %  ' + jm);
}
console.log('');
process.exit(0);
