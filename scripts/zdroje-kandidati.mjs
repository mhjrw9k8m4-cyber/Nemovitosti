/**
 * Seznam zdrojů: zapojené i kandidáti.
 * ====================================================================
 * PROČ TENHLE SOUBOR VZNIKL. Změřeno 2. 11. 2026: z 2 004 nabídek na
 * webu jich 1 628 pochází z jediného zdroje (Bezrealitky, 81 %) a ze
 * 2 578 stažených jich tenhle zdroj dodal 1 909 (74 %). Výpadek
 * jednoho webu už data nezmrazí (viz podrzNabidkyVypadlych
 * v scripts/fetch-opportunities.mjs), ale závislost tím nezmizela:
 * když ten web skončí nebo nás odstřihne, přijdou čtyři pětiny obsahu.
 *
 * Řešení není napsat pět stahovačů naslepo. Je to vést seznam
 * kandidátů a PRAVIDELNĚ MĚŘIT, které z nich jde vůbec číst — kdo
 * odpovídá, co dovoluje jeho robots.txt a jestli na té adrese opravdu
 * jsou pozemky. To měří scripts/sonda-zdroju.mjs a zapisuje do
 * data/zdroje-sonda.json. Teprve podle měření se píše stahovač.
 *
 * CO TU NENÍ A NEBUDE. Obcházení ochran proti robotům. Žádné střídání
 * adres ani hlaviček, žádné předstírání prohlížeče, žádné ignorování
 * robots.txt. Robot se představuje jedním jménem (scripts/bot-ua.mjs),
 * a zdroj, který si nepřeje být čten, se číst nebude. Hlídá to
 * scripts/test-sonda-zdroju.mjs.
 *
 * POLE `adresaOverena`. U zapojených zdrojů je adresa ověřená tím, že
 * se z ní čtyřikrát denně stahuje. U kandidátů ne: je to nejlepší
 * odhad vstupní stránky, a jestli platí, řekne až sonda. Nic v kódu
 * se na neověřenou adresu nespoléhá — slouží jen jako cíl měření.
 */

/** Zapojené zdroje. Jména se musí krýt se ZDROJ_JMENA (hlídá zkouška). */
export const ZAPOJENE = [
  { jmeno: 'Dražby', host: 'cevd.gov.cz', typ: 'drazba', adresaOverena: true,
    url: 'https://cevd.gov.cz/opendata/drazby/drazby_2026.json',
    proc: 'Centrální evidence veřejných dražeb — otevřená data státu.' },
  { jmeno: 'OK dražby', host: 'okdrazby.cz', typ: 'drazba', adresaOverena: true,
    url: 'https://www.okdrazby.cz/',
    proc: 'Portál veřejných i exekučních dražeb nemovitostí; dnes jediný zdroj exekučních dražeb.' },
  { jmeno: 'SPÚ', host: 'spu.gov.cz', typ: 'sale', adresaOverena: true,
    url: 'https://spu.gov.cz/nabidky/prehled-cela-cr',
    proc: 'Státní pozemkový úřad — prodeje státní půdy podle § 12.' },
  { jmeno: 'Bezrealitky', host: 'bezrealitky.cz', typ: 'sale', adresaOverena: true,
    url: 'https://api.bezrealitky.cz/graphql/',
    proc: 'Inzeráty od lidí; veřejné GraphQL API. Dnes nese čtyři pětiny obsahu webu.' },
  { jmeno: 'Sreality (Apify)', host: 'sreality.cz', typ: 'sale', adresaOverena: true,
    url: 'https://www.sreality.cz/', proc: 'Největší český portál; čte se přes Apify, aktivní jen s klíčem.' },
  { jmeno: 'Farmy', host: 'farmy.cz', typ: 'sale', adresaOverena: true,
    url: 'https://www.farmy.cz/',
    proc: 'Zemědělská půda a lesy — druh, který jinde na webu téměř nikdo neinzeruje.' },
];

/**
 * Kandidáti. Všichni jsou VEŘEJNÉ nabídky — stát, samospráva nebo
 * komora, tedy místa, kde je zveřejnění součástí zákonného postupu.
 * Adresy jsou odhad vstupní stránky; co z nich platí, řekne sonda.
 */
export const KANDIDATI = [
  { jmeno: 'ÚZSVM — nabídka majetku', host: 'nabidkamajetku.cz', typ: 'sale', adresaOverena: false,
    url: 'https://nabidkamajetku.cz/',
    proc: 'Úřad pro zastupování státu ve věcech majetkových prodává státní pozemky ve'
      + ' výběrových řízeních a zveřejňovat je musí. Je to druhý státní zdroj vedle SPÚ,'
      + ' tedy přesně ten typ, který nezávisí na komerčním portálu.' },
  { jmeno: 'Portál dražeb', host: 'portaldrazeb.cz', typ: 'exekuce', adresaOverena: false,
    url: 'https://www.portaldrazeb.cz/',
    proc: 'Dražby exekutorů. Dnes se exekuční dražby berou jen z OK dražeb (změřeno'
      + ' 2. 11.: 66 nabídek), takže druhý kanál pro týž druh je i pojistka proti výpadku.' },
  { jmeno: 'eDesky', host: 'edesky.cz', typ: 'obec', adresaOverena: false,
    url: 'https://edesky.cz/',
    proc: 'Obec musí záměr prodat pozemek vyvěsit na úřední desku; eDesky úřední desky'
      + ' sdružují. Druh „obec" dnes na webu nemá vlastní zdroj vůbec.' },
  { jmeno: 'Lesy ČR — prodej majetku', host: 'lesycr.cz', typ: 'sale', adresaOverena: false,
    url: 'https://lesycr.cz/',
    proc: 'Státní podnik prodává nepotřebné lesní a jiné pozemky; nabídky zveřejňuje.' },
];

/**
 * Hostitelé, které robot NAŠEL SÁM ve vlastních datech a nemá je
 * v seznamu. Centrální evidence dražeb odkazuje na dražebníky, takže
 * tenhle výpis roste bez toho, aby ho někdo doplňoval — a to je
 * přesně ten druh kandidáta, u kterého se o veřejnosti nabídek nemusí
 * hádat: už ji vidíme ve svých datech.
 *
 * Vrací [{ host, pocet, priklad }] seřazené od nejčastějšího.
 */
export function kandidatiZDat(nabidky, znameHosty) {
  const zname = new Set((znameHosty || [...ZAPOJENE, ...KANDIDATI].map((z) => z.host)));
  const podle = new Map();
  for (const o of (nabidky || [])) {
    let host = '';
    try { host = new URL(String(o && o.url || '')).hostname.toLowerCase(); } catch { continue; }
    const holy = host.replace(/^www\./, '');
    let je = false;
    for (const z of zname) if (holy === z || holy.endsWith('.' + z)) { je = true; break; }
    if (je) continue;
    const zapis = podle.get(holy) || { host: holy, pocet: 0, priklad: '' };
    zapis.pocet++;
    if (!zapis.priklad) zapis.priklad = String(o.url);
    podle.set(holy, zapis);
  }
  return [...podle.values()].sort((a, b) => b.pocet - a.pocet);
}
