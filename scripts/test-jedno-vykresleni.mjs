// Test: web neobnovuje stav, který si sám před chvílí zapsal do adresy.
//
// Spuštění: node scripts/test-jedno-vykresleni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ. js/odkaz.js zapisuje výřez mapy do adresy (#m=šířka,délka,zoom)
// při každé jeho změně — a první taková změna je ustavení mapy při
// startu. Obnova z adresy (obnovZAdresy) běžela AŽ POTOM, takže si web
// obnovoval stav, který si o vteřinu dřív sám napsal: celý výpis se
// překreslil podruhé a mapa se srovnala tam, kde už stála.
//
// Naměřeno (telefon 390 px, slabá linka 1,6 Mb/s + 150 ms, procesor ×4,
// medián z pěti běhů):
//   před opravou  hlavní vlákno zaneprázdněno 2 870 ms, uklidní se v 5 446 ms
//   po opravě     hlavní vlákno zaneprázdněno 2 030 ms, uklidní se v 4 475 ms
//
// Na obrazovce se to nepozná — proto ta zkouška. A proto se měří POČET
// vykreslení, ne čas: čas by na zatíženém stroji kolísal víc než rozdíl,
// který se hlídá.
//
// DRUHÁ POLOVINA JE STEJNĚ DŮLEŽITÁ: sdílený odkaz s výřezem mapy se
// obnovit MUSÍ. Kdyby se opravilo jen to první, web by přestal umět to,
// kvůli čemu ta obnova vznikla.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Překreslení navíc', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nŽádné překreslení navíc');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Překreslení navíc: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});

/** Načte úvodní stránku (volitelně s hashem) a vrátí, co se napočítalo.
    `filtr` = co má v úložišti ležet jako poslední nastavení filtrů. */
async function nacti(hash, filtr) {
  /* DOTYK ZAPNUTÝ: telefonní rozvržení se řídí `pointer: coarse`, ne
     šířkou okna (CLAUDE.md). Procesor se zpomalí čtyřikrát — bez toho
     se start stihne dřív, než si js/odkaz.js vůbec stačí do adresy
     zapsat, a zkouška by prošla ze špatného důvodu (ověřeno: bez
     zpomalení vyšlo jedno vykreslení i s původní vadou). */
  const ctx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(`${BASE}/index.html${hash || ''}`, { waitUntil: 'load', timeout: 60000 });
  if (filtr) {
    /* Úložiště se dá naplnit až z té adresy, pak se stránka načte znovu
       — tím vznikne přesně ta situace, kterou má většina návštěvníků:
       vrací se a filtr z minula v úložišti leží. */
    await p.evaluate((f) => localStorage.setItem('pk_filtr_v1', JSON.stringify(f)), filtr);
    await p.reload({ waitUntil: 'load', timeout: 60000 });
  }
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 });
  await p.waitForTimeout(5000);          // ať doběhne i to, co by přišlo navíc
  const v = await p.evaluate(() => ({
    vykresleni: window.PK_VYKRESLENI || 0,
    zoom: (window.PK_MAPA && window.PK_MAPA.getZoom) ? window.PK_MAPA.getZoom() : null,
    stred: (window.PK_MAPA && window.PK_MAPA.getCenter) ? window.PK_MAPA.getCenter() : null,
    zalozka: (document.querySelector('#map-filters .filter-chip.active') || {}).dataset
      ? document.querySelector('#map-filters .filter-chip.active').getAttribute('data-type') : null,
    cena: (document.getElementById('map-cena') || {}).value || '',
    razeni: (document.getElementById('map-sort') || {}).value || '',
    jenJedenTyp: (function () {
      var t = [...document.querySelectorAll('#opp-list .opp-item .opp-badge')]
        .map(function (b) { return b.className; });
      return t.length > 0 && t.every(function (x) { return /drazba/.test(x); });
    }()),
  }));
  await ctx.close();
  return v;
}

try {
  const cista = await nacti('');
  pravda('při čisté adrese se výpis vykreslí JEDNOU',
    cista.vykresleni === 1,
    `vykreslení: ${cista.vykresleni} — web si nejspíš obnovuje stav, který si sám zapsal do adresy`);

  /* Sdílený odkaz. Zoom 12 je výrazně blíž než výchozí pohled na celou
     republiku (ten vychází kolem 7–9), takže se pozná, že se opravdu
     obnovil, a ne že to tak vyšlo samo. */
  const sdileny = await nacti('#m=49.1951,16.6068,12');
  pravda('sdílený odkaz s výřezem mapy se pořád obnovuje',
    sdileny.zoom === 12,
    `zoom po obnově: ${sdileny.zoom} (čekalo se 12) — oprava rozbila sdílení odkazů`);
  pravda('a je to opravdu to místo z odkazu',
    sdileny.stred && Math.abs(sdileny.stred.lat - 49.1951) < 0.2
      && Math.abs(sdileny.stred.lng - 16.6068) < 0.2,
    `střed po obnově: ${sdileny.stred && sdileny.stred.lat}, ${sdileny.stred && sdileny.stred.lng}`);

  /* ULOŽENÝ FILTR — a to je ta polovina, která tady chyběla.
     Zkouška měřila jen čistou adresu, a obnova uloženého filtru běžela
     o sto řádků za prvním vykreslením, takže se celý výpis kreslil
     podruhé. Jen to nikdo neviděl: bez uloženého filtru se to nestane,
     a kdo si jednou klepne na filtr, má ho uložený napořád.
     Naměřeno (telefon 390 px, procesor ×4, medián ze tří běhů):
     hlavní vlákno strávilo úlohami 2 465 ms s uloženým filtrem proti
     1 938 ms bez něj — pět set milisekund navíc u KAŽDÉHO, kdo se
     vrací. Po opravě 1 957 ms, tedy stejně jako bez filtru.
     DRUHÁ POLOVINA JE STEJNĚ DŮLEŽITÁ: uložený filtr se musí pořád
     obnovit, a to celý — jinak by se „oprava" projevila tak, že web
     zapomíná, co si člověk nastavil. */
  const sFiltrem = await nacti('', { typ: 'drazba', cena: 500000, razeni: 'price_asc' });
  pravda('s uloženým filtrem se výpis taky vykreslí JEDNOU',
    sFiltrem.vykresleni === 1,
    `vykreslení: ${sFiltrem.vykresleni} — obnova filtru běží až po prvním vykreslení`);
  pravda('a uložená záložka se opravdu obnovila', sFiltrem.zalozka === 'drazba',
    `aktivní záložka: ${sFiltrem.zalozka}`);
  pravda('i uložená cena', sFiltrem.cena === '500000', `v poli ceny: „${sFiltrem.cena}"`);
  pravda('i uložené řazení', sFiltrem.razeni === 'price_asc', `v poli řazení: „${sFiltrem.razeni}"`);
  pravda('a ve výpisu jsou jen nabídky toho typu, ne všechny',
    sFiltrem.jenJedenTyp === true, 've výpisu jsou i jiné typy — filtr se obnovil jen v ovládání');

  zpravy.push(`  · naměřeno: čistá adresa ${cista.vykresleni} vykreslení,`
    + ` uložený filtr ${sFiltrem.vykresleni} vykreslení, sdílený odkaz zoom ${sdileny.zoom}`);
} catch (e) {
  chyb++;
  zpravy.push('  ✕ test spadl: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();
hotovo();
