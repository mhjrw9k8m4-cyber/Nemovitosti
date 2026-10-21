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
import { hlasPad } from './zkouska-pad.mjs';

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
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Zaostření', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
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

/* ---- ZAMĚŘENÍ MUSÍ PŘEŽÍT PŘEKRESLENÍ VÝPISU ----
   Prstenec je k ničemu, když zaměření zmizí úplně. Naměřeno
   (oddíl 96): křížek „Tenhle mě nezajímá" na kartě i „Zobrazit skryté"
   v hlavičce shodily zaměření na <body> — výpis se celý přestaví, takže
   zaměřený prvek přestane existovat a prohlížeč zaměření upustí. Kdo
   jede klávesnicí, skončí na začátku dokumentu a zpátky se dostane
   jedině protabováním hlavičky, hledání a filtrů.
   Měří se document.activeElement před a po. */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
  const jsouKarty = await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 1,
    null, { timeout: 60000 }).then(() => true).catch(() => false);
  // PŘEDPOKLAD: bez výpisu se nedá měřit nic
  pravda('výpis: je na čem měřit zaměření (aspoň dvě karty)', jsouKarty, 'karty nedojely');
  if (jsouKarty) {
    const kdo = () => p.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body || e === document.documentElement) return 'body';
      return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
        + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '');
    });
    async function zamerA(sel) {
      return p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.focus(); return document.activeElement === e; }, sel);
    }
    /* KAŽDÝ SCÉNÁŘ NA ČISTÉ STRÁNCE. Má to naměřený důvod: kontroly si
       navzájem přestavovaly stav (jedna skryla kartu, druhá zapnula
       „Zobrazit skryté" — a třetí pak klepnutím na křížek kartu zase
       ODSKRYLA, takže zmizelo i tlačítko, na kterém se měla měřit
       krádež). Dvě kontroly tím byly plané a sabotáž je odhalila. */
    async function cistaStranka() {
      await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      /* NA ČISTOU ADRESU, ne reload. Web si stav výpisu (hledání,
         filtry, výřez mapy) zapisuje do adresy, takže reload ho obnoví
         i po vymazání paměti prohlížeče. Naměřeno: po `reload()` zbylo
         ve výpisu jen „Brno" z kontroly o pár řádků výš a kontrola
         měřila něco úplně jiného, než co měla napsané. */
      await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      const jsou = await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 3,
        null, { timeout: 60000 }).then(() => true).catch(() => false);
      if (!jsou) return false;
      /* STÁLÉ ŘAZENÍ A USAZENÝ SEZNAM. Výchozí „Doporučené" se střídá
         a výpis se po načtení ještě sám přemíchá (naměřeno: ze pěti
         karet zůstaly na svém místě dvě), takže snímek pořadí platil
         jen chvilku a kontrola měřila míchání, ne zaměření. Přepne se
         proto na „Nejnovější" a čeká se, až se seznam dvakrát po sobě
         přečte stejně. */
      await p.evaluate(() => {
        const s = document.getElementById('map-sort');
        if (s) { s.value = 'nove'; s.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      const klice = () => p.evaluate(() => [...document.querySelectorAll('#opp-list .opp-item')]
        .map((x) => x.getAttribute('data-pk')).join('~'));
      let a = await klice();
      for (let i = 0; i < 12; i++) {
        await p.waitForTimeout(400);
        const b = await klice();
        if (b && b === a) return true;
        a = b;
      }
      return true;
    }
    /* 1) skrytí karty */
    const zam1 = await zamerA('#opp-list .opp-item .opp-skryt');
    pravda('výpis: křížek na kartě se dá zaměřit', zam1 === true, 'nejde zaměřit .opp-skryt');
    if (zam1) {
      await p.evaluate(() => document.querySelector('#opp-list .opp-item .opp-skryt').click());
      await p.waitForTimeout(600);
      const po = await kdo();
      pravda(`výpis: po skrytí karty zaměření nespadne na <body> (${po})`,
        po !== 'body', 'zaměření skončilo na <body> — klávesnicí se člověk octne na začátku stránky');
      pravda('výpis: a zůstane na stejné věci na kartě, co nastoupila', /opp-skryt/.test(po), po);
    }
    /* 2) nářadí v hlavičce, které se přestaví se stejným id */
    const zam2 = await zamerA('#mc-skryte');
    pravda('výpis: „Zobrazit skryté" se dá zaměřit', zam2 === true, 'tlačítko #mc-skryte není');
    if (zam2) {
      await p.evaluate(() => document.getElementById('mc-skryte').click());
      await p.waitForTimeout(600);
      const po = await kdo();
      pravda(`výpis: po „Zobrazit skryté" zaměření zůstane na tlačítku (${po})`,
        /^button#mc-skryte/.test(po), po);
    }
    /* 3) A NIC SE NEKRADE. renderList běží při každém úhozu v hledání,
       takže kdyby se zaměření vracelo vždycky, utrhlo by člověku kurzor.
       MĚŘÍ SE NA PRVKU BEZ id A MIMO VÝPIS — a má to naměřený důvod:
       první podoba téhle kontroly zkoušela políčko hledání a byla
       PLANÁ. Políčko má id, takže i rozbité vracení ho najde podle id
       a zaměří nazpátek týž prvek; na obrazovce se nic nestane.
       Prvek bez id žádnou takovou záchranu nemá: rozbité vracení ho
       přeskočí a skončí na „Zobrazit skryté" v hlavičce výpisu. */
    await p.click('#map-search');
    await p.type('#map-search', 'Brno', { delay: 70 });
    await p.waitForTimeout(1000);
    pravda('výpis: psaní do hledání o kurzor nepřipraví', (await kdo()) === 'input#map-search',
      `kurzor skončil na ${await kdo()}`);
    await cistaStranka();
    /* MUSÍ EXISTOVAT CÍL, KAM BY ZAMĚŘENÍ UTEKLO, jinak je kontrola
       planá — a první podoba planá byla. Poslední záchyt ve vracení je
       „Zobrazit skryté" v hlavičce výpisu, a to tlačítko je na stránce
       jen tehdy, když je něco skrytého. Změřeno: s rozbitou pojistkou
       a bez skryté nabídky zaměření na odkazu zůstane (není kam ho
       vzít), se skrytou uteče na #mc-skryte. Jedna karta se proto
       skryje. */
    await p.evaluate(() => {
      const b = document.querySelector('#opp-list .opp-item .opp-skryt');
      if (b) b.click();
    });
    await p.waitForTimeout(800);
    const mimo = await p.evaluate(() => {
      const a = [...document.querySelectorAll('#header a[href]')].filter((x) => !x.id && x.offsetParent)[0];
      if (!a) return null;
      a.focus();
      return document.activeElement === a
        ? { trida: (a.className || '').trim().split(/\s+/)[0] || a.tagName, text: (a.textContent || '').trim().slice(0, 20),
            cil: !!document.getElementById('mc-skryte') } : null;
    });
    // PŘEDPOKLAD: bez zaměřeného odkazu a bez cíle by se krádež neměřila
    pravda('výpis: je na čem měřit krádež (odkaz bez id a cíl, kam utéct)',
      !!mimo && mimo.cil === true, JSON.stringify(mimo));
    if (mimo && mimo.cil) {
      await p.evaluate(() => {
        const s = document.getElementById('map-sort');
        s.selectedIndex = (s.selectedIndex + 1) % s.options.length;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await p.waitForTimeout(900);
      const po = await p.evaluate(() => {
        const e = document.activeElement;
        return e ? ((e.className || '').trim().split(/\s+/)[0] || e.tagName) + '|' + (e.textContent || '').trim().slice(0, 20) : 'nic';
      });
      pravda(`výpis: překreslení nesebere zaměření odkazu v hlavičce (${po})`,
        po === mimo.trida + '|' + mimo.text, `před: ${mimo.trida}|${mimo.text}, po: ${po}`);
    }
    /* 4) karta, která přežije, si zaměření drží (podle data-pk, ne podle
       pořadí — po změně řazení je karta jinde) */
    /* 4a) KARTA, KTERÁ Z VÝPISU ODEJDE: drží se MÍSTO v seznamu.
       Změna řazení kartu zprostřed odstěhuje na jinou stranu výpisu
       (stránkuje se), takže ji podle klíče najít nejde — a pak je
       správné zůstat na stejném místě seznamu, jako kdyby to člověk
       viděl. Naměřeno: právě tohle se děje. */
    await cistaStranka();
    const stred = await p.evaluate(() => {
      const karty = [...document.querySelectorAll('#opp-list .opp-item')];
      const k = karty[Math.min(2, karty.length - 1)];
      if (!k) return null;
      k.focus();
      return document.activeElement === k
        ? { pk: k.getAttribute('data-pk') || '', poradi: karty.indexOf(k) } : null;
    });
    pravda('výpis: karta zprostřed se dá zaměřit', !!stred, 'kartu nejde zaměřit (tabindex?)');
    if (stred) {
      await p.evaluate(() => {
        const s = document.getElementById('map-sort');
        s.selectedIndex = (s.selectedIndex + 1) % s.options.length;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await p.waitForTimeout(900);
      const po = await p.evaluate(() => {
        const e = document.activeElement;
        const karta = e && e.closest ? e.closest('.opp-item') : null;
        const karty = [...document.querySelectorAll('#opp-list .opp-item')];
        return { je: !!karta, poradi: karta ? karty.indexOf(karta) : -1 };
      });
      pravda(`výpis: po změně řazení zůstane zaměření ve výpisu, na stejném místě (${stred.poradi} → ${po.poradi})`,
        po.je === true && po.poradi === stred.poradi, JSON.stringify(po));
    }

    /* 4b) KARTA, KTERÁ VE VÝPISU ZŮSTANE: drží se TÁŽ KARTA, ne místo.
       Skryje se karta NAD zaměřenou (klepnutím ze skriptu, které
       zaměření nepřebírá), takže se zaměřená posune o jedno výš.
       Hledat podle pořadí by tu zaměřilo JINOU nabídku — a to je ten
       rozdíl, kvůli kterému se hledá podle data-pk. První podoba téhle
       kontroly brala první kartu a byla planá: ta zůstala první, takže
       pořadí i klíč ukazovaly na totéž. */
    await cistaStranka();
    const pred4b = await p.evaluate(() => {
      const karty = [...document.querySelectorAll('#opp-list .opp-item')];
      if (karty.length < 4) return null;
      const k = karty[2];
      k.focus();
      if (document.activeElement !== k) return null;
      return { pk: k.getAttribute('data-pk'), poradi: 2, podPk: karty[3].getAttribute('data-pk'),
        klice: karty.map((x) => x.getAttribute('data-pk')) };
    });
    pravda('výpis: jsou aspoň čtyři karty, na kterých se to dá změřit', !!pred4b,
      've výpisu není dost karet');
    if (pred4b) {
      await p.evaluate(() => {
        /* .click() ze skriptu zaměření NEPŘEBÍRÁ (na rozdíl od klepnutí
           myší), takže zůstane na kartě zprostřed — přesně jak potřebujeme. */
        document.querySelector('#opp-list .opp-item .opp-skryt').click();
      });
      await p.waitForTimeout(900);
      const po4b = await p.evaluate(() => {
        const e = document.activeElement;
        const karta = e && e.closest ? e.closest('.opp-item') : null;
        const karty = [...document.querySelectorAll('#opp-list .opp-item')];
        return { pk: karta ? karta.getAttribute('data-pk') : null,
          poradi: karta ? karty.indexOf(karta) : -1,
          naMiste: karty[2] ? karty[2].getAttribute('data-pk') : null,
          klice: karty.map((x) => x.getAttribute('data-pk')) };
      });
      /* PŘEDPOKLAD: kdyby se karta nepřesunula, kontrola níž nic neměří. */
      pravda(`výpis: skrytím karty nad ní se zaměřená posunula (${pred4b.poradi} → ${po4b.poradi})`,
        po4b.poradi === 1, JSON.stringify(po4b));
      pravda('výpis: a zaměřená zůstala TÁŽ karta, ne ta, co je teď na jejím místě',
        po4b.pk === pred4b.pk && po4b.pk !== po4b.naMiste,
        `čekáno ${pred4b.pk}, je ${po4b.pk} (na původním místě je ${po4b.naMiste})`
        + `\n      před: ${JSON.stringify(pred4b.klice.slice(0, 5))}`
        + `\n      po:   ${JSON.stringify(po4b.klice.slice(0, 5))}`);
    }
    pravda('výpis: nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  }
  await ctx.close();
}

await prohlizec.close();
console.log('\nZaostření klávesnicí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zaostření: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
