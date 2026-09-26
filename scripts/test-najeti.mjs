// Co se stane, když na to najedeš myší — a na mobilu, když se toho dotkneš.
//
// Spuštění: node scripts/test-najeti.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Proč zvlášť: scripts/test-kontrast.mjs měří KLIDOVÝ stav. Řádek filtrů
// měl .msf-summary:hover{color:#fff} — zbytek po tmavém motivu, který
// nikdo nepřebarvil. Panel pod ním je ale bílý, takže po najetí myší
// popisek i šipka zmizely. Ikona a odznak mají vlastní barvu, tak
// zůstaly — a řádek vypadal prázdný, jen s ikonou a číslem. Na telefonu
// je to horší: tam :hover po klepnutí VISÍ, dokud člověk neklepne jinam,
// takže to není bliknutí, ale trvalý stav. Přesně tohle přišlo jako
// stížnost od člověka, co web používá.
//
// Jak se to měří: ze stylopisu se vyberou pravidla s :hover, která mění
// barvu textu. Pro každý prvek, na který takové pravidlo sedí, se ta
// barva dosadí (aby se rozbalily proměnné v jeho kontextu) a porovná se
// s plochou, na které prvek leží — tou, kterou bude mít PO najetí, když
// si pravidlo mění i pozadí.
//
// Nehoduje se, nekliká se, nečeká se na myš: stav :hover je jen jiná
// sada deklarací a přesně ty se měří. Je to tím rychlé a spolehlivé.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const STRANKY = ['index.html', 'pridat.html', 'hlidani.html', 'upozorneni.html',
  'zpravy.html', 'muj-inzerat.html', 'kontakt.html', 'pozemek.html',
  'cena-pozemku.html', 'drazby-pozemku.html', 'inzerce.html'];

/* ---- 1. vytáhnout ze stylopisu pravidla s :hover, která mění barvu ---- */
const css = readFileSync('css/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function pravidla(text) {
  const ven = [];
  let hloubka = 0, zacatekSel = 0, sel = '', telo = 0;
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (z === '{') {
      if (hloubka === 0) { sel = text.slice(zacatekSel, i).trim(); telo = i + 1; }
      hloubka++;
    } else if (z === '}') {
      hloubka--;
      if (hloubka === 0) {
        const t = text.slice(telo, i);
        // @media a spol.: uvnitř jsou další pravidla, projdeme je taky
        if (sel.startsWith('@')) ven.push(...pravidla(t));
        else ven.push({ sel: sel, telo: t });
        zacatekSel = i + 1;
      }
      if (hloubka < 0) hloubka = 0;
    }
  }
  return ven;
}

function deklarace(telo) {
  const d = {};
  telo.split(';').forEach((kus) => {
    const i = kus.indexOf(':');
    if (i < 0) return;
    const k = kus.slice(0, i).trim().toLowerCase();
    const v = kus.slice(i + 1).trim();
    if (k && v) d[k] = v;
  });
  return d;
}

// ze selektoru „a:hover, b:hover span" vytáhne jen ty části, které :hover
// opravdu mají, a :hover z nich odřízne (včetně toho, co je za ním)
function zaklad(sel) {
  return sel.split(',').map((s) => s.trim()).filter((s) => /:hover\b/.test(s))
    .map((s) => s.replace(/:hover\b/g, '').replace(/::?[a-z-]+\([^)]*\)/gi, '').trim())
    .filter((s) => s && !/::/.test(s));
}

/* SPECIFICITA. Bez ní test lže. Patička má .foot-col a:hover{color:
   var(--text-ondark)} a o osm set řádků níž, v části pro tmavý pás,
   .foot-col a:hover{color:var(--text-ondeep)}. Na stránce vyhraje to
   druhé a všechno je v pořádku — kdo ale zkouší pravidla po jednom,
   nahlásí jedenáct chyb, které neexistují. Proto se u každého prvku
   napřed spočítá, které z pravidel, co na něj sedí, opravdu vyhrává. */
function specificita(sel) {
  const s = sel.replace(/\[[^\]]*\]/g, '\u00a7A').replace(/::[a-z-]+(\([^)]*\))?/gi, '\u00a7E');
  const id = (s.match(/#[\w-]+/g) || []).length;
  const tridy = (s.match(/\.[\w-]+/g) || []).length
    + (s.match(/\u00a7A/g) || []).length
    + (s.match(/:(?!:)[a-z-]+(\([^)]*\))?/gi) || []).length;
  const prvky = (s.replace(/[#.][\w-]+/g, ' ').replace(/:(?!:)[a-z-]+(\([^)]*\))?/gi, ' ')
    .match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length + (s.match(/\u00a7E/g) || []).length;
  return id * 10000 + tridy * 100 + prvky;
}

/* Berou se VŠECHNA pravidla :hover, ne jen ta, co mění barvu textu:
   pravidlo, které mění jen pozadí, rozhoduje o tom, proti čemu se
   barva měří. */
const najeti = [];
let poradi = 0;
for (const r of pravidla(css)) {
  poradi++;
  if (!/:hover\b/.test(r.sel)) continue;
  const d = deklarace(r.telo);
  const pozadi = d['background-color'] || d.background || null;
  if (!d.color && !pozadi) continue;
  for (const cast of r.sel.split(',').map((x) => x.trim())) {
    if (!/:hover\b/.test(cast)) continue;
    const z = cast.replace(/:hover\b/g, '').replace(/::?[a-z-]+\([^)]*\)/gi, '').trim();
    if (!z || /::/.test(z)) continue;
    najeti.push({ sel: z, puvodni: r.sel, barva: d.color || null, pozadi: pozadi,
      spec: specificita(cast), poradi: poradi });
  }
}
if (!najeti.filter((x) => x.barva).length) {
  console.log('Ve stylopisu není jediné pravidlo :hover, které mění barvu textu.');
  console.log('To je podezřelé — test by neměřil nic. Ukončuji jako chybu.');
  process.exit(1);
}

/* ---- 2. změřit v prohlížeči ---- */
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 } });
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.protocol === 'file:' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  return r.abort();
});

const nalezy = [];
let zmereno = 0;

for (const s of STRANKY) {
  const p = await ctx.newPage();
  try {
    await p.goto('file://' + process.cwd() + '/' + s, { waitUntil: 'domcontentloaded' });
  } catch (e) { await p.close(); continue; }
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
  await p.waitForTimeout(200);

  const vysledek = await p.evaluate((seznam) => {
    const rgb = (t) => { const m = /rgba?\(([^)]+)\)/.exec(t); if (!m) return null;
      const c = m[1].split(',').map(parseFloat);
      return { r: c[0], g: c[1], b: c[2], a: c.length > 3 ? c[3] : 1 }; };
    const slozit = (vrch, spod) => ({
      r: vrch.r * vrch.a + spod.r * (1 - vrch.a),
      g: vrch.g * vrch.a + spod.g * (1 - vrch.a),
      b: vrch.b * vrch.a + spod.b * (1 - vrch.a), a: 1,
    });
    /* Barevný přechod na pozadí: vytáhneme z něj barvy a vezmeme jejich
       průměr. Přesné to není, ale na rozhodnutí „je to vidět / není"
       to stačí. Původně se prvek s přechodem přeskakoval — jenže
       přechod má patička i karty, tedy velká část webu, a test pak
       měřil jediný prvek z celé stránky. Fotku ani ikonu v pozadí
       odhadnout nejde, tam se dál nehádá. */
    const zPrechodu = (img) => {
      if (!img || img === 'none') return null;
      if (!/gradient\(/.test(img)) return 'nevim';
      const barvy = (img.match(/rgba?\([^)]+\)/g) || []).map(rgb).filter(Boolean);
      if (!barvy.length) return null;
      const n = barvy.length;
      return barvy.reduce((a2, c) => ({
        r: a2.r + c.r / n, g: a2.g + c.g / n, b: a2.b + c.b / n, a: a2.a + c.a / n,
      }), { r: 0, g: 0, b: 0, a: 0 });
    };
    /* Plocha pod textem: první neprůhledné pozadí od uzlu nahoru.
       Počítá se AŽ VE CHVÍLI, kdy je hover nasazený — pravidlo si může
       měnit i pozadí a pak se měří proti tomu novému. */
    const podklad = (el) => {
      let e = el;
      while (e) {
        const c = getComputedStyle(e);
        const zakl = rgb(c.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
        const pre = zPrechodu(c.backgroundImage);
        if (pre === 'nevim') return null;                 // fotka — neodhadneme
        if (pre) {
          const spod = zakl.a >= 0.95 ? zakl : null;
          const v = spod ? slozit(pre, spod) : pre;
          if (pre.a >= 0.9 || spod) return { r: v.r, g: v.g, b: v.b, a: 1 };
        }
        if (zakl.a >= 0.95) return zakl;
        e = e.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const pomer = (a, b) => { const la = lum(a), lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

    /* Uzly s vlastním textem uvnitř prvku, včetně prvku samotného.
       Nestačí se dívat jen na prvek: řádek filtrů má text v <span>
       uvnitř, a právě ten <span> barvu DĚDÍ — takže když :hover
       přebarví <summary>, zmizí text ve spanu. Kdo měří jen vlastní
       textové uzly prvku, tenhle případ neuvidí. */
    const stextem = (el) => {
      const ven = [];
      const projdi = (n) => {
        let vlastni = '';
        n.childNodes.forEach((x) => { if (x.nodeType === 3) vlastni += x.nodeValue; });
        if (vlastni.trim()) {
          const r = n.getBoundingClientRect();
          const c = getComputedStyle(n);
          if (r.width >= 4 && r.height >= 4 && c.visibility !== 'hidden' && +c.opacity > 0) {
            ven.push({ uzel: n, text: vlastni.trim().replace(/\s+/g, ' ') });
          }
        }
        for (const x of n.children) projdi(x);
      };
      projdi(el);
      return ven;
    };

    /* Nejdřív se ke každému prvku sesbírají VŠECHNA pravidla :hover,
       která na něj sedí, a seřadí se tak, jak by je seřadil prohlížeč:
       podle specificity, při shodě podle pořadí ve stylopisu. Teprve
       vítěz se dosadí. */
    const naPrvek = new Map();
    for (const pr of seznam) {
      let prvky;
      try { prvky = document.querySelectorAll(pr.sel); } catch (e) { continue; }
      for (const el of prvky) {
        if (!naPrvek.has(el)) naPrvek.set(el, []);
        naPrvek.get(el).push(pr);
      }
    }

    const ven = [];
    for (const [el, pravidla] of naPrvek) {
      {
        pravidla.sort((a, b) => (a.spec - b.spec) || (a.poradi - b.poradi));
        let pr = null, pozadi = null;
        for (const x of pravidla) {          // poslední vítězí, každá vlastnost zvlášť
          if (x.barva) pr = x;
          if (x.pozadi) pozadi = x.pozadi;
        }
        if (!pr) continue;                   // mění se jen pozadí, text zůstává
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const c = getComputedStyle(el);
        if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity === 0) continue;
        const kand = stextem(el);
        if (!kand.length) continue;

        const pred = kand.map((k) => getComputedStyle(k.uzel).color);
        const bylo = el.getAttribute('style');
        el.style.setProperty('color', pr.barva.replace(/\s*!important\s*$/i, ''), 'important');
        if (!el.style.getPropertyValue('color')) {          // prohlížeč hodnotu odmítl
          if (bylo === null) el.removeAttribute('style'); else el.setAttribute('style', bylo);
          continue;
        }
        if (pozadi) el.style.setProperty('background-color', pozadi.replace(/\s*!important\s*$/i, ''), 'important');

        /* Měří se jen text, kterému se barva opravdu ZMĚNILA. Potomek
           s vlastní barvou (ikona, odznak) na hover rodiče nereaguje a
           do měření nepatří — jinak by test hlásil chyby tam, kde se
           nic neděje. Porovnává se skutečná spočtená barva před a po,
           ne odhad podle stylopisu. */
        const merit = [];
        for (let i = 0; i < kand.length; i++) {
          const po = getComputedStyle(kand[i].uzel).color;
          if (po === pred[i]) continue;
          const s = getComputedStyle(kand[i].uzel);
          merit.push({ k: kand[i], popredi: rgb(po), spod: podklad(kand[i].uzel),
            vel: parseFloat(s.fontSize) || 16, tucne: (parseInt(s.fontWeight, 10) || 400) >= 700 });
        }
        if (bylo === null) el.removeAttribute('style'); else el.setAttribute('style', bylo);

        for (const m of merit) {
          if (!m.popredi || !m.spod) continue;
          const pop = m.popredi.a >= 0.95 ? m.popredi : slozit(m.popredi, m.spod);
          const prah = (m.vel >= 24 || (m.vel >= 18.66 && m.tucne)) ? 3 : 4.5;   // WCAG 1.4.3
          ven.push({ sel: pr.puvodni, text: m.k.text.slice(0, 40),
            pomer: +pomer(pop, m.spod).toFixed(2), prah: prah,
            popredi: `rgb(${Math.round(pop.r)}, ${Math.round(pop.g)}, ${Math.round(pop.b)})`,
            spod: `rgb(${Math.round(m.spod.r)}, ${Math.round(m.spod.g)}, ${Math.round(m.spod.b)})` });
        }
      }
    }
    return ven;
  }, najeti);

  for (const v of vysledek) {
    zmereno++;
    if (v.pomer < v.prah) nalezy.push(Object.assign({ stranka: s }, v));
  }
  await p.close();
}
await prohlizec.close();

console.log(`\nBarvy po najetí myší — ${najeti.length} pravidel :hover, změřeno ${zmereno} prvků`);
/* POJISTKA PROTI PRÁZDNÉMU TESTU. Tenhle test už jednou měřil jediný
   prvek z celé stránky a přitom hlásil „vše v pořádku" — podklad se
   vzdával u každého prvku s barevným přechodem, tedy u patičky i karet.
   Test, který nic nezměří, projde vždycky; proto se počet hlídá. */
const DOST = 40;
if (zmereno < DOST) {
  console.log(`\nZměřilo se jen ${zmereno} prvků, čekáno aspoň ${DOST}.`);
  console.log('Test, který nic nezměří, projde vždycky — tohle není úspěch, ale porucha měření.');
  process.exit(1);
}
if (!nalezy.length) {
  console.log('Po najetí myší zůstává všude text čitelný.');
  process.exit(0);
}
const videno = new Set();
nalezy.forEach((n) => {
  const k = n.stranka + '|' + n.sel;
  if (videno.has(k)) return;
  videno.add(k);
  console.log(`  ✕ ${n.stranka}  ${n.sel}\n      „${n.text}" má po najetí kontrast ${n.pomer.toFixed(2)}:1`
    + ` (potřeba ${n.prah}:1) — ${n.popredi} na ${n.spod}`);
});
console.log(`\n${videno.size} pravidel :hover schová text, na který se najede.`);
process.exit(1);
