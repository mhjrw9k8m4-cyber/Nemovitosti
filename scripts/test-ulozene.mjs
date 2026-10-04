// Test: co si web pamatuje, je vypsané a dá se to smazat.
//
// Spuštění: node scripts/test-ulozene.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Web si v prohlížeči drží dvaadvacet různých věcí. Dozvědět se to
// nešlo odnikud a smazat jednotlivě už vůbec — kdo chtěl mít po sobě
// uklizeno, musel vymazat data celého webu, tedy i to, co si chtěl
// nechat. Zásady soukromí o tom mluví slovy, jenže slova se nedají
// stisknout.
//
// NEJDŮLEŽITĚJŠÍ KONTROLA JE TA PRVNÍ: každý klíč, který kód doopravdy
// používá, musí být v seznamu js/ulozene.js. Bez ní by stránka „Moje
// data" postupně zastarala a tvrdila by lidem něco, co neplatí —
// a stránka o soukromí, která lže, je horší než žádná.
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nMoje data — co si web pamatuje');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Moje data: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* ---- 1) žádné úložiště nesmí chybět v seznamu ---- */
const U = (() => {
  const g = { window: {} };
  const kod = readFileSync(path.join(KOREN, 'js', 'ulozene.js'), 'utf8');
  new Function('window', kod)(g.window);
  return g.window.PKUlozene;
})();
pravda('seznam úložišť se dá načíst', !!(U && U.KLICE && U.KLICE.length),
  'js/ulozene.js nevystavilo PKUlozene');
if (!U || !U.KLICE) hotovo();

{
  /* Hledá se v ŽIVÉM kódu, ne v seznamu — jinak by se seznam ověřoval
     sám sebou. Komentáře se odstraňují: klíč zmíněný ve vysvětlivce
     není klíč, který se používá. */
  const soubory = readdirSync(path.join(KOREN, 'js')).filter((f) => /\.js$/.test(f))
    .map((f) => ['js/' + f, readFileSync(path.join(KOREN, 'js', f), 'utf8')])
    .concat(readdirSync(KOREN).filter((f) => /\.html$/.test(f)
        && !/^(pozemek-|pozemky-okres-|pozemky-.*-kraj\.html$)/.test(f))
      .map((f) => [f, readFileSync(path.join(KOREN, f), 'utf8')]));
  const vSeznamu = new Set(U.KLICE.map((k) => k.klic));
  const nalezene = new Map();
  for (const [jm, t] of soubory) {
    if (/\/ulozene\.js$/.test(jm)) continue;         // sám seznam se nepočítá
    const bez = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of bez.matchAll(/['"](pk_[a-z0-9_]+)['"]/g)) {
      if (!nalezene.has(m[1])) nalezene.set(m[1], jm);
    }
  }
  // PŘEDPOKLAD: kdyby se nenašlo nic, kontrola níž projde naprázdno
  pravda('v kódu se opravdu nějaká úložiště našla', nalezene.size >= 15,
    `nalezeno ${nalezene.size} klíčů`);
  const chybi = [...nalezene.entries()].filter(([k]) => !vSeznamu.has(k));
  pravda('a KAŽDÉ z nich je v seznamu „Moje data"', chybi.length === 0,
    chybi.map(([k, kde]) => `${k} (${kde})`).join('\n      '));
  /* A obráceně: seznam nesmí slibovat mazání něčeho, co nikdo neukládá —
     to by byl mrtvý řádek, který jen mate. */
  const navic = U.KLICE.map((k) => k.klic).filter((k) => !nalezene.has(k));
  pravda('a seznam neuvádí nic, co se nikde neukládá', navic.length === 0,
    navic.join(', '));
}

/* ---- 2) každý řádek má česky napsané, co to je ---- */
{
  const bezPopisu = U.KLICE.filter((k) => !k.nazev || !k.popis || k.popis.length < 20);
  pravda('u každého úložiště stojí, co v něm je', bezPopisu.length === 0,
    bezPopisu.map((k) => k.klic).join(', '));
  const bezSkupiny = U.KLICE.filter((k) => !U.SKUPINY.some((s) => s.id === k.skupina));
  pravda('a patří do některé ze skupin', bezSkupiny.length === 0,
    bezSkupiny.map((k) => k.klic).join(', '));
  pravda('skloňování počtů funguje (1 poznámka, 2 poznámky, 5 poznámek)',
    U.tvar(1, ['poznámka', 'poznámky', 'poznámek']) === 'poznámka'
    && U.tvar(2, ['poznámka', 'poznámky', 'poznámek']) === 'poznámky'
    && U.tvar(5, ['poznámka', 'poznámky', 'poznámek']) === 'poznámek');
}

/* ---- 3) stránka vypisuje a maže ---- */
const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_fav_v1', JSON.stringify(['a|1|X|50.0|14.0', 'b|2|Y|49.0|15.0']));
    localStorage.setItem('pk_poznamky_v1', JSON.stringify({ k1: { text: 'plot', kdy: Date.now() } }));
    localStorage.setItem('pk_rezim_v1', 'dark');
    sessionStorage.setItem('pk_map_return', JSON.stringify({ lat: 50, lng: 14 }));
  });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}/moje-data.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1400);

  const v = await p.evaluate(() => ({
    radku: document.querySelectorAll('.md-radek').length,
    nazvy: [...document.querySelectorAll('.md-radek .md-r-text b')].map((e) => e.textContent),
    pocty: [...document.querySelectorAll('.md-r-kolik')].map((e) => e.textContent),
    souhrn: (document.querySelector('.md-vse p') || {}).textContent || '',
    pozn: (document.querySelector('.md-pozn') || {}).textContent || '',
    poznOdkazy: [...document.querySelectorAll('.md-pozn a')].map((a) => a.getAttribute('href')),
    vyskaTlacitka: (() => { const b = document.querySelector('.md-smaz');
      return b ? Math.round(b.getBoundingClientRect().height) : 0; })(),
  }));
  pravda('stránka vypíše, co je uložené', v.radku >= 4, `řádků: ${v.radku}`);
  pravda('a jmenuje to, co tam opravdu je',
    v.nazvy.indexOf('Uložené pozemky') >= 0 && v.nazvy.indexOf('Soukromé poznámky') >= 0,
    v.nazvy.join(', '));
  pravda('a říká, KOLIK toho je — se správným skloňováním',
    v.pocty.some((t) => /2 pozemky/.test(t)) && v.pocty.some((t) => /1 poznámka/.test(t)),
    v.pocty.slice(0, 3).join(' | '));
  pravda('a u dočasných říká, že zmizí po zavření prohlížeče',
    v.pocty.some((t) => /zmizí po zavření/.test(t)), v.pocty.join(' | '));
  pravda('mazací tlačítko se dá trefit prstem (44 px)', v.vyskaTlacitka >= 44,
    `${v.vyskaTlacitka} px`);
  /* Co stránka NEUMÍ, musí být napsané: slíbit „smazáno" a nechat data
     na serveru by bylo horší než mlčet. */
  /* Odkazy se čtou z DOM, ne z textu: textContent adresy neobsahuje
     a podmínka napsaná nad textem byla nesmysl, který nic neměřil. */
  pravda('a stránka přizná, že data na účtu tím nemizí',
    /účtu/.test(v.pozn), v.pozn.slice(0, 120));
  pravda('a pošle člověka tam, kde se mažou',
    ['hlidani.html', 'zpravy.html', 'muj-inzerat.html']
      .every((h) => v.poznOdkazy.indexOf(h) >= 0),
    'odkazy: ' + v.poznOdkazy.join(', '));

  // smazání jednoho
  await p.click('.md-radek .md-smaz');
  await p.waitForTimeout(600);
  const po1 = await p.evaluate(() => ({
    radku: document.querySelectorAll('.md-radek').length,
    hlaska: (document.querySelector('.md-hotovo') || {}).textContent || '',
    fav: localStorage.getItem('pk_fav_v1'),
  }));
  pravda('smazání jednoho úložiště ho opravdu smaže', po1.fav === null,
    `pk_fav_v1 po smazání: ${po1.fav}`);
  pravda('a řekne, co zmizelo', /Smazáno/.test(po1.hlaska), po1.hlaska);

  // smazání všeho
  await p.click('#md-smaz-vse');
  await p.waitForTimeout(800);
  const po2 = await p.evaluate(() => ({
    prazdno: !!document.querySelector('.md-prazdno'),
    zbylo: Object.keys(localStorage).filter((k) => /^pk_/.test(k)).length
      + Object.keys(sessionStorage).filter((k) => /^pk_/.test(k)).length,
  }));
  pravda('„smazat všechno" nenechá nic', po2.zbylo === 0, `zbylo klíčů: ${po2.zbylo}`);
  pravda('a stránka pak řekne, že už tu nic není', po2.prazdno);
  pravda('nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

await prohlizec.close();
hotovo();
