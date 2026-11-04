/* Čtení stránky, která se vykresluje až v prohlížeči
   ==================================================================
   PROČ TENHLE SOUBOR VZNIKL. Obě sondy čtou jen HTML, které server
   pošle — a na tom 3. 11. naostro skončily:

     · podmínky Bezrealitek: „málo textu — stránka se vykresluje až
       v prohlížeči, takhle se to nezjistí",
     · elektronickedrazby.cz: totéž,
     · ÚZSVM: verdikt „skořápka", 0 m² a 0× slovo „pozemek" i po třech
       dalších adresách a po cestě přes sitemap.

   U všech tří platí, že text TAM JE — jen ho skládá skript. Odpověď
   na majitelovu otázku („smělo by se to čist?", „nese to pozemky?")
   tedy nestála na zdroji, ale na tom, čím ho čteme.

   CO SE TÍM NEMĚNÍ, A JE TO DŮLEŽITÉ. robots.txt platí dál, a platí
   PŘÍSNĚJI než u běžného prohlížeče: kontroluje se nejen ta stránka,
   ale KAŽDÝ podřízený soubor, který by si vykreslování vyžádalo.
   Co robots.txt nedovoluje, se zahodí — stránka se pak vykreslí jen
   částečně a zapíše se, kolik požadavků se zahodilo. Cizí hosty
   (měřidla, reklama, fonty) se nestahují vůbec; nemají s podmínkami
   ani s nabídkami nic společného a stránka je k přečtení nepotřebuje.

   ŽÁDNÉ VYDÁVÁNÍ SE ZA NĚKOHO JINÉHO. Jde ven táž hlavička
   user-agent jako u obyčejného čtení, tedy včetně jména robota a
   odkazu. Nic se neobchází, jen se čte to, co by viděl člověk.
   ================================================================== */

/**
 * Co se při vykreslování zahodilo, ve tvaru pro nález sondy.
 * Prázdné seznamy se nezapisují, aby nález nenafukovaly.
 */
export function zahozene(v) {
  const z = { zablokovano: (v && v.zablokovano) || 0, cizich: (v && v.cizich) || 0 };
  if (v && v.cizinci && v.cizinci.length) z.cizinci = v.cizinci;
  if (v && v.zakazane && v.zakazane.length) z.zakazane = v.zakazane;
  return z;
}

/** Kolik jmen zahozených hostů a zakázaných cest se nejvýš zapíše. */
export const STROP_JMEN = 8;

/* PŘÍPONY, ZA KTERÝMI ZAČÍNÁ CIZÍ ORGANIZACE. Bez nich by se dvě
   poslední části jména čítaly jako doména, a pak by `cizi-urad.gov.cz`
   vycházel jako TÝŽ web jako `nabidkamajetku.gov.cz` — jiný úřad,
   vlastní robots.txt. Změřeno 3. 11.: `stejnyWeb` to tak opravdu
   vracela, a protože se právě na gov.cz má začít čist, nešlo to
   nechat. Seznam je krátký a jen z toho, co nás může potkat. */
export const VICEDILNE_PRIPONY = [
  'gov.cz', 'gov.sk', 'gov.uk', 'co.uk', 'org.uk', 'ac.uk', 'com.au', 'com.br',
];

/** Stejný host, nebo jeho podřízená část (www.x.cz ↔ x.cz ↔ api.x.cz). */
export function stejnyWeb(host, cil) {
  const a = String(host || '').replace(/^www\./, '').toLowerCase();
  const b = String(cil || '').replace(/^www\./, '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const koren = (x) => {
    const c = x.split('.');
    const dve = c.slice(-2).join('.');
    return c.slice(VICEDILNE_PRIPONY.includes(dve) ? -3 : -2).join('.');
  };
  return koren(a) === koren(b);
}

/**
 * Prohlížeč, kterým se dá přečíst jedna stránka.
 *
 * `smiCist(url)` je funkce zvenčí: vrací `true/false`, jestli to
 * robots.txt dovoluje. Předává se, aby se dala ve zkoušce podstrčit —
 * a aby tenhle soubor nemusel vědět nic o tom, jak se robots.txt čte.
 */
export async function tvorProhlizec({ chromium, smiCist, ua, casLimit = 20000 } = {}) {
  if (!chromium) throw new Error('bez prohlížeče: chromium se nepředalo');
  const kde = process.env.PW_CHROMIUM || '';
  const prohlizec = await chromium.launch(Object.assign(
    { args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
  const ctx = await prohlizec.newContext({
    userAgent: ua || undefined, locale: 'cs-CZ', serviceWorkers: 'block',
  });
  let zablokovano = 0, cizich = 0;
  /* PROČ SE ZAHOZENÉ ZAPISUJÍ JMENOVITĚ. Samo číslo („8 cizích hostů")
     neodpovídá na nic. Teprve jméno rozhodne, jestli šlo o měřidla a
     reklamu — pak je skořápka opravdu skořápka — nebo o vlastní datové
     rozhraní na sousední doméně, a to je druhá cesta, o které má
     majitel vědět. Totéž u zákazů: když robots.txt nedovoluje právě tu
     adresu, ze které se nabídky načítají, je odpověď na „smíme to
     čist?" záporná, a je to měřením podložené, ne odhad. */
  const cizinci = new Map();
  const zakazane = new Map();
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (!stejnyWeb(u.hostname, ctx.__host)) {
      cizich++;
      cizinci.set(u.hostname, (cizinci.get(u.hostname) || 0) + 1);
      return r.abort();
    }
    let smi = true;
    try { smi = await smiCist(u.href); } catch (e) { smi = false; }
    if (!smi) {
      zablokovano++;
      zakazane.set(u.pathname, (zakazane.get(u.pathname) || 0) + 1);
      return r.abort();
    }
    return r.continue();
  });
  /* Seřadit podle počtu požadavků: co se stahuje nejčastěji, bývá to
     podstatné. Strop je proti tomu, aby se do nálezu nevešla stovka
     měřidel. */
  const nejcastejsi = (m) => [...m.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]))
    .slice(0, STROP_JMEN)
    .map(([co, kolik]) => ({ co, kolik }));
  /* DATOVÉ ODPOVĚDI. Nalezeno měřením 4. 11.: ÚZSVM je aplikace, která
     si obsah dotahuje sama, takže ve vykresleném HTML nabídky nejsou
     a ze samotné stránky se čtečka napsat nedá. Co se ale dá udělat,
     je POSLECHNOUT SI, odkud si ta aplikace data bere — a to je přesně
     ta adresa, kterou by čtečka potřebovala. Zapisuje se jen to, co
     prohlížeč stejně stahoval (žádný požadavek se nepřidává) a jen
     odpovědi, které vypadají na data, ne na obrázky a styly. */
  const DATOVY_TYP = /json|csv|xml|text\/plain/i;
  const STROP_DATOVYCH = 12;
  return {
    async vykresli(url) {
      ctx.__host = new URL(url).hostname;
      zablokovano = 0; cizich = 0; cizinci.clear(); zakazane.clear();
      const datove = [];
      const page = await ctx.newPage();
      page.on('response', (odp) => {
        try {
          const typ = odp.headers()['content-type'] || '';
          const u = odp.url();
          if (!DATOVY_TYP.test(typ)) return;
          if (datove.length >= STROP_DATOVYCH) return;
          datove.push({ url: u.slice(0, 300), stav: odp.status(), typ: typ.slice(0, 60) });
        } catch { /* odpověď, na kterou se už nedá dosáhnout, se jen nezapíše */ }
      });
      try {
        /* `domcontentloaded` a pak doběh na síti: `load` na stránkách
           s nekonečným měřením nedojde nikdy. */
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: casLimit });
        await page.waitForLoadState('networkidle', { timeout: casLimit }).catch(() => {});
        const html = await page.content();
        const text = await page.evaluate(() => (document.body && document.body.innerText) || '');
        return {
          html, text, zablokovano, cizich, datove,
          cizinci: nejcastejsi(cizinci), zakazane: nejcastejsi(zakazane),
        };
      } finally { await page.close().catch(() => {}); }
    },
    async zavri() { await ctx.close().catch(() => {}); await prohlizec.close().catch(() => {}); },
  };
}
