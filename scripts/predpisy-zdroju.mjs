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
  /* Skloňovaný tvar, naměřený 6. 11.: „prodej areálu s pozemky
     o výměře 2.383m2 - Nová Ves u Ostravy". Stojí až za „pozemky",
     aby „pozemky celkem" mělo pořád přednost. */
  'výměře', 'vymere',
];

/* A POPISKY PLOCHY STAVBY — druhý seznam, ne tentýž (§453).
 *
 * Ostrý pokus 6. 11. ukázal, proč to nestačí mít jedno: u bytu
 * vyšlo „byt · 67 m²", jenže 67 m² byl POZEMEK a byt měl 129 —
 * „Prodej bytové jednotky (domu), podlahová plocha 129 m2, pozemek
 * 67 m2". Na kartě by stála nepravda, a přesně kvůli nepravdám se
 * ten zdroj nezapojil už jednou.
 *
 * Pravidlo je tedy: u POZEMKU se bere výměra pozemku, u STAVBY
 * plocha stavby. Výměra pozemku se u stavby čte taky, ale vede se
 * zvlášť (vymeraPozemku) — u domu se zahradou je to užitečný údaj,
 * jen to není „velikost domu". */
export const POPISKY_PLOCHY_STAVBY = [
  /* Tři popisky přibyly z DRUHÉHO ostrého pokusu (§453): mezi
     neúplnými nabídkami stálo „plocha budov 52.235m2", „obytná
     plocha 90 m2" a „užitná plocha budov 1.813 m2". Všechno jsou
     plochy stavby, jen jinak pojmenované — bez nich se zahazovaly
     nabídky, které jsou v pořádku. */
  'užitná plocha budov', 'uzitna plocha budov',
  'plocha budov', 'obytná plocha', 'obytna plocha',
  'užitná plocha', 'uzitna plocha',
  /* Skloňovaný tvar, naměřený 6. 11. v „Prodej RD 5+kk s užitnou
     plochou 216 m2, bazén, dvougaráž" — bez něj se ta nabídka
     zahodila jako „chybí výměra", přestože ji uvádí. */
  'užitnou plochou', 'uzitnou plochou',
  'podlahová plocha', 'podlahova plocha',
  'zastavěná plocha', 'zastavena plocha',
  /* S MEZEROU SCHVÁLNĚ: „ÚP 206m2" ano, „úprava terénu 500 m2" ne.
     Bez té mezery by se dvě písmena našla uvnitř běžných slov. */
  'úp ', 'up ',
];

/* OBECNÝ POPISEK — ústup pro stavbu, když vlastní plochu neuvádí.
   „Prodej garáže, výměra 20 m², vlastní pozemek" — těch 20 m² JE ta
   garáž. Kdyby se u staveb couvalo rovnou na seznam pozemků, vzala by
   se výměra pozemku a byla by to zase ta nepravda; „výměra" sama
   o sobě ale mluví o předmětu nabídky, ne o pozemku pod ním. */
export const POPISKY_VYMERY_OBECNE = ['výměra', 'vymera'];

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
    /* ZAČÁTEK ZÁZNAMU JE STAV AUKCE (§455). Před každým názvem stojí
       jedno z pěti slov, naměřeno na živém výpisu 6. 11.:
         „…145 aukcí Prodáno Kolový traktor VALTRA T-SERIES…"
         „…Prodáno Prodej RD, zastavěná plocha 134 m2, Žatec…"
         „…Neprodáno Prodej stavebního pozemku…centrum Brna…"
         „…Zrušeno Prodej RD 5+kk s užitnou plochou 216 m2…"
         „…í Aktivní VEŘEJNÁ DRAŽBA - RD - užitná plocha 63,77 m2…"
       Dřív tu stálo jen /Aktivní\s+/ a u neaktivních aukcí se tedy
       nenašlo nic: stav zůstal v názvu („Prodáno Regály na palety")
       a u dvou záznamů ze 145 se vzal celý filtrační panel stránky
       („Neprodáno Prodáno Ukončeno Zrušeno Kraj Vybrat vše Hlavní
       město Praha Jihočeský…").
       Závorka je schválně: čtečka z ní bere STAV a nese ho dál, takže
       se pak dá rozhodnout, co na web pustit. Hledá se jen před
       koncem názvu, protože za ním stojí „Čas do konce: Ukončeno" —
       tamto „Ukončeno" je čas, ne stav. */
    zacatekZaznamu: /(Aktivní|Neprodáno|Prodáno|Ukončeno|Zrušeno)\s+/,
    /* Které stavy jsou ještě nabídkou. Skončená dražba není nabídka:
       kdo si na webu otevře „Prodáno", je obelhaný. */
    zivyStav: ['Aktivní'],
    /* NÁZEV KONČÍ U ZÁVORKY, ZA KTEROU STOJÍ „Čas do konce:" (§457).
       Dřív tu byl VÝČET typů řízení (Výběrové řízení, Veřejná dražba,
       Aukce, Dražba) a šestý ostrý pokus ukázal, co výčet dělá: web
       má i „( Uzavřená aukce)", na kterou vzor nesedl, takže se konec
       názvu nenašel, značka se chytila na „Ukončeno" z času a šesti
       záznamům zbyl místo názvu zbytek řádku:
         název „(04.11.2026 16:00:00) Cena: 2 746 666 Kč"
         úsek  „…Prodáno 3. KOLO Výběrového řízení - prodej areálu
                s pozemky o výměře 2.383m2 - Nová Ves u Ostravy…
                ( Uzavřená aukce) Čas do konce: Ukončeno (04.11.2026…"
       Byly to pozemky — přesně to, pro co se zdroj zapojuje.
       Kotva je proto to, co za typem řízení stojí VŽDYCKY. Naměřené
       tvary: „( Veřejná dražba - elektronická) Čas do konce:",
       „( Výběrové řízení dynamické) Čas do konce:", „( Výběrové
       řízení - 3 kola) Čas do konce:", „( Uzavřená aukce) Čas do
       konce:". Závorky uvnitř názvu to nerozbije: za „(domu)"
       v „Prodej bytové jednotky (domu), podlahová plocha 129 m2"
       žádné „Čas do konce" není. */
    nazevKonci: /\s*\([^)]*\)\s*Čas do konce:/i,
    cena: /(?:Min\.\s*cena|Cena)\s*:\s*([\d\s .,]+)\s*Kč/i,
    odkazVzor: /\/aukce\/[^"'\s]*?-(\d+)\/?$/i,
  },
};

/* Z názvu nabídky se pozná, co to vlastně je. POŘADÍ ROZHODUJE:
   „Prodej garáže, výměra 20 m², vlastní pozemek" je GARÁŽ, ne pozemek,
   i když se tam slovo „pozemek" vyskytuje. Proto se stavby hledají
   dřív než pozemky. */
/* CO NENÍ NEMOVITOST. Dražebník prodává i věci, které na web
   o nemovitostech nepatří vůbec — změřeno ostrým pokusem 6. 11.:
   „Prodej souboru pohledávek v celkové souhrnné výši 36 104 441,80
   Kč", „Osobní automobil NISSAN NV200, 2012, 201 915 km". Dřív se
   tvářily jako NEÚPLNÁ nabídka (chybí výměra), a to je špatné
   zařazení: nejsou neúplné, jsou cizí. Hledá se to PRVNÍ, před
   druhy — jinak by „pohledávky … z majetku" spadly pod areál. */
export const NENI_NEMOVITOST = [
  /pohledáv/i,
  /osobní automobil|\bvozidl|nákladní auto|přívěs|návěs/i,
  /soubor movitých věcí|movité věci|zásob[ay]\b/i,
  /ochrann[áé] známk|akcie|obchodní podíl ve společnosti/i,
  /* `(?![\p{L}])` místo `\b`: za „ů" hranice slova není, takže
     „Prodej souboru strojů, zařízení" se nepoznalo jako movitá věc
     a spadlo do „nepoznáno". Naměřeno na verejnedrazby.cz, §454. */
  /\bstroj(?:e|ů|ní zařízení)(?![\p{L}])|technologi[ei] linky/iu,
  /* MOVITÉ VĚCI Z TŘETÍHO OSTRÉHO POKUSU (6. 11., §454). Z 31
     nezařazených záznamů na verejnedrazby.cz bylo 29 movitých věcí.
     Tohle nejsou domněnky o tom, co by na dražebním webu mohlo být
     — je to soupis podle naměřených názvů:
       „Regály na palety 64 metrů jedna řada"
       „Vysokozdvižný elektrický vozík BALKANCAR, nosnost 1000 kg"
       „Prodej zásob fotovoltaiky - střídače napětí, panely"
       „Prodej 7.686 ks pánského a dámského oblečení"
       „Autojeřáb Tatra 148-2 AD 20 ČKD"
       „Drtič suti KOMPLET K-JC 503"
       „Kolový traktor ZETOR PROXIMA 6421"
       „IVECO DAILY UNIJET 35C15, VIN: ZCFC35A8005672550"
       „Soubor kancelářského nábytku a vybavení"
       „Soubor 5 ks stavebních hákových kontejnerů"
       „prodej obchodního závodu Liberty Engineering Products"
     Dražební web vede nemovitosti i movitý majetek v jednom výpisu,
     takže bez tohohle soupisu by se na web dostaly vozíky a traktory.
     `VIN` je nejspolehlivější signál vozidla: číslo karoserie u jiné
     věci nestojí. */
  /\bregál|regálov|\bpalet/i,
  /vysokozdvižn|\bVZV\b|paletový vozík|paletové vidle|minibagr/i,
  /\bautojeřáb|\bjeřáb\b|\bdrtič|\bbagr|\btraktor|\bkontejner/i,
  /\bVIN\s*:|\bRZ\s*[A-Z0-9]{5,}|stav tachometru|první registrace/i,
  /fotovoltaick\w* panel|\bstřídač|bateriov\w* systém/i,
  /\boblečení|\bnábytk|kancelářsk\w* vybaven|spotřebního materiálu/i,
  /obchodního závodu|\bzávod\w* (?:z majetku|dlužníka)/i,
];

/* POŘADÍ ROZHODUJE A TOHLE JE JEHO DRUHÁ PODOBA (§453).
   Napoprvé stála garáž první a ostrý pokus to hned ukázal: „RD 6+1,
   garáž, ÚP 206m2 a spoluvlastnické podíly id. 1/2 na pozemcích"
   se zařadilo jako GARÁŽ. Rodinný dům s garáží je dům.
   Z bytu se zároveň vyhodil signál „podlahová plocha" — má ji
   i „Prodej RD podlahová plocha 184 m2", takže by se z domu stal
   byt. Popisek plochy není druh. */
export const DRUHY_PODLE_NAZVU = [
  [/rodinn(?:ý|ého) dom|\bRD\b|usedlost|rekreačního objektu|\bchat[ay]\b/i, 'dům', 'stavba'],
  [/bytov[éá] jednotk|\bbyt\b/i, 'byt', 'stavba'],
  [/areál|výrobní|sklad|administrativ|provozní budov|čerpací stanic/i, 'areál', 'stavba'],
  [/\bgaráž/i, 'garáž', 'stavba'],
  [/stavebn(?:í|ího) pozem/i, 'stavební pozemek', 'pozemek'],
  [/lesní pozem/i, 'lesní pozemek', 'pozemek'],
  [/orná půda|orné půdy/i, 'orná půda', 'pozemek'],
  [/trvalý travní|louk[ay]\b|pastvin/i, 'trvalý travní porost', 'pozemek'],
  [/zahrad/i, 'zahrada', 'pozemek'],
  [/vinice/i, 'vinice', 'pozemek'],
  [/pozem/i, 'pozemek', 'pozemek'],
];

/** Je to vůbec nemovitost? Auta a pohledávky na web nepatří. */
export function jeNemovitost(nazev) {
  const s = String(nazev || '');
  return !NENI_NEMOVITOST.some((re) => re.test(s));
}

/**
 * Co je ta nabídka podle názvu: { druh, kategorie } nebo null.
 * Nic neuhodne — když název nic z toho neobsahuje, vrátí null
 * a volající se rozhodne, jestli takovou nabídku vůbec chce.
 */
export function kategorieZNazvu(nazev) {
  const s = String(nazev || '');
  if (!jeNemovitost(s)) return { druh: 'není nemovitost', kategorie: 'jiné' };
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
