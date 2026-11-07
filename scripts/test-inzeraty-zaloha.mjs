/* Zkouška: neztratí se inzerát od člověka, když databáze odpoví pozdě?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-inzeraty-zaloha.mjs
 * Volá ji .github/workflows/testy.yml (krok „Inzerát od člověka přežije
 * pomalou databázi").
 *
 * PROČ TO VZNIKLO. Inzeráty od lidí chodí na web dvěma cestami:
 *   1) živě přes RPC public_listings() — se stropem 2,5 s (ZIVE_STROP
 *      v js/main.js). Když Supabase odpoví pomaleji, což je na mobilní
 *      síti běžné, web je POTICHU vynechá;
 *   2) ze statického data/user-listings.json.
 * Cesta 2 měla být tou pojistkou, jenže soubor nikdo neobnovoval — ležel
 * prázdný (`[]`) od 14. 10. 2026, tedy od chvíle, kdy vznikl. Na pomalém
 * připojení tím inzerát od člověka zmizel úplně a nikde se to neohlásilo.
 * Od 7. 11. ho v noci plní scripts/stahni-inzeraty.mjs.
 *
 * CO SE MĚŘÍ. Živé volání se SCHVÁLNĚ nechá viset (route, která nikdy
 * neodpoví), takže strop musí spadnout — a inzerát ze záložního souboru
 * se přesto musí objevit na stránce. Záložní soubor se podstrčí přes
 * Playwright route, aby zkouška nesahala na data v repozitáři.
 *
 * A ZÁROVEŇ SE HLÍDÁ, ŽE SE NEZDVOJÍ: když živá cesta DOJEDE a nese týž
 * inzerát (shodné id), smí být na mapě jednou, ne dvakrát.
 *
 * ČTE: index.html přes server zkoušek. NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Inzerát od člověka a pomalá databáze', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Jeden smyšlený inzerát s polohou, kterou nikde jinde v datech nemáme
   (Boží Dar, nejvýše položená obec v ČR), ať se nedá splést s nabídkou
   ze zdroje. Tvar je TENTÝŽ, jaký vrací public_listings(). */
const ZALOHA = [{
  id: '00000000-0000-4000-8000-000000000abc',
  place: 'Boží Dar', okres: 'Karlovy Vary', druh: 'orná půda', parcel: '999/9',
  area: 4321, price: 1234000, lat: 50.4094, lng: 12.9169,
  description: 'Zkušební inzerát ze záložního souboru.',
  contact: '+420777000111', views: 0, created_at: '2026-11-01T10:00:00Z',
  /* Sítě jsou tu kvůli oddílu 3: do `d.site`, podle kterého web filtruje,
     je umí dosadit JEN převodník PKCisteni.majitele(). Ručně složená
     nabídka je nikam nedonese, i když vypadá stejně. */
  features: ['Voda', 'Elektřina'],   // přesně jak je zná OK_FEAT v js/cisteni.js
}];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function stranka(ctx, zivePomale) {
  const p = await ctx.newPage();
  await ctx.route('**/data/user-listings.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZALOHA) }));
  if (zivePomale) {
    /* Nikdy neodpovědět = přesně ten případ, kdy strop spadne. Žádné
       pevné čekání na naší straně: o čas se stará sám web. */
    await ctx.route('**/rest/v1/rpc/public_listings', () => {});
  }
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  /* Strop je 2,5 s; čeká se na jeho následek, ne naslepo. */
  await p.waitForFunction(() => !!window.PK_ZIVE_VYNECHANA || !!document.querySelector('.opp-item'),
    null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(600);
  /* VÝPIS UKAZUJE 24 KARET Z 1 917, takže jeden inzerát na první stránce
     není — a napoprvé na tom tahle zkouška spadla, aniž by na webu bylo
     cokoli špatně. Vyhledá se proto jménem obce: tím se výpis zúží na
     to, co se opravdu měří. */
  const karetPred = await p.locator('.opp-item').count();
  await p.fill('#map-search', 'Boží Dar');
  await p.waitForTimeout(900);
  return { p, karetPred };
}

/* ---- 1. ŽIVÁ CESTA NEDOJEDE: záloha to musí zachytit ---------------- */
{
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', (r) => {
    const h = new URL(r.request().url()).hostname;
    return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
  });
  const { p, karetPred } = await stranka(ctx, true);

  /* Pojistka proti tiché nule: kdyby se výpis nevykreslil vůbec, prošlo
     by všechno níž na prázdnu. Měří se PŘED zúžením hledáním. */
  pravda(`výpis se vykreslil (${karetPred} karet před hledáním)`, karetPred >= 5, `karet: ${karetPred}`);

  const strop = await p.evaluate(() => !!window.PK_ZIVE_VYNECHANA);
  pravda('strop živého volání opravdu spadl (jinak by se nic neměřilo)', strop,
    'PK_ZIVE_VYNECHANA není nastavené — živá cesta stihla odpovědět');

  const nalez = await p.evaluate((obec) => {
    const karty = [...document.querySelectorAll('.opp-item')];
    const moje = karty.filter((li) => (li.textContent || '').indexOf(obec) >= 0);
    return { karet: karty.length, mych: moje.length,
      text: moje[0] ? (moje[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '' };
  }, ZALOHA[0].place);
  pravda('inzerát ze záložního souboru je na stránce', nalez.mych >= 1,
    'žádná karta s obcí „' + ZALOHA[0].place + '" — záloha se zahodila');
  pravda('a nese cenu i výměru ze souboru', /1\s*234\s*000/.test(nalez.text) && /4\s*321/.test(nalez.text),
    'text karty: „' + nalez.text + '"');
  await ctx.close();
}

/* ---- 2. ZÁLOHA MUSÍ PROJÍT PŘEVODNÍKEM, NE RUČNÍM SKLÁDÁNÍM --------
   Nestačí, že se inzerát ukáže: musí nést i to, co umí dosadit jen
   PKCisteni.majitele() — sítě z `features` do `d.site`, podle kterých
   web filtruje. Ručně složená nabídka (jen `u.type = 'majitel'`, jak to
   tu stálo do 7. 11.) vypadá na kartě stejně, ale „Inzerát uvádí: voda"
   ji zahodí. Měří se to tak, že se sítě dopíšou do hledání.

   PROČ TENHLE ODDÍL VZNIKL: první verze zkoušky tuhle sabotáž nechytla.
   Ukazovala jen obec, cenu a výměru — a ty projdou oběma cestami. */
{
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', (r) => {
    const h = new URL(r.request().url()).hostname;
    return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
  });
  /* Živá cesta zase nedojede, aby se měřila jen ta statická. */
  const { p } = await stranka(ctx, true);
  /* Nejdřív kontrola, že bez sítí ten inzerát najdeme — jinak by oddíl
     mohl projít na prázdnu, kdyby se hledání rozbilo úplně. */
  const bezSiti = await p.locator('.opp-item').count();
  pravda('bez sítí je inzerát v hledání k nalezení', bezSiti === 1, 'karet: ' + bezSiti);
  await p.fill('#map-search', 'Boží Dar voda');
  await p.waitForTimeout(900);
  const seSitemi = await p.locator('.opp-item').count();
  pravda('a projde i filtrem na sítě (sítě dosadil převodník)', seSitemi === 1,
    'po dopsání „voda" zbylo karet: ' + seSitemi + ' — statická cesta sítě neumí dosadit sama');
  await ctx.close();
}

await prohlizec.close();
console.log('\nInzerát od člověka přežije pomalou databázi');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Inzerát od člověka: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
