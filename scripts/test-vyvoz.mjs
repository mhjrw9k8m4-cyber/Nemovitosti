/* Test: vývoz vyfiltrovaných nabídek do tabulky (js/vyvoz.js).
 *
 * Spuštění: node scripts/test-vyvoz.mjs
 *
 * PROČ TAHLE ZKOUŠKA. Tabulka je soubor, který si člověk otevře jinde —
 * když se v ní něco rozsype, web o tom neví a nikdo to nehlásí. Tři věci
 * se rozsypou nejsnáz a každá tiše:
 *   · ODDĚLOVAČ. Český Excel čeká středník. S čárkou otevře všechno
 *     v jednom sloupci — soubor „jde stáhnout" a je k ničemu.
 *   · UVOZOVKY. Název obce se středníkem nebo uvozovkou rozhodí řádek
 *     a sloupce se posunou, aniž by to bylo na první pohled vidět.
 *   · CENA ZA METR. U spoluvlastnického podílu je v ceně zlomek, ale
 *     výměra celá — dělit jedno druhým dá číslo desetkrát nižší. Mapa
 *     i stránka pozemku to počítají přes js/ceny.js; tabulka musí taky,
 *     jinak si do ní někdo přenese nejklamavější číslo na webu.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const V = req(path.join(ROOT, 'js', 'vyvoz.js'));
/* js/ceny.js není modul pro require: je to IIFE, která se zapíše do
   window (na webu) nebo globalThis. Načte se proto do vlastního
   prostoru, aby test nesahal na skutečné globální proměnné. */
const _ceny = {};
new Function('globalThis', readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8')).call(_ceny, _ceny);
const CENY = _ceny.PK_CENY;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const pomocne = { zaMetr: CENY.zaMetr, klic: (d) => 'K:' + (d.place || '') };

/* --- 1) Hlavička a tvar souboru ------------------------------------ */
{
  const t = V.csv([], pomocne);
  const prvni = t.split('\r\n')[0];
  pravda('soubor má hlavičku se jmény sloupců', prvni.split(';').length === V.SLOUPCE.length,
    prvni);
  pravda('a odděluje středníkem, ne čárkou (český Excel jinak dá vše do jednoho sloupce)',
    prvni.indexOf(';') !== -1 && prvni.indexOf(',') === -1, prvni);
  pravda('řádky končí CRLF (poradí si s tím i starší Excel)', /\r\n$/.test(t), JSON.stringify(t.slice(-4)));
  /* BOM patří k souboru, ne k textu — připíná ho až stahování. Kdyby byl
     tady, každé porovnání textu by o něj zakoplo. */
  pravda('text sám nezačíná značkou BOM', t.charCodeAt(0) !== 0xFEFF, 'BOM je v textu');
}

/* --- 2) Počet řádků a pořadí --------------------------------------- */
{
  const D = [
    { place: 'Kolín', okres: 'Kolín', druh: 'orná půda', type: 'sale', area: 1000, price: 100000 },
    { place: 'Tábor', okres: 'Tábor', druh: 'zahrada', type: 'drazba', area: 500, price: 50000, extra: 'dražba 2026-10-07' },
  ];
  const r = V.csv(D, pomocne).trim().split('\r\n');
  pravda('řádků je tolik, kolik je nabídek (plus hlavička)', r.length === D.length + 1, `řádků ${r.length}`);
  pravda('a jdou ve stejném pořadí, v jakém přišly',
    r[1].indexOf('Kolín') === 0 && r[2].indexOf('Tábor') === 0, r.slice(1).join(' | '));
  pravda('termín dražby je v českém tvaru', /;7\.10\.2026;/.test(r[2]), r[2]);
  pravda('a u nabídky bez dražby zůstane prázdný', /;;/.test(r[1]), r[1]);
}

/* --- 3) Uvozovky: název, který by jinak rozhodil sloupce ------------ */
{
  const D = [{ place: 'Ves; "u lesa"', okres: 'X', druh: 'les', type: 'sale', area: 10, price: 10 }];
  const radek = V.csv(D, pomocne).trim().split('\r\n')[1];
  pravda('pole se středníkem a uvozovkou se uzavře a uvozovky se zdvojí',
    radek.indexOf('"Ves; ""u lesa"""') === 0, radek);
  /* A ZDA TO OPRAVDU K NĚČEMU JE. Naivní split(';') se na správně
     uvozeném poli rozpadnout MUSÍ — tabulkový program ale uvozovky čte,
     takže se čte stejně: polem se prochází znak po znaku a středník
     uvnitř uvozovek se za oddělovač nepočítá. Teprve tím se pozná, že
     uvozování drží sloupce pohromadě. */
  const ctiRadek = (txt) => {
    const out = []; let pole = '', v = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (v) {
        if (c === '"' && txt[i + 1] === '"') { pole += '"'; i++; }
        else if (c === '"') v = false;
        else pole += c;
      } else if (c === '"') v = true;
      else if (c === ';') { out.push(pole); pole = ''; }
      else pole += c;
    }
    out.push(pole);
    return out;
  };
  /* Nejdřív že se to měřidlo nerozbilo: na hlavičce, kde žádné uvozovky
     nejsou, musí vyjít přesně tolik polí, kolik je sloupců. */
  const hlavicka = ctiRadek(V.csv(D, pomocne).trim().split('\r\n')[0]);
  pravda('čtení řádku souhlasí na hlavičce (jinak by se měřilo samo sebou)',
    hlavicka.length === V.SLOUPCE.length, `polí ${hlavicka.length}, sloupců ${V.SLOUPCE.length}`);
  const pola = ctiRadek(radek);
  pravda('a řádek se tím nerozpadne: polí je přesně tolik, kolik je hlaviček',
    pola.length === V.SLOUPCE.length, `polí ${pola.length}, hlaviček ${V.SLOUPCE.length}`);
  pravda('a středník i uvozovky zůstanou uvnitř prvního pole',
    pola[0] === 'Ves; "u lesa"', `první pole: „${pola[0]}"`);
  /* Naivní rozdělení naopak selže — tím je vidět, že ta past je skutečná. */
  pravda('past je skutečná: naivní split(\';\') ten řádek rozpadne',
    radek.split(';').length > V.SLOUPCE.length,
    `naivně ${radek.split(';').length} polí proti ${V.SLOUPCE.length} sloupcům`);
}

/* --- 4) Cena za metr u spoluvlastnického podílu --------------------- */
{
  const podil = { place: 'P', okres: 'P', druh: 'les', type: 'sale',
    area: 4000, price: 100000, podil: true, zlomek: '1/4' };
  const surove = Math.round(podil.price / podil.area);          // 25 — klamavé
  const spravne = Math.round(CENY.zaMetr(podil));               // 100
  pravda('past je skutečná: surový výpočet dá jiné číslo než js/ceny.js',
    surove !== spravne, `surově ${surove}, přes ceny.js ${spravne}`);
  const radek = V.csv([podil], pomocne).trim().split('\r\n')[1].split(';');
  const vTabulce = Number(radek[V.SLOUPCE.indexOf('Cena za m² (Kč)')]);
  pravda('v tabulce je cena za metr z výměry, která kupujícímu připadne',
    vTabulce === spravne, `v tabulce ${vTabulce}, čekáno ${spravne}`);
  const iPodil = V.SLOUPCE.indexOf('Podíl');
  pravda('a podíl je v tabulce vidět', radek[iPodil] === '1/4', `sloupec podíl: „${radek[iPodil]}"`);
}

/* --- 5) Název souboru ---------------------------------------------- */
{
  const n = V.nazev('Stavební / zastavěná do 2 mil', new Date(2026, 9, 3));
  pravda('název nese datum', n.indexOf('parcelka-2026-10-03') === 0, n);
  pravda('a filtr bez diakritiky a mezer', /stavebni/.test(n) && !/[ěščřžýáíéúůď ]/i.test(n), n);
  pravda('končí na .csv', /\.csv$/.test(n), n);
  pravda('bez filtru se jméno nerozbije', /^parcelka-2026-10-03\.csv$/.test(V.nazev('', new Date(2026, 9, 3))),
    V.nazev('', new Date(2026, 9, 3)));
}

/* --- 6) Nové sloupce: to, co se z obrazovky opsat nedá -------------
   Tabulka měla třináct sloupců a každý z nich se dal přečíst z karty,
   takže vývoz byl jen rychlejší opisování. Těchto šest dělá z tabulky
   pracovní list: souřadnice (bez nich se seznam nedá nahrát do mapy),
   dní do dražby (podle data se v Excelu netřídí, podle čísla ano),
   vzdálenost od zvoleného místa, příznak uloženo a vlastní poznámka. */
const STARE_SLOUPCE = 'Obec;Okres;Druh;Kategorie;Výměra (m²);Cena (Kč);'
  + 'Cena za m² (Kč);Předchozí cena (Kč);Změna ceny;Podíl;Termín dražby;'
  + 'Odkaz na zdroj;Stránka na Parcelce';
{
  const d = {
    place: 'Kolín', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
    area: 1000, price: 500000, lat: 50.0281, lng: 15.2003,
    extra: 'dražba 2026-11-01', url: 'https://example.invalid/a',
  };
  const radky = V.csv([d], {
    zaMetr: () => 500,
    poznamka: () => 'u lesa; pozor na plot',
    jeUlozeny: () => true,
    kmOd: () => 12.34,
  }).split('\r\n');
  const hlavicka = radky[0].split(';');
  const bunky = radky[1].split(';');
  const kde = (jm) => hlavicka.indexOf(jm);

  for (const jm of ['Zeměpisná šířka', 'Zeměpisná délka', 'Dní do dražby',
    'Vzdálenost (km)', 'Uloženo', 'Moje poznámka']) {
    pravda(`tabulka má sloupec ${jm}`, kde(jm) !== -1, radky[0]);
  }
  /* Starý tvar musí zůstat: kdo má na sloupcích postavený vzorec, najde
     je tam, kde byly. Nové sloupce se proto připisují na konec. */
  pravda('a staré sloupce zůstaly na svých místech',
    hlavicka.slice(0, 13).join(';') === STARE_SLOUPCE,
    hlavicka.slice(0, 13).join(';'));

  pravda('souřadnice jsou v tabulce na pět míst',
    bunky[kde('Zeměpisná šířka')] === '50.02810', bunky[kde('Zeměpisná šířka')]);
  /* Desetinná ČÁRKA: s tečkou si český Excel myslí, že je to text. */
  pravda('vzdálenost je s desetinnou čárkou',
    bunky[kde('Vzdálenost (km)')] === '12,3', bunky[kde('Vzdálenost (km)')]);
  pravda('uloženo se píše slovem', bunky[kde('Uloženo')] === 'ano',
    bunky[kde('Uloženo')]);
  /* Poznámka je poslední sloupec a středník v ní rozdělí řádek na dvě
     části — po spojení zpátky musí být vidět, že je celá v uvozovkách. */
  pravda('poznámka se středníkem se uzavře do uvozovek',
    bunky.slice(kde('Moje poznámka')).join(';') === '"u lesa; pozor na plot"',
    bunky.slice(kde('Moje poznámka')).join(';'));
}

/* Poznámka se píše do víceřádkového pole, takže v ní Enter být může —
   a při vložení z Windows přijde jako CRLF, tedy přesně ten pár znaků,
   kterým se v tabulce oddělují řádky. Nezabalený by rozlomil řádek na
   dva a zbytek sloupců by se posunul; v Excelu to vypadá jako poškozený
   soubor. Zkouší se oba tvary, LF i CRLF. */
{
  const d = { place: 'Kolín', okres: 'Kolín', type: 'sale', area: 1000, price: 100000 };
  const lf = V.csv([d], { zaMetr: () => 100, poznamka: () => 'první\ndruhý' });
  pravda('poznámka s koncem řádku se uzavře do uvozovek',
    lf.indexOf('"první\ndruhý"') !== -1, JSON.stringify(lf.split('\r\n')[1]));

  const crlf = V.csv([d], { zaMetr: () => 100, poznamka: () => 'první\r\ndruhý' });
  pravda('a s CRLF taky', crlf.indexOf('"první\r\ndruhý"') !== -1,
    JSON.stringify(crlf));
  /* Past je skutečná: CRLF v poznámce je tentýž pár znaků, jakým se
     oddělují řádky tabulky. Bez uvozovek by jich bylo o jeden víc, než
     je nabídek — a právě na tom to v Excelu praskne. */
  pravda('a řádky zůstanou dva: hlavička a jedna nabídka',
    crlf.replace(/"[^"]*"/g, 'X').trim().split('\r\n').length === 2,
    String(crlf.replace(/"[^"]*"/g, 'X').trim().split('\r\n').length));
}

/* --- 7) Dní do dražby ----------------------------------------------
   Počítá se ode dneška, takže se porovnává proti pevnému dni — jinak by
   zkouška začala padat zítra. */
{
  pravda('budoucí termín dá kladné číslo',
    V.dniDo('dražba 2026-11-01', new Date(2026, 9, 7)) === 25,
    String(V.dniDo('dražba 2026-11-01', new Date(2026, 9, 7))));
  pravda('a minulý termín záporné (ať je poznat, že proběhl)',
    V.dniDo('dražba 2026-09-30', new Date(2026, 9, 7)) === -7,
    String(V.dniDo('dražba 2026-09-30', new Date(2026, 9, 7))));
  pravda('bez termínu zůstane prázdno', V.dniDo('inzerát') === '',
    JSON.stringify(V.dniDo('inzerát')));
}

/* --- 8) Body do navigace (GPX) -------------------------------------
   Tabulka je pro počítání, tohle pro cestu: kdo si vybere pět pozemků,
   chce je mít v telefonu a objet je. GPX čte Mapy.cz, Locus i Garmin. */
{
  const D = [
    { place: 'Kolín & okolí', type: 'drazba', druh: 'orná', area: 1000,
      price: 500000, lat: 50.0281, lng: 15.2003, extra: 'dražba 2026-11-01',
      url: 'https://example.invalid/a?x=1&y=2' },
    { place: 'Bez polohy', type: 'sale', price: 100000 },
  ];
  const g = V.gpx(D, { zaMetr: () => 500, ted: new Date('2026-10-07T08:00:00Z') });
  pravda('je to GPX', /^<\?xml[^>]*\?>\n<gpx /.test(g), g.slice(0, 60));
  pravda('a má právě jeden bod (nabídka bez souřadnic se vynechá)',
    (g.match(/<wpt /g) || []).length === 1, String((g.match(/<wpt /g) || []).length));
  pravda('v názvu bodu je obec i cena',
    /<name>Kolín &amp; okolí · 500[\s ]000 Kč<\/name>/.test(g),
    (g.match(/<name>[^<]*<\/name>/) || [''])[0]);
  /* Ampersand v názvu i v odkazu musí být zapsaný jako &amp;, jinak je
     soubor nevalidní XML a navigace ho odmítne otevřít — tiše. */
  pravda('a zvláštní znaky jsou zapsané jako XML',
    g.indexOf('x=1&y=2') === -1 && g.indexOf('x=1&amp;y=2') > 0,
    (g.match(/<link[^>]*>/) || [''])[0]);
  pravda('a soubor je uzavřený', /<\/gpx>\n$/.test(g), JSON.stringify(g.slice(-8)));
  pravda('přípona v názvu souboru jde zvolit',
    V.nazev('dražby', new Date(2026, 9, 7), 'gpx') === 'parcelka-2026-10-07-drazby.gpx',
    V.nazev('dražby', new Date(2026, 9, 7), 'gpx'));
  pravda('a bez zvolení zůstává csv',
    V.nazev('', new Date(2026, 9, 7)) === 'parcelka-2026-10-07.csv',
    V.nazev('', new Date(2026, 9, 7)));
}

console.log('\nVývoz do tabulky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Vývoz do tabulky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
