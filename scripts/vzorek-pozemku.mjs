/* ŽIVÁ STRÁNKA POZEMKU JAKO VZOREK PRO ZKOUŠKY
 * =====================================================================
 * Zkoušky v prohlížeči potřebují „nějakou stránku pozemku", na které se
 * dá měřit tlačítko Uložit, pole poznámky, souřadnice nebo mapa.
 * Dvacet z nich si ten vzorek vybíralo samo, každá vlastním zápisem:
 *
 *     readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0]
 *
 * To je §436-třída: jedno pravidlo opsané na dvaceti místech. A rozešlo
 * se to tiše, protože ten filtr je NEPRAVDIVÝ — ne každá pozemek-*.html
 * je nabídka. Změřeno 8. 11. 2026 na 9 370 stránkách:
 *
 *     živých     3 418
 *     vyřazených 5 137   („Tato nabídka už není aktuální.")
 *     přestěhovaných 815 („Tato stránka se přestěhovala.")
 *
 * Vyřazená i přestěhovaná stránka je schválně dostupná, aby uložené
 * odkazy vedly někam — ale nabídku nevykresluje, takže na ní není ani
 * Uložit, ani poznámka, ani souřadnice. Když dnešní oprava jmen obcí
 * přestěhovala 815 stránek, stala se první v abecedě
 * `pozemek-benesov-112-rww4ws.html` (obec „112" byla ve skutečnosti
 * Vlašim) — a osm zkoušek naráz hlásilo vadu webu tam, kde byla vada
 * ve VÝBĚRU VZORKU.
 *
 * Stav je vidět ze souboru, takže na to není potřeba prohlížeč: obě
 * nefunkční podoby nesou svou větu přímo v HTML. Hledá se proto tady,
 * na jednom místě, a kdo chce vzorek, řekne si o něj.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Věty, kterými se stránka přiznává, že nabídku nenese. Stojí v HTML
   (ne až v JS), takže se pozná bez spuštění stránky. */
export const VETA_VYRAZENA = 'už není aktuální';
export const VETA_PRESTEHOVANA = 'se přestěhovala';

/** 'ziva' | 'vyrazena' | 'prestehovana' — podle obsahu stránky. */
export function stavStranky(soubor) {
  const t = readFileSync(path.join(KOREN, soubor), 'utf8');
  if (t.indexOf(VETA_PRESTEHOVANA) >= 0) return 'prestehovana';
  if (t.indexOf(VETA_VYRAZENA) >= 0) return 'vyrazena';
  return 'ziva';
}

/** Všechny stránky pozemků, seřazené — živé i ne. */
export function vsechnyStranky() {
  return readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort();
}

/**
 * Prvních `kolik` ŽIVÝCH stránek pozemku, v abecedním pořadí.
 * Čte se líně, soubor po souboru: první živá bývá druhá v pořadí,
 * takže se kvůli jednomu vzorku nečte 9 370 souborů.
 */
export function ziveStranky(kolik = 1) {
  const out = [];
  for (const f of vsechnyStranky()) {
    if (stavStranky(f) === 'ziva') out.push(f);
    if (out.length >= kolik) break;
  }
  return out;
}

/**
 * Jedna živá stránka pozemku, nebo null (což zkouška musí umět ohlásit —
 * „není na čem měřit" je jiná zpráva než „web je rozbitý").
 */
export function zivaStranka() {
  return ziveStranky(1)[0] || null;
}

/**
 * Rozprostřený vzorek ŽIVÝCH stránek — `kolik` kusů z celé abecedy, ne
 * jen ze začátku. Zkoušky, které chtějí „pár různých stránek", si dřív
 * braly každou n-tou ze VŠECH souborů; po dnešním měření by jim z dvanácti
 * sedm připadlo na vyřazenou nebo přestěhovanou stránku a výsledek by
 * vypadal jako vada webu (naměřeno 5 z 12 v test-poznamky).
 *
 * Čte se jen to, co je potřeba: z každého kroku se jde dopředu, dokud
 * se nenajde živá, nejvýš `STROP_HLEDANI` souborů — tedy řádově stovky
 * čtení, ne 9 370.
 */
const STROP_HLEDANI = 60;

export function zivyVzorek(kolik = 12) {
  return vzorekStavu('ziva', kolik);
}

/**
 * Totéž pro KTERÝKOLI stav — 'ziva', 'vyrazena', 'prestehovana'.
 *
 * PROČ TO TU JE. Vyřazených stránek je víc než živých a pořád jich
 * přibývá: 9. 11. 2026 bylo z 12 674 stránek 9 241 vyřazených, tedy
 * 73 %. Zkouška, která chtěla „vzorek obou druhů" a brala každou
 * n-tou ze VŠECH souborů, tím přestala mít dost živých: test-graf-vsude
 * naměřil 7 živých ze 40 (žádal 10) a test-cenovy-stupen 3 stránky
 * s verdiktem z 20 (žádal 5). Ani jedno nebyla vada webu — graf vyšel
 * na všech živých i na všech vyřazených. Kdo chce oba druhy, řekne si
 * o každý zvlášť; mez „dost velký vzorek" tím přestává být loterií
 * nad poměrem archivu a mohla zůstat, kde byla.
 */
export function vzorekStavu(stav, kolik = 12) {
  const vse = vsechnyStranky();
  if (!vse.length) return [];
  const krok = Math.max(1, Math.floor(vse.length / kolik));
  const out = [];
  const vzato = new Set();
  for (let i = 0; i < vse.length && out.length < kolik; i += krok) {
    for (let j = i; j < Math.min(vse.length, i + STROP_HLEDANI); j++) {
      if (vzato.has(j)) continue;
      if (stavStranky(vse[j]) === stav) { vzato.add(j); out.push(vse[j]); break; }
    }
  }
  return out;
}
