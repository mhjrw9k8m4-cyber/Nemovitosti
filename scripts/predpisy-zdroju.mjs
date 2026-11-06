/* PŘEDPISY PRO ČTENÍ VÝPISŮ — co obecná čtečka sama neuhodne.
 * ===================================================================
 * PROČ TENHLE SOUBOR VZNIKL (§452). Obecná čtečka má tři cesty:
 * JSON-LD, mikrodata a „signál". První dvě čtou tvar, který web sám
 * o sobě říká — tam se nedá splést, co k čemu patří. Když ale web
 * nic takového nemá, zbude „signál", a ta prochází CELOU STRÁNKU
 * najednou: posbírá čísla u „m²" a čísla u „Kč" a spáruje je podle
 * blízkosti.
 *
 * Na výpisu s dvaceti nabídkami vedle sebe to dává nesmysly. Změřeno
 * 5. 11. na verejnedrazby.cz (běh 42070736435): týž areál měl na
 * jedné cestě výměru 3 013 m² a na druhé 2 666, provozní budova 406
 * i 2 666, víceúčelový areál 8 703 i 52 235. Dát to na web znamená
 * napsat tam nepravdu, ne mezeru — proto se ty zdroje nezapojily.
 *
 * PŘEDPIS JE ODPOVĚĎ: řekne, čím jeden záznam končí, a čtečka pak
 * hledá cenu, výměru i místo JEN UVNITŘ TOHO ZÁZNAMU. Číslo z osmé
 * nabídky se tím k první nemá jak dostat.
 *
 * ZŮSTÁVÁ TO ŘÁDKEM V REGISTRU, NE NOVÝM STAHOVAČEM (§225). Tenhle
 * soubor nese jen DATA — vzory a popisky. Čte je jedna funkce
 * (`zZaznamu` v cteni-zdroje.mjs), stejná pro všechny zdroje.
 * =================================================================== */

/* POPISKY VÝMĚRY V POŘADÍ DŮLEŽITOSTI. Název nabídky obsahuje výměr
   několik: „užitná plocha 371 m2, pozemky celkem 11.770 m2". Bez
   popisku by se vzala první, tedy podlahová plocha BUDOVY — a na web
   by šel dům o 371 m² jako pozemek. Hledá se proto popisek, a teprve
   u něj číslo; co je dřív v tomhle seznamu, vyhrává. */
export const POPISKY_VYMERY = [
  'pozemky celkem', 'pozemek celkem', 'celková výměra', 'celkova vymera',
  'pozemky', 'pozemek', 'výměra', 'vymera',
];

export const PREDPISY = {
  /* ----------------------------------------------------------------
     VEŘEJNÉ DRAŽBY (Gaute) — změřeno 6. 11. 2026, ohledání
     v bězích 42149142802 a 42149357…, adresa
     https://www.verejnedrazby.cz/vypis-aukci.

     PRVNÍ NÁLEZ BYL, ŽE SE ČETLA ŠPATNÁ STRÁNKA. Bot i sonda mířily
     na domovskou stránku, a ta je jen vývěska — výpis visí na
     /vypis-aukci a v menu se jmenuje „aukce-dražby". Odtud ty „8 až 9
     nabídek" i to nesmyslné párování: nečetl se výpis.

     Skutečný výpis má 8 stránek (?&pos=20 … pos=140, tedy kolem 160
     nabídek) a jeden záznam vypadá takhle (doslovný přepis měření):

       Aktivní Prodej souboru 3 pozemků-lesní pozemek, stráň, jiná
       plochá, celková výměra 5.221 m2, Bojanov u Dolní Libochové,
       Žďár nad Sázavou ( Výběrové řízení - 3 kola) Čas do konce:
       8 hodin 42 minut (06.11.2026 12:00:00) Min. cena: 167 000 Kč
       Evid. číslo: A8070

     Tři vlastnosti, které z toho dělají spolehlivý předpis:
     · číslo záznamu PÁRUJE S ODKAZEM — „Evid. číslo: A8070" a odkaz
       /aukce/…-8070/. Nabídka se ke své adrese přiřadí jistotou,
       ne blízkostí, a to je přesně to, co „signálu" chybělo;
     · výměra má v názvu POPISEK (viz POPISKY_VYMERY výš);
     · místo stojí na konci názvu před závorkou: „Hněvčeves, Hradec
       Králové", „Mladkov, Ústí nad Orlicí", „Dolní Hořice, Jihočeský
       kraj“ — tedy obec a za čárkou okres nebo kraj.

     CENA MÁ DVA POPISKY: „Cena:" u dynamických výběrových řízení
     a „Min. cena:" u tříkolových. Obojí je vyvolávací částka, ne
     dosažená — proto se nabídky vedou jako dražby, ne jako prodej.

     NENÍ TO JEN POZEMKY a není to nedopatření: na výpisu jsou i
     garáže, byty, rodinné domy a výrobní areály. Web o nemovitostech
     mluvit umí (§245), takže se zařadí podle druhu — jen se z nich
     nesmí stát „pozemek". O tom rozhoduje kategorieZNazvu().
     ---------------------------------------------------------------- */
  'verejnedrazby.cz': {
    jmeno: 'Veřejné dražby',
    vypis: 'https://www.verejnedrazby.cz/vypis-aukci',
    /* Další stránky výpisu. Krok 20 je naměřený z odkazů stránkování
       (?&pos=20, 40, 60 … 140), ne zvolený. */
    dalsiStranky: { parametr: '?&pos=', krok: 20, stropStranek: 8 },
    typ: 'drazba',
    /* Konec záznamu. Závorka je schválně: vrací se číslo BEZ „A“,
       protože právě tím se páruje s odkazem /aukce/…-8070/. */
    konecZaznamu: /Evid\.\s*číslo:\s*A(\d+)/g,
    /* Začátek záznamu uvnitř useknutého kusu. Co je před ním, patří
       předchozímu záznamu (nebo hlavičce stránky). */
    zacatekZaznamu: /Aktivní\s+/,
    /* Název končí u závorky s typem řízení. */
    nazevKonci: /\s*\(\s*(?:Výběrové řízení|Veřejná dražba|Aukce|Dražba)/i,
    cena: /(?:Min\.\s*cena|Cena)\s*:\s*([\d\s .,]+)\s*Kč/i,
    odkazVzor: /\/aukce\/[^"'\s]*?-(\d+)\/?$/i,
  },
};

/* Z názvu nabídky se pozná, co to vlastně je. POŘADÍ ROZHODUJE:
   „Prodej garáže, výměra 20 m², vlastní pozemek" je GARÁŽ, ne pozemek,
   i když se tam slovo „pozemek" vyskytuje. Proto se stavby hledají
   dřív než pozemky. */
export const DRUHY_PODLE_NAZVU = [
  [/\bgaráž/i, 'garáž', 'stavba'],
  [/bytov[éá] jednotk|\bbyt\b|podlahová plocha/i, 'byt', 'stavba'],
  [/rodinn(?:ý|ého) dom|\bRD\b|usedlost|rekreačního objektu|chat[ay]\b/i, 'dům', 'stavba'],
  [/areál|výrobní|sklad|administrativ|provozní budov/i, 'areál', 'stavba'],
  [/stavebn(?:í|ího) pozem/i, 'stavební pozemek', 'pozemek'],
  [/lesní pozem/i, 'lesní pozemek', 'pozemek'],
  [/orná půda|orné půdy/i, 'orná půda', 'pozemek'],
  [/trvalý travní|louk[ay]\b|pastvin/i, 'trvalý travní porost', 'pozemek'],
  [/zahrad/i, 'zahrada', 'pozemek'],
  [/vinice/i, 'vinice', 'pozemek'],
  [/pozem/i, 'pozemek', 'pozemek'],
];

/**
 * Co je ta nabídka podle názvu: { druh, kategorie } nebo null.
 * Nic neuhodne — když název nic z toho neobsahuje, vrátí null
 * a volající se rozhodne, jestli takovou nabídku vůbec chce.
 */
export function kategorieZNazvu(nazev) {
  const s = String(nazev || '');
  for (const [re, druh, kategorie] of DRUHY_PODLE_NAZVU) {
    if (re.test(s)) return { druh, kategorie };
  }
  return null;
}

/**
 * Je to spoluvlastnický podíl? U podílu je cena za zlomek a výměra
 * celá, takže „cena za metr" by lhala — web to proto vede zvlášť.
 * Naměřené tvary: „spoluvlastnického podílu o velikosti id. 1/20",
 * „podílu id 1/2", „spoluvlastnické podíly id. 1/2".
 */
export function podilZNazvu(nazev) {
  const m = /podíl\w*\s+(?:o\s+velikosti\s+)?id\.?\s*(\d+)\s*\/\s*(\d+)/i.exec(String(nazev || ''));
  return m ? `${m[1]}/${m[2]}` : null;
}
