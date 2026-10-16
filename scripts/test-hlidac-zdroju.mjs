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
  porovnejSHistorii, zapisDoHistorie, DNU_HISTORIE, PRAH_POKLESU, HISTORIE_MAX } from './fetch-opportunities.mjs';
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
     poplach na historii, kterou máme — tam se za 19 dnů nic nerozbilo.
     Kdyby ho vyhlásil, je prah utažený a hlásil by každý den plano. */
  const cesta = path.join(KOREN_H, 'data', 'zdroje-historie.json');
  if (existsSync(cesta)) {
    const h = JSON.parse(readFileSync(cesta, 'utf8'));
    const dny = Object.keys(h.dny || {}).sort();
    pravda(`historie zdrojů v repozitáři má ${dny.length} dnů`, dny.length >= 10,
      'dnů jen ' + dny.length + ' — hlídač zatím nemá z čeho počítat');
    let poplachu = 0, porovnani = 0;
    for (let i = 5; i < dny.length; i++) {
      const vyrez = { verze: h.verze || 1, dny: {} };
      for (const d of dny.slice(0, i)) vyrez.dny[d] = h.dny[d];
      /* Den v historii je od verze 2 buď číslo, nebo `{p, v}` (den, kdy
         byl zdroj označený). Bez tohohle rozbalení by se do `pocet`
         dostal objekt, srovnání by vyšlo vždycky nepravdivě a kontrola
         by prošla, protože by neměřila nic. */
      const dnesni = Object.entries(h.dny[dny[i]]).map(([nazev, v]) => ({
        nazev, stav: 'ok', pocet: (typeof v === 'number' ? v : (v && v.p) || 0) }));
      porovnani++;
      poplachu += porovnejSHistorii(vyrez, dnesni, dny[i]).length;
    }
    pravda(`na ${porovnani} dnech skutečné historie nevyhlásil ani jeden planý poplach (${poplachu})`,
      poplachu === 0, 'poplachů ' + poplachu + ' — prah je utažený');
  } else {
    pravda('data/zdroje-historie.json existuje', false, 'bez něj hlídač nemá paměť');
  }
}

console.log('\nHlídač jednotlivých zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Hlídač zdrojů: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
