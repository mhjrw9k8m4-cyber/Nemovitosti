/* Test: pozná robot, že jeden zdroj tiše přestal nosit data?
 *
 * Spuštění: node scripts/test-hlidac-zdroju.mjs
 *
 * PROČ TAHLE ZKOUŠKA EXISTUJE. Pojistka proti „utržení" dat hlídá SOUČET:
 * když se stáhne míň než 60 % minula, běh skončí chybou a stará data
 * zůstanou. Jenže tišší případ projde: zdroj změní podobu stránky, parser
 * přestane cokoli najít — a protože odpověděl, zapíše se jako „ok,
 * 0 záznamů". U OK dražeb je to 95 nabídek z 2 400, tedy pokles o 4 %:
 * součtová pojistka mlčí a web prostě přestane ukazovat nové dražby
 * z toho portálu. Nikde se to nedozvíme a nikdo si nestěžuje, protože
 * chybějící nabídku nikdo nevidí.
 *
 * Hlídá se obojí: že se propad POZNÁ, a že se nehlásí tam, kde by to
 * bylo plané — malý zdroj kolísá sám od sebe a nový zdroj nemá s čím
 * se porovnat.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { porovnejZdroje, PRAH_SLEDOVANI, PRAH_PROPADU,
  porovnejSHistorii, zapisDoHistorie, DNU_HISTORIE, PRAH_POKLESU, HISTORIE_MAX,
  skenNeuplny, oznacNeuplne, PODIL_SELHANI, MIN_SELHANI,
  nejvyssiOkdZDat, nejnizsiOkdZDat, oknoOkd, OKD_OKNO, OKD_OKNO_STROP } from './fetch-opportunities.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN_H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const MINULE = [
  { nazev: 'Bezrealitky', pocet: 1785 },
  { nazev: 'OK dražby', pocet: 95 },
  { nazev: 'Dražby', pocet: 90 },
  { nazev: 'Farmy', pocet: 7 },      // pod prahem sledování
];
const najdi = (n, ted) => porovnejZdroje(MINULE, ted).find((x) => x.nazev === n) || null;

/* Pojistka proti bezzubosti: prahy musí dávat smysl, jinak by všechno
   pod tím platilo o jiných číslech, než jaká se zkoušejí. */
pravda('práh sledování je nad velikostí malého zdroje', PRAH_SLEDOVANI > 7 && PRAH_SLEDOVANI < 90,
  `práh ${PRAH_SLEDOVANI}`);
pravda('a práh propadu je zlomek, ne procento', PRAH_PROPADU > 0 && PRAH_PROPADU < 1, `${PRAH_PROPADU}`);

pravda('beze změny se nehlásí nic',
  porovnejZdroje(MINULE, [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 1790 },
    { nazev: 'OK dražby', stav: 'ok', pocet: 98 }]).length === 0);

{
  const n = najdi('OK dražby', [{ nazev: 'OK dražby', stav: 'ok', pocet: 0 }]);
  pravda('zdroj, který odpověděl a nepřinesl nic, se pozná jako „prázdno"',
    n && n.druh === 'prazdno', JSON.stringify(n));
}
{
  const n = najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 600 }]);
  pravda('propad na třetinu se pozná', n && n.druh === 'propad', JSON.stringify(n));
}
{
  const tesne = Math.ceil(1785 * PRAH_PROPADU) + 1;
  pravda('ale pokles těsně nad prahem se nehlásí (zdroje kolísají)',
    najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: tesne }]) === null,
    `při ${tesne} z 1785`);
}
/* ZDROJ, KTERÝ VÍC ZAHODÍ NEŽ PŘINESE. Tohle síto v kódu je, ale nikdy
   se nezkoušelo: parser, kterému se změní tvar stránky, často nespadne
   — jen mu většina nabídek propadne na kontrole a součet zůstane
   „v pořádku". Hlídá se obojí: že se to pozná, a že se to nehlásí
   u zdroje, který zahodí jen několik kusů (to je normální provoz). */
{
  const n = najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 1000, preskoceno: 1200 }]);
  pravda('zdroj, který víc zahodí než přinese, se pozná',
    n && n.druh === 'zahazuje' && n.preskoceno === 1200, JSON.stringify(n));
}
{
  const n = najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 1700, preskoceno: 80 }]);
  pravda('ale pár zahozených kusů se nehlásí', n === null, JSON.stringify(n));
}
{
  /* Pořadí sít: propad je vážnější nález a nemá ho přebít zahazování. */
  const n = najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 300, preskoceno: 900 }]);
  pravda('a když zdroj zároveň propadl, hlásí se propad (vážnější nález)',
    n && n.druh === 'propad', JSON.stringify(n));
}
pravda('malý zdroj se nehlídá — kolísá sám od sebe',
  najdi('Farmy', [{ nazev: 'Farmy', stav: 'ok', pocet: 0 }]) === null);
pravda('nový zdroj se nemá s čím porovnat, a tak se nehlásí',
  najdi('Sreality', [{ nazev: 'Sreality', stav: 'ok', pocet: 0 }]) === null);
/* Chybu a vypnutí hlásí stav sám — hlídač by je hlásil podruhé. */
pravda('zdroj, který ohlásil chybu, hlídač nehlásí znovu',
  najdi('Dražby', [{ nazev: 'Dražby', stav: 'chyba', pocet: 0 }]) === null);
pravda('a vypnutý zdroj taky ne',
  najdi('Dražby', [{ nazev: 'Dražby', stav: 'vypnuto', pocet: 0 }]) === null);
/* První běh: žádná minulá čísla. Nesmí spadnout ani nic nahlásit. */
pravda('první běh bez minulých čísel projde tiše',
  porovnejZdroje(null, [{ nazev: 'Cokoli', stav: 'ok', pocet: 0 }]).length === 0);

/* ===== A TO POMALÉ VYKRVÁCENÍ ======================================
   Porovnání s MINULÝM během chytí skok. Zdroj, který ubývá po
   kouscích, ne: při 10 % za běh a čtyřech bězích denně je za necelé
   dva dny na polovině a ani jeden krok nepřekročí PRAH_PROPADU.
   Druhé síto porovnává dnešek s MEDIÁNEM posledních dnů. */
{
  const den = (i) => '2026-10-' + String(i).padStart(2, '0');
  const historie = (pocty) => {
    const dny = {};
    pocty.forEach((p, i) => { dny[den(i + 1)] = { Portál: p }; });
    return { verze: 1, dny };
  };
  const dnes = den(9);
  const ted = (p) => [{ nazev: 'Portál', stav: 'ok', pocet: p }];
  const stabilni = historie([100, 100, 100, 100, 100, 100, 100, 100]);

  pravda(`prah poklesu je ${PRAH_POKLESU} × medián až ${DNU_HISTORIE} dnů`,
    PRAH_POKLESU === 0.7 && DNU_HISTORIE === HISTORIE_MAX);
  pravda('běžné kolísání se nehlásí (95 proti mediánu 100)',
    porovnejSHistorii(stabilni, ted(95), dnes).length === 0);
  pravda('pokles na 69 % se hlásí', (() => {
    const n = porovnejSHistorii(stabilni, ted(69), dnes);
    return n.length === 1 && n[0].druh === 'pokles' && n[0].median === 100 && n[0].ted === 69;
  })());
  pravda('pokles na 71 % ještě ne (mez platí z obou stran)',
    porovnejSHistorii(stabilni, ted(71), dnes).length === 0);

  /* TOHLE JE TEN PŘÍPAD, KVŮLI KTERÉMU TO VZNIKLO. Žádný krok není
     propad, a přesto je zdroj na 59 % toho, co nosil. */
  const vykrvaceni = historie([100, 95, 90, 86, 81, 77, 73, 70]);
  pravda('pomalé vykrvácení po ~5 % na krok: minulý běh mlčí',
    porovnejZdroje([{ nazev: 'Portál', pocet: 70 }], ted(66)).length === 0);
  /* A TOHLE JE DŮVOD, PROČ JE OKNO DLOUHÉ. Se sedmidenním oknem
     tahle kontrola NEPROŠLA: medián klesal s daty (z 8 dnů vyšel 81)
     a 59 nad 0,7 × 81 projde. S dlouhým oknem je medián 86 a 59
     spadne pod mez. */
  pravda('ale medián delšího okna ho pozná', (() => {
    const n = porovnejSHistorii(vykrvaceni, ted(59), dnes);
    return n.length === 1 && n[0].druh === 'pokles';
  })(), 'krátké okno klesá s daty a vykrvácení nepozná');

  /* Plané poplachy. Krátká historie, malý zdroj a zdroj, který dnes
     nedojel, se nehlásí — jinak by hlídač křičel po každém výpadku. */
  pravda('ze čtyř dnů se medián nepočítá',
    porovnejSHistorii(historie([100, 100, 100, 100]), ted(10), dnes).length === 0);
  /* A TOTÉŽ, ALE Z JINÉ STRANY. Historie může mít dnů dost a přesto
     o TOMHLE zdroji vědět málo — zdroj se přidal nedávno nebo pár dnů
     nedojel. Rozhoduje tedy počet dnů, kde ten zdroj JE.
     (Sabotáž „medián se počítá i z jednoho dne" na vnější podmínce
     neprošla právě proto, že rozhoduje až tahle; teď jsou obě
     prokazatelné.) */
  pravda('a nepočítá se ani tehdy, když historie o tom zdroji ví jen pár dnů', (() => {
    const dny = {};
    for (let i = 1; i <= 7; i++) dny[den(i)] = i <= 4 ? { Portál: 100 } : { Jiný: 500 };
    return porovnejSHistorii({ verze: 1, dny }, ted(10), dnes).length === 0;
  })());
  pravda(`zdroj pod PRAH_SLEDOVANI (${PRAH_SLEDOVANI}) se nehlídá`,
    porovnejSHistorii(historie([10, 10, 10, 10, 10, 10, 10]), ted(1), dnes).length === 0);
  pravda('zdroj, který dnes vůbec nedojel, se neřeší tady (má vlastní stav)',
    porovnejSHistorii(stabilni, [{ nazev: 'Portál', stav: 'chyba', pocet: 0 }], dnes).length === 0);
  pravda('a dnešek se do mediánu nepočítá (jinak by se měřil sám sebou)',
    porovnejSHistorii({ verze: 1, dny: Object.assign({}, stabilni.dny, { [dnes]: { Portál: 10 } }) },
      ted(69), dnes).length === 1);

  /* Zápis do historie: jeden den jeden záznam, a paměť se nepřetéká. */
  {
    const h1 = zapisDoHistorie(stabilni, ted(42), dnes);
    pravda('zápis přidá dnešek', h1.dny[dnes] && h1.dny[dnes]['Portál'] === 42);
    const h2 = zapisDoHistorie(h1, ted(43), dnes);
    pravda('a druhý běh téhož dne ho přepíše, nepřidá', h2.dny[dnes]['Portál'] === 43
      && Object.keys(h2.dny).length === Object.keys(h1.dny).length);
    let h3 = { verze: 1, dny: {} };
    for (let i = 1; i <= HISTORIE_MAX + 10; i++) {
      h3 = zapisDoHistorie(h3, ted(100), '2026-01-' + String(i).padStart(2, '0'));
    }
    pravda(`paměť se drží na ${HISTORIE_MAX} dnech`, Object.keys(h3.dny).length === HISTORIE_MAX);
    pravda('a zahazuje se nejstarší, ne nejnovější',
      !h3.dny['2026-01-01'] && !!h3.dny['2026-01-' + String(HISTORIE_MAX + 10).padStart(2, '0')]);
    pravda('zdroj v chybě se do historie nezapisuje (nezkazí budoucí medián)',
      !Object.prototype.hasOwnProperty.call(
        zapisDoHistorie(stabilni, [{ nazev: 'Portál', stav: 'chyba', pocet: 0 }], dnes).dny[dnes], 'Portál'));
    pravda('ani vypnutý zdroj',
      !Object.prototype.hasOwnProperty.call(
        zapisDoHistorie(stabilni, [{ nazev: 'Portál', stav: 'vypnuto', pocet: 0 }], dnes).dny[dnes], 'Portál'));
    /* ALE OSLABENÝ ZDROJ SE ZAPSAT MUSÍ. Tohle je ta chyba, kterou měl
       hlídač na vlastních datech: hlídače běží PŘED zápisem a stav si
       přepíšou, takže podmínka `stav === 'ok'` vyhodila z historie
       zrovna ten zdroj, o kterém je záznam potřeba. „OK dražby" dostaly
       12. 10. stav „pokles" a od toho dne v souboru nejsou — pět dnů
       ztracených měření, a po třiceti dnech by se zdroj sám od sebe
       vrátil mezi zdravé, protože by nebylo s čím srovnávat. */
    for (const stav of ['pokles', 'propad', 'zahazuje']) {
      const d = zapisDoHistorie(stabilni, [{ nazev: 'Portál', stav, pocet: 45 }], dnes).dny[dnes];
      pravda(`zdroj ve stavu „${stav}" se do historie zapíše`,
        d.Portál && d.Portál.p === 45, JSON.stringify(d));
      pravda('  a je u něj poznat, že ten den nebyl v pořádku',
        d.Portál && d.Portál.v === 1, JSON.stringify(d));
    }
  }

  /* --- Označený den se nesmí počítat do mediánu, ale nesmí ani zmizet --- */
  {
    const dnu = (n, hodnota) => {
      const dny = {};
      for (let i = 1; i <= n; i++) dny['2026-02-' + String(i).padStart(2, '0')] = { Portál: hodnota };
      return { verze: 2, dny };
    };
    /* Deset zdravých dnů po stu → dnešních 50 je pokles. */
    const zdrave = porovnejSHistorii(dnu(10, 100), [{ nazev: 'Portál', stav: 'ok', pocet: 50 }], '2026-03-01');
    pravda('medián se počítá ze zdravých dnů', zdrave.length === 1 && zdrave[0].median === 100,
      JSON.stringify(zdrave));
    /* Tytéž dny, ale všechny označené → medián se z nich nepočítá
       (jinak by úbytek byl za pár dnů „normální"), a přesto se mlčet
       nesmí: v okně není ani jeden den v pořádku. */
    const vadne = porovnejSHistorii(dnu(10, { p: 100, v: 1 }), [{ nazev: 'Portál', stav: 'ok', pocet: 50 }], '2026-03-01');
    pravda('z označených dnů se medián nepočítá, ale úbytek se hlásí dál',
      vadne.length === 1 && vadne[0].trva === true, JSON.stringify(vadne));
    /* A sabotáž naruby: kdyby se označené dny počítaly jako zdravé,
       dnešních 95 proti mediánu 100 by poplach nevyvolalo — a tady se
       vyvolat MUSÍ, protože v okně není zdravý den. */
    const dal = porovnejSHistorii(dnu(10, { p: 100, v: 1 }), [{ nazev: 'Portál', stav: 'ok', pocet: 95 }], '2026-03-01');
    pravda('a hlásí se, i když je dnešek skoro na úrovni označených dnů',
      dal.length === 1 && dal[0].trva === true, JSON.stringify(dal));
    /* Jeden zdravý den mezi označenými na medián nestačí (pět je minimum)
       — a to nesmí znamenat ticho. Tohle je díra, do které se dá
       spadnout snadno: podmínka „ani jeden zdravý den" by při jednom
       zdravém a devíti označených nespustila nic. */
    const h = dnu(10, { p: 100, v: 1 });
    h.dny['2026-02-05'] = { Portál: 100 };
    const smes = porovnejSHistorii(h, [{ nazev: 'Portál', stav: 'ok', pocet: 50 }], '2026-03-01');
    pravda('jeden zdravý den mezi označenými nestačí na medián, ale hlásí se dál',
      smes.length === 1 && smes[0].trva === true, JSON.stringify(smes));
    /* A naopak: nový zdroj s pár dny a bez označených dnů se nehlásí —
       není z čeho soudit. */
    const novy = porovnejSHistorii(dnu(3, 100), [{ nazev: 'Portál', stav: 'ok', pocet: 10 }], '2026-03-01');
    pravda('nový zdroj s pár dny historie se nehlásí', novy.length === 0, JSON.stringify(novy));
    /* Starý soubor s pouhými čísly se musí číst dál. */
    const stary = porovnejSHistorii({ verze: 1, dny: dnu(10, 100).dny },
      [{ nazev: 'Portál', stav: 'ok', pocet: 50 }], '2026-03-01');
    pravda('starý soubor (jen čísla) se čte dál', stary.length === 1 && stary[0].median === 100,
      JSON.stringify(stary));
  }

  /* A NAKONEC NA SKUTEČNÝCH ČÍSLECH. Prah 0,7 × medián nesmí vyhlásit
     poplach na ZDRAVÝCH dnech historie, kterou máme. Kdyby ho vyhlásil,
     je prah utažený a hlásil by každý den plano.

     PŮVODNĚ TU STÁLO „na historii, kterou máme — tam se za 19 dnů nic
     nerozbilo". To přestalo platit: zdroj „OK dražby" vracel 84 až 95
     nabídek, pak pět dnů nevrátil nic a 17. 10. přišel se 45. Hlídač na
     to upozornil správně — jenže tahle kontrola každý poplach počítala
     jako planý, takže na prvním skutečném nálezu zčervenala.

     Měří se tedy to, o co tu jde: planý poplach je poplach na dni,
     který hlídač sám za zdravý považoval. Den, u kterého v historii
     stojí značka `{p, v}` (tedy „zdroj ten den nebyl v pořádku"), se
     do vzorku nebere — ne celý den, jen ten jeden zdroj, aby ostatní
     dál měřily. Kolik se takhle vynechalo, se vypisuje; mlčky zúžený
     vzorek je totéž jako zelená, která nic neměří. */
  const cesta = path.join(KOREN_H, 'data', 'zdroje-historie.json');
  if (existsSync(cesta)) {
    const h = JSON.parse(readFileSync(cesta, 'utf8'));
    const dny = Object.keys(h.dny || {}).sort();
    pravda(`historie zdrojů v repozitáři má ${dny.length} dnů`, dny.length >= 10,
      'dnů jen ' + dny.length + ' — hlídač zatím nemá z čeho počítat');
    let poplachu = 0, porovnani = 0, vynechano = 0, merenych = 0;
    const planeU = [];
    for (let i = 5; i < dny.length; i++) {
      const vyrez = { verze: h.verze || 1, dny: {} };
      for (const d of dny.slice(0, i)) vyrez.dny[d] = h.dny[d];
      /* Den v historii je od verze 2 buď číslo, nebo `{p, v}` (den, kdy
         byl zdroj označený). Bez tohohle rozbalení by se do `pocet`
         dostal objekt, srovnání by vyšlo vždycky nepravdivě a kontrola
         by prošla, protože by neměřila nic. */
      const dnesni = [];
      for (const [nazev, v] of Object.entries(h.dny[dny[i]])) {
        if (typeof v !== 'number') { vynechano++; continue; }   // označený den
        dnesni.push({ nazev, stav: 'ok', pocet: v });
      }
      if (!dnesni.length) continue;
      porovnani++; merenych += dnesni.length;
      for (const p of porovnejSHistorii(vyrez, dnesni, dny[i])) {
        poplachu++;
        if (planeU.length < 4) planeU.push(`${dny[i]} ${p.nazev || ''}`.trim());
      }
    }
    /* Pojistka proti měření prázdna: kdyby značky pohltily celý vzorek,
       kontrola by prošla s nulou porovnání a nikdo by si toho nevšiml. */
    pravda(`vzorek zdravých dnů se nevyprázdnil (${merenych} měření, ${vynechano} označených vynecháno)`,
      porovnani >= 10 && merenych >= 30,
      `porovnání ${porovnani}, měření ${merenych} — na tolika se nedá o prahu nic tvrdit`);
    pravda(`na ${porovnani} zdravých dnech skutečné historie nevyhlásil ani jeden planý poplach (${poplachu})`,
      poplachu === 0, 'poplachů ' + poplachu + ' — prah je utažený: ' + planeU.join(', '));
  } else {
    pravda('data/zdroje-historie.json existuje', false, 'bez něj hlídač nemá paměť');
  }
}

/* ---- NEÚPLNÝ SKEN NENÍ MĚŘENÍ ---------------------------------------
 *
 * „OK dražby" se nestahují seznamem — projíždí se tři tisíce ID po sobě.
 * Každá síťová chyba u jednoho ID padala do prázdného `catch`, takže běh,
 * ve kterém se tři sta dotazů nedoručilo, vypadal stejně jako běh, ve
 * kterém portál opravdu měl míň dražeb. Takové číslo pak šlo do historie
 * jako měření a počítal se z něj medián, podle kterého se hlásí úbytky.
 *
 * Práh je odvozený, ne hádaný: ze 3 021 ID je dražba pozemku asi 1,5 %,
 * takže desetina nedoručených dotazů znamená asi desetinu chybějících
 * nabídek — a o desetinu nižší číslo se už nesmí vydávat za měření.
 */
{
  const sken = (dotazu, selhalo) => ({ dotazu, selhalo, prvni: null });
  pravda('bezvadný sken je úplný', !skenNeuplny(sken(3021, 0)));
  pravda('pár chyb z tří tisíc dotazů taky', !skenNeuplny(sken(3021, 9)));
  pravda(`desetina nedoručených dotazů už ne (práh ${PODIL_SELHANI})`,
    skenNeuplny(sken(3021, 400)));
  pravda('těsně pod prahem to ještě projde',
    !skenNeuplny(sken(1000, Math.floor(1000 * PODIL_SELHANI))));
  pravda('a těsně nad ním už ne',
    skenNeuplny(sken(1000, Math.floor(1000 * PODIL_SELHANI) + 1)));
  /* Dolní mez je proti šumu: u krátkého skenu dá jediná chyba procenta,
     která nic neznamenají. */
  pravda(`u krátkého skenu rozhoduje i dolní mez (${MIN_SELHANI})`,
    !skenNeuplny(sken(20, MIN_SELHANI - 1)));
  pravda('zdroj, který se takhle nestahuje, se neoznačuje',
    !skenNeuplny(sken(0, 0)));

  /* DRUHÝ ZPŮSOB: zdroj sám řekne, kolik jich má.
     Bezrealitky vracejí v každé odpovědi `totalCount`. Stahuje se po
     stránkách a smyčka se při chybě jedné z nich prostě ZASTAVÍ — zbytek
     se ani nezkusí, takže se nemá co počítat jako selhání a běh vypadá
     úplný, jen přinesl míň. U největšího zdroje (92 % všech nabídek) je
     to ten nejtišší možný způsob, jak přijít o část trhu. */
  const podle = (ocekavano, prijato, utrzeno = true) =>
    ({ dotazu: 0, selhalo: 0, ocekavano, prijato, utrzeno });
  pravda('když se stáhne všechno, co zdroj hlásí, je to úplné',
    !skenNeuplny(podle(1787, 1787)));
  pravda('pár kusů rozdílu mezi stránkami nevadí', !skenNeuplny(podle(1787, 1780)));
  pravda('chybějící desetina toho, co zdroj sám hlásí, už ano',
    skenNeuplny(podle(1787, 1600)));
  pravda('zastavená smyčka v půlce se pozná', skenNeuplny(podle(1787, 900)));
  pravda('a u malého zdroje rozhoduje i dolní mez',
    !skenNeuplny(podle(30, 30 - (MIN_SELHANI - 1))));
  pravda('bez hlášeného počtu se podle něj nesoudí', !skenNeuplny(podle(0, 0)));
  /* A TOHLE JE TA POJISTKA, KTERÁ ROZHODUJE O TOM, JESTLI SE NÁSTROJ DÁ
     POUŽÍT. Co přesně `totalCount` počítá, se odsud ověřit nedá —
     hostitel je ze schránky blokovaný. Kdyby počítal byť o kousek víc
     než kolik vrací `list`, hlásil by se největší zdroj (92 % všech
     nabídek) jako neúplný při KAŽDÉM běhu a přestal by se zapisovat do
     historie. Proto se to číslo použije jen tam, kde UŽ VÍME, že se
     smyčka utrhla chybou. Běh, který došel až do konce, se podle něj
     nesoudí, ať hlásí cokoli. */
  pravda('běh, který došel do konce, se podle hlášeného počtu nesoudí',
    !skenNeuplny(podle(1787, 900, false)));

  /* A TEĎ TO, O CO TU JDE: takové číslo nesmí do historie ani do
     poplachu. Obojí se pozná podle stavu, takže se zkouší oba konce. */
  const H = { verze: 2, dny: {} };
  for (let i = 1; i <= 10; i++) H.dny['2026-10-' + String(i).padStart(2, '0')] = { 'OK dražby': 90 };
  const neuplny = [{ nazev: 'OK dražby', stav: 'neuplne', pocet: 45 }];
  pravda('z neúplného běhu se nehlásí úbytek',
    porovnejSHistorii(H, neuplny, '2026-10-20').length === 0,
    JSON.stringify(porovnejSHistorii(H, neuplny, '2026-10-20')));
  pravda('a nezapisuje se do historie',
    zapisDoHistorie(H, neuplny, '2026-10-20').dny['2026-10-20']['OK dražby'] === undefined);
  /* Pojistka: kdyby se obojí řídilo něčím jiným než stavem, prošly by
     obě kontroly výš i s úplným během — a neměřily by nic. */
  const uplny = [{ nazev: 'OK dražby', stav: 'ok', pocet: 45 }];
  pravda('  (a s týmž číslem z ÚPLNÉHO běhu se úbytek ohlásí)',
    porovnejSHistorii(H, uplny, '2026-10-20').length === 1);
  pravda('  (a zapíše se)',
    zapisDoHistorie(H, uplny, '2026-10-20').dny['2026-10-20']['OK dražby'] === 45);

  /* A kdo ten stav vlastně nastaví. Bez téhle kontroly by kontroly výš
     hlídaly stav, který by do dat nikdo nikdy nenapsal. */
  const SKEN = { 'OK dražby': sken(3021, 400), 'SPÚ': sken(0, 0), 'Dražby': sken(900, 3),
    'Bezrealitky': podle(1787, 900) };
  const zdroje = [
    { nazev: 'OK dražby', stav: 'ok', pocet: 45 },
    { nazev: 'SPÚ', stav: 'ok', pocet: 436 },
    { nazev: 'Dražby', stav: 'ok', pocet: 80 },
    { nazev: 'Farmy', stav: 'chyba', pocet: 0 },
    { nazev: 'Bezrealitky', stav: 'ok', pocet: 870 },
  ];
  const hlasky = oznacNeuplne(zdroje, (n) => SKEN[n]);
  pravda('zdroj s neúplným skenem dostane stav „neuplne"',
    zdroje[0].stav === 'neuplne', JSON.stringify(zdroje[0]));
  pravda('  a řekne se to nahlas, i s čísly',
    hlasky.some((h) => /OK dražby/.test(h) && /400 z 3021 ID/.test(h) && /13 %/.test(h)),
    JSON.stringify(hlasky));
  pravda('zdroj stahovaný seznamem se nedotkne', zdroje[1].stav === 'ok');
  pravda('ani zdroj s pár chybami ze skenu', zdroje[2].stav === 'ok');
  pravda('a zdroj, který vůbec neodpověděl, si stav „chyba" nechá',
    zdroje[3].stav === 'chyba');
  pravda('zastavená smyčka u stránkovaného zdroje se taky označí',
    zdroje[4].stav === 'neuplne', JSON.stringify(zdroje[4]));
  /* Hláška musí říct DŮVOD, který opravdu nastal. U stránkovaného zdroje
     se ID neprojíždějí, takže dělení `dotazu` by dalo „NaN %" — a hláška,
     které není rozumět, se čte jako chyba hlášky, ne jako nález. */
  pravda('  a řekne se u ní ten správný důvod, ne „NaN %"',
    hlasky.some((h) => /Bezrealitky/.test(h) && /900 z 1787/.test(h) && !/NaN/.test(h)),
    JSON.stringify(hlasky));
}

/* ---- OKNO SKENU SE NESMÍ OPÍRAT O PEVNÉ ČÍSLO V KÓDU ----------------
 *
 * Sken začíná u nejvyššího ID z homepage. Když se homepage nenačte nebo
 * se jí změní podoba odkazů, spadne to na pevné číslo — a to stárne:
 * v kódu stálo 27 100, zatímco dražby jsou dnes u 29 255. Sken by se
 * posunul o dva tisíce ID vedle. Dolní hranici proto drží i nejvyšší ID,
 * které už leží v datech; ta stárnout nemůže.
 */
{
  pravda('z dat se přečte nejvyšší ID dražby',
    nejvyssiOkdZDat({ opportunities: [
      { url: 'https://www.okdrazby.cz/drazba/29255-pozemek' },
      { url: 'https://www.okdrazby.cz/drazba/27070-pole' },
      { url: 'https://www.bezrealitky.cz/nemovitosti/99999' },
    ] }) === 29255);
  pravda('prázdná data dají nulu, ne pád', nejvyssiOkdZDat({}) === 0 && nejvyssiOkdZDat(null) === 0);

  /* A DOLNÍ KONEC OKNA. Sken jde od nejvyššího ID o tři tisíce dolů —
     jenže to okno se posouvá s tím, jak dražeb přibývá, takže dražba,
     která je aktivní dlouho, z něj jednou vypadne. Zmizela by beze
     slova: nebyla by v odpovědi, nic by se nepokazilo, jen by jí ubylo.
     Okno proto sahá i pod to, co už v datech máme — a má strop, aby ho
     jediný starý záznam nenatáhl donekonečna i s dobou běhu. */
  pravda('z dat se přečte i nejnižší ID dražby',
    nejnizsiOkdZDat({ opportunities: [
      { url: 'https://www.okdrazby.cz/drazba/29255-pozemek' },
      { url: 'https://www.okdrazby.cz/drazba/27070-pole' },
    ] }) === 27070);
  pravda('bez dat se nejnižší ID nehádá', nejnizsiOkdZDat({}) === 0);
  pravda('běžně okno zůstává tři tisíce ID',
    oknoOkd(29255, 27070) === 29255 - OKD_OKNO);
  pravda('stará aktivní dražba okno natáhne, aby z něj nevypadla',
    oknoOkd(29255, 25000) === 25000 - 50);
  pravda('a strop ho zastaví, aby jediný záznam nenatáhl běh donekonečna',
    oknoOkd(29255, 20000) === 29255 - OKD_OKNO_STROP);
  pravda('bez dat se okno počítá postaru', oknoOkd(29255, 0) === 29255 - OKD_OKNO);
  /* A na ostrých datech: kdyby tahle funkce vracela nulu, okno skenu by
     se znovu opíralo jen o pevné číslo a nikdo by si toho nevšiml. */
  const DATA = path.join(KOREN_H, 'data', 'opportunities.json');
  if (existsSync(DATA)) {
    const skutecne = nejvyssiOkdZDat(JSON.parse(readFileSync(DATA, 'utf8')));
    pravda(`a na ostrých datech vyjde skutečné ID (${skutecne})`, skutecne > 27100,
      'vyšlo ' + skutecne + ' — buď v datech žádná dražba z OK dražeb není, nebo se změnil tvar adresy');
  }
}

console.log('\nHlídač jednotlivých zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Hlídač zdrojů: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
