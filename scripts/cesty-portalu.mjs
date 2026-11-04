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

export function verdiktCesty({ dovoleno, stav, typ, telo, nabidek = 0 } = {}) {
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
    return { verdikt: 'nabídky', proc: `přečteno ${nabidek} nabídek`, tvar, strojova, oPozemku, oPrevodu };
  }
  if (strojova && oPozemku && oPrevodu) {
    return { verdikt: 'slibná', proc: 'strojový tvar, mluví o pozemcích i o převodu', tvar, strojova, oPozemku, oPrevodu };
  }
  const chybi = [];
  if (!strojova) chybi.push('není strojový tvar (' + tvar + ')');
  if (!oPozemku) chybi.push('o pozemcích ani slovo');
  else if (!oPrevodu) chybi.push('o pozemcích ano, o převodu ne');
  return { verdikt: 'odpověděla', proc: chybi.join(', '), tvar, strojova, oPozemku, oPrevodu };
}

/* „chce klíč" stojí hned za slibnou: přečíst se to dnes nedá, ale je to
   JEDINÁ položka v seznamu, se kterou může člověk něco udělat hned —
   a kdyby spadla na konec k zavřeným, nikdo si jí nevšimne. */
export const PORADI_VERDIKTU = ['nabídky', 'slibná', 'chce klíč', 'odpověděla', 'zavřená'];

/* Jak se ten verdikt řekne v rozpadu, aby věta zněla česky („nabídky 3,
   slibné 1, chtějí klíč 1, odpověděly 7, zavřené 28"). */
export const JMENA_ROZPADU = {
  'nabídky': 'nabídky',
  'slibná': 'slibné',
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
    for (const a of (zeSitemapy(telo, vzor) || [])) pridej(a, 'adresa ze sitemapy');
    return ven;
  }
  if (tvar === 'RSS' && typeof zRss === 'function') {
    for (const z of (zRss(telo) || [])) pridej(z && z.url, 'adresa z RSS');
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
  }
  return radky;
}
