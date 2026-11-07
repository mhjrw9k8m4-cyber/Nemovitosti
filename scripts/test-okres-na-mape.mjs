/* Zkouška: „Otevřít okres X na mapě" musí otevřít OKRES, ne kraj.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-okres-na-mape.mjs
 * Volá ji .github/workflows/testy.yml (krok „Okres na mapě").
 *
 * PROČ TO VZNIKLO. Všech 77 okresních stránek mělo v odkazu na mapu
 * `index.html?kraj=<kraj>`. Nápis sliboval okres, mapa dodala celý kraj.
 * Naměřeno 7. 11. na okrese Benešov: stránka nahoře hlásí 35
 * nemovitostí, po klepnutí ukázal výpis 405 a v hlavičce mapy stálo
 * „Středočeský kraj" — tedy jedenáctkrát větší výběr, než na jaký si
 * člověk klepl. Tatáž past byla na krajských stránkách u okresů, které
 * svou stránku nemají: vedle názvu okresu stojí jeho počet, a odkaz
 * přitom vedl na kraj.
 *
 * ČÍSLO NA STRÁNCE JE SLIB. Zkouška proto nesrovnává s pevnou
 * konstantou, která by zestárla s daty, ale se číslem, které si ta
 * KONKRÉTNÍ okresní stránka sama natiskla. Rozejít se nesmí ani
 * o jednu nabídku.
 *
 * TŘI OKRESY, A SCHVÁLNĚ TYHLE. Benešov je okres, který má stejnojmennou
 * obec; Praha-východ a Brno-venkov žádnou takovou obec nemají. Právě na
 * nich by selhalo přiblížení podle NÁZVU (geocodeTownLocal hledá obec),
 * takže rámeček mapy se počítá z nabídek toho okresu — a tyhle dva
 * okresy to hlídají.
 *
 * CO SE MĚŘÍ (na každém okrese):
 *   1. odkaz vede na ?okres=<ten okres>, ne na ?kraj=,
 *   2. počet nad výpisem = číslo, které stránka okresu sama hlásí,
 *   3. nad výpisem je zrušitelný odznak „celý okres X",
 *   4. mapa se opravdu přiblížila (větší zoom než pohled na celou ČR).
 *
 * ČTE: pozemky-okres-*.html a index.html přes server zkoušek. NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Okres na mapě', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const OKRESY = [
  { okres: 'Benešov', soubor: 'pozemky-okres-benesov.html' },
  { okres: 'Praha-východ', soubor: 'pozemky-okres-praha-vychod.html' },
  { okres: 'Brno-venkov', soubor: 'pozemky-okres-brno-venkov.html' },
];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const h = new URL(r.request().url()).hostname;
  return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
});
const p = await ctx.newPage();

/* Pohled na celou ČR je měřítko, proti kterému se poznává, že se mapa
   na okres opravdu přiblížila. Pevné číslo by zestárlo s daty — záběr
   celé ČR se srovnává na rámeček nabídek (fitAllCZ). */
async function zoomZHashe() {
  for (let i = 0; i < 40; i++) {
    const m = /#m=[-0-9.]+,[-0-9.]+,(\d+)/.exec(await p.evaluate(() => location.hash));
    if (m) return parseInt(m[1], 10);
    await p.waitForTimeout(250);
  }
  return null;
}
async function pockejNaVypis() {
  await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
}
const pocetNadVypisem = async () => {
  const t = await p.locator('#map-count, #opp-count, #mvt-count').first().textContent().catch(() => '');
  const m = /(\d[\d\s ]*)/.exec(String(t || ''));
  return m ? parseInt(m[1].replace(/[\s ]/g, ''), 10) : null;
};

await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await pockejNaVypis();
const zoomCR = await zoomZHashe();
pravda(`pohled na celou ČR má změřené přiblížení (${zoomCR})`, zoomCR !== null,
  'v adrese se neobjevil stav mapy #m=…');

for (const { okres, soubor } of OKRESY) {
  await p.goto(`${BASE}/${soubor}`, { waitUntil: 'domcontentloaded' });
  /* Číslo, které stránka sama hlásí v pásu nad výpisem. */
  const slib = await p.evaluate(() => {
    const b = document.querySelector('.okr-cisla .okr-cislo b');
    const m = b ? /(\d[\d\s ]*)/.exec(b.textContent || '') : null;
    return m ? parseInt(m[1].replace(/[\s ]/g, ''), 10) : null;
  });
  pravda(`${okres}: stránka hlásí počet nemovitostí (${slib})`,
    Number.isFinite(slib) && slib > 0, 'číslo se v pásu nenašlo');

  const odkaz = p.locator('.okr-more a').first();
  const href = (await odkaz.getAttribute('href')) || '';
  const cil = 'index.html?okres=' + encodeURIComponent(okres) + '#mapa';
  pravda(`${okres}: odkaz „na mapě" vede na okres, ne na kraj`, href === cil,
    `odkaz: ${href}\n      čekáno: ${cil}`);
  /* Velké tlačítko v oddílu s mapou musí mířit na totéž — dřív byla
     obě místa odvozená z jedné proměnné s krajem, takže se vada
     opakovala dvakrát na stránce. */
  const tlacitko = await p.locator('a.btn-primary[href*="okres="], a.btn-primary[href*="kraj="]').first()
    .getAttribute('href').catch(() => '');
  pravda(`${okres}: a tlačítko „Otevřít na mapě" míří tamtéž`, tlacitko === cil,
    `tlačítko: ${tlacitko}\n      čekáno: ${cil}`);

  await odkaz.click();
  await p.waitForURL(/index\.html/, { timeout: 15000 }).catch(() => {});
  await pockejNaVypis();
  const zoomOkresu = await zoomZHashe();
  const pocet = await pocetNadVypisem();

  pravda(`${okres}: počet nad výpisem sedí s číslem na stránce (${pocet} = ${slib})`,
    pocet === slib, `stránka slibuje ${slib}, mapa ukázala ${pocet}`);

  const odznak = ((await p.locator('.msch[data-misto]').first().textContent().catch(() => '')) || '')
    .replace(/\s+/g, ' ').trim();
  pravda(`${okres}: nad výpisem je zrušitelný odznak „celý okres ${okres}"`,
    odznak.indexOf('celý okres') === 0 && odznak.indexOf(okres) > 0, 'odznak: „' + odznak + '"');

  pravda(`${okres}: mapa se na okres přiblížila (zoom ${zoomOkresu} > ${zoomCR} pro celou ČR)`,
    Number.isFinite(zoomOkresu) && Number.isFinite(zoomCR) && zoomOkresu > zoomCR,
    `zoom okresu ${zoomOkresu}, zoom celé ČR ${zoomCR}`);
}

await prohlizec.close();
console.log('\nOkres na mapě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Okres na mapě: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
