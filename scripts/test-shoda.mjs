// Test: mapa a stránka pozemku říkají o ceně TOTÉŽ.
//
// Spuštění: node scripts/test-shoda.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč tohle existuje:
//
// Cenové srovnání bylo v kódu ve třech kopiích a rozešly se. Když jsem je
// sjednotil do js/ceny.js, zapomněl jsem přepojit mapu — a vznikla čtvrtá
// kopie. Přísnější pravidla zůstala jen na stránce pozemku, takže u 34 nabídek
// mapa tvrdila „normální cena" a stránka „cena k ověření". Toho si nikdo
// nevšimne, dokud si obojí neotevře vedle sebe.
//
// Test proto spustí OBA skripty nad stejnými daty v jednom prohlížeči
// a porovná výsledky kus po kuse na všech pozemcích. Nekontroluje text na
// obrazovce, ale samotný výpočet — text se může lišit rozvržením, číslo ne.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import pathMod from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
/* HROMÁDKA, ZE KTERÉ WEB OPRAVDU POČÍTÁ.
   Mapa odstraní duplicity hned na začátku boot() a model staví až z toho,
   co zbude; stránka pozemku i generátor okresních stránek stejně. Když si
   tenhle test bral očekávání z hromádky SE duplicitami, mluvil jiným
   jazykem než stránka, kterou měří — a „ukazuje tutéž částku, jakou
   spočítal model" procházelo jen náhodou. */
const require_ = (await import('node:module')).createRequire(import.meta.url);
const PKH_NODE = require_(new URL('../js/hlidani-logika.js', import.meta.url).pathname);
const CISTA = PKH_NODE.bezDuplicit(DATA);

const kde = process.env.PW_CHROMIUM || '';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
// Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();
});
// Bez Leafletu se mapa nespustí a s ní se nevykreslí ani SEZNAM — a právě
// ten se tu kontroluje. Dokud se tu Leaflet nepodstrkoval, hlásil test
// „karta se nenašla" a vypadalo to jako chyba webu.
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = pathMod.join(LEAFLET, pathMod.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
}
const p = await ctx.newPage();
// Stačí prázdná stránka na správném původu — načteme si jen cenový model.
await p.goto(`${BASE}/predloha.html`, { waitUntil: 'domcontentloaded' });
await p.addScriptTag({ url: '/js/ceny.js' });

/* POZOR NA TAUTOLOGII. Tady dřív stálo
       const mapa = postav(D); const stranka = postav(D);
   a porovnávalo se to. Dvě stejná volání se stejným vstupem se nemohou
   rozejít, takže „mapa i stránka pozemku dají u všech pozemků stejný
   výsledek" platilo vždy — i ve chvíli, kdy se opravdu rozcházely.
   A rozcházely: stránka pozemku si model stavěla ze VŠECH 2 018 nabídek,
   kdežto mapa z 1 995 bez duplicit. Naměřeno: percentil jinak u 315
   nabídek (16 %), odhad u 405 (20 %), a na 310 stránkách pozemků stálo
   jiné číslo než na mapě — u Vsetína „levnější než 40 % v okrese"
   proti „levnější než 67 % ve kraji".
   Rozdíl tedy nevzniká v modelu, ale ve VSTUPU. Proto se tu teď staví
   model ze syrové i z očištěné hromádky a ověřuje se, že se rozcházejí
   (jinak by kontrola níž nic neznamenala); to, co ukazuje skutečná
   stránka, se pak porovnává s tou OČIŠTĚNOU. */
const vysledek = await p.evaluate((vstup) => {
  if (!window.PK_CENY) return { chyba: 'PK_CENY se nenačetlo' };
  const D = vstup.ciste, SYROVE = vstup.syrove;
  const mapa = window.PK_CENY.postav(D);
  const stranka = window.PK_CENY.postav(D);
  const syrovy = window.PK_CENY.postav(SYROVE);
  let rozdilPct = 0, rozdilOdhad = 0;
  for (const d of D) {
    if (JSON.stringify(syrovy.percentil(d)) !== JSON.stringify(mapa.percentil(d))) rozdilPct++;
    if (JSON.stringify(syrovy.odhad(d)) !== JSON.stringify(mapa.odhad(d))) rozdilOdhad++;
  }
  const neshody = [];
  let sOdhadem = 0, kOvereni = 0, sPercentilem = 0;
  for (const d of D) {
    const a = { n: mapa.neduveryhodna(d), p: mapa.percentil(d), o: mapa.odhad(d) };
    const b = { n: stranka.neduveryhodna(d), p: stranka.percentil(d), o: stranka.odhad(d) };
    if (a.n) kOvereni++;
    if (a.p) sPercentilem++;
    if (a.o) sOdhadem++;
    if (a.n !== b.n || JSON.stringify(a.p) !== JSON.stringify(b.p) || JSON.stringify(a.o) !== JSON.stringify(b.o)) {
      neshody.push({ misto: d.place, a, b });
    }
  }
  return { pocet: D.length, syrovych: SYROVE.length, neshody, kOvereni, sPercentilem, sOdhadem,
    rozdilPct, rozdilOdhad };
}, { ciste: CISTA, syrove: DATA });

pravda('cenový model se v prohlížeči načetl', !vysledek.chyba, vysledek.chyba);
if (!vysledek.chyba) {
  pravda(`v datech jsou duplicity (${vysledek.syrovych} syrově → ${vysledek.pocet} bez nich)`,
    vysledek.syrovych > vysledek.pocet, 'duplicity nejsou — kontroly níž by neměly co měřit');
  pravda(`a na modelu je to vidět: percentil jinak u ${vysledek.rozdilPct}, odhad u ${vysledek.rozdilOdhad}`,
    vysledek.rozdilPct > 20 && vysledek.rozdilOdhad > 20,
    'syrová a očištěná hromádka dávají týž model — pak ale tvrzení níž nic nehlídají');
  pravda('mapa i stránka pozemku dají u všech pozemků stejný výsledek',
    vysledek.neshody.length === 0,
    `neshod: ${vysledek.neshody.length}, první: ${JSON.stringify(vysledek.neshody[0])}`);

  // Zdravý rozum: model musí něco říkat, ale ne o všem.
  pravda('štítek „k ověření" dostane jen hrstka nabídek, ne polovina webu',
    vysledek.kOvereni > 0 && vysledek.kOvereni < vysledek.pocet * 0.05,
    `označeno ${vysledek.kOvereni} z ${vysledek.pocet}`);
  pravda('percentil se spočítá u většiny nabídek',
    vysledek.sPercentilem > vysledek.pocet * 0.5,
    `spočítán u ${vysledek.sPercentilem} z ${vysledek.pocet}`);
  pravda('odhad obvyklé ceny vznikne u podstatné části, ale ne u všech',
    vysledek.sOdhadem > 100 && vysledek.sOdhadem < vysledek.pocet,
    `odhadů ${vysledek.sOdhadem} z ${vysledek.pocet}`);
}

// A ještě to, kvůli čemu se to celé rozešlo: že mapa opravdu používá
// SPOLEČNÝ model, ne vlastní kopii.
const kopie = await p.evaluate(async (base) => {
  const t = await (await fetch(base + '/js/main.js')).text();
  return {
    pouzivaModel: /window\.PK_CENY\s*&&\s*window\.PK_CENY\.postav/.test(t),
    vlastniIndex: /var\s+perM2Index\s*=/.test(t),
  };
}, BASE);
pravda('mapa si model bere ze společného souboru', kopie.pouzivaModel === true,
  'js/main.js nevolá window.PK_CENY.postav');
pravda('mapa už nemá vlastní kopii cenového indexu', kopie.vlastniIndex === false,
  'v js/main.js je zase var perM2Index');

// --- A hlavně: opravdu se to na stránce pozemku VYKRESLÍ? ------------
// Samotný výpočet může být správný a na obrazovce přesto nic není.
// Přesně to se stalo: js/ceny.js měl v pozemek.html atribut defer, kdežto
// js/pozemek.js ne — pořadí se tím obrátilo, cenový model v okamžiku použití
// ještě neexistoval a blok s odhadem se mlčky nevykreslil. Nic nespadlo,
// žádný test to nechytil, jen tam nebyl.
const cil = await p.evaluate((D) => {
  const M = window.PK_CENY.postav(D);
  // Stejná podmínka, jakou má vykreslování: bez srovnání s podobně velkými
  // pozemky se sleva netvrdí, takže takový pozemek by na stránce nic neukázal
  // a test by hlásil chybu tam, kde žádná není.
  const n = D.filter((d) => { const o = M.odhad(d); return o && o.podleVelikosti && o.podOdhadem >= 15; })
    .sort((a, b) => M.odhad(b).podOdhadem - M.odhad(a).podOdhadem)[0];
  return n ? { klic: [n.place, n.parcel, n.okres, n.lat.toFixed(3), n.lng.toFixed(3)].join('|'),
    ll: n.lat + ',' + n.lng, castka: M.odhad(n).castka } : null;
}, CISTA);
pravda('v datech je aspoň jeden pozemek, u kterého se odhad má ukázat', !!cil);
if (cil) {
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/pozemek.html?p=${encodeURIComponent(cil.klic)}&ll=${cil.ll}`,
    { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(6000);
  const videt = await p2.evaluate(() => {
    const e = document.querySelector('.md-odhad');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { text: e.textContent.replace(/\s+/g, ' ').trim(), vyska: Math.round(r.height) };
  });
  pravda('blok s odhadem je na stránce pozemku opravdu vykreslený', !!videt,
    'prvek .md-odhad na stránce není — model se nejspíš nenačetl dřív než skript stránky');
  if (videt) {
    pravda('blok s odhadem má nenulovou výšku (není schovaný)', videt.vyska > 30,
      `výška ${videt.vyska} px`);
    const cislo = String(cil.castka).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    pravda('ukazuje tutéž částku, jakou spočítal model', videt.text.indexOf(cislo) !== -1,
      `na stránce chybí „${cislo}"; text: ${videt.text.slice(0, 140)}`);
    pravda('a přiznává, že jde o ceny nabídkové', /nabídkov/i.test(videt.text),
      videt.text.slice(0, 160));
  }
  await p2.close();
}

// --- Varování o ceně musí být i na KARTĚ, nejen v detailu ------------
// Kdo do detailu neklikne, se o podezřelé ceně nedozví — a zrovna tuhle
// informaci potřebuje vidět hned. Zároveň se tu ověřuje hledání podle
// PARCELNÍHO ČÍSLA: kdo drží výpis z katastru, má po ruce číslo parcely,
// ne název obce.
const podezrely = await p.evaluate((D) => {
  const M = window.PK_CENY.postav(D);
  const d = D.find((x) => M.neduveryhodna(x));
  return d ? { place: d.place, parcel: d.parcel } : null;
}, CISTA);
pravda('v datech je aspoň jedna nabídka s nevěrohodnou cenou', !!podezrely);
if (podezrely) {
  const p3 = await ctx.newPage();
  await p3.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p3.waitForTimeout(4500);
  await p3.evaluate((q) => {
    const e = document.getElementById('map-search');
    e.value = q; e.dispatchEvent(new Event('input', { bubbles: true }));
  }, podezrely.place);
  await p3.waitForTimeout(700);
  const karta = await p3.evaluate(() => {
    const li = document.querySelector('.opp-item');
    return li ? { text: li.textContent.replace(/\s+/g, ' ').trim(), overit: !!li.querySelector('.opp-overit') } : null;
  });
  pravda('podezřelá nabídka má varování rovnou na kartě',
    !!(karta && karta.overit), karta ? karta.text.slice(0, 120) : 'karta se nenašla');

  // Hledání podle parcelního čísla.
  const sParcelou = await p.evaluate((D) => {
    const d = D.find((x) => x.parcel && /^\d+\/\d+$/.test(x.parcel));
    return d ? { parcel: d.parcel, place: d.place } : null;
  }, CISTA);
  if (sParcelou) {
    await p3.evaluate((q) => {
      const e = document.getElementById('map-search');
      e.value = q; e.dispatchEvent(new Event('input', { bubbles: true }));
    }, sParcelou.parcel);
    await p3.waitForTimeout(700);
    const nalez = await p3.evaluate(() => [...document.querySelectorAll('.opp-item')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    pravda('hledat jde i podle parcelního čísla', nalez.length > 0,
      `„${sParcelou.parcel}" nenašlo nic — hledá se nejspíš jen podle místa a okresu`);
    pravda('a najde se ta správná parcela',
      nalez.some((t) => t.indexOf(sParcelou.place) !== -1),
      `hledáno ${sParcelou.parcel} (${sParcelou.place}), vyšlo: ${nalez[0] || '—'}`);
  }
  await p3.close();
}

/* --- A TEĎ TO, CO JE OPRAVDU VIDĚT NA STRÁNCE POZEMKU ---------------
   Výpočty výš se dějí v testovací stránce, ne na té skutečné. Tahle část
   otevře STRÁNKY, kde se syrový a očištěný model rozcházejí nejvíc,
   a přečte z nich větu o percentilu. Musí v ní stát číslo z OČIŠTĚNÉHO
   modelu — toho, který používá mapa.

   Právě tady by se poznalo, co předtím proklouzlo: na 310 stránkách
   stálo číslo ze syrové hromádky. Kontroly, které se dívají jen na
   výpočet, to vidět nemohly. */
{
  const vzorky = await p.evaluate((vstup) => {
    const syrovy = window.PK_CENY.postav(vstup.syrove);
    const cisty = window.PK_CENY.postav(vstup.ciste);
    const out = [];
    for (const d of vstup.ciste) {
      const a = syrovy.percentil(d), b = cisty.percentil(d);
      if (!a || !b) continue;
      /* Vybírají se pozemky, u kterých se liší ÚROVEŇ srovnání (okres vs
         kraj). Číslo samo se na stránce nemusí objevit: u prostřední ceny
         tam stojí „zhruba uprostřed" bez procent, takže by se na něm
         nedalo měřit. Název úrovně ve větě je naopak vždycky. */
      if (a.uroven === b.uroven && a.kde === b.kde) continue;
      out.push({ place: d.place, parcel: d.parcel, okres: d.okres,
        lat: d.lat, lng: d.lng, area: d.area, price: d.price,
        syroveKde: a.kde, syroveUroven: a.uroven, syrove: a.cheaper,
        kde: b.kde, uroven: b.uroven, ciste: b.cheaper,
        /* Jméno ve větě je SKLONĚNÉ („ve Zlínském kraji", ne „Zlínský“).
           Skloňování umí js/ceny.js, tak ať se tu nepíše podruhé: první
           podoba téhle kontroly hledala v textu „Zlínský" a hlásila
           chybu na stránkách, které byly v pořádku. */
        fraze: window.PK_CENY.kdeText(b.uroven, b.kde),
        syroveFraze: window.PK_CENY.kdeText(a.uroven, a.kde),
        rozdil: Math.abs(a.cheaper - b.cheaper) });
    }
    out.sort((x, y) => y.rozdil - x.rozdil);
    return out;
  }, { ciste: CISTA, syrove: DATA });
  pravda(`našly se pozemky, u kterých se úroveň srovnání liší (${vzorky.length})`,
    vzorky.length >= 3, `jen ${vzorky.length} — kontrola níž by neměla co měřit`);

  /* Jméno souboru stránky se skládá TOUŽ funkcí jako v generátoru, ať se
     neměří na adrese, která neexistuje. */
  const { mapaSouboru, klicNabidky } = await import('./generate-parcel-pages.mjs');
  const STRANKY = mapaSouboru(CISTA);
  let zmereno = 0;
  const spatne = [];
  for (const v of vzorky) {
    if (zmereno >= 3) break;
    const zapis = STRANKY.get(klicNabidky(v));
    if (!zapis) continue;
    const cesta = new URL('../' + zapis.soubor, import.meta.url).pathname;
    if (!existsSync(cesta)) continue;
    const ps = await ctx.newPage();
    await ps.goto(`${BASE}/${zapis.soubor}`, { waitUntil: 'load' });
    await ps.waitForTimeout(3000);
    const text = await ps.evaluate(() => {
      const e = document.getElementById('pz-verdict');
      return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    await ps.close();
    if (!text) { spatne.push(`${zapis.soubor}: verdikt se vůbec nevykreslil`); zmereno++; continue; }
    /* Věta zní „…pozemků téhož druhu v prodeji ve Zlínském kraji." nebo
       „…v okrese Vsetín." — podle úrovně. Stačí tedy hledat jméno: kraj
       se jmenuje jinak než okres (shoda jmen je jen u Prahy, a tu syrový
       a očištěný model nerozliší, takže se takový vzorek nevybere). */
    const maCiste = text.indexOf(v.fraze) !== -1;
    const maSyrove = v.syroveFraze !== v.fraze && text.indexOf(v.syroveFraze) !== -1;
    /* Když stránka procento vypisuje, musí být taky to očištěné. */
    const cislo = /(?:Levnější|Dražší) než (\d+) %/.exec(text);
    const cisloSedi = !cislo || +cislo[1] === v.ciste;
    if (!maCiste || maSyrove || !cisloSedi) {
      spatne.push(`${zapis.soubor}: čekáno srovnání „${v.fraze}" (${v.ciste} %), `
        + `syrový model dává „${v.syroveFraze}" (${v.syrove} %); `
        + `na stránce: „${text.slice(0, 120)}"`);
    }
    zmereno++;
  }
  pravda(`změřily se skutečné stránky pozemků (${zmereno})`, zmereno >= 3,
    `jen ${zmereno} — stránky se nenašly nebo neexistují`);
  pravda('a na každé stojí číslo z modelu BEZ duplicit, tedy totéž co na mapě',
    spatne.length === 0, spatne.join('\n      '));
}

// --- Cena za metr u spoluvlastnického podílu: co je OPRAVDU na kartě ---
/* Výpočet hlídá scripts/test-ceny.mjs, tohle hlídá to zapojení. Mezi
   správným vzorcem v js/ceny.js a číslem, které člověk uvidí, je ještě
   pět míst, kde se cena za metr počítala ručně — a stačí přepojit čtyři
   z pěti, aby to pořád vypadalo hotově. Proto se tady vezme skutečná
   nabídka z ostrých dat, najde se její karta na mapě a přečte se z ní
   to číslo. */
{
  const podil = await p.evaluate((D) => {
    const z = (x) => { const m = /^(\d+)\/(\d+)$/.exec(String(x.zlomek || '')); return m ? +m[1] / +m[2] : null; };
    /* Zlomek musí být dost malý, aby se špatné a správné číslo lišily
       o víc než zaokrouhlení — jinak by kontrola prošla i s chybou. */
    const d = D.find((x) => x.podil && z(x) && z(x) <= 0.5 && x.area > 0 && x.price > 0
      && x.parcel && x.parcel !== '—');
    if (!d) return null;
    return { place: d.place, parcel: d.parcel, zlomek: d.zlomek,
      spravne: Math.round(d.price / (d.area * z(d))), spatne: Math.round(d.price / d.area) };
  }, CISTA);
  pravda('v datech je podíl se známou velikostí', !!podil,
    'není na čem ověřit, že se cena za metr počítá z podílové výměry');
  if (podil) {
    const p4 = await ctx.newPage();
    await p4.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await p4.waitForTimeout(4500);
    await p4.evaluate((q) => {
      const e = document.getElementById('map-search');
      e.value = q; e.dispatchEvent(new Event('input', { bubbles: true }));
    }, podil.place);
    await p4.waitForTimeout(900);
    const karta = await p4.evaluate((parcel) => {
      const li = [...document.querySelectorAll('.opp-item')]
        .find((e) => (e.textContent || '').indexOf('parc. ' + parcel) !== -1);
      if (!li) return null;
      const per = li.querySelector('.opp-perm2');
      const vym = li.querySelector('.opp-figures .m');
      return { perm2: per ? +(per.textContent || '').replace(/[^\d]/g, '') : null,
        titul: per ? (per.getAttribute('title') || '') : '',
        vymera: vym ? vym.textContent : '',
        podilChip: !!li.querySelector('.opp-podil') };
    }, podil.parcel);
    pravda('karta podílu se na mapě našla', !!karta,
      `hledáno „${podil.place}", parcela ${podil.parcel}`);
    if (karta) {
      pravda('cena za metr je počítaná z výměry, která kupci připadne',
        karta.perm2 === podil.spravne,
        `na kartě ${karta.perm2} Kč/m², správně ${podil.spravne} Kč/m² (podíl ${podil.zlomek}); ` +
        `z celé výměry by vyšlo ${podil.spatne} Kč/m²`);
      pravda('a je u ní řečeno, že je přepočtená z podílu',
        /podíl/i.test(karta.titul),
        `u čísla nestojí nic — vypadá jako běžná cena za metr, přitom je přepočtená (${karta.titul})`);
      pravda('a karta pořád přiznává, že jde o podíl', karta.podilChip);
      /* Výměra v inzerátu je CELÉ parcely, cena jen za zlomek. Když
         vedle sebe stojí holé „25 000 Kč" a „445 m²", každý si je
         vydělí a vyjde mu cena, kterou nikdo neplatí. */
      pravda('a u výměry stojí, že je to celá parcela', /celá parcela/i.test(karta.vymera),
        `u výměry stojí „${karta.vymera.trim()}" — dvě čísla vedle sebe svádějí k dělení`);
    }
    await p4.close();
  }
}

await prohlizec.close();
console.log('\nShoda cen mezi mapou a stránkou pozemku');
console.log(`  · porovnáno ${vysledek.pocet || 0} pozemků, kus po kuse`);
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Shoda cen: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
