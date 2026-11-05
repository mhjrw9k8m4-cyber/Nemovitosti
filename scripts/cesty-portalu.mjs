import { copakTamJe } from './cteni-zdroje.mjs';
/* VŠECHNY CESTY, KTERÝMI SE DÁ DO PORTÁLU DOSTAT — a jak se pozná,
   která z nich vede k nabídkám
   ==================================================================
   Tenhle soubor NECHODÍ po síti. Je to katalog tvarů adres a pravidla,
   jak odpověď posoudit; chození obstarává scripts/zkus-portal.mjs,
   aby se rozhodování dalo zkoušet bez internetu.

   PROČ TO VZNIKÁ. Dosud se cesta ke každému zdroji hledala RUČNĚ: já
   jsem si vzpomněl na adresu, pustil ohledání, podíval se, zkusil
   jinou. U ÚZSVM to stálo šest běhů a dvě adresy, které vracely 404
   (`/detail/<číslo>` a `/api/Property/Detail?id=`), než se našel tvar
   `/Home/Detail/<číslo>`. Takhle se dá projít pět portálů, ne sto.

   CO TEDY DĚLÁ BOT. Vezme portál a POSTUPNĚ VYZKOUŠÍ VŠECHNY TVARY,
   které tu stojí — od otevřených dat podle české normy přes CKAN,
   DCAT, ArcGIS a WFS až po sitemapu, RSS a obyčejné stránky s nabídkami.
   U každé zapíše, co odpověděla. Z „nevím, kudy na ten web" se tím
   stane tabulka.

   A SPOJOVÁNÍ PORTÁLŮ. Vstupní adresa skoro nikdy není ta, kde jsou
   nabídky: katalog vede na datovou sadu, datová sada na soubor, teprve
   v souboru jsou pozemky. Proto se cesty ŘETĚZÍ — nález z jedné je
   vstup pro další (`dalsiCesty`). Totéž u sitemapy: ta vede na výpis
   a výpis na inzerát.

   CO JE ZMĚŘENO A CO JE JEN TVAR, KTERÝ SE ZKOUŠÍ. To se nesmí
   slévat, proto to u každé cesty stojí v poli `zmereno`:
     · změřené (4. 11. 2026): OFN katalog `/lod/catalog` (Hradec
       Králové, JSON-LD s `datová_sada`), POST rozhraní aplikace
       (ÚZSVM `/api/Property/List`), export do CSV
       (portal.gov.cz `?export=csv`), sitemapa a RSS (sonda zdrojů),
       detail nabídky `/Home/Detail/<číslo>`;
     · NEZMĚŘENÉ tvary, které se jen zkoušejí: CKAN `/api/3/action/…`
       (na data.gov.cz vrátilo 404, jinde nevyzkoušené), DCAT
       `/data.json`, ArcGIS `/arcgis/rest/services`, WFS
       GetCapabilities, OAI-PMH. Jsou to STANDARDY, ne odhady od boku —
       ale že je ten který portál má, se musí teprve změřit.
   Hlášení ten rozdíl vypisuje. „Zkusili jsme deset cest" není totéž
   jako „deset cest tam je".
   ================================================================== */

/* ------------------------------------------------------------------
   KATALOG TVARŮ. `cesta` je relativní adresa od základu portálu.
   `skupina` říká, o jaký druh rozhraní jde, `ocekava` jaký tvar
   odpovědi by to mělo být, a `zmereno` jestli jsme takovou odpověď
   už někde opravdu viděli.
   ------------------------------------------------------------------ */
export const CESTY = [
  /* --- otevřená data podle české otevřené formální normy --------- */
  { jmeno: 'OFN katalog (lod)', skupina: 'katalog', cesta: '/lod/catalog',
    ocekava: 'JSON', zmereno: true,
    proc: 'Rozhraní katalogů otevřených dat. Změřeno na api.opendata.mmhk.cz: JSON-LD'
      + ' s polem `datová_sada`, odkud se dá dojít na jednotlivé sady.' },
  { jmeno: 'OFN katalog (katalog)', skupina: 'katalog', cesta: '/katalog',
    ocekava: 'JSON', zmereno: true,
    proc: 'Týž tvar, jiné jméno cesty — tak ho má Mělník (data.melnik.cz/lkod/…/katalog).' },
  { jmeno: 'OFN katalog (api/catalogue)', skupina: 'katalog', cesta: '/api/catalogue',
    ocekava: 'JSON', zmereno: false,
    proc: 'Další z pojmenování téhož rozhraní, které se v rejstříku lokálních katalogů objevuje.' },
  { jmeno: 'OFN katalog (opendata/katalog)', skupina: 'katalog', cesta: '/opendata/katalog',
    ocekava: 'JSON', zmereno: true,
    proc: 'Tak ho má Český statistický úřad (data.csu.gov.cz/opendata/katalog).' },
  { jmeno: 'OFN katalog (jsonld)', skupina: 'katalog', cesta: '/katalog.jsonld',
    ocekava: 'JSON', zmereno: false, proc: 'Katalog vystavený jako jeden soubor.' },

  /* --- rozhraní katalogů, která se používají ve světě ------------ */
  { jmeno: 'DCAT data.json', skupina: 'katalog', cesta: '/data.json',
    ocekava: 'JSON', zmereno: false,
    proc: 'Americká norma pro katalogy otevřených dat; některé české portály ji mají taky.' },
  { jmeno: 'CKAN hledání', skupina: 'katalog', cesta: '/api/3/action/package_search?q=pozemky&rows=5',
    ocekava: 'JSON', zmereno: false,
    proc: 'Rozhraní CKAN, na kterém stojí většina katalogů ve světě. Na data.gov.cz vrátilo'
      + ' 404 — tenhle katalog CKAN není; u jiných portálů se to musí změřit.' },
  { jmeno: 'CKAN seznam', skupina: 'katalog', cesta: '/api/3/action/package_list',
    ocekava: 'JSON', zmereno: false, proc: 'Druhá polovina téhož rozhraní: seznam datových sad.' },

  /* --- mapová a geografická rozhraní ----------------------------- */
  { jmeno: 'ArcGIS služby', skupina: 'mapa', cesta: '/arcgis/rest/services?f=json',
    ocekava: 'JSON', zmereno: false,
    proc: 'Města a úřady vedou pozemky v mapovém serveru Esri; tenhle výpis řekne, jaké vrstvy má.' },
  { jmeno: 'ArcGIS server', skupina: 'mapa', cesta: '/server/rest/services?f=json',
    ocekava: 'JSON', zmereno: false, proc: 'Totéž na druhém obvyklém umístění.' },
  { jmeno: 'WFS popis', skupina: 'mapa', cesta: '/geoserver/wfs?service=WFS&request=GetCapabilities',
    ocekava: 'XML', zmereno: false,
    proc: 'Otevřený mapový standard. Vrstva „pozemky k prodeji" bývá přesně tady.' },

  /* --- sklizeň metadat ------------------------------------------- */
  { jmeno: 'OAI-PMH', skupina: 'katalog', cesta: '/oai?verb=Identify',
    ocekava: 'XML', zmereno: false, proc: 'Protokol na sklízení metadat; u geoportálů se objevuje.' },

  /* --- feedy a sitemapy ------------------------------------------ */
  { jmeno: 'RSS', skupina: 'feed', cesta: '/rss', ocekava: 'XML', zmereno: true,
    proc: 'Změřeno sondou zdrojů: feed vede přímo na jednotlivé nabídky.' },
  { jmeno: 'RSS (xml)', skupina: 'feed', cesta: '/rss.xml', ocekava: 'XML', zmereno: false },
  { jmeno: 'Feed', skupina: 'feed', cesta: '/feed', ocekava: 'XML', zmereno: true },
  { jmeno: 'Atom', skupina: 'feed', cesta: '/atom.xml', ocekava: 'XML', zmereno: false },
  { jmeno: 'Sitemapa', skupina: 'sitemap', cesta: '/sitemap.xml', ocekava: 'XML', zmereno: true,
    proc: 'Změřeno sondou zdrojů: u aplikace, jejíž HTML je prázdná skořápka, je tohle'
      + ' jediná strojově čitelná cesta k adresám nabídek.' },
  { jmeno: 'Sitemapa (index)', skupina: 'sitemap', cesta: '/sitemap_index.xml', ocekava: 'XML', zmereno: true },
  { jmeno: 'Sitemapa (index2)', skupina: 'sitemap', cesta: '/sitemap-index.xml', ocekava: 'XML', zmereno: false },

  /* --- obvyklé stránky s nabídkami ------------------------------- */
  { jmeno: 'Otevřená data (stránka)', skupina: 'stranka', cesta: '/opendata', ocekava: 'HTML', zmereno: false },
  { jmeno: 'Otevřená data (česky)', skupina: 'stranka', cesta: '/otevrena-data', ocekava: 'HTML', zmereno: false },
  { jmeno: 'Nabídka majetku', skupina: 'stranka', cesta: '/nabidka-majetku', ocekava: 'HTML', zmereno: false },
  { jmeno: 'Nabídky', skupina: 'stranka', cesta: '/nabidky', ocekava: 'HTML', zmereno: true,
    proc: 'Tak to má Státní pozemkový úřad (spu.gov.cz/nabidky/…).' },
  { jmeno: 'Prodej majetku', skupina: 'stranka', cesta: '/prodej-majetku', ocekava: 'HTML', zmereno: false },
  { jmeno: 'Prodej nemovitostí', skupina: 'stranka', cesta: '/prodej-nemovitosti', ocekava: 'HTML', zmereno: false },
  { jmeno: 'Úřední deska', skupina: 'stranka', cesta: '/uredni-deska', ocekava: 'HTML', zmereno: false,
    proc: 'Obec musí záměr prodat pozemek vyvěsit na úřední desku; je to zákonná povinnost.' },

  /* --- obyčejná rozhraní aplikací -------------------------------- */
  { jmeno: 'API (koren)', skupina: 'api', cesta: '/api', ocekava: 'JSON', zmereno: false },
  { jmeno: 'API v1', skupina: 'api', cesta: '/api/v1', ocekava: 'JSON', zmereno: false },
  { jmeno: 'API v2', skupina: 'api', cesta: '/api/v2', ocekava: 'JSON', zmereno: false },
];

export const STROP_CEST = 40;

/** Kolik cest je změřených a kolik se jen zkouší — pro hlášení. */
export function pocetZmerenych(cesty = CESTY) {
  const z = cesty.filter((c) => c.zmereno).length;
  return { zmereno: z, zkousi: cesty.length - z };
}

/* ------------------------------------------------------------------
   ADRESY PRO JEDEN PORTÁL. Základ je ORIGIN vstupní adresy, ne celá
   adresa: kdyby se cesty lepily za `/nabidky/prehled`, vznikly by
   nesmysly jako `/nabidky/prehled/sitemap.xml`.
   Sitemapy z robots.txt se přidávají NAHORU: web sám říká, kde je,
   a to je lepší než náš odhad.
   ------------------------------------------------------------------ */
export function zakladPortalu(url) {
  try { return new URL(String(url)).origin; } catch { return ''; }
}

export function cestyProPortal(url, { sitemapy = [], cesty = CESTY, strop = STROP_CEST } = {}) {
  const zaklad = zakladPortalu(url);
  if (!zaklad) return [];
  const ven = [];
  const videno = new Set();
  const pridej = (adresa, jmeno, skupina, zmereno, proc) => {
    if (!adresa || videno.has(adresa) || ven.length >= strop) return;
    videno.add(adresa);
    ven.push({ adresa, jmeno, skupina, zmereno: zmereno === true, proc: proc || '' });
  };
  /* 1) Vstupní adresa sama. Je to to jediné, co o portálu víme od
        člověka, a nesmí se přeskočit kvůli tvarům z katalogu. */
  pridej(String(url), 'vstupní adresa', 'vstup', true, 'Adresa z registru nebo od člověka.');
  /* 2) Co web o sobě řekl v robots.txt. */
  for (const s of sitemapy) pridej(s, 'Sitemapa z robots.txt', 'sitemap', true,
    'Web sám v robots.txt napsal, kde sitemapu má — lepší než náš odhad.');
  /* 3) A teprve pak katalog tvarů. */
  for (const c of cesty) pridej(zaklad + c.cesta, c.jmeno, c.skupina, c.zmereno, c.proc);
  return ven;
}

/* ------------------------------------------------------------------
   JAKÝ TVAR ODPOVĚĎ MÁ. Nerozhoduje jméno souboru ani content-type
   sám: změřeno na vlastních zdrojích, že web si JSON pošle jako
   `text/plain` a RSS pojmenuje `feed`. Rozhoduje OBSAH, hlavička je
   jen druhé slovo.
   ------------------------------------------------------------------ */
export function tvarOdpovedi(contentType, telo) {
  const t = String(telo || '');
  const ct = String(contentType || '').toLowerCase();
  const zacatek = t.slice(0, 400).trim();
  if (!t.trim()) return 'PRÁZDNO';
  if (/^\s*[[{]/.test(zacatek)) {
    try { JSON.parse(t); return /ld\+json/.test(ct) || /"@context"/.test(zacatek) ? 'JSONLD' : 'JSON'; }
    catch { /* nedokončený JSON není JSON */ }
  }
  if (/^\s*<\?xml|^\s*<(rss|feed|urlset|sitemapindex|wfs:|ows:|oai)/i.test(zacatek)) {
    if (/<rss|<feed/i.test(zacatek)) return 'RSS';
    if (/<urlset|<sitemapindex/i.test(zacatek)) return 'SITEMAP';
    return 'XML';
  }
  if (/^\s*<(!doctype html|html)/i.test(zacatek)) return 'HTML';
  /* CSV se pozná tím, že první řádky mají stejný počet oddělovačů —
     ne příponou. */
  const radky = t.split(/\r?\n/).filter((r) => r.trim()).slice(0, 5);
  if (radky.length >= 2) {
    for (const odd of [';', ',', '\t']) {
      const pocty = radky.map((r) => r.split(odd).length);
      if (pocty[0] >= 3 && pocty.every((p) => p === pocty[0])) return 'CSV';
    }
  }
  if (/html|xml/.test(ct)) return ct.includes('xml') ? 'XML' : 'HTML';
  return 'TEXT';
}

export const TVARY_STROJOVE = new Set(['JSON', 'JSONLD', 'CSV', 'XML', 'RSS', 'SITEMAP']);

/* Slova, podle kterých se pozná, že odpověď je o POZEMKU, a zvlášť
   že je o PŘEVODU. Rozdíl je měřený (§372): „parcela" sama je
   v popisu dětských hřišť i cenových map. */
export const SLOVA_POZEMKU = /pozemk|pozemek|parcel|nemovit|katastr|výměr|vymer/i;
export const SLOVA_PREVODU = /prodej|prodáv|prodat|dražb|drazb|aukc|nabídk\S*\s+(?:majetku|nemovit|pozemk)|nepotřebn\S*\s+(?:majet|nemovit)|záměr\S*\s+(?:prodat|prodeje)/i;

/* ------------------------------------------------------------------
   VERDIKT O JEDNÉ CESTĚ. Nerozhoduje, jestli odpověděla — rozhoduje,
   jestli z ní jde něco přečíst. Tři stupně, a každý se jmenuje:
     'nabídky'  — opravdu se z ní přečetly nabídky (to je cíl),
     'slibná'   — strojový tvar a mluví o pozemcích i o převodu,
     'odpověděla' — něco vrátila, ale nabídky v tom nejsou,
     'zavřená'  — robots nedovoluje, HTTP chyba nebo prázdno.
   ------------------------------------------------------------------ */
/* Slova, kterými služba říká „jsi nepřihlášený" — ne hádání z kódu
   odpovědi, ale z toho, co sama napsala. */
export const CHCE_KLIC =
  /kl[íi][čc]|api[_\- ]?key|access[_\- ]?token|\btoken\b|nep[řr]ihl[áa][šs]|p[řr]ihl[áa][šs]|unauthor|unauthenticated|registra|sign[_\- ]?in|log[_\- ]?in/i;

/* ------------------------------------------------------------------
   CESTA, KTERÁ SLIBUJE STROJOVÝ TVAR (§444).

   §442 zarazil web, který na všechno vrací touž stránku na bajt
   shodnou. Hned další měření ukázalo, že to nestačí: na
   verejnedrazby.cz (běh 42056549281) dostaly verdikt „nabídky" tři
   cesty — `/`, `/atom.xml` a `/api` — a všechny tři vrátily HTML
   o velikosti 27 299 až 27 573 bajtů. Tedy táž domovská stránka,
   jen dynamická: bajty se liší o stovky, takže shoda na bajt minula
   a kontrolní 404 (22 426 bajtů) se jí netýkala.

   Odhadovat podobnost (procentní mez na velikost) by znamenalo
   riskovat TICHO: skutečný výpis podobné velikosti by se tím ztratil.
   Jde to ale rozhodnout bez hádání: `/atom.xml` jsme zkoušeli,
   protože jsme čekali Atom, a `/api`, protože jsme čekali rozhraní.
   Když odtamtud přijde HTML, ta věc, pro kterou jsme tam šli, TAM
   NENÍ — ať na té stránce stojí cokoli. Takové cestě se verdikt
   „nabídky" nedá; nabídky čteme z toho, co je opravdu výpis.

   Obyčejná cesta jako `/nabidky` nebo `/katalog` nic nepřislíbila,
   takže na ni tohle pravidlo nesahá a HTML je u ní poctivý nález. */
export function slibujeStrojovyTvar(adresa) {
  let cesta = String(adresa || '');
  try { const u = new URL(cesta); cesta = u.pathname + u.search; } catch { /* holá cesta */ }
  return /\.(?:xml|json|jsonld|csv|rss|atom)(?:$|[?#])/i.test(cesta)
    || /(?:^|\/)(?:api|rss|atom|oai|opendata|sparql)(?:$|[\/?#])/i.test(cesta)
    || /[?&]f=json|[?&]verb=/i.test(cesta);
}

/* ------------------------------------------------------------------
   „NABÍDKY" PŘES SIGNÁLY BEZ MÍSTA A KATEGORIE NENÍ NÁLEZ (§447).

   ZMĚŘENO 5. 11. na verejnedrazby.cz (běh 42070736435), když majitel
   řekl „zapojuj". Bot hlásil 6 až 9 nabídek na každé cestě, cesta
   čtení „signál". Ukázky (§446) to rozhodly:

     …prodej-vyrobne-skladovaciho-arealu-up-3-013-m → výměra 3 013
     …prodej-vyrobne-skladovaciho-arealu-up-3-013-m → výměra 2 666
     …prodej-provozni-budovy-obchod-servis-kancelar → 406 i 2 666
     …prodej-viceuceloveho-arealu…                 → 8 703 i 52 235

   Táž nabídka, různá čísla. Nejslabší cesta čtení bere čísla z textu
   stránky a páruje je s nejbližším odkazem — a na výpisu, kde je
   deset nabídek pohromadě, to spáruje špatně. `misto`, `okres`,
   `druh` ani `kat` nevyjdou vůbec.

   Taková nabídka se na web dát NESMÍ. Není to chybějící údaj, je to
   nepravda: cena jedné nemovitosti u výměry jiné, bez obce, takže ani
   na mapu, ani do okresu. §334 to u dražeb tušil („bez termínu"),
   tohle je ten případ doměřený do konce.

   Verdikt je proto „ke čtení": cesta je otevřená a obsah tam je, ale
   zapojit ji znamená napsat předpis pro čtení toho webu, ne přidat
   řádek do registru. */
export function nabidkyBezKotvy(cestaCteni, ukazka) {
  if (cestaCteni !== 'signál' || !ukazka) return false;
  return !ukazka.misto && !ukazka.okres && !ukazka.kat && !ukazka.druh;
}

export function verdiktCesty({ dovoleno, stav, typ, telo, nabidek = 0, adresa = '',
  cestaCteni = null, ukazka = null } = {}) {
  if (dovoleno === false) return { verdikt: 'zavřená', proc: 'robots.txt nedovoluje' };
  /* OTEVŘENO, ALE CHCE KLÍČ — TO NENÍ ZAVŘENO.
     Naměřeno 4. 11. na eDeskách: `/api/v1/documents` odpoví HTTP 401
     a v těle „Chyba: nepřihlášen. Použijte svůj API klíč, který
     najdete pro přihlášení na edesky.cz/uzivatel/edit". Bot to hlásil
     jako „zavřená", tedy stejně jako zakázaný robots nebo mrtvý host —
     a tím ten nález pohřbil mezi beznadějnými. Přitom je to ten
     nejslibnější druh: cesta je popsaná a otevřená, jen si majitel
     musí zařídit účet a klíč (účet mu zakládat nebudu a heslo po něm
     chtít nesmím — proto to patří JEMU na stůl, ne robotovi do práce).
     Pozná se to úzce: jen 401/403 A ZÁROVEŇ tělo, které o klíči,
     přihlášení nebo registraci opravdu mluví. Jiná čtyřstovka zůstává
     zavřená, aby se tím nedal obejít odmítnutý přístup. */
  if ((stav === 401 || stav === 403) && CHCE_KLIC.test(String(telo || ''))) {
    return { verdikt: 'chce klíč', stav,
      proc: 'HTTP ' + stav + ', a sama říká, že chce klíč nebo přihlášení: '
        + String(telo || '').replace(/\s+/g, ' ').trim().slice(0, 120) };
  }
  if (!stav || stav >= 400) return { verdikt: 'zavřená', proc: 'HTTP ' + (stav || '—') };
  const tvar = tvarOdpovedi(typ, telo);
  if (tvar === 'PRÁZDNO') return { verdikt: 'zavřená', proc: 'prázdná odpověď', tvar };
  const text = String(telo || '');
  const oPozemku = SLOVA_POZEMKU.test(text);
  const oPrevodu = SLOVA_PREVODU.test(text);
  const strojova = TVARY_STROJOVE.has(tvar);
  if (nabidek > 0) {
    /* §444: cesta, která slibovala strojový tvar, a vrátila HTML, není
       nález — to, pro co jsme tam šli, tam není. Nabídky na té stránce
       klidně jsou (bývá to domovská stránka, kterou server pošle na
       cokoli), ale číst je patří z toho, co je opravdu výpis. */
    /* §447: čteno jen signály a bez místa i kategorie — viz výš. */
    if (nabidkyBezKotvy(cestaCteni, ukazka)) {
      return { verdikt: 'ke čtení', nabidkyBezKotvy: true, tvar, strojova, oPozemku, oPrevodu,
        proc: `přečteno ${nabidek} nabídek, ale jen ze signálů v textu a BEZ místa,`
          + ' okresu, druhu i kategorie — čísla nemusí patřit k sobě a na mapu ani do'
          + ' okresu by se taková nabídka nedostala; patří sem předpis pro čtení,'
          + ' ne řádek do registru (§447)' };
    }
    if (!strojova && slibujeStrojovyTvar(adresa)) {
      return { verdikt: 'odpověděla', slibilaStroj: true, tvar, strojova, oPozemku, oPrevodu,
        proc: `cesta slibovala strojový tvar, přišlo ${tvar} —`
          + ` to, pro co se tam šlo, tam není (i když se z té stránky dá`
          + ` přečíst ${nabidek} nabídek, je to nejspíš domovská stránka)` };
    }
    return { verdikt: 'nabídky', proc: `přečteno ${nabidek} nabídek`, tvar, strojova, oPozemku, oPrevodu };
  }
  if (strojova && oPozemku && oPrevodu) {
    return { verdikt: 'slibná', proc: 'strojový tvar, mluví o pozemcích i o převodu', tvar, strojova, oPozemku, oPrevodu };
  }
  /* HTML, VE KTERÉM NABÍDKY OPRAVDU JSOU, NENÍ „ODPOVĚDĚLA" —
     ALE SLOVO O POZEMKU NESTAČÍ.
     ------------------------------------------------------------------
     Napsal jsem tenhle verdikt nejdřív jen na „není strojový tvar, ale
     mluví o pozemcích i o převodu" a bylo to špatně. Druhé měření
     (5. 11., běh 42027075306) to vyvrátilo: stránka Ministerstva
     obrany `/nemovity-majetek/aktualni-nabidka` má 23 631 bajtů
     značek, ale jen **1 264 znaků viditelného textu** — a je to
     navigace („Domů → Nemovitý majetek → Aktuální nabídka", menu
     Dražby / Odprodeje v realizaci / Archív prodejů). Ani jedna cena,
     ani jedna výměra, ani jedna parcela. Nabídky na té stránce
     NEJSOU; leží na podstránkách, které to menu jmenuje. „Ke čtení"
     tedy dostaly čtyři cesty včetně rozcestníku a kalendáře akcí —
     a kdo by podle toho psal předpis, psal by ho pro menu.

     Rozhodující není, že stránka to SLOVO má: menu ho má taky.
     Rozhodující je DŮKAZ NABÍDKY — aspoň jedna cena nebo výměra ve
     viditelném textu. To se počítá v copakTamJe() a je to táž mez,
     podle které robot dat soudí, jestli se ze stránky dá číst.
     Je to §372 ještě o stupeň dál: tam se rozlišilo „pozemek" od
     „převodu", tady „slovo o nabídce" od „nabídky". */
  const d = copakTamJe(telo);
  const maDukaz = (d.cen || 0) > 0 || (d.vymer || 0) > 0;
  if (!strojova && oPozemku && oPrevodu && maDukaz) {
    return { verdikt: 'ke čtení', tvar, strojova, oPozemku, oPrevodu,
      proc: 'není strojový tvar (' + tvar + '), ale mluví o pozemcích i o převodu'
        + ` a v textu je ${d.cen}× cena a ${d.vymer}× výměra`
        + ' — nabídky tu jsou, chybí předpis pro čtení' };
  }
  const chybi = [];
  if (!strojova) chybi.push('není strojový tvar (' + tvar + ')');
  if (!strojova && oPozemku && oPrevodu && !maDukaz) {
    chybi.push(`a žádný důkaz nabídky: 0 cen, 0 výměr v ${d.odkazu}`
      + ' odkazech — bude to rozcestník, ne výpis');
  }
  if (!oPozemku) chybi.push('o pozemcích ani slovo');
  else if (!oPrevodu) chybi.push('o pozemcích ano, o převodu ne');
  return { verdikt: 'odpověděla', proc: chybi.join(', '), tvar, strojova, oPozemku, oPrevodu };
}

/* „chce klíč" stojí hned za slibnou: přečíst se to dnes nedá, ale je to
   JEDINÁ položka v seznamu, se kterou může člověk něco udělat hned —
   a kdyby spadla na konec k zavřeným, nikdo si jí nevšimne. */
/* „ke čtení" stojí hned za slibnou a před „chce klíč": je to cesta,
   kde nabídky VIDITELNĚ JSOU, jen v HTML — a napsat k ní předpis je
   práce, která se dá udělat hned, bez cizího účtu a bez čekání na
   nikoho. Viz oddíl 429. */
export const PORADI_VERDIKTU = ['nabídky', 'slibná', 'ke čtení', 'chce klíč', 'odpověděla', 'zavřená'];

/* ------------------------------------------------------------------
   WEB, KTERÝ ODPOVÍDÁ NA VŠECHNO TOUŽ STRÁNKOU (§442).

   ZMĚŘENO naostro 5. 11. na drazbynaxos.cz (běh 42048959294):
   z 37 zkoušených cest vrátilo 19 stav 200 a přesně 101 947 bajtů —
   tedy jeden a týž soubor. Bot z toho udělal 21 nálezů „nabídky",
   mezi nimi `/rss`, `/oai?verb=Identify` i `/katalog.jsonld`. Žádná
   z nich nabídky nenese; nese je ta jediná domovská stránka, kterou
   server pošle na cokoli, co nezná.

   Pravidlo „stav 200 a v textu jsou slova o dražbách" je tedy samo
   o sobě k ničemu, dokud se neví, CO ten web dělá s adresou, která
   neexistuje. Proto se jedním dotazem zkusí vymyšlená cesta a výsledek
   se vezme jako měřítko:

     · vrátí-li kontrola 404 (nebo cokoli jiného než 200), web své
       neexistující cesty přiznává a nálezům se věří;
     · vrátí-li 200, je každá cesta téže velikosti JEN TA SAMÁ
       STRÁNKA — a verdikt „nabídky" by byl přelud.

   Měří se bajty, ne text: tělo se do nálezu nezapisuje (byly by
   z toho megabajty) a shoda na bajt je u statického souboru
   spolehlivější než podobnost textu.

   JEDEN DOTAZ NAVÍC NA PORTÁL. Je to cena za to, aby se nepsalo
   dvacet falešných nálezů — a „nic takového tu není" je slušný dotaz,
   ne obcházení ničeho. */
export const CESTA_KONTROLNI = '/__takova-cesta-tu-neni-9c3f';

export function prepisTazStranka(cesty, kontrola) {
  const c = Array.isArray(cesty) ? cesty : [];
  if (!kontrola || kontrola.stav !== 200 || !(kontrola.bajtu > 0)) return c.map((x) => ({ ...x }));
  return c.map((x) => {
    if (x.stav !== 200 || x.bajtu !== kontrola.bajtu) return { ...x };
    return {
      ...x,
      verdikt: 'odpověděla',
      jakoNeexistujici: true,
      proc: `táž stránka jako na vymyšlenou adresu (${kontrola.bajtu} bajtů) —`
        + ' tenhle web odpovídá na všechno stejně, takže ze stavu 200 se'
        + ' tady nesmí soudit nic',
    };
  });
}

/* Jak se ten verdikt řekne v rozpadu, aby věta zněla česky („nabídky 3,
   slibné 1, chtějí klíč 1, odpověděly 7, zavřené 28"). */
export const JMENA_ROZPADU = {
  'nabídky': 'nabídky',
  'slibná': 'slibné',
  'ke čtení': 'ke čtení',
  'chce klíč': 'chtějí klíč',
  'odpověděla': 'odpověděly',
  'zavřená': 'zavřené',
};

export function poradiCest(nalezy) {
  return [...(nalezy || [])].sort((a, b) => {
    const va = PORADI_VERDIKTU.indexOf(a.verdikt), vb = PORADI_VERDIKTU.indexOf(b.verdikt);
    if (va !== vb) return va - vb;
    if ((b.nabidek || 0) !== (a.nabidek || 0)) return (b.nabidek || 0) - (a.nabidek || 0);
    return String(a.adresa).localeCompare(String(b.adresa));
  });
}

/* ------------------------------------------------------------------
   SPOJOVÁNÍ PORTÁLŮ: z nálezu vyrobit DALŠÍ cesty.
   Vstupní adresa skoro nikdy není ta, kde nabídky jsou — katalog vede
   na datovou sadu, sada na soubor, sitemapa na výpis a výpis na
   inzerát. Tohle je ten krok dál; bot ho dělá do hloubky, která se
   dá spočítat, ne do nekonečna.
   ------------------------------------------------------------------ */
export const STROP_DALSICH = 8;

/* ------------------------------------------------------------------
   ADRESY, KTERÉ WEB SÁM DAL, ALE VEDOU JINAM — zůstat na svém hostu.
   ------------------------------------------------------------------
   Naměřeno 5. 11. na Ministerstvu obrany (běh 42016638323): jejich
   `sitemap.xml` nevypisuje adresy na onnm.mo.gov.cz, ale na
   `akis-d9.msw-cloud.com` — jejich cloud, kde se ten web staví. Bot
   tam poslušně zašel a **všech osm adres vrátilo HTTP 404**:

     http://akis-d9.msw-cloud.com/                              404
     http://akis-d9.msw-cloud.com/nemovity-majetek/archiv-prodeju/2025  404
     http://akis-d9.msw-cloud.com/media/fotogalerie             404   …

   Jsou to tedy dvě vady naráz. Osm z 43 dotazů padlo na CIZÍ web,
   který v registru nikdo nejmenoval — a to je proti pravidlu šetrnosti,
   ne jen plýtvání. A zároveň se tím zahodilo to nejcennější, co ta
   sitemapa nesla: CESTY. `/nemovity-majetek/archiv-prodeju/2025` na
   hostu, který se právě zkouší, je přesně ten výpis, který na stránce
   chyběl (§432).

   Pravidlo je proto: adresu, kterou web sám dal, ale která vede na
   JINOU DOMÉNU, přepiš na host, který se zkouší — vezmi z ní jen cestu.
   Je to stejně drahé (jeden dotaz) a nikdy to není horší: dnes z toho
   byla 404 na cizím webu, teď je to dotaz na vlastní cestu.

   PODDOMÉNA TÉŽE DOMÉNY SE NEPŘEPISUJE. Když výpis bydlí na
   `drazby.example.cz` a sitemapa je na `example.cz`, je to pořád týž
   web a adresa platí; přepsat ji by vyrobilo 404 z adresy, která
   fungovala.
   ------------------------------------------------------------------ */
export function naVlastniHost(adresa, zaklad) {
  let a, z;
  try { a = new URL(String(adresa)); } catch { return String(adresa || ''); }
  try { z = new URL(String(zaklad)); } catch { return a.href; }
  const ha = a.hostname.toLowerCase().replace(/^www\./, '');
  const hz = z.hostname.toLowerCase().replace(/^www\./, '');
  if (ha === hz) return a.href;
  /* Táž doména, jiná poddoména → nechat být. */
  if (ha.endsWith('.' + hz) || hz.endsWith('.' + ha)) return a.href;
  return z.origin + a.pathname + a.search;
}

export function dalsiCesty(nalez, { strop = STROP_DALSICH, zeSitemapy, zRss, vzor } = {}) {
  const ven = [];
  const pridej = (adresa, jmeno) => {
    if (!adresa || ven.length >= strop) return;
    if (ven.some((x) => x.adresa === adresa)) return;
    ven.push({ adresa: String(adresa), jmeno, skupina: 'spojená', zmereno: true,
      proc: 'Nalezeno v odpovědi předchozí cesty — portál se tím spojuje dál.' });
  };
  const tvar = nalez && nalez.tvar;
  const telo = String((nalez && nalez.telo) || '');
  if (!telo) return ven;
  if (tvar === 'JSON' || tvar === 'JSONLD') {
    let data = null;
    try { data = JSON.parse(telo); } catch { return ven; }
    /* OFN katalog: `datová_sada` je pole adres sad. Změřeno. */
    const sady = data && data['datová_sada'];
    if (Array.isArray(sady)) {
      for (const s of sady) pridej(typeof s === 'string' ? s : (s && s.iri), 'datová sada z katalogu');
    }
    /* OFN datová sada: `distribuce` nese soubor ke stažení. Změřeno. */
    const dist = data && data.distribuce;
    if (dist) {
      for (const d of (Array.isArray(dist) ? dist : [dist])) {
        if (!d) continue;
        pridej(typeof d === 'string' ? d : (d['soubor_ke_stažení'] || d['přístupové_url']), 'soubor datové sady');
      }
    }
    /* CKAN: result.results[].resources[].url. NEZMĚŘENO, tvar z normy. */
    const vysledky = data && data.result && (data.result.results || data.result);
    if (Array.isArray(vysledky)) {
      for (const v of vysledky) {
        for (const r of ((v && v.resources) || [])) pridej(r && r.url, 'soubor z CKAN');
      }
    }
    /* DCAT data.json: dataset[].distribution[].downloadURL. */
    const datasety = data && (data.dataset || data.datasets);
    if (Array.isArray(datasety)) {
      for (const d of datasety) {
        for (const r of ((d && (d.distribution || d.distributions)) || [])) {
          pridej(r && (r.downloadURL || r.accessURL), 'soubor z DCAT');
        }
      }
    }
    return ven;
  }
  if (tvar === 'SITEMAP' && typeof zeSitemapy === 'function') {
    for (const a of (zeSitemapy(telo, vzor) || [])) {
      const na = naVlastniHost(a, (nalez && nalez.adresa) || '');
      pridej(na, na === a ? 'adresa ze sitemapy' : 'cesta ze sitemapy na vlastním hostu');
    }
    return ven;
  }
  if (tvar === 'RSS' && typeof zRss === 'function') {
    /* TÝŽ DŮVOD JAKO U SITEMAPY: adresa z vlastního RSS, která vede na
       jinou domenu, je dotaz na cizí web, který v registru nikdo
       nejmenoval. U obrany byly adresy z RSS na správném hostu, takže
       to tam nic nezměnilo — ale pravidlo nemá platit jen tam, kde
       jsem ho náhodou potřeboval. */
    for (const z of (zRss(telo) || [])) {
      const u = z && z.url;
      if (!u) continue;
      const nu = naVlastniHost(u, (nalez && nalez.adresa) || '');
      pridej(nu, nu === u ? 'adresa z RSS' : 'cesta z RSS na vlastním hostu');
    }
    return ven;
  }
  return ven;
}

/* ------------------------------------------------------------------
   A KDYŽ SE NĚCO NAJDE: ŘÁDEK DO REGISTRU.
   Zapojení zdroje je podle §225 řádek v `OBECNE_ZDROJE`, ne nový
   stahovač. Bot ten řádek NAPÍŠE, ale NEZAPOJÍ — o cizím webu se
   rozhoduje po přečtení jeho podmínek, a to je práce pro člověka.
   ------------------------------------------------------------------ */
export function radekDoRegistru(nalez, { jmeno, typ = 'sale' } = {}) {
  if (!nalez || nalez.verdikt !== 'nabídky') return '';
  let host = '';
  try { host = new URL(String(nalez.adresa)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  const j = String(jmeno || host).replace(/'/g, '');
  return `  { jmeno: '${j}', host: '${host}', typ: '${typ}', adresaOverena: true,\n`
    + `    url: '${String(nalez.adresa).replace(/'/g, '')}',\n`
    + `    proc: 'Nalezeno zkoušením cest ${new Date().toISOString().slice(0, 10)}:`
    + ` cesta „${String(nalez.jmeno || '').replace(/'/g, '')}" vrátila ${nalez.nabidek} nabídek`
    + ` ve tvaru ${nalez.tvar}. Podmínky užití ještě nikdo nečetl.' },`;
}

/* ------------------------------------------------------------------
   CO NA TÉ CESTĚ VLASTNĚ JE. Bez tohohle končí nález u věty „HTML,
   23 631 bajtů" — a kdo má napsat předpis pro čtení, musí si stránku
   stáhnout znovu, což z vývojového stroje nejde vůbec. Měří se proto
   rovnou při zkoušení: titulek, kolikrát se na stránce objeví značky,
   ze kterých se pozná nabídka (cena, výměra, katastr, parcela,
   výběrové řízení), a začátek viditelného textu.
   NENÍ TO KOPIE STRÁNKY, JE TO MĚŘENÍ: text je ostříhaný na 400 znaků
   a počty jsou čísla. Tělo se před zpracováním krátí, aby se velká
   odpověď nepropočítávala celá.
   ------------------------------------------------------------------ */
/* CENY A VÝMĚRY SE NEPOČÍTAJÍ ZNOVU — bere je copakTamJe() z
   scripts/cteni-zdroje.mjs, tedy táž funkce, jakou si diagnostikuje
   robot dat. Napsal jsem to nejdřív po svém a hned se ukázalo proč to
   nedělat: můj výraz na ceny byl `/\bKč\b/`, což v JavaScriptu nenajde
   nic (hranice slova je jen mezi [A-Za-z0-9_] a zbytkem, takže mezi
   „č" a mezerou žádná není). copakTamJe to má od začátku správně —
   kotví na čísle, ne na slovu. Dvě kopie téhož počítání by se rozešly
   jako všechno zdvojené (§52, §70), a tahle by se rozešla hned.
   Zbývají tady proto jen značky, které copakTamJe nemá a pro rozhodnutí
   „stojí to za předpis?" jsou potřeba: katastr, parcela, výběrové
   řízení a dražba. */
export const ZNACKY_NABIDKY = [
  ['katastr', /katastr|\bk\.\s*[úu]\.|kat\.\s*[úu]zem/gi],
  ['parcela', /parcel/gi],
  ['výběrové řízení', /v[ýy]b[ěe]rov\S*\s+[řr][íi]zen/gi],
  ['dražba', /dra[žz]b/gi],
];
export const STROP_TELA_PRO_ZNAKY = 200000;
export const STROP_UKAZKY = 400;

export function znakyOdpovedi(telo) {
  const cele = String(telo || '').slice(0, STROP_TELA_PRO_ZNAKY);
  const titulek = (/<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(cele) || [])[1] || '';
  const text = cele
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const pocty = {};
  /* Z diagnostiky robota dat: ceny, výměry, odkazy, JSON-LD, mikrodata
     a dvě vlajky („vypadá na přihlášení", „vypadá na prázdno"). Právě
     ty dvě vlajky jsou pro rozhodnutí nejcennější: stránka za
     přihlášením nebo prázdný výpis nejsou materiál na předpis. */
  const d = copakTamJe(cele);
  if (d.cen) pocty['cena'] = d.cen;
  if (d.vymer) pocty['výměra'] = d.vymer;
  for (const [jmeno, re] of ZNACKY_NABIDKY) {
    const m = text.match(re);
    if (m && m.length) pocty[jmeno] = m.length;
  }
  return {
    titulek: titulek.replace(/\s+/g, ' ').trim().slice(0, 120),
    znaku: text.length,
    pocty,
    odkazu: d.odkazu,
    jsonLd: d.jsonLd,
    itemprop: d.itemprop,
    vypadaNaPrihlaseni: d.vypadaNaPrihlaseni,
    vypadaNaPrazdno: d.vypadaNaPrazdno,
    ukazka: text.slice(0, STROP_UKAZKY),
  };
}

/* ------------------------------------------------------------------
   CO Z NÁLEZU PATŘÍ ČLOVĚKU NA STŮL — a co je nové od minule.
   ------------------------------------------------------------------
   Bot běží každé pondělí, zapíše nález do data/cesty-portalu.json
   a tím to dosud skončilo. Nález z 5. 11. nesl tři cesty, se kterými
   se dalo něco udělat (dvě slibné a jednu ke čtení na Ministerstvu
   obrany) — a nedozvěděl se o nich nikdo, protože se o nich nikde
   neřeklo. Úloha skončila zeleně a zelená tečka v Actions znamená
   „nic k řešení".

   Je to táž díra, kterou u SELHÁNÍ zavřel scripts/ohlas-selhani.mjs:
   měřidlo bez hlášení je měřidlo pro nikoho. Rozdíl je jen v tom, že
   tady se hlásí ÚSPĚCH, který na někoho čeká.

   AKCESCHOPNÁ je cesta, u které existuje další krok:
     'nabídky'   → přečíst podmínky a zapojit zdroj,
     'slibná'    → dopsat čtení toho strojového tvaru,
     'ke čtení'  → napsat předpis pro HTML,
     'chce klíč' → zařídit účet a klíč (to umí jen majitel).
   'odpověděla' a 'zavřená' akceschopné nejsou: tam není co udělat.

   NOVÉ se počítá proti minulému nálezu podle trojice
   host + adresa + verdikt. Verdikt je v klíči schválně: když se
   z „odpověděla" stane „ke čtení" (přesně to se stalo obraně po
   §429), je to NOVÁ informace, i když adresa je stará.
   ------------------------------------------------------------------ */
export const VERDIKTY_AKCESCHOPNE = ['nabídky', 'slibná', 'ke čtení', 'chce klíč'];
export const CO_S_TIM = {
  'nabídky': 'přečíst podmínky užití a zapojit jako zdroj',
  'slibná': 'dopsat čtení toho strojového tvaru',
  'ke čtení': 'napsat předpis pro čtení HTML',
  'chce klíč': 'zařídit účet a klíč (jen majitel) a dát ho do GitHub Secrets',
};

export function klicCesty(host, cesta) {
  return [String(host || ''), String((cesta && cesta.adresa) || ''), String((cesta && cesta.verdikt) || '')].join('|');
}

export function akceschopneCesty(portaly) {
  const ven = [];
  for (const p of (Array.isArray(portaly) ? portaly : [])) {
    for (const c of (p && Array.isArray(p.cesty) ? p.cesty : [])) {
      if (!VERDIKTY_AKCESCHOPNE.includes(c && c.verdikt)) continue;
      ven.push({ host: p.host, jmeno: p.jmeno || p.host, adresa: c.adresa, cesta: c.jmeno,
        verdikt: c.verdikt, proc: c.proc, nabidek: c.nabidek || 0,
        coSTim: CO_S_TIM[c.verdikt] || '', znaky: c.znaky || null });
    }
  }
  return poradiCest(ven);
}

export function noveProtiMinule(stary, novy) {
  const bylo = new Set();
  for (const p of ((stary && stary.portaly) || [])) {
    for (const c of ((p && p.cesty) || [])) bylo.add(klicCesty(p.host, c));
  }
  return akceschopneCesty((novy && novy.portaly) || []).filter((c) => !bylo.has(klicCesty(c.host, c)));
}

export function hlaseniPortalu(portal) {
  const radky = [];
  const n = portal && portal.cesty ? portal.cesty : [];
  const podle = {};
  for (const c of n) podle[c.verdikt] = (podle[c.verdikt] || 0) + 1;
  /* VŠECHNY VERDIKTY, KTERÉ EXISTUJÍ — a v tomhle pořadí. Když jsem
     4. 11. přidal „chce klíč", souhrnný řádek ho nepočítal: hlášení by
     tvrdilo „zkoušeno 40 cest" a rozpad by jich jmenoval 39. Proto se
     tu nevypisuje ručně napsaný seznam, ale PORADI_VERDIKTU — přidat
     verdikt a zapomenout na hlášení už nejde. */
  const rozpad = PORADI_VERDIKTU.map((v) => `${JMENA_ROZPADU[v] || v} ${podle[v] || 0}`);
  radky.push(`${portal.host}: zkoušeno ${n.length} cest — ${rozpad.join(', ')}.`);
  for (const c of poradiCest(n)) {
    if (c.verdikt === 'zavřená' || c.verdikt === 'odpověděla') continue;
    radky.push(`  ${c.verdikt === 'nabídky' ? '★' : '·'} ${c.jmeno}: ${c.proc}`);
    radky.push(`      ${c.adresa}`);
    /* U cesty, ke které se píše předpis, je potřeba vidět, co na ní je. */
    if (c.znaky) {
      const p2 = Object.entries(c.znaky.pocty || {}).map(([k, v]) => `${k} ${v}×`).join(', ');
      radky.push(`      „${c.znaky.titulek}" — ${c.znaky.znaku} znaků textu${p2 ? ', ' + p2 : ''}`);
      /* DVĚ VLAJKY NAHLAS. Stránka za přihlášením ani prázdný výpis
         nejsou materiál na předpis — a kdo to neví dopředu, napíše
         předpis pro nic. */
      const vlajky = [];
      if (c.znaky.vypadaNaPrihlaseni) vlajky.push('POZOR: vypadá na přihlášení nebo ochranu');
      if (c.znaky.vypadaNaPrazdno) vlajky.push('POZOR: vypadá na prázdný výpis');
      if (vlajky.length) radky.push('      ' + vlajky.join('; '));
      if (c.znaky.ukazka) radky.push(`      ukázka: ${c.znaky.ukazka.slice(0, 160)}…`);
    }
  }
  return radky;
}
