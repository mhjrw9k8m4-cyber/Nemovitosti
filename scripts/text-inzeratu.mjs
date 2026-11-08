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

/* CIZÍ REKLAMA Z POPISU VEN.
 *
 * NAMĚŘENO 23. 10.: ze 2 233 stránek pozemků jich 979 (44 %) vypisovalo
 * prodejní text jednoho velkoobchodníka — „U nás nakupujete přímo od
 * vlastníka…", „Pomáháme lidem bezpečně investovat do pozemků…",
 * „Přidejte se k těm, kteří vsadili na jistotu…". Na stránce Parcelky
 * se „u nás" čte jako Parcelka, takže web slibuje něco, co neslíbil,
 * a devět set stránek má totožný úvodní odstavec.
 *
 * PRAVIDLO JE Z MĚŘENÍ, NE ZE SEZNAMU ZAKÁZANÝCH VĚT: věta, která
 * stojí v padesáti a více různých nabídkách, není popis TOHOHO pozemku.
 * Na ostrých datech takových vět vyšlo DEVĚT a jsou to právě ty
 * prodejní; nic věcného mezi nimi není. Seznam by zestaral, měření se
 * přepočítá při každém sestavení.
 *
 * DĚLENÍ NA VĚTY MUSÍ UMĚT ZKRATKY. „k.ú. Horusice LV č. 26 o výměře
 * 3772 m²" obsahuje čtyři tečky a žádný konec věty — s obyčejným
 * dělením podle tečky vyšly jako „věty v 1 286 nabídkách" úlomky
 * „Parcela č." a „k.ú.", které by pravidlo zahodilo jako reklamu
 * a stránka by přišla právě o ta fakta, pro která tam popis je.
 *
 * CO ZŮSTANE: medián popisu klesl ze 406 na 277 znaků (−32 %), ani
 * jeden popis nezmizel celý a všech 1 312 popisů s parcelními údaji
 * („Parcela č.", „k.ú.") je má dál. Hlídá to scripts/test-inzerenti.mjs.
 */
const ZKRATKY = /(?:č|ú|k\.ú|tj|mj|např|resp|tzv|atd|apod|cca|ks|m|LV|st|p)\.$/i;

export function vetyPopisu(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const casti = [];
  let buf = '';
  for (let i = 0; i < t.length; i++) {
    buf += t[i];
    if ('.!?'.includes(t[i]) && t[i + 1] === ' ') {
      const b = buf.trim();
      /* Nedělit po zkratce ani po číslu s tečkou („Parcela č. 2252/11",
         „LV č. 26", „1. patro"). */
      if (!ZKRATKY.test(b) && !/\b\d+\.$/.test(b)) { casti.push(b); buf = ''; }
    }
  }
  if (buf.trim()) casti.push(buf.trim());
  const ven = [];
  for (const c of casti) {
    for (const x of c.split(' • ')) {
      const v = x.replace(/^[\s•\t‌]+|[\s•\t‌]+$/g, '');
      if (v) ven.push(v);
    }
  }
  return ven;
}

/** V kolika různých popisech ta věta stojí. Vstup: pole popisů. */
export function pocetnostVet(popisy) {
  const pocty = new Map();
  for (const t of popisy) {
    for (const v of new Set(vetyPopisu(t))) pocty.set(v, (pocty.get(v) || 0) + 1);
  }
  return pocty;
}

/* ZNAK, KTERÝ NAŠE PÍSMO NEUMÍ, VYHODÍ CELOU VĚTU.
 *
 * Písma jsou podřezaná na latinku s češtinou (fonts/PUVOD.md, SADA:
 * U+0020-007E, U+00A0-00FF, U+0100-017F, interpunkce a šipky). Co v té
 * sadě není, vykreslí prohlížeč SYSTÉMOVÝM písmem — uprostřed věty,
 * jiným řezem i velikostí. Vyhazuje se proto VĚTA, ve které takový
 * znak stojí — stejným pravidlem, jakým se vyhazuje věta s telefonem:
 * půlka věty je horší než žádná. Doplňovat znaky do sady je cesta do
 * nekonečna: azbuku kvůli jednomu inzerátu znamená stáhnout každému
 * návštěvníkovi další abecedu, a zítra přijde inzerát s čínštinou.
 *
 * PROČ TO STOJÍ TADY, A NE U ROBOTA. Původně to bylo jen v cistyPopis
 * v scripts/fetch-opportunities.mjs, tedy na vstupu dat. Stránka
 * UKONČENÉ nabídky se ale z dat nestaví: její HTML se bere hotové
 * a popis v něm zůstal v té podobě, v jaké byl vygenerovaný dřív
 * (viz migrujPopisBezReklamy v scripts/generate-parcel-pages.mjs).
 * Po zavedení pravidla u robota proto jedna taková stránka dál
 * vypisovala ⸻ (U+2E3B, pozemek-praha-kloboucnicka-1l60dta.html):
 * v data/popisy.json už nebyla, na webu ještě byla. Pravidlo tedy
 * patří do bezReklamy, kterým chodí OBĚ cesty — živá i archivní.
 *
 * SADA SE TU OPISUJE jako rozsahy, ne jako výčet znaků: je to táž mez
 * jako v fonts/PUVOD.md a scripts/test-pisma.mjs ji na skutečných
 * stránkách přeměřuje. Latinka s diakritikou zůstává celá, takže
 * „Fügnerova“ ani „Žďár“ o nic nepřijdou. */
export const MIMO_SADU = /[^\u0020-\u007E\u00A0-\u00FF\u0100-\u017F\u2000-\u206F\u20A0-\u20BF\u2190-\u21FF\u2022\u2113\u2122\u2212\u2215\u2264\u2265\u25CF\u2665\u2713\u2715\u0131\u0152\u0153\u02BB\u02BC\u02C6\u02DA\u02DC\u0304\u0308\u0329\uFEFF\uFFFD\s]/u;

/** Stojí ve větě znak, který naše podřezané písmo neumí vykreslit? */
export function mimoSadu(veta) {
  return MIMO_SADU.test(String(veta == null ? '' : veta));
}

/* Padesát je měřené, ne vymyšlené: při této mezi vyjde devět vět a
   všechny jsou prodejní. Nejbližší věcná věta pod mezí stojí v 36
   nabídkách („Pozemek je v územním plánu veden jako…"), takže je mezi
   čím a čím volit. */
export const MEZ_OPAKOVANI = 50;

export function bezReklamy(text, pocty, mez) {
  const m = mez || MEZ_OPAKOVANI;
  const ven = vetyPopisu(text)
    .filter((v) => (pocty.get(v) || 0) < m)
    .filter((v) => !mimoSadu(v));
  let zbytek = ven.join(' ');
  /* A JEŠTĚ JAKO ÚRYVEK, NE JEN JAKO VĚTA. Naměřeno: po prvním kroku
     zůstala reklama ve 298 popisech — ne proto, že by byla jiná, ale
     protože se k ní faktická část přilepila bez tečky:
     „…Parcela č. 3619/57 - o výměře 4815 m² (Lesní pozemek) Pomáháme
     lidem bezpečně investovat…". Dělení podle vět to vzalo jako jednu
     větu a ta v padesáti nabídkách není. Seznam úryvků je týž, co
     vyšel z měření — nic se k němu nedopisuje rukou. */
  for (const [veta, kolik] of pocty) {
    if (kolik < m) continue;
    let i = zbytek.indexOf(veta);
    while (i >= 0) { zbytek = zbytek.slice(0, i) + zbytek.slice(i + veta.length); i = zbytek.indexOf(veta); }
  }
  return zbytek.replace(/\s{2,}/g, ' ').trim();
}
