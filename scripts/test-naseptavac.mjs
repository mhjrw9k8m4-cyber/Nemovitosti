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
  // Vrací výsledek, aby se na něm dalo větvit: když neprojde krok, na
  // kterém stojí ty další, nemá cenu je zkoušet — spadly by výjimkou
  // místo toho, aby řekly, co je špatně.
  return !!vyslo;
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

// --- 4b) Hotový název je volba, ne začátek ---------------------------
/* Dvě stížnosti od lidí, obě o tomtéž:
     „když dám okres MOST, tak mi tam vyjede i Most u Jablunkova"
     „nevyhledává to konkrétní Most, ale vše, co obsahuje začátek most"
   Na dnešních datech vracel dotaz „most" pět nabídek a v okrese Most
   byly tři; zbytek Mosty u Jablunkova (Frýdek-Místek) a Dlouhý Most
   (Liberec). Hledání podle začátku má smysl, dokud člověk píše — jakmile
   napíše celý název, který v nabídce je, je to volba.

   Nesmí se ale nic tiše ztratit: podobné názvy se odloží stranou, je nad
   výpisem napsané kolik jich je, a jedním klepnutím se přidají zpět.

   Okres i obec se hledají v datech, ne napevno, ať test platí i po
   výměně nabídky. */
{
  const norm2 = (x) => norm(x).replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
  let past = null;
  for (const okres of [...new Set(DATA.map((d) => d.okres).filter(Boolean))]) {
    const no = norm2(okres);
    if (!no || no.indexOf(' ') >= 0) continue;         // jednoslovný, ať jde napsat
    const cizi = DATA.filter((d) => d.okres !== okres &&
      norm2(d.place) !== no && norm2(d.place).split(' ').some((w) => w.indexOf(no) === 0));
    if (cizi.length && DATA.some((d) => d.okres === okres)) {
      past = { okres: okres, text: no, cizi: [...new Set(cizi.map((d) => d.place))] };
      break;
    }
  }
  if (!past) {
    zpravy.push('  – v dnešních datech není okres, jehož název nese i obec odjinud (přeskočeno)');
  } else {
    const pocet = async () => {
      const t = await p.locator('#map-count').innerText().catch(() => '');
      const m = /(\d+)\s*na mapě/.exec(t.replace(/ /g, ' '));
      return m ? +m[1] : -1;
    };
    const vypis = () => p.locator('#opp-list').innerText().catch(() => '');

    await pole.fill('');
    await pole.type(past.text, { delay: 40 });
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');      // ať nabídka nepřekrývá výpis
    await p.waitForTimeout(400);

    const uzky = await pocet();

    /* Pozor na falešnou útěchu: výpis je stránkovaný, takže „obec odjinud
       tam není" projde i tehdy, když se jen nevešla. Kontroluje se proto
       jen to, co je vidět po ROZŠÍŘENÍ — a teprve pak, že to po zúžení
       zmizelo. (Ověřeno sabotáží: bez tohohle kroku prošla tahle kontrola
       i s úplně vypnutým zúžením.) */
    const nabidka = p.locator('#mc-podobne');
    const jeNabidka = (await nabidka.count()) === 1;
    pravda('a nad výpisem stojí, kolik podobných názvů se nepočítá', jeNabidka,
      'zúžit výpis a mlčet o tom je horší než vrátit moc');
    if (jeNabidka) {
      const popis = (await nabidka.innerText()).replace(/\s+/g, ' ');
      const mSlib = /\((\d+)\)/.exec(popis);
      pravda('u té nabídky je i počet', !!mSlib, `stojí tam „${popis}"`);
      const slibeno = mSlib ? +mSlib[1] : -1;
      await nabidka.click();
      await p.waitForTimeout(500);
      const siroky = await pocet();
      pravda('a po klepnutí se podobné názvy vrátí', siroky > uzky,
        `přesný název ${uzky}, s podobnými ${siroky}`);
      /* Slíbené číslo musí sedět s tím, co se po klepnutí opravdu
         přidalo. Je to přesnější než hledat konkrétní obce ve výpisu:
         ten je natvrdo omezený na osm položek a řadí se podle
         doporučení, takže obec odjinud se do něj vejít nemusí. (Dřív se
         to hledalo ve výpisu a prošlo to jen náhodou — spadlo to, jakmile
         se změnilo bodování doporučení a pořadí se přeskládalo.) */
      pravda('a slíbený počet sedí s tím, co přibylo', uzky + slibeno === siroky,
        `přesný název ${uzky} + slibovaných ${slibeno} ≠ ${siroky}`);
      const seznamSiroky = await vypis();
      const vidiny = past.cizi.filter((o) => seznamSiroky.indexOf(o) >= 0);
      await nabidka.click();               // zpátky na přesný název
      await p.waitForTimeout(400);
      const zpet = await vypis();
      if (vidiny.length) {
        const zbyle = vidiny.filter((o) => zpet.indexOf(o) >= 0);
        pravda(`a napsané „${past.text}" je zase nevrací`, zbyle.length === 0,
          've výpisu visí: ' + zbyle.join(', ') + ' — hotový název se pořád bere jako začátek');
      } else {
        zpravy.push('  – obce odjinud se do osmi vypsaných položek nevešly (kontroluje se počtem)');
      }
    }

    // --- a volba „celý okres" z našeptávače ---------------------------
    await pole.fill('');
    await pole.type(past.text, { delay: 40 });
    await p.waitForTimeout(500);
    let kliknuto = false;
    for (const r of await p.locator('#map-search-navrhy li').all()) {
      const t = (await r.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (/celý okres/.test(t) && norm2(t).indexOf(norm2(past.okres)) >= 0) {
        await r.click({ timeout: 3000 }); kliknuto = true; break;
      }
    }
    if (pravda(`našeptávač nabídne „celý okres ${past.okres}"`, kliknuto,
        'v nabídce žádný řádek „celý okres" nebyl')) {
      await p.waitForTimeout(500);
      const poVolbe = await pocet();
      pravda(`„celý okres ${past.okres}" nepřidá obce odjinud`,
        poVolbe > 0 && poVolbe <= uzky,
        `přesný název ${uzky}, po volbě okresu ${poVolbe}`);
      const seznamOkres = await vypis();
      const zbyle2 = past.cizi.filter((o) => seznamOkres.indexOf(o) >= 0);
      pravda('a ve výpisu po volbě okresu žádná není', zbyle2.length === 0,
        've výpisu visí: ' + zbyle2.join(', '));

      const odznak = await p.locator('#ms-chipy .msch[data-misto]').count();
      pravda('vybrané místo je vidět jako odznak', odznak === 1, `odznaků: ${odznak}`);
      if (odznak === 1) {
        await p.locator('#ms-chipy .msch[data-misto]').click();
        await p.waitForTimeout(400);
        pravda('a po zrušení odznaku zmizí i on', (await p.locator('#ms-chipy .msch[data-misto]').count()) === 0);
      }
    }
  }
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

  /* Řádek s příkladem pod políčkem byl na přání odstraněn — místo toho
     se hlídá, že se vyčištěním políčka výpis zase rozšíří na všechno. */
  const poVycisteni = await napis('');
  pravda('vyčištění políčka vrátí celý výpis', poVycisteni === vse, `${vse} → ${poVycisteni}`);
  await c3.close();
}

/* --- Prázdný výpis musí říct, CO ho vyprázdnilo ----------------------
   „Zkuste filtry zmírnit" je rada, která neřekne který. Když jich má
   člověk navrstvených pět (věta, rozbalovátko, pásmo ceny, pilulka),
   hádá je pak jeden po druhém. Spočítat se to dá: každé omezení se
   zvlášť vypne a řekne se to, po jehož vypnutí zbude nejvíc nabídek.

   Druhá věc, která se tu hlídá, je horší: kontrola „je vůbec zapnutý
   nějaký filtr" měla vlastní výčet, který neznal kraj, cenu za metr,
   vybavení ANI NIC z toho, co se pochopí z věty. Čím líp web větě
   rozuměl, tím spíš na „stavební Vysočina do 50 tis" odpověděl
   „Tady zrovna nic není, zkuste to za pár dní" — přestože filtrů bylo
   pět a stačilo povolit cenu. */
{
  const { ctx: c4, p: p4 } = await otevri({ viewport: { width: 1280, height: 900 } });
  async function prazdno(q) {
    await p4.fill('#map-search', q);
    await p4.waitForTimeout(900);
    return {
      zprava: await p4.$eval('#opp-list .map-count', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => ''),
      tlacitka: await p4.$$eval('#opp-list .reset-btn', (n) => n.map((x) => x.textContent.trim())),
    };
  }
  const a = await prazdno('stavební Vysočina do 50 tis');
  pravda('u prázdného výpisu se netvrdí, že prostě nic nemáme',
    !/Tady zrovna nic není/.test(a.zprava), `zpráva: „${a.zprava}"`);
  pravda('a řekne se, které omezení to způsobilo',
    /Nejvíc omezuje/.test(a.zprava) && /cena/.test(a.zprava), `zpráva: „${a.zprava}"`);
  pravda('i s číslem, kolik by jich bez něj bylo',
    /bez tohoto filtru by/.test(a.zprava) && /\d/.test(a.zprava), `zpráva: „${a.zprava}"`);
  /* Čeština: „Nejvíc omezuje CENA" a „Zrušit CENU" jsou dva pády.
     S jedním tvarem stálo na tlačítku „Zrušit cena". */
  pravda('tlačítko má správný pád', a.tlacitka.indexOf('Zrušit cenu') >= 0, JSON.stringify(a.tlacitka));

  const b = await prazdno('zahrada nad 50 ha');
  pravda('u výměry se pozná výměra', /Nejvíc omezuje/.test(b.zprava) && /výměra/.test(b.zprava), `zpráva: „${b.zprava}"`);
  pravda('a tlačítko taky', b.tlacitka.indexOf('Zrušit výměru') >= 0, JSON.stringify(b.tlacitka));

  /* Zrušení „hledaného textu" se musí týkat JEN hledání místa, ne celé
     věty. Když se vyčistilo celé políčko, spadly s ním i druh a cena —
     slíbené číslo pak bylo vždycky celá databáze a „hledaný text"
     vyhrál pokaždé, ať za to mohl, nebo ne. */
  const c = await prazdno('les Praha do 10 tis');
  pravda('u volného textu se hlásí text', /Nejvíc omezuje/.test(c.zprava) && /hledaný text/.test(c.zprava),
    `zpráva: „${c.zprava}"`);
  {
    const slib = parseInt(((c.zprava.match(/bez tohoto filtru by (?:jich bylo|zbyla)\s*([\d\s\u00a0]+)/) || [])[1] || '0').replace(/\D/g, ''), 10);
    await p4.fill('#map-search', '');
    await p4.waitForTimeout(700);
    const vse = await p4.$eval('#map-count', (e) => {
      const m = e.textContent.match(/([\d\s\u00a0]+)\s*na mapě/);
      return m ? parseInt(m[1].replace(/[\s\u00a0]/g, ''), 10) : 0;
    }).catch(() => 0);
    pravda('a slíbené číslo není celá databáze (ruší se místo, ne celá věta)',
      slib > 0 && vse > 0 && slib < vse / 2, `slíbeno ${slib}, celkem ${vse}`);
  }

  /* A hlavně: to tlačítko musí opravdu fungovat. */
  await prazdno('stavební Vysočina do 50 tis');
  const cisloVeZprave = parseInt(((await p4.$eval('#opp-list .map-count', (e) => e.textContent)).match(/bez tohoto filtru by jich bylo\s*([\d\s\u00a0]+)/) || [])[1]?.replace(/\D/g, '') || '0', 10);
  const btn = await p4.$('#pusti-vinika');
  pravda('tlačítko „Zrušit …" je na stránce', !!btn);
  if (btn) {
    await btn.click();
    await p4.waitForTimeout(900);
    const po = await p4.$eval('#map-count', (e) => {
      const m = e.textContent.match(/([\d\s\u00a0]+)\s*na mapě/);
      return m ? parseInt(m[1].replace(/[\s\u00a0]/g, ''), 10) : -1;
    }).catch(() => -1);
    pravda('a po klepnutí je nabídek přesně tolik, kolik slibovalo',
      po === cisloVeZprave && po > 0, `slíbeno ${cisloVeZprave}, vyšlo ${po}`);
  }
  await c4.close();
}

// --- Konec panelu filtrů: „kolik jich zbylo" a „zrušit" -------------
/* Stížnost: „naklikám tam, co chci, a ani nevím, že změny byly
   aplikované, ani mě to neposune na inzeráty a nechá nahoře ve
   vyhledávání. Navíc tam není jedno větší tlačítko na zrušení filtru."
   Filtry se používaly hned, ale nic to neřeklo a k výpisu se člověk
   musel dorolovat sám. Zrušit všechno šlo jen tlačítkem, které se
   ukazovalo jen u PRÁZDNÉHO výpisu — tedy až když bylo pozdě. */
{
  const { ctx, p } = await otevri(TELEFON);
  await p.evaluate(() => { document.getElementById('ms-filters').open = true; });
  await p.waitForTimeout(400);

  /* Klepnutí, které raději NAHLÁSÍ, než aby spadlo. Když prvek není
     vidět (třeba proto, že se rozbilo jeho překreslení), Playwright by
     třicet vteřin čekal a pak shodil celý test výjimkou — a po padlém
     testu nezbude souhrn, jen stopa zásobníku. Přistiženo sabotáží:
     vypnutí přepočtu počtu shodilo test místo toho, aby ho obarvilo. */
  const klikni = async (sel, popis) => {
    const el = p.locator(sel);
    try {
      await el.waitFor({ state: 'visible', timeout: 4000 });
      await el.scrollIntoViewIfNeeded({ timeout: 4000 });
      await el.click({ timeout: 4000 });
      return true;
    } catch (e) {
      chyb++; zpravy.push(`  ✕ ${popis} — na ${sel} nejde klepnout (není vidět)`);
      return false;
    }
  };

  const stav = () => p.evaluate(() => {
    const t = document.getElementById('mcf-hotovo-t');
    const z = document.getElementById('mcf-zrusit');
    const h = document.getElementById('mcf-hotovo');
    const mc = (document.getElementById('map-count') || {}).textContent || '';
    const m = /(\d[\d\s ]*)\s*na mapě/.exec(mc.replace(/ /g, ' '));
    return {
      popis: t ? t.textContent.trim() : '(chybí)',
      cislo: t ? +(t.textContent.replace(/[^\d]/g, '') || 0) : -1,
      zrusitVidet: !!(z && !z.hidden),
      vyskaHotovo: h ? Math.round(h.getBoundingClientRect().height) : 0,
      /* Vejde se popisek do tlačítka? Samotná výška nestačí: text má
         nowrap, takže se při nedostatku místa nezalomí — jen se oreže,
         a tlačítko zůstane nízké. Přistiženo sabotáží. */
      prete: h ? h.scrollWidth - h.clientWidth : 0,
      panelOtevren: !!(document.getElementById('ms-filters') || {}).open,
      naMape: m ? +m[1].replace(/\s/g, '') : -1,
      scroll: Math.round(window.scrollY),
      /* Kde je výpis vůči oknu. Měřit „odrolovalo se dolů" nejde: než se
         na tlačítko klepne, musí se k němu sjet, takže správné chování
         je posun NAHORU, k výsledkům. Podstatné je, že výpis je po
         klepnutí vidět. */
      vypisTop: (() => { const l = document.getElementById('opp-list');
        return l ? Math.round(l.getBoundingClientRect().top) : null; })(),
      okno: window.innerHeight,
    };
  });

  const bez = await stav();
  pravda('na konci panelu je tlačítko s počtem', /^Zobrazit \d/.test(bez.popis.replace(/ /g, ' ')),
    `stojí tam „${bez.popis}"`);
  pravda('a bez filtrů se „Zrušit filtry" nenabízí', !bez.zrusitVidet);
  /* Tlačítko se musí vejít na JEDEN řádek. Na 390px se „Zobrazit 983
     pozemků" vedle „Zrušit filtry" lámalo na tři řádky — přistiženo
     na snímku, ne testem, tak ať to příště chytí test. */
  pravda('a vejde se na jeden řádek', bez.vyskaHotovo > 0 && bez.vyskaHotovo <= 58,
    `tlačítko je vysoké ${bez.vyskaHotovo} px — text se láme`);
  pravda('a celý popisek se do něj vejde', bez.prete <= 1,
    `popisek přetéká o ${bez.prete} px — na úzkém displeji se oreže`);
  /* Měřením se tohle uhlídat nedá: v sandboxu se nenačte Archivo a
     v náhradním písmu se „Zobrazit 1 952 pozemků" vedle „Zrušit filtry"
     ještě vejde. Ve skutečném písmu se lámalo na tři řádky — viděno na
     snímku. Hlídá se proto samo pravidlo: na úzkém displeji jdou obě
     tlačítka pod sebe. */
  {
    const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
    const m = /@media\s*\(max-width:\s*4\d\dpx\)\s*\{[^}]*\.mcf-akce\{[^}]*flex-direction:\s*column/.test(css);
    pravda('a na úzkém displeji jdou tlačítka pod sebe', m,
      'pravidlo .mcf-akce{flex-direction:column-reverse} v úzkém @media chybí');
  }

  await p.evaluate(() => { const e = document.getElementById('map-cena'); e.value = '300000'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(900);
  const sFiltrem = await stav();
  pravda('po nastavení filtru se počet na tlačítku změní', sFiltrem.cislo !== bez.cislo && sFiltrem.cislo > 0,
    `bez filtru ${bez.cislo}, s filtrem ${sFiltrem.cislo}`);
  pravda('a sedí s tím, co web hlásí nad výpisem', sFiltrem.cislo === sFiltrem.naMape,
    `na tlačítku ${sFiltrem.cislo}, nad výpisem ${sFiltrem.naMape}`);
  pravda('teprve teď se nabídne „Zrušit filtry"', sFiltrem.zrusitVidet);

  /* Zpátky úplně nahoru a klepnout PROGRAMOVĚ, bez dorolování. Jinak
     by kontrola neměřila posun: Playwright si k tlačítku sám sjede a
     samotné zavření panelu pak výpis vytáhne nahoru i bez posouvání.
     Přistiženo sabotáží — po odstranění posunu test procházel dál. */
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  const predKlepnutim = await stav();
  pravda('před klepnutím je výpis pod okrajem okna', predKlepnutim.vypisTop > predKlepnutim.okno,
    `výpis je na ${predKlepnutim.vypisTop} px z ${predKlepnutim.okno} — kontrola posunu by nic neměřila`);
  const kliklo = await p.evaluate(() => {
    const b = document.getElementById('mcf-hotovo');
    if (!b || b.disabled) return false;
    b.click(); return true;
  });
  if (!kliklo) { chyb++; zpravy.push('  ✕ na „Zobrazit pozemky" nejde klepnout'); }
  await p.waitForTimeout(1600);
  const poKlepnuti = await stav();
  pravda('klepnutí panel zavře', !poKlepnuti.panelOtevren);
  pravda('a vytáhne výpis nahoru', poKlepnuti.vypisTop !== null && poKlepnuti.vypisTop <= 220,
    `před klepnutím ${predKlepnutim.vypisTop} px, po klepnutí ${poKlepnuti.vypisTop} px (okno ${poKlepnuti.okno})`);

  await p.evaluate(() => { document.getElementById('ms-filters').open = true; });
  await p.waitForTimeout(300);
  await klikni('#mcf-zrusit', 'klepnutí na „Zrušit filtry"');
  await p.waitForTimeout(1200);
  const poZruseni = await stav();
  pravda('„Zrušit filtry" vrátí celou nabídku', poZruseni.cislo === bez.cislo,
    `před filtrem ${bez.cislo}, po zrušení ${poZruseni.cislo}`);
  pravda('a samo se schová', !poZruseni.zrusitVidet);
  await ctx.close();
}

await ctx.close();
await prohlizec.close();
console.log('\nNašeptávač obcí, oprava překlepu a výběr ceny/výměry');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Našeptávač: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
