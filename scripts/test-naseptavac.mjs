// Test: našeptávač obcí a nabídka opravy překlepu — v prohlížeči.
//
// Spuštění: node scripts/test-naseptavac.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč to nestačí testovat jako funkci: našeptávač je z půlky ovládání.
// Může se správně spočítat a přesto být k ničemu — když se nabídka schová
// dřív, než se do ní stihne klepnout, když ji nejde ovládat klávesnicí,
// nebo když jsou řádky na mobilu tak nízké, že se do nich netrefíte.
// Tohle všechno se pozná jen v prohlížeči.
//
// Hlídá se:
//   1. nabídka se objeví a ukáže obec i okres s počtem nabídek,
//   2. klepnutí ji vybere a výpis se podle toho zúží,
//   3. dá se ovládat šipkami a Enterem, Escape ji zavře,
//   4. řádky jsou na dotyk dost velké (stejné pravidlo jako test-dotyk),
//   5. při překlepu web nabídne opravu místo strohého „nic nemáme".
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(opt) {
  const ctx = await prohlizec.newContext(opt);
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/index.html*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  return { ctx, p };
}
const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// Obec, kterou v datech opravdu máme — test si ji vezme z dat, ne z hlavy.
const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pocty = {};
for (const d of DATA) if (d.place && d.okres) { const k = d.place + '|' + d.okres; pocty[k] = (pocty[k] || 0) + 1; }
const nejcastejsi = Object.entries(pocty).sort((a, b) => b[1] - a[1])[0][0].split('|');
const OBEC = nejcastejsi[0];
const ZACATEK = norm(OBEC).slice(0, 4);

const { ctx, p } = await otevri(TELEFON);
const pole = p.locator('#map-search');
const seznam = p.locator('#map-search-navrhy');

// --- 1) Nabídka se objeví a něco v ní je ----------------------------
await pole.click();
await pole.type(ZACATEK, { delay: 40 });
await p.waitForTimeout(250);
const videt = await seznam.isVisible();
pravda(`našeptávač se po napsání „${ZACATEK}" ukáže`, videt);
const radky = await p.locator('#map-search-navrhy li').count();
pravda('a něco nabízí', radky > 0, `řádků: ${radky}`);
const prvni = await p.locator('#map-search-navrhy li').first().innerText().catch(() => '');
pravda('u nabídky je vidět okres i počet', /okr\.|celý okres/.test(prvni) && /\d+×/.test(prvni), prvni);

// --- 2) Řádky se dají trefit prstem ---------------------------------
const vysky = await p.$$eval('#map-search-navrhy li', (ls) => ls.map((l) => l.getBoundingClientRect().height));
pravda('řádky nabídky jsou na dotyk dost velké (≥ 36 px)',
  vysky.length > 0 && Math.min(...vysky) >= 36, 'nejnižší ' + Math.min(...vysky).toFixed(1) + ' px');

// --- 3) Ovládání klávesnicí -----------------------------------------
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(120);
pravda('šipka dolů označí první nabídku', (await p.locator('#map-search-navrhy li.on').count()) === 1);
await p.keyboard.press('Escape');
await p.waitForTimeout(120);
pravda('Escape nabídku zavře', !(await seznam.isVisible()));

// --- 4) Výběr nabídky zúží výpis ------------------------------------
/* Pozor na klepání naslepo: když se nabídka neukáže, Playwright čeká
   třicet vteřin a test spadne výjimkou místo srozumitelné hlášky. Proto
   se nejdřív ověří, že je vidět, a teprve pak se kliká. */
await pole.fill('');
await pole.type(ZACATEK, { delay: 40 });
await p.waitForTimeout(250);
if (await seznam.isVisible()) {
  await p.locator('#map-search-navrhy li').first().click({ timeout: 3000 });
  await p.waitForTimeout(400);
  const hodnota = await pole.inputValue();
  pravda('klepnutí na nabídku vyplní políčko celým názvem', hodnota.length > ZACATEK.length, `„${hodnota}"`);
  pravda('a nabídka se zavře', !(await seznam.isVisible()));
  const poVyberu = await p.locator('#opp-list li.opp-item, #opp-list li').count();
  pravda('výpis po výběru něco ukazuje', poVyberu > 0, `položek: ${poVyberu}`);
} else {
  pravda('klepnutí na nabídku vyplní políčko celým názvem', false, 'nabídka se vůbec neukázala');
  pravda('a nabídka se zavře', false, 'nabídka se vůbec neukázala');
  pravda('výpis po výběru něco ukazuje', false, 'nabídka se vůbec neukázala');
}

// --- 5) Překlep: web nabídne opravu ---------------------------------
const n = norm(OBEC);
const preklep = n.slice(0, 2) + (n.charAt(2) === 'x' ? 'y' : 'x') + n.slice(3);
await pole.fill('');
await pole.type(preklep, { delay: 20 });
await p.waitForTimeout(500);
const text = await p.locator('#opp-list').innerText().catch(() => '');
pravda('při překlepu web nabídne opravu, ne jen „nic nemáme"',
  /Mysleli jste/i.test(text), text.slice(0, 200));
const tlacitko = p.locator('#hledat-opravu');
if (await tlacitko.count() && await tlacitko.isVisible()) {
  await tlacitko.click({ timeout: 3000 });
  await p.waitForTimeout(400);
  const po = await pole.inputValue();
  pravda('a klepnutím se oprava rovnou vyhledá', norm(po) === n, `„${po}"`);
} else {
  pravda('a klepnutím se oprava rovnou vyhledá', false, 'tlačítko s opravou se vůbec neukázalo');
}

/* --- 6) Cena a výměra: souhrn v panelu, výběr na celé obrazovce -------
 *
 * Tři podoby před touhle (pět pilulek → osm s počty → posuvník) měly
 * společné, že se snažily vejít do úzkého sloupce mezi ostatní filtry.
 * Tam je na ně málo místa a všechny působily stísněně. Teď je v panelu
 * jen souhrn a výběr dostane celou obrazovku. Test hlídá, že panel je
 * opravdu krátký, že se výběr dá ovládat klepáním do sloupců a že se to,
 * co se vybralo, propíše do výpisu i zpátky do souhrnu. */
{
  const { ctx: ctx2, p: p2 } = await otevri(TELEFON, 'index.html');
  // Panel s filtry je na telefonu sbalený — rozbalíme ho, jako by na něj
  // člověk klepl. Bez toho Playwright třicet vteřin čeká na neviditelné
  // tlačítko a test spadne výjimkou místo čitelné hlášky.
  await p2.evaluate(() => {
    const d = document.getElementById('ms-filters');
    if (d) d.open = true;
  });
  await p2.waitForTimeout(400);

  const panel = await p2.evaluate(() => {
    const r = document.querySelector('.mc-shrnuti');
    return r ? {
      vyska: Math.round(r.getBoundingClientRect().height),
      tlacitek: r.querySelectorAll('.mcs-btn').length,
      texty: [...r.querySelectorAll('.mcs-btn')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')),
      posuvniku: document.querySelectorAll('.map-controls .mc-posuv, .map-controls .mc-rychle').length,
    } : null;
  });
  pravda('v panelu je souhrnná řada pro cenu i výměru',
    !!panel && panel.tlacitek === 2, JSON.stringify(panel));
  pravda('a zabere míň než sto pixelů (dřív to byly stovky)',
    !!panel && panel.vyska < 100, panel ? panel.vyska + ' px' : '—');
  pravda('v panelu už nezůstala ani pilulka, ani posuvník',
    !!panel && panel.posuvniku === 0, panel ? String(panel.posuvniku) : '—');
  pravda('dokud se nic nevybralo, souhrn říká „libovolná"',
    !!panel && panel.texty.every((t) => /libovoln/i.test(t)), panel ? panel.texty.join(' | ') : '—');

  // Otevřít cenu.
  await p2.locator('.mcs-btn').first().click();
  await p2.waitForTimeout(400);
  const okno = p2.locator('.rz-ov:not([hidden])');
  pravda('klepnutí na souhrn otevře výběr přes celou obrazovku', await okno.count() === 1);
  const sloupcu = await okno.locator('.rz-graf button').count();
  pravda('a je v něm histogram s aspoň deseti sloupci', sloupcu >= 10, `${sloupcu}`);
  const terce = await okno.locator('.rz-graf button').evaluateAll((b) => b.map((x) => Math.round(x.getBoundingClientRect().height)));
  pravda('sloupce jsou na dotyk dost vysoké (celá výška grafu)',
    terce.length > 0 && Math.min(...terce) >= 36, 'nejnižší ' + Math.min(...terce) + ' px');
  const hotovo0 = await okno.locator('.rz-hotovo').innerText();
  pravda('tlačítko dole rovnou říká, kolik nabídek je vidět', /\d/.test(hotovo0), hotovo0);
  pravda('dokud není co mazat, „Vymazat" se nenabízí',
    !(await okno.locator('.rz-vymaz').isVisible()),
    'tlačítko, po kterém se nic nestane, se čte jako „web nereaguje"');
  // Okno má přijet, ne se zjevit — stejné pravidlo jako u hlavičky.
  const prijezd = await p2.evaluate(() => {
    const c = getComputedStyle(document.querySelector('.rz-ov:not([hidden])'));
    return { jmeno: c.animationName, doba: parseFloat(c.animationDuration) || 0 };
  });
  pravda('okno přijíždí krátkou animací, ne cvaknutím',
    prijezd.jmeno === 'rzPrijezd' && prijezd.doba >= 0.15 && prijezd.doba <= 0.6,
    `${prijezd.jmeno}, ${prijezd.doba} s`);

  // Klepnutí vybere pásmo, druhé ho roztáhne.
  await okno.locator('.rz-graf button').nth(3).click();
  await p2.waitForTimeout(400);
  const po1 = await p2.evaluate(() => ({
    uvnitr: document.querySelectorAll('.rz-ov:not([hidden]) .rz-graf button.rz-uvnitr').length,
    hotovo: document.querySelector('.rz-ov:not([hidden]) .rz-hotovo').textContent,
    od: document.getElementById('map-cena-od').value,
  }));
  pravda('klepnutí na sloupec vybere pásmo', po1.uvnitr === 1, `zvýrazněno ${po1.uvnitr}`);
  pravda('a teprve teď se nabídne „Vymazat"', await okno.locator('.rz-vymaz').isVisible());
  pravda('a propíše se do políčka „od"', /^\d+$/.test(po1.od), `„${po1.od}"`);
  pravda('počet na tlačítku se změní', po1.hotovo !== hotovo0, `${hotovo0} → ${po1.hotovo}`);

  await okno.locator('.rz-graf button').nth(8).click();
  await p2.waitForTimeout(400);
  const po2 = await p2.evaluate(() => ({
    uvnitr: document.querySelectorAll('.rz-ov:not([hidden]) .rz-graf button.rz-uvnitr').length,
    od: document.getElementById('map-cena-od').value, do: document.getElementById('map-cena').value,
  }));
  pravda('druhé klepnutí rozsah ROZTÁHNE, nezačne znovu', po2.uvnitr > po1.uvnitr,
    `po prvním ${po1.uvnitr}, po druhém ${po2.uvnitr} — druhé klepnutí výběr zahodilo`);
  pravda('a naplní obě políčka', +po2.od > 0 && +po2.do > +po2.od, `${po2.od}–${po2.do}`);

  // Zavřít a zkontrolovat souhrn i výpis.
  await okno.locator('.rz-hotovo').click();
  await p2.waitForTimeout(500);
  const poZavreni = await p2.evaluate(() => ({
    otevreno: !!document.querySelector('.rz-ov:not([hidden])'),
    souhrn: document.querySelector('.mcs-btn').textContent.trim().replace(/\s+/g, ' '),
    zvyrazneno: document.querySelector('.mcs-btn').classList.contains('mcs-aktivni'),
    vypis: document.querySelectorAll('#opp-list li').length,
  }));
  pravda('okno se zavře', !poZavreni.otevreno);
  pravda('souhrn v panelu ukazuje vybraný rozsah',
    !/libovoln/i.test(poZavreni.souhrn), poZavreni.souhrn);
  pravda('a souhrn je vidět, že je aktivní', poZavreni.zvyrazneno);
  pravda('výpis něco ukazuje', poZavreni.vypis > 0, String(poZavreni.vypis));

  /* Ovládání klávesnicí. Okno překrývá celou stránku, takže z něj
     tabulátor nesmí utéct — jinak by se člověk ovládající web klávesnicí
     ztratil v obsahu, který není vidět. */
  await p2.locator('.mcs-btn').first().click();
  await p2.waitForTimeout(300);
  pravda('souhrn hlásí čtečce, že je okno otevřené',
    (await p2.locator('.mcs-btn').first().getAttribute('aria-expanded')) === 'true');
  let uteklo = 0;
  for (let i = 0; i < 30; i++) {
    await p2.keyboard.press('Tab');
    const uvnitr = await p2.evaluate(() => {
      const ov = document.querySelector('.rz-ov:not([hidden])');
      return !!(ov && ov.contains(document.activeElement));
    });
    if (!uvnitr) uteklo++;
  }
  pravda('tabulátor z okna neuteče', uteklo === 0, `${uteklo}× z 30 skončil mimo okno`);
  const sirky = await p2.locator('.rz-ov:not([hidden]) .rz-graf button').evaluateAll((b) => b.map((x) => Math.round(x.getBoundingClientRect().width)));
  pravda('sloupce jsou dost široké i na úzkém displeji (aspoň 20 px)',
    sirky.length > 0 && Math.min(...sirky) >= 20, 'nejužší ' + Math.min(...sirky) + ' px při ' + sirky.length + ' sloupcích');
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(300);
  pravda('a po zavření to souhrn ohlásí zpátky',
    (await p2.locator('.mcs-btn').first().getAttribute('aria-expanded')) === 'false');

  // Vymazat. (Nejdřív se ujistíme, že je zavřeno — otevřené okno by
  // klepnutí spolklo a test by místo hlášky spadl výjimkou.)
  const zavreno = (await p2.locator('.rz-ov:not([hidden])').count()) === 0;
  pravda('před dalším krokem je okno opravdu zavřené', zavreno,
    'zůstalo otevřené — další kroky by klepaly do něj');
  if (zavreno) await p2.locator('.mcs-btn').first().click();
  await p2.waitForTimeout(300);
  await p2.locator('.rz-ov:not([hidden]) .rz-vymaz').click({ timeout: 3000 });
  await p2.waitForTimeout(400);
  const poVymazani = await p2.evaluate(() => ({
    uvnitr: document.querySelectorAll('.rz-ov:not([hidden]) .rz-graf button.rz-uvnitr').length,
    pole: document.getElementById('map-cena-od').value + ',' + document.getElementById('map-cena').value,
  }));
  pravda('„Vymazat" výběr zruší', poVymazani.uvnitr === 0 && poVymazani.pole === ',',
    `zvýrazněno ${poVymazani.uvnitr}, políčka „${poVymazani.pole}"`);
  // Escape zavírá.
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(300);
  pravda('Escape okno zavře', await p2.locator('.rz-ov:not([hidden])').count() === 0);
  await ctx2.close();
}

/* --- Celá věta doopravdy: napsat, uvidět odznaky, zúžit výpis --------
   Rozbor věty má vlastní test bez prohlížeče (test-dotaz.mjs). Tady jde
   o to, co z něj člověk uvidí: že se počet nabídek opravdu změní, že se
   pochopené části ukážou jako odznaky a že příklad pod políčkem není jen
   text, ale vyplní se klepnutím.
   Kraj se přidával naposledy a je na něm vidět celá pointa: „Jihočeský
   kraj" dřív spadlo do hledání OBCE a vracelo nulu. */
{
  const { ctx: c3, p: p3 } = await otevri({ viewport: { width: 1280, height: 900 } });
  async function pocet() {
    return p3.$eval('#map-count', (e) => {
      const m = e.textContent.match(/([\d\s\u00a0]+)\s*na mapě/);
      return m ? parseInt(m[1].replace(/[\s\u00a0]/g, ''), 10) : -1;
    }).catch(() => -1);
  }
  async function napis(v) {
    await p3.fill('#map-search', v);
    await p3.waitForTimeout(700);
    return pocet();
  }
  const vse = await pocet();
  pravda('výchozí počet se dá přečíst', vse > 100, 'vyšlo ' + vse);

  const kraj = await napis('Jihočeský kraj');
  pravda('„Jihočeský kraj" něco najde', kraj > 0 && kraj < vse, `${vse} → ${kraj}`);
  const odznaky = await p3.$$eval('.msch', (n) => n.map((x) => x.textContent.replace(/[✕\s]+/g, ' ').trim()));
  pravda('a ukáže se jako odznak', odznaky.some((t) => /Jihočeský/.test(t)), JSON.stringify(odznaky));

  const hovorove = await napis('jižní Čechy');
  pravda('hovorový název dává totéž', hovorove === kraj, `„jižní Čechy" ${hovorove} vs. ${kraj}`);

  const site = await napis('s elektřinou');
  pravda('„s elektřinou" je filtr, ne prázdný výpis', site > 0 && site < vse, `${vse} → ${site}`);

  /* Tohle je ta chyba, kvůli které se výplňová slova zavedla: jedno
     přebytečné slovo („jen", „pozemek") vynulovalo celý výpis. */
  const celek = await napis('jen celé pozemky');
  pravda('„jen celé pozemky" nevrátí prázdno', celek > 0, `vyšlo ${celek}`);

  await napis('');
  const priklad = await p3.$('.ms-priklad');
  pravda('pod políčkem je příklad', !!priklad);
  if (priklad) {
    const text = (await priklad.textContent()).trim();
    await priklad.click();
    await p3.waitForTimeout(700);
    const vPolicku = await p3.inputValue('#map-search');
    const poPrikladu = await pocet();
    pravda('klepnutí na příklad ho vyplní', vPolicku.trim() === text, `v políčku „${vPolicku}", v příkladu „${text}"`);
    pravda('a výpis se podle něj zúží', poPrikladu > 0 && poPrikladu < vse, `${vse} → ${poPrikladu}`);
  }
  await c3.close();
}

await ctx.close();
await prohlizec.close();
console.log('\nNašeptávač obcí, oprava překlepu a výběr ceny/výměry');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Našeptávač: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
