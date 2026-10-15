// Test: pomalá databáze nesmí zdržet výpis nabídek.
//
// Spuštění: node scripts/test-zive-strop.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ. Úvodní stránka skládá výpis z pěti zdrojů najednou a čtyři z nich
// jsou soubory z našeho serveru. Pátý je dotaz do databáze na inzeráty
// od majitelů — tedy do cizí služby, která má na bezplatném tarifu
// studený start. Dokud stál v řadě jako ostatní, neukázala se do jeho
// odpovědi ani jedna z 1 930 nabídek, které už dávno ležely v prohlížeči.
//
// Naměřeno před opravou (telefon 390 px, slabá linka, procesor ×4):
//   databáze mlčí  5 s → první nabídka za  9 187 ms
//   databáze mlčí 20 s → první nabídka za 23 686 ms
//   databáze mlčí vůbec → první nabídka NIKDY (fetch bez stropu neskončí)
//
// Tenhle test staví databázi do obou poloh, které bolí: pomalá a němá.
// Měří se jedna věcná otázka — ukáže web nabídky, které už má?
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Strop v js/main.js je 3 000 ms. Mez je 12 000: tenhle test běží
   s nezpomaleným procesorem, ale ve sdílené sadě vedle dalších
   prohlížečů, takže pevné „3 000 + chvilka" by padalo na zatížení
   stroje, ne na webu. I tak je o deset sekund níž než stav před
   opravou u němé databáze (nikdy). */
const MEZ = 12000;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nPomalá databáze nedrží výpis');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Strop na živé inzeráty: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});

/** Otevře úvodní stránku s databází, která se chová podle `jak`. */
async function zkus(jak) {
  /* SERVISNÍ PRACOVNÍK ZAKÁZANÝ: tenhle test podstrkuje odpovědi přes
     ctx.route a skrz pracovníka by se k požadavkům nedostal (CLAUDE.md). */
  const ctx = await prohlizec.newContext({ serviceWorkers: 'block', locale: 'cs-CZ' });
  await ctx.route('**://*.supabase.co/**', async (r) => {
    if (jak === 'nema') return;                       // odpověď nikdy nepřijde
    if (jak === 'pomala') await new Promise((x) => setTimeout(x, 8000));
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'commit' });
  let ms = null;
  try {
    await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
      null, { timeout: MEZ });
    ms = Date.now() - t0;
  } catch (e) { /* nestihlo se */ }
  const vynechano = await p.evaluate(() => !!window.PK_ZIVE_VYNECHANA).catch(() => false);
  await ctx.close();
  return { ms, vynechano };
}

try {
  const rychla = await zkus('rychla');
  pravda('při rychlé databázi se výpis ukáže', rychla.ms !== null,
    `nabídky se do ${MEZ} ms neukázaly vůbec`);
  pravda('a nic se přitom nevynechává',
    rychla.ms === null || rychla.vynechano === false,
    'příznak PK_ZIVE_VYNECHANA je nastavený, i když databáze odpověděla včas');

  const pomala = await zkus('pomala');
  pravda(`při databázi, která mlčí 8 s, se výpis ukáže do ${MEZ} ms`,
    pomala.ms !== null, `nabídky se do ${MEZ} ms neukázaly`);
  pravda('a web si drží, že živé inzeráty vynechal',
    pomala.vynechano === true,
    'příznak PK_ZIVE_VYNECHANA chybí — buď se nepočkalo, nebo se to nikde nepozná');

  const nema = await zkus('nema');
  pravda(`a i když databáze neodpoví VŮBEC, výpis se ukáže do ${MEZ} ms`,
    nema.ms !== null, 'nabídky se neukázaly — fetch bez stropu nikdy neskončí');
  pravda('a taky se to pozná', nema.vynechano === true,
    'příznak PK_ZIVE_VYNECHANA chybí');

  zpravy.push(`  · naměřeno: rychlá ${rychla.ms} ms, pomalá ${pomala.ms} ms, němá ${nema.ms} ms`);
} catch (e) {
  chyb++;
  zpravy.push('  ✕ test spadl: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();
hotovo();
