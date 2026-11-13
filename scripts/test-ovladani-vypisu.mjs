/* Test: ovládání nad výpisem má jednu velikost.
 * ====================================================================
 * Spuštění: node scripts/test-ovladani-vypisu.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta)
 *
 * PROČ. Nad výpisem stojí na telefonu pět ovladačů ve třech řadách:
 * hledání a přepínač Seznam/Mapa, pod nimi „Uložené" (samotné, přes
 * celou šířku), pod nimi „Procházet po jednom" a „Stáhnout výběr".
 * (Řazení tu stálo do 29. 10., pak si ho majitel vyžádal do panelu
 * filtrů. 30. 10. tu na chvíli byl přepínač „Historie" a týž den ho
 * majitel zrušil: „to nikdo nechtěl.") Dělají příbuzné věci, ale
 * každý si nesl vlastní velikost:
 *
 *   · přepínač měl vlastní rámeček a výplň, takže vedle 44px pole stál
 *     jako 54px blok;
 *   · nářadí mělo šedou výplň, kdežto pilulky nad ním bílou;
 *   · řazení mělo 12px písmo a strop šířky 150 px, sousední „Uložené"
 *     mělo 13px a 194 px;
 *   · šířky vycházely z délky nápisu (84, 103, 182, 167 px), takže
 *     pravý okraj byl roztřepený.
 *
 * Majitel to poslal vyfocené s větou „všechna políčka mají mít stejnou
 * velikost". Tahle zkouška hlídá, že to tak zůstane — měří SKUTEČNÉ
 * rozměry v prohlížeči, ne zápis v CSS.
 *
 * MĚŘÍ SE NA DVOU ŠÍŘKÁCH. Na 390 px stojí ovladače po dvou vedle sebe,
 * na 320 px pod sebou (dva sloupce by daly 146 px a nápisy by lezly přes
 * rámeček — taky vyfoceno). V obou případech ale platí: co je v jedné
 * řadě, má tutéž velikost.
 *
 * A HLÍDÁ SE JEŠTĚ TROJÍ, taky na majitelovu žádost:
 *
 *   1. KAŽDÝ OVLADAČ MÁ SVOU ZNAČKU („udělej speciální ikonky u všeho").
 *      Stejně velká políčka se jinak od sebe nedají rozeznat jinak než
 *      přečtením. Měří se skutečný rámeček značky — záložka v „Uložené"
 *      byla od 561 px výš naměřeně 0 × 0 px, tedy neviditelná, a nikdo
 *      si toho rok nevšiml, protože v CSS „byla".
 *   2. „PROCHÁZET PO JEDNOM" JE VIDĚT JAKO HLAVNÍ. Majitel: „je to jedna
 *      z hlavních věcí na webu, takže by to mělo být nějak vidět."
 *      Velikost zůstává stejná jako u sousedů (viz výš), liší se PLOCHA:
 *      zelená výplň proti bílé.
 *   3. NÁPIS V POLI HLEDÁNÍ SE NESMÍ OŘÍZNOUT. „Obec, druh, cena…" měří
 *      145 px a pole mu dávalo 135 — nápis končil uprostřed slova
 *      „cena" (vyfoceno). Měří se šířka textu proti vnitřní šířce pole.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));


let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Ovládání výpisu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(e) {
  if (e) zpravy.push('  ✕ zkouška spadla: ' + e.message);
  console.log('\nOvládání nad výpisem — jedna velikost');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb + (e ? 1 : 0)} chyb\n`);
  if (chyb || e) { console.log('::error::Ovládání výpisu: ' + (chyb + (e ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  for (const sirka of [390, 320]) {
    const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block',
      viewport: { width: sirka, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await naSeznam(p);
    await p.waitForSelector('#mc-vyvoz', { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(1200);

    /* 0: NÁŘADÍ JE NA TELEFONU POD JEDNÍM NÁPISEM (13. 11.).
       Majitel: „ale aj potřebuju, aby jsi to nějak upravil, je to
       přehlcené." Sedm tlačítek v pěti řádcích je teď pod otvíračem
       „Další akce" (<details id="mn-vse">); nad výpisem zůstalo jen
       řazení a počet. První nabídka tím vyšla na 584 px místo 636.
       Měří se DVOUFÁZOVĚ, a má to důvod: prvek v zavřeném <details>
       hlásí v Chromu pořád poslední známý obdélník (naměřeno 13. 11.
       na filtrech: 110×44 na y=285 zavřeno i otevřeno), takže
       kontroly níž by bez otevření měřily duchy. Tady se změří
       zavřený stav, pak se otvírač otevře jako prstem a zbytek
       hlídače měří skutečné krabice. */
    const nar0 = await p.evaluate(() => {
      const o = document.getElementById('mn-vse');
      const s = o ? o.querySelector('summary') : null;
      const sr = s ? s.getBoundingClientRect() : null;
      return { obalJe: !!o, otevreny: !!(o && o.open),
        otviracVidno: !!(s && s.checkVisibility()),
        otviracVyska: sr ? Math.round(sr.height) : 0,
        nastrojuVidno: [...document.querySelectorAll('.mc-nastroj, #map-fav')]
          .filter((e) => e.checkVisibility()).length };
    });
    pravda(`${sirka} px: nářadí je po načtení schované pod „Další akce"`,
      nar0.obalJe && !nar0.otevreny && nar0.otviracVidno && nar0.nastrojuVidno === 0,
      JSON.stringify(nar0));
    pravda(`${sirka} px: a ten nápis unese prst (${nar0.otviracVyska} px)`,
      nar0.otviracVyska >= 44, `${nar0.otviracVyska} px`);
    await p.locator('#mn-vse > summary').click().catch(() => {});
    await p.waitForTimeout(400);

    const v = await p.evaluate(() => {
      const mer = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return { w: Math.round(r.width), h: Math.round(r.height), r: cs.borderTopLeftRadius,
          fs: cs.fontSize, bd: cs.borderTopColor, x: Math.round(r.left), y: Math.round(r.top) }; };
      const q = (s) => mer(document.querySelector(s));
      return {
        /* Rámeček i zaoblení nese samo POLE, ne obal kolem něj
           (.map-search je jen pozicovací krabička pro lupu). */
        hledani: q('.mcp-hledani #map-search'), prepinac: q('.mcp-hledani .mv-toggle'),
        ulozene: q('#map-fav'),
        rychly: q('#mc-rychly'), vyvoz: q('#mc-vyvoz'),
        /* VŠECHNO NÁŘADÍ UPROSTŘED, ne jen ty dva kusy, které tu byly
           jmenovitě. Kolik jich je, rozhodují DATA: „Dražby po termínu"
           se vykreslí, jen když v nabídce nějaké skončené jsou — a 13. 11.
           se právě to stalo (o půlnoci uplynul termín dvěma dražbám),
           takže se do pruhu přidal třetí kus a dvojice se přeskládala.
           Kontrola, která čekala jmenovitě „Uložené + Stáhnout výběr"
           v jednom řádku, tím padla, ačkoli web byl v pořádku. Měří se
           proto TVAR pruhu, ne jména. */
        stred: [...document.querySelectorAll('.ms-vysledky .mc-nastroj, #map-fav')]
          .filter((e) => e.checkVisibility() && e.id !== 'mc-rychly')
          .map((e) => { const r = e.getBoundingClientRect();
            return { jm: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
              y: Math.round(r.top), w: Math.round(r.width), p: Math.round(r.right) }; }),
        /* Ovladač řazení nad výpisem — ten, ze kterého se 30. 10. stal
           nadpis „Doporučené" (§248). Hlídá se jeho poloha: majitel ho
           chce úplně dole.
           OD 31. 10. SE PTÁ NA SKUTEČNÝ ROZBALOVAČ, NE NA ATRAPU.
           Do té doby to bylo tlačítko #mc-razeni, které jen otevíralo
           panel filtrů, kde teprve bydlela volba (§275). Vzhled zůstal
           týž, selektor se změnil: tlačítko, které k <select id="map-sort">
           staví js/dropdown.js. */
        razeni: q('.ms-vysledky > .cdd > .cdd-btn'),
        /* Mezera mezi sloupci se ČTE z té mřížky, která řádek opravdu
           skládá — od 30. 10. je to .ms-vysledky, ne #mc-akce (ten má
           display:contents a žádné sloupce nemá). */
        mezera: (function () {
          const g = document.querySelector('.ms-vysledky');
          return g ? Math.round(parseFloat(getComputedStyle(g).columnGap) || 0) : 0;
        })(),
        pretek: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    /* ZNAČKY A PLOCHY. Měří se zvlášť, ať zůstane mer() nahoře krátké.
       Značka se hledá JAKO VYKRESLENÝ RÁMEČEK, ne jako přítomnost
       značky v kódu — přesně to byl případ záložky v „Uložené“. */
    const z = await p.evaluate(() => {
      const ik = (s) => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const plocha = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; };
      /* Obrys ovladače: šířka a barva dohromady. Po ztišení ovládání
         (12. 11.) nese znamení „jsem ovladač" obrys, ne výplň — viz
         oddíl 2 níž. */
      const obrys = (s) => { const e = document.querySelector(s); if (!e) return null;
        const c = getComputedStyle(e);
        return { sirka: Math.round(parseFloat(c.borderTopWidth) * 100) / 100, barva: c.borderTopColor }; };
      const inp = document.getElementById('map-search');
      let napis = 0, vnitrni = 0;
      if (inp) {
        const cs = getComputedStyle(inp);
        const cv = document.createElement('canvas').getContext('2d');
        cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        napis = Math.ceil(cv.measureText(inp.placeholder || '').width);
        vnitrni = Math.round(inp.getBoundingClientRect().width
          - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      }
      return {
        znacky: {
          hledání: ik('.mcp-hledani .ms-lupa'),
          'přepínač': ik('.mv-toggle .mvt-btn.active svg'),
          'Uložené': ik('#map-fav svg'),
          'Procházet po jednom': ik('#mc-rychly .mcn-ic svg'),
          'Stáhnout výběr': ik('#mc-vyvoz .mcn-ic svg'),
        },
        plochy: { rychly: plocha('#mc-rychly'), vyvoz: plocha('#mc-vyvoz'), ulozene: plocha('#map-fav') },
      obrysy: { rychly: obrys('#mc-rychly'), vyvoz: obrys('#mc-vyvoz'), ulozene: obrys('#map-fav') },
        napis, vnitrni,
      };
    });

    const jsou = ['hledani', 'prepinac', 'ulozene', 'rychly', 'vyvoz', 'razeni'].filter((k) => v[k]);
    // PŘEDPOKLAD: bez vykreslených ovladačů by kontroly níž prošly naprázdno
    pravda(`${sirka} px: všech šest ovladačů se vykreslilo`, jsou.length === 6,
      'našly se jen: ' + jsou.join(', '));
    if (jsou.length !== 6) { await ctx.close(); continue; }

    const vse = [v.hledani, v.prepinac, v.ulozene, v.rychly, v.vyvoz];
    const vysky = [...new Set(vse.map((x) => x.h))];
    pravda(`${sirka} px: všechno v té sestavě je stejně vysoké`, vysky.length === 1 && vysky[0] === 44,
      'výšky: ' + JSON.stringify(vse.map((x) => x.h)));

    const radiusy = [...new Set([v.hledani, v.ulozene, v.rychly, v.vyvoz].map((x) => x.r))];
    pravda(`${sirka} px: a má jedno zaoblení`, radiusy.length === 1,
      'zaoblení: ' + JSON.stringify(radiusy));

    /* Dvojice v řadě si musí být rovné.
       A JAK TO JE MEZI DVOJICEMI: tahle kontrola žádala jednu šířku
       i mezi nimi a opisovala k tomu „na 320 px stojí pod sebou — a pak
       mají obě plnou šířku". To už 26. 10. neplatí: jeden sloupec
       stál na 360 px celou obrazovku (pruh nad výpisem 242 px místo 138,
       první nabídka až na 595 px z 844), takže se místo řady začal
       zkracovat nápis a řada zůstala dvousloupcová. Kolik nástrojů v řadě
       stojí, rozhodují DATA: „Schovat dražby po termínu" se vykreslí
       jen tehdy, když v nabídce opravdu nějaké jsou. Jsou-li nástroje
       tři, pod 360 px se z řady stane posuvný řádek s buňkami přes
       celou šířku; jsou-li dvě, zůstane dvousloupcový rastr jako nad
       ní. Naměřeno 27. 10. na 320 px: s dražbami dvojice 148 px proti
       nástrojům 304, bez nich 148 proti 148. Kontrola, která si
       pamatovala jen první případ, padala na rozdílu, který je záměr —
       očekávání se proto bere z DOM, ne z paměti. */
    const stejne = (a, b) => Math.abs(a.w - b.w) <= 1;

    /* POŘADÍ A ŠÍŘKY PODLE MAJITELE (30. 10., vyznačil je barvami do
       snímku a napsal k tomu: „doporučené buď úplně dole, pozemky po
       jednom buď úplně nahoře, uložené a stáhnout výběr bude
       uprostřed").
       Co tahle kontrola hlídala do té chvíle: že „Uložené" bere celý
       řádek samo a nástroje pod ním jsou půlky. To rozhodnutí majitel
       tímhle zrušil — „Uložené" má odteď řádek sdílet se „Stáhnout
       výběr". Pravidlo se proto přepsalo celé; staré znění by hlídalo
       stav, který si nikdo nepřeje.
       Měří se POLOHA, ne třídy: pořadí dělá `order` v mřížce, takže
       strom o něm nic neříká a číst z něj by nic nedokazovalo. */
    pravda(`${sirka} px: „Procházet po jednom" je úplně nahoře`,
      v.rychly.y < v.ulozene.y && v.rychly.y < v.vyvoz.y && v.rychly.y < v.razeni.y,
      `rychlý ${v.rychly.y} px, uložené ${v.ulozene.y} px, vývoz ${v.vyvoz.y} px, řazení ${v.razeni.y} px`);
    pravda(`${sirka} px: a bere celý řádek`,
      v.rychly.w > v.ulozene.w + 20,
      `„Procházet po jednom" ${v.rychly.w} px, „Uložené" ${v.ulozene.w} px`);
    pravda(`${sirka} px: „Uložené" i „Stáhnout výběr" stojí uprostřed`,
      v.ulozene.y > v.rychly.y && v.vyvoz.y > v.rychly.y
      && v.ulozene.y < v.razeni.y && v.vyvoz.y < v.razeni.y,
      `rychlý ${v.rychly.y}, uložené ${v.ulozene.y}, vývoz ${v.vyvoz.y}, řazení ${v.razeni.y} px`);
    /* ŘÁDKY UPROSTŘED SE DĚLÍ BEZE ZBYTKU — ať jsou nástroje dva, tři
       nebo čtyři. Nástroje se seskupí podle svislé polohy a od každého
       řádku se chce dvojí: kdo na něm stojí, má stejnou šířku, a ty
       šířky i s mezerami vyplní celý řádek (měří se podle „Procházet po
       jednom", který řádek bere celý). Tím se hlídá, že nikdo nezůstane
       trčet v půlce a nikomu nepřeteče okno. */
    const radky = [];
    for (const n of v.stred) {
      const r = radky.find((x) => Math.abs(x.y - n.y) <= 2);
      if (r) r.kusy.push(n); else radky.push({ y: n.y, kusy: [n] });
    }
    const krive = radky.filter((r) => {
      const sirky = r.kusy.map((k) => k.w);
      const nejvetsi = Math.max(...sirky), nejmensi = Math.min(...sirky);
      const soucet = sirky.reduce((a, b) => a + b, 0) + v.mezera * (r.kusy.length - 1);
      return nejvetsi - nejmensi > 1 || Math.abs(soucet - v.rychly.w) > 2;
    });
    pravda(`${sirka} px: a řádky nářadí se dělí beze zbytku (${radky.length})`,
      radky.length > 0 && krive.length === 0,
      krive.map((r) => r.kusy.map((k) => `${k.jm} ${k.w}`).join(' + ')
        + ` + mezery ${v.mezera * (r.kusy.length - 1)} proti řádku ${v.rychly.w} px`).join('; '));
    pravda(`${sirka} px: řazení („Doporučené") je úplně dole`,
      v.razeni.y > v.ulozene.y && v.razeni.y > v.vyvoz.y,
      `řazení ${v.razeni.y} px, dvojice na ${v.ulozene.y} px`);
    /* Majitel 30. 10.: „to řazení udělej stejně velké jako pozemky po
       jednom." Jsou to dva terče přes celý řádek na opačných koncích
       toho bloku; kdyby se jeden z nich zúžil, přestal by ten blok
       držet pohromadě.
       ZKOUŠEL JSEM TO 12. 11. ZÚŽIT na čtyři šestiny, aby se vedle něj
       vešel počet a ušetřil se řádek. Majitel to odmítl („to řazení
       udělej původní"), takže mez měří zase ŠÍŘKU i výšku. */
    pravda(`${sirka} px: a je stejně velké jako „Procházet po jednom"`,
      stejne(v.razeni, v.rychly) && Math.abs(v.razeni.h - v.rychly.h) <= 1,
      `řazení ${v.razeni.w}×${v.razeni.h} px, procházet ${v.rychly.w}×${v.rychly.h} px`);

    /* Nápis se nesmí vysypat z rámečku — to byl důvod, proč se pod
       360 px skládá do jednoho sloupce. */
    const vysyp = await p.evaluate(() => {
      const out = [];
      ['#map-fav', '#mc-rychly', '#mc-vyvoz'].forEach((s) => {
        const e = document.querySelector(s); if (!e) return;
        if (e.scrollWidth > e.clientWidth + 1) out.push(s + ': text ' + e.scrollWidth + ' px v ' + e.clientWidth + ' px');
      });
      return out;
    });
    pravda(`${sirka} px: žádný nápis neleze přes rámeček`, vysyp.length === 0, vysyp.join('; '));
    pravda(`${sirka} px: a stránkou nejde pohnout do stran`, !v.pretek, 'obsah je širší než okno');

    /* A TOTÉŽ PO HLEDÁNÍ OBCE — tam se objeví ovladač, který tahle
       kontrola do 1. 11. nikdy neviděla.
       Majitel poslal snímek z iPhonu po napsání „Praha": nápis
       „Zobrazit i podobné názvy (11" a konec za hranou obrazovky.
       Naměřeno 46 px přes rámeček na 390 px. Kontrola výš ho minula,
       protože se #mc-podobne ukazuje JEN po hledání obce, a ta se tu
       nedělala — ovladač prostě na stránce nebyl. Hledá se proto
       „Praha": je to největší počet podobných názvů v datech (110,
       tedy tříciferný), takže se měří nejdelší možný nápis. */
    await p.fill('#map-search', 'Praha');
    await p.waitForTimeout(1500);
    const poHledani = await p.evaluate(() => {
      const out = { chybi: [], vysyp: [], pretek: false, krizek: null };
      ['#mc-podobne', '#map-fav', '#mc-rychly', '#mc-vyvoz'].forEach((sel) => {
        const e = document.querySelector(sel);
        if (!e) { out.chybi.push(sel); return; }
        if (e.scrollWidth > e.clientWidth + 1) out.vysyp.push(sel + ': text ' + e.scrollWidth + ' px v ' + e.clientWidth + ' px');
      });
      out.pretek = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const x = document.getElementById('map-search-x');
      if (x && !x.hidden) {
        const r = x.getBoundingClientRect();
        out.krizek = { w: Math.round(r.width), h: Math.round(r.height) };
      }
      return out;
    });
    /* Bez tohohle by kontrola níž mohla projít nad stránkou, na které
       ten ovladač vůbec není — a hlásila by nula vysypaných nápisů. */
    pravda(`${sirka} px: po hledání „Praha" se objeví i „Podobné názvy"`,
      poHledani.chybi.indexOf('#mc-podobne') === -1, 'chybí: ' + poHledani.chybi.join(', '));
    pravda(`${sirka} px: a ani po hledání nelze nápis přes rámeček`,
      poHledani.vysyp.length === 0, poHledani.vysyp.join('; '));
    pravda(`${sirka} px: a stránkou pořád nejde pohnout do stran`, !poHledani.pretek,
      'obsah je po hledání širší než okno');
    /* Křížek, kterým se hledání ruší. Bez něj se napsaný text mazal
       písmenko po písmenku — odznaky pod polem ruší jen rozpoznané
       FILTRY, ne samotný text. */
    pravda(`${sirka} px: v poli hledání je křížek a unese prst (44 px)`,
      !!poHledani.krizek && poHledani.krizek.w >= 44 && poHledani.krizek.h >= 44,
      JSON.stringify(poHledani.krizek));
    /* A UKLIDIT PO SOBĚ. Do 10. 11. klepnutí do pole hledání na
       telefonu rozbalilo panel filtrů, což byla o 118 px vyšší
       stránka — a následující kontrola „řazení se při otevření
       nehne" to pak měřila jako skok o 118 px. Rozbalování je pryč
       (schovávalo filtry, viz scripts/test-filtry-radek.mjs), takže
       se po sobě uklízí jen to, co zbylo: prázdné pole, žádný
       otevřený panel skupiny, zaměření pryč. */
    await p.fill('#map-search', '');
    await p.evaluate(() => {
      const i = document.getElementById('map-search');
      if (i && i.blur) i.blur();
      document.querySelectorAll('details.mf').forEach((d) => { d.open = false; });
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(1200);
    const poUklidu = await p.evaluate(() => ({
      otevrenePanely: [...document.querySelectorAll('details.mf')].filter((d) => d.open).length,
      podobne: !!document.getElementById('mc-podobne'),
      hodnota: (document.getElementById('map-search') || {}).value,
    }));
    pravda(`${sirka} px: a po vymazání je stránka zpátky v původním stavu`,
      poUklidu.otevrenePanely === 0 && poUklidu.podobne === false && !poUklidu.hodnota,
      JSON.stringify(poUklidu));

    /* OKRAJ OD HRANY OBRAZOVKY. Vyfoceno 27. 10.: pruh s hledáním a
       přepínačem Seznam/Mapa stál 8 px od hrany, kdežto zbytek stránky
       dýchá 20 px (--okraj-stranky). Na fotce to vypadalo, jako by
       ovládání vypadávalo z webu. Naměřeno při hledání správné míry:
       na 20 px už se „Stáhnout výběr" na 390 px nevejde do rámečku
       (171 px textu v 169 px), proto 16 px — dost na to, aby pruh
       nedrhl o hranu, a pořád se vším, co se má vejít. */
    /* MĚŘÍ SE TLAČÍTKA, NE OBAL KOLEM NICH. Stálo tu
       `.ms-vysledky .msv-ovladani` — jenže ten obal má od 30. 10.
       `display:contents`, tedy žádnou vlastní krabici, a prohlížeč
       u něj vrací obdélník přes celou šířku okna: naměřeno
       {vlevo: 0, vpravo: 390}, takže kontrola hlásila „drhne o hranu"
       o prvku, který se nekreslí. Ptá se proto na to, co je opravdu
       vidět — na krajní tlačítka v té řadě. */
    const okraje = await p.evaluate(() => {
      const out = {};
      [['hledání', '.mcp-hledani'], ['Procházet po jednom', '#mc-rychly'],
       ['Uložené', '#map-fav'], ['Stáhnout výběr', '#mc-vyvoz'],
       ['řazení', '.ms-vysledky > .cdd > .cdd-btn']].forEach(([jm, sel]) => {
        const e = document.querySelector(sel); if (!e) return;
        const r = e.getBoundingClientRect();
        out[jm] = { vlevo: Math.round(r.left), vpravo: Math.round(document.documentElement.clientWidth - r.right) };
      });
      return out;
    });
    const klice = Object.keys(okraje);
    // PŘEDPOKLAD: bez naměřených okrajů by kontrola níž prošla naprázdno
    pravda(`${sirka} px: okraje ovládání se naměřily`, klice.length === 5, JSON.stringify(okraje));
    /* U dvojice uprostřed se měří jen ta hrana, která k okraji
       obrazovky opravdu míří: „Uložené" má vlevo kraj řádku a vpravo
       mezeru k sousedovi, „Stáhnout výběr" obráceně. Žádat 16 px na
       obou stranách by znamenalo žádat, ať se ty dvě nedotýkají ani
       uprostřed — a to je ten rastr, který si majitel přál. */
    const jenVlevo = { 'Uložené': 1 };
    const jenVpravo = { 'Stáhnout výběr': 1 };
    const tesne = klice.filter((k) => (!jenVpravo[k] && okraje[k].vlevo < 16)
      || (!jenVlevo[k] && okraje[k].vpravo < 16));
    pravda(`${sirka} px: ovládání nedrhne o hranu obrazovky (aspoň 16 px)`, tesne.length === 0,
      tesne.map((k) => k + ' ' + JSON.stringify(okraje[k])).join('; '));

    /* 1. ZNAČKA U KAŽDÉHO. Nula se počítá jako „není“ — v CSS to tak
       dlouho vypadalo, že tam je, a na obrazovce nebylo nic. */
    const bezZnacky = Object.keys(z.znacky).filter((k) => !z.znacky[k] || z.znacky[k].w < 12 || z.znacky[k].h < 12);
    pravda(`${sirka} px: každý ovladač má svou značku`, bezZnacky.length === 0,
      'bez značky: ' + bezZnacky.map((k) => k + '=' + JSON.stringify(z.znacky[k])).join(', '));
    /* A značky jsou stejně velké. Tři různě velké obrázky v jedné řadě
       jsou táž nejednotnost jako tři různě velká políčka. */
    const miry = [...new Set(Object.values(z.znacky).filter(Boolean).map((x) => x.w + 'x' + x.h))];
    pravda(`${sirka} px: a všechny značky mají tutéž míru`, miry.length === 1,
      'míry: ' + miry.join(', '));

    /* 2. JEDNA SESTAVA, JEDNA PLOCHA.
       OBRÁCENÉ PRAVIDLO PROTI PŮVODNÍMU, A JE TO ZMĚNA ROZHODNUTÍ, NE
       ÚSTUP. Do 11. 11. se tu žádalo, aby „Procházet po jednom" mělo
       JINOU plochu než sousedé — byla to tehdy „hlavní akce výpisu"
       a nesla sytou zeleň. Jenže od té doby stojí 140 px nad ní
       opravdová hlavní akce nástroje, tlačítko „Zobrazit N
       nemovitostí" v liště filtrů, a taky sytě zelená: na telefonu
       tak byly na jedné obrazovce dvě plné zelené plochy pod sebou
       (naměřeno 11. 11. na 390 px: y 349 a y 489), což znamená, že
       hlavní není ani jedna.
       Role se přitom liší: „Zobrazit N" POUŽIJE FILTRY a pošle
       člověka na výsledky, „Procházet po jednom" jen přepne ZPŮSOB
       ČTENÍ hotového výpisu — stejně jako „Uložené" a „Stáhnout
       výběr". Měří se proto, že všechna tři tlačítka té sestavy mají
       TUTÉŽ plochu; zeleň zůstává jediné hlavní akci. */
    pravda(`${sirka} px: ovladače výpisu mají jednu plochu`,
      !!z.plochy.rychly && z.plochy.rychly === z.plochy.vyvoz && z.plochy.rychly === z.plochy.ulozene,
      `rychlý ${z.plochy.rychly}, vývoz ${z.plochy.vyvoz}, uložené ${z.plochy.ulozene}`);
    /* A TA SESTAVA MUSÍ BÝT VIDĚT — jen už ne výplní.
       ZMĚNA ROZHODNUTÍ, NE POVOLENÁ MEZ. Do 12. 11. se tu žádala
       „plná barva, ne průhledno", a důvod byl správný: průhledné
       pozadí se shoduje s průhledným pozadím, takže kontrola „všechny
       tři mají tutéž plochu" by prošla i tehdy, kdyby nebylo vidět
       vůbec nic. Pak přišlo majitelovo zadání („náš web má všude
       extrémně moc oddělení"), ovládání nad výpisem přišlo o desky,
       přelivy i stíny a plochu dostalo --plocha-jemna, tedy
       rgba(16,21,19,0.05) — a hlídač spadl na vlastním receptu.
       Znamení „jsem ovladač" ale nezmizelo, jen se přesunulo: nese ho
       OBRYS. Měří se proto obrys, ne výplň: musí mít nenulovou šířku
       a nesmí být průhledný. Že má proti ploše pod sebou aspoň 3 : 1,
       jak žádá WCAG 1.4.11, hlídá test-okraje — tady by to byla druhá
       kopie téhož měření. Právě ta mez v test-okraje je taky důvod,
       proč se obrys nedá nahradit světlou výplní: --plocha-jemna má
       na bílé 1,11 : 1. */
    for (const [jm, o] of [['Procházet po jednom', z.obrysy.rychly],
      ['Stáhnout výběr', z.obrysy.vyvoz], ['Uložené', z.obrysy.ulozene]]) {
      pravda(`${sirka} px: „${jm}" je vidět — má obrys`,
        !!o && o.sirka > 0 && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(o.barva)
          && o.barva !== 'transparent',
        o ? `obrys ${o.sirka} px ${o.barva}` : 'ovladač se nenašel');
    }

    /* 3. NÁPIS V POLI HLEDÁNÍ. */
    pravda(`${sirka} px: nápis v poli hledání se vejde celý`, z.napis > 0 && z.napis <= z.vnitrni,
      `nápis ${z.napis} px, místo ${z.vnitrni} px`);

    /* 3b. PŘELIV, KTERÝ JE V CSS, MUSÍ BÝT I NA OBRAZOVCE.
       Tohle je hlídač jedné konkrétní, draze zaplacené chyby. Pás
       s hledáním dostal 30. 10. přeliv hloubky a já ho třikrát za
       sebou zesiloval (0,08 → 0,13 → 0,30), protože majitel po
       každém kole napsal „vypadá to úplně stejně". Měl pokaždé
       doslova pravdu: o dva a půl tisíce řádků níž stálo
       `.map-controls-panel{…background:var(--pas-plocha)}` a zkratka
       `background` přepisuje i `background-image` na `none`. Přeliv
       se tedy nevykreslil ANI JEDNOU a já pořád měnil hodnotu, kterou
       prohlížeč zahazoval. Číst jen stylopis na to nestačí — tam ten
       přeliv celou dobu BYL. Měří se proto vypočtený styl v prohlížeči.
       Sám pás přeliv 31. 10. ztratil — majitel chtěl vršek celý bílý
       (§266) — a tak se u něj hlídá opak: plná bílá a žádný obrázek.
       Hlídač té chyby to drží dál, jen z druhé strany: pokud se do
       pásu přeliv vrátí, padne to tady. */
    /* 3a2. JEDNÍM HLASEM SE ZBYTKEM WEBU.
       Majitel 31. 10. poslal vedle sebe snímek výpisu, stránky pozemku
       a vršku úvodu: „koukni, jak vypadá zbytek webu oproti tomu
       začátku, musíš to sladit." Měřitelně se to lišilo ve dvou
       věcech — tlačítka nad výpisem mluvila 13 px, kdežto tlačítka
       jinde na webu 16 px, a popisek řazení byl jediný text na celé
       stránce psaný verzálkami s prokladem (dlaždice na stránce
       pozemku i doplňková čísla na kartě píšou popisek 14 px / 500).
       Pod 360 px smí drobnopis zůstat: půl řádku tam měří 140 px. */
    const hlas = await p.evaluate(() => {
      const c = (s) => { const e = document.querySelector(s); if (!e) return null;
        const st = getComputedStyle(e);
        return { px: Math.round(parseFloat(st.fontSize)), vaha: st.fontWeight,
          verzalky: st.textTransform, barva: st.color }; };
      return { rychly: c('#mc-rychly'), vyvoz: c('#mc-vyvoz'), ulozene: c('#map-fav'),
        hodnota: c('.ms-vysledky > .cdd > .cdd-btn .cdd-lbl'), popisek: c('.ms-vysledky > .cdd > .cdd-btn .cdd-k') };
    });
    if (sirka > 360) {
      const velikosti = [hlas.rychly, hlas.vyvoz, hlas.ulozene, hlas.hodnota]
        .filter(Boolean).map((x) => x.px);
      pravda(`${sirka} px: ovladače mluví 16 px jako tlačítka jinde na webu`,
        velikosti.length === 4 && velikosti.every((x) => x === 16),
        'naměřeno: ' + velikosti.join(', '));
    }
    pravda(`${sirka} px: popisek řazení není psaný verzálkami`,
      !!hlas.popisek && hlas.popisek.verzalky !== 'uppercase',
      hlas.popisek ? `text-transform: ${hlas.popisek.verzalky}` : 'popisek se nenašel');
    pravda(`${sirka} px: a je to popisek téže váhy jako u dlaždic (14 px / 500)`,
      !!hlas.popisek && hlas.popisek.px === 14 && hlas.popisek.vaha === '500',
      hlas.popisek ? `${hlas.popisek.px} px / ${hlas.popisek.vaha}` : 'popisek se nenašel');

    /* 3a3. PŘEPNUTÍ SEZNAM/MAPA STRÁNKOU NEHÝBE.
       Majitel 31. 10.: „když přepínám mezi seznamem a mapou, mapa se
       hne dolů, ať zůstane na stejném levelu jako seznam." Byly to
       dvě věci naráz: po klepnutí se k mapě odrolovalo (naměřeno
       posunutí o 128 px, takže zmizel i přepínač, na který člověk
       zrovna klepl) a mapa navíc začínala o 16 px výš než první
       ovladač výpisu. Obojí je pryč; tady se měří výsledek. */
    const prep = await p.evaluate(async () => {
      const y = (sel) => { const e = document.querySelector(sel);
        return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 120));
      const predY = y('.ms-vysledky'), predScroll = Math.round(window.scrollY);
      const naMapu = document.querySelector('.mvt-btn[data-mv="mapa"]');
      if (!naMapu) return null;
      naMapu.click();
      await new Promise((r) => setTimeout(r, 900));
      const mapaY = y('.map-holder'), poScroll = Math.round(window.scrollY);
      const zpet = document.querySelector('.mvt-btn[data-mv="seznam"]');
      if (zpet) zpet.click();
      await new Promise((r) => setTimeout(r, 500));
      return { predY, mapaY, predScroll, poScroll, zpetScroll: Math.round(window.scrollY) };
    });
    pravda(`${sirka} px: mapa začíná tam, kde začínal výpis`,
      !!prep && prep.predY !== null && prep.mapaY !== null
        && Math.abs(prep.mapaY - prep.predY) <= 2,
      prep ? `výpis začínal na ${prep.predY} px, mapa na ${prep.mapaY} px` : 'přepínač se nenašel');
    pravda(`${sirka} px: a přepnutí stránkou neposune`,
      !!prep && prep.poScroll === prep.predScroll && prep.zpetScroll === prep.predScroll,
      prep ? `před ${prep.predScroll}, na mapě ${prep.poScroll}, zpět ${prep.zpetScroll}` : '');

    /* KONTROLA PŘELIVU NA „.mc-rychly" TU STÁLA DO 12. 11.
       Žádala `gradient(` v background-image a hlásila „přebila ho
       zkratka background někde níž v souboru". Vznikla pro §180
       („ovládání nad výpisem oživit: přelivy, stíny a barva jako na
       kartách") a zdůvodnění jí zaniklo celé: majitel na snímku
       ukázal, že oddělení je na webu příliš, a ovládání nad výpisem
       přelivy, stíny ani desky od té doby nemá — stejně jako zanikla
       položka pro tyhle ovladače v registru PRELIVY v test-soustava.
       Hlídač, který žádá vzhled, jaký web nemá, není mez, ale past.
       Co dávala navíc technicky — že pozdější zkratka `background`
       nepřebije dřívější `background-image` — měří pro celý stylopis
       test-mrtve-styly, a to na všech pravidlech, ne jen na tomhle
       jednom. */
    const pasBily = await p.evaluate(() => {
      const e = document.querySelector('.map-controls-panel'); if (!e) return null;
      const s = getComputedStyle(e);
      return { barva: s.backgroundColor, obraz: s.backgroundImage || 'none' };
    });
    pravda(`${sirka} px: pás s hledáním je celý bílý`,
      !!pasBily && pasBily.barva === 'rgb(255, 255, 255)' && pasBily.obraz === 'none',
      pasBily ? `barva ${pasBily.barva}, obrázek ${pasBily.obraz.slice(0, 60)}` : 'pás se nenašel');

    /* 3b1. PÁS S HLEDÁNÍM NENÍ KRABICE V KRABICI (§278).
       Majitel 31. 10. s fotkou vršku stránky: „to vyhledávání má být
       úplně na jiném levelu, začátek vypadá jak aplikace z GTA."
       Měřitelně to byly TŘI plochy na sobě: bílý pás, v něm bílá
       deska se stínem a v ní dvě zapuštěná šedá koryta (pole
       a přepínač). Zůstaly dva ovladače z téhož materiálu položené
       rovnou na pás — a tohle je hlídá:
         1. sám pás žádnou desku nenese (bez výplně, bez rámu, bez stínu),
         2. pole a přepínač mají TUTÉŽ plochu i tutéž linku.
       Druhý bod je ten důležitější: dva ovladače vedle sebe, každý
       z jiného materiálu, jsou přesně to, co vypadalo lacině. */
    const pas = await p.evaluate(() => {
      const st = (sel) => { const e = document.querySelector(sel); if (!e) return null;
        const c = getComputedStyle(e);
        return { plocha: c.backgroundColor, obrys: c.borderTopColor, siraObrysu: c.borderTopWidth,
          stin: c.boxShadow === 'none' ? '' : c.boxShadow, obrazek: c.backgroundImage };
      };
      const vnitrni = (x) => (x.stin || '').indexOf('inset') >= 0;
      const o = st('.mcp-hledani'), pole = st('.mcp-hledani #map-search'), prep = st('.mcp-hledani .mv-toggle');
      return { obal: o, pole, prep, prepVnitrni: prep ? vnitrni(prep) : false };
    });
    const bezVyplne = (x) => !!x && (x.plocha === 'rgba(0, 0, 0, 0)' || x.plocha === 'transparent');
    pravda(`${sirka} px: pás s hledáním sám není deska`,
      bezVyplne(pas.obal) && pas.obal.siraObrysu === '0px' && !pas.obal.stin,
      `plocha ${pas.obal && pas.obal.plocha}, rám ${pas.obal && pas.obal.siraObrysu}, stín ${(pas.obal && pas.obal.stin) || 'žádný'}`);
    pravda(`${sirka} px: a pole s přepínačem jsou z téhož materiálu`,
      !!pas.pole && !!pas.prep && pas.pole.plocha === pas.prep.plocha
        && (pas.pole.obrys === pas.prep.obrys || pas.prepVnitrni),
      `pole ${pas.pole && pas.pole.plocha} / ${pas.pole && pas.pole.obrys}, přepínač ${pas.prep && pas.prep.plocha} / ${pas.prep && pas.prep.stin}`);

    /* 3c. ŘAZENÍ SE OTEVŘE NA MÍSTĚ — A NIC JINÉHO SE NEHNE.
       Tahle kontrola měla starší podobu a hlídala OBCHÁZKU: volba
       bydlela v panelu filtrů a tlačítko nad výpisem byla jen atrapa,
       která ten panel otevírala. Žádalo se tedy, aby klepnutí
       rozbalilo blok filtrů (třída `hledani-rozbalene`) a aby se
       seznam po skoku scrollem vešel do okna.
       31. 10. to majitel poslal vyfocené z druhé strany: „proč tam
       toto zůstává, když rozkliknu filtr, ať je to pryč, a navíc se to
       seká a rozklikává dvě tabulky." Naměřeno na 390 px s otevřeným
       panelem: řazení stálo dvakrát (v panelu na 1 497 px, atrapa na
       1 833 px) a jedno klepnutí hýbalo třemi věcmi — rozbalilo
       hledání, otevřelo blok filtrů a skočilo scrollem o 493 px.
       (Rozbalování hledání je od 10. 11. pryč celé; „blok filtrů"
       jsou teď panely jednotlivých skupin, žádný z nich se otevírat
       nemá.)
       Ovladač je od té doby jediný a skutečný, takže se žádá OPAK:
         1. v panelu filtrů řazení NENÍ (jediný #map-sort na stránce),
         2. klepnutí otevře seznam voleb,
         3. stránka se při tom neposune a ovladač nezůstane stát jinde,
         4. blok filtrů se neotevře,
         5. seznam je celý vidět v okně.
       Body 3 a 4 jsou to, co majitel popsal jako „seká se a rozklikává
       dvě tabulky"; bez nich by prošla i ta stará obchůzka. */
    const razPred = await p.evaluate(() => {
      const b = document.querySelector('.ms-vysledky > .cdd > .cdd-btn');
      return { y: Math.round(window.scrollY),
        t: b ? Math.round(b.getBoundingClientRect().top) : null,
        kolik: document.querySelectorAll('#map-sort').length,
        vPanelu: !!document.querySelector('#ms-filters #map-sort') };
    });
    pravda(`${sirka} px: řazení je na stránce jen jednou, a ne v panelu filtrů`,
      razPred.kolik === 1 && !razPred.vPanelu,
      `#map-sort ${razPred.kolik}x, v panelu filtrů: ${razPred.vPanelu ? 'ANO' : 'ne'}`);
    await p.evaluate(() => {
      const e = document.querySelector('.ms-vysledky > .cdd > .cdd-btn'); if (e) e.click();
    });
    await p.waitForTimeout(900);
    const raz = await p.evaluate(() => {
      const sel = document.getElementById('map-sort');
      const obal = sel && sel.closest ? sel.closest('.cdd') : null;
      const btn = obal ? obal.querySelector('.cdd-btn') : null;
      const pid = btn ? (btn.getAttribute('aria-controls') || '') : '';
      const pan = pid ? document.getElementById(pid) : null;
      const r = pan ? pan.getBoundingClientRect() : null;
      return {
        filtrOtevren: [...document.querySelectorAll('details.mf')].some((d) => d.open),
        otevreno: !!pan && getComputedStyle(pan).display !== 'none',
        voleb: pan ? pan.querySelectorAll('.cdd-opt').length : 0,
        y: Math.round(window.scrollY),
        t: btn ? Math.round(btn.getBoundingClientRect().top) : null,
        vOkne: !!r && r.height > 40 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
        kde: r ? `${Math.round(r.top)}-${Math.round(r.bottom)} px v okně ${window.innerHeight}` : 'bez panelu',
      };
    });
    pravda(`${sirka} px: klepnutí na řazení otevře seznam voleb`,
      raz.otevreno && raz.voleb >= 5,
      `panel ${raz.otevreno ? 'otevřen' : 'zavřený'}, voleb ${raz.voleb}`);
    pravda(`${sirka} px: a stránka ani ovladač se při tom nehnou`,
      raz.y === razPred.y && raz.t !== null && Math.abs(raz.t - razPred.t) <= 1,
      `scrollY ${razPred.y} na ${raz.y}, ovladač ${razPred.t} na ${raz.t} px`);
    pravda(`${sirka} px: a panel filtrů zůstane zavřený`,
      !raz.filtrOtevren,
      `některý panel skupiny je ${raz.filtrOtevren ? 'otevřený' : 'zavřený'}`);
    pravda(`${sirka} px: a ten seznam je celý vidět v okně`, raz.vOkne, raz.kde);
    /* Zavřít, ať následující měření nekoukají do rozbaleného seznamu. */
    await p.evaluate(() => {
      document.body.click();
      document.querySelectorAll('details.mf').forEach((d) => { d.open = false; });
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(500);

    /* 4. PŘEPÍNAČ SEZNAM/MAPA JE JEDEN OVLADAČ SE DVĚMA POLOHAMI.
       Od 30. 10. jezdí po zapuštěné dráze jezdec (`.mv-toggle::before`)
       a zapnutá polovina si TOTÉŽ pole kreslí i sama pod sebe — kvůli
       kontrastu, aby byl bílý nápis čitelný i kdyby se jezdec
       nevykreslil. Dvě plochy na jednom místě se ale musí krýt na
       pixel, jinak zpod jezdce vykoukne zelený proužek. Měří se obojí,
       a v OBOU polohách, protože jezdec se posouvá a plocha ne. */
    const jezdec = async () => p.evaluate(() => {
      const t = document.querySelector('.mv-toggle');
      const a = document.querySelector('.mvt-btn.active');
      if (!t || !a) return null;
      const cs = getComputedStyle(t, '::before');
      const as = getComputedStyle(a);
      const tr = t.getBoundingClientRect(), ar = a.getBoundingClientRect();
      const ram = parseFloat(as.borderLeftWidth) || 0;
      const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
      const l = tr.left + (parseFloat(cs.left) || 0) + m.m41;
      return {
        kdo: (a.getAttribute('data-mv') || ''),
        jezdecL: Math.round(l), jezdecP: Math.round(l + (parseFloat(cs.width) || 0)),
        plochaL: Math.round(ar.left + ram), plochaP: Math.round(ar.right - ram),
        barva: as.backgroundColor,
      };
    });
    for (const pohled of ['seznam', 'mapa']) {
      if (pohled === 'mapa') {
        await p.evaluate(() => { const e = document.querySelector('.mvt-btn[data-mv="mapa"]'); if (e) e.click(); });
        await p.waitForTimeout(600);
      }
      const j = await jezdec();
      pravda(`${sirka} px: přepínač má v poloze „${pohled}" co měřit`, !!j && j.kdo === pohled,
        j ? `zapnuto je „${j.kdo}"` : 'přepínač ani jezdec se nenašly');
      if (!j) continue;
      pravda(`${sirka} px: jezdec leží přesně pod zapnutou polovinou („${pohled}")`,
        Math.abs(j.jezdecL - j.plochaL) <= 1 && Math.abs(j.jezdecP - j.plochaP) <= 1,
        `jezdec ${j.jezdecL}–${j.jezdecP} px, plocha ${j.plochaL}–${j.plochaP} px`);
      /* Plná barva, ne průhledno: průhledná plocha by znamenala, že
         bílý nápis stojí na zapuštěné dráze a nepřečte se. */
      pravda(`${sirka} px: a zapnutá polovina nese plnou plochu („${pohled}")`,
        /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(j.barva || ''), `plocha ${j.barva}`);
    }
    await ctx.close();
  }
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
