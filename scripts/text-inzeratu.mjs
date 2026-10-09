/* ÚKLID CIZÍHO TEXTU Z INZERÁTU.
 *
 * Popis od inzerenta je jediný volný cizí text, který se na web
 * dostane celý. Bývá v něm marketingová ozdoba: „📝 Popis
 * nemovitosti", „✨ k prodeji", „🏡". Žádné textové písmo takový znak
 * nemá — vykreslí se systémovým emodži písmem uprostřed věty, tedy
 * jinou velikostí i barvou, a na webu, který jinak emodži nikde
 * nepoužívá, to vypadá jako cizí těleso.
 *
 * Našla to scripts/test-pisma.mjs: prohledá všechny zdroje webu
 * (2 210 souborů, 160 různých znaků) a ohlásí každý, který není
 * v podřezané sadě písem (SADA v fonts/PUVOD.md).
 *
 * Čistí se PŘI STAHOVÁNÍ, ne při skládání stránek: tady text do
 * repozitáře vstupuje a je to jedno místo. Kdyby se čistil až
 * v generátoru, zůstala by ozdoba v data/popisy.json, který se
 * publikuje taky.
 *
 * NEMAŽE SE VÍC, NEŽ JE POTŘEBA. Znaky, které v textu nesou význam —
 * °, ², ×, –, €, šipky, zaškrtnutí ✓ — v podřezané sadě jsou
 * a zůstávají. Jdou pryč jen obrázkové bloky a výběrový znak za nimi.
 */
const EMODZI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2716}-\u{27BF}\u{FE0F}]/gu;

export function bezEmodzi(text) {
  return String(text == null ? '' : text)
    .replace(EMODZI, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
