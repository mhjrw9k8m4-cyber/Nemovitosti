// Test: barevné odznaky musí být čitelné i tehdy, když je na stránce zrovna
// žádný není.
//
// Spuštění: node scripts/test-odznaky.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TO VZNIKLO. Odznak „cena k ověření" měl jedinou barvu — natvrdo
// zapsaný tmavý jantar #7C5105 — a žádnou tmavou variantu. V tmavém režimu
// z něj byl tmavý text na tmavé ploše: 1,59 : 1 při mezi 4,5, tedy
// prakticky neviditelný. Byl to nejhorší prvek na celém webu.
//
// Zkouška kontrastu (scripts/test-kontrast.mjs) ho přitom měla v záběru
// a přesto ho dlouho nenašla. Důvod je v tom, ČÍM se ten odznak vykresluje:
// objeví se jen u nabídky, které model nevěří cenu. Jestli na stránce je,
// tedy rozhodují data, která se dneska zrovna stáhla — a tak zkouška
// jednou padala a podruhé prošla a vypadalo to jako její nestálost.
//
// Spoléhat na to, že se barevný odznak náhodou vykreslí, nejde. Tahle
// zkouška ho proto na stránku vloží sama a změří ho v obou režimech.
// Tím pádem nezáleží na tom, co je dneska v datech.
//
// POCTIVĚ K OMEZENÍ: vložený odznak stojí v rodiči, který se mu vybere
// podle seznamu níž, ne nutně přesně tam, kde ho aplikace vypisuje. Podklad
// se proto může o odstín lišit. Pro otázku „má ta barva v tomhle režimu
// vůbec šanci" to stačí — a přesně na tu otázku se dvakrát odpovědělo
// špatně. Jemnější rozdíly měří scripts/test-kontrast.mjs na tom, co na
// stránce opravdu je.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const ROOT = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Odznaky, které umí vypsat js/main.js, js/pozemek.js nebo generátor
   regionálních stránek. Rodič se vybírá z prvního selektoru, který na
   stránce existuje — ať odznak stojí na ploše, na jaké stojí doopravdy. */
const ODZNAKY = [
  { stranka: 'index.html', trida: 'opp-overit', rodic: ['.opp-card', '.deal-card', '.card', 'main'], text: 'cena k ověření' },
  { stranka: 'index.html', trida: 'opp-deal', rodic: ['.opp-card', '.deal-card', '.card', 'main'], text: 'levnější než 98 % podobných' },
  { stranka: 'index.html', trida: 'deal-badge', rodic: ['.deal-card', '.deals-sec', '.card', 'main'], text: 'nejvýhodnější' },
  { stranka: 'index.html', trida: 'ob-kratky', rodic: ['.opp-card', '.card', 'main'], text: 'Dražba' },
  { stranka: 'pozemky-okres-tabor.html', trida: 'okr-badge', rodic: ['.okr-item', '.okr-list', 'main'], text: 'Na prodej' },
  { stranka: 'pozemky-okres-tabor.html', trida: 'okr-sleva', rodic: ['.okr-item', '.okr-list', 'main'], text: 'zlevněno o 12 %' },
  { stranka: 'pozemky-okres-tabor.html', trida: 'okr-overit', rodic: ['.okr-item', '.okr-list', 'main'], text: 'cena k ověření' },
];

/* Bez tohohle by stačil překlep ve jménu třídy a zkouška by měřila
   neobarvený text — tedy nic. */
const css = readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
for (const o of [...new Set(ODZNAKY.map((x) => x.trida))]) {
  pravda(`třída .${o} v css/styles.css existuje`, css.indexOf('.' + o) !== -1);
}

/* Skutečná funkce, ne text: s textovým zápisem bere Playwright
   druhý argument jako nic a funkce dostane undefined. */
const MERIC = (zadani) => {
  const rodic = zadani.rodic.map((s) => document.querySelector(s)).find(Boolean);
  if (!rodic) return { chyba: 'žádný z rodičů na stránce není: ' + zadani.rodic.join(', ') };
  const el = document.createElement('span');
  el.className = zadani.trida;
  el.textContent = zadani.text;
  rodic.appendChild(el);
  const st = getComputedStyle(el);
  const lum = (r, g, b) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const par = (t) => { const m = /rgba?\(([^)]+)\)/.exec(t || ''); if (!m) return null;
    const q = m[1].split(',').map(Number); return { r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 }; };
  const smes = (pop, spod) => ({ r: pop.r * pop.a + spod.r * (1 - pop.a),
    g: pop.g * pop.a + spod.g * (1 - pop.a), b: pop.b * pop.a + spod.b * (1 - pop.a), a: 1 });
  /* PŘECHOD SE MUSÍ POČÍTAT TAKY, a to je past, do které jsem tady spadl.
     Odznak „nejvýhodnější" má background:linear-gradient(...), tedy barvu
     v background-IMAGE; background-color je u něj průhledný. Měřič, který
     čte jen background-color, přechod přeskočí a vezme podklad karty — a tím
     ohlásil 1,07 : 1 u odznaku, který je ve skutečnosti tmavý text na jasně
     zelené. Nahlásil bych vadu, která není. Ze zarážek přechodu se proto
     bere ta NEJHORŠÍ: text na přechodu leží na několika barvách zároveň
     a rozhoduje ta, na které je čitelný nejmíň. */
  const zarazky = (obr) => {
    const out = [];
    for (const m of String(obr).matchAll(/rgba?\(([^)]+)\)/g)) {
      const q = m[1].split(',').map(Number);
      if (q.slice(0, 3).some((x) => !isFinite(x))) continue;
      out.push({ r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 });
    }
    return out;
  };
  /* První KRYCÍ plocha nad odznakem je skutečný podklad; průsvitné vrstvy
     nad ní se na ni namíchají v tom pořadí, v jakém leží. */
  const zavoje = [];
  let zaklad = null, e = el;
  while (e && !zaklad) {
    const st2 = getComputedStyle(e);
    if (st2.backgroundImage && st2.backgroundImage !== 'none') {
      const z = zarazky(st2.backgroundImage);
      const plne = z.filter((c) => c.a >= 0.99);
      if (plne.length) { zaklad = plne; break; }
      z.filter((c) => c.a > 0.02).forEach((c) => zavoje.push(c));
    }
    const c = par(st2.backgroundColor);
    if (c && c.a >= 0.99) { zaklad = [c]; break; }
    if (c && c.a > 0.02) zavoje.push(c);
    e = e.parentElement;
  }
  if (!zaklad) zaklad = [{ r: 255, g: 255, b: 255, a: 1 }];
  /* Z možných podkladů se bere ten, na kterém je text nejhůř čitelný. */
  let bg = null, nejhorsi = Infinity;
  for (const z of zaklad) {
    let v = z;
    for (let i = zavoje.length - 1; i >= 0; i--) v = smes(zavoje[i], v);
    const f0 = par(st.color);
    if (!f0) { bg = v; break; }
    const fx = f0.a < 1 ? smes(f0, v) : f0;
    const p0 = (Math.max(lum(fx.r, fx.g, fx.b), lum(v.r, v.g, v.b)) + 0.05)
      / (Math.min(lum(fx.r, fx.g, fx.b), lum(v.r, v.g, v.b)) + 0.05);
    if (p0 < nejhorsi) { nejhorsi = p0; bg = v; }
  }
  const fgRaw = par(st.color);
  if (!fgRaw) { el.remove(); return { chyba: 'barva textu se nedá přečíst: ' + st.color }; }
  const fg = fgRaw.a < 1 ? smes(fgRaw, bg) : fgRaw;
  const L1 = lum(fg.r, fg.g, fg.b), L2 = lum(bg.r, bg.g, bg.b);
  const pomer = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  const px = parseFloat(st.fontSize), tucne = (parseInt(st.fontWeight, 10) || 400) >= 700;
  const velky = px >= 24 || (px >= 18.66 && tucne);
  const vysledek = { pomer: Math.round(pomer * 100) / 100, mez: velky ? 3 : 4.5, px: Math.round(px),
    barva: st.color, pozadi: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
    rodic: (rodic.className && typeof rodic.className === 'string' ? '.' + rodic.className.trim().split(/\s+/)[0] : rodic.tagName) };
  el.remove();
  return vysledek;
};

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const STRANKY = [...new Set(ODZNAKY.map((o) => o.stranka))];
let zmereno = 0;
for (const rezim of ['light', 'dark'])
for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 },
    hasTouch: true, isMobile: true });
  /* Tmavý jen uloženou volbou — web se podle systému neztmavuje, takže
     emulace přes colorScheme by měřila dvakrát světlý motiv. */
  if (rezim === 'dark') {
    await ctx.addInitScript(() => { try { localStorage.setItem('pk_rezim_v1', 'dark'); } catch (e) { /* ok */ } });
  }
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1300);
  for (const o of ODZNAKY.filter((x) => x.stranka === s)) {
    const v = await p.evaluate(MERIC, o).catch((e) => ({ chyba: String(e).slice(0, 80) }));
    if (v.chyba) { pravda(`.${o.trida} (${rezim === 'dark' ? 'tmavý' : 'světlý'}) se dal změřit`, false, v.chyba); continue; }
    zmereno++;
    pravda(`.${o.trida} na ${s} (${rezim === 'dark' ? 'tmavý' : 'světlý'}): ${v.pomer} : 1, nutné ${v.mez}`,
      v.pomer >= v.mez,
      `${v.barva} na ${v.pozadi}, ${v.px} px, vloženo do ${v.rodic}`);
  }
  await ctx.close();
}
await prohlizec.close();

/* Kdyby se rodič nenašel ani jednou, všechno výš by se přeskočilo
   a zkouška by prošla, aniž by cokoli změřila. */
pravda(`změřilo se dost odznaků (${zmereno})`, zmereno === ODZNAKY.length * 2,
  `${zmereno} z ${ODZNAKY.length * 2} — některý se nedal vložit`);

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odznaky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
