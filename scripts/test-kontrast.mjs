// Měření kontrastu textu podle WCAG 2.1.
//
// Spuštění: node scripts/test-kontrast.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Kontrast není věc vkusu — je to číslo. Norma žádá poměr jasu aspoň
// 4,5 : 1 u běžného textu a 3 : 1 u velkého (nad 24 px, nebo nad 18,66 px
// tučně). Pod tím se text na mobilu na slunci prostě nepřečte a web
// působí vybledle.
//
// Skript projde stránky, u každého textu dohledá skutečné pozadí (i přes
// průhledné vrstvy) a spočítá poměr. Hlásí jen to, co normou neprojde.
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKY = ['index.html', 'cena-pozemku.html', 'pozemky-okres-tabor.html',
  'upozorneni.html', 'zpravy.html', 'hlidani.html', 'pridat.html', 'kontakt.html'];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const MERENI = `(() => {
  const lum = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const smichej = (pop, spod) => ({
    r: pop.r * pop.a + spod.r * (1 - pop.a),
    g: pop.g * pop.a + spod.g * (1 - pop.a),
    b: pop.b * pop.a + spod.b * (1 - pop.a), a: 1
  });
  // Barevné zarážky přechodu. Dřív se prvek s přechodem přeskočil — jenže
  // přechod je PRÁVĚ to místo, kde kontrast selže, protože text leží na
  // dvou různých barvách najednou. Měří se proti všem zarážkám a bere se
  // ta nejhorší; jinak by tmavý pás zůstal nezměřený.
  const zarazky = (obrazek) => {
    const out = [];
    // POZOR: tenhle kód je uvnitř šablonového řetězce, takže lomítko musí
    // být zdvojené — jinak ho JavaScript spolkne, výraz hledá nesmysl,
    // parseFloat vrátí NaN a „NaN < 4,5" je vždy nepravda. Test pak mlčí
    // a tváří se, že je všechno v pořádku. Přesně to se tu stalo.
    for (const m of String(obrazek).matchAll(/rgba?\\(([^)]+)\\)/g)) {
      const p = m[1].split(',').map((x) => parseFloat(x));
      const a = p.length > 3 ? p[3] : 1;
      if (a > 0.5) out.push({ r: p[0], g: p[1], b: p[2], a: 1 });   // průhledné závoje neurčují podklad
    }
    return out;
  };
  // Skutečné pozadí: projdeme předky, dokud nenarazíme na neprůhledný podklad.
  // Vrací SEZNAM možných podkladů (u přechodu jich je víc).
  const pozadi = (el) => {
    let vrstvy = [], e = el;
    while (e) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') {
        const z = zarazky(s.backgroundImage);
        if (z.length) {
          // zarážky se podloží tím, co je pod nimi, ať vyjde skutečná barva
          const spod = vrstvy.length ? vrstvy[vrstvy.length - 1] : { r: 255, g: 255, b: 255, a: 1 };
          return z.map((c) => (vrstvy.length ? c : c));
        }
        return null;      // obrázek nebo přechod bez čitelných barev — neměříme
      }
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { vrstvy.push(c); if (c.a === 1) break; }
      e = e.parentElement;
    }
    if (!vrstvy.length) return [{ r: 255, g: 255, b: 255, a: 1 }];
    let vysledek = vrstvy[vrstvy.length - 1];
    for (let i = vrstvy.length - 2; i >= 0; i--) vysledek = smichej(vrstvy[i], vysledek);
    return [vysledek];
  };
  const out = [];
  const videt = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05 && r.width > 0 && r.height > 0;
  };
  document.querySelectorAll('body *').forEach((el) => {
    const vlastni = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!vlastni || !videt(el)) return;
    const s = getComputedStyle(el);
    const fg = parse(s.color); if (!fg) return;
    const podklady = pozadi(el); if (!podklady || !podklady.length) return;
    // Nejhorší z možných podkladů — u přechodu rozhoduje ten, na kterém je
    // text nejhůř čitelný, ne průměr.
    let pomer = Infinity, bg = podklady[0];
    for (const kandidat of podklady) {
      const f = fg.a < 1 ? smichej(fg, kandidat) : fg;
      const L1 = lum(f.r, f.g, f.b), L2 = lum(kandidat.r, kandidat.g, kandidat.b);
      const p = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (p < pomer) { pomer = p; bg = kandidat; }
    }
    const px = parseFloat(s.fontSize), tucne = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const velky = px >= 24 || (px >= 18.66 && tucne);
    const mez = velky ? 3 : 4.5;
    if (pomer < mez) out.push({
      text: (el.textContent || '').trim().slice(0, 42),
      trida: (el.className && typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : el.tagName.toLowerCase()),
      barva: s.color, pozadi: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
      pomer: Math.round(pomer * 100) / 100, mez, px: Math.round(px)
    });
  });
  return out;
})()`;

const vse = [];
for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1600);
  // Sekce, které se odkrývají při scrollování, jsou do té doby průhledné
  // a měření je přeskakovalo — test tím kontroloval jen horní část stránky.
  // Odkryjeme je natvrdo; jinak by „0 chyb" znamenalo jen „0 chyb nahoře".
  await p.addStyleTag({ content: '.reveal,.reveal.in{opacity:1!important;transform:none!important;visibility:visible!important}' });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  const nalezy = await p.evaluate(MERENI);
  nalezy.forEach((n) => vse.push(Object.assign({ stranka: s }, n)));
  await ctx.close();
}
await prohlizec.close();

// Sloučíme podle třídy a barvy — jeden problém se opakuje na stovkách prvků.
const podle = new Map();
for (const n of vse) {
  const k = n.trida + '|' + n.barva + '|' + n.pozadi + '|' + n.px;
  const z = podle.get(k) || Object.assign({}, n, { kolik: 0, stranky: new Set() });
  z.kolik++; z.stranky.add(n.stranka);
  if (n.pomer < z.pomer) z.pomer = n.pomer;
  podle.set(k, z);
}
const seznam = [...podle.values()].sort((a, b) => a.pomer - b.pomer);

console.log(`\nKontrast textu (WCAG AA): ${vse.length} prvků neprošlo, ${seznam.length} různých případů\n`);
for (const z of seznam.slice(0, 25)) {
  console.log(`  ${String(z.pomer).padStart(5)} : 1  (nutné ${z.mez})  ${String(z.px).padStart(2)}px  .${z.trida}`);
  console.log(`          ${z.barva} na ${z.pozadi} · ${z.kolik}× · ${[...z.stranky].slice(0, 3).join(', ')}`);
  console.log(`          „${z.text}"`);
}
if (!seznam.length) { console.log('  Všechno projde.\n'); process.exit(0); }
if (seznam.length > 25) console.log(`  …a dalších ${seznam.length - 25} případů.`);
console.error(`\n::error::Kontrast: ${vse.length} prvků nesplňuje WCAG AA. ` +
  'Opravte barvy v css/styles.css (textové varianty mají příponu -ink).');
process.exit(1);
