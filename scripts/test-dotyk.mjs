// Velikost dotykových terčů na mobilu.
//
// Spuštění: node scripts/test-dotyk.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Norma sice propustí i drobné tlačítko, ale palec ne. Právě tohle dělá
// rozdíl mezi „web funguje" a „web se dobře ovládá": hamburger měl 36×28,
// filtry 30 px na výšku a rychlé hodnoty 26 px.
//
// Měří se JEN samostatná tlačítka a odkazy. Odkaz uvnitř věty se zvětšit
// nedá a nemá — na ten se míří jinak než na tlačítko.
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKY = ['index.html', 'pridat.html', 'pozemky-okres-tabor.html', 'upozorneni.html', 'kontakt.html'];
const MIN = 36;   // nižší než doporučených 44, ale vyšší než dnešní stav

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const male = new Map();
for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1600);
  const nalezy = await p.evaluate((MIN) => {
    const out = [];
    document.querySelectorAll('button, a.btn-primary, a.filter-chip, .filter-chip, .nav-toggle, .mvt-btn, .up-f, .up-a').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return;
      if (r.height < MIN || r.width < MIN) out.push({
        co: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24),
        trida: (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName),
        rozmer: Math.round(r.width) + '×' + Math.round(r.height)
      });
    });
    return out;
  }, MIN);
  nalezy.forEach((n) => male.set(n.trida + n.rozmer, Object.assign({ stranka: s }, n)));
  await ctx.close();
}
await prohlizec.close();

const seznam = [...male.values()];
console.log(`\nDotykové terče (min ${MIN} px): ${seznam.length} pod mezí`);
seznam.slice(0, 15).forEach((n) => console.log(`  ✕ ${n.rozmer.padStart(7)}  ${n.trida}  „${n.co}"  · ${n.stranka}`));
if (seznam.length) {
  console.error(`\n::error::${seznam.length} ovládacích prvků je na mobilu menších než ${MIN} px.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
process.exit(0);
