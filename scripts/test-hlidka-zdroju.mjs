// Zkoušky hlídky tiše rozbitého zdroje (scripts/hlidka-zdroju.mjs
// a počítadlo v scripts/fetch-opportunities.mjs).
//
// Spuštění: node scripts/test-hlidka-zdroju.mjs
//
// PROČ TAHLE HLÍDKA VZNIKLA. Robot skončí chybou jen když spadne
// main(). Zdroj, který je rozbitý a ani druhá cesta ho nezachrání, se
// obslouží „hezky": nabídky se podrží (§220), do logu jde ::error:: —
// a běh je ZELENÝ. Žádný úkol se nezaloží a protože nabídky na webu
// dál jsou, nevypadá nic špatně. Zdroj může být tiše rozbitý týdny.
import { readFileSync } from 'node:fs';
import * as F from './fetch-opportunities.mjs';
import { execFileSync } from 'node:child_process';
import { hlaseni, rozhodnutiHlidky } from './hlidka-zdroju.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}\n      vyšlo  ${a}`); }
}
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const beh = (h, zdroje, den) => ({ mimoProvoz: F.zapisMimoProvoz(h, zdroje, den) });

/* ---- 1) POČÍTADLO ----------------------------------------------- */
{
  const rozbity = [{ nazev: 'A', stav: 'chyba', chyba: 'HTTP 500' }];
  let h = {};
  h = beh(h, rozbity, '2026-11-01');
  je('první výpadek se zapíše jako jeden běh', h.mimoProvoz.A.behu, 1);
  je('a pamatuje si, odkdy', h.mimoProvoz.A.od, '2026-11-01');
  h = beh(h, rozbity, '2026-11-02');
  h = beh(h, rozbity, '2026-11-03');
  je('třetí běh v řadě', h.mimoProvoz.A.behu, 3);
  je('datum začátku se NEPŘEPISUJE', h.mimoProvoz.A.od, '2026-11-01');
  /* UZDRAVENÍ MAŽE. Jinak by se zdroj, který se spravil, hlásil navždy
     a hlídka by se stala šumem, který se přestane číst. */
  const po = beh(h, [{ nazev: 'A', stav: 'ok' }], '2026-11-04');
  je('zdroj v pořádku počítadlo vynuluje', po.mimoProvoz, {});
}

/* ---- 2) CO SE NEPOČÍTÁ ------------------------------------------ */
{
  /* `vypnuto` = chybí klíč, zdroj se ani nezkoušel. Hlásit to denně
     je planý poplach, který se naučí přehlížet — a tím se hlídka
     odzbrojí sama. „druhá cesta" je stav, kdy zdroj FUNGUJE, jen se
     čte jinak; právě k tomu ta cesta je. */
  const h = beh({}, [
    { nazev: 'Vypnutý', stav: 'vypnuto' },
    { nazev: 'Jinou cestou', stav: 'druhá cesta' },
    { nazev: 'Rozbitý', stav: 'prazdno' },
  ], '2026-11-01');
  je('vypnutý zdroj se nepočítá', h.mimoProvoz.Vypnutý, undefined);
  je('druhá cesta se nepočítá', h.mimoProvoz['Jinou cestou'], undefined);
  je('ale prázdná odpověď ano', h.mimoProvoz.Rozbitý && h.mimoProvoz.Rozbitý.behu, 1);
}

/* ---- 3) MEZ ------------------------------------------------------ */
{
  const mimo = {
    Dva: { behu: 2, od: '2026-11-02', stav: 'chyba', duvod: 'x' },
    Tri: { behu: 3, od: '2026-11-01', stav: 'prazdno', duvod: 'nic nepřišlo' },
    Pet: { behu: 5, od: '2026-10-30', stav: 'chyba', duvod: 'HTTP 500' },
  };
  je('dva běhy ještě nestačí', F.dlouhoMimo(mimo).map((z) => z.nazev), ['Pet', 'Tri']);
  je('a řadí se od nejdéle rozbitého', F.dlouhoMimo(mimo)[0].nazev, 'Pet');
  /* OPAČNÝ SMĚR: ať se to nedá „splnit" tím, že se nehlásí nikdy. */
  je('při nule mimo pořádek není hlášení žádné', F.dlouhoMimo({}), []);
  pravda('hlášení jmenuje zdroj, počet běhů i důvod',
    /Pet/.test(hlaseni(F.dlouhoMimo(mimo))) && /5\. běh/.test(hlaseni(F.dlouhoMimo(mimo)))
    && /HTTP 500/.test(hlaseni(F.dlouhoMimo(mimo))),
    hlaseni(F.dlouhoMimo(mimo)));
}

/* ---- 4) ŽE SE TÍM ROBOT OPRAVDU ŘÍDÍ ---------------------------- */
{
  const kod = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8');
  const bezKom = kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('robot počítadlo opravdu zapisuje do historie',
    /mimoProvoz\s*=\s*zapisMimoProvoz\(/.test(bezKom) && /verze: 4, dny, ceny, mimoProvoz/.test(bezKom),
    'bez toho by hlídka měřila soubor, do kterého nikdo nepíše');

  /* A HLÍDKA MUSÍ BĚŽET AŽ ZA COMMITEM. Kdyby skončil chybou krok
     „Stáhnout data", GitHub přeskočí všechno za ním — tedy i commit.
     Den, kdy se zdroj pokazí, by byl i dnem, kdy se zahodí všechno,
     co se stáhnout PODAŘILO. */
  const wf = readFileSync(new URL('../.github/workflows/update-data.yml', import.meta.url), 'utf8');
  const iCommit = wf.indexOf('Commit změn');
  const iHlidka = wf.indexOf('hlidka-zdroju.mjs');
  pravda('hlídka je ve workflow robota', iHlidka > 0, 'jinak se nikdy nespustí');
  pravda('a běží AŽ ZA commitem (jinak by červená zahodila stažená data)',
    iCommit > 0 && iHlidka > iCommit, `commit na ${iCommit}, hlídka na ${iHlidka}`);
}

/* ---- 5) „NEVÍM" NENÍ „V POŘÁDKU" -------------------------------- */
{
  const kodH = readFileSync(new URL('./hlidka-zdroju.mjs', import.meta.url), 'utf8');
  /* ŘÁDKOVÉ KOMENTÁŘE SE MUSÍ ODŘÍZNOUT TAKY. Odřízl jsem napoprvé
     jen blokové, takže sabotáž „zakomentuj `process.exitCode = 1`"
     prošla zeleně — zakomentovaný řádek ten text pořád obsahuje.
     Je to potřetí dnes táž past (§358, §362): kontrola, která čte
     kód, musí číst KÓD, ne dokumentaci. */
  const bez = kodH.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('chybějící počítadlo se hlásí jako „zatím není", ne jako pořádek',
    /if \(!historie\.mimoProvoz\)/.test(bez) && /zatím není/.test(bez),
    'napsal jsem to nejdřív špatně: hlídka tvrdila „všechny zdroje v pořádku",'
    + ' i když nic nezměřila — přesně ta vada, kterou má hlídat');
  pravda('a nález končí červeně, jinak se úkol nezaloží',
    /process\.exitCode = 1/.test(bez) && /::error::/.test(bez));
}

/* ---- OZVAT SE, ALE NE KAŽDÝCH ŠEST HODIN TOTÉŽ -----------------
   NALEZENO NAOSTRO 4. 11.: hlídka se u Dražeb ozvala při třetím běhu
   v řadě — správně — a pak při čtvrtém, pátém a šestém znovu. Úkol se
   přitom zakládá jeden, takže šestý červený běh už nikomu nic neřekl.
   Červená, která svítí každý den ze stejného důvodu, se přestane čist
   a zapadne v ní i poplach, který je nový. */
{
  const m = (n) => F.jeMeznik(n);
  pravda('ozve se při 3. běhu v řadě', m(3) === true);
  pravda('při 4. a 5. už ne', m(4) === false && m(5) === false);
  pravda('ale při 6., 12., 24. znovu (dvakrát tak dlouhý úbytek)',
    m(6) === true && m(12) === true && m(24) === true,
    JSON.stringify([m(6), m(12), m(24)]));
  pravda('mezi mezníky ticho', [7, 8, 9, 10, 11, 13, 23].every((n) => m(n) === false));
  pravda('pod mezí se neozve vůbec', m(1) === false && m(2) === false);
  je('a řekne se, kdy se to připomene', F.dalsiMeznik(7), 12);

  const mimo = {
    Nove: { behu: 3, od: '2026-11-04', stav: 'chyba', duvod: 'HTTP 500' },
    Stare: { behu: 7, od: '2026-10-30', stav: 'prazdno', duvod: 'nic' },
    Kratke: { behu: 2, od: '2026-11-04', stav: 'chyba', duvod: 'x' },
  };
  je('k ohlášení jde jen ten na mezníku', F.kOhlaseni(mimo).map((z) => z.nazev), ['Nove']);
  /* Ale „není na mezníku" neznamená „není mimo pořádek": přehled musí
     dál vidět oba. Jinak by se tichý zdroj ztratil úplně. */
  je('přehled přesto zná oba, co mez překročily',
    F.dlouhoMimo(mimo).map((z) => z.nazev).sort(), ['Nove', 'Stare']);
  /* A hlídka to opravdu takhle používá — jinak by to byla funkce,
     kterou nikdo nevolá. */
  const telo = readFileSync(new URL('./hlidka-zdroju.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('hlídka se řídí mezníky a mezi nimi jen vypisuje',
    /const nalez = kOhlaseni\(mimo\)/.test(telo)
    && /const prekrocili = dlouhoMimo\(mimo\)/.test(telo)
    && /dalsiMeznik\(p\.behu\)/.test(telo),
    'hlídka mezníky nepoužívá');
}

/* ---- CO MÁ HLÍDKA UDĚLAT -------------------------------------------
   ==================================================================
   Sabotážní stroj 4. 11. ukázal, že tahle zkouška nechytí dvě vady
   v `hlidka-zdroju.mjs`, a obě vedou k témuž: hlídka zůstane ZELENÁ,
   když měla být červená — tedy přesně ta vada, kterou hlídka vznikla
   hlídat (§356). Nedaly se změřit, protože rozhodnutí sedělo uvnitř
   `main()`, mezi čtením souboru a `process.exitCode`. */
{
  const nalez = [{ nazev: 'SPÚ', behu: 3, stav: 'chyba', od: '2026-11-02' }];
  const prekroc = [{ nazev: 'Dražby', behu: 7, stav: 'chyba', od: '2026-10-28' }];
  /* TOHLE JE TEN PŘÍPAD, KTERÝ SE ROZBÍJEL: je co ohlásit A ZÁROVEŇ
     někdo jiný už ohlášený je. Při `||` místo `&&` se vybere
     „připomenout" — vypíše se to a běh skončí ZELENĚ, takže se
     nezaloží žádný úkol a nikdo se o rozbitém zdroji nedozví. */
  je('je co ohlásit i když už někdo jiný ohlášený je → červeně',
    rozhodnutiHlidky(nalez, prekroc), 'červeně');
  je('je co ohlásit a nikdo jiný → taky červeně',
    rozhodnutiHlidky(nalez, []), 'červeně');
  je('není co ohlásit, ale někdo je dlouho mimo → jen připomenout',
    rozhodnutiHlidky([], prekroc), 'připomenout');
  je('nikdo nikde → ticho', rozhodnutiHlidky([], []), 'ticho');
  je('a prázdné vstupy se neberou jako nález',
    [rozhodnutiHlidky(null, null), rozhodnutiHlidky(undefined, [])], ['ticho', 'ticho']);
}

/* ---- SPUŠTĚNÁ HLÍDKA: CO ŘEKNE A S JAKÝM KONCEM --------------------
   ==================================================================
   Dvě věci, které se jinak nedají změřit:

   1. Vstupní podmínka `import.meta.url === file://argv[1]` je JEDINÉ
      místo, odkud se `main()` pustí. Obrácená by znamenala, že
      `node scripts/hlidka-zdroju.mjs` NEUDĚLÁ NIC a běh robota bude
      zelený. Ze zkoušky, která si modul jen importuje, to vidět není.
   2. Rozcestí v `main()` musí sedět s rozhodnutím: červeně znamená
      konec chybou A jmenovat zdroje, připomenout znamená zelený konec
      bez `::error::`. Nestačí „hlídka něco napsala" — naměřeno 5. 11.:
      při obrácené rovnosti v rozcestí vypsala „Zdroj mimo pořádek"
      s PRÁZDNÝM seznamem a skončila červeně, takže kontrola na pouhý
      výskyt textu to pustila dál.

   Co se čeká, se dopočítá z týchž dat týmiž funkcemi, kterými to
   počítá robot — zkouška tím nezávisí na tom, jak jsou zdroje dnes. */
{
  let hist = null;
  try {
    hist = JSON.parse(readFileSync(new URL('../data/zdroje-historie.json', import.meta.url), 'utf8'));
  } catch { hist = null; }
  let kod = 0, vystup = '';
  try {
    vystup = execFileSync(process.execPath,
      [new URL('./hlidka-zdroju.mjs', import.meta.url).pathname],
      { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    kod = (e && e.status != null) ? e.status : -1;
    vystup = String((e && e.stdout) || '') + String((e && e.stderr) || '');
  }
  pravda('spuštěná hlídka vždycky něco řekne (jinak je vstupní podmínka obrácená)',
    /Hlídka zdrojů|Historie zdrojů|Zdroj mimo pořádek/.test(vystup),
    'konec ' + kod + ', výpis: ' + JSON.stringify(vystup.slice(0, 200)));

  if (hist && hist.mimoProvoz) {
    const nalez = F.kOhlaseni(hist.mimoProvoz);
    const prekroc = F.dlouhoMimo(hist.mimoProvoz);
    const cekano = rozhodnutiHlidky(nalez, prekroc);
    const jmena = (s) => s.map((z) => z.nazev);
    if (cekano === 'červeně') {
      pravda(`je co ohlásit (${jmena(nalez).join(', ')}) → konec chybou a jmenovitě`,
        kod === 1 && nalez.every((z) => vystup.includes(z.nazev)) && /::error::/.test(vystup),
        'konec ' + kod + ', výpis: ' + JSON.stringify(vystup.slice(0, 300)));
    } else if (cekano === 'připomenout') {
      pravda(`ohlášeno už bylo (${jmena(prekroc).join(', ')}) → zelený konec, žádné ::error::`,
        kod === 0 && prekroc.every((z) => vystup.includes(z.nazev)) && !/::error::/.test(vystup),
        'konec ' + kod + ', výpis: ' + JSON.stringify(vystup.slice(0, 300)));
    } else {
      pravda('nikdo není dlouho mimo → zelený konec a hlídka to řekne',
        kod === 0 && /nikdo není mimo pořádek|všechny zdroje odpověděly/.test(vystup),
        'konec ' + kod + ', výpis: ' + JSON.stringify(vystup.slice(0, 300)));
    }
    /* A AŤ NEHLÁSÍ PRÁZDNO: „Zdroj mimo pořádek" bez jediného jména je
       hláška, ze které se nikdo nic nedozví. */
    pravda('a nikdy nehlásí „Zdroj mimo pořádek" s prázdným seznamem',
      !/Zdroj mimo pořádek/.test(vystup) || /Zdroj mimo pořádek[\s\S]*•/.test(vystup),
      JSON.stringify(vystup.slice(0, 300)));
  }
}

console.log('Hlídka zdrojů:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) {
  console.error(`::error::Hlídka zdrojů: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Bez téhle hlídky může být zdroj tiše rozbitý týdny a běh zůstane zelený.');
  process.exit(1);
}
