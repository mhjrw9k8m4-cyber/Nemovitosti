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

/* OTISK INZERENTA — kdo tu nabídku napsal, poznané podle jeho textu.
 *
 * PROČ TO VŮBEC CHCEME. Verdikt „Výhodná cena" znamená „levnější než
 * X % srovnatelných nabídek". Naměřeno 23. 10. na ostrých datech: ze
 * 1 932 nabídek je 900 (47 %) od JEDNOHO velkoobchodníka a ve 28 ze
 * 47 přihrádek okres+druh, které mají aspoň deset nabídek, drží
 * nadpoloviční většinu — jinde i 86 až 100 %. Percentil pak nesrovnává
 * s trhem, ale s jeho cenníkem. Změřeno týmž modelem, jaký běží na
 * webu: bez jeho nabídek by se percentil změnil u 209 ze 474 verdiktů
 * (44 %), v průměru o 6,6 p.b., a 33 pozemků by dostalo odznak
 * „Výhodná cena", který dnes nemají. Žádný by o něj nepřišel — to
 * zkreslení má jeden směr: ostatní vypadají dražší, než jsou.
 *
 * JAK SE POZNÁ. Data jméno inzerenta nenesou; nese ho jeho vlastní
 * text. Velkoobchod posílá u všech nabídek tutéž úvodní větu, takže
 * otisk je prvních šedesát znaků popisu, srovnaných do jedné podoby
 * (malá písmena, jedna mezera, pomlčky a uvozovky na jeden znak)
 * a zahašovaných. Naměřeno: 1 635 popisů dá 639 inzerentů, největší
 * 927 nabídek, druhý šest, a 594 inzerentů má jedinou nabídku.
 *
 * Srovnání pomlček není kosmetika: týž velkoobchodník používá raz
 * spojovník, raz pomlčku, a bez srovnání vyšel jako dva inzerenti
 * (513 + 414 nabídek).
 *
 * CHYBUJE SE RADĚJI NA STRANU „neznámý". Krátký popis otisk nedostane
 * (pod třicet znaků už to není podpis, ale náhoda) a nabídka bez
 * popisu taky ne — ta se pak počítá sama za sebe, což je u nabídky od
 * jednotlivce pravda. Dva různí inzerenti se stejným začátkem by se
 * slili v jednoho; to oslabí opravu, ale nevymyslí nic, co v datech
 * není.
 */
export function otiskInzerenta(text) {
  const s = String(text == null ? '' : text)
    .replace(/[‐-―]/g, '-')     // spojovníky a pomlčky na jeden znak
    .replace(/[“”„‘’]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 60);
  if (s.length < 30) return null;
  /* Krátký otisk stačí: pojmenovává se jím pár set inzerentů, ne
     obsah. Šest znaků šestnáctkové soustavy je 16 milionů možností,
     takže na 639 jmen je šance na shodu zanedbatelná. Vlastní hash,
     protože node:crypto by sem tahal závislost kvůli šesti znakům —
     a FNV-1a je deset řádků, které se dají přečíst. */
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}
