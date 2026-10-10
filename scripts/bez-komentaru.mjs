/* ====================================================================
   VYHOZENÍ KOMENTÁŘŮ Z KÓDU
   --------------------------------------------------------------------
   Jedna funkce pro všechna místa, která čtou KÓD, ne jeho vysvětlení.
   Byla potřeba dvakrát ze dvou různých důvodů, a to je důvod ji mít
   na jednom místě:

   1. scripts/test-chybova-hlaska.mjs si bez ní našel sám sebe:
      vysvětlení nad lintem cituje ten špatný tvar, který lint hledá.
   2. scripts/rozdel-styly.mjs si bez ní nechával naživu mrtvá
      pravidla: tokeny stránky sbírá jako SLOVA z <style> a <script>,
      takže stačilo, aby komentář ve vloženém stylu zmínil jméno
      třídy, a zkrácený stylopis pro 2 202 stránek si ponechal
      pravidla pro třídu, kterou na webu nikdo nenosí. Naměřeno na
      vlastní kůži: komentář s `.rail .section-head::before` ve
      stránce pozemku vrátil do css/zaklad.min.css sedm pravidel
      pro sloupcové rozvržení úvodní stránky.

   Stav automatu: kód / text v uvozovkách / řádkový komentář /
   blokový komentář. Nové řádky z blokových komentářů zůstávají, aby
   se nerozsypala čísla řádků.
   ==================================================================== */

/** Vyhodí komentáře. `radkove:false` nechá `//` na pokoji — v CSS
    řádkový komentář neexistuje a `url(//cdn…)` by se jím sežral. */
export function bezKomentaru(text, { radkove = true } = {}) {
  let ven = ''; let i = 0; let uvozovka = null;
  while (i < text.length) {
    const c = text[i]; const d = text[i + 1];
    if (uvozovka) {
      ven += c;
      if (c === '\\') { ven += d; i += 2; continue; }
      if (c === uvozovka) uvozovka = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { uvozovka = c; ven += c; i++; continue; }
    if (radkove && c === '/' && d === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') ven += '\n'; i++; }
      i += 2; continue;
    }
    ven += c; i++;
  }
  return ven;
}
