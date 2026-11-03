/**
 * Sonda zdrojů: které zdroje jde vůbec číst.
 * ====================================================================
 * Spuštění:  node scripts/sonda-zdroju.mjs            (chodí po síti)
 *            node scripts/sonda-zdroju.mjs --suchy     (nic nestahuje, nic nezapíše)
 *            node scripts/sonda-zdroju.mjs --jen-cile  (zapíše, co se bude měřit)
 *
 * CO TO DĚLÁ. U každého zdroje ze scripts/zdroje-kandidati.mjs a u
 * každého hostitele, kterého robot našel ve vlastních datech, zjistí
 * tři věci a zapíše je do data/zdroje-sonda.json:
 *   1) co dovoluje robots.txt pro naše jméno,
 *   2) jestli adresa odpovídá (stav, čas, velikost),
 *   3) hrubý odhad, jestli na té stránce vůbec jsou pozemky.
 *
 * PROČ TO NENÍ STAHOVAČ. Stahovač se dá napsat až na základě měření:
 * jinak se píše naslepo a první, co se o zdroji dozvíme, je, že jeho
 * data jsou v datech webu špatně. Tahle sonda nic nepublikuje a do
 * nabídek nezasahuje — jen měří a zapisuje nález.
 *
 * POŘADÍ JE POVINNÉ: NEJDŘÍV ROBOTS.TXT. Když zakazuje, stránka se
 * nestahuje vůbec; v nálezu zůstane „zakázané" a důvod. Když se
 * robots.txt nepodaří přečíst, platí totéž — nevíme, co je dovolené,
 * takže nebereme (viz smimeCist v scripts/robots.mjs).
 *
 * ŠETRNOST. Na zdroj jdou nejvýš dva dotazy za běh (robots.txt a jedna
 * stránka), mezi hostiteli se čeká PAUZA_MS a případný Crawl-delay
 * z robots.txt se respektuje. Sonda běží jednou týdně, ne v robotu dat.
 *
 * ŽÁDNÉ OBCHÁZENÍ. Hlavička user-agent je jediná (scripts/bot-ua.mjs),
 * nestřídá se a nepředstírá prohlížeč. Hlídá scripts/test-sonda-zdroju.mjs.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { BOT_UA } from './bot-ua.mjs';
import { smimeCist, telo } from './robots.mjs';
import { tvorProhlizec } from './cti-prohlizecem.mjs';
import { zeSitemapy, zRss } from './cteni-zdroje.mjs';
import { ZAPOJENE, KANDIDATI, kandidatiZDat } from './zdroje-kandidati.mjs';

export const PAUZA_MS = 2000;          // mezi hostiteli, ať sonda nebuší
export const CAS_LIMIT_MS = 20000;     // na jeden dotaz
export const SONDA_OUT = new URL('../data/zdroje-sonda.json', import.meta.url);
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hrubý odhad, jestli na stránce jsou pozemky. Je to ukazatel, ne
 * důkaz — proto se vrací počty, ne verdikt: ať je v nálezu vidět,
 * z čeho se soudí. (Na JSON z otevřených dat tahle čísla nic neřeknou
 * a nemají; u nich rozhoduje, že odpověď vůbec přišla.)
 */
export function vyteznost(text) {
  const t = String(text || '');
  const spocti = (re) => (t.match(re) || []).length;
  /* POZOR NA \b U ČESKÝCH ZNAKŮ. „Kč" ani „m²" na slovní hranici
     nekončí — `č` a `²` nejsou pro JavaScript písmena slova, takže
     /\bKč\b/ nenajde nic. Napsané to tak bylo a zkouška to odhalila:
     na textu „1 000 m² za 500 000 Kč" naměřila nula metrů a nula
     korun. Místo \b se proto hlídá, že za jednotkou nenásleduje další
     písmeno (aby „Kčsi" nebo „m2x" neprošly). */
  return {
    metru: spocti(/m(?:²|2)(?![\p{L}])/gu),
    korun: spocti(/K[čc](?![\p{L}])/gu),
    /* „pozemk" NESEDÍ NA „pozemek" — mezi m a k je e. Napsané to tak
       bylo a výpis plný slova „Pozemek" by dostal nulu. */
    slovoPozemek: spocti(/pozemek|pozemk|parcel/gi),
    odkazu: spocti(/href="[^"]*(?:detail|nabidk|drazb|pozemek|parcel)[^"]*"/gi),
    bajtu: t.length,
  };
}

/** Z počtů udělá jedno slovo. Mez je nízká schválně: sonda má říct
 *  „tady se dá hledat dál", ne „tady je 42 pozemků". */
/* Kolik bajtů už je „velká stránka". Pod tím je stránka prostě
   malá a nic se z toho nedovozuje. */
export const BAJTU_SKORAPKA = 20000;

/**
 * Je to SKOŘÁPKA — velká stránka bez jediné zmínky pozemku?
 *
 * NALEZENO MĚŘENÍM. ÚZSVM vrátil 86 880 bajtů HTML, ve kterých nebylo
 * ani jedno slovo „pozemek" a dvakrát „Kč". To není slabý obsah —
 * to je skorapka, do které obsah dotahuje až prohlížeč. Verdikt
 * „slabé" by o tom zdroji tvrdil, že jsme ho změřili a nic tam není;
 * pravda je, že jsme nezměřili nic. Táž úvaha jako prah na text
 * u sondy podmínek (§340).
 */
export function jeSkorapka(v) {
  if (!v) return false;
  return (v.bajtu || 0) >= BAJTU_SKORAPKA && (v.slovoPozemek || 0) === 0 && (v.korun || 0) <= 2;
}

export function slibuje(v) {
  if (!v) return 'nevíme';
  if (v.slovoPozemek >= 3 && (v.korun >= 3 || v.metru >= 3)) return 'slibné';
  /* Skořápka se musí poznat DŘÍV než „slabé" — jinak by ji dvojí
     zmínka „Kč" v patičce vydala za změřený slabý obsah. */
  if (jeSkorapka(v)) return 'skořápka';
  if (v.slovoPozemek >= 1 || v.korun >= 1) return 'slabé';
  return 'nic nenasvědčuje';
}

/* Vzorec adresy, která vypadá na výpis nebo inzerát pozemku. Používá
   se na adresy ze sitemapy a RSS, kde nemáme nápis odkazu. */
export const ADRESA_POZEMEK = /pozemk|pozemek|parcel|nemovit|majetk|majetek|nabidk|drazb/i;

/** Nejvýš tolik adres ze strojové cesty se zapíše do nálezu. */
export const STROJOVYCH_ADRES = 5;

/**
 * STROJOVÁ CESTA: sitemap.xml a RSS.
 *
 * PROČ. Měřeno 3. 11.: ÚZSVM vrátil 87 kB HTML, ve kterých nebylo ani
 * jedno slovo „pozemek" — skořápka, do které obsah dotahuje až
 * prohlížeč. Pro takový zdroj je prohledávání odkazů slepé: na stránce
 * žádné nejsou. Jenže sitemapa a RSS jsou STROJOVĚ ČITELNÉ a vedou
 * přímo na výpisy i na jednotlivé inzeráty — a čtečky na obojí už
 * v repozitáři jsou (§334, `zeSitemapy` a `zRss`).
 *
 * Nic se odsud NEBERE do nabídek: tohle je hledání adresy, ne čtení
 * dat. Do nálezu jde seznam adres, aby bylo vidět, kde výpis je.
 * robots.txt platí i tady — sitemapa není výjimka.
 */
export async function strojoveAdresy(cil, { stahni, ua, mezipamet } = {}) {
  let zaklad = '';
  try { zaklad = new URL(cil.url).origin; } catch { return { adresy: [], zkusene: [] }; }
  const jmeno = ua || BOT_UA;
  const kde = [`${zaklad}/sitemap.xml`, `${zaklad}/sitemap_index.xml`, `${zaklad}/rss`, `${zaklad}/feed`];
  const adresy = [];
  const zkusene = [];
  for (const u of kde) {
    if (adresy.length >= STROJOVYCH_ADRES) break;
    let r = null;
    try { r = await smimeCist(u, { stahni, ua: jmeno, mezipamet }); }
    catch { r = { dovoleno: false }; }
    if (!r.dovoleno) { zkusene.push({ url: u, stav: 'nesmíme číst' }); continue; }
    if (r.delay) await spi(Math.min(r.delay, 30) * 1000);
    await spi(PAUZA_MS);
    let xml = '';
    try {
      const odp = await stahni(u, { casLimit: CAS_LIMIT_MS, pokusy: 1 });
      if (!odp.ok) { zkusene.push({ url: u, stav: 'HTTP ' + odp.status }); continue; }
      xml = await telo(odp);
    } catch (e) { zkusene.push({ url: u, stav: 'neodpověděla' }); continue; }
    /* Sitemapa i RSS naráz — nehádá se podle jména souboru, bere se,
       co v tom opravdu je. Web si „rss" klidně pojmenuje „feed.xml". */
    const ze = zeSitemapy(xml, ADRESA_POZEMEK);
    const zr = zRss(xml).map((x) => x.url).filter((x) => ADRESA_POZEMEK.test(x));
    const nalezeno = [...new Set([...ze, ...zr])];
    zkusene.push({ url: u, stav: 'přečteno', adres: nalezeno.length });
    for (const a of nalezeno) {
      if (adresy.includes(a)) continue;
      adresy.push(a);
      if (adresy.length >= STROJOVYCH_ADRES) break;
    }
  }
  return { adresy, zkusene };
}

/**
 * Jedno měření. Vrací záznam do nálezu; nikdy nevyhodí výjimku —
 * selhání je výsledek, ne pád.
 */
export async function sondujZdroj(cil, { stahni, ua, mezipamet, vykresli } = {}) {
  const zapis = {
    jmeno: cil.jmeno || cil.host, host: cil.host, url: cil.url, typ: cil.typ || '?',
    stav: cil.stav || 'kandidát', adresaOverena: cil.adresaOverena === true,
    kdy: new Date().toISOString().slice(0, 10),
  };
  const jmeno = ua || BOT_UA;
  let r = null;
  try { r = await smimeCist(cil.url, { stahni, ua: jmeno, mezipamet }); }
  catch (e) { r = { dovoleno: false, duvod: 'robots.txt: ' + (e && e.message ? e.message : e) }; }
  /* TŘI STAVY, NE DVA. „nedovoluje" je tvrzení o cizim webu — že čtení
     zakazuje. Když se robots.txt nepodaří přečíst, číst se nebude stějů
     co stěj (RFC 9309), ale říct tomu „zakázané" je lhaní do nálezu:
     nález pak slouží k rozhodování, který zdroj zapojit, a zdroj, co se
     dnes nedal změřit, není zdroj, který si nepřeje být čten.
     Napsané po tom, co první běh sondy ohlásil 12 ze 16 zdrojů jako
     zakázané — a byla to vada u nás (viz `telo()` v robots.mjs). */
  zapis.robots = r.dovoleno ? 'dovoluje' : (r.nejdePrecist ? 'nevíme' : 'nedovoluje');
  zapis.robotsDuvod = r.duvod || '';
  if (r.delay != null) zapis.crawlDelay = r.delay;
  if (!r.dovoleno) {
    zapis.verdikt = r.nejdePrecist ? 'robots neznámý' : 'zakázané';
    /* U ZAPOJENÝCH zdrojů se do nálezu připojí celý text robots.txt.
       Důvod je v robots.mjs: odpojit zdroj je rozhodnutí, které se nemá
       dělat podle jedné věty. U kandidátů to netreba — tam je zákaz
       prostě „tím se nezabýváme". */
    if (cil.stav === 'zapojeno' && r.text) zapis.robotsText = r.text;
    return zapis;
  }
  if (r.delay) await spi(Math.min(r.delay, 30) * 1000);
  const zacatek = Date.now();
  let html = '';
  try {
    const odp = await stahni(cil.url, { casLimit: CAS_LIMIT_MS, pokusy: 1 });
    zapis.odpoved = odp.status;
    html = await telo(odp);
    zapis.ms = Date.now() - zacatek;
    zapis.vyteznost = vyteznost(html);
    zapis.verdikt = odp.ok ? 'dostupné' : 'neodpovídá';
    zapis.slibuje = odp.ok ? slibuje(zapis.vyteznost) : 'nevíme';
  } catch (e) {
    zapis.ms = Date.now() - zacatek;
    zapis.verdikt = 'neodpovídá';
    zapis.chyba = String(e && e.message ? e.message : e).slice(0, 160);
    return zapis;
  }

  /* HLEDÁNÍ VÝPISU, KDYŽ NA ZADANÉ ADRESE NIC NENÍ.
     První nález sondy ohlásil u ÚZSVM, eDesky a Lesů ČR „obsah slabé"
     — jenže se ptala na ÚVODNÍ STRÁNKU. Na úvodní stránce výpis
     pozemků není ani u webu, který jich má tisíce, takže ten verdikt
     neříkal nic o zdroji — jen o tom, kam jsme se podívali. Hledání
     zdrojů, které se dívá na špatnou adresu, nehledá nic.
     Zkouší se nejvýš `DALSICH_ADRES` odkazů, u každého se čte
     robots.txt a mezi dotazy se čeká. A jen tam, kde se nenašlo nic
     slibného — kdo už výpis má, se znovu nestahuje. */
  if (zapis.verdikt === 'dostupné' && zapis.slibuje !== 'slibné') {
    const kandidati = odkazyNaVypis(html, cil.url).slice(0, DALSICH_ADRES);
    zapis.zkusenoDalsich = kandidati.length;
    for (const k of kandidati) {
      await spi(PAUZA_MS);
      let r2 = null;
      try { r2 = await smimeCist(k.url, { stahni, ua: jmeno, mezipamet }); }
      catch { r2 = { dovoleno: false }; }
      if (!r2.dovoleno) continue;
      if (r2.delay) await spi(Math.min(r2.delay, 30) * 1000);
      try {
        const odp2 = await stahni(k.url, { casLimit: CAS_LIMIT_MS, pokusy: 1 });
        if (!odp2.ok) continue;
        const v2 = vyteznost(await telo(odp2));
        if (lepsiVyteznost(v2, zapis.vyteznost) === v2 && slibuje(v2) !== slibuje(zapis.vyteznost)) {
          /* Adresa, na kterou se zdroj opravdu měří, se do nálezu
             ZAPISUJE — bez ní by se nevědělo, odkud ten verdikt je. */
          zapis.lepsiAdresa = { url: k.url, popis: k.popis, slibuje: slibuje(v2) };
          zapis.vyteznost = v2;
          zapis.slibuje = slibuje(v2);
        }
      } catch { /* jedna adresa z několika — běh to nezastavuje */ }
      if (zapis.slibuje === 'slibné') break;
    }
  }

  /* STROJOVÁ CESTA U SKOŘÁPKY. Když je stránka velká a není v ní ani
     jedno slovo o pozemku, je procházení odkazů slepé: na stránce
     žádné nejsou, obsah dotahuje až prohlížeč. Sitemapa a RSS ale
     strojově čitelné jsou — a vedou přímo na výpisy. Nic se odsud
     nebere do nabídek; do nálezu jde seznam adres, aby bylo vidět,
     kde výpis je. */
  if (zapis.slibuje === 'skořápka' || zapis.slibuje === 'nic nenasvědčuje') {
    const sm = await strojoveAdresy(cil, { stahni, ua: jmeno, mezipamet });
    if (sm.adresy.length) zapis.strojoveAdresy = sm.adresy;
    if (sm.zkusene.length) zapis.strojoveZkusene = sm.zkusene;
  }

  /* SKOŘÁPKA SE PŘEČTE PROHLÍŽEČEM. Verdikt „skořápka" znamená: velká
     stránka, a ani jedno slovo o pozemku — obsah dotahuje skript.
     Naměřeno 3. 11. u ÚZSVM: 0 m², 0× „pozemek", a to i po třech
     dalších adresách a po cestě přes sitemap. Takový verdikt není
     o zdroji, je o tom, čím ho čteme (§353).
     Zkouší se JEN u skořápky a jen na té adrese, na kterou se zdroj
     měří — jeden prohlížeč na zdroj, ne na každý odkaz. robots.txt
     platí dál, a v cti-prohlizecem.mjs i pro podřízené soubory. */
  if (vykresli && (zapis.slibuje === 'skořápka' || zapis.slibuje === 'nic nenasvědčuje')) {
    const adresa = (zapis.lepsiAdresa && zapis.lepsiAdresa.url) || cil.url;
    try {
      const v = await vykresli(adresa);
      const v2 = vyteznost(v.html || '');
      /* Bere se to jen tehdy, když je to OPRAVDU LEPŠÍ — jinak by
         nález tvrdil práci, která nic nepřinesla. */
      if (lepsiVyteznost(v2, zapis.vyteznost) === v2 && slibuje(v2) !== zapis.slibuje) {
        zapis.vykresleno = { url: adresa, bylo: zapis.slibuje, je: slibuje(v2),
          zablokovano: v.zablokovano || 0, cizich: v.cizich || 0 };
        zapis.vyteznost = v2;
        zapis.slibuje = slibuje(v2);
      } else {
        zapis.vykresleno = { url: adresa, bylo: zapis.slibuje, je: slibuje(v2), nepomohlo: true,
          zablokovano: v.zablokovano || 0, cizich: v.cizich || 0 };
      }
    } catch (e) {
      zapis.vykresleno = { url: adresa, chyba: String(e && e.message ? e.message : e).slice(0, 120) };
    }
  }
  return zapis;
}

/* Slova, podle kterých se pozná odkaz na VÝPIS NABÍDEK. Hledá se
   v textu odkazu i v adrese — každý web si to pojmenuje jinak. */
export const SLOVA_VYPIS = /nab[íi]dk|prodej|pozemk|pozemek|parcel|majetk|majetku|dra[žz]b|v[ýy]pis|seznam|inzer|realit|ko?upit/i;

/* Slova, která ukazují, že se prodává NĚCO JINÉHO než pozemek.
   NALEZENO MĚŘENÍM: u Lesů ČR si sonda vybrala
   `/o-nas/prodej-drivi-verejnosti/` — prodej DŘÍVÍ. Slovo „prodej"
   samo o pozemku nic neříká a tři dotazy se utratily na něco, co
   nás nezajímá. */
export const SLOVA_JINE_ZBOZI = /d[řr][íi]v|d[řr]evo|paliv|uhl[íi]|štipan|sazenic|osiv|semen|vozidl|technik|n[áa]bytek|stroj[ei]/i;

/**
 * Jak moc odkaz mluví o POZEMKU, ne jen o „prodeji".
 *
 * Pořadí podle dokumentu nestačí: u Lesů ČR stál „Prodej dříví"
 * na stránce před „Nabídkou pozemků", takže se tři povolené dotazy
 * utratily na dříví. Skoře se proto sčítá podle toho, co v adrese
 * a v nápisu stojí — a jiné zboží se odebírá.
 */
export function skorOdkazu(url, popis) {
  const t = `${url || ''} ${popis || ''}`;
  let s = 0;
  if (/pozemk|pozemek|parcel/i.test(t)) s += 3;
  /* „majetk" NESEDÍ NA „majetek" — mezi t a k je e. Táž past, na
     kterou v tomhle souboru už stojí varování u `vyteznost`
     („pozemk" vs. „pozemek") — a stejně jsem do ní spadl podruhé.
     Našla to zkouška: `/majetek` měl skóre 0, tedy míně než holý
     „prodej". */
  if (/nemovit|majetk|majetek/i.test(t)) s += 2;
  if (/nab[íi]dk|prodej|dra[žz]b|v[ýy]pis|seznam|inzer/i.test(t)) s += 1;
  if (SLOVA_JINE_ZBOZI.test(t)) s -= 3;
  return s;
}

/** Nejvýš tolik dalších adres se u jednoho zdroje zkusí. */
export const DALSICH_ADRES = 3;

/**
 * Odkazy, které vypadají na výpis nabídek — na témže webu.
 *
 * PROČ TO VZNIKLO. První nález sondy ohlásil u ÚZSVM, eDesky a Lesů ČR
 * „obsah slabé" — jenže sonda se ptala na ÚVODNÍ STRÁNKU. Na úvodní
 * stránce výpis pozemků není ani u webu, který jich má tisíce, takže
 * ten verdikt neříkal nic o zdroji, jen o tom, kam jsme se podívali.
 * Hledání zdrojů, které se dívá na špatnou adresu, nehledá nic.
 */
export function odkazyNaVypis(html, base) {
  let domaci = '';
  try { domaci = new URL(base).hostname.toLowerCase(); } catch { domaci = ''; }
  const ven = [];
  const videne = new Set([String(base).split('#')[0]]);
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const href = m[1];
    const popis = String(m[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!SLOVA_VYPIS.test(href) && !SLOVA_VYPIS.test(popis)) continue;
    let abs;
    try { abs = new URL(href, base).href.split('#')[0]; } catch { continue; }
    if (!/^https?:/.test(abs)) continue;
    let host = '';
    try { host = new URL(abs).hostname.toLowerCase(); } catch { continue; }
    if (domaci && host !== domaci) continue;
    if (videne.has(abs)) continue;
    videne.add(abs);
    ven.push({ url: abs, popis: popis.slice(0, 80), skore: skorOdkazu(abs, popis) });
  }
  /* POŘADÍ PODLE SKÓRE, NE PODLE DOKUMENTU. Dotazy jsou tři, tak ať
     padnou na ty tři nejnadějnější. Při shodě zůstává pořadí ze
     stránky — řazení je stabilní, ať je nález každý týden stejný
     a dají se srovnávat. */
  return ven
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (b.o.skore - a.o.skore) || (a.i - b.i))
    .map((x) => x.o);
}

/** Která výtěžnost je lepší? Podle verdiktu, při shodě podle počtu
 *  zmínek pozemku — ne podle velikosti stránky, aby nevyhrál web
 *  s velkou patičkou. */
export function lepsiVyteznost(a, b) {
  /* Skořápka je VÍC než „nic nenasvědčuje" (aspoň víme, že tam něco
     je), ale MÍŇ než „slabé" — ze slabé stránky jsme přečetli aspoň
     něco, ze skořápky nic. */
  const rad = { 'slibné': 4, 'slabé': 3, 'skořápka': 2, 'nic nenasvědčuje': 1, 'nevíme': 0 };
  const ra = rad[slibuje(a)] || 0, rb = rad[slibuje(b)] || 0;
  if (ra !== rb) return ra > rb ? a : b;
  return ((a && a.slovoPozemek) || 0) >= ((b && b.slovoPozemek) || 0) ? a : b;
}

/**
 * Ukazuje nález na vadu u NÁS, místo na cizí weby?
 *
 * Napsané po tom, co první běh sondy ohlásil 12 ze 16 zdrojů jako
 * zakázané — a u VŠECH DVANÁCTI stál týž důvod, „robots.txt odpověděl
 * 200". Nebyla to pravda o cizích webech, byla to vada v našem čtení
 * (§337). Nález se přitom zapsal jako pravda a diagnostika podle něj
 * radila odebrat zdroje, které nic nezakazují.
 *
 * Pravidlo, které z toho plyne: dvanáct různých webů — od státního
 * úřadu po soukromé dražebníky — se nerozhodne stejně a ze stejného
 * důvodu. Když většina zdrojů dopadne stejně a se SLOVO OD SLOVA
 * týmž vysvětlením, je nejpravděpodobnější vysvětlení naše vada.
 *
 * Mez je polovina měřených zdrojů, nejméně tři. Polovina proto, že
 * právě tak se pozná „většina", a ne „shodou okolností dva weby":
 * dva weby s týmž CMS mají robots.txt klidně stejný. Vrací popis
 * nálezu, ne jen ano/ne, ať se dá do hlášky napsat číslo.
 */
export function vzorecNasiVady(nalez) {
  const zdroje = Array.isArray(nalez) ? nalez : [];
  const nepovoleno = zdroje.filter((z) => z && z.robots !== 'dovoluje');
  const podleDuvodu = new Map();
  for (const z of nepovoleno) {
    const d = String((z && z.robotsDuvod) || '(bez důvodu)');
    podleDuvodu.set(d, (podleDuvodu.get(d) || 0) + 1);
  }
  let duvod = '', kolik = 0;
  for (const [d, n] of podleDuvodu) if (n > kolik) { duvod = d; kolik = n; }
  const mez = Math.max(3, Math.ceil(zdroje.length / 2));
  return { duvod, kolik, mez, celkem: zdroje.length, nasiVada: kolik >= mez };
}

/** Celý seznam cílů: zapojené, kandidáti a to, co robot našel sám. */
export function cileSondy(nabidky) {
  const cile = [
    ...ZAPOJENE.map((z) => ({ ...z, stav: 'zapojeno' })),
    ...KANDIDATI.map((z) => ({ ...z, stav: 'kandidát' })),
  ];
  for (const n of kandidatiZDat(nabidky)) {
    cile.push({
      jmeno: n.host, host: n.host, url: n.priklad, typ: 'drazba',
      stav: 'z vlastních dat', adresaOverena: true,
      proc: `Tenhle hostitel se ${n.pocet}× objevil v odkazech našich nabídek`
        + ' (centrální evidence dražeb odkazuje na dražebníky), seznam ho nezná.',
    });
  }
  return cile;
}

/** Kolik procent nabídek nese nejsilnější zdroj — číslo, kvůli kterému
 *  tahle sonda existuje. */
export function zavislost(nabidky, zdrojNabidky) {
  const podle = new Map();
  for (const o of (nabidky || [])) {
    const z = zdrojNabidky(o) || '(nepřiřazeno)';
    podle.set(z, (podle.get(z) || 0) + 1);
  }
  const serazene = [...podle.entries()].sort((a, b) => b[1] - a[1]);
  const celkem = (nabidky || []).length || 1;
  return {
    celkem,
    nejsilnejsi: serazene[0] ? serazene[0][0] : null,
    podil: serazene[0] ? Math.round((serazene[0][1] / celkem) * 100) : 0,
    podleZdroje: Object.fromEntries(serazene),
  };
}

async function main() {
  const suchy = process.argv.includes('--suchy');
  let nabidky = [];
  try { nabidky = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities || []; }
  catch { nabidky = []; }
  const { stahni, zdrojNabidky } = await import('./fetch-opportunities.mjs');
  const cile = cileSondy(nabidky);
  const zav = zavislost(nabidky, zdrojNabidky);
  console.log(`Zdrojů k měření: ${cile.length}.`
    + ` Nejsilnější zdroj dnes nese ${zav.podil} % nabídek (${zav.nejsilnejsi}).`);
  if (suchy) {
    for (const c of cile) console.log(`  · ${c.stav.padEnd(16)} ${c.jmeno} — ${c.url}`);
    console.log('Suchý běh: nic se nestahovalo, nic se nezapsalo.');
    return;
  }
  /* --jen-cile: do souboru se zapíše SEZNAM CÍLŮ bez měření. Je to
     stav „sonda ještě neběžela" napsaný tak, aby se nedal přečíst
     jako nález: u každého zdroje stojí verdikt „neměřeno". Diagnostika
     podle toho pozná rozdíl mezi „nezměřeno" a „nedostupné". */
  if (process.argv.includes('--jen-cile')) {
    writeFileSync(SONDA_OUT, JSON.stringify({
      updated: null, updated_at: null, zavislost: zav,
      souhrn: { dostupne: 0, zakazane: 0, nezjisteno: 0, neodpovida: 0, slibnych: 0 },
      zdroje: cile.map((c) => ({
        jmeno: c.jmeno, host: c.host, url: c.url, typ: c.typ, stav: c.stav,
        adresaOverena: c.adresaOverena === true, verdikt: 'neměřeno',
      })),
    }) + '\n', 'utf8');
    console.log(`Zapsán seznam ${cile.length} cílů bez měření (verdikt „neměřeno").`);
    return;
  }
  const nalez = [];
  const mezipamet = new Map();
  /* Prohlížeč LÍNĚ a jeden na celý běh — většina zdrojů ho nepotřebuje
     a spouštět Chromium naprázdno je ztráta. Když v prostředí není,
     nesmí to sondu shodit: zapíše se to u toho zdroje jako důvod. */
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
        console.log('  (spuštěn prohlížeč — nějaká stránka vypadá na skořápku)');
      } catch (e) {
        prohlizecPadl = new Error('prohlížeč nejde spustit: ' + String(e && e.message ? e.message : e).slice(0, 100));
        throw prohlizecPadl;
      }
    }
    return prohlizec.vykresli(url);
  };
  try {
    for (const c of cile) {
      const z = await sondujZdroj(c, { stahni, ua: BOT_UA, mezipamet, vykresli });
      nalez.push(z);
      console.log(`  ${(z.verdikt || '?').padEnd(12)} ${z.jmeno} — robots ${z.robots}`
        + (z.odpoved ? `, odpověď ${z.odpoved}` : '')
        + (z.slibuje ? `, obsah ${z.slibuje}` : '')
        + (z.vykresleno && !z.vykresleno.nepomohlo && !z.vykresleno.chyba ? ' [prohlížeč pomohl]' : '')
        + (z.vykresleno && z.vykresleno.nepomohlo ? ' [prohlížeč nepomohl]' : '')
        + (z.chyba ? `, ${z.chyba}` : ''));
      await spi(PAUZA_MS);
    }
  } finally {
    if (prohlizec) await prohlizec.zavri().catch(() => {});
  }
  const souhrn = {
    dostupne: nalez.filter((z) => z.verdikt === 'dostupné').length,
    zakazane: nalez.filter((z) => z.verdikt === 'zakázané').length,
    /* Zvlášť od zakázaných: tyhle zdroje číst nebudeme, ale ne proto,
       že by si to nepřály — proto, že se to dnes nedalo zjistit. */
    nezjisteno: nalez.filter((z) => z.verdikt === 'robots neznámý').length,
    neodpovida: nalez.filter((z) => z.verdikt === 'neodpovídá').length,
    slibnych: nalez.filter((z) => z.slibuje === 'slibné' && z.stav !== 'zapojeno').length,
  };
  /* POJISTKA PROTI MĚŘENÍ Z ROZBITÉ SÍTĚ. Když neodpoví ANI JEDEN
     zdroj, zdaleka nejpravděpodobnější vysvětlení není, že deset webů
     spadlo naráz — ale že nefunguje síť na naší straně. Přepsat tím
     dřívější nález by znamenalo o cizích webech tvrdit, že jsou mrtvé,
     protože jsme se k nim nedostali. Soubor se proto nechá být a úloha
     skončí chybou, ať přijde upozornění. (Je to táž úvaha jako
     u globální pojistky robota dat, viz §332.) */
  let drive = null;
  try { drive = JSON.parse(readFileSync(SONDA_OUT, 'utf8')); } catch { drive = null; }
  const drivDostupnych = drive && drive.souhrn ? (drive.souhrn.dostupne || 0) : 0;
  if (souhrn.dostupne === 0 && drivDostupnych > 0) {
    console.error(`CHYBA: neodpověděl ani jeden z ${nalez.length} zdrojů, minule jich`
      + ` odpovídalo ${drivDostupnych}. To nevypadá na výpadek zdrojů, ale na síť`
      + ' na naší straně — nález nechávám být.');
    process.exit(1);
  }
  /* DRUHÁ POJISTKA: STEJNÝ DŬVOD U VĚTŠINY ZDROJŮ UKAZUJE NA NÁS.
     Úvaha i mez jsou u `vzorecNasiVady` výš; tady se jen jedná. */
  const vzorec = vzorecNasiVady(nalez);
  if (vzorec.nasiVada) {
    console.error(`CHYBA: ${vzorec.kolik} z ${vzorec.celkem} zdrojů dopadlo stejně`
      + ` a se stejným důvodem („${vzorec.duvod}"). Tolik různých webů se stejně`
      + ' nerozhodne — tohle ukazuje na vadu v našem čtení, ne na cizí weby.'
      + ' Nález nechávám být (viz §337).');
    process.exit(1);
  }
  writeFileSync(SONDA_OUT, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
    zavislost: zav, souhrn, zdroje: nalez,
  }) + '\n', 'utf8');
  console.log(`Zapsáno do data/zdroje-sonda.json: ${souhrn.dostupne} dostupných,`
    + ` ${souhrn.zakazane} zakázaných, ${souhrn.nezjisteno} s neznámým robots.txt,`
    + ` ${souhrn.neodpovida} bez odpovědi,`
    + ` ${souhrn.slibnych} slibných kandidátů.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Sonda zdrojů spadla:', e); process.exit(1); });
}
