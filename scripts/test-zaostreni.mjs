/* Test: vidí ten, kdo chodí po webu klávesnicí, KDE zrovna stojí?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-zaostreni.mjs
 *
 * Prstenec zaostření je jediné vodítko člověka, který nepoužívá myš —
 * a je to přesně ten druh věci, který se rozbije potichu: stránka vypadá
 * správně, nic nespadne, jen po stisku tabulátoru není poznat, na čem
 * člověk je.
 *
 * MĚŘÍ SE HNED PO STISKU, ne po chvilce. Právě na tom se tu chytila
 * skutečná vada: .filter-chip mělo jako jediné pravidlo na webu
 * `transition:all`, což animuje i obrys — prstenec tedy nenaskočil,
 * ale dojížděl. Kdo prochází web rychle, nevidí nic. Kdyby se čekalo,
 * zkouška by to odmávla jako v pořádku.
 *
 * VÝJIMKA: vnitřky mapy (.leaflet-container). Leaflet dává tabindex
 * i SVG tvarům krajů a plátnu; globální prstenec kolem nich kreslil
 * OBDÉLNÍK přes celý tvar, takže se tam schválně vypíná (viz poznámka
 * u pravidla v css/styles.css). Shluky mají vlastní prstenec na vnitřním
 * prvku, který se tudy měřit nedá.
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const STRANKY = ['index.html', 'pridat.html', 'kontakt.html', 'hlidani.html',
  'pozemky-okres-benesov.html', 'hypoteka-na-pozemek.html', 'pozemek.html',
  /* Nejdelší formulář na webu — osmnáct polí ve čtyřech skupinách.
     Kdo ho vyplňuje klávesnicí, projde jím celý tabulátorem. */
  'kupni-smlouva-pozemek.html'];

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
    const f = path.join(LEAFLET, path.basename(u.pathname));
    if (existsSync(f)) return r.fulfill({ status: 200,
      contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  }
  return r.abort();
});

let celkemPrvku = 0;
for (const s of STRANKY) {
  const p = await ctx.newPage();
  const nactena = await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' })
    .then((r) => r && r.ok()).catch(() => false);
  if (!nactena) { pravda(`${s} se načetla`, false, 'stránka nedojela'); await p.close(); continue; }
  await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await p.waitForTimeout(900);

  const bez = [];
  const videne = new Set();
  for (let i = 0; i < 80; i++) {
    await p.keyboard.press('Tab');
    const v = await p.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body || !e.getBoundingClientRect) return null;
      if (e.closest && e.closest('.leaflet-container')) return { preskocit: true };
      const c = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return { preskocit: true };
      const znak = (e.tagName + '.' + (e.className.toString().split(/\s+/)[0] || '—')).slice(0, 36);
      const sirkaObrysu = parseFloat(c.outlineWidth) || 0;
      return { znak, sirkaObrysu, styl: c.outlineStyle,
        stin: c.boxShadow && c.boxShadow !== 'none',
        text: (e.textContent || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 20) };
    });
    if (!v) break;
    if (v.preskocit) continue;
    const klic = v.znak + '|' + v.text;
    if (videne.has(klic)) continue;
    videne.add(klic);
    const maObrys = v.sirkaObrysu >= 1 && v.styl !== 'none';
    if (!maObrys && !v.stin) bez.push(`${v.znak} „${v.text}"`);
  }
  celkemPrvku += videne.size;
  /* Pojistka: kdyby se po stránce nedalo chodit tabulátorem (nebo by se
     rozbilo načítání), zkouška by mlčky prošla na prázdnu. */
  pravda(`${s}: tabulátorem se prošlo aspoň pět prvků`, videne.size >= 5, `prošlo ${videne.size}`);
  pravda(`${s}: každý prvek se po zaostření HNED ohlásí (${videne.size} prvků)`,
    bez.length === 0, bez.slice(0, 6).join(', ') + (bez.length > 6 ? ` …a dalších ${bez.length - 6}` : ''));
  await p.close();
}
pravda('celkem se prošlo aspoň padesát ovládacích prvků', celkemPrvku >= 50, `prošlo ${celkemPrvku}`);

await prohlizec.close();
console.log('\nZaostření klávesnicí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zaostření: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
