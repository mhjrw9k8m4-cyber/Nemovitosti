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
/* Kategorie „Pozemky" z číselníku, který API vrací v `Categories`
   (p02Id 13, p02Name „Pozemky"). Nehádá se, je změřená. */
export const KATEGORIE_POZEMKY = 13;
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
export const SPOLUVLASTNICKY_PODIL = /spoluvl|spoluvlastnick|podíl(?:\s+ve\s+výši)?\s+\d+\s*\/\s*\d+|id\.\s*podíl/i;

export function dotaz(strana = 1, naStranu = NA_STRANU, kategorie = KATEGORIE_POZEMKY) {
  return JSON.stringify({
    ListType: 'all',
    Page: strana,
    PageSize: naStranu,
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
export function mistoZNazvu(s) {
  const t = String(s || '').trim();
  /* „v k. ú. Bukovec" i „- k. ú. Sedlec u Mikulova". Naměřeno 4. 11.:
     na „v" se spoléhat nelze, u 67 nabídek stálo jen „k. ú.", a tím
     zmizely všechny (zahozeno jako „bez místa"). */
  const ku = t.match(/k\.?\s*ú\.?\s*([^,;(]+)/i);
  if (ku) return ku[1].trim().replace(/\s+/g, ' ').slice(0, 80);
  /* „Pacht pozemku p.č. 4862/16, Napajedla" → poslední část. */
  const casti = t.split(',').map((x) => x.trim()).filter(Boolean);
  const posledni = casti[casti.length - 1] || '';
  /* Poslední část nesmí být jen číslo parcely — pak místo v názvu není. */
  if (casti.length > 1 && !/^[\d/\s]+$/.test(posledni) && !/^p\.?\s*č/i.test(posledni)) {
    return posledni.replace(/\s+/g, ' ').slice(0, 80);
  }
  return '';
}

/* Termín aukce a stav do popisku u ceny. „Aukce vyhlášena (05.01.2027
   11:00 - 06.01.2027 11:00)" je informace, kterou kupující potřebuje:
   tohle se neprodává podpisem, ale v aukci. */
/* KOLIK JICH EVIDENCE V TÉ KATEGORII HLÁSÍ. `PropertyTotalCount` je
   počet VŠEHO (757 věcí všeho druhu), ne počet pozemků — kdo ho vypíše
   jako „v kategorii Pozemky", lže o řád. Číslo je v číselníku
   `Categories` u položky s naším `p02Id`, i v podkategoriích. */
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
export function nabidkyZOdpovedi(data, vymeraZPopisu, druhZPopisu, zahozeno) {
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
    /* Kategorie se filtruje dotazem, ale ověřit se to má: kdyby úřad
       čísla kategorií přečísloval, tahle kontrola to řekne hned,
       kdežto bez ní by se na web nasypaly stavby jako pozemky. */
    if (!/pozemk/i.test(String(z.CategoryName || ''))) { pocti('neniPozemek', z.CategoryName + ' — ' + z.Name); continue; }
    if (!jeProdej(z)) { pocti('pacht', z.Name); continue; }
    if (SPOLUVLASTNICKY_PODIL.test(String(z.Name || ''))) {
      pocti('spoluvlastnickyPodil', z.Name);
      continue;
    }
    const c = cena(z.Price);
    if (!c || z.NoPrice === true) { pocti('bezCeny', z.Name + ' — cena ' + JSON.stringify(z.Price)); continue; }
    const v = vymeraZPopisu(z.Description) || vymeraZPopisu(z.Name);
    if (!v) { pocti('bezVymery', z.Name + ' — ' + z.Description); continue; }
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
      _key: 'uzsvm-' + String(z.Id || place + '-' + c),
      extra: popisek(z),
      zdroj: ZDROJ_JMENO,
    });
  }
  return { nabidky, zahozeno: zahozeno || {} };
}
