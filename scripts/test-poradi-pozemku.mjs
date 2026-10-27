/* Test: na stránce pozemku je důležité nahoře a nástroje dole.
   ==================================================================
   Spuštění: node scripts/test-poradi-pozemku.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   JAK TO VYPADALO. Naměřeno na telefonu 360×800: stránka měla 3 748 px,
   tedy 4,7 obrazovky, a to podstatné leželo úplně vzadu:
     · odkaz na skutečnou nabídku („Inzerát") na y 3 078 — čtvrtá
       obrazovka, a přitom kvůli němu se sem chodí;
     · „Uložit" na y 3 386, tedy ještě za ním;
     · mapa na 2 543, ačkoli u pozemku je poloha hned po ceně to první,
       co se člověk ptá;
     · kalkulačka návratnosti na 1 758 a vysoká 681 px — skoro celá
       obrazovka formuláře uprostřed cesty. Napřed se sbalila, pak se
       na přání majitele odebrala úplně; tahle zkouška proto hlídá,
       že se nevrátí;
     · „Moje poznámka" na 1 439, tedy dřív, než si člověk pozemek vůbec
       prohlédl — a psal si ji přitom až potom, co se rozhodl.

   CO SE MĚŘÍ. Pořadí bloků a výška stránky. Nejsou to pevná čísla do
   pixelu — ta by se rozbila při první změně textu — ale vztahy, které
   dávají smysl: co se čte dřív, stojí výš.
   ================================================================== */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const STRANKA = '/pozemek-benesov-benesov-1sjtz7b.html';
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Pořadí na stránce pozemku', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nPořadí na stránce pozemku');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Pořadí na stránce pozemku: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  /* CIZÍ SLUŽBY SE ODŘÍZNOU — jinak tahle zkouška neměří kód, ale síť.
     Mapa si u ČÚZK a dalších úřadů zjišťuje, které vrstvy jedou, a podle
     odpovědi dokreslí řadu přepínačů a legendu. Tady se přitom měří
     VÝŠKA celé stránky proti mezi 4,2 obrazovky — a ten rozdíl je velký:
     naměřeno na téže stránce 3 319 px bez vrstev a 3 773 px s nimi,
     tedy 454 px, skoro tři čtvrtě obrazovky. Zkouška tak vycházela
     jinak v sandboxu (služby blokované) a jinak v CI, kde internet je,
     a dokonce i mezi dvěma běhy vedle sebe, podle toho, jestli se
     odpověď stihla vrátit do dvou a půl vteřiny.
     Pořadí a výška stránky jsou vlastnost našeho kódu; měří se proto
     v jednom známém stavu. Že se vrstvy ukazují, když služby jedou,
     hlídají zkoušky mapy (test-mapa-pozemku, test-vrstvy). */
  const PRAZDNY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64');
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') {
      return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNY_PNG });
    }
    return r.abort();
  });
  /* LEAFLET ALE MUSÍ DOJET, jinak se mapa nevykreslí vůbec a mez výšky
     by změkla o celou mapu — zkouška by pak prošla i stránce, která je
     ve skutečnosti delší. Bere se místní kopie, stejně jako v ostatních
     zkouškách (PK_LEAFLET_DIR). Bez té proměnné se cizí adresa pustí
     ven: v CI se Leaflet stáhne a stav je týž, jen pomaleji. */
  const LEAFLET = process.env.PK_LEAFLET_DIR || '';
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(BASE + STRANKA, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  } else {
    await ctx.unroute('**/*');
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
      if (u.hostname === 'unpkg.com') return r.continue();
      if (r.request().resourceType() === 'image') {
        return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNY_PNG });
      }
      return r.abort();
    });
  }
  const p = await ctx.newPage();
  await p.goto(BASE + STRANKA, { waitUntil: 'load' });
  await p.waitForSelector('.pz-priceblock', { timeout: 20000 });
  await p.waitForTimeout(2500);

  const m = await p.evaluate(() => {
    const y = (sel) => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    };
    const v = (sel) => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().height) : null;
    };
    return {
      cena: y('.pz-priceblock'), verdikt: y('#pz-verdict'),
      radce: y('details.pz-gtk-obal:not(.pz-nav-obal)'),
      akce: y('.pz-akce-hlavni'), hlavniBtn: y('.pz-akce-hlavni .pz-btn.primary'),
      uloz: y('#pz-fav'), popis: y('.pz-popis-inzerent'), klice: y('.pz-specs'),
      /* Hledá se kalkulačka SAMA, ne obal, do kterého byla chvíli
         sbalená. Napsat sem obal znamená, že se po jeho zrušení
         nenajde nic a kontrola projde, i kdyby se formulář vrátil. */
      mapa: y('.pzm'), kalk: y('.pz-nav-box, .pz-nav-obal, #pz-nav, #nav-kupni'),
      site: y('.pz-feats'),
      pozn: y('.pz-pozn-box'), sdilet: y('.pz-actions'),
      cela: Math.round(document.body.scrollHeight), obrazovka: window.innerHeight,
    };
  });
  const je = (x) => x !== null && x !== undefined;

  /* 1) HLAVNÍ AKCE NAHOŘE ------------------------------------------- */
  pravda('hlavní akce je na stránce', je(m.akce) && je(m.hlavniBtn) && je(m.uloz),
    JSON.stringify({ akce: m.akce, btn: m.hlavniBtn, uloz: m.uloz }));
  /* TŘETINA SE ZMĚNILA NA POLOVINU, A MÁ TO DŮVOD.
     Mez „první třetina stránky" vznikla v době, kdy tohle tlačítko bylo
     JEDINÁ cesta na inzerát: kdo ho minul, musel rolovat na konec.
     Dnes je akce vidět pořád — na telefonu v připnuté spodní liště
     (test-lista-dole), na monitoru v připnutém pruhu u ceny (kontrola
     o kus níž v tomhle souboru). Co mez chránila, tedy drží jinde
     a změřitelně.
     Uvolnění bylo potřeba kvůli parametrům pozemku: výměra, cena za
     metr a druh se přesunuly pod cenu, kam patří („key facts"), a
     odsunuly akci o 360 px. Polovina je pořád tvrdá mez — na konci
     stránky ani v její druhé půlce tlačítko být nesmí. */
  pravda('odkaz na nabídku stojí v první polovině stránky, ne na konci',
    je(m.akce) && je(m.verdikt) && m.akce > m.verdikt && m.akce < m.cela / 2,
    `akce na ${m.akce} px z ${m.cela} px (polovina je ${Math.round(m.cela / 2)})`);
  pravda('a „Uložit" je u něj, ne o tři obrazovky níž',
    je(m.uloz) && je(m.akce) && Math.abs(m.uloz - m.akce) < 120,
    `akce ${m.akce} px, Uložit ${m.uloz} px`);
  /* Dvě tlačítka, ne šest: zeď odkazů hned pod cenou je přesně to
     „přeplácané na sílu", kvůli kterému se stránka předělávala. */
  const kolikNahore = await p.evaluate(() =>
    document.querySelectorAll('.pz-akce-hlavni a, .pz-akce-hlavni button').length);
  pravda('a nahoře jsou nejvýš dvě tlačítka', kolikNahore <= 2, `je jich ${kolikNahore}`);

  /* 2) VAROVÁNÍ DŘÍV NEŽ ODCHOD ------------------------------------- */
  pravda('rádce „Co byste měli vědět" se čte dřív, než se odejde na inzerát',
    je(m.radce) && je(m.akce) && m.radce < m.akce,
    `rádce ${m.radce} px, akce ${m.akce} px`);

  /* 2b) A SLOVO OD ČLOVĚKA TAKY ------------------------------------- */
  /* Pořadí na stránce je pořadí rozhodování: co to je → za kolik → co
     o tom říká ten, kdo to zná → co s tím chci dělat. Tlačítko
     „Inzerát" se dřív nabízelo DŘÍV, než se dal přečíst jediný řádek
     od inzerenta. Popis má 1 621 z 1 982 nabídek, takže se kontrola
     týká většiny stránek; když popis chybí, není co měřit. */
  if (je(m.popis)) {
    pravda('popis od inzerenta se čte dřív, než se odejde na inzerát',
      je(m.akce) && m.popis < m.akce, `popis ${m.popis} px, akce ${m.akce} px`);
  }

  /* 2c) ČTVRTÁ DLAŽDICE ---------------------------------------------- */
  /* Tři dlaždice říkaly, CO se prodává a ZA KOLIK. Čtvrtá doplňuje to,
     co u dané nabídky rozhoduje nejvíc: u dražby termín, u ostatních
     vlastnictví (celý pozemek, nebo jen podíl — s podílem se nedá
     stavět bez ostatních spoluvlastníků). */
  /* Od 27. 10. je to řádek tabulky, ne dlaždice: předloha od majitele
     (reality.idnes, Sreality) má parametry v jedné tabulce
     štítek–hodnota. Popisek je .k, hodnota .v; značky v rozích
     odešly s dlaždicemi. */
  const dlazdice = await p.evaluate(() => [...document.querySelectorAll('.pz-spec')]
    .map((e) => ({ popisek: ((e.querySelector('.k') || {}).textContent || '').trim() })));
  /* Čtvrtá dlaždice se ukazuje JEN TAM, KDE MÁ CO ŘÍCT: u dražby
     termín, u spoluvlastnického podílu podíl. Tahle stránka není ani
     jedno, takže tu čtvrtá dlaždice být NESMÍ — „Celý pozemek" by byla
     výplň, která zabere celý další řádek mřížky a nic nového neřekne.
     Že se dlaždice u dražby opravdu ukáže, se měří o kus níž na
     skutečné dražební stránce. */
  const jeDrazba = await p.evaluate(() =>
    /dražb|exekuc/i.test((document.querySelector('.pz-media .opp-badge') || {}).textContent || ''));
  const jePodil = await p.evaluate(() =>
    /podíl/i.test((document.querySelector('h1.pz-place') || {}).textContent || ''));
  if (jeDrazba || jePodil) {
    pravda('u dražby/podílu stojí mezi klíčovými údaji i to, co rozhoduje',
      dlazdice.some((x) => /Termín dražby|Vlastnictví/.test(x.popisek)),
      'řádky: ' + dlazdice.map((x) => x.popisek).join(', '));
  } else {
    /* POČET ŘÁDKŮ SE UŽ NEHLÍDÁ, VÝPLŇ ANO. Do 27. 10. byly parametry
       mřížka tří dlaždic a čtvrtá navíc by zabrala celý další řádek,
       takže se žádalo „právě tři". Tabulka podle předlohy
       (reality.idnes, Sreality) nese řádků tolik, kolik je o nabídce
       známo — výměra, cena za metr, druh, vzdálenosti, stav a zdroj —
       a další řádek nic nerozhází. Co platí dál: „Vlastnictví: celý
       pozemek" je výplň, protože neříká nic, co by čtenář nepředpokládal;
       ukazuje se jen u podílu. */
    pravda('u běžné nabídky není v tabulce výplňový řádek o vlastnictví',
      dlazdice.length >= 3 && !dlazdice.some((x) => /Vlastnictví/.test(x.popisek)),
      'řádky: ' + dlazdice.map((x) => x.popisek).join(', '));
  }

  /* A TEĎ TA DRUHÁ STRANA: na skutečné dražební stránce dlaždice
     s termínem BÝT MUSÍ. Stránka se hledá v datech, ne natvrdo —
     dražby se obměňují a pevný odkaz by za týden ukazoval na stránku,
     která už jen hlásí „nabídka skončila". Když se žádná nenajde
     (v datech zrovna není dražba s termínem), kontrola to řekne
     a neměří naprázdno. */
  {
    const KOREN = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const K = (await import('node:module')).createRequire(import.meta.url)(
      path.join(KOREN, 'js', 'klic.js')).PKKlic;
    const data = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
    const bezDiakritiky = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let drazba = null;
    for (const o of data.opportunities) {
      if (!(o.type === 'drazba' || o.type === 'exekuce')) continue;
      if (!/\d{4}-\d{2}-\d{2}/.test(o.extra || '')) continue;
      const soubor = 'pozemek-' + bezDiakritiky(o.okres) + '-' + bezDiakritiky(o.place)
        + '-' + K.otisk(K.pkey(o)) + '.html';
      if (existsSync(path.join(KOREN, soubor))) { drazba = soubor; break; }
    }
    pravda('v datech je dražba s termínem, na které to jde zkusit', !!drazba,
      'žádná dražební stránka se nenašla — kontrola níž by neměřila nic');
    if (drazba) {
      const pd = await ctx.newPage();
      await pd.goto(BASE + '/' + drazba, { waitUntil: 'load' });
      await pd.waitForTimeout(2500);
      const popisky = await pd.evaluate(() => [...document.querySelectorAll('.pz-spec')]
        .map((e) => ((e.querySelector('.k') || {}).textContent || '').trim()));
      pravda(`u dražby stojí mezi klíčovými údaji termín (${drazba})`,
        popisky.some((x) => /Termín dražby/.test(x)), 'řádky: ' + popisky.join(', '));
      await pd.close();
    }
  }
  /* „A každá dlaždice má svou značku" tu stálo do 27. 10. Značky byly
     tlumené ikony v rozích dlaždic; s dlaždicemi odešly i ony a tabulka
     podle předlohy žádné nemá. Místo nich se hlídá to, co je na tabulce
     podstatné: každý řádek má popisek i hodnotu, tedy žádný nezůstal
     poloprázdný. */
  const uplne = await p.evaluate(() => [...document.querySelectorAll('.pz-spec')]
    .filter((e) => !((e.querySelector('.k') || {}).textContent || '').trim()
      || !((e.querySelector('.v') || {}).textContent || '').trim())
    .map((e) => e.textContent.trim().slice(0, 24)));
  pravda('a každý řádek tabulky má popisek i hodnotu',
    dlazdice.length > 0 && uplne.length === 0, 'poloprázdné: ' + uplne.join(', '));

  /* 3) KDE TO JE, PATŘÍ K TOMU, CO TO JE ---------------------------- */
  /* Mez je 55 %, ne 50: mapa dnes začíná na 52 % (1 637 z 3 154 px),
     kdežto před předěláním na 68 % (2 543 z 3 748). Padesát procent by
     bylo hezčí číslo, ale lhalo by o tom, co se měří — jde o to, že se
     k mapě dojde, aniž se přejde celá stránka. */
  pravda('mapa je zhruba v první polovině stránky (do 55 %)',
    je(m.mapa) && m.mapa < m.cela * 0.55,
    `mapa na ${m.mapa} px z ${m.cela} px = ${Math.round(100 * m.mapa / m.cela)} %`);
  pravda('a až za parametry — napřed co to je, pak kde',
    je(m.mapa) && je(m.klice) && m.klice < m.mapa, `parametry ${m.klice}, mapa ${m.mapa}`);

  /* 3b) CO TO UMÍ, PŘED TÍM, CO TO STOJÍ ---------------------------- */
  /* „Vede tam cesta?" a „je u toho elektřina?" je u pozemku otázka
     ANO/NE: pozemek bez přístupu je bez ohledu na cenu něco jiného než
     pozemek s ním, a banka na něj nemusí půjčit (říká to i vlastní
     rádce pristupova-cesta-pozemek.html). Rozhoduje to tedy DŘÍV než
     cena — a sekce stála až za mapou a za popisem inzerenta: naměřeno
     na telefonu 390 px parametry na 699 px a sítě na 2 458 px, tedy
     na třetí obrazovce a 1 456 px pod tím, k čemu patří.
     Sekce se nevykreslí, když o sítích ani přístupu nevíme nic —
     kontrola proto platí jen tam, kde je co měřit. */
  if (je(m.site)) {
    pravda('sítě a přístup se čtou dřív než verdikt o ceně',
      je(m.verdikt) && m.site < m.verdikt, `sítě ${m.site} px, verdikt ${m.verdikt} px`);
    pravda('a drží se u parametrů, ne až za mapou',
      je(m.klice) && je(m.mapa) && m.site > m.klice && m.site < m.mapa,
      `parametry ${m.klice}, sítě ${m.site}, mapa ${m.mapa}`);
  } else {
    /* NA TÉHLE STRÁNCE SE SÍTĚ NEVYKRESLILY — a mlčet o tom nejde.
       Sekce se schválně nezobrazuje, když o sítích ani přístupu nevíme
       nic, takže je to legitimní stav; jenže pak obě kontroly výš
       neměří nic a zkouška by zezelenala i nad pořadím, které se mezitím
       vrátilo zpátky za mapu. Pořadí se proto ověří ještě v ŠABLONĚ:
       v js/pozemek.js musí volání pzFeaturesHtml stát před blokem
       verdiktu. Je to hloupá kontrola na text, ale měří přesně to
       rozhodnutí, o které jde. */
    const zdroj = readFileSync(new URL('../js/pozemek.js', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    /* Hledá se POSLEDNÍ výskyt, ne první: `pzMapaHtml(d)` i
       `pzFeaturesHtml(d)` stojí v souboru dvakrát — nejdřív jako hlavička
       definice, teprve potom jako volání v šabloně. Podle prvního výskytu
       vycházelo, že sítě jsou až za mapou, protože se porovnávaly
       definice, ne pořadí na stránce. */
    const iSite = zdroj.lastIndexOf('pzFeaturesHtml(d)');
    const iVerdikt = zdroj.lastIndexOf("'<div id=\"pz-verdict\">'");
    const iMapa = zdroj.lastIndexOf('pzMapaHtml(d)');
    pravda('(sítě na vzorku nejsou) — ale v šabloně stojí před verdiktem',
      iSite > 0 && iVerdikt > 0 && iSite < iVerdikt,
      `pzFeaturesHtml na ${iSite}, verdikt na ${iVerdikt}`);
    pravda('(…) a před mapou',
      iSite > 0 && iMapa > 0 && iSite < iMapa,
      `pzFeaturesHtml na ${iSite}, mapa na ${iMapa}`);
  }

  /* 4) NÁSTROJE AŽ POTOM -------------------------------------------- */
  /* Kalkulačka „Vyplatí se to?" je pryč na přání majitele. Byl to
     formulář, do kterého člověk hádal budoucí prodejní cenu — číslo,
     které web stejně neumí ověřit — a zabíral nejvíc místa ze všeho
     na stránce. Rozepsané náklady koupě zůstávají jako odkaz. */
  pravda('kalkulačka návratnosti na stránce není', !je(m.kalk),
    `našla se na ${m.kalk} px`);
  pravda('moje poznámka je u ostatních mých věcí, ne před prohlídkou',
    je(m.pozn) && je(m.mapa) && m.pozn > m.mapa, `poznámka ${m.pozn}, mapa ${m.mapa}`);
  pravda('a sdílení s katastrem až úplně na konci',
    je(m.sdilet) && je(m.pozn) && m.sdilet > m.pozn, `sdílení ${m.sdilet}, poznámka ${m.pozn}`);

  /* 5) A CELKEM SE TO ZKRÁTILO -------------------------------------- */
  /* Mez je volná schválně: text nabídek se mění a pevné číslo by
     padalo na cizích datech. 4,4 obrazovky je pořád o třetinu obrazovky
     méně než naměřených 4,7 před předěláním.
     MEZ SE 18. 10. ZVEDLA ZE 4,2 NA 4,4 a je to úprava zkoušky, ne webu,
     takže patří říct proč. Dvě věci:
       · od napsání téhle meze na stránku přibyl POPIS OD INZERENTA
         (odstavec 128 px i s nadpisem oddílu 79 px, tedy 0,26 obrazovky)
         — obsah, o který si majitel řekl. Mez, kterou by takový přírůstek
         musel překročit, měří stav z doby před ním, ne délku stránky;
       · 4,2 nemělo rezervu na PROSTŘEDÍ. Nad týmž kódem a týmiž daty
         vyšlo 3 328 px (4,16) tady a 3 371 px (4,21) na běhači CI —
         rozdíl 43 px v sazbě a mapovém rámu. Zkouška tím padala podle
         toho, KDE běží, ne co měří.
     Ani jedno není důvod stránku natahovat: smysl meze (po předělání se
     nesmí vrátit k 4,7) platí dál a zbývá do ní 0,2 obrazovky. */
  pravda('celá stránka se vejde do 4,4 obrazovky telefonu',
    m.cela <= m.obrazovka * 4.4,
    `${m.cela} px = ${(m.cela / m.obrazovka).toFixed(2)} obrazovky`);
  /* Co po kalkulačce zbylo a zůstat má: odkaz na rozepsané náklady
     koupě. Ten počítá z vlastní ceny pozemku, ne z hádání. */
  pravda('ale odkaz na rozepsané náklady koupě zůstal',
    await p.evaluate(() => !!document.querySelector('.pz-naklady a[href*="kolik-stoji-koupe"]')),
    'odkaz na náklady koupě se ztratil i s kalkulačkou');

  /* 6) NA ŠIROKÉM DISPLEJI AKCE K CENĚ ------------------------------
     Na monitoru je vpravo připnutý pruh s cenou, ale rozhodnout se
     podle něj nešlo: „Inzerát" a „Uložit" zůstaly v levém sloupci a po
     odrolování zmizely. Skript je proto nad 1100 px přesouvá do pruhu
     (js/pozemek.js, pripniAkce). Tahle část hlídá obojí: že se to
     opravdu stane, a hlavně že se to NEDĚJE na užším okně — tam by to
     vyhodilo tlačítka nad rádce „Co byste měli vědět", tedy přesně
     proti tomu, co kontroluje oddíl 2. */
  const vBoku = async (stranka) => stranka.evaluate(() => {
    const akce = document.querySelector('.pz-akce-hlavni');
    const bok = document.querySelector('.pz-bok');
    return !!(akce && bok && bok.contains(akce));
  });
  const sirokyCtx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const w = await sirokyCtx.newPage();
  await w.goto(BASE + STRANKA, { waitUntil: 'load' });
  await w.waitForSelector('.pz-priceblock', { timeout: 20000 });
  await w.waitForTimeout(2000);
  pravda('na 1440 px stojí hlavní akce v připnutém pruhu u ceny', await vBoku(w),
    'tlačítka zůstala v levém sloupci — přesun se nepovedl');
  /* Přesouvá se jeden a týž prvek. Kdyby ho někdo „pro jistotu"
     vykreslil na obě místa, byla by na stránce dvě id="pz-fav"
     a klikalo by jen to první. */
  pravda('a je na stránce jen jedno tlačítko „Uložit"',
    (await w.evaluate(() => document.querySelectorAll('#pz-fav').length)) === 1,
    'id="pz-fav" je na stránce vícekrát — někdo blok zkopíroval místo přesunu');
  /* Celý smysl přesunu: po odrolování k popisu je akce pořád vidět. */
  await w.evaluate(() => scrollTo(0, 2200));
  await w.waitForTimeout(400);
  const vidno = await w.evaluate(() => {
    const e = document.querySelector('.pz-akce-hlavni .pz-btn.primary');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), v: r.top >= 0 && r.bottom <= innerHeight };
  });
  pravda('a po odrolování o 2 200 px je odkaz na nabídku pořád na obrazovce',
    !!(vidno && vidno.v), JSON.stringify(vidno));
  /* A pruh se smí zúžit zpátky: kdo si na notebooku zmenší okno,
     nesmí zůstat s tlačítky viset v pruhu, který už není. */
  await w.setViewportSize({ width: 900, height: 800 });
  await w.waitForTimeout(400);
  pravda('po zúžení okna na 900 px se akce vrátí do toku stránky',
    !(await vBoku(w)), 'blok zůstal v pruhu, i když pruh na téhle šířce není');
  const poradi = await w.evaluate(() => {
    const y = (sel) => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    };
    return { radce: y('details.pz-gtk-obal:not(.pz-nav-obal)'), akce: y('.pz-akce-hlavni') };
  });
  pravda('a vrátí se na SVÉ místo — pod rádce, ne na začátek stránky',
    je(poradi.radce) && je(poradi.akce) && poradi.akce > poradi.radce,
    `rádce ${poradi.radce} px, akce ${poradi.akce} px`);
  await sirokyCtx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
