#!/usr/bin/env node
/* ŘEZY DAT PO OKRESECH A KRAJÍCH
   ==================================================================
   Celý soubor data/opportunities.json má 637 kB a 2 012 nabídek. Komu
   jde o jeden okres — a to je většina těch, kdo si data berou —
   si dosud musel stáhnout všechno a vyhodit 97 % z toho. Řez okresu
   Benešov má 10,8 kB.

   Statický web nemůže mít REST ani GraphQL: není kde běžet. Tohle je
   jeho obdoba, která funguje líp než většina skutečných rozhraní —
   obyčejný soubor na obyčejném serveru, cachovatelný, bez klíče, bez
   limitů a bez výpadku aplikační vrstvy.

   TVAR JE TÝŽ JAKO U CELKU. Kdo umí číst data/opportunities.json, umí
   přečíst i řez: stejná hlavička, stejné pole „opportunities", stejná
   pole u nabídky (viz data/pole.json). Jediný rozdíl je „rez", kde
   stojí, čí výběr to je — aby se řez nedal splést s celkem.
   Výjimku má jeden jediný řez: data/mapa.json, který stahuje úvodní
   stránka. Ten pole `url` nenese (adresu inzerátu úvod nepoužívá)
   a navíc nese `dm`, skóre pro pořadí výpisu. Oboje stojí u něj
   napsané v jeho vlastním poli `popis` a oboje má svůj důvod o kus
   níž; kdo čte řezy okresů, na ně nenarazí.

   ŘEZ JE TO, CO WEB UKAZUJE, NE DOSLOVNÝ VÝŘEZ SOUBORU. Z celku se
   odstraní duplicity — tentýž pozemek vypsaný dvakrát — a to TOUŽ
   funkcí, jakou k tomu používá mapa i stránky okresů
   (js/hlidani-logika.js: bezDuplicit). Dokud se řezy brály doslova,
   neodpovídaly stránkám: data/okres/hodonin.json a rejstřík tvrdily
   121 pozemků, kdežto pozemky-okres-hodonin.html 119. Lišilo se to u
   deseti okresů a u celkového počtu (2 018 proti 1 995). Číslo
   v publikovaných datech má odpovídat číslu na stránce — jinak si web
   sám se sebou odporuje a není poznat, které z nich platí.
   Syrový soubor zůstává k dispozici: data/opportunities.json.

   data/index.json je rozcestník: co existuje, kolik to má nabídek
   a jak je to velké. Bez něj by se muselo hádat, jak se soubor okresu
   jmenuje.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Jméno souboru se skládá TOUŽ funkcí jako jméno stránky okresu, ať
   si člověk může řez odvodit z adresy stránky, na které stojí. Ta
   funkce je od 15. 10. jedna pro celý web (scripts/text.mjs). */
import { slug } from './text.mjs';
import { presnostPodleDruhu } from './presnost-odhadu.mjs';
export { slug };

/* ---- ČISTÉ ROZVAHY ------------------------------------------------
   ==================================================================
   PROČ JSOU TADY NAHOŘE A ZVLÁŠŤ. Celé sestavení řezů běželo v jedné
   funkci `spust()`, která čte `data/opportunities.json` a zapisuje
   čtyřicet souborů. Nejdražší rozvahy v ní — která nabídka patří do
   kterého okresu, které okresy tvoří kraj, čím se v modelu zastupuje
   inzerent — se proto ze zkoušky nedaly spustit samostatně a smyčka
   samorozvoje 4. 11. nahlásila, že `test-data-rezy` nechytí ani jednu
   z pěti sabotáží v tomhle souboru. Rozvahy se tedy vytáhly sem: čtou
   jen svoje argumenty, nic nezapisují a dají se změřit po jedné.
   `spust()` je dál volá v tomtéž pořadí a výsledek se nezměnil (ověřeno
   shodou všech vygenerovaných souborů před změnou a po ní). */

/**
 * Tabulka okres → kraj z modulu `js/ceny.js`.
 * Modul se PŘEDÁVÁ, ať se tahle rozvaha dá změřit bez čtení souborů.
 * A bere se z něj JEN ta tabulka: kdyby se vrátil celý modul, lookupy
 * by tiše vracely `undefined`, krajské soupisy by zůstaly prázdné
 * a v rejstříku by u každého kraje chyběly jeho okresy.
 */
export function tabulkaOkresKraj(ceny) {
  return (ceny && ceny.OKRES_KRAJ) || {};
}

/**
 * Nabídky rozdělené na okresy a kraje.
 * Nabídka bez okresu se zahazuje — nemá kam patřit a v řezu okresu by
 * se o ní nikdo nedozvěděl; nabídka z okresu, který v tabulce není,
 * jde do svého okresu, ale do žádného kraje.
 */
export function seskupPodleUzemi(vse, okresKraj) {
  const tab = okresKraj || {};
  const podleOkresu = new Map();
  const podleKraje = new Map();
  for (const o of vse || []) {
    if (!o || !o.okres) continue;
    if (!podleOkresu.has(o.okres)) podleOkresu.set(o.okres, []);
    podleOkresu.get(o.okres).push(o);
    const k = tab[o.okres];
    if (!k) continue;
    if (!podleKraje.has(k)) podleKraje.set(k, []);
    podleKraje.get(k).push(o);
  }
  return { podleOkresu, podleKraje };
}

/**
 * Soubory v adresáři řezů, které už žádný živý okres nenese.
 * Tohle je ta nebezpečná rozvaha: co se tu PŘEHLÉDNE, zůstane na disku
 * se starými nabídkami a vypadá jako aktuální řez. Bere se jen `.json`,
 * ať se do úklidu nedostane nic jiného, co v adresáři leží.
 */
export function osireleRezy(naDisku, zive) {
  const ziveJmena = zive || new Set();
  return [...(naDisku || [])]
    .filter((f) => String(f).endsWith('.json') && !ziveJmena.has(f)).sort();
}

/** Okresy jednoho kraje, abecedně — a jen ty, které v datech opravdu jsou. */
export function okresyKraje(okresy, okresKraj, kraj) {
  const tab = okresKraj || {};
  return [...(okresy || [])].filter((o) => tab[o] === kraj).sort();
}

/**
 * Inzerenti pro sloupcový vstup modelu: rejstřík jmen a sloupec odkazů.
 * Nabídka bez inzerenta dostane −1, ne nulu — nula je platný index
 * prvního inzerenta a srovnávací hladina by ho pak připsala všem
 * nabídkám bez jména.
 */
export function inzerentiSloupcove(proModel) {
  const data = proModel || [];
  const inzerenti = [...new Set(data.map((x) => x.inz).filter(Boolean))].sort();
  const iI = new Map(inzerenti.map((x, i) => [x, i]));
  const si = data.map((x) => (iI.has(x.inz) ? iI.get(x.inz) : -1));
  return { inzerenti, si };
}

/* SESTAVENÍ JE VE FUNKCI, NE NA NEJVYŠŠÍ ÚROVNI.
   Zkouška scripts/test-data-rezy.mjs si odtud bere slug() — a dokud
   bylo sestavení v těle modulu, prostý import ho SPUSTIL: zkouška si
   řezy přestavěla a teprve pak je kontrolovala. Všechny čtyři sabotáže
   (chybějící nabídka, cizí okres v řezu, zastaralá hlavička, lhoucí
   rozcestník) proto prošly — kontrola si je sama spravila dřív, než se
   podívala. Tohle je přesně ta vada, kterou zkouška nepozná na sobě. */
export async function spust() {
  /* ---- sestavení ---- */
  const celek = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
  const syrove = celek.opportunities || [];
  if (!syrove.length) {
    console.error('::error::data/opportunities.json je prázdný — řezy by přepsaly dobrá data prázdnem.');
    process.exit(1);
  }

  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  /* Duplicity odstraňuje TATÁŽ funkce jako na webu — viz hlavička. */
  const PKH = require_(path.join(ROOT, 'js', 'hlidani-logika.js'));
  if (!PKH || typeof PKH.bezDuplicit !== 'function') {
    console.error('::error::js/hlidani-logika.js nedalo bezDuplicit — řezy by nesouhlasily se stránkami');
    process.exit(1);
  }

  /* KLÍČ POZEMKU SKLÁDÁ TATÁŽ FUNKCE JAKO V PROHLÍŽEČI.
     Rejstřík klíčů níž musí odpovídat tomu, POD ČÍM si člověk pozemek
     uložil — a to ví jedině js/klic.js (PKKlic.pkey). Vlastní kopie
     pravidla by se s ním časem rozešla a uložené pozemky by se na
     porovnání „už nenašly v nabídce", což je ta nejhorší možná vada:
     tiše ubírá člověku jeho vlastní práci. */
  const PKK = (require_(path.join(ROOT, 'js', 'klic.js')) || {}).PKKlic;
  if (!PKK || typeof PKK.pkey !== 'function') {
    console.error('::error::js/klic.js nedalo PKKlic.pkey — rejstřík klíčů by nesouhlasil s uloženými pozemky');
    process.exit(1);
  }
  /* PO TERMÍNU SE NEPOČÍTÁ. Dražba, která už proběhla, není nabídka —
     a okresní stránky ji vynechávají odjakživa. Řezy ji počítaly dál,
     takže web o témže okrese tvrdil dvě různá čísla; projevilo se to
     jediný den v roce, totiž den po dražbě (Praha-východ: stránka 54,
     řez 55). Podmínka je společná, viz js/terminy.js. */
  const T_ = (() => {
    require_(path.join(ROOT, 'js', 'terminy.js'));
    return globalThis.PK_TERMINY;
  })();
  if (!T_ || typeof T_.poTerminu !== 'function') {
    console.error('::error::js/terminy.js nedalo poTerminu — řezy by počítaly i proběhlé dražby');
    process.exit(1);
  }
  const bezDuplicit = PKH.bezDuplicit(syrove);
  const vse = bezDuplicit.filter((o) => !T_.poTerminu(o));
  const CENY = (() => {
    require_(path.join(ROOT, 'js', 'ceny.js'));
    return globalThis.PK_CENY;
  })();
  const OKRES_KRAJ = tabulkaOkresKraj(CENY);
  if (!Object.keys(OKRES_KRAJ).length) {
    console.error('::error::tabulka okres → kraj se nenačetla z js/ceny.js');
    process.exit(1);
  }

  const hlavicka = {
    updated: celek.updated,
    updated_at: celek.updated_at,
    source: celek.source,
  };

  function zapis(rel, obj) {
    const cesta = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(cesta), { recursive: true });
    const text = JSON.stringify(obj);
    const stare = fs.existsSync(cesta) ? fs.readFileSync(cesta, 'utf8') : null;
    if (stare !== text) fs.writeFileSync(cesta, text);
    return Buffer.byteLength(text);
  }

  const { podleOkresu, podleKraje } = seskupPodleUzemi(vse, OKRES_KRAJ);

  /* Co na disku zůstalo po okresu, který už nabídku nemá, by lhalo:
     soubor by se neobnovil a vypadal by jako aktuální. Přepíše se tedy
     na prázdný řez — ne smaže, aby odkaz nevracel 404. */
  /* POČET SE NEPOČÍTÁ RUČNĚ, ODVOZUJE SE ZE SEZNAMU.
     Ruční počitadlo (`let prazdnych = 0` a `prazdnych++`) se dalo
     posunout o jedničku, a protože jeho jediným čtenářem byla věta ve
     výpisu sestavení, nikomu by to nepřišlo divné — sabotážní stroj to
     našel jako slepé místo. Odvozené číslo se od seznamu, který
     popisuje, rozejít nemůže. */
  function uklid(adresar, ziveSoubory, uroven) {
    const dir = path.join(ROOT, 'data', adresar);
    if (!fs.existsSync(dir)) return 0;
    const osirele = osireleRezy(fs.readdirSync(dir), ziveSoubory);
    for (const f of osirele) {
      const obj = Object.assign({}, hlavicka, {
        rez: { uroven, nazev: null, soubor: `data/${adresar}/${f}`, pocet: 0 },
        opportunities: [],
      });
      zapis(`data/${adresar}/${f}`, obj);
    }
    return osirele.length;
  }

  const rejstrik = { updated: celek.updated, updated_at: celek.updated_at, rezy: [] };
  /* Velikosti řezů se sbírají a součet se spočítá nakonec — ze stejného
     důvodu jako výš: přičítací proměnná je ruční počet a dá se posunout. */
  const velikostiRezu = [];
  const ziveOkres = new Set();
  /* REJSTŘÍK KLÍČŮ VZNIKÁ V TÉHLE SMYČCE, NE VEDLE NÍ.
     Kdyby se počítal zvlášť, mohl by ukázat na okres, ve kterém daná
     nabídka v řezu není — a porovnání by si stáhlo soubor, kde ten
     pozemek nenajde. Takhle se zapisuje jméno řezu, do kterého
     nabídka právě šla. */
  const okresySlugy = [];
  const klicOkresu = {};
  const ukazkaAdepti = [];

  for (const [okres, polozky] of [...podleOkresu].sort()) {
    const soubor = `data/okres/${slug(okres)}.json`;
    ziveOkres.add(`${slug(okres)}.json`);
    const poradi = okresySlugy.push(slug(okres)) - 1;
    const poDruhu = new Map();
    for (const nabidka of polozky) {
      const k = PKK.pkey(nabidka);
      if (k) klicOkresu[k] = poradi;
      /* NÁPOVĚDA PRO UKÁZKU, NE DRUHÁ KOPIE PRAVIDLA.
         Porovnání ukazuje člověku bez uložených pozemků tři skutečné
         nabídky téhož druhu z téhož okresu, aby bylo vidět, co tabulka
         umí. Pravidlo výběru zůstává v js/porovnani.js (ukazka) —
         tady se jen spočítá, ve kterém okresu je nejsilnější skupina
         jednoho druhu, aby si stránka mohla vzít JEDEN řez místo
         celých dat.

         POČÍTÁ SE JEN TO, CO STRÁNKA UNESE — OPRAVENO 11. 11.
         Do té doby stačilo, že nabídka má okres, druh, cenu a výměru.
         Jenže ukázka srovnává nabídky CENOU ZA METR a `zaMetr()` je
         úmyslně jen pozemková (js/ceny.js to má rozepsané: byt za
         122 421 Kč/m² podlahové plochy v jedné stupnici s polem za
         44 Kč/m² znamená, že každý pozemek vyjde jako zdarma). Jak
         do dat přibyly byty, vyšel jako nejbohatší Sokolov — šest
         bytů v jedné skupině —, kdežto pozemkové skupiny měl po dvou.
         Stránka tedy z toho řezu nevybrala nic a ukázka úplně zmizela;
         shodilo to tři hlídače v prohlížeči (test-porovnani,
         test-sazba-dom). Tady se proto počítá přímo tím, čím měří
         stránka: `CENY.zaMetr()` musí dát číslo. Je to táž funkce,
         ne druhý opis pravidla — hlídačem je zkouška v prohlížeči.

         A TA ZÁLOŽNÍ CESTA DŘÍV NEEXISTOVALA. Komentář tu tvrdil, že
         „kdyby nápověda nesedla, stránka sáhne po celku, takže se tím
         nedá nic rozbít" — nebyla to pravda: js/porovnani.js sahal po
         celku jen při PRÁZDNÉM řezu, ne když v něm chybí vhodná
         trojice. Doplněno i tam, takže ta věta platí teprve teď. */
      if (nabidka && nabidka.okres && nabidka.druh && CENY.zaMetr(nabidka) != null) {
        poDruhu.set(nabidka.druh, (poDruhu.get(nabidka.druh) || 0) + 1);
      }
    }
    ukazkaAdepti.push({ slug: slug(okres), skupina: Math.max(0, ...poDruhu.values()) });
    const b = zapis(soubor, Object.assign({}, hlavicka, {
      rez: { uroven: 'okres', nazev: okres, kraj: OKRES_KRAJ[okres] || null, soubor, pocet: polozky.length },
      opportunities: polozky,
    }));
    velikostiRezu.push(b);
    ukazkaAdepti[ukazkaAdepti.length - 1].bajtu = b;
    rejstrik.rezy.push({ uroven: 'okres', nazev: okres, kraj: OKRES_KRAJ[okres] || null, soubor, pocet: polozky.length, bajtu: b });
  }
  /* ---- REJSTŘÍK KLÍČŮ: KDE HLEDAT JEDEN KONKRÉTNÍ POZEMEK ----
     NAMĚŘENO 10. 11. Stránka porovnání (porovnani.html) si stahovala
     CELÁ data při každém otevření a ještě s `cache: no-store`, aby
     v nich našla tu hrstku pozemků, které si člověk uložil. Uložený
     záznam totiž nese jen klíč, ne okres, takže nebylo kam jít jinam.
     Při 3 499 nabídkách to bylo 1,37 MB; po opravě stropu geokodéru
     u Bezrealitek vyjde 8 700 nabídek, tedy ~3,26 MB na jedno
     otevření jedné stránky.
     Řezy po okresech ale existují (průměr 17 kB) a nesou všechna pole,
     která porovnání vypisuje. Chybělo jen jedno: ze klíče zjistit
     okres. To je tenhle soubor — a pak si porovnání dojde pro ty dva
     tři okresy, ve kterých uložené pozemky opravdu leží.
     Okresy jsou v poli a klíč ukazuje číslem, ne jménem: jméno okresu
     se v 8 700 klíčích opakuje a stálo by víc než celý zbytek. */
  const bKlice = zapis('data/klice-okresu.json', Object.assign({}, hlavicka, {
    popis: 'Ke každému klíči pozemku (PKKlic.pkey z js/klic.js) číslo okresu '
      + 'v poli „okresy". Soubor řezu je data/okres/<slug>.json. Slouží k tomu, '
      + 'aby se dal jeden pozemek najít bez stahování celých dat.',
    okresy: okresySlugy,
    /* NEJMENŠÍ ŘEZ, KTERÝ NA UKÁZKU STAČÍ — ne ten nejbohatší.
       Ukázka jsou tři nabídky, takže skupina pěti je s rezervou dost;
       největší okres (Praha, 275 kB) by se stahoval zbytečně. Když ani
       jeden okres skupinu pěti nemá, vezme se ten s nejsilnější
       skupinou a stránka si případně dojde pro celek. */
    ukazka: (function () {
      const dost = ukazkaAdepti.filter((a) => a.skupina >= 5);
      if (dost.length) return dost.sort((x, y) => x.bajtu - y.bajtu)[0].slug;
      const nej = ukazkaAdepti.slice().sort((x, y) => y.skupina - x.skupina)[0];
      return nej && nej.skupina >= 3 ? nej.slug : null;
    }()),
    klice: klicOkresu,
  }));
  rejstrik.klice = {
    soubor: 'data/klice-okresu.json',
    pocet: Object.keys(klicOkresu).length,
    okresu: okresySlugy.length,
    bajtu: bKlice,
  };

  /* KRAJSKÉ ŘEZY SE NEDĚLAJÍ, A JE TO ÚMYSL.
     Kraj je součet svých okresů, takže by to byla druhá kopie týchž
     nabídek — dohromady 1 302 kB místo 637 kB. A ten soubor se obnovuje
     ČTYŘIKRÁT DENNĚ, takže by se tím zdvojnásobil přírůstek historie
     repozitáře (dnes už má .git 875 MB). Kdo chce kraj, vezme si jeho
     okresy; které to jsou, stojí v rejstříku níž, takže to nikdo
     nemusí hádat. */
  const kraje = {};
  for (const [kraj, polozky] of [...podleKraje].sort()) {
    kraje[kraj] = {
      pocet: polozky.length,
      okresy: okresyKraje(podleOkresu.keys(), OKRES_KRAJ, kraj)
        .map((o) => `data/okres/${slug(o)}.json`),
    };
  }
  /* ---- VSTUP CENOVÉHO MODELU, SLOUPCOVĚ ----
     Stránka pozemku potřebuje ze všech dat dvě věci: sebe (to má v řezu
     svého okresu) a CELOSTÁTNÍ cenový model. Celý soubor kvůli tomu
     stahovat nemusí: model čte z nabídky jen šest polí (okres, druh,
     typ, výměra, cena, podíl). Naměřeno: 42,1 kB surově a 11,5 kB přes
     drát proti 56,5 kB za celý soubor, a surově je to 42 kB místo 638 kB
     — tedy i patnáctkrát méně práce pro parser v telefonu.

     Proč sloupcově a se slovníky: okres, druh a typ se opakují, takže
     se vyplatí uložit je jednou a dál jen čísla. Řádkově to vyšlo na
     12,7 kB, sloupcově na 11,5 kB.

     Nic se tím nezaokrouhluje: výměra i cena jsou celá čísla ze zdroje,
     takže model postavený z tohohle souboru vyjde znak za znakem stejně
     jako z plných dat. Hlídá to scripts/test-model-vstup.mjs na všech
     nabídkách, ne na vzorku.

     PŘÍZNAK PODÍLU TU SCHVÁLNĚ NENÍ, i když ho model zná. Čte ho totiž
     vždycky z nabídky, o které se právě rozhoduje (nesrovnatelna(d)),
     nikdy z uložených polí — podíly ve srovnávací hladině naopak
     zůstávají, a je to tak napsané v js/ceny.js. Pole by tedy nikdo
     nepoužil; zkusil jsem ho zahodit a model vyšel beze změny, takže
     z vstupu vypadlo. */
  /* MODEL BERE I PROBĚHLÉ DRAŽBY, a je to schválně. Filtr na termín
     odpovídá na otázku „dá se to ještě koupit" — tou se řídí počty na
     stránkách a v řezech. Cenový model ale odpovídá na jinou otázku:
     „kolik tady pozemky stojí". Na to je dražba, která proběhla včera,
     pozorování jako každé jiné, dokonce lepší než inzerát, protože cena
     byla skutečně zaplacená. Vyhodit ji by znamenalo zahazovat data bez
     důvodu. Model proto čte `bezDuplicit`, ne `vse`. */
  /* JAK PŘESNÝ TEN MODEL JE, PODLE DRUHU — spočítá se JEDNOU pro oba
     řezy. Číslo vedle percentilu („obvyklá cena 180 Kč/m²") se tvářilo
     přesněji, než jak to umíme: křížově naměřený medián chyby je
     u orné půdy 22 %, u stavebního pozemku 35 %, u ostatní plochy 61 %
     a u „jiného pozemku" 284 %. Web to teď u čísla přiznává a tam, kde
     je chyba přes polovinu, číslo nevydává vůbec.
     Proč do dat a ne do konstanty v js/ceny.js: data se mění každý den
     robotem, konstanta by zestárla potichu. Počítá to
     scripts/presnost-odhadu.mjs — týž modul, jaký používá měřidlo
     (scripts/mericka-odhadu.mjs --podle-druhu), takže se web a měřidlo
     nemůžou rozejít. Stojí to 137 ms. */
  const chybaModelu = (() => {
    const presnost = presnostPodleDruhu(bezDuplicit, CENY);
    const ven = {};
    for (const g of Object.keys(presnost)) {
      if (!g) continue;
      const z = presnost[g];
      ven[g] = { ch: z.median == null ? null : Math.round(z.median), z: z.kolik, n: z.celkem };
    }
    return ven;
  })();

  const modelVstup = (() => {
    /* ÚŘEDNĚ STANOVENÁ CENA SE DO MODELU NEVOZÍ. Prodej státní půdy podle
       § 12 je v datech vedený jako běžný prodej, ale cenu u něj stanoví
       úřad — js/ceny.js ho proto do modelu nepouští (spravniCena). Malý
       soubor je sloupcový a pole `extra` nenese, takže by to rozpoznat
       nemohl; vynechává se tedy už tady, aby model z malého souboru dal
       totéž co z plných dat. Hlídá to scripts/test-model-vstup.mjs. */
    /* CO MODEL UMÍ ZMĚŘIT — a ptá se ho na to, neopisuje si pravidlo.
       Dřív tu stálo `!o.kat || o.kat === 'pozemek'` s odůvodněním, že
       `postav()` si vstup filtruje sám (tehdy `jenPozemky`), takže je to
       jen úspora kilobajtů na telefonu. Od zapojení bytů to přestalo
       platit: model od té doby bere i byt a garáž (`meritelnaVymera`
       v js/ceny.js — tam výměra znamená podlahovou plochu, takže se
       cena za metr počítat dá). Malý soubor je ale dál vozil jen
       pozemky, takže o témž bytu tvrdila stránka z plných dat verdikt
       a z malého souboru nic. Naměřeno 8. 11.: šest rozdílů na třech
       nabídkách (tř. Budovatelů v Mostě, Praha), scripts/test-model-vstup.mjs.

       Síto je proto TÁŽ funkce, jakou si pouští model. Úřední cena se
       vynechává zvlášť: malý soubor je sloupcový a pole `extra` nenese,
       takže by ji model z něj rozpoznat nemohl. */
    const proModel = bezDuplicit
      .filter((o) => !CENY.spravniCena(o))
      .filter((o) => CENY.meritelnaVymera(o));
    const okresy = [...new Set(proModel.map((o) => o.okres || ''))].sort();
    const druhy = [...new Set(proModel.map((o) => o.druh || ''))].sort();
    const typy = [...new Set(proModel.map((o) => o.type || ''))].sort();
    /* KATEGORIE MUSÍ JÍT PŘES DRÁT TAKY. Model od zapojení bytů klíčuje
       srovnávací přihrádky podle `skupinaNabidky(o)`, a ta se u nepozemku
       bere z `o.kat`, ne z druhu. Bez tohohle sloupce by byt z malého
       souboru vyšel jako pozemek s druhem „byt" a spadl do jiné
       přihrádky než z plných dat. Slovník má nejvýš devět slov, takže
       přes drát je to jeden krátký sloupec indexů. Prázdné jméno =
       pozemek (nabídky bez `kat`), aby se u 2 009 z nich nevozilo
       zbytečné slovo. */
    const kategorie = [...new Set(proModel.map((o) => o.kat || ''))].sort();
    const iO = new Map(okresy.map((x, i) => [x, i]));
    const iD = new Map(druhy.map((x, i) => [x, i]));
    const iT = new Map(typy.map((x, i) => [x, i]));
    const iK = new Map(kategorie.map((x, i) => [x, i]));
    /* OTISK INZERENTA TU BÝT MUSÍ, na rozdíl od příznaku podílu o kus
       níž. Srovnávací hladina od 23. 10. slučuje nabídky jednoho
       inzerenta na jeden hlas a přihrádku, kterou drží jediný, nepoužije
       (js/ceny.js, MEZ_JEDEN_INZERENT) — bez tohohle sloupce by stránka
       pozemku počítala z jiných podkladů než mapa a o témž pozemku by
       tvrdily jiný verdikt. Hlídá to scripts/test-model-vstup.mjs. */
    const { inzerenti, si } = inzerentiSloupcove(proModel);
    const o = [], d = [], t = [], k = [], a = [], c = [], la = [], lo = [];
    for (const x of proModel) {
      o.push(iO.get(x.okres || '')); d.push(iD.get(x.druh || '')); t.push(iT.get(x.type || ''));
      k.push(iK.get(x.kat || ''));
      a.push(x.area || 0); c.push(x.price || 0);
      /* SOUŘADNICE JAKO CELÁ ČÍSLA, ZAOKROUHLENÉ NA ČTYŘI DESETINNÁ
         MÍSTA (asi 11 m). Model je potřebuje: obvyklá cena se počítá
         z nejbližších nabídek v okolí, ne jen z okresu — naměřeno, že je
         to přesnější (scripts/mericka-odhadu.mjs). Na hledání deseti
         nejbližších do 25 km je deset metrů přesnost až zbytečná, a na
         pěti místech by soubor narostl o 6 kB přes drát.
         Na TUTÉŽ přesnost zaokrouhluje i postav() v js/ceny.js, aby
         model z malého souboru dal totéž co z plných dat. */
      la.push(Math.round((x.lat || 0) * 1e4)); lo.push(Math.round((x.lng || 0) * 1e4));
    }
    return Object.assign({}, hlavicka, {
      rez: { uroven: 'model', nazev: null, soubor: 'data/model.json', pocet: proModel.length },
      chyba: chybaModelu,
      popis: 'Vstup cenového modelu: pole, která z uložených nabídek čte js/ceny.js. '
        + 'Sloupcově a se slovníky, ať je to malé. Pole o/d/t/k jsou indexy do '
        + 'okresy/druhy/typy/kategorie (prázdné jméno v kategorie = pozemek), '
        + 'a je výměra v m², c cena v Kč, la/lo souřadnice ×10 000 (celá čísla), '
        + 's je index do inzerenti (−1 = neznámý).',
      okresy, druhy, typy, kategorie, inzerenti, o, d, t, k, a, c, la, lo, s: si,
    });
  })();
  const bajtuModel = zapis('data/model.json', modelVstup);
  rejstrik.rezy.push({ uroven: 'model', nazev: null, soubor: 'data/model.json',
    pocet: modelVstup.rez.pocet, bajtu: bajtuModel });

  /* ---- CO STAHUJE ÚVODNÍ STRÁNKA ----
     Týž soubor jako celek, jen BEZ POLE `url`. Úvodní stránka adresy
     inzerátů k ničemu nepoužívá: vykresluje mapu a výpis, a odkaz na
     zdroj je až na stránce pozemku, která si ho bere z řezu svého
     okresu (ten `url` nese dál). Jediné místo, kde se adresa z úvodu
     posílala dál, byl handoff do sessionStorage — a změřilo se, že
     nešetří nic: s ním i bez něj doskočí odkaz na zdroj po klepnutí na
     kartu stejně rychle (2 229 proti 2 217 ms na pomalé 4G, medián ze
     tří běhů), protože přes pomalou linku trvá samo načtení stránky ty
     dvě sekundy a okresní řez dorazí hned za ní.
     Úspora: 620,6 → 460,4 kB surově, 77,3 → 58,6 kB po zabalení, tedy
     **18,7 kB přes drát** — čtvrtina největšího souboru na webu.

     TOHLE JE DRUHÁ KOPIE TÝCHŽ NABÍDEK, a tím se příčí pravidlu
     u krajských řezů o pár řádek výš. Rozdíl je v tom, že tady je cena
     ZMĚŘENÁ, ne odhadnutá z velikosti souboru: šest skutečných po sobě
     jdoucích verzí dat ze historie repozitáře, commitnutých jednou samy
     a jednou s odvozeným souborem, dalo .git 260 kB proti 280 kB —
     tedy **+3,3 kB na jednu aktualizaci**, ne +460. Git totiž ukládá
     odvozený soubor jako rozdíl proti sourozenci v témže commitu,
     se kterým se shoduje ve třech čtvrtinách. Při čtyřech
     aktualizacích denně je to kolem 5 MB za rok (.git má 875 MB).

     DUPLICITY SE ODSTRAŇUJÍ UŽ TADY, a není to volba: `bezDuplicit`
     v js/hlidani-logika.js slučuje v prvním kroku PODLE ADRESY ZDROJE
     (klicZdroje). Bez pole `url` by ten krok nenašel nic a na úvodní
     stránce by se objevilo 24 nabídek dvakrát — naměřeno (1 964 karet
     proti 1 940). Udělá se to tedy jednou v překladu, touž funkcí;
     stránka ji pustí znovu a nenajde už co slučovat. Termín se
     nefiltruje: co se dá ještě koupit, rozhoduje stránka podle data
     v prohlížeči, a tenhle soubor leží na serveru i přes noc.
     Hlídá to scripts/test-data-rezy.mjs znak za znakem. */
  const proMapu = bezDuplicit;
  /* SKÓRE PRO POŘADÍ VÝPISU SE POČÍTÁ TADY, NE V TELEFONU.
     Úvodní stránka řadí výchozí pořadí „Doporučené" podle skóre, které
     pro každou nabídku sahá po odhadu ceny z okolí. Naměřeno v prohlížeči
     na telefonu 390 px: 3 899 volání odhadu pro 1 925 různých pozemků na
     JEDNO vykreslení — a na obrazovce je 24 karet. Podle profilu to byla
     nejdražší položka startu.
     Jde to předpočítat, protože skóre je funkcí JEN DAT: prohlížeč staví
     model jako postav(DATA, null, PRESNOST), kde DATA je tenhle řez po
     odstranění duplicit (a ten už je bez nich) a PRESNOST je `chyba`
     o pár řádků níž. Nic od uživatele do výpočtu nejde. Stavím tedy model
     z týchž tří vstupů a projedu ho přes všechny nabídky.
     FORMULE JE JEDNA, A V js/ceny.js (poptavka). Opsat ji sem by znamenalo
     druhou kopii, a ty se v tomhle repozitáři rozešly vždycky — proto
     existuje js/ceny.js. Že se číslo v datech rovná tomu, co spočítá
     prohlížeč, přeměřuje scripts/test-poptavka.mjs. */
  const modelMapy = CENY.postav(proMapu, null, chybaModelu);
  if (!modelMapy || typeof modelMapy.poptavka !== 'function') {
    console.error('::error::cenový model nedal poptavka() — úvodní stránka by si skóre musela počítat sama');
    process.exit(1);
  }
  const mapaVstup = Object.assign({}, hlavicka, {
    sources: celek.sources,
    rez: { uroven: 'mapa', nazev: null, soubor: 'data/mapa.json', pocet: proMapu.length },
    /* PŘESNOST MODELU JEDE S ŘEZEM, aby si úvodní stránka nemusela
       stahovat ještě data/model.json jen kvůli dvěma stům bajtů. Je to
       táž hodnota jako tam — kdyby mapa a stránka pozemku dostaly každá
       jinou, tvrdily by o témž pozemku jinou nejistotu. */
    chyba: chybaModelu,
    popis: 'Co stahuje úvodní stránka: tytéž nabídky jako data/opportunities.json '
      + 'bez duplicit a bez pole url (adresu inzerátu úvod nepoužívá). Adresy jsou '
      + 'v řezech okresů. Navíc je u každé nabídky `dm` — skóre, podle kterého se '
      + 'řadí výchozí pořadí výpisu; počítá ho js/ceny.js (poptavka) z týchž dat, '
      + 'takže si ho lze přepočítat.',
    opportunities: proMapu.map((o) => {
      const c = Object.assign({}, o);
      delete c.url;
      /* `dm` = skóre pro pořadí výpisu, viz výš. Je JEN v tomhle řezu:
         jinde ho nikdo nečte a v řezech okresů by to byla data, která
         nikomu nic neříkají. */
      c.dm = modelMapy.poptavka(o);
      return c;
    }),
  });
  const bajtuMapa = zapis('data/mapa.json', mapaVstup);
  rejstrik.rezy.push({ uroven: 'mapa', nazev: null, soubor: 'data/mapa.json',
    pocet: proMapu.length, bajtu: bajtuMapa });

  const prazdnych = uklid('okres', ziveOkres, 'okres');

  rejstrik.celek = {
    soubor: 'data/opportunities.json',
    pocet: vse.length,
    /* Kolik je v syrovém souboru a kolik z toho jsou duplicity. Bez
       těchhle dvou čísel by se počet v rejstříku (bez duplicit) nedal
       srovnat s velikostí souboru, na který ukazuje. */
    pocet_v_souboru: syrove.length,
    /* Dvě odečtení, ne jedno. Kdyby se „duplicit" počítalo proti
       konečnému počtu, spadly by do něj i proběhlé dražby a číslo by
       lhalo o tom, co se vlastně odstranilo. */
    duplicit: syrove.length - bezDuplicit.length,
    po_terminu: bezDuplicit.length - vse.length,
    bajtu: fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size,
    /* KOLIK ŘEZŮ SE VYPRÁZDNILO. Dřív to byla jen věta ve výpisu
       sestavení, takže posunuté číslo by nikdo nepoznal. Teď je to
       údaj v datech a dá se proti disku srovnat: živý okres má vždycky
       aspoň jednu nabídku, takže řezů s nulou má být na disku přesně
       tolik, kolik tohle číslo říká. */
    vyprazdnenych: prazdnych,
  };
  rejstrik.kraje = kraje;
  rejstrik.popis = 'Řezy po okresech. Tvar je stejný jako u celku (viz data/pole.json), '
    + 'navíc je tu „rez" s tím, čí výběr to je. Kdo chce jeden okres, nemusí stahovat celek. '
    + 'Z celku jsou odstraněné duplicity (tentýž pozemek vypsaný dvakrát), takže počty tady '
    + 'odpovídají počtům na stránkách okresů; kolik se odstranilo, stojí v „celek.duplicit". '
    + 'Nepočítají se ani dražby, jejichž termín už minul („celek.po_terminu") — stránky je '
    + 'taky nepočítají, protože proběhlá dražba není nabídka. '
    + 'Syrový soubor je data/opportunities.json. Krajské řezy nejsou schválně — kraj je součet '
    + 'svých okresů a jejich soubory najdete v „kraje".';
  zapis('data/index.json', rejstrik);

  const bajtu = velikostiRezu.reduce((soucet, x) => soucet + x, 0);
  console.log(`Řezy dat: ${podleOkresu.size} okresů (${podleKraje.size} krajů jako soupis)`
    + `, vstup modelu ${(bajtuModel / 1024).toFixed(0)} kB`
    + ` = ${(bajtu / 1024).toFixed(0)} kB dohromady`
    + ` (celek má ${(rejstrik.celek.bajtu / 1024).toFixed(0)} kB, nejmenší řez`
    + ` ${(Math.min(...rejstrik.rezy.map((r) => r.bajtu)) / 1024).toFixed(1)} kB)`
    + (prazdnych ? `, vyprázdněno ${prazdnych} bez nabídek` : ''));

}

if (import.meta.url === `file://${process.argv[1]}`) await spust();
