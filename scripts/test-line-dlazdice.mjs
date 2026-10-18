// Test: letecké náhledy na kartách se stahují až před očima.
//
// Spuštění: node scripts/test-line-dlazdice.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TOHLE HLÍDAT. Každá karta nabídky má letecký náhled poskládaný
// z dlaždic serveru Esri (js/snimek.js). Naměřeno 15. 10. na displeji
// 390 px: úvodní stránka má 24 náhledů a nad ohybem je z nich JEDEN.
// Dokud se adresy dlaždic psaly rovnou do značky, objednal si telefon
// při načtení stránky 226 dlaždic (karty se vykreslují dvakrát — nejdřív
// ze záložních dat, pak z opportunities.json), tedy při 20 kB na
// dlaždici přes 4,5 MB cizích obrázků pro nabídky, na které nikdo
// nedojel. Adresa proto čeká v `data-href` a doplní se, až se náhled
// přiblíží k oknu.
//
// Tři tiché chyby, kvůli kterým tenhle test je:
//  1. VRÁTIT ADRESU DO ZNAČKY. Stačí napsat zpátky href="" a je to jako
//     dřív — na stránce se přitom nepozná vůbec nic, jen účet za data.
//  2. ZAPOMENOUT PROBUDIT. Opačná chyba: dlaždice zůstanou v data-href
//     navždy a místo náhledů jsou tmavé čtverce. Proto se tu roluje až
//     na konec výpisu a čeká se, že náhledy adresu DOSTANOU.
//  3. LOADING="LAZY" NA <image>. Do SVG se atribut nedá — platí jen pro
//     HTML <img>. Kdyby se někdo spolehl na něj a `data-href` zrušil,
//     stahovalo by se zase všechno; proto se tu počítají POŽADAVKY,
//     ne jen atributy.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';

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
  console.log('\nLíné letecké náhledy');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Líné dlaždice: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Kolik dlaždic se smí objednat, než se vůbec zaroluje. Není to nula:
   náhledy blízko okna se objednat MAJÍ (viz chyba 2 výš) a rozpětí
   hlídače je 600 px, takže pár jich spadne dovnitř. Naměřeno 32;
   hranice 80 nechává místo na jiné rozvržení a přitom zdaleka
   nepropustí stav „stahuje se všechno" (226). */
const STROP_PRED_ROLOVANIM = 80;

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* DOTYK MUSÍ BÝT ZAPNUTÝ. Pravidla pro telefon stojí na
     `pointer: coarse`, ne na šířce okna — bez `hasTouch` by se při
     390 px vykreslilo rozvržení pro monitor (viz CLAUDE.md).
     SERVISNÍ PRACOVNÍK MUSÍ BÝT ZAKÁZANÝ: tenhle test odposlouchává
     požadavky přes ctx.route a skrz servisního pracovníka by neviděl
     nic (taky CLAUDE.md). */
  const ctx = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', serviceWorkers: 'block',
  });
  const telo = Buffer.alloc(2048, 0x42);
  let dlazdic = 0;
  await ctx.route('**://server.arcgisonline.com/**', (r) => {
    dlazdic++;
    return r.fulfill({ status: 200, contentType: 'image/jpeg', body: telo });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  /* POHLED SE ŽÁDÁ JMÉNEM, AŤ JE VÝCHOZÍ KTERÝKOLI. Úvodní stránka má na
     telefonu dva pohledy nad sebou a vidět je jen jeden; výchozí se za dva
     dny obrátil dvakrát (17. 10. na mapu, 18. 10. zpátky na seznam). Co tahle
     zkouška měří, žije ve VÝPISU — tohle přepnutí je proto pojistka, ne
     reakce na jednu konkrétní podobu webu. */
  await naSeznam(p);
  await p.waitForFunction(() => document.querySelectorAll('svg.opp-map').length > 0, null, { timeout: 30000 });
  await p.waitForTimeout(2500);

  const pred = await p.evaluate(() => ({
    snimku: document.querySelectorAll('svg.opp-map').length,
    ceka: document.querySelectorAll('svg.opp-map image[data-href]').length,
    ma: document.querySelectorAll('svg.opp-map image[href]').length,
  }));
  const dlazdicPred = dlazdic;

  pravda('na stránce jsou letecké náhledy (jinak test nic neměří)',
    pred.snimku >= 10, `náhledů: ${pred.snimku}`);
  pravda(`před rolováním se objednalo nejvýš ${STROP_PRED_ROLOVANIM} dlaždic`,
    dlazdicPred <= STROP_PRED_ROLOVANIM,
    `objednáno ${dlazdicPred} dlaždic z ${pred.snimku} náhledů — adresy se nejspíš píšou rovnou do značky místo do data-href`);
  pravda('část dlaždic ještě čeká v data-href',
    pred.ceka > 0, `čeká ${pred.ceka}, adresu už má ${pred.ma}`);
  pravda('náhledy u okna adresu UŽ dostaly (náhled není tmavý čtverec)',
    pred.ma > 0, `s adresou ${pred.ma} dlaždic — probuzení nefunguje vůbec`);

  /* A teď to hlavní: líné neznamená „nikdy". Roluje se na konec výpisu
     a čeká se, že dlaždice, které čekaly, adresu dostanou. */
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
  const po = await p.evaluate(() => ({
    ceka: document.querySelectorAll('svg.opp-map image[data-href]').length,
    ma: document.querySelectorAll('svg.opp-map image[href]').length,
  }));
  pravda('po zarolování na konec dostaly adresu další dlaždice',
    po.ma > pred.ma && dlazdic > dlazdicPred,
    `s adresou ${pred.ma} → ${po.ma}, objednáno ${dlazdicPred} → ${dlazdic}`);
  pravda('žádná probuzená dlaždice nemá prázdnou adresu',
    await p.evaluate(() => ![...document.querySelectorAll('svg.opp-map image[href]')]
      .some((i) => !i.getAttribute('href'))),
    'probuzení doplnilo prázdný href');

  zpravy.push(`  · naměřeno: ${dlazdicPred} dlaždic při načtení, ${dlazdic} po zarolování na konec`
    + ` (${pred.snimku} náhledů, ${pred.ceka} dlaždic čekalo)`);
  await ctx.close();
} catch (e) {
  chyb++;
  zpravy.push('  ✕ test spadl: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();
hotovo();
