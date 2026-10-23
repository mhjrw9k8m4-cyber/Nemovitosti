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
  const OKRES_KRAJ = (CENY && CENY.OKRES_KRAJ) || {};
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

  const podleOkresu = new Map();
  const podleKraje = new Map();
  for (const o of vse) {
    if (!o || !o.okres) continue;
    if (!podleOkresu.has(o.okres)) podleOkresu.set(o.okres, []);
    podleOkresu.get(o.okres).push(o);
    const k = OKRES_KRAJ[o.okres];
    if (!k) continue;
    if (!podleKraje.has(k)) podleKraje.set(k, []);
    podleKraje.get(k).push(o);
  }

  /* Co na disku zůstalo po okresu, který už nabídku nemá, by lhalo:
     soubor by se neobnovil a vypadal by jako aktuální. Přepíše se tedy
     na prázdný řez — ne smaže, aby odkaz nevracel 404. */
  function uklid(adresar, ziveSoubory, uroven) {
    const dir = path.join(ROOT, 'data', adresar);
    if (!fs.existsSync(dir)) return 0;
    let prazdnych = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || ziveSoubory.has(f)) continue;
      const obj = Object.assign({}, hlavicka, {
        rez: { uroven, nazev: null, soubor: `data/${adresar}/${f}`, pocet: 0 },
        opportunities: [],
      });
      zapis(`data/${adresar}/${f}`, obj);
      prazdnych++;
    }
    return prazdnych;
  }

  const rejstrik = { updated: celek.updated, updated_at: celek.updated_at, rezy: [] };
  let bajtu = 0;
  const ziveOkres = new Set();

  for (const [okres, polozky] of [...podleOkresu].sort()) {
    const soubor = `data/okres/${slug(okres)}.json`;
    ziveOkres.add(`${slug(okres)}.json`);
    const b = zapis(soubor, Object.assign({}, hlavicka, {
      rez: { uroven: 'okres', nazev: okres, kraj: OKRES_KRAJ[okres] || null, soubor, pocet: polozky.length },
      opportunities: polozky,
    }));
    bajtu += b;
    rejstrik.rezy.push({ uroven: 'okres', nazev: okres, kraj: OKRES_KRAJ[okres] || null, soubor, pocet: polozky.length, bajtu: b });
  }
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
      okresy: [...podleOkresu.keys()].filter((o) => OKRES_KRAJ[o] === kraj).sort()
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
    const proModel = bezDuplicit.filter((o) => !CENY.spravniCena(o));
    const okresy = [...new Set(proModel.map((o) => o.okres || ''))].sort();
    const druhy = [...new Set(proModel.map((o) => o.druh || ''))].sort();
    const typy = [...new Set(proModel.map((o) => o.type || ''))].sort();
    const iO = new Map(okresy.map((x, i) => [x, i]));
    const iD = new Map(druhy.map((x, i) => [x, i]));
    const iT = new Map(typy.map((x, i) => [x, i]));
    /* OTISK INZERENTA TU BÝT MUSÍ, na rozdíl od příznaku podílu o kus
       níž. Srovnávací hladina od 23. 10. slučuje nabídky jednoho
       inzerenta na jeden hlas a přihrádku, kterou drží jediný, nepoužije
       (js/ceny.js, MEZ_JEDEN_INZERENT) — bez tohohle sloupce by stránka
       pozemku počítala z jiných podkladů než mapa a o témž pozemku by
       tvrdily jiný verdikt. Hlídá to scripts/test-model-vstup.mjs. */
    const inzerenti = [...new Set(proModel.map((x) => x.inz).filter(Boolean))].sort();
    const iI = new Map(inzerenti.map((x, i) => [x, i]));
    const o = [], d = [], t = [], a = [], c = [], la = [], lo = [], si = [];
    for (const x of proModel) {
      o.push(iO.get(x.okres || '')); d.push(iD.get(x.druh || '')); t.push(iT.get(x.type || ''));
      a.push(x.area || 0); c.push(x.price || 0);
      si.push(x.inz && iI.has(x.inz) ? iI.get(x.inz) : -1);
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
        + 'Sloupcově a se slovníky, ať je to malé. Pole o/d/t jsou indexy do okresy/druhy/typy, '
        + 'a je výměra v m², c cena v Kč, la/lo souřadnice ×10 000 (celá čísla), '
        + 's je index do inzerenti (−1 = neznámý).',
      okresy, druhy, typy, inzerenti, o, d, t, a, c, la, lo, s: si,
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
      + 'v řezech okresů.',
    opportunities: proMapu.map((o) => {
      const c = Object.assign({}, o);
      delete c.url;
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

  console.log(`Řezy dat: ${podleOkresu.size} okresů (${podleKraje.size} krajů jako soupis)`
    + `, vstup modelu ${(bajtuModel / 1024).toFixed(0)} kB`
    + ` = ${(bajtu / 1024).toFixed(0)} kB dohromady`
    + ` (celek má ${(rejstrik.celek.bajtu / 1024).toFixed(0)} kB, nejmenší řez`
    + ` ${(Math.min(...rejstrik.rezy.map((r) => r.bajtu)) / 1024).toFixed(1)} kB)`
    + (prazdnych ? `, vyprázdněno ${prazdnych} bez nabídek` : ''));

}

if (import.meta.url === `file://${process.argv[1]}`) await spust();
