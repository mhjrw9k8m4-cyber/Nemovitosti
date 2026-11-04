/* HLEDÁNÍ NOVÝCH ZDROJŮ — soustavně, ne po jednom
   ==================================================================
   Spuštění: node scripts/hledej-zdroje.mjs            (jen vypíše)
             node scripts/hledej-zdroje.mjs --zapis    (zapíše nález)
   V Actions: workflow „Hledání zdrojů".

   PROČ TOHLE VZNIKÁ. Dosud se zdroje hledaly tak, že jsem si na ně
   vzpomněl: ÚZSVM, SPÚ, Lesy ČR, centrální evidence. Takový seznam má
   dvě vady — končí u toho, co mě napadlo, a nikdo kromě mě ho neumí
   doplnit. Soustavné hledání se musí opírat o REJSTŘÍK, který vede
   někdo jiný a který roste sám.

   STUDNA: lokální katalogy otevřených dat. Obce, města a úřady je
   povinně registrují na data.gov.cz a každý z nich je strojově čitelný
   soubor na webu té obce. Zdroj pozemků, o kterém se nikde nedočtu,
   tam může být vedený jako datová sada „Prodej pozemků".

   CO SE ZMĚŘILO 4. 11. — a čtyři věci z pěti vyšly jinak, než jsem
   čekal. Píšu je sem všechny, ať to po mně nikdo nezkouší znovu:

     1. `/sparql` (strojové rozhraní katalogu): `Disallow: /sparql*`.
        Zakázané. Rozhodnutí toho webu, ne naše, a obcházet se nebude.
     2. `/zdroj/` (každý jednotlivý záznam katalogu, tedy i detail
        každého lokálního katalogu): `Disallow: /zdroj/`. Taky zakázané.
        Celý robots.txt data.gov.cz zakazuje právě a jen `/sparql*`,
        `/fct/`, `/describe/` a `/zdroj/` — zbytek webu dovoluje.
     3. `/api/3/action/package_search` (rozhraní CKAN, které má většina
        katalogů na světě): HTTP 404. Tenhle katalog CKAN není.
     4. `/datové-sady?dotaz=…` (stránka hledání): dovolená, ale seznam
        skládá až skript v prohlížeči — obyčejné stažení nenajde ani
        jeden odkaz na sadu. Kdybych čtečku napsal podle toho, co vidím
        na obrazovce, hlásila by „katalog nic nemá".
     5. `/lokální-katalogy` (seznam všech 66 registrovaných katalogů):
        DOVOLENÁ. Ve vykreslené stránce je u každého katalogu odkaz
        `…/lkod-validator?catalog=<adresa toho katalogu>` — tedy přesně
        ta adresa, kterou potřebujeme. V obyčejně stažené stránce
        `catalog=` ovšem není ANI JEDNOU.

   TAKŽE: hledání nestojí na vyhledávání v katalogu (to je zakázané
   nebo zavřené), ale na jediné dovolené stránce se seznamem. Z ní se
   vyberou VŠECHNY cizí adresy a každé se zvlášť položí otázka „jsi
   katalog otevřených dat?" — kdo odpoví podle normy, ten se prochází.
   Nehádá se, které z adres jsou katalogy; změří se to.

   CO TENHLE SOUBOR DĚLÁ A CO NE. Dělá čtyři věci: najde katalogy,
   přečte v nich datové sady, obodová je podle toho, jak slibně
   vypadají, a zahodí ty, které už máme. NEROZHODUJE, jestli se zdroj
   zapojí — to patří měření sondou (robots, výtěžnost) a potom člověku.
   ================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZAPOJENE, KANDIDATI } from './zdroje-kandidati.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CIL = join(KOREN, 'data', 'nalezene-zdroje.json');

/* Jediná dovolená stránka, na které jsou všechny katalogy pohromadě. */
export const SEZNAM_KATALOGU = 'https://data.gov.cz/lokální-katalogy';

/* ------------------------------------------------------------------
   HOSTITELÉ, KTEŘÍ NA TÉ STRÁNCE JSOU, ALE KATALOG TO NENÍ.
   Vyjmenované jsou z měření: tohle jsou opravdu ti, kdo se na stránce
   seznamu objevili (validátor, rejstřík úřadů, formuláře, normy,
   licence, číselníky EU, měřidlo návštěvnosti). Vyhazují se proto, aby
   se jich 60× zbytečně neptalo „jsi katalog?" — ne proto, že by na
   odpovědi nezáleželo.
   ------------------------------------------------------------------ */
export const HOSTE_MIMO = [
  'data.gov.cz',
  'datagov-cz.github.io',
  'rpp-opendata.egon.gov.cz',
  'ofn.gov.cz',
  'forms.cloud.microsoft',
  'oha01.dia.gov.cz',
  'matomo.nakit.cloud',
  'creativecommons.org',
  'publications.europa.eu',
  'data.europa.eu',
  'www.iana.org',
  'www.e-sbirka.cz',
  'linked.cuzk.cz',
  'www.w3.org',
  'schema.org',
  'github.com',
  'www.google.com',
  'fonts.googleapis.com',
];

export const STROP_ADRES = 300;
export const STROP_KATALOGU = 90;
export const STROP_SAD_NA_KATALOG = 40;

/* Hostitel bez „www." — podle něj se pozná, co už máme. */
export function hostZAdresy(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

/* ------------------------------------------------------------------
   ADRESY ZE STRÁNKY SEZNAMU. Schválně se nečtou jen `<a href>`:
   adresa katalogu na té stránce není odkaz, je to hodnota parametru
   `catalog=` v odkazu na validátor (změřeno 4. 11.). Proto se berou
   VŠECHNY absolutní adresy v textu stránky, včetně těch uvnitř
   parametrů, a cizí hostitelé se potom ptají sami za sebe.
   ------------------------------------------------------------------ */
export function adresyZeStranky(html, strop = STROP_ADRES) {
  const text = String(html || '');
  const nalez = new Map();
  /* Dvakrát: jednou adresy, jak stojí v textu, a jednou adresy uvnitř
     parametru `catalog=…`, kde jsou zakódované (%3A%2F%2F). */
  const kusy = [text];
  for (const m of text.matchAll(/catalog=([^"'&<>\s)]+)/gi)) {
    try { kusy.push(decodeURIComponent(m[1])); } catch { kusy.push(m[1]); }
  }
  for (const kus of kusy) {
    for (const m of kus.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      /* Konec adresy bývá přilepený k interpunkci nebo k uzavírací
         značce — uřízne se, ať se neptáme na adresu s tečkou na konci. */
      const cista = m[0].replace(/[.,;:]+$/, '').replace(/&(quot|amp|#\d+);.*$/i, '');
      const host = hostZAdresy(cista);
      if (!host) continue;
      if (HOSTE_MIMO.some((h) => host === h || host.endsWith('.' + h))) continue;
      if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|pdf|zip)$/i.test(cista)) continue;
      if (!nalez.has(cista)) nalez.set(cista, host);
      if (nalez.size >= strop) break;
    }
    if (nalez.size >= strop) break;
  }
  return [...nalez.keys()];
}

/* ------------------------------------------------------------------
   ČTENÍ KATALOGU JEDNÉ OBCE (nebo úřadu).
   Změřeno 4. 11. na katalogu Hradce Králové: je to JSON-LD podle
   české otevřené formální normy „rozhraní katalogů otevřených dat",
   `typ` je „Katalog" a má `název.cs`, `poskytovatel`,
   `domovská_stránka` a `datová_sada` jako POLE ADRES. Názvy sad
   v katalogu NEJSOU — jsou až v samotných sadách, takže na každou
   je jeden další dotaz.
   ------------------------------------------------------------------ */
export function textCs(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(textCs).filter(Boolean).join(' ');
  if (typeof v === 'object') return textCs(v.cs || v.CS || Object.values(v)[0] || '');
  return String(v);
}

/* Otázka „jsi katalog?" se neodpovídá z adresy, ale z odpovědi.
   `typ: "Katalog"` je podle normy; pole `datová_sada` je tu jako
   druhá cesta pro katalog, který `typ` neuvede. */
export function jeKatalog(data) {
  if (!data || typeof data !== 'object') return false;
  if (String(data.typ || '') === 'Katalog') return true;
  return Array.isArray(data['datová_sada']);
}

export function katalogZOdpovedi(data) {
  const sady = (data && Array.isArray(data['datová_sada'])) ? data['datová_sada'] : [];
  return {
    iri: String((data && data.iri) || ''),
    nazev: textCs(data && data['název']),
    domov: String((data && data['domovská_stránka']) || ''),
    sady: sady.map((x) => (typeof x === 'string' ? x : String((x && x.iri) || ''))).filter(Boolean),
  };
}

/* A JEDNA DATOVÁ SADA. Název a popis jsou víceřečové objekty; co
   zajímá, je český text a adresy, odkud se data berou. Změřeno
   4. 11. na sadě z téhož katalogu: `distribuce` je pole OBJEKTŮ
   s `přístupové_url` a `soubor_ke_stažení`, a obojí umí být prázdné. */
export function sadaZOdpovedi(data) {
  const distribuce = (data && data.distribuce) || [];
  const soubory = (Array.isArray(distribuce) ? distribuce : [distribuce])
    .map((d) => (typeof d === 'string' ? d
      : String((d && (d['soubor_ke_stažení'] || d['přístupové_url'] || d.iri)) || '')))
    .filter(Boolean);
  return {
    iri: String((data && data.iri) || ''),
    nazev: textCs(data && data['název']),
    popis: textCs(data && data['popis']),
    klicova: textCs(data && data['klíčové_slovo']),
    soubory,
  };
}

/* SLOVA, KTERÁ ZDROJ PŘIBLIŽUJÍ. Vážená, ne všechna stejně: „pozemek"
   je podstatné, „majetek" sám o sobě může být cokoli od zvířat po
   cenné papíry (změřeno 4. 11. na číselníku ÚZSVM, kde jsou vedle
   pozemků i movité věci a zvířata). */
export const SLOVA_PRO = [
  [/pozemk|pozemek|parcel/i, 5],
  [/dražb|drazb/i, 4],
  [/nabídk\w*\s+(?:majetku|nemovit)/i, 4],
  [/prodej/i, 3],
  [/nemovit/i, 3],
  [/katastr/i, 2],
  [/exekuc|insolven/i, 2],
  [/úřední\s+desk/i, 2],
];

/* SLOVA, KTERÁ ZDROJ VZDALUJÍ. „Pacht" a „nájem" jsou tu z měření,
   ne z úvahy: u ÚZSVM byly čtyři z pěti prvních pozemků PACHT a cena
   u nich je roční nájem (§367). Zdroj, který nabízí jen pachty, nám
   nabídky nepřinese. */
export const SLOVA_PROTI = [
  [/pacht|pronáj|nájem|najem/i, -4],
  [/movit[éá]|zvířat|cenné\s+papíry|software|virtuální\s+měn/i, -3],
  [/jízdní\s+řád|rozpočet|faktur|zakázk|dotac|platy|mzdy/i, -3],
  [/ovzduší|meteo|počasí|odpad|osvětlení|cyklostezk/i, -2],
];

export const MEZ_SKORE = 5;

export function skore(nazev, popis) {
  const text = String(nazev || '') + ' ' + String(popis || '');
  let b = 0;
  const duvody = [];
  for (const [re, kolik] of SLOVA_PRO) {
    const m = text.match(re);
    if (m) { b += kolik; duvody.push('+' + kolik + ' ' + m[0].toLowerCase()); }
  }
  for (const [re, kolik] of SLOVA_PROTI) {
    const m = text.match(re);
    if (m) { b += kolik; duvody.push(kolik + ' ' + m[0].toLowerCase()); }
  }
  return { skore: b, duvod: duvody.join(', ') };
}

export function uzMame(host, znameHosty) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h) return true;      // bez hostitele není co zapojit
  for (const z of (znameHosty || [])) {
    const zz = String(z || '').toLowerCase().replace(/^www\./, '');
    if (!zz) continue;
    if (h === zz || h.endsWith('.' + zz) || zz.endsWith('.' + h)) return true;
  }
  return false;
}

export function znameHosty() {
  return [...ZAPOJENE, ...KANDIDATI].map((z) => z.host).filter(Boolean);
}

/* ------------------------------------------------------------------
   ZE ZÁZNAMŮ NA KANDIDÁTY. Vstup je znormalizovaný na
   { nazev, popis, iri, adresa } — čtení konkrétního katalogu je výš,
   aby se tahle rozhodovací část dala měřit bez sítě.
   ------------------------------------------------------------------ */
export function kandidatiZeSad(sady, zname, mez = MEZ_SKORE) {
  const podleHosta = new Map();
  const zahozeno = { uzMame: 0, nizkeSkore: 0, bezAdresy: 0 };
  for (const s of (sady || [])) {
    if (!s) continue;
    /* Hostitel se bere z IRI sady (kdo ji vede), ne z adresy
       v katalogu — ta je vždycky data.gov.cz, a to bychom hledali
       sami sebe. */
    const host = hostZAdresy(s.iri) || hostZAdresy(s.url);
    if (!host) { zahozeno.bezAdresy++; continue; }
    if (uzMame(host, zname)) { zahozeno.uzMame++; continue; }
    const b = skore(s.nazev, [s.popis, s.klicova].filter(Boolean).join(' '));
    if (b.skore < mez) { zahozeno.nizkeSkore++; continue; }
    /* Jeden hostitel = jeden kandidát. Katalog vede datové sady a
       jeden úřad jich má klidně deset; zapojuje se ale zdroj, ne sada.
       Drží se ta nejslibnější a počítá se, kolik jich ten hostitel má
       — hostitel s pěti slibnými sadami je lepší vyhlídka než s jednou. */
    const stary = podleHosta.get(host);
    if (!stary) {
      podleHosta.set(host, {
        jmeno: String(s.nazev || host).slice(0, 120),
        host,
        iri: String(s.iri || ''),
        adresa: String(s.adresa || ''),
        skore: b.skore,
        duvod: b.duvod,
        sad: 1,
      });
    } else {
      stary.sad++;
      if (b.skore > stary.skore) {
        stary.skore = b.skore;
        stary.duvod = b.duvod;
        stary.jmeno = String(s.nazev || host).slice(0, 120);
        stary.iri = String(s.iri || '');
        stary.adresa = String(s.adresa || '');
      }
    }
  }
  const nalezeno = [...podleHosta.values()].sort((a, b2) => b2.skore - a.skore || b2.sad - a.sad);
  return { nalezeno, zahozeno };
}

/* Hlášení pro člověka. Číslo samo nerozhodne, tak se u každého
   kandidáta píše, čím si to skóre vysloužil. */
export function hlaseni(nalez) {
  const radky = [];
  const { nalezeno, zahozeno } = nalez;
  radky.push(`Nalezeno ${nalezeno.length} kandidátů`
    + ` (zahozeno: už máme ${zahozeno.uzMame}, slabé skóre ${zahozeno.nizkeSkore},`
    + ` bez adresy ${zahozeno.bezAdresy}).`);
  for (const k of nalezeno) {
    radky.push(`  ${String(k.skore).padStart(3)}  ${k.host}  (sad: ${k.sad})  ${k.jmeno}`);
    radky.push(`        ${k.adresa}`);
    radky.push(`        ${k.duvod}`);
  }
  return radky;
}

/* ------------------------------------------------------------------
   ŽIVÁ ČÁST. Nad sítí, proto se nezkouší ve zkouškách — zkouší se
   všechno výš, co rozhoduje.
   ------------------------------------------------------------------ */
const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
export const PAUZA_MEZI_DOTAZY = 300;

async function jsonZAdresy(url, { stahni, ua, smimeCist, mezipamet }) {
  const smime = await smimeCist(url, { stahni, ua, mezipamet });
  if (!smime.dovoleno) return { chyba: `robots.txt nedovoluje (${smime.duvod})` };
  const r = await stahni(url, { headers: { 'user-agent': ua, accept: 'application/ld+json, application/json' } });
  if (!r.ok) return { chyba: `HTTP ${r.status}` };
  const text = await r.text();
  try { return { data: JSON.parse(text) }; }
  catch { return { chyba: 'odpověď není JSON' }; }
}

async function main() {
  const zapsat = process.argv.includes('--zapis');
  const { stahni } = await import('./fetch-opportunities.mjs');
  const { smimeCist } = await import('./robots.mjs');
  const { BOT_UA } = await import('./bot-ua.mjs');
  const pomucky = { stahni, ua: BOT_UA, smimeCist, mezipamet: new Map() };
  const chyby = [];

  /* 1) SEZNAM KATALOGŮ. */
  let html = '';
  {
    const smime = await smimeCist(SEZNAM_KATALOGU, pomucky);
    if (!smime.dovoleno) {
      console.error(`Seznam katalogů nelze číst: robots.txt nedovoluje (${smime.duvod}).`);
      console.error('Tohle rozhodnutí patří tomu webu, ne nám. Hledání se tím zastavuje.');
      process.exit(0);
    }
    const r = await stahni(SEZNAM_KATALOGU, { headers: { 'user-agent': BOT_UA } });
    if (!r.ok) { console.error(`Seznam katalogů: HTTP ${r.status}.`); process.exit(1); }
    html = await r.text();
  }
  const adresy = adresyZeStranky(html).slice(0, STROP_KATALOGU);
  console.log(`Seznam katalogů: ${html.length} znaků, z toho ${adresy.length} cizích adres k dotázání.`);
  if (!adresy.length) {
    console.log('ŽÁDNÁ CIZÍ ADRESA. Stažená stránka adresy katalogů nenese —');
    console.log('skládá je až skript v prohlížeči. Dál se nedostaneme bez prohlížeče.');
    return;
  }

  /* 2) KTERÁ Z NICH JE KATALOG. Ptá se jich, neodhaduje se to. */
  const katalogy = [];
  for (const a of adresy) {
    let odp;
    try { odp = await jsonZAdresy(a, pomucky); }
    catch (e) { odp = { chyba: String((e && e.message) || e).slice(0, 80) }; }
    await pauza(PAUZA_MEZI_DOTAZY);
    if (odp.chyba) { chyby.push(`${a}: ${odp.chyba}`); continue; }
    if (!jeKatalog(odp.data)) continue;
    katalogy.push(katalogZOdpovedi(odp.data));
  }
  console.log(`Katalogů, které se přihlásily podle normy: ${katalogy.length}.`);

  /* 3) DATOVÉ SADY V NICH. */
  const vsechny = [];
  for (const k of katalogy) {
    const sady = k.sady.slice(0, STROP_SAD_NA_KATALOG);
    let precteno = 0;
    for (const iri of sady) {
      let odp;
      try { odp = await jsonZAdresy(iri, pomucky); }
      catch (e) { odp = { chyba: String((e && e.message) || e).slice(0, 80) }; }
      await pauza(PAUZA_MEZI_DOTAZY);
      if (odp.chyba) { chyby.push(`${iri}: ${odp.chyba}`); continue; }
      const s = sadaZOdpovedi(odp.data);
      precteno++;
      vsechny.push({ ...s, url: s.soubory[0] || '', adresa: k.domov || s.soubory[0] || k.iri });
    }
    console.log(`  ${k.nazev || k.iri}: ${precteno} z ${k.sady.length} sad přečteno`
      + (k.sady.length > sady.length ? ` (strop ${STROP_SAD_NA_KATALOG})` : ''));
  }

  for (const ch of chyby.slice(0, 30)) console.error('POZOR: ' + ch);
  if (chyby.length > 30) console.error(`POZOR: a dalších ${chyby.length - 30} adres.`);

  const nalez = kandidatiZeSad(vsechny, znameHosty());
  for (const r of hlaseni(nalez)) console.log(r);

  if (!zapsat) {
    console.log('\n(Nic se nezapsalo. S --zapis se nález uloží do data/nalezene-zdroje.json.)');
    return;
  }
  const dnes = new Date().toISOString().slice(0, 10);
  let stary = { dny: {} };
  try { stary = JSON.parse(readFileSync(CIL, 'utf8')); } catch { /* první běh */ }
  const ven = {
    updated: dnes,
    katalogu: katalogy.length,
    sad: vsechny.length,
    chyby: chyby.slice(0, 30),
    nalezeno: nalez.nalezeno,
    zahozeno: nalez.zahozeno,
    /* Historie jen jako počty: celý nález za každý den by soubor
       nafoukl a rozhodovat se dá i z čísla. */
    dny: Object.assign({}, stary.dny || {}, { [dnes]: nalez.nalezeno.length }),
  };
  writeFileSync(CIL, JSON.stringify(ven, null, 1));
  console.log(`\nZapsáno do ${CIL}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Hledání zdrojů spadlo:', e && e.message ? e.message : e); process.exit(1); });
}
