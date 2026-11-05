/* ČTENÍ NABÍDEK ÚZSVM (nabidkamajetku.gov.cz)
   ==================================================================
   Úřad pro zastupování státu ve věcech majetkových je největší státní
   prodejce nemovitostí. Změřeno 4. 11.: v nabídce má 757 věcí všeho
   druhu, z toho kategorie „Pozemky" 286.

   JAK SE K TOMU VŮBEC PŘIŠLO. Web je aplikace: v HTML nabídky nejsou
   (§355 „skořápka"), takže ze stránky se čtečka napsat nedá. Sonda
   proto umí vykreslit stránku prohlížečem a POSLECHNOUT SI, odkud si
   obsah bere — a to řeklo adresu `/api/Property/List`. Ta na GET
   odpoví HTTP 405, protože je to POST s filtrem v těle; tělo se dalo
   odposlechnout z téhož vykreslení. Žádné hádání, tři měření.

   ROBOTS.TXT: web ho nemá, tedy čtení nezakazuje (změřeno 3. i 4. 11.).

   NA CO SE TU DÁVÁ POZOR — A PROČ TO NENÍ DROBNOST
   ------------------------------------------------------------------
   Z pěti prvních POZEMKŮ byly ČTYŘI PACHT, ne prodej:

     Pacht pozemku p.č. 2025, Racková          1 207,00 Kč
     Pacht pozemku p.č. 1537/73, Štípa         2 824,00 Kč
     Pacht pozemku p.č. 4862/16, Napajedla       500,00 Kč
     pozemek p. č. 233/3 v k. ú. Bukovec   35 000 000,00 Kč   ← prodej

   U pachtu je ta cena ROČNÍ NÁJEM. Kdyby se to čtlo jako prodej, na
   webu by stál „pozemek za 500 Kč" — a protože podle Kč/m² se tu řadí,
   počítá verdikt i kreslí mapa, pokazilo by to i statistiku, ne jen
   jednu kartu. Pacht se proto zahazuje a počítá se zvlášť.
   ================================================================== */

export const ZDROJ_JMENO = 'ÚZSVM';
export const API = 'https://nabidkamajetku.gov.cz/api/Property/List';
/* ADRESA JEDNÉ NABÍDKY. Změřeno 4. 11.: na úvodní stránce aplikace je
   tvar `/Home/Detail/<číslo>` 75×, odpoví HTTP 200 a nese tentýž popis
   jako API. Dvě adresy, které jsem si předtím domyslel —
   `/detail/<číslo>` a `/api/Property/Detail?id=` — vracejí 404; proto
   se tvar měří a nehádá. Bez odkazu neměla nabídka na našem webu kam
   vést, a to je u zdroje bez fotek to jediné, co člověk může udělat. */
export const DETAIL_URL = 'https://nabidkamajetku.gov.cz/Home/Detail/';

export function odkazNabidky(id) {
  const c = String(id == null ? '' : id).trim();
  if (!/^\d+$/.test(c)) return '';      // bez čísla nabídky odkaz nevede nikam
  return DETAIL_URL + c;
}
/* Kategorie „Pozemky" z číselníku, který API vrací v `Categories`
   (p02Id 13, p02Name „Pozemky"). Nehádá se, je změřená. */
export const KATEGORIE_POZEMKY = 13;
/* KOLIK NA STRANU — A STO JE STROP, NE VOLBA.
 *
 * Změřeno 5. 11. 2026 v Actions (sonda ohledani-zdroje, tři běhy nad
 * tímhle API):
 *   PageSize 100   → `Properties` má 100 prvků, `PageCount` 3
 *   PageSize 1000  → `Properties` má  25 prvků (server spadl na svou
 *                    vlastní stranu; `DefaultPageSize` v odpovědi je 0,
 *                    takže se to z ní ani nepozná)
 *
 * Je to past obráceně, než člověk čeká: ZVĚTŠIT stranu znamená dostat
 * MÍŇ. Kdo tu stovku zvedne „aby se to stáhlo na jeden dotaz", začne
 * brát 25 na stranu — a protože strop stran je deset, přestane se
 * stahovat 250 nabídek z 276 a nic to nenahlásí.
 *
 * Proto je tu mez i zkouška: scripts/test-uzsvm.mjs hlídá, že se
 * NA_STRANU nedostane nad změřenou stovku. */
export const NA_STRANU_STROP = 100;
export const NA_STRANU = 100;
/* Strop stran: 286 pozemků po stovce jsou tři strany. Deset je rezerva
   na růst, ne na nekonečnou smyčku. */
export const STROP_STRAN = 10;

/* CO NENÍ PRODEJ. Pacht, nájem, výpůjčka, služebnost.
 *
 * A POZOR NA TO, KDE SE TO HLEDÁ. Nejdřív jsem to hledal v názvu
 * I V CELÉM POPISU — a první běh naostro ukázal, co to udělá:
 * zahodilo se tím „pozemek p. č. 233/3 v k. ú. Bukovec" za 35 milionů,
 * tedy ten jediný PRODEJ z prvních pěti. Jeho popis má 1 521 znaků
 * a někde v nich se o nájmu mluví — pozemek se prodává a zároveň je
 * pronajatý, což je u státních pozemků spíš pravidlo než výjimka.
 *
 * Rozhoduje proto NÁZEV („Pacht pozemku p.č. 2025, Racková") a z popisu
 * jen věta, která říká, co je PŘEDMĚTEM („Předmětem aukce je pacht
 * pozemku(ů)…"). Zmínka o nájmu uvnitř popisu prodej nediskvalifikuje. */
export const NENI_PRODEJ = /pacht|pronáj|nájem|najem|výpůjč|vypujc|služebnost|sluzebnost/i;
export const PREDMETEM_NENI_PRODEJ =
  /předmětem\s+(?:aukce|prodeje|nabídky|výběrového\s+řízení)?\s*(?:je|jsou)\s+(?:[^.]{0,40}?)(pacht|pronáj|nájem|najem|výpůjč|vypujc)/i;

export function jeProdej(z) {
  if (NENI_PRODEJ.test(String((z && z.Name) || ''))) return false;
  if (PREDMETEM_NENI_PRODEJ.test(String((z && z.Description) || ''))) return false;
  return true;
}

/* SPOLUVLASTNICKÝ PODÍL. „Vrátno - id. spoluvl. podíl ve výši 1/2
   st.p.č. 13" — cena je za PODÍL, kdežto výměra v popisu je výměra
   celé parcely. Kč/m² by z toho vyšlo o tolik nižší, kolikátý je ten
   podíl, a podle Kč/m² se tu řadí i počítá verdikt. Zahazuje se to
   proto zvlášť a s vlastním jménem, ne jako „bez výměry". */
/* ZMĚŘENO 4. 11.: TOHLE SÍTO MĚLO DÍRU A JEDNA NABÍDKA JÍ PROŠLA.
   Na webu stál „les 8 927 m² za 80 000 Kč", tedy 8,96 Kč/m² — a to je
   při mediánu desítek korun za metr nejlevnější pozemek v republice.
   Pravda byla jiná: detail nabídky 96857 říká „Břežany u Rakovníka,
   id. 1/2 pozemků parc.č. 213/51, 303/115 a 303/116", takže cena je
   za POLOVINU a výměra v popisu je výměra celku. Starý výraz znal
   „id. podíl", „spoluvl…" a „podíl ve výši 1/2" — tvar „id. 1/2
   pozemků" ne. Jedna taková nabídka pokřiví cenovou referenci,
   verdikt i mapu, protože podle Kč/m² se tu řadí i počítá. */
export const SPOLUVLASTNICKY_PODIL = /spoluvl|spoluvlastnick|podíl(?:\s+ve\s+výši)?\s+\d+\s*\/\s*\d+|id\.\s*(?:podíl|\d+\s*\/\s*\d+)|ide[áa]ln\S*\s+(?:podíl\s+)?\d+\s*\/\s*\d+/i;

/* VELIKOST PODÍLU, KDYŽ JE PODÍL. Vrací „1/2" nebo prázdno.
   PROČ TO NENÍ JEN OZDOBA: zbytek webu podíly UKAZUJE a cenu za metr
   u nich dělí zlomkem (js/ceny.js, vymeraVCene) — tedy správně, protože
   výměra v popisu je výměra celku a cena je za podíl. Zahodit podíl se
   zlomkem by znamenalo vyhodit nabídku, kterou web umí ukázat poctivě.
   Zahodit se má naopak podíl, u kterého zlomek PŘEČÍST NEJDE: tam by
   na webu stála cena celku proti výměře celku, a to je lež.
   Čte se jmenovatel i čitatel, protože „1/2" a „1/88" jsou úplně jiná
   nabídka (naměřeno 4. 11.: 54 ha lesa, podíl 1/88, cena 42 000 Kč).
   Nesmyslné zlomky (čitatel větší než jmenovatel, nula) se nevracejí —
   js/ceny.js je stejně odmítne a tady by jen plodily falešný klid. */
export const ZLOMEK = /(?:id\.|ide[áa]ln\S*|podíl(?:u)?(?:\s+ve\s+výši)?)\s*(?:podíl(?:u)?\s*(?:ve\s+výši\s*)?)?(\d{1,4})\s*\/\s*(\d{1,4})\b/i;

export function zlomekPodilu(text) {
  const m = ZLOMEK.exec(String(text || ''));
  if (!m) return '';
  const a = Number(m[1]), b = Number(m[2]);
  if (!(a > 0) || !(b > 0) || a > b) return '';
  return a + '/' + b;
}

export function dotaz(strana = 1, naStranu = NA_STRANU, kategorie = KATEGORIE_POZEMKY) {
  /* MEZ SE DRŽÍ TADY, ne jen v konstantě. Kdo sem podá tisíc, dostane
     od serveru 25 na stranu (viz měření u NA_STRANU_STROP) — tedy
     opak toho, co chtěl, a bez hlášení. Ořezat to při skládání dotazu
     je jediné místo, kterým prochází každý volající. */
  const naStranuBezpecne = Math.min(Number(naStranu) || NA_STRANU, NA_STRANU_STROP);
  return JSON.stringify({
    ListType: 'all',
    Page: strana,
    PageSize: naStranuBezpecne,
    Order: 'Default',
    OrderDesc: 'true',
    CategoryId: kategorie,
    Fulltext: '',
    OrgId: '',
    OrganizationType: 0,
    OrganizationId: 0,
    LocalityId: 0,
    MunicipialityId: 0,
    CadastreId: 0,
    ContactZipCode: '',
    PropertyAuthor: '',
    /* Ukončené nabídky nechceme: web má ukazovat, co se dá koupit. */
    ShowEndedProperties: false,
    InterestId: 0,
    MyinterestId: 0,
    State: 0,
  });
}

/* Cena přijde jako ČESKY NAPSANÝ ŘETĚZEC: „35 000 000,00". Mezera je
   často nedělitelná (U+00A0) a desetinná čárka je čárka. Number() by
   z toho udělal NaN a nabídka by zmizela s hláškou „bez ceny". */
export function cena(s) {
  const t = String(s == null ? '' : s).replace(/[\s ]/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/* PARCELNÍ ČÍSLO Z NÁZVU. Skutečné názvy: „pozemek p. č. 233/3 v k. ú.
   Bukovec", „Pacht pozemku p.č. 3264, 3266, 2228/74, Tlumačov na
   Moravě". Mezery za „p." se píšou i nepíšou. Víc čísel se vypíše
   tak, jak jsou — jedno číslo u víc parcel by lhalo. */
export function parcelaZNazvu(s) {
  const t = String(s || '');
  const m = t.match(/p\.\s*č\.\s*([\d/]+(?:\s*,\s*[\d/]+)*)/i);
  if (!m) return '';
  return m[1].replace(/\s*,\s*/g, ', ').trim().slice(0, 60);
}

/* MÍSTO. V názvu bývá „v k. ú. Bukovec" (katastrální území) nebo je
   místo na konci za poslední čárkou („…, Racková"). Okres přichází
   zvlášť v poli DistrictName, takže tohle nemusí být obec — ale musí
   to být jméno, které geokodér najde. */
/* CO MÍSTO NENÍ. Naměřeno 4. 11. na 118 zapojených nabídkách ÚZSVM:
   u 19 z nich se jako místo na web dostalo něco, co místo vůbec není —
   označení parcely („p. p. č. 1759/1", „pozemek p. č. 1529",
   „POZEMEK ST. P. Č. 8", „303/115 a 303/116") nebo číslo jednacího
   spisu aukce („EAS/ULT/130/2026", „aukce č. EAS/ULT/125/2026").
   Na kartě pak stálo „p. p. č. 1759/1, okres Tachov" a geokodér
   hledal v mapě číslo parcely.

   Pravidlo z §365 („číslo spisu není místo") tu bylo, jen se vztahovalo
   na část PŘED POMLČKOU. Tyhle tvary pomlčku nemají, takže propadly
   dál. Ověřeno na všech 19: po očištění zmizí 17 z nich a dvěma se
   místo naopak ZACHRÁNÍ, protože ho v názvu mají („Staňkovice u Žatce
   p.p.č. 715/15", „Slavče u Trhových Svinů EAS/CB/153/2026").

   Vymyšlené místo je horší než chybějící nabídka: nabídka bez místa se
   zahodí a je to vidět v počtu, kdežto nabídka s parcelním číslem
   místo obce lže čtenáři i mapě. */
export const SPISOVA_ZNACKA = /\b[A-ZÁ-Ž]{2,4}\/[A-ZÁ-Ž0-9]{1,6}\/\d+\/\d{2,4}\b/g;
export const OZNACENI_PARCELY = /\b(?:st\.?\s*)?(?:p\.?\s*)?p\.?\s*[čc]\.?\s*[\d/]+(?:\s*(?:,|a)\s*[\d/]+)*/gi;
export const OZNACENI_PARCELY2 = /\bparc(?:ela)?\.?\s*(?:[čc]\.?)?\s*[\d/]+/gi;
/* Slova, která samo o sobě místem nejsou — po očištění nesmí zbýt jen ono. */
export const NENI_MISTO = /^(?:pozemek|pozemky|poz|st|stp|parcela|parc|aukce|aukc|id|spoluvl|podíl|podil|prodej|pacht|a|i|č|c|ks)$/i;

/* KDE JMÉNO OBCE KONČÍ A ZAČÍNÁ TECHNICKÝ POPIS.
   Naměřeno 4. 11. na zveřejněných datech: pět míst, do kterých zasáhl
   popis — „Blšany o výměře m2", „Mašovice u Meclova-id. podíl a",
   „Valtice - pozemek parcela číslo", a dvě, která jako obec nejsou
   vůbec nic: „O CELKOVÉ VÝMĚŘE M2" a „id. pozemku". Je to vidět na
   kartě, v titulku stránky, v adrese i v sitemapě, takže to není
   kosmetika.
   Řeže se PŘED čištěním čísel: po odstranění čísel už „o výměře m2"
   vypadá jako dvě nevinná slova a nepoznalo by se, že to byl popis.
   Pořadí v seznamu nerozhoduje, bere se nejlevnější nález. */
export const ZACATEK_POPISU = /\s*(?:[-–—,]\s*)?\b(?:o\s+(?:celkové\s+)?výmě|výměr|id\.|ide[áa]ln|spoluvl|podíl|pozemek|pozemky|parcel[ay]\s+číslo|v\s+k\.?\s*ú)/i;

export function ocistiMisto(s) {
  const cele = String(s || '');
  const rez = ZACATEK_POPISU.exec(cele);
  /* Když popis začíná hned na začátku, žádné jméno obce před ním není
     — a „O CELKOVÉ VÝMĚŘE M2" se jako obec vypsat nesmí. */
  if (rez && rez.index === 0) return '';
  let t = (rez ? cele.slice(0, rez.index) : cele)
    .replace(SPISOVA_ZNACKA, ' ')
    .replace(OZNACENI_PARCELY, ' ')
    .replace(OZNACENI_PARCELY2, ' ')
    /* Zbytky: samostatná čísla s lomítky a uvozovací slova. */
    .replace(/\b\d+(?:\/\d+)*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '')
    .trim();
  /* Co zbylo bez písmen, místo není. */
  if (!/[A-Za-zÁ-Žá-ž]/.test(t)) return '';
  /* A nesmí zbýt jen uvozovací slovo („pozemek", „aukce č."). */
  const slova = t.split(/\s+/).filter((x) => /[A-Za-zÁ-Žá-ž]/.test(x));
  if (!slova.length) return '';
  if (slova.every((x) => NENI_MISTO.test(x.replace(/[.,;:]/g, '')))) return '';
  if (t.length < 2) return '';
  return t.slice(0, 80);
}

export function mistoZNazvu(s) {
  const t = String(s || '').trim();
  /* MÍSTO BÝVÁ I PŘED POMLČKOU, a je to nejčastější tvar vůbec.
     Naměřeno 4. 11.: „Otinoves - pozemek parc. č. st. 37", „Bakov nad
     Jizerou - pozemek pozemková parcela č. 553/7", „Vrátno - id.
     spoluvl. podíl…" — 45 nabídek zmizelo jako „bez místa", protože
     jsem čekal „k. ú." nebo místo za poslední čárkou. Před pomlčkou
     ale stojí i číslo jednacího spisu („EA/BBV/66/2026 - k. ú. Sedlec
     u Mikulova"), takže se bere jen část bez číslic a lomítek. */
  const pred = t.split(/\s+[-–—]\s+/)[0] || '';
  const jeJmeno = pred.length >= 2 && pred.length <= 60
    && !/\d|\//.test(pred)
    && !/^(pozemek|pozemky|pacht|prodej|aukce|st\.?|parc)/i.test(pred);
  /* „v k. ú. Bukovec" i „- k. ú. Sedlec u Mikulova". Naměřeno 4. 11.:
     na „v" se spoléhat nelze, u 67 nabídek stálo jen „k. ú.", a tím
     zmizely všechny (zahozeno jako „bez místa"). */
  const ku = t.match(/k\.?\s*ú\.?\s*([^,;(]+)/i);
  if (ku) return ocistiMisto(ku[1]);
  if (jeJmeno) return ocistiMisto(pred);
  /* „Pacht pozemku p.č. 4862/16, Napajedla" → poslední část. */
  const casti = t.split(',').map((x) => x.trim()).filter(Boolean);
  const posledni = casti[casti.length - 1] || '';
  /* Poslední část nesmí být jen číslo parcely — pak místo v názvu není. */
  if (casti.length > 1 && !/^[\d/\s]+$/.test(posledni) && !/^p\.?\s*č/i.test(posledni)) {
    return ocistiMisto(posledni);
  }
  /* A NAKONEC: JEN KDYŽ V NÁZVU OPRAVDU STOJÍ OZNAČENÍ, KTERÉ JDE
     ODŘÍZNOUT. Tady se zachrání tvary, které místo mají, ale bez
     pomlčky, bez „k. ú." a bez čárky: „Staňkovice u Žatce p.p.č.
     715/15". Bez téhle podmínky by se jako místo vrátil KAŽDÝ název,
     v němž jsou písmena — a „Pozemek - bez místa" by se stalo obcí.
     (Na to jsem si naletěl hned při psaní téhle opravy: dvě starší
     kontroly spadly a měly pravdu.) */
  const maOznaceni = new RegExp(SPISOVA_ZNACKA.source).test(t)
    || new RegExp(OZNACENI_PARCELY.source, 'i').test(t)
    || new RegExp(OZNACENI_PARCELY2.source, 'i').test(t);
  if (maOznaceni) return ocistiMisto(t);
  return '';
}

/* Termín aukce a stav do popisku u ceny. „Aukce vyhlášena (05.01.2027
   11:00 - 06.01.2027 11:00)" je informace, kterou kupující potřebuje:
   tohle se neprodává podpisem, ale v aukci. */
/* KOLIK JICH EVIDENCE V TÉ KATEGORII HLÁSÍ. `PropertyTotalCount` je
   počet VŠEHO (757 věcí všeho druhu), ne počet pozemků — kdo ho vypíše
   jako „v kategorii Pozemky", lže o řád. Číslo je v číselníku
   `Categories` u položky s naším `p02Id`, i v podkategoriích. */
/* KTERÉ KATEGORIE JSOU NEMOVITOSTI — ZEPTÁME SE ČÍSELNÍKU, NEHÁDÁME.
   ==================================================================
   Majitel 5. 11. rozhodl, že na webu budou všechny nemovitosti, ne jen
   pozemky. ÚZSVM je největší státní prodejce, takže je to první zdroj,
   který se rozšiřuje — ale ne naslepo.

   ZMĚŘENO 5. 11. z Actions dotazem s `CategoryId: 0`:
     p02Id 10 „Nemovité věci a družstevní byty"  p02IsRealty=true   367
         ├ 13 Pozemky             276
         ├ 11 Stavby               78
         ├ 55 Jiné objekty          7
         ├ 63 Jednotky              3
         └ 12 Družstevní podíly     3
     p02Id  1 „Movité věci"        p02IsRealty=false  348
     PropertyTotalCount                               729

   DVĚ VĚCI Z TOHO MĚŘENÍ SE MUSÍ NAPSAT, protože obě vyvracejí to, co
   by člověk čekal:

   1. RODIČOVSKÉ ID NEFILTRUJE. Dotaz s `CategoryId: 10` vrátil týž
      `PropertyTotalCount` 729 jako `CategoryId: 0` — tedy ne 367.
      Brát se musí LISTY číselníku po jednom, ne rodič.
   2. MOVITÉ VĚCI NA WEB NEPATŘÍ. Je jich 348, tedy skoro polovina
      nabídky: automobily, stroje, nábytek. Zdroj je sám odlišuje
      příznakem `p02IsRealty`, takže se na to nemusí hádat z názvu. */
export function kategorieNemovitosti(data) {
  const ven = [];
  const projdi = (seznam) => {
    for (const k of (Array.isArray(seznam) ? seznam : [])) {
      if (!k || typeof k !== 'object') continue;
      const deti = Array.isArray(k.Subcategories) ? k.Subcategories : [];
      /* Jen listy: rodič se dotazem filtrovat nedá (viz bod 1 výš). */
      if (k.p02IsRealty === true && !deti.length) {
        const id = Number(k.p02Id);
        if (Number.isFinite(id) && id > 0) {
          ven.push({ id, nazev: String(k.p02Name || ''), pocet: Number(k.FilteredCount) || 0 });
        }
      }
      projdi(deti);
    }
  };
  projdi(data && data.Categories);
  return ven;
}

/* KATEGORIE ZDROJE → NAŠE `kat`.
   Prázdná hodnota znamená „zdroj to neřekl dost přesně, rozhodne text":
   „Stavby" je dům, areál, hala i kravín, „Jiné objekty" cokoli. Volající
   ale musí vědět, že to NENÍ pozemek — jinak by se u budovy počítala
   obvyklá cena za m² pozemku, což je číslo bez významu.

   Družstevní podíl je v praxi byt: podíl v bytovém družstvu se kupuje
   kvůli bytu, který k němu patří, a tak ho vedou i portály. */
export const KAT_PODLE_KATEGORIE = {
  'Pozemky': 'pozemek',
  'Jednotky': 'byt',
  'Družstevní podíly': 'byt',
  'Stavby': '',
  'Jiné objekty': '',
};
export function katZKategorie(nazev) {
  const n = String(nazev == null ? '' : nazev).trim();
  return Object.prototype.hasOwnProperty.call(KAT_PODLE_KATEGORIE, n)
    ? KAT_PODLE_KATEGORIE[n] : '';
}
/** Je to kategorie, kterou ZNÁME jako nemovitost? Prázdná hodnota
    v tabulce znamená „známe, ale je obecná" — a to je něco jiného než
    „neznáme vůbec" (automobily, stroje). Proto se ptá na přítomnost
    klíče, ne na pravdivost hodnoty. */
export function jeKategorieNemovitosti(nazev) {
  const n = String(nazev == null ? '' : nazev).trim();
  return Object.prototype.hasOwnProperty.call(KAT_PODLE_KATEGORIE, n);
}
/** Je ta kategorie zdroje pozemková? Používá se na to, aby se budova
    nikdy nestala pozemkem, když z textu nic nevyjde. */
export function jePozemkovaKategorie(nazev) {
  return katZKategorie(nazev) === 'pozemek';
}

export function pocetVKategorii(data, kategorie = KATEGORIE_POZEMKY) {
  const hledej = (seznam) => {
    for (const k of (Array.isArray(seznam) ? seznam : [])) {
      if (!k || typeof k !== 'object') continue;
      if (Number(k.p02Id) === Number(kategorie)) {
        const n = Number(k.FilteredCount);
        return Number.isFinite(n) ? n : null;
      }
      const hloub = hledej(k.Subcategories);
      if (hloub !== null) return hloub;
    }
    return null;
  };
  return hledej(data && data.Categories);
}

export function popisek(z) {
  const kousky = [];
  const stav = String((z && z.StatusName) || '').trim();
  if (stav) kousky.push(stav);
  const doKdy = String((z && z.EndOfUserApplying) || '').trim();
  if (doKdy) kousky.push('přihlášky do ' + doKdy);
  kousky.push('nabídka ÚZSVM');
  return kousky.join(' · ');
}

/* ------------------------------------------------------------------
   CELÝ PŘEVOD. Vrací { nabidky, zahozeno }, protože „kolik se zahodilo
   a proč" je údaj, který musí být vidět — bez něj se tiše rozpadne
   zdroj a nikdo neví, jestli je vada v datech, nebo v nás (§363–§366).

   Čtení výměry a druhu se PŘEDÁVÁ, ne opisuje: `vymeraZPopisu`
   i `druhZPopisu` už umí čtečka otevřených dat státu a dvě kopie téhož
   pravidla by se rozešly při první opravě.
   ------------------------------------------------------------------ */
/* `katZTextu` je šestý, nepovinný: kategorie nemovitosti z vlastních
   slov zdroje. Předává se stejně jako čtení výměry a druhu, aby si
   tahle čtečka netahala prohlížečové moduly. */
export function nabidkyZOdpovedi(data, vymeraZPopisu, druhZPopisu, zahozeno, zminujeMetry, katZTextu) {
  /* UKÁZKA KE KAŽDÉMU DŮVODU. Číslo samo nerozhodne: „bezVymery 119"
     může znamenat, že výměra v popisu opravdu není, i že ji čteme
     špatně — a to je rozdíl mezi „data za to nemůžou" a „můžeme my"
     (§366). Ukládá se první, na které se to stalo. */
  const pocti = (k, ukazka) => {
    if (!zahozeno) return;
    zahozeno[k] = (zahozeno[k] || 0) + 1;
    if (!zahozeno.ukazky) zahozeno.ukazky = {};
    if (!zahozeno.ukazky[k] && ukazka) zahozeno.ukazky[k] = String(ukazka).replace(/\s+/g, ' ').slice(0, 200);
  };
  const nabidky = [];
  const polozky = (data && Array.isArray(data.Properties)) ? data.Properties : [];
  for (const z of polozky) {
    if (!z || typeof z !== 'object') { pocti('prazdnyZaznam'); continue; }
    pocti('zaznamu');
    /* KATEGORIE SE OVĚŘUJE, I KDYŽ SE FILTRUJE DOTAZEM.
       Dřív tu stálo `if (!/pozemk/i.test(CategoryName)) continue` —
       tedy „co není pozemek, zahoď". Od 5. 11. web nese všechny
       nemovitosti, takže se zahazuje jen to, co nemovitost NENÍ:
       movité věci (automobily, stroje) jsou v nabídce ÚZSVM skoro
       polovina (348 ze 729, změřeno) a na web nepatří.

       NEZNÁMÁ KATEGORIE SE NEPUSTÍ DÁL, ALE ANI NEZMIZÍ TICHO: počítá
       se zvlášť a s ukázkou, takže se v logu pozná, že úřad přidal
       kategorii, o které nevíme. Bez toho by se buď na web nasypaly
       automobily, nebo by nová kategorie nemovitostí tiše propadla. */
    if (!jeKategorieNemovitosti(z.CategoryName)) {
      pocti(/movit/i.test(String(z.CategoryName || '')) ? 'movitaVec' : 'neznamaKategorie',
        z.CategoryName + ' — ' + z.Name);
      continue;
    }
    if (!jeProdej(z)) { pocti('pacht', z.Name); continue; }
    /* PODÍL: ZVEŘEJNIT SE ZLOMKEM, ZAHODIT BEZ NĚJ. Viz zlomekPodilu
       výš — se zlomkem web cenu za metr podělí, bez něj by lhal. */
    const jePodil = SPOLUVLASTNICKY_PODIL.test(String(z.Name || ''))
      || SPOLUVLASTNICKY_PODIL.test(String(z.Description || ''));
    const zlomek = jePodil
      ? (zlomekPodilu(z.Name) || zlomekPodilu(z.Description))
      : '';
    if (jePodil && !zlomek) {
      pocti('podilBezZlomku', z.Name);
      continue;
    }
    const c = cena(z.Price);
    if (!c || z.NoPrice === true) { pocti('bezCeny', z.Name + ' — cena ' + JSON.stringify(z.Price)); continue; }
    const v = vymeraZPopisu(z.Description) || vymeraZPopisu(z.Name);
    if (!v) {
      pocti('bezVymery', z.Name + ' — ' + z.Description);
      /* A ZVLÁŠŤ TY, KDE SE O METRECH MLUVÍ A PŘESTO JSME NIC
         NEPŘEČETLI. To je rozdíl mezi „v popisu výměra není" a
         „neumíme ji přečíst" — táž otázka jako u otevřených dat
         státu (§363), kde právě tohle číslo rozhodlo. */
      if (zminujeMetry && zminujeMetry(z.Description)) {
        pocti('bezVymeryAleMetryTam', z.Name + ' — ' + z.Description);
      }
      continue;
    }
    const okres = String(z.DistrictName || '').trim();
    if (!okres) { pocti('bezOkresu', z.Name); continue; }
    const place = mistoZNazvu(z.Name);
    if (!place) { pocti('bezMista', z.Name); continue; }
    nabidky.push({
      type: 'sale',
      place,
      okres,
      parcel: parcelaZNazvu(z.Name) || '—',
      druh: druhZPopisu(String(z.Name || '') + ' ' + String(z.Description || '')),
      area: v,
      price: c,
      /* Vlastní klíč podle čísla nabídky v aplikaci: bez něj by se
         nabídky bez parcelního čísla v jednom okrese slily do jedné
         (§365). */
      /* Příznak i velikost podílu — táž jména, jakými je zná zbytek
         webu (js/vybaveni.js je nasazuje u ostatních zdrojů). */
      ...(jePodil ? { podil: true, zlomek } : {}),
      /* KATEGORIE PODLE ZDROJE, KDYŽ JI ZDROJ ŘÍKÁ.
         „Pozemky", „Jednotky" a „Družstevní podíly" jsou jednoznačné,
         a tahle informace je silnější než hádání z textu — proto se
         zapisuje tady a robot ji nepřepisuje (viz `if (!o.kat)` ve
         fetch-opportunities.mjs). U obecných „Stavby" a „Jiné objekty"
         se `kat` NEZAPISUJE a rozhodne text; robot ale ví, že pozemek
         to není, a doplní „jiná nemovitost" (`_neniPozemek`).
         Pozemek se do dat nepíše vůbec — je výchozí a u 276 nabídek by
         to byly jen kilobajty navíc přes drát. */
      ...((function () {
        /* 1) ČÍSELNÍK ZDROJE, KDYŽ MLUVÍ JASNĚ. „Jednotky" a
           „Družstevní podíly" jsou byt, tečka. */
        const zCiselniku = katZKategorie(z.CategoryName);
        /* Příznak „není pozemek" se nese I TEHDY, když kategorii známe.
           Je to údaj o nabídce, ne jen pojistka pro hádání z textu —
           a zbytek webu ho tak čte (hlídá scripts/test-uzsvm.mjs). */
        if (zCiselniku && zCiselniku !== 'pozemek') return { kat: zCiselniku, _neniPozemek: true };
        if (jePozemkovaKategorie(z.CategoryName)) return {};
        /* 2) A U OBECNÝCH „STAVBY" A „JINÉ OBJEKTY" ROZHODNOU VLASTNÍ
           SLOVA ZDROJE — a musí se vzít TADY, ne až v robotovi.
           Naměřeno naostro 5. 11.: první běh po zapojení přinesl 30
           nepozemkových nabídek a VŠECHNY vyšly jako „jiná
           nemovitost". Důvod: robot skládá text ke hádání z `place`,
           `druh` a `extra` — tedy z obce, druhu PARCELY a termínu
           aukce. Předmět prodeje v tom není. Jméno a popis nabídky
           („Králův Dvůr, budova č.p. 442", „Štiřín — areál zámku",
           „Rekreační zařízení") má v ruce jedině tahle čtečka a do dat
           je nepředává.
           Pozemkový výsledek se zahazuje: kdyby text u „Stavby" řekl
           „pozemek", je to druh parcely pod stavbou (viz §415), ne
           předmět prodeje — a `_neniPozemek` níž doplní poctivé
           „nevím co, ale pozemek to není". */
        const slova = [z.Name, z.Description].filter(Boolean).join(' ');
        const zTextu = (katZTextu && slova) ? katZTextu(slova, [place, okres]) : null;
        if (zTextu && zTextu !== 'pozemek') return { kat: zTextu, _neniPozemek: true };
        return { _neniPozemek: true };
      }())),
      _key: 'uzsvm-' + String(z.Id || place + '-' + c),
      url: odkazNabidky(z.Id) || undefined,
      extra: popisek(z),
      zdroj: ZDROJ_JMENO,
    });
  }
  return { nabidky, zahozeno: zahozeno || {} };
}
