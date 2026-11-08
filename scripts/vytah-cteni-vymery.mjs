/* =====================================================================
   VÝTAH ČTECÍCH FUNKCÍ VÝMĚRY ZE ZDROJE ROBOTA — NA JEDNOM MÍSTĚ
   =====================================================================

   KDO TO VOLÁ: scripts/test-vymera-z-textu.mjs a
   scripts/test-slepena-vymera.mjs. Oba hlídači potřebují pustit
   parseArea() a parseAreaPopis() samostatně — zbytek
   fetch-opportunities.mjs by chtěl síť, takže se funkce vytáhnou ze
   zdroje jako text a spustí.

   PROČ ZVLÁŠŤ, KDYŽ TO BYLY DVA ŘÁDKY V KAŽDÉM: protože každý
   hlídač měl SVŮJ seznam toho, co se vytahuje — a 8. 11. jsem do
   robota přidal společnou konstantu AREA_CISLO s přepočtem
   areaZeShody(). Do seznamu v test-vymera-z-textu jsem ji dopsal,
   do toho v test-slepena-vymera zapomněl, a ten hlídač spadl na
   „AREA_CISLO is not defined". Zkouška, která spadne na vlastní
   nepřesnosti, neřekne nic o webu — jen ukradne čas.

   Je to §438-třída vady: klíč, který zná jen zkouška. Dva seznamy
   téhož se rozejdou při první změně, a rozejdou se TIŠE — spadne
   ten, na který se zapomnělo, a vypadá to jako vada v robotovi.

   CO SE TU NEDĚJE: nic se nenahrazuje re-exportem. Kdyby si hlídači
   funkce naimportovali, měřili by, co robot vyváží, ne co má ve
   zdroji — a společná chyba v obojím by prošla. Vytahuje se dál
   TEXT ZE ZDROJE, jen se seznam kusů píše jednou.
   ===================================================================== */

import { readFileSync } from 'node:fs';

/* Kusy v tomhle pořadí: nejdřív společný vzorek s přepočtem, pak obě
   čtecí funkce. Pořadí je důležité — AREA_CISLO musí být deklarované
   dřív, než ho parseArea použije. */
const KUSY = [
  { jmeno: 'AREA_CISLO + areaZeShody', vzor: /const AREA_CISLO[\s\S]*?\nfunction areaZeShody[\s\S]*?\n}/ },
  { jmeno: 'parseArea', vzor: /function parseArea\(text\)[\s\S]*?\n}/ },
  { jmeno: 'AREA_POZEMEK + parseAreaPopis',
    vzor: /const AREA_POZEMEK[\s\S]*?\nfunction parseAreaPopis[\s\S]*?\n  return null;\n}/ },
];

/**
 * Vytáhne čtení výměry ze zdroje robota a vrátí
 * { ok, funkce: { parseArea, parseAreaPopis }, chybi: [jména] }.
 * Když některý kus chybí (přejmenování), `ok` je false a `chybi`
 * říká které — hlídač to má HLÁSIT, ne tiše projít.
 */
export function vytahniCteniVymery(cestaKRobotu) {
  const src = readFileSync(cestaKRobotu, 'utf8');
  const nalezene = KUSY.map((k) => ({ ...k, shoda: src.match(k.vzor) }));
  const chybi = nalezene.filter((k) => !k.shoda).map((k) => k.jmeno);
  if (chybi.length) return { ok: false, funkce: null, chybi };
  const telo = nalezene.map((k) => k.shoda[0]).join('\n');
  // eslint-disable-next-line no-new-func
  const funkce = new Function(telo + '; return { parseArea, parseAreaPopis };')();
  return { ok: true, funkce, chybi: [] };
}
