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
const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
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
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  /* ZPOMALENÍ NA ZAVOLÁNÍ: PK_ZPOMAL=6 přidá procesoru šestinásobnou
     zátěž (CDP Emulation.setCPUThrottlingRate). V CI běží zkoušky na
     pomalejším stroji a 23. 10. tam padla kontrola, kterou tady nešlo
     zopakovat — tohle je nejkratší cesta, jak takový stav napodobit,
     místo hádání. Ve výchozím běhu se nezpomaluje nic. */
  if (process.env.PK_ZPOMAL) {
    try {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PK_ZPOMAL) || 4 });
    } catch (e) { /* starší prohlížeč to neumí — běží se bez zpomalení */ }
  }
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
    /* 4a) PO ZMĚNĚ ŘAZENÍ ZŮSTANE ZAMĚŘENÍ VE VÝPISU — a na tom, co
       člověk čte, ne na prázdnu.
       Tohle tvrzení tu dřív bylo užší: „drží se MÍSTO v seznamu",
       protože změna řazení kartu zprostřed odstěhuje na jinou stranu
       výpisu (stránkuje se) a podle klíče ji najít nejde. Jenže to
       platí jen pro NĚKTERÁ řazení a NĚKTERÁ data: 23. 10. ta kontrola
       prošla lokálně třikrát za sebou (2 → 2) a v CI spadla (2 → 14),
       protože tam karta na stránce zůstala a zaměření ji správně
       následovalo. Tedy zkouška měřila něco, co drží náhodou.
       Pravidlo, které js/main.js opravdu dodržuje (vratZamereni):
       **najdi tutéž kartu podle data-pk; a když ve výpisu není, vezmi
       tu, co nastoupila na její místo.** Tak se to tu měří, a napříč
       VŠEMI volbami řazení, ne jen tou nejbližší. */
    const voleb = await p.evaluate(() => document.getElementById('map-sort').options.length);
    pravda(`výpis: řazení má z čeho vybírat (${voleb} voleb)`, voleb >= 2, `jen ${voleb}`);
    let rozbite = [], nasleduje = 0, misto = 0, zachytu = 0, oken = 0;
    for (let i = 0; i < voleb; i++) {
      await cistaStranka();
      const stred = await p.evaluate(() => {
        const karty = [...document.querySelectorAll('#opp-list .opp-item')];
        const k = karty[Math.min(2, karty.length - 1)];
        if (!k) return null;
        k.focus();
        return document.activeElement === k
          ? { pk: k.getAttribute('data-pk') || '', poradi: karty.indexOf(k) } : null;
      });
      if (!stred) { rozbite.push(`volba ${i}: kartu nejde zaměřit`); continue; }
      const po = await p.evaluate((kam) => {
        const s = document.getElementById('map-sort');
        if (s.selectedIndex === kam) return 'stejna';
        s.selectedIndex = kam;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return 'zmeneno';
      }, i);
      if (po === 'stejna') continue;
      /* ČEKÁ SE NA STAV, NE NA HODINKY. Dřív tu stálo pevných 900 ms a
         v CI to nestačilo: na pomalejším stroji zaměření do výpisu
         ještě nedorazilo a zkouška hlásila „spadlo z výpisu" (23. 10.,
         volba 1). Vrácení zaměření se děje až po překreslení výpisu,
         takže se čeká, než zaměření někde přistane — ve výpisu, nebo
         na posledním záchytu „Zobrazit skryté" (viz vratZamereni). */
      await p.waitForFunction(() => {
        const e = document.activeElement;
        if (!e || e === document.body || e === document.documentElement) return false;
        return !!(e.closest && e.closest('.opp-item, .vm-ov, [role="dialog"]')) || e.id === 'mc-skryte';
      }, null, { timeout: 8000 }).catch(() => {});
      const stav = await p.evaluate((pk) => {
        const e = document.activeElement;
        const karta = e && e.closest ? e.closest('.opp-item') : null;
        const karty = [...document.querySelectorAll('#opp-list .opp-item')];
        const ta = karty.filter((k) => k.getAttribute('data-pk') === pk)[0] || null;
        return {
          je: !!karta,
          naTeze: !!karta && karta === ta,
          poradi: karta ? karty.indexOf(karta) : -1,
          puvodniJeVeVypisu: !!ta,
          zachyt: !!e && e.id === 'mc-skryte',
          /* JEN OPRAVDU OTEVŘENÉ OKNO. Značky několika oken leží
             v DOM pořád (skryté), takže samo `querySelector` by
             „otevřené okno" hlásilo vždycky — a změřeno, že pak
             zkouška obviní výpis z toho, že drží zaměření po právu. */
          okno: [...document.querySelectorAll('.vm-ov, [role="dialog"][aria-modal="true"]')]
            .some((d) => {
              const cs = getComputedStyle(d);
              return cs.display !== 'none' && cs.visibility !== 'hidden' && d.offsetParent !== null;
            }),
          vOkne: !!(e && e.closest && e.closest('.vm-ov, [role="dialog"]')),
          kde: e ? (e.tagName + (e.id ? '#' + e.id : '')
            + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')
            + (e.closest && e.closest('#opp-list') ? ' (uvnitř výpisu)' : ' (mimo výpis)')) : 'nic',
          karet: karty.length,
        };
      }, stred.pk);
      if (stav.okno) {
        /* ŘAZENÍ „NEJBLÍŽ KE MNĚ" SI OTEVŘE OKNO „Vyberte své okolí" —
           web musí vědět, odkud se počítá blízkost. Pak zaměření patří
           TOMU OKNU, ne výpisu: je to past na zaměření, kterou si
           okna drží schválně (viz kontroly oken níž). Pravidlo
           o kartě a místě tu tedy neplatí a měří se, že zaměření
           v okně opravdu je.
           Naměřeno 23. 10.: právě tohle padalo v CI a lokálně ne
           (BUTTON.vm-x, tedy křížek toho okna). Lokálně se okno
           neotevřelo, protože okolí už bylo známé — a zkouška proto
           tvrdila, že zaměření „spadlo z výpisu". */
        if (stav.vOkne) { oken++; continue; }
        rozbite.push(`volba ${i}: okno je otevřené, ale zaměření je mimo něj (${stav.kde})`);
        continue;
      }
      if (!stav.je) {
        /* Poslední záchyt je napsané chování, ne chyba — ale musí být
           vidět, že se použil, a ne jen „zaměření je kdesi". */
        if (stav.zachyt) { zachytu++; continue; }
        rozbite.push(`volba ${i}: zaměření spadlo z výpisu (${stav.kde}, karet ${stav.karet})`);
        continue;
      }
      if (stav.puvodniJeVeVypisu) {
        if (stav.naTeze) nasleduje++;
        else rozbite.push(`volba ${i}: karta ve výpisu je, ale zaměření skočilo jinam (${stav.poradi})`);
      } else if (stav.poradi === stred.poradi) misto++;
      else rozbite.push(`volba ${i}: karta odešla a zaměření není na jejím místě (${stred.poradi} → ${stav.poradi})`);
    }
    pravda(`výpis: po změně řazení drží zaměření pravidlo „táž karta, jinak její místo" (${nasleduje}× táž karta, ${misto}× místo, ${zachytu}× poslední záchyt, ${oken}× okno)`,
      rozbite.length === 0, rozbite.slice(0, 3).join(' | '));
    pravda('a aspoň jedna volba řazení se opravdu vyzkoušela',
      nasleduje + misto + zachytu + oken > 0, 'žádná volba nezměnila pořadí — zkouška by neměřila nic');

    /* 4b) KARTA, KTERÁ VE VÝPISU ZŮSTANE: drží se TÁŽ KARTA, ne místo.
       Skryje se karta NAD zaměřenou (klepnutím ze skriptu, které
       zaměření nepřebírá), takže se zaměřená posune o jedno výš.
       Hledat podle pořadí by tu zaměřilo JINOU nabídku — a to je ten
       rozdíl, kvůli kterému se hledá podle data-pk. První podoba téhle
       kontroly brala první kartu a byla planá: ta zůstala první, takže
       pořadí i klíč ukazovaly na totéž. */
    await cistaStranka();
    /* KARTA PRO MĚŘENÍ MUSÍ MÍT JEDNOZNAČNÝ KLÍČ.
       Klíč `data-pk` je složený z místa, okresu a zaokrouhlených
       souřadnic, takže dvě různé nabídky na jednom místě mají klíč TÝŽ —
       a v datech to opravdu je (23. 10. stály ve výpisu vedle sebe dvě
       karty „Habry|—|Havlíčkův Brod|49.753|15.513"). Na dvojčeti se
       tvrzení „zůstala TÁŽ karta, ne ta, co je teď na jejím místě"
       dokázat NEDÁ: obě podmínky mluví o tomtéž řetězci a zkouška hlásí
       pád s hláškou „čekáno X, je X" (přesně to spadlo v CI #648).
       Zkusil jsem to i obráceně — označit si prvek atributem a hledat
       značku. Nefunguje a je to poučné: po skrytí karty se výpis
       PŘEKRESLÍ, takže zaměřená karta je nový prvek a značka je pryč.
       Totožnost tedy nese jen klíč, a proto se vybírá karta, jejíž klíč
       je ve výpisu právě jeden. */
    const pred4b = await p.evaluate(() => {
      const karty = [...document.querySelectorAll('#opp-list .opp-item')];
      if (karty.length < 4) return null;
      const klice = karty.map((x) => x.getAttribute('data-pk'));
      const pocet = {};
      klice.forEach((k) => { pocet[k] = (pocet[k] || 0) + 1; });
      /* Od druhé karty: nad ní musí zůstat co skrýt (skrývá se první). */
      const i = klice.findIndex((k, idx) => idx >= 1 && pocet[k] === 1);
      if (i < 0) return { bezJednoznacne: true, klice };
      const k = karty[i];
      k.focus();
      if (document.activeElement !== k) return null;
      return { pk: klice[i], poradi: i, klice };
    });
    pravda('výpis: jsou aspoň čtyři karty, na kterých se to dá změřit', !!pred4b,
      've výpisu není dost karet');
    /* Kdyby se ve výpisu sešly samé dvojčata, nemá se to měřit na slepo:
       ať je vidět, že kontrola neproběhla, místo falešného zeleného. */
    pravda('výpis: a je mezi nimi karta s jednoznačným klíčem',
      !(pred4b && pred4b.bezJednoznacne),
      'všechny karty ve výpisu mají klíč shodný s jinou — totožnost nejde dokázat: '
      + JSON.stringify((pred4b && pred4b.klice || []).slice(0, 6)));
    if (pred4b && !pred4b.bezJednoznacne) {
      await p.evaluate(() => {
        /* .click() ze skriptu zaměření NEPŘEBÍRÁ (na rozdíl od klepnutí
           myší), takže zůstane na kartě zprostřed — přesně jak potřebujeme. */
        document.querySelector('#opp-list .opp-item .opp-skryt').click();
      });
      await p.waitForTimeout(900);
      const po4b = await p.evaluate((kam) => {
        const e = document.activeElement;
        const karta = e && e.closest ? e.closest('.opp-item') : null;
        const karty = [...document.querySelectorAll('#opp-list .opp-item')];
        return { pk: karta ? karta.getAttribute('data-pk') : null,
          poradi: karta ? karty.indexOf(karta) : -1,
          naMiste: karty[kam] ? karty[kam].getAttribute('data-pk') : null,
          klice: karty.map((x) => x.getAttribute('data-pk')) };
      }, pred4b.poradi);
      /* PŘEDPOKLAD: kdyby se karta nepřesunula, kontrola níž nic neměří. */
      pravda(`výpis: skrytím karty nad ní se zaměřená posunula (${pred4b.poradi} → ${po4b.poradi})`,
        po4b.poradi === pred4b.poradi - 1, JSON.stringify(po4b));
      pravda('výpis: a zaměřená zůstala TÁŽ karta, ne ta, co je teď na jejím místě',
        po4b.pk === pred4b.pk && po4b.pk !== po4b.naMiste,
        `čekáno ${pred4b.pk}, je ${po4b.pk} (na původním místě ${pred4b.poradi} je ${po4b.naMiste})`
        + `\n      před: ${JSON.stringify(pred4b.klice.slice(0, 5))}`
        + `\n      po:   ${JSON.stringify(po4b.klice.slice(0, 5))}`);
    }
    pravda('výpis: nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  }
  await ctx.close();
}

/* ---- OKNA: ZAMĚŘENÍ DOVNITŘ, ZÁMEK TABULÁTORU, ESCAPE, VRÁCENÍ ----
   Okno hlásí `aria-modal="true"`, čímž slibuje, že za ním nic není.
   Naměřeno (oddíl 97): okno se zásadami soukromí zaměření vůbec
   nepřebralo, tabulátor z něj utekl na „nahoru" a po zavření zůstalo
   zaměření ve vzduchu; „Vyberte své okolí" totéž; „Procházet po
   jednom" mělo zaměření, ale ne zámek ani vrácení. Jen okno stahování
   bylo celé v pořádku.

   OTVÍRAČ MUSÍ BÝT DOSAŽITELNÝ, A HLÍDÁ SE TO. Na tomhle jsem se
   spálil: pilulku „Cena" jsem v sondě otevíral `click()`em, jenže ta
   leží v zavřeném `<details>` panelu filtrů — na obrazovce má rozměr,
   ale je za mapou a zaměřit se nedá. „Nález" byl artefakt měření ve
   stavu, do kterého se člověk nedostane. Každé okno se proto měří jen
   přes otvírač, který JDE ZAMĚŘIT a leží NAHOŘE (hit-test v jeho
   středu vrací jeho vlastní prvek). */
{
  const OKNA = [
    ['zásady soukromí', '[data-info]', '#info-modal'],
    ['stáhnout tabulku', '#mc-vyvoz', '#vyv-vrstva'],
    ['procházet po jednom', '#mc-rychly', '#rv-vrstva'],
    ['vyberte své okolí', '#map-near', '.vm-panel'],
  ];
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 }).catch(() => {});
  /* Otvírač se hledá mezi VŠEMI, co selektoru odpovídají, a bere se
     první dosažitelný. Taky naměřeno: `[data-info]` je i v mobilní
     nabídce, která je na počítači schovaná, a querySelector vrací
     právě ten schovaný — kontrola pak hlásila „není nahoře" o prvku,
     ke kterému se člověk na téhle šířce vůbec nedostane.
     A k prvku se nejdřív přijde: „Zásady soukromí" jsou v patičce, pod
     okrajem okna, takže hit-test by vrátil null. Rozlišit se musí
     ZAKRYTÝ prvek (vada) od prvku ZA OKRAJEM (v pořádku). */
  /* Otvírač se hledá mezi VŠEMI, co selektoru odpovídají, a bere se
     první dosažitelný. Taky naměřeno: `[data-info]` je v patičce, tedy
     hluboko pod okrajem okna, a stránka má plynulé rolování
     (`scroll-behavior`) — hit-test hned po scrollIntoView() proto
     vracel null a kontrola hlásila „není nahoře" o prvku, který je
     v pořádku. Rolování se tedy nechá DOJET a měří se až potom.
     Rozlišit se musí ZAKRYTÝ prvek (vada) od prvku ZA OKRAJEM. */
  async function vid(sel) {
    const kolik = await p.locator(sel).count();
    if (!kolik) return { je: false };
    let posledni = null;
    for (let i = 0; i < kolik; i++) {
      const l = p.locator(sel).nth(i);
      /* Dojet k prvku umí Playwright sám a správně — vlastní
         scrollIntoView + čekání jsem zkusil a měřil jsem s ním starý
         obdélník (stránka roluje plynule a rect se čte dřív, než
         rolování dojede). Tady je to jedna řádka a je spolehlivá. */
      await l.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(200);
      const v = await l.evaluate((e) => {
        const r = e.getBoundingClientRect();
        e.focus();
        const r2 = e.getBoundingClientRect();     // po focusu: ten taky roluje
        const na = (r2.width && r2.height)
          ? document.elementFromPoint(Math.round(r2.x + r2.width / 2), Math.round(r2.y + r2.height / 2)) : null;
        const ok = document.activeElement === e && !!(na && (na === e || e.contains(na)));
        if (ok) window.__otv = e;
        return { je: true, zamerit: document.activeElement === e, nahore: !!(na && (na === e || e.contains(na))),
          kde: Math.round(r.y) + '→' + Math.round(r2.y),
          naBode: na ? (na.id || na.tagName) : 'nic' };
      });
      posledni = Object.assign({ zKolika: kolik }, v);
      if (v.zamerit && v.nahore) return posledni;
    }
    await p.evaluate(() => { window.__otv = null; });
    return posledni;
  }
  for (const [jmeno, otvirac, okno] of OKNA) {
    const o = await vid(otvirac);
    // PŘEDPOKLAD: co nejde zaměřit a není nahoře, to člověk neotevře
    pravda(`okno „${jmeno}": otvírač jde zaměřit a leží nahoře`,
      o.je && o.zamerit && o.nahore, JSON.stringify(o));
    if (!(o.je && o.zamerit && o.nahore)) continue;
    await p.keyboard.press('Enter');       // otevřít klávesou, ne myší
    await p.waitForTimeout(700);
    const uvnitr = await p.evaluate((s) => {
      const okno = document.querySelector(s);
      const vid2 = (e) => { if (!e || e.hasAttribute('hidden')) return false;
        const st = getComputedStyle(e); const r = e.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const a = document.activeElement;
      const f = okno ? [...okno.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((x) => !x.disabled && vid2(x)) : [];
      if (f.length) f[f.length - 1].focus();     // postav se na poslední prvek
      return { vidi: vid2(okno), uvnitr: !!(okno && a && okno.contains(a)), ovladacu: f.length,
        kdo: a ? (a.tagName.toLowerCase() + (a.id ? '#' + a.id : '')) : 'nic' };
    }, okno);
    pravda(`okno „${jmeno}": otevřelo se klávesou (${uvnitr.ovladacu} ovladačů)`,
      uvnitr.vidi && uvnitr.ovladacu > 0, JSON.stringify(uvnitr));
    pravda(`okno „${jmeno}": zaměření šlo DOVNITŘ (${uvnitr.kdo})`, uvnitr.uvnitr === true,
      'zaměření zůstalo za oknem — klávesnicí se v něm nedá začít');
    await p.keyboard.press('Tab');
    await p.waitForTimeout(200);
    const zamek = await p.evaluate((s) => {
      const okno = document.querySelector(s); const a = document.activeElement;
      return { uvnitr: !!(okno && a && okno.contains(a)),
        kdo: a ? (a.tagName.toLowerCase() + (a.id ? '#' + a.id : '.' + ((a.className || '').split(' ')[0] || ''))) : 'nic' };
    }, okno);
    pravda(`okno „${jmeno}": tabulátor z něj neuteče (${zamek.kdo})`, zamek.uvnitr === true,
      'tabulátor utekl za okno, do obsahu, který není vidět — a `aria-modal` tvrdí, že tam nic není');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
    const po = await p.evaluate(([s]) => {
      const okno = document.querySelector(s);
      const vid2 = (e) => { if (!e || e.hasAttribute('hidden')) return false;
        const st = getComputedStyle(e); const r = e.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const a = document.activeElement;
      const otv = window.__otv;      // ten, který se opravdu použil
      /* „Na otvírači" znamená i prvek, který ho nahradil se stejným id:
         zavření okna přestaví nářadí výpisu (oddíl 96), takže #mc-rychly
         po zavření je JINÝ prvek — a zaměření na něm je správný výsledek. */
      return { zavreno: !vid2(okno),
        naOtvirac: !!(otv && a && (a === otv || (otv.id && a.id === otv.id))),
        kdo: a ? (a.tagName.toLowerCase() + (a.id ? '#' + a.id : '.' + ((a.className || '').split(' ')[0] || ''))) : 'nic' };
    }, [okno]);
    pravda(`okno „${jmeno}": Escape ho zavře`, po.zavreno === true, 'okno po Escape pořád svítí');
    pravda(`okno „${jmeno}": a zaměření se vrátí na otvírač (${po.kdo})`, po.naOtvirac === true,
      'zaměření skončilo jinde — klávesnicí se člověk octne na začátku stránky (oddíl 96)');
  }
  pravda('okna: nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

await prohlizec.close();
console.log('\nZaostření klávesnicí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zaostření: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
