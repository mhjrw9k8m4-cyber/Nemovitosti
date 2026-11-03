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

/** Stejný host, nebo jeho podřízená část (www.x.cz ↔ x.cz ↔ api.x.cz). */
export function stejnyWeb(host, cil) {
  const a = String(host || '').replace(/^www\./, '').toLowerCase();
  const b = String(cil || '').replace(/^www\./, '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const koren = (x) => x.split('.').slice(-2).join('.');
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
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (!stejnyWeb(u.hostname, ctx.__host)) { cizich++; return r.abort(); }
    let smi = true;
    try { smi = await smiCist(u.href); } catch (e) { smi = false; }
    if (!smi) { zablokovano++; return r.abort(); }
    return r.continue();
  });
  return {
    async vykresli(url) {
      ctx.__host = new URL(url).hostname;
      zablokovano = 0; cizich = 0;
      const page = await ctx.newPage();
      try {
        /* `domcontentloaded` a pak doběh na síti: `load` na stránkách
           s nekonečným měřením nedojde nikdy. */
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: casLimit });
        await page.waitForLoadState('networkidle', { timeout: casLimit }).catch(() => {});
        const html = await page.content();
        const text = await page.evaluate(() => (document.body && document.body.innerText) || '');
        return { html, text, zablokovano, cizich };
      } finally { await page.close().catch(() => {}); }
    },
    async zavri() { await ctx.close().catch(() => {}); await prohlizec.close().catch(() => {}); },
  };
}
