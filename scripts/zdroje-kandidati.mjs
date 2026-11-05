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
  { jmeno: 'ÚZSVM', host: 'nabidkamajetku.gov.cz', typ: 'sale', adresaOverena: true,
    url: 'https://nabidkamajetku.gov.cz/api/Property/List',
    proc: 'Úřad pro zastupování státu ve věcech majetkových — největší státní prodejce'
      + ' nemovitostí. Změřeno 4. 11.: 757 nabídek, z toho 286 v kategorii Pozemky.'
      + ' Web je aplikace, takže se čte z rozhraní, odkud si bere obsah sama.' },
  { jmeno: 'Nabídky státu', host: 'portal.gov.cz', typ: 'sale', adresaOverena: true,
    url: 'https://portal.gov.cz/nepotrebny-nemovity-majetek/?export=csv',
    proc: 'Centrální evidence nepotřebného nemovitého majetku státu, čte se z exportu do'
      + ' CSV. Jedním souborem nabídky Lesů ČR, Povodí, Vojenských lesů, Správy železnic'
      + ' i ministerstev. Otevřená data státu: zveřejnění je povinnost, ne laskavost.' },
];

/**
 * Kandidáti. Všichni jsou VEŘEJNÉ nabídky — stát, samospráva nebo
 * komora, tedy místa, kde je zveřejnění součástí zákonného postupu.
 * Adresy jsou odhad vstupní stránky; co z nich platí, řekne sonda.
 */
export const KANDIDATI = [
  /* ZMĚŘENO 4. 11. A ZAVŘENO — ať se těch osmatřicet cest nezkouší každé
     pondělí znovu. Robots.txt říká `Allow: /` a stránka má
     `meta robots: index, follow`, takže číst se smí. Dražby ale nejsou
     ani v HTML (tam je jen filtrovací formulář s kategoriemi Pozemek
     a Stavební pozemek), ani v DOM po vykreslení prohlížečem, ani na
     datové adrese: `PUT /drazby/probihajici.json` s naměřeným tělem
     odpoví **HTTP 424, `error_channel: "csrf"`, „Vaše relace vypršela"**.
     Ten token tam je právě proto, aby dotaz přišel z jejich stránky —
     napodobit sezení by bylo obcházení ochrany přístupu, a to se tu
     nedělá. Výpis dražeb tedy tenhle portál nikomu bez svého sezení
     nevydá a jiná cesta k němu nevede. */
  /* `adresaOverena` zůstává FALSE, i když je adresa změřená: ten
     příznak znamená „odtud se opravdu stahuje", a odtud se nestahuje
     a nebude. Chytil to hlídač v test-sonda-zdroju a měl pravdu. */
  { jmeno: 'Portál dražeb', host: 'portaldrazeb.cz', typ: 'exekuce', adresaOverena: false,
    zavreno: 'CSRF: výpis se vydá jen vlastnímu sezení (HTTP 424, změřeno 4. 11.)',
    url: 'https://www.portaldrazeb.cz/',
    proc: 'Dražby exekutorů (Exekutorská komora ČR). Dnes se exekuční dražby berou jen'
      + ' z OK dražeb (změřeno 2. 11.: 66 nabídek), takže druhý kanál pro týž druh by'
      + ' byl i pojistka proti výpadku — jenže vydat ho portál nemůže bez svého sezení.' },
  { jmeno: 'eDesky', host: 'edesky.cz', typ: 'obec', adresaOverena: false,
    url: 'https://edesky.cz/api/v1/documents',
    proc: 'Obec musí záměr prodat pozemek vyvěsit na úřední desku; eDesky úřední desky'
      + ' sdružují. Druh „obec" dnes na webu nemá vlastní zdroj vůbec.'
      + ' ZMĚŘENO 4. 11. (ohledání z Actions, čtyři dotazy): robots čtení nezakazuje a'
      + ' portál má POPSANÉ API — GET /api/v1/documents s parametry keywords (povinný),'
      + ' search_with (es = fulltext všeho, sql = klíčová slova v názvu), created_from,'
      + ' dashboard_id (kraj/město/obec), include_texts (1 = i rozpoznané texty), order'
      + ' (date/score) a page po 200 dokumentech; odpověď je XML a má schéma'
      + ' (documents.xsd v github.com/edesky/edesky_api). Rubriku „Prodeje majetku" web'
      + ' vede sám (/dokumenty?tag=Prodej).'
      + ' DVĚ VĚCI ALE STOJÍ V CESTĚ A ROZHODUJE O NICH MAJITEL, NE ROBOT:'
      + ' (1) KLÍČ. Bez api_key odpoví služba 401 „Chyba: nepřihlášen. Použijte svůj API'
      + ' klíč, který najdete pro přihlášení na https://edesky.cz/uzivatel/edit" — klíč'
      + ' se tedy váže na účet a účet si zakládá majitel; já mu ho zakládat nebudu a'
      + ' heslo po něm chtít nesmím. (Pro pořádek: specifikace apiary.apib api_key'
      + ' označuje za „optional", živá služba ho vyžaduje — dokumentace a skutečnost si'
      + ' tu odporují a platí to změřené.) Klíč by patřil do GitHub Secrets, stejně jako'
      + ' ostatní tajemství.'
      + ' (2) JINÝ DRUH ZÁZNAMU. Úřední deska nese ZÁMĚR prodat, ne nabídku s cenou:'
      + ' parcelu a katastr bývá v názvu dokumentu, cena zpravidla ne a často ještě'
      + ' neexistuje. Pro kupujícího je to cenné dřív než inzerát, ale web dnes staví'
      + ' celý výpis na ceně za m2 — zapojit to znamená rozhodnout, jak takový záznam'
      + ' vypadá a jak se neplete s nabídkou. To je rozhodnutí o produktu.' },
  { jmeno: 'Lesy ČR — prodej majetku', host: 'lesycr.cz', typ: 'sale', adresaOverena: false,
    pokrytoJinym: 'Nabídky státu',
    proc: 'Státní podnik prodává nepotřebné lesní a jiné pozemky. ZMĚŘENO 4. 11.: do'
      + ' centrální evidence je posílá sám — ze 94 záznamů exportu je 45 jeho, tedy'
      + ' nejvíc ze všech. Vlastní stahovač by přinesl totéž podruhé.',
    url: 'https://lesycr.cz/o-nas/prodej-nepotrebneho-majetku/' },

  /* PŘIDÁNO 3. 11. — HLEDÁNÍ OBJEMU MIMO BEZREALITKY.
     Změřeno týž den: aby Bezrealitky klesly na 40 % a nic se nesmazalo,
     musely by ostatní zdroje dát 2 441 nabídek místo dnešních 376, tedy
     6,5× víc. Ze slibných kandidátů byl do té chvíle PRODEJNÍ jediný
     (ÚZSVM) a zbytek dražby, kterých tolik není. Tihle kandidáti míří
     právě na ten chybějící prodejní objem — a všichni jsou státní nebo
     ze zákona zveřejňované, takže nenesou tu právní nejistotu, kvůli
     které je závislost na Bezrealitkách problém. */


  { jmeno: 'Vojenské lesy a statky', host: 'vls.cz', typ: 'sale', adresaOverena: false,
    url: 'https://www.vls.cz/cs/pro-obchodni-partnery/prodej-nepotrebneho-majetku/prodej-nemoviteho-majetku',
    proc: 'Státní podnik prodává nemovitosti ve veřejných výběrových řízeních a aktuálně'
      + ' nabízené vypisuje. Lesní a zemědělská půda — druh, který na webu zastupuje'
      + ' dnes jen Farmy (9 nabídek). ZMĚŘENO 4. 11.: v centrální evidenci NENÍ ani'
      + ' jeden jeho záznam (na rozdíl od Lesů ČR a Správy železnic), takže tady by'
      + ' vlastní čtení přineslo nabídky, které jinak nemáme odkud vzít.'
      + ' ZMĚŘENO TÉŽ 4. 11. (ohledání z Actions): stránka je čitelná — robots'
      + ' dovoluje, odpověď 200, obsah přímo v HTML a prohlížeč nestahuje žádná data'
      + ' —, jenže DNES na ní není ani jedna nemovitost: ve 26 081 znacích nula'
      + ' výskytů slov parcela/pozemek/výměra/Kč a mezi odkazy jen nabídka. Čtečka'
      + ' napsaná dnes by tedy přinesla nula nabídek. Zůstává v registru proto, aby'
      + ' ho týdenní sonda hlídala a ozvala se, až se tam něco objeví — to je přesně'
      + ' ten případ, pro který sonda vypisuje POČET nálezů, ne jen ano/ne.' },

  { jmeno: 'Správa železnic', host: 'spravazeleznic.cz', typ: 'sale', adresaOverena: false,
    pokrytoJinym: 'Nabídky státu',
    proc: 'Prodává nepotřebné pozemky kolem tratí. Vedla se zvlášť proto, že se měřilo'
      + ' obojí — a ZMĚŘENO 4. 11.: do centrální evidence posílá 17 ze 94 záznamů'
      + ' exportu, tedy druhý nejvíc. Portál.gov.cz tedy stačí a tenhle se nezapojuje.',
    url: 'https://www.spravazeleznic.cz/' },

  { jmeno: 'Insolvenční dražby (Portál dražeb)', host: 'insolvence.portaldrazeb.cz',
    typ: 'exekuce', adresaOverena: false,
    zavreno: 'robots.txt: Disallow: / (změřeno 4. 11.) — celý host zakázaný',
    url: 'https://insolvence.portaldrazeb.cz/public/auction-intention.html',
    proc: 'Druhá, dosud nezkoušená cesta k insolvenčnímu zpeněžení: „záměry dražby" na'
      + ' samostatném hostu Portálu dražeb. ZMĚŘENO 4. 11.: robots.txt zakazuje celý'
      + ' web (Disallow: /), takže se nestahuje nic a nic se nezkouší dál. Rozhodnutí'
      + ' patří tomu webu, ne nám.' },

  { jmeno: 'Otevřená data města Mostu', host: 'opendata.mesto-most.cz',
    typ: 'prodej', adresaOverena: false,
    zavreno: 'katalog čitelný, ale nabídky pozemků v něm nejsou (změřeno 4. 11.)',
    url: 'https://opendata.mesto-most.cz/data.json',
    proc: 'Bot zkoušení portálů 4. 11. našel tuhle cestu jako jedinou „slibnou" ze 264'
      + ' zkoušených (DCAT katalog, strojový tvar, mluví o pozemcích i o převodu).'
      + ' ZMĚŘENO ohledáním: robots.txt dovoluje, odpověď 200, 360 675 znaků JSON,'
      + ' 40 datových sad — ale jsou to geografické vrstvy města (sčítače dopravy,'
      + ' zeleň, pasporty). Ani jedna sada nenese nabídku pozemku k prodeji, takže'
      + ' zdroj to není. Zapsáno proto, aby se to nezkoušelo znovu.' },

  { jmeno: 'Insolvenční rejstřík', host: 'isir.justice.cz', typ: 'exekuce', adresaOverena: false,
    url: 'https://isir.justice.cz/',
    proc: 'Zpeněžení majetku v insolvenci se zveřejňuje ze zákona. Je to druh nabídky,'
      + ' který na webu dnes nemá zdroj žádný, a u pozemků bývá cena výrazně pod trhem —'
      + ' tedy přesně to, co weby hledají. Sonda napřed změří, jestli se to vůbec dá číst.' },

  /* ===== PĚT KANDIDÁTŮ Z 5. 11., A ODKUD SE VZALI ====================
     Studna otevřených dat vyschla: hledání přečetlo 34 katalogů a
     1 245 datových sad a našlo NULA zdrojů (data/nalezene-zdroje.json,
     4. 11.), bot zkoušení portálů prošel 264 cest na osmi portálech a
     našel nula nabídek a jednu „slibnou" cestu, ze které se po
     ohledání stal zápis `zavreno` (Most). Katalogy otevřených dat
     prostě nabídky majetku nevedou — vede je ten, kdo prodává.

     Těchto pět jsou tedy úřady a státní podniky, které SAMY prodávají
     nepotřebný nemovitý majetek. Adresy jsou z vyhledávání na webu
     (5. 11.), NIC Z TOHO NENÍ ZMĚŘENÉ: z tohohle stroje na cizí weby
     nevidím vůbec (změřeno znovu 5. 11.: nabidkamajetku.gov.cz i
     uzsvm.cz odpovídají nulou), takže o robots.txt, o cestách ani
     o tom, co na těch stránkách opravdu je, zatím netvrdím nic.
     Proto `adresaOverena: false` a proto jsou v KANDIDÁTECH, ne
     v zapojených: řádek tady znamená „tohle stojí za změření", ne
     „odtud se čte". Měří to bot v Actions (zkouseni-portalu.yml) a
     zákaz v robots.txt je konec, ne překážka.
     ================================================================== */
  { jmeno: 'DIAMO — prodej nemovitého majetku', host: 'diamo.cz', typ: 'sale', adresaOverena: false,
    url: 'https://www.diamo.cz/cs/nabidka-majetku/prodej-nemoviteho',
    proc: 'Státní podnik po těžbě drží pozemky po celé republice a nepotřebné prodává —'
      + ' výsledky hledání ukazovaly datované nabídky s pozemky (Stráž pod Ralskem,'
      + ' Karviná) a u každé vlastní dokument. Je to týž druh nabídky jako u SPÚ, který'
      + ' už zapojený je, jen od jiného vlastníka.' },
  { jmeno: 'Policie ČR — prodej nemovitého majetku', host: 'policie.gov.cz', typ: 'sale', adresaOverena: false,
    url: 'https://policie.gov.cz/clanek/prodej-nemoviteho-majetku-vyberove-rizeni.aspx',
    proc: 'Policie prodává nepotřebný majetek výběrovým řízením a výzvy vyvěšuje na'
      + ' vlastní stránce. Pozemků bude málo, ale je to stabilní a veřejný kanál.' },
  { jmeno: 'Ministerstvo obrany — nepotřebný majetek', host: 'onnm.mo.gov.cz', typ: 'sale', adresaOverena: false,
    url: 'https://onnm.mo.gov.cz/',
    proc: 'Obrana prodává nepotřebné nemovitosti pravidelně a ve zprávách se u toho'
      + ' mluví přímo o pozemcích. POZOR NA DVOJÍ ZÁPIS: stránka ministerstva sama'
      + ' tvrdí, že výzvy zrcadlí na nabidkamajetku.cz (ten už zapojený je) a na'
      + ' centrální adresu. Je to ale tvrzení z cizí stránky, ne měření — ať bot zjistí,'
      + ' co tam opravdu je; kdyby to byl týž majetek, patří sem `pokrytoJinym`'
      + ' se zdůvodněním, stejně jako u Lesů ČR a Správy železnic.' },
  { jmeno: 'Centrální adresa', host: 'centralniadresa.cz', typ: 'sale', adresaOverena: false,
    url: 'https://www.centralniadresa.cz/',
    proc: 'Místo, kde se ze zákona zveřejňují veřejné dražby a nabídky majetku od'
      + ' několika úřadů naráz. Jeden čitelný výpis by tedy mohl zastat víc'
      + ' jednotlivých stránek — a právě to má bot změřit jako první.' },
  { jmeno: 'MZV — majetek k odprodeji', host: 'mzv.gov.cz', typ: 'sale', adresaOverena: false,
    url: 'https://mzv.gov.cz/jnp/cz/o_ministerstvu/majetek_a_rozpocet/majetek_mzv_urceny_k_odprodeji.html',
    proc: 'Ministerstvo vede seznam majetku určeného k odprodeji. Malý zdroj, ale levný'
      + ' na změření: jedna stránka, jeden výpis.' },

  /* ===== PĚT KANDIDÁTŮ Z NÁLEZU SONDY (5. 11.) ======================
     Tyhle nenašlo vyhledávání ani katalogy — našla je SONDA ZDROJŮ a
     ležely v data/zdroje-sonda.json, dokud se nespojil hlásič nálezu
     (§431). U všech pěti je změřené obojí, co registr vyžaduje:
     robots.txt dovoluje čtení A podmínky užití se o automatickém
     přístupu nezmiňují (data/zdroje-podminky.json, běh sondy podmínek).

     ČTYŘI Z NICH NAŠEL ROBOT VE VLASTNÍCH DATECH (`stav: z vlastních
     dat`): dražebníci, na které odkazují nabídky z Centrální evidence
     a z OK dražeb. Tím je o veřejnosti jejich výpisů nejmenší spor —
     jejich inzeráty už dnes na našem webu stojí, jen vedené přes
     prostředníka. Druhý kanál pro týž druh je navíc pojistka proti
     výpadku jednoho z nich (§332).
     ================================================================== */
  { jmeno: 'Dražby Police nad Metují', host: 'drazby.policenm.cz', typ: 'exekuce', adresaOverena: false,
    url: 'https://drazby.policenm.cz/',
    proc: 'Dražebník, na kterého odkazují nabídky v našich datech. ZMĚŘENO 5. 11.:'
      + ' robots.txt dovoluje, HTTP 200, 44 887 bajtů, v textu 11× slovo o pozemku,'
      + ' 5× cena a 3× výměra; podmínky užití přečteny a o automatickém přístupu'
      + ' v nich nic není. Co zbývá: najít výpis (bot zkoušení portálů) — tohle je'
      + ' adresa detailu jedné dražby, ne seznam.' },
  { jmeno: 'Dražby Naxos', host: 'drazbynaxos.cz', typ: 'exekuce', adresaOverena: false,
    url: 'https://drazbynaxos.cz/',
    proc: 'Dražebník z našich dat. ZMĚŘENO 5. 11.: robots dovoluje, HTTP 200,'
      + ' 161 627 bajtů, 61× slovo o pozemku, 10× cena, 34× výměra — z pětice'
      + ' nejbohatší na obsah; podmínky přečteny a o automatickém přístupu mlčí.' },
  { jmeno: 'Veřejné dražby', host: 'verejnedrazby.cz', typ: 'exekuce', adresaOverena: false,
    url: 'https://www.verejnedrazby.cz/',
    proc: 'Dražebník z našich dat. ZMĚŘENO 5. 11.: robots dovoluje, HTTP 200,'
      + ' 119 190 bajtů, 24× výměra, 10× cena; podmínky přečteny a o automatickém'
      + ' přístupu v nich nic není.' },
  { jmeno: 'Elektronické dražby', host: 'elektronickedrazby.cz', typ: 'exekuce', adresaOverena: false,
    url: 'https://www.elektronickedrazby.cz/',
    proc: 'Dražebník z našich dat; robots dovoluje a HTTP 200 (60 190 bajtů, 43× výměra).'
      + ' PŘEMĚŘENO 5. 11. A PŘEDCHOZÍ POZNÁMKA BYLA VEDLE: netvrdí se už, že'
      + ' „stránka se vykresluje až v prohlížeči" — to platilo o HTML stránce'
      + ' /pages/drazebni-rad (104 znaků textu), ne o podmínkách. Podmínky jsou'
      + ' v PDF „Dražební řád - 8.3.2025" a sonda ho STÁHLA i dekódovala'
      + ' (10 556 znaků), jen ho celý zamítla kvůli čitelnosti 0,86 pod mezí 0,9.'
      + ' Po §441 se z takového textu nalezená pasáž o automatu bere jako důkaz'
      + ' (chybějící pořád jako nic), takže rozhodne příští běh sondy podmínek.'
      + ' A JEŠTĚ JEDNO MĚŘENÍ: tenhle web je výkladní skříň Gavlasu — vlastní'
      + ' dražby bydlí na internetove-drazby.cz (12 odkazů tvaru /view/<číslo>,'
      + ' robots tam dovoluje). Zdroj se NEZAPOJÍ, dokud se podmínky nepřečtou;'
      + ' pravidlo zní přečíst podmínky, ne nenajít zákaz.' },
  { jmeno: 'Nabídka majetku státu (veřejná část)', host: 'nabidkamajetku.cz', typ: 'sale', adresaOverena: false,
    url: 'https://nabidkamajetku.cz/',
    pokrytoJinym: 'ÚZSVM',
    proc: 'ZMĚŘENO 5. 11.: robots dovoluje, HTTP 200 a 1 201 479 bajtů s 84 cenami,'
      + ' 42 výměrami a 33 zmínkami o pozemku — nejbohatší odpověď z celé sondy.'
      + ' A DOMNĚNKA O DVOJÍM ZÁPISU SE POTVRDILA MĚŘENÍM (ohledání prohlížečem,'
      + ' běh 42049043294): stránka si obsah tahá z nabidkamajetku.gov.cz —'
      + ' šest požadavků na ten host — a odkazy na ní mají tvary /Home/Tenders,'
      + ' /Home/Auctions a /Home/Properties, tedy totéž rozhraní, odkud už'
      + ' čteme 286 pozemků. Je to veřejná tvář TÉHOŽ systému, ne další zdroj,'
      + ' takže se nezapojuje: druhý zápis by každou nabídku ukázal dvakrát.'
      + ' Kdyby se ten web někdy odpojil od .gov.cz (jiný hostitel v požadavcích),'
      + ' je to důvod změřit znovu — proto tu ten řádek zůstává i s čísly.' },
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

/* ---------- ZDROJE ČTENÉ OBECNOU CESTOU --------------------------- */
/* Zdroj, který se bere OBECNOU CESTOU (scripts/cteni-zdroje.mjs:
   JSON-LD → mikrodata → signály), tedy bez vlastního stahovače.
   Přidání zdroje je pak řádek tady, ne den práce — a když ten web
   změní vzhled, čtení se nerozbije, protože žádný tvar nezná.
   Tvar řádku je týž jako u KANDIDATI: { jmeno, host, url, typ, proc }.
   Bere se jen `typ: 'sale'` — u dražeb by z obecné cesty vyšla nabídka
   bez termínu a bez rozlišení nucené dražby (viz §334).

   SEZNAM JE PRÁZDNÝ SCHVÁLNĚ, DOKUD HO NEZAPLNÍ NÁLEZ SONDY.
   Zapsat sem web naslepo by znamenalo tvrdit o cizím webu něco, co
   jsme neměřili; z tohohle stroje se navíc na cizí weby nedostaneme
   vůbec (změřeno: cevd.gov.cz, nabidkamajetku.cz, edesky.cz,
   spu.gov.cz — všechny odpovídají nulou). Důvod k řádku je teprve
   nález v data/zdroje-sonda.json, kde u zdroje stojí „dostupné"
   a „obsah slibné". Prázdný seznam není nedokončená práce, je to
   poctivý stav: mechanismus hotový, rozhodnutí čeká na měření. */
export const OBECNE_ZDROJE = [];
