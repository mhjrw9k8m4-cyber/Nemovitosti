/* Test: stav mapy v adrese (js/odkaz.js).
 *
 * Spuštění: node scripts/test-odkaz.mjs
 *
 * Dvě věci se tu můžou pokazit, a každá jinak nepříjemně:
 *
 *   · TICHÁ ZTRÁTA FILTRU. Kdo si nastaví šest věcí a pošle odkaz, čeká,
 *     že příjemce uvidí totéž. Když se jeden filtr do adresy nedostane,
 *     odkaz pořád „funguje" — jen ukazuje něco jiného a nikdo to nepozná.
 *     Proto se tu čte js/main.js a každá proměnná, podle které se
 *     filtruje, musí být zařazená: buď se sdílí, nebo je napsané proč ne.
 *
 *   · ÚNIK OSOBNÍHO ÚDAJE. Mezi filtry je i „do 10 km ode mě". V odkazu
 *     by to byly GPS souřadnice odesílatele. Sdílet výřez mapy nesmí
 *     znamenat prozradit, kde bydlím.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = createRequire(import.meta.url)(path.join(ROOT, 'js', 'odkaz.js'));

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}
const stejne = (popis, a, b) => pravda(popis, JSON.stringify(a) === JSON.stringify(b),
  `čekáno ${JSON.stringify(b)}, vyšlo ${JSON.stringify(a)}`);

/* --- 1) Tam a zpátky beze ztráty ------------------------------------ */
{
  const stav = {
    poloha: { lat: 50.08123, lng: 14.43123, zoom: 15 },
    activeType: 'exekuce', druhVybrane: ['orná půda', 'zahrada'],
    minPrice: 50000, maxPrice: 300000, minArea: 500, maxArea: 5000,
    maxPerM2: 40, zadaneVybaveni: ['voda', 'cesta'],
    jenCelek: true, urgentOnly: true, levneOnly: true, zlevneneOnly: true, ukazPodobne: true,
    selectedKraj: 'Středočeský kraj', hledani: 'Kolín 412/3',
    mistoObec: 'Zásmuky', mistoOkres: 'Kolín',
  };
  const zpet = O.cti(O.zapis(stav));
  /* Předpoklad: kdyby zapis() vracel prázdno, všechny kontroly níž by
     prošly na prázdné množině. */
  pravda('nastavený stav se v adrese projeví', O.zapis(stav).length > 40, O.zapis(stav));
  for (const s of O.SDILENE) {
    stejne(`„${s.stav}" přežije cestu tam a zpátky`, zpet[s.stav], stav[s.stav]);
  }
  stejne('poloha a přiblížení taky', zpet.poloha, stav.poloha);
}

/* --- 2) Výchozí stav nesmí nic psát --------------------------------- */
{
  stejne('prázdný stav dá prázdnou adresu', O.zapis({}), '');
  stejne('a výchozí typ „all" se taky nepíše', O.zapis({ activeType: 'all' }), '');
  stejne('ani nuly a vypnuté přepínače',
    O.zapis({ minPrice: 0, maxPrice: 0, jenCelek: false, druhVybrane: [], hledani: '' }), '');
}

/* --- 3) Rozbitá adresa nesmí nic shodit ----------------------------- */
{
  const pasti = ['', '#', '#nesmysl', '#m=', '#m=abc,def,x', '#m=999,999,9',
    '#t=', '#cd=-5', '#cd=nic', '#d=', '#%%%', '#q=%E0%A4%A', '#celek=2',
    '#m=50,14,12&neznamy=1'];
  let spadlo = null;
  for (const p of pasti) { try { O.cti(p); O.jeStavMapy(p); } catch (e) { spadlo = `${p} → ${e.message}`; break; } }
  pravda('na rozbité adrese se nic nerozbije', spadlo === null, spadlo);
  stejne('nesmyslná poloha se zahodí', O.cti('#m=999,999,9').poloha, undefined);
  stejne('záporná cena se zahodí', O.cti('#cd=-5').maxPrice, undefined);
  stejne('neznámý klíč se zahodí', O.cti('#m=50,14,12&neznamy=1').neznamy, undefined);
  stejne('„celek=2" není zaškrtnuto', O.cti('#celek=2').jenCelek, false);
}

/* --- 4) Kotvy se s tím nepletou ------------------------------------- */
{
  pravda('#podminky není stav mapy', O.jeStavMapy('#podminky') === false);
  pravda('#soukromi taky ne', O.jeStavMapy('#soukromi') === false);
  pravda('prázdný hash taky ne', O.jeStavMapy('') === false);
  pravda('ale #m=… ano', O.jeStavMapy('#m=50.0,14.4,12') === true);
  pravda('a #t=exekuce taky', O.jeStavMapy('#t=exekuce') === true);
}

/* --- 5) OSOBNÍ ÚDAJE SE DO ADRESY NESMÍ DOSTAT ---------------------- */
{
  /* Kdyby někdo omylem přidal mojeMisto mezi sdílené, tahle kontrola to
     chytne: do adresy nesmí proniknout nic z toho seznamu. */
  const sNavic = { poloha: { lat: 50, lng: 14, zoom: 10 } };
  for (const n of O.NESDILENE) sNavic[n.stav] = (n.stav === 'mojeMisto')
    ? { lat: 49.1234, lng: 16.5678, km: 10 } : true;
  const adresa = O.zapis(sNavic);
  const unik = O.NESDILENE.filter((n) => {
    const v = O.cti(adresa)[n.stav];
    return v !== undefined;
  }).map((n) => n.stav);
  stejne('nic z nesdílených se do adresy nedostane', unik, []);
  pravda('a GPS souřadnice v ní nejsou ani jako text',
    adresa.indexOf('49.12') < 0 && adresa.indexOf('16.56') < 0, adresa);
  /* Předpoklad: ta adresa není prázdná, jinak by kontrola výš neměřila nic. */
  pravda('(a přitom adresa prázdná není — jinak by se měřilo prázdno)',
    adresa.length > 0, adresa);
}

/* --- 6) KAŽDÝ FILTR MUSÍ BÝT ZAŘAZENÝ ------------------------------- */
{
  /* Tahle kontrola je důvod, proč test vznikl. Čte se filtrovací funkce
     z js/main.js a každá proměnná, kterou používá, musí být buď mezi
     sdílenými, nebo mezi vědomě nesdílenými, nebo na seznamu pomocných.
     Kdo přidá filtr a nezařadí ho, dozví se to tady — ne až od člověka,
     kterému sdílený odkaz ukázal něco jiného. */
  const src = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  /* ČTOU SE DVĚ FUNKCE, NE JEDNA. Filtrování rozhoduje, CO je vidět;
     řazení rozhoduje, V JAKÉM POŘADÍ — a to je druhá půlka toho, co
     člověk na obrazovce má. Dokud se tu četlo jen filtrování, chybělo
     v odkazu řazení a nikdo se to nedozvěděl ze zdroje; přišlo se na to
     až zkouškou celého kolečka v prohlížeči. */
  for (const [nazev, kde] of [['filtrovací', 'function visible(d)'], ['řadicí', 'function sortVis(arr)']]) {
  const zacatek = src.indexOf(kde);
  pravda(`${nazev} funkce se v js/main.js našla`, zacatek > 0,
    'bez ní tahle kontrola neměří nic');
  if (zacatek > 0) {
    let hloubka = 0, i = src.indexOf('{', zacatek), konec = i;
    for (; konec < src.length; konec++) {
      if (src[konec] === '{') hloubka++;
      else if (src[konec] === '}') { hloubka--; if (!hloubka) break; }
    }
    // Komentáře a texty pryč, jinak by se do jmen připletla česká slova.
    const telo = src.slice(i, konec)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ' ')
      /* Vlastnosti pryč: „dotazFiltr.cenaOd" je JEDEN stav, ne dva.
         Zajímají nás holé proměnné — ty jsou ten stav, na kterém se
         filtruje. */
      .replace(/\.\s*[A-Za-z_$][A-Za-z0-9_$]*/g, ' ');
    const jmena = [...new Set(telo.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) || [])];

    /* Co ve filtrovací funkci není stav, ale nástroj: klíčová slova,
       pomocné funkce a místní proměnné. Seznam je schválně vypsaný —
       cokoli nového spadne do „nezařazeno" a vyžádá si rozhodnutí. */
    const POMOCNE = new Set([
      'var', 'if', 'else', 'return', 'for', 'break', 'function', 'true', 'false', 'null', 'typeof',
      'd', 'vi', 'si', 'mi', 'length', 'indexOf', 'push', 'Math', 'Number', 'isFinite',
      'type', 'price', 'area', 'site', 'podil', 'druh',
      'HL', 'vyhovuje', 'sediMisto', 'presnyNazev', 'jePresna', 'druhVyhovuje',
      'hasArea', 'isUrgent', 'isFav', 'druhSedi', 'krajOf', 'zaMetr', 'jeSkryty', 'jeProsle',
      'nejakeSite', 'SITE_KLICE', 'DNI_KONCI', 'podObvyklou', 'okoli', 'min',
      'okType', 'okSearch', 'okMisto', 'okPresne', 'okDruh', 'okPrice', 'okArea',
      'okUrgent', 'okFav', 'okVybaveni', 'okCelek', 'okDotaz', 'okPerM2', 'okKraj',
      'okOkoli', 'okOkruh', 'okLevne', 'okZlevnene', 'okSkryt', 'okProsle', 'okTvar',
      // zlevnila() se ptá PKZlevneni, jestli u nabídky spadla cena
      'zlevnila', 'PKZlevneni', 'zmena', 'dolu', 'podezrela',
      // PKOkruh je modul (geometrie), ne stav, na kterém se filtruje
      'PKOkruh', 'vTvaru', 'lat', 'lng',
      // z řadicí funkce: místní proměnné a nástroje, ne stav
      'arr', 'a', 'b', 'String', 'Infinity', 'da', 'db', 'pa', 'pb', 'slevaVal', 'o',
      'window', 'LIST_LIMIT', 'isFeatured', 'perM2Val', 'daysUntil', 'MODEL',
      'declump', 'demand', 'pkey', 'MEZ_SLEVA', 'localeCompare', 'sort', 'odhad',
    ]);
    const sdilene = new Set(O.SDILENE.map((x) => x.stav));
    // mistoFiltr se do adresy rozkládá na obec a okres, odtud jiná jména.
    const nesdilene = new Set(O.NESDILENE.map((x) => x.stav));
    const nezarazeno = jmena.filter((j) => !POMOCNE.has(j) && !sdilene.has(j)
      && !nesdilene.has(j) && !/^_/.test(j));
    stejne(`každá proměnná v ${nazev === 'řadicí' ? 'řazení' : 'filtrování'} je zařazená (sdílí se / nesdílí / pomocná)`,
      nezarazeno, []);
    /* A že ta kontrola vůbec něco čte: ve funkci se musí najít aspoň
       jedno jméno, které známe. */
    pravda(`(a ${nazev} funkce se opravdu přečetla)`,
      nazev === 'řadicí' ? jmena.includes('sortMode')
        : (jmena.includes('activeType') && jmena.includes('jenCelek')),
      `nalezeno ${jmena.length} jmen`);
  }
  }
  /* Nesdílené musí mít napsaný důvod — jinak je to jen tichý výmaz. */
  const bezDuvodu = O.NESDILENE.filter((n) => !n.proc || n.proc.length < 10).map((n) => n.stav);
  stejne('u každého nesdíleného filtru stojí, proč se nesdílí', bezDuvodu, []);
  /* A nic nesmí být v obou seznamech zároveň. */
  const vObou = O.SDILENE.filter((s) => O.NESDILENE.some((n) => n.stav === s.stav)).map((s) => s.stav);
  stejne('a nic není v obou seznamech zároveň', vObou, []);
}

console.log(`\nStav mapy v adrese: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Stav mapy v adrese: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
