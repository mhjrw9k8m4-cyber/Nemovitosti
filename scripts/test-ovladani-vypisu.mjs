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
        /* Ovladač řazení nad výpisem — ten, ze kterého se 30. 10. stal
           nadpis „Doporučené" (§248). Hlídá se jeho poloha: majitel ho
           chce úplně dole. */
        razeni: q('#mc-razeni'),
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
    pravda(`${sirka} px: „Uložené" a „Stáhnout výběr" stojí uprostřed vedle sebe`,
      Math.abs(v.ulozene.y - v.vyvoz.y) <= 2 && stejne(v.ulozene, v.vyvoz),
      `uložené ${v.ulozene.y} px / ${v.ulozene.w} px, vývoz ${v.vyvoz.y} px / ${v.vyvoz.w} px`);
    pravda(`${sirka} px: a dělí se o řádek beze zbytku`,
      Math.abs(v.ulozene.w + v.vyvoz.w + v.mezera - v.rychly.w) <= 2,
      `${v.ulozene.w} + ${v.vyvoz.w} + mezera ${v.mezera} proti řádku ${v.rychly.w} px`);
    pravda(`${sirka} px: řazení („Doporučené") je úplně dole`,
      v.razeni.y > v.ulozene.y && v.razeni.y > v.vyvoz.y,
      `řazení ${v.razeni.y} px, dvojice na ${v.ulozene.y} px`);
    /* Majitel 30. 10.: „to řazení udělej stejně velké jako pozemky po
       jednom." Jsou to dva terče přes celý řádek na opačných koncích
       toho bloku; kdyby se jeden z nich zúžil, přestal by ten blok
       držet pohromadě. */
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
       ['řazení', '#mc-razeni']].forEach(([jm, sel]) => {
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

    /* 2. HLAVNÍ AKCE SE POZNÁ BEZ ČTENÍ. */
    pravda(`${sirka} px: „Procházet po jednom" má jinou plochu než sousedé`,
      !!z.plochy.rychly && z.plochy.rychly !== z.plochy.vyvoz && z.plochy.rychly !== z.plochy.ulozene,
      `rychlý ${z.plochy.rychly}, vývoz ${z.plochy.vyvoz}, uložené ${z.plochy.ulozene}`);
    /* Plná plocha, ne průhledná — průhledné pozadí by se „lišilo" taky,
       a přitom by nebylo vidět vůbec nic. */
    const plny = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(z.plochy.rychly || '');
    pravda(`${sirka} px: a ta plocha je plná barva, ne průhledno`, plny, 'plocha: ' + z.plochy.rychly);

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
       přeliv celou dobu BYL. Měří se proto vypočtený styl v prohlížeči. */
    const prelivy = await p.evaluate(() => ['.map-controls-panel', '.mc-rychly'].map((sel) => {
      const e = document.querySelector(sel);
      return { sel, je: !!e, obraz: e ? (getComputedStyle(e).backgroundImage || 'none') : 'nenašel se' };
    }));
    for (const x of prelivy) {
      pravda(`${sirka} px: přeliv na „${x.sel}" se opravdu vykresluje`,
        x.je && /gradient\(/.test(x.obraz),
        x.je ? `background-image je „${x.obraz.slice(0, 60)}" — přebila ho zkratka background někde níž v souboru`
             : 'prvek se na stránce nenašel');
    }

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
