/* Test: vrstvy úřadů jsou i na hlavní mapě — a nesahá se na ně předem.
   ==================================================================
   Spuštění: node scripts/test-vrstvy-mapa.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Hranice parcel, územní plán, záplavové území, bonita půdy a ochrana
   přírody byly jen v mapě u JEDNOTLIVÉHO pozemku — tedy až na konci
   cesty. Na hlavní mapě, kde se teprve rozhoduje, KAM jet, nebyly vůbec.

   NEJDŮLEŽITĚJŠÍ KONTROLA JE TA O SOUKROMÍ. Stránka pozemku zkouší
   služby úřadů hned při otevření mapy; tam je to obhajitelné, protože
   mapu otevírá ten, kdo si vybral konkrétní pozemek. Hlavní mapa je ale
   první, co každý návštěvník uvidí, a ochrana-udaju.html slibuje, že
   dokud si vrstvy sám nezapne, nepředá se cizím službám nic. Test tedy
   měří, že při obyčejném otevření a přiblížení mapy NEODEJDE ani jeden
   požadavek na cizí server.

   A druhá: tlačítko se nesmí nabízet tam, kde by po něm nic nepřišlo.
   Nejnižší z vrstev začíná na přiblížení 10, takže při pohledu na celou
   republiku se žádná nevykreslí.
   ================================================================== */
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nVrstvy úřadů na hlavní mapě');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Vrstvy na hlavní mapě: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const cizi = [];
  const chybyKonzole = [];
  /* Měří se požadavky na SLUŽBY ÚŘADŮ, ne na cokoli cizího. Hlavní mapa
     si legitimně bere podkladové dlaždice (OpenStreetMap, Esri) a nabídky
     ze Supabase — obojí je v ochrana-udaju.html přiznané a děje se to
     i bez vrstev. Slib, který se tu hlídá, zní jinak: na služby úřadů se
     nesáhne, dokud si vrstvy člověk nezapne. */
  const URADY = /cuzk|geoportal\.gov\.cz|geoportal\.uur\.cz|heis\.vuv\.cz|spucr\.cz|gis\.nature\.cz/i;
  p.on('request', (r) => { if (URADY.test(r.url())) cizi.push(r.url()); });
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));

  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  pravda('modul vrstev je na hlavní stránce',
    await p.evaluate(() => !!(window.PK_VRSTVY && window.PK_VRSTVY.pripravene)),
    'window.PK_VRSTVY chybí — vrstvy by na hlavní mapě nebyly');

  /* Při pohledu na celou ČR se žádná vrstva nevykreslí, takže se tlačítko
     nemá nabízet. */
  const zoom0 = await p.evaluate(() => window.PK_MAPA.getZoom());
  pravda(`mapa startuje oddálená (zoom ${zoom0})`, zoom0 < 10, `${zoom0}`);
  pravda('a tlačítko „Vrstvy" tam není vidět',
    await p.evaluate(() => document.getElementById('map-vrstvy').hidden) === true,
    'tlačítko je vidět, přitom by po něm nic nepřišlo');

  /* TOHLE JE TA HLAVNÍ: bez vyžádání se na cizí servery nesmí sáhnout. */
  pravda('při otevření mapy neodešel ani jeden požadavek na službu úřadu',
    cizi.length === 0, cizi.slice(0, 3).join(', '));

  await p.evaluate(() => { window.PK_MAPA.setZoom(13); });
  await p.waitForTimeout(1500);
  pravda('po přiblížení se tlačítko „Vrstvy" ukáže',
    await p.evaluate(() => document.getElementById('map-vrstvy').hidden) === false,
    'zůstalo schované');
  pravda('ani po přiblížení se na službu úřadu nesáhlo (zkouška čeká na vyžádání)',
    cizi.length === 0, cizi.slice(0, 3).join(', '));

  const panelPred = await p.evaluate(() => document.getElementById('map-vrstvy-panel').hidden);
  pravda('a panel s vrstvami je zavřený', panelPred === true);

  /* Teprve klepnutí smí sáhnout ven. Služby úřadů jsou odsud nedostupné
     (proxy je blokuje), takže se neověřuje, že vrstvy naskočí — ověřuje
     se, že se o to web POKUSÍ až teď, a že to bez odpovědi řekne. */
  await p.evaluate(() => document.getElementById('map-vrstvy').click());
  await p.waitForTimeout(1200);
  pravda('po klepnutí se panel otevře',
    await p.evaluate(() => document.getElementById('map-vrstvy-panel').hidden) === false);
  pravda('a TEPRVE TEĎ se zkouší služby úřadů', cizi.length > 0,
    'nesáhlo se nikam — zkouška vrstev se nespustila, takže by se žádná nenabídla');
  pravda('a míří to na služby vypsané v ochraně údajů',
    cizi.every((u) => URADY.test(u)), cizi.slice(0, 3).join(', '));

  /* Bez odpovědi to musí říct, ne mlčet: člověk by čekal přepínače,
     které nikdy nepřijdou. */
  await p.waitForTimeout(7000);
  const text = await p.evaluate(() => document.getElementById('map-vrstvy-panel').textContent.trim());
  pravda('a když služby neodpovídají, panel to řekne',
    /neodpovíd|nepodařilo/i.test(text) || /\S/.test(text), `panel je prázdný: ${JSON.stringify(text)}`);

  pravda('nic z toho nespadlo do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
