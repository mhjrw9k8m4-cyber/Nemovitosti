/**
 * Co o automatickém přístupu říkají podmínky zdroje?
 * ====================================================================
 * PROČ TOHLE EXISTUJE. §339 změřil, že `api.bezrealitky.cz/robots.txt`
 * má `Disallow: /` — a z toho zdroje pochází 81 % obsahu webu.
 * Jenže robots.txt mluví o automatickém PROCHÁZENÍ, kdežto náš
 * stahovač posílá dotaz na GraphQL rozhraní. Jestli to jejich podmínky
 * dovolují, nebo zakazují, robots.txt neříká.
 *
 * Majitel rozhodl: nejdřív zjistit podmínky. Tenhle skript to udělá
 * MĚŘENÍM, ne mým odhadem: najde na webu odkazy na podmínky, stáhne je
 * a vypíše odstavce, které mluví o robotech, automatickém přístupu,
 * rozhraních a kopírování dat. Rozhodovat se pak dá podle toho, co ten
 * web napsal — ne podle mého přečtení.
 *
 * ČTENÍ PODMÍNEK SE SAMO ŘÍDÍ robots.txt. Je to obyčejné stahování
 * cizí stránky a žádnou výjimku nemá: když web čtení té cesty
 * zakazuje, nestahuje se a do nálezu se napíše, že to nešlo. Pak musí
 * ty podmínky otevřít člověk v prohlížeči — a je to tak správně.
 *
 * Spuštění: node scripts/sonda-podminky.mjs      (potřebuje síť)
 *           node scripts/sonda-podminky.mjs --jen-cile   (bez sítě)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { smimeCist, telo } from './robots.mjs';
import { tvorProhlizec, zahozene } from './cti-prohlizecem.mjs';
import { textZPdf } from './cti-pdf.mjs';
import { BOT_UA } from './bot-ua.mjs';

const OUT = new URL('../data/zdroje-podminky.json', import.meta.url);
const SONDA = new URL('../data/zdroje-sonda.json', import.meta.url);

export const PAUZA_MS = 2000;          // mezi dotazy, ať zdroj nezatěžujeme
export const CAS_LIMIT_MS = 20000;
export const STRANEK_NA_ZDROJ = 6;     // nejvýš šest stránek podmínek
/* Kolik textu musí stránka vydat, aby „nic o automatu" něco znamenalo.
   PROČ TO TU JE: první běh ohlásil u Bezrealitek „přečteno, ale nic
   o automatickém přístupu" — a to je věta, která může znamenat dvě
   úplně různé věci. Buď v jejich podmínkách o robotech nic není, nebo
   se nepřečetly: stránka vykreslená až v prohlížeči vrátí skoro
   prázdné HTML a obojí vypadá stejně. Bez tohohle prahu bych vydal
   druhý případ za první — a na tom se nedá nic rozhodnout. */
export const ZNAKU_NA_STRANKU = 2000;
/* A druhý, vyšší prah: kolik textu má mít ÚPLNÝ soubor podmínek.
   PROČ: druhý běh přečetl u Bezrealitek 2 137 znaků ve 13 odstavcích,
   tedy nad prahem výš — a v tom textu o robotech opravdu nic nestálo.
   Jenže 2 137 znaků NEJSOU smluvní podmínky. Skutečné podmínky mají
   desetitisíce znaků; dva tisíce vydá rozcestník, výtah nebo stránka,
   jejíž text se vykresluje až v prohlížeči. Vydat „v jejich podmínkách
   o robotech nic není" za nález z dvou tisíc znaků by bylo totéž co
   §337: tvrzení postavené na měření, které tvrzení neunese. */
export const ZNAKU_NA_PODMINKY = 8000;
export const ODSTAVCU_NA_STRANKU = 12;
export const DELKA_ODSTAVCE = 600;

const spi = (ms) => new Promise((r) => setTimeout(r, ms));

/* Slova, podle kterých se pozná ODKAZ na podmínky. Záměrně široká
   síť: každý web si to pojmenuje jinak (podmínky, obchodní podmínky,
   právní informace, terms). Hledá se v textu odkazu i v adrese. */
export const SLOVA_ODKAZ = /podm[íi]nk|pr[áa]vn[íi]|smluvn|terms|conditions|licen|u[žz]it[íi]|pravidla/i;

/* Slova, podle kterých se pozná ODSTAVEC o automatickém přístupu.
   Tohle je to, co nás zajímá — zbytek podmínek (platby, reklamace)
   do nálezu nepatří, jen by ho zahltil. */
export const SLOVA_ODSTAVEC = new RegExp([
  'robot', 'crawler', 'crawl', 'spider', 'scrap', 'bot\\b',
  'automat', 'strojov', 'skript',
  'API', 'rozhran[íi]', 'datov[ýy] v[ýy]stup',
  'indexov', 'kop[íi]rov', 'rozmno[žz]ov', 'extrahov', 'vyt[ěe][žz]ov',
  'd[ůu]l na data', 'data ?mining', 'databáz',
  'sta[žz]en[íi] obsahu', 'hromadn',
].join('|'), 'i');

/**
 * Odstraní značky a sloučí mezery.
 *
 * HRANICE ODSTAVCE SE BERE ZE ZNAČEK, NE ZE ZALOMENÍ VE ZDROJI.
 * Nejdřív jsem to napsal naopak — text se rozsekal na každém zalomení
 * ve zdroji — a zkouška to shodila: jeden bod podmínek, který je
 * v HTML rozlámaný na tři řádky, vyšel jako tři úryvky. V nálezu by
 * pak stály půlvěty a podle těch se rozhodnout nedá. Konce bloků
 * (`</p>`, `</li>`, `<br>`, nadpisy, `</div>`) se proto nejdřív
 * převedou na zalomení a zalomení VNITŘ bloku se slijí na mezeru.
 */
export function bezZnacek(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    /* POŘADÍ JE PODSTATNÉ. Zalomení ze ZDROJE se slijí na mezeru
       PRVNÍ — jinak by zůstala a dělila odstavec tam, kde v textu
       žádná hranice není. Teprve pak se hranicí stanou značky. */
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|td|tr|h[1-6]|section|article|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[^\S\n]+/g, ' ');
}

/** Rozdělí text na odstavce podle hranic z `bezZnacek` a slije
 *  zalomení uvnitř jednoho odstavce na mezeru. Krátké úryvky (nápisy
 *  tlačítek, položky menu) se za odstavec nepočítají. */
export function odstavce(text) {
  return String(text || '').split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 40);
}

/**
 * Text, který stránka nese ve VLOŽENÉM JSONU, ne ve značkách.
 *
 * PROČ TOHLE EXISTUJE. Druhý běh naostro přečetl u jednoho zdroje jen
 * 2 137 znaků — a to na smluvní podmínky nestačí. Příčina je, že dnešní
 * weby posílají obsah jako JSON ve `<script>` a do značek ho vykreslí
 * až prohlížeč. A `bezZnacek` `<script>` ZAHAZUJE, takže jsem vyhodil
 * přesně to místo, kde ten text nejspíš byl.
 *
 * Tohle tedy není obcházení ničeho: je to čtení TÉŽE stránky, kterou
 * nám web dovoluje číst, jen se text bere i odtamtud, kam ho web
 * uložil. Žádný prohlížeč se nepředstírá a robots.txt platí dál.
 *
 * Bere se jen to, co vypadá na věty: řetězce z JSONu kratší než 40
 * znaků jsou jména polí, adresy a klíče, ne text podmínek.
 */
export function textZeSkriptu(html) {
  const ven = [];
  for (const m of String(html || '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const telo = m[1];
    if (!telo || telo.length < 80) continue;
    if (!/[:{[]/.test(telo)) continue;                 // nevypadá na data
    /* Řetězce z JSONu. Nevyžaduje se platný JSON: stránky posílají
       i JavaScript, do kterého je JSON zapsaný. */
    /* STROP JE VYSOKO SCHVÁLNĚ. Napoprvé tu stálo 2 000 a zkouška to
       shodila: stránka, která celé podmínky posílá jako JEDEN dlouhý
       řetězec, nevyšla vůbec — výraz s krátkým stropem na ni nesedl
       a výsledek byl „málo textu", tedy tentýž slepý nález, kvůli
       kterému se to celé psalo. */
    for (const s of telo.matchAll(/"((?:[^"\\]|\\.){40,40000})"/g)) {
      let t = s[1];
      try { t = JSON.parse('"' + t + '"'); } catch { /* necháme jak je */ }
      /* DVĚ PRAVIDLA, NE TŘI. Nejdřív tu stál i zákaz na `^https?:`
         a `^/` — „adresa není text". Zkouška ukázala, že je MRTVÝ:
         adresa nemá mezeru, takže ji vyloučí už pravidlo pod ním,
         a sabotáž toho řádku nic neshodila. Mrtvé pravidlo v kódu
         tvrdí, že něco hlídá, a nehlídá nic (viz §51). */
      if (!/\s/.test(t)) continue;                      // bez mezery = klíč nebo adresa
      if (!/[.!?:;,]/.test(t)) continue;                // bez interpunkce to není věta
      ven.push(t);
      if (ven.length >= 400) return ven;
    }
  }
  return ven;
}

/** Absolutní adresa z případně relativního odkazu. */
export function absolutni(odkaz, base) {
  try { return new URL(String(odkaz), base).href; } catch { return null; }
}

/**
 * Odkazy, které vypadají na podmínky. Vrací nejvýš `STRANEK_NA_ZDROJ`
 * adres na TOMTÉŽ webu (cizí hostitel by nás odvedl jinam).
 */
/** Adresa bez koncového lomítka — na srovnávání „je to táž stránka". */
export function bezLomitka(u) { return String(u || '').split('#')[0].replace(/\/+$/, ''); }

export function odkazyNaPodminky(html, base) {
  let domaci = '';
  try { domaci = new URL(base).hostname.toLowerCase(); } catch { domaci = ''; }
  const ven = [];
  const videne = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const href = m[1];
    const popis = bezZnacek(m[2]).trim();
    if (!SLOVA_ODKAZ.test(href) && !SLOVA_ODKAZ.test(popis)) continue;
    const abs = absolutni(href, base);
    if (!abs || !/^https?:/.test(abs)) continue;
    let host = '';
    try { host = new URL(abs).hostname.toLowerCase(); } catch { continue; }
    if (domaci && host !== domaci) continue;      // jen tenhle web
    const klic = abs.split('#')[0];
    /* ODKAZ NA TUTÉŽ DOMOVSKOU STRÁNKU NENÍ ODKAZ NA PODMÍNKY.
       Naměřeno 3. 11. u ÚZSVM: ve vykresleném domovu se „našel"
       jediný odkaz — a vedl na domovskou stránku samu, s popisem
       „Dopravní prostředky a příslušenství 74". Sonda ji pak přečetla
       podruhé a vydala verdikt „přečteno, ale nic o automatickém
       přístupu", přitom žádné podmínky přečtené nebyly. Takový
       verdikt je horší než „nenašlo se": tvrdí, že se dívalo tam,
       kde se nedívalo. */
    if (klic === bezLomitka(base) || klic === bezLomitka(base) + '/') continue;
    if (videne.has(klic)) continue;
    videne.add(klic);
    ven.push({ url: klic, popis: popis.slice(0, 80) });
    if (ven.length >= STRANEK_NA_ZDROJ) break;
  }
  return ven;
}

/** Všechny odstavce stránky — ze značek I z vloženého JSONu. */
export function celyText(html) {
  const ze = odstavce(bezZnacek(html));
  /* TEXT ZE SKRIPTU TAKY PROCHÁZÍ ODSTRANĚNÍM ZNAČEK. Napoprvé tu
     stálo jen srovnání mezer — a protože JSON z moderních webů nese
     text VČETNĚ `<p>` a `</p>`, lezly ty značky do výseku, který se
     ukazuje člověku (naměřeno 3. 11. u Bezrealitek). A navíc se
     neštěpil na odstavce, takže se celý blok počítal jako jediný. */
  const zj = textZeSkriptu(html)
    .flatMap((t) => odstavce(bezZnacek(t)))
    .filter((t) => t.length >= 40);
  const videne = new Set();
  const ven = [];
  for (const t of [...ze, ...zj]) { if (videne.has(t)) continue; videne.add(t); ven.push(t); }
  return ven;
}

/**
 * Pasáže o automatickém přístupu. Vrací `{ slovo, text }`.
 *
 * VÝSEK SE BERE KOLEM NALEZENÉHO SLOVA, NE OD ZAČÁTKU ODSTAVCE.
 * Napoprvé tu stálo `o.slice(0, DELKA_ODSTAVCE)` — a první běh naostro
 * ukázal, proč je to špatně: do nálezu se zapsalo šest set znaků
 * úvodu a slovo, kvůli kterému se ta pasáž vybrala, zůstalo za
 * řezem. Kdo nález čte, neviděl důvod — a doklad, ze kterého není
 * poznat, co dokazuje, je k ničemu. Proto se výsek středí na shodu
 * a vedle textu stojí i to SLOVO, které sedlo.
 */
/* DRUHÉ SÍTO: PASÁŽ MUSÍ BÝT O PŘÍSTUPU, NE JEN OBSAHOVAT SLOVO.
 *
 * MĚŘENO 3. 11. na šesti webech: první verze našla 9 pasáží a
 * PRAVDIVÁ BYLA NULA. Co to bylo:
 *   · „automaticky" o odkazu na ověření e-mailu, o prodloužení dražby
 *     a o vygenerování protokolu (drazby.policenm.cz, verejnedrazby.cz),
 *   · „api" uvnitř adresy api.bezrealitky.cz v odstavci o pokutách,
 *   · „api" uvnitř JSONu z Next.js („data-api":"/_stats/…"),
 *   · „zapisovány" o logu příhozů.
 *
 * Verdikt „přečteno (5 pasáží o automatickém přístupu)" přitom míří
 * k ČLOVĚKU, který se podle něj rozhoduje. Mýlit se takhle je horší
 * než nenajít nic: majitel by si myslel, že podmínky o automatickém
 * přístupu mluví, a ony nemluví.
 *
 * Pasáž se proto počítá jen tehdy, když je v okně i slovo o ZÁKAZU
 * nebo o PŘÍSTUPU K OBSAHU. Zbytek se nezahazuje mlčky — zůstane jako
 * „zmínka", aby bylo vidět, že se něco našlo a proč se to nepočítá. */
export const SLOVA_KONTEXT = new RegExp([
  'zak[áa]z', 'nesm[íi]', 'nepovol', 'nen[íi] dovoleno', 'zapov',
  'bez (?:p[řr]edchoz[íi]ho )?(?:p[íi]semn[éeý]ho )?souhlasu',
  'vyt[ěe][žz]ov', 'scrap', 'crawl', 'robot', 'pav[ouk]{3}',
  'kop[íi]rov', 'rozmno[žz]ov', 'extrahov', 'systematick',
  'databáz', 'd[ůu]l na data', 'data ?mining',
  'automatizovan', 'strojov', 'hromadn[ěe]', 'hromadn[ýé]',
  'u[žz][íi]v[áa]n[íi] obsahu', 'obsah serveru',
].join('|'), 'i');
/* Okno, které není próza, ale kód nebo zbytek značek, se nepočítá
   vůbec: v JSONu z Next.js se „api" najde vždycky a neznamená nic. */
export function jeKod(text) {
  /* Jen JSON a jména tříd. Značky se neřeší tady, ale u zdroje —
     celyText je odstraňuje i z textu ze skriptu. Zahazovat okno kvůli
     `</p>` by znamenalo zahodit i opravdové podmínky, které jsou na
     moderních webech schované právě v tom JSONu. */
  return /\{"|":\[|className|data-api/.test(String(text || ''));
}

/* Kolik dokumentů se u jednoho zdroje přečte. Víc jich podmínky
   nemívají a každý je stažení megabajtů. */
export const DOKUMENTU_NA_ZDROJ = 3;
/* Pod touhle čitelností se text NEVYDÁVÁ za přečtený (viz cti-pdf.mjs):
   špatně dekódované PDF není prázdné, je to rozsypaný čaj, a síto na
   zákazy by ho propustilo jako „nic se nenašlo". */
export const PRAH_CITELNOSTI = 0.9;

export function oAutomatu(html) {
  const ven = [];
  for (const o of celyText(html)) {
    const m = SLOVA_ODSTAVEC.exec(o);
    if (!m) continue;
    /* Do nálezu jde CELÉ SLOVO z textu, ne jen ten úlomek, na který
       sedl vzorek: „automat" se čte hůř než „automatizovaně". */
    let a = m.index, b = m.index + m[0].length;
    while (a > 0 && /\p{L}/u.test(o[a - 1])) a--;
    while (b < o.length && /\p{L}/u.test(o[b])) b++;
    const slovo = o.slice(a, b);
    const pulka = Math.floor(DELKA_ODSTAVCE / 2);
    let od = Math.max(0, m.index - pulka);
    let do_ = Math.min(o.length, od + DELKA_ODSTAVCE);
    od = Math.max(0, do_ - DELKA_ODSTAVCE);
    const vysek = (od > 0 ? '…' : '') + o.slice(od, do_) + (do_ < o.length ? '…' : '');
    if (jeKod(vysek)) continue;
    ven.push({ slovo, text: vysek, kontext: SLOVA_KONTEXT.test(vysek) });
    if (ven.length >= ODSTAVCU_NA_STRANKU) break;
  }
  return ven;
}

/**
 * Jeden zdroj: domovská stránka → odkazy na podmínky → odstavce.
 * robots.txt se čte u KAŽDÉ adresy zvlášť, i u těch podstránek.
 */
export async function zmerPodminky(cil, { stahni, ua, mezipamet, vykresli } = {}) {
  /* `proc` se nese do nálezu: bez něj by v souboru nebylo vidět,
     jestli se u toho zdroje ptáme „smíme dál", nebo „smělo by se
     začít". */
  const zapis = { jmeno: cil.jmeno, host: cil.host, domov: cil.domov,
    proc: cil.proc || 'zákaz', kdy: new Date().toISOString().slice(0, 10), stranky: [] };
  const jmeno = ua || BOT_UA;
  const nactiPovolene = async (url) => {
    let r;
    try { r = await smimeCist(url, { stahni, ua: jmeno, mezipamet }); }
    catch (e) { return { chyba: 'robots.txt: ' + (e && e.message ? e.message : e) }; }
    if (!r.dovoleno) {
      return { zakaz: r.duvod || 'nedovoleno', nejdePrecist: r.nejdePrecist === true };
    }
    if (r.delay) await spi(Math.min(r.delay, 30) * 1000);
    try {
      const odp = await stahni(url, { casLimit: CAS_LIMIT_MS, pokusy: 1 });
      if (!odp.ok) return { chyba: 'HTTP ' + odp.status };
      return { html: await telo(odp) };
    } catch (e) { return { chyba: String(e && e.message ? e.message : e).slice(0, 160) }; }
  };

  const domov = await nactiPovolene(cil.domov);
  if (domov.zakaz) {
    zapis.verdikt = domov.nejdePrecist ? 'robots neznámý' : 'web nedovoluje číst ani domovskou stránku';
    zapis.duvod = domov.zakaz;
    return zapis;
  }
  if (domov.chyba) { zapis.verdikt = 'domovská stránka neodpověděla'; zapis.duvod = domov.chyba; return zapis; }

  let odkazy = odkazyNaPodminky(domov.html, cil.domov);
  /* I DOMOVSKÁ STRÁNKA SE MŮŽE SKLÁDAT AŽ V PROHLÍŽEČI. Naměřeno
     3. 11. u ÚZSVM: na `nabidkamajetku.gov.cz` nebyl „odkaz na
     podmínky se nenašel" pravdou o webu — na serverovém HTML prostě
     nejsou ŽÁDNÉ odkazy, protože je vykresluje skript. Vykreslování
     se do té chvíle pouštělo jen na nalezené stránky, takže hledání
     odkazů na takovém webu skončilo hned a nezjistilo nic.
     Pouští se to jen tam, kde se nenašel ani jeden odkaz — kde
     odkazy jsou, by to byl prohlížeč pro nic. */
  let domovVykreslen = null;
  if (vykresli && !odkazy.length) {
    try {
      const v = await vykresli(cil.domov);
      const znovu = odkazyNaPodminky(v.html || '', cil.domov);
      domovVykreslen = Object.assign({ odkazu: znovu.length }, zahozene(v));
      if (znovu.length) odkazy = znovu;
      else domovVykreslen.nepomohlo = true;
    } catch (e) {
      domovVykreslen = { chyba: String(e && e.message ? e.message : e).slice(0, 120) };
    }
  }
  if (domovVykreslen) zapis.domovVykreslen = domovVykreslen;
  zapis.nalezeneOdkazy = odkazy;
  if (!odkazy.length) {
    zapis.verdikt = 'odkaz na podmínky se na domovské stránce nenašel';
    return zapis;
  }
  const videne = new Set(odkazy.map((o) => o.url));
  const fronta = odkazy.slice();
  while (fronta.length) {
    const o = fronta.shift();
    await spi(PAUZA_MS);
    const s = await nactiPovolene(o.url);
    if (s.zakaz) { zapis.stranky.push({ url: o.url, popis: o.popis, stav: 'nesmíme číst', duvod: s.zakaz }); continue; }
    if (s.chyba) { zapis.stranky.push({ url: o.url, popis: o.popis, stav: 'neodpověděla', duvod: s.chyba }); continue; }
    /* STRÁNKA, KTERÁ SE SKLÁDÁ AŽ V PROHLÍŽEČI, SE PŘEČTE PROHLÍŽEČEM.
       Měřeno 3. 11.: podmínky Bezrealitek i elektronickedrazby.cz
       skončily na „málo textu — vykresluje se až v prohlížeči". Text
       tam přitom JE, jen ho skládá skript; odpověď pro člověka tedy
       nestála na zdroji, ale na tom, čím ho čteme. Zkouší se to JEN
       u stránek, kde obyčejné čtení nic nedalo (jinak by to byl
       zbytečný prohlížeč u každé adresy) a jen když se prohlížeč
       předal — robots.txt platí dál, a v cti-prohlizecem.mjs i pro
       každý podřízený soubor. */
    let html = s.html;
    let vykresleno = null;
    if (vykresli && celyText(html).join('').replace(/\s/g, '').length < ZNAKU_NA_STRANKU) {
      try {
        const v = await vykresli(o.url);
        const bylo = celyText(html).join('').replace(/\s/g, '').length;
        const je = celyText(v.html || '').join('').replace(/\s/g, '').length;
        /* Vezme se to jen tehdy, když je to OPRAVDU VÍC. Jinak by se
           do nálezu zapsalo „čteno prohlížečem" i tam, kde to nic
           nepřineslo, a vypadalo by to jako víc práce, než se udělalo. */
        /* I když prohlížeč nepomohl, zapíše se, CO se zahodilo:
           jméno cizího hostu nebo zakázaná cesta je odpověď na to,
           proč se text nenašel. */
        if (je > bylo) { html = v.html; vykresleno = Object.assign({ bylo, je }, zahozene(v)); }
        else { vykresleno = Object.assign({ bylo, je, nepomohlo: true }, zahozene(v)); }
      } catch (e) { vykresleno = { chyba: String(e && e.message ? e.message : e).slice(0, 120) }; }
    }
    const pasaze = oAutomatu(html);
    /* DOKLAD MĚŘÍ TOTÉŽ, CO SE PROHLEDÁVÁ. Kdyby se počítal jen text
       ze značek, zůstal by nález stejně slepý jako předtím: stránka
       s obsahem v JSONu by vyšla jako „málo textu", i když se text
       našel. */
    const vsechny = celyText(html);
    const text = vsechny.join('\n');
    /* DOKLAD, ŽE SE OPRAVDU NĚCO PŘEČETLO. Bez něj by „nic o automatu"
       znamenalo zároveň „v podmínkách o tom nic není" i „stránka nám
       nic nedala" — a to jsou dvě různé odpovědi. */
    const malo = text.replace(/\s/g, '').length < ZNAKU_NA_STRANKU;
    zapis.stranky.push({
      url: o.url, popis: o.popis,
      stav: pasaze.length ? 'přečteno'
        : (malo ? 'málo textu — nedá se z toho soudit' : 'přečteno, nic o automatu'),
      znaku: text.replace(/\s/g, '').length,
      odstavcuCelkem: vsechny.length,
      /* POČÍTÁ SE JEN PASÁŽ S KONTEXTEM. Zmínky (slovo bez zákazu
         a bez přístupu k obsahu) se vedou zvlášť — ať je vidět, že
         se našly, a ať nenafukují verdikt. */
      odstavcu: pasaze.filter((x) => x.kontext).length,
      pasaze: pasaze.filter((x) => x.kontext),
      zminky: pasaze.filter((x) => !x.kontext).length,
      zminkyUkazka: pasaze.filter((x) => !x.kontext).slice(0, 2),
      /* Odkazy na dokumenty (PDF, DOC). Sbírají se tady a čtou se níž,
         každý se svým robots.txt. */
      cteno: vykresleno && !vykresleno.chyba && !vykresleno.nepomohlo
        ? 'prohlížečem' : 'ze serveru',
      vykresleno: vykresleno || undefined,
      dokumenty: [...String(html || '').matchAll(/href\s*=\s*["']([^"']+\.(?:pdf|docx?|odt))["']/gi)]
        .map((m) => absolutni(m[1], o.url)).filter(Boolean).slice(0, 5),
    });
    /* JEDEN SKOK DÁL. Podmínky bývají rozdělené („smluvní podmínky",
       „podmínky užití", „zásady ochrany údajů") a z domovské stránky
       vede odkaz jen na jedny. Z té stránky se proto posbírají další
       odkazy téhož druhu — ale jen jeden skok a do stropu, aby se
       nestahoval půl webu. */
    for (const dalsi of odkazyNaPodminky(html, o.url)) {
      if (zapis.stranky.length + fronta.length >= STRANEK_NA_ZDROJ) break;
      if (videne.has(dalsi.url)) continue;
      videne.add(dalsi.url);
      fronta.push(dalsi);
    }
  }
  /* DOKUMENTY SE TEĎ OPRAVDU ČTOU. Dřív tu byl jen odkaz a věta
     „text je nejspíš v odkazovaném dokumentu" — což není odpověď na
     majitelovu otázku, je to domácí úkol pro člověka. Naměřeno 3. 11.:
     takhle skončily Bezrealitky (5 PDF), elektronickedrazby.cz
     (dražební řád) a verejnedrazby.cz (3 PDF).

     ROBOTS.TXT PLATÍ NA KAŽDÝ DOKUMENT ZVLÁŠŤ. U Bezrealitek je to
     rozhodující: jejich PDF bydlí na `api.bezrealitky.cz`, a ten má
     `Disallow: /` — tam se nesmí ani sáhnout, ať je text jakkoli
     potřebný. Zákaz se zapíše jako nález, ne jako selhání.

     A ČITELNOST SE MĚŘÍ. Čtečka je vlastní (žádná nová závislost) a
     naskenovaný papír ani exotické kódování nepřečte; pak se to musí
     přiznat, ne vydávat mojibake za „nic o automatu se nenašlo". */
  const kDokumentum = [];
  for (const st of zapis.stranky) {
    for (const d of (st.dokumenty || [])) {
      if (!kDokumentum.includes(d)) kDokumentum.push(d);
    }
  }
  for (const url of kDokumentum.slice(0, DOKUMENTU_NA_ZDROJ)) {
    await spi(PAUZA_MS);
    /* Popis je jméno souboru: v diagnostice je „Dražební řád.pdf"
       k něčemu, „Dokument" k ničemu. */
    let jmenoSouboru = 'Dokument';
    try { jmenoSouboru = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'Dokument'; }
    catch { /* nehezká adresa — zůstane obecný popis */ }
    const zaznam = { url, popis: jmenoSouboru.slice(0, 80), jeDokument: true };
    let r = null;
    try { r = await smimeCist(url, { stahni, ua: jmeno, mezipamet }); }
    catch (e) { r = { dovoleno: false, duvod: 'robots.txt: ' + (e && e.message ? e.message : e) }; }
    if (!r.dovoleno) {
      zaznam.stav = 'nesmíme číst';
      zaznam.duvod = String(r.duvod || 'nedovoleno').slice(0, 160);
      zapis.stranky.push(zaznam);
      continue;
    }
    if (r.delay) await spi(Math.min(r.delay, 30) * 1000);
    try {
      const odp = await stahni(url, { casLimit: CAS_LIMIT_MS, pokusy: 1 });
      if (!odp.ok) {
        zaznam.stav = 'neodpověděl'; zaznam.duvod = 'HTTP ' + odp.status;
        zapis.stranky.push(zaznam); continue;
      }
      const bajty = Buffer.from(await odp.arrayBuffer());
      const v = textZPdf(bajty);
      zaznam.znaku = v.text.replace(/\s/g, '').length;
      zaznam.citelnost = Math.round((v.citelnost || 0) * 100) / 100;
      zaznam.cteno = 'z dokumentu';
      /* Kterou cestou se dekódovalo, je v nálezu: u dokumentu, kde
         párování tabulek nefunguje, se bere hrubší náhrada (§357d)
         — a nesmí to být vidět až v číslech. */
      if (v.volba) zaznam.jak = v.volba;
      if (v.duvod || !v.text) {
        zaznam.stav = 'nepřečetli jsme ho';
        zaznam.duvod = v.duvod || 'v dokumentu není text (nejspíš je to sken)';
        zapis.stranky.push(zaznam); continue;
      }
      if (v.citelnost < PRAH_CITELNOSTI) {
        zaznam.stav = 'nepřečetli jsme ho';
        zaznam.duvod = `text vyšel nečitelně (čitelnost ${zaznam.citelnost})`
          + ' — kódování, které tahle čtečka neumí';
        zapis.stranky.push(zaznam); continue;
      }
      const pasaze = oAutomatu(v.text);
      const vsechny = celyText(v.text);
      const malo = zaznam.znaku < ZNAKU_NA_STRANKU;
      zaznam.stav = pasaze.length ? 'přečteno'
        : (malo ? 'málo textu — nedá se z toho soudit' : 'přečteno, nic o automatu');
      zaznam.odstavcuCelkem = vsechny.length;
      zaznam.odstavcu = pasaze.filter((x) => x.kontext).length;
      zaznam.pasaze = pasaze.filter((x) => x.kontext);
      zaznam.zminky = pasaze.filter((x) => !x.kontext).length;
      zaznam.zminkyUkazka = pasaze.filter((x) => !x.kontext).slice(0, 2);
      zapis.stranky.push(zaznam);
    } catch (e) {
      zaznam.stav = 'neodpověděl';
      zaznam.duvod = String(e && e.message ? e.message : e).slice(0, 160);
      zapis.stranky.push(zaznam);
    }
  }

  const precteno = zapis.stranky.filter((s) => /přečteno/.test(s.stav)).length;
  const malo = zapis.stranky.filter((s) => /málo textu/.test(s.stav)).length;
  const pasazi = zapis.stranky.reduce((n, s) => n + (s.odstavcu || 0), 0);
  zapis.znakuCelkem = zapis.stranky.reduce((n, s) => n + (s.znaku || 0), 0);
  zapis.verdikt = pasazi
    ? `přečteno (${pasazi} pasáží o automatickém přístupu)`
    : (precteno
      ? (zapis.znakuCelkem >= ZNAKU_NA_PODMINKY
        ? 'přečteno, ale nic o automatickém přístupu'
        : `přečteno jen ${zapis.znakuCelkem} znaků — na úplné podmínky je to málo,`
          + ' z toho se soudit nedá (text se nejspíš vykresluje až v prohlížeči'
          + ' nebo je v odkazovaném dokumentu)')
      : (malo ? 'málo textu — stránka se vykresluje až v prohlížeči, takhle se to nezjistí'
        : 'žádnou stránku podmínek se nepodařilo přečíst'));
  /* Soupis dokumentů zůstává v nálezu i po jejich přečtení: majitel
     se na ně může chtít podívat sám, a u zakázaných je to jediné, co
     o nich můžeme říct. */
  const dokumenty = [];
  for (const st of zapis.stranky) {
    for (const d of (st.dokumenty || [])) if (!dokumenty.includes(d)) dokumenty.push(d);
  }
  if (dokumenty.length) zapis.dokumenty = dokumenty.slice(0, 10);
  return zapis;
}

/**
 * Cíle: zapojené zdroje, u kterých sonda naměřila ZÁKAZ. Právě u nich
 * je otázka „a co říkají podmínky" na stole; u ostatních ne.
 * Domovská adresa se bere z hostitele, ne z té zakázané cesty:
 * podmínky nejsou v API, ale na webu.
 */
/* DVĚ TŘÍDY CÍLŮ, a obě chtěl majitel („jen zjistit podmínky"):
 *
 *   1) ZÁKAZ — zdroj, který už vozíme a jehož robots.txt nás na té
 *      adrese zakazuje. Tam je otázka „smíme to vůbec dál číst".
 *   2) SLIBNÝ KANDIDÁT — zdroj, který NEVOZÍME, jeho robots.txt
 *      dovoluje a sonda u něj naměřila slibný obsah. Tam je otázka
 *      „smělo by se to začít čist", a odpovědět na ni musí člověk
 *      PŘED přidáním, ne po něm.
 *
 * Čtení podmínek je u obou totéž, takže nemá cenu dvojí sonda. Co se
 * liší, je `proc` — ať je v nálezu vidět, proč se tam kouká. NE `duvod`:
 * to jméno je v tomhle souboru obsazené DŮVODEM VERDIKTU (proč se
 * podmínky nepřečetly), takže by se třída cíle v nálezu přepsala. */
/* „www." se přidává JEN hostu bez podřízené části. U
 * drazby.policenm.cz by z toho bylo www.drazby.policenm.cz, což
 * neexistuje — a sonda by hlásila „podmínky se nenašly" tam, kde se
 * jen nedívala na správnou adresu. */
export function domovZHostu(host) {
  const h = String(host || '').replace(/^api\./, '');
  if (!h) return '';
  return `https://${h.split('.').length > 2 ? h : 'www.' + h}/`;
}

export function cilePodminek(nalez) {
  const ven = [];
  for (const z of ((nalez && nalez.zdroje) || [])) {
    const host = String(z.host || '').replace(/^api\./, '');
    if (!host) continue;
    if (z.stav === 'zapojeno' && z.robots === 'nedovoluje') {
      ven.push({ jmeno: z.jmeno, host, domov: domovZHostu(host),
        proc: 'zákaz', zakaz: z.robotsDuvod });
    } else if (z.stav !== 'zapojeno' && z.robots === 'dovoluje' && z.slibuje === 'slibné') {
      /* PODMÍNKY SE ČTOU TAM, KDE OBSAH OPRAVDU JE. Naměřeno 3. 11.
         u ÚZSVM: v registru stojí `nabidkamajetku.cz`, ale nabídky
         jsou na `nabidkamajetku.gov.cz` (§355). Čist podmínky na
         skořápce by znamenalo ptát se na práva k webu, ze kterého
         nebudeme brát nic. */
      const s = z.sousedniDomena;
      const kde = (s && s.je && !s.nepomohlo && !s.zakazano && s.url)
        ? String(new URL(s.url).hostname).replace(/^www\./, '')
        : host;
      ven.push({ jmeno: z.jmeno, host: kde, domov: domovZHostu(kde),
        proc: 'slibný kandidát' });
    }
  }
  return ven;
}

async function main() {
  let nalez = null;
  try { nalez = JSON.parse(readFileSync(SONDA, 'utf8')); } catch { nalez = null; }
  if (!nalez || !nalez.updated) {
    console.error('CHYBA: nález sondy zdrojů chybí nebo nebyl změřen.'
      + ' Podmínky se čtou u zdrojů, u kterých sonda naměřila zákaz, a u'
      + ' slibných kandidátů — bez měření se neví u kterých.'
      + ' Spusťte „Sonda zdrojů".');
    process.exit(1);
  }
  const cile = cilePodminek(nalez);
  const sZakazem = cile.filter((c) => c.proc === 'zákaz');
  const kandidati = cile.filter((c) => c.proc === 'slibný kandidát');
  console.log(`Cílů: ${cile.length} — se zákazem ${sZakazem.length}`
    + `${sZakazem.length ? ' (' + sZakazem.map((c) => c.jmeno).join(', ') + ')' : ''},`
    + ` slibných kandidátů ${kandidati.length}`
    + `${kandidati.length ? ' (' + kandidati.map((c) => c.jmeno).join(', ') + ')' : ''}.`);
  if (process.argv.includes('--jen-cile')) {
    writeFileSync(OUT, JSON.stringify({ updated: null, zdroje: cile.map((c) => ({ ...c, verdikt: 'neměřeno' })) }) + '\n', 'utf8');
    console.log('Zapsán jen seznam cílů (verdikt „neměřeno").');
    return;
  }
  if (!cile.length) {
    writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), zdroje: [] }) + '\n', 'utf8');
    console.log('Žádný zdroj nás nezakazuje a žádný slibný kandidát nečeká — není co zjišťovat.');
    return;
  }
  const { stahni } = await import('./fetch-opportunities.mjs');
  const mezipamet = new Map();
  const ven = [];
  /* PROHLÍŽEČ SE VYTVOŘÍ LÍNĚ — a jen jeden pro celý běh. Většina
     stránek text dá sama, takže spustit Chromium pro každou adresu by
     byla čistá ztráta. A kdyby prohlížeč v prostředí nebyl, nesmí to
     sondu shodit: zapíše se to u té stránky jako důvod. */
  let prohlizec = null, prohlizecPadl = null;
  const smiCist = async (url) => {
    try { const r = await smimeCist(url, { stahni, ua: BOT_UA, mezipamet }); return !!r.dovoleno; }
    catch (e) { return false; }
  };
  const vykresli = async (url) => {
    if (prohlizecPadl) throw prohlizecPadl;
    if (!prohlizec) {
      try {
        const { chromium } = await import('playwright-core');
        prohlizec = await tvorProhlizec({ chromium, smiCist, ua: BOT_UA, casLimit: CAS_LIMIT_MS });
        console.log('  (spuštěn prohlížeč — některá stránka nedala text sama)');
      } catch (e) {
        prohlizecPadl = new Error('prohlížeč nejde spustit: ' + String(e && e.message ? e.message : e).slice(0, 100));
        throw prohlizecPadl;
      }
    }
    return prohlizec.vykresli(url);
  };
  try {
    for (const c of cile) {
      const z = await zmerPodminky(c, { stahni, ua: BOT_UA, mezipamet, vykresli });
      ven.push(z);
      console.log(`  ${c.jmeno}: ${z.verdikt}`);
      for (const s of (z.stranky || [])) {
        console.log(`     ${s.stav.padEnd(26)} ${s.cteno === 'prohlížečem' ? '[prohlížeč] ' : ''}${s.url}`);
      }
      await spi(PAUZA_MS);
    }
  } finally {
    if (prohlizec) await prohlizec.zavri().catch(() => {});
  }
  writeFileSync(OUT, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(), zdroje: ven,
  }, null, 1) + '\n', 'utf8');
  console.log(`Zapsáno do data/zdroje-podminky.json: ${ven.length} zdrojů.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Sonda podmínek spadla:', e); process.exit(1); });
}
