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
  const zj = textZeSkriptu(html).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 40);
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
    ven.push({ slovo, text: vysek });
    if (ven.length >= ODSTAVCU_NA_STRANKU) break;
  }
  return ven;
}

/**
 * Jeden zdroj: domovská stránka → odkazy na podmínky → odstavce.
 * robots.txt se čte u KAŽDÉ adresy zvlášť, i u těch podstránek.
 */
export async function zmerPodminky(cil, { stahni, ua, mezipamet } = {}) {
  const zapis = { jmeno: cil.jmeno, host: cil.host, domov: cil.domov, kdy: new Date().toISOString().slice(0, 10), stranky: [] };
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

  const odkazy = odkazyNaPodminky(domov.html, cil.domov);
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
    const pasaze = oAutomatu(s.html);
    /* DOKLAD MĚŘÍ TOTÉŽ, CO SE PROHLEDÁVÁ. Kdyby se počítal jen text
       ze značek, zůstal by nález stejně slepý jako předtím: stránka
       s obsahem v JSONu by vyšla jako „málo textu", i když se text
       našel. */
    const vsechny = celyText(s.html);
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
      odstavcu: pasaze.length, pasaze,
      /* Odkazy na dokumenty (PDF, DOC) — vodítko, kde text je, když ho
         na stránce není. Nestahují se. */
      dokumenty: [...String(s.html || '').matchAll(/href\s*=\s*["']([^"']+\.(?:pdf|docx?|odt))["']/gi)]
        .map((m) => absolutni(m[1], o.url)).filter(Boolean).slice(0, 5),
    });
    /* JEDEN SKOK DÁL. Podmínky bývají rozdělené („smluvní podmínky",
       „podmínky užití", „zásady ochrany údajů") a z domovské stránky
       vede odkaz jen na jedny. Z té stránky se proto posbírají další
       odkazy téhož druhu — ale jen jeden skok a do stropu, aby se
       nestahoval půl webu. */
    for (const dalsi of odkazyNaPodminky(s.html, o.url)) {
      if (zapis.stranky.length + fronta.length >= STRANEK_NA_ZDROJ) break;
      if (videne.has(dalsi.url)) continue;
      videne.add(dalsi.url);
      fronta.push(dalsi);
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
  /* Kam se text možná schoval: odkazy na dokumenty. Nestahují se —
     je to jen vodítko pro člověka, který to pak otevře. */
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
export function cilePodminek(nalez) {
  const ven = [];
  for (const z of ((nalez && nalez.zdroje) || [])) {
    if (z.stav !== 'zapojeno' || z.robots !== 'nedovoluje') continue;
    const host = String(z.host || '').replace(/^api\./, '');
    if (!host) continue;
    ven.push({ jmeno: z.jmeno, host, domov: `https://www.${host}/`, zakaz: z.robotsDuvod });
  }
  return ven;
}

async function main() {
  let nalez = null;
  try { nalez = JSON.parse(readFileSync(SONDA, 'utf8')); } catch { nalez = null; }
  if (!nalez || !nalez.updated) {
    console.error('CHYBA: nález sondy zdrojů chybí nebo nebyl změřen.'
      + ' Podmínky se čtou jen u zdrojů, u kterých sonda naměřila zákaz —'
      + ' bez měření se neví u kterých. Spusťte „Sonda zdrojů".');
    process.exit(1);
  }
  const cile = cilePodminek(nalez);
  console.log(`Zdrojů se zákazem: ${cile.length}${cile.length ? ' — ' + cile.map((c) => c.jmeno).join(', ') : ''}.`);
  if (process.argv.includes('--jen-cile')) {
    writeFileSync(OUT, JSON.stringify({ updated: null, zdroje: cile.map((c) => ({ ...c, verdikt: 'neměřeno' })) }) + '\n', 'utf8');
    console.log('Zapsán jen seznam cílů (verdikt „neměřeno").');
    return;
  }
  if (!cile.length) {
    writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), zdroje: [] }) + '\n', 'utf8');
    console.log('Žádný zapojený zdroj nás nezakazuje — není co zjišťovat.');
    return;
  }
  const { stahni } = await import('./fetch-opportunities.mjs');
  const mezipamet = new Map();
  const ven = [];
  for (const c of cile) {
    const z = await zmerPodminky(c, { stahni, ua: BOT_UA, mezipamet });
    ven.push(z);
    console.log(`  ${c.jmeno}: ${z.verdikt}`);
    for (const s of (z.stranky || [])) console.log(`     ${s.stav.padEnd(26)} ${s.url}`);
    await spi(PAUZA_MS);
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
