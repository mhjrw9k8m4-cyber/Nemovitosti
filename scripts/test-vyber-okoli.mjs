// Test: okno „Vyberte své okolí" se dá vážně obsloužit.
//
// Spuštění: node scripts/test-okoli.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Okno dřív umělo JEDINOU věc: klepnout do mapy. Komentář nad funkcí
// otevriVyberMista() přitom slibuje „výběr kraje, hledání obce, posuvník
// okruhu a živý počet" — a hledání obce v okně nebylo. Bez něj je to
// nepoužitelné: při pohledu na celou republiku má desetikilometrový
// okruh asi tři pixely, takže klepnutím se člověk trefí do okresu, ne do
// svého okolí.
//
// Co se tu hlídá, a proč právě to:
//  • Našeptávač stojí NAD mapou, ne pod ní. Napoprvé měl z-index 5,
//    ale Leaflet maluje své panely na 400 ve stejné vrstvě — návrhy
//    skončily pod plátnem a mapa klepnutí na ně spolkla. Naměřeno:
//    klik na první návrh vypršel po 30 s, plátno ho zachytilo.
//  • Napsaná obec vede na SVÉ souřadnice, ne někam do kraje.
//  • Počet v okně je PRAVDA: po potvrzení musí být ve výpisu přesně
//    tolik karet, kolik okno slíbilo.
//  • Odmítnutá poloha něco ŘEKNE. Dřív se jen rozsvítilo tlačítko a
//    člověk nevěděl, jestli se něco děje.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const TELEFON = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nOkno „Vyberte své okolí"');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Výběr okolí: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

/* Klepnutí, které se nepovede, nesmí test SHODIT — jinak zmizí i zprávy
   o tom, co se už naměřilo, a zůstane jen hláška z playwrightu. Přesně
   to se stalo při zkoušce sabotáže: návrhy spadly pod plátno mapy, klik
   vypršel po 30 s a výsledek testu se vůbec nevypsal. */
async function klikni(p, sel, popis) {
  try { await p.click(sel, { timeout: 5000 }); return true; }
  catch (e) {
    chyb++; zpravy.push(`  ✕ ${popis}\n      klepnutí na ${sel} se nepovedlo: ${String(e).split('\n')[0]}`);
    return false;
  }
}

/* Otevře hlavní stránku a v ní okno výběru. Vrací stránku, nebo null —
   bez okna se nedá měřit nic a test to musí říct, ne spadnout. */
async function otevri(ctx) {
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const otevirac = await p.$('#map-near');
  if (!otevirac) return { p, chybyJs, otevreno: false };
  await otevirac.scrollIntoViewIfNeeded();
  await otevirac.click();
  await p.waitForTimeout(1200);
  return { p, chybyJs, otevreno: !!(await p.$('.vm-panel')) };
}

/* ---- 1) okno vůbec je, a má čím hledat ---- */
let slibenyPocet = null;
{
  const ctx = await prohlizec.newContext(TELEFON);
  const { p, chybyJs, otevreno } = await otevri(ctx);
  // PŘEDPOKLAD: bez otevřeného okna jsou všechny další kontroly bezcenné
  pravda('„Pozemky v okolí" otevře okno výběru', otevreno,
    'na stránce po klepnutí není .vm-panel — další kontroly by prošly naprázdno');
  if (!otevreno) { await ctx.close(); await prohlizec.close(); hotovo(); }

  const je = await p.evaluate(() => ({
    pole: !!document.querySelector('#vm-q'),
    gps: !!document.querySelector('#vm-gps'),
    navrhy: !!document.querySelector('#vm-navrhy'),
    mapa: typeof window.PK_VM_MAPA === 'object',
  }));
  pravda('a v něm je pole na napsání obce', je.pole,
    'okno slibuje „hledání obce", ale vstupní pole #vm-q v něm není');
  pravda('a tlačítko „Moje poloha"', je.gps, '#vm-gps v okně chybí');
  pravda('a seznam na našeptané obce', je.navrhy, '#vm-navrhy v okně chybí');
  pravda('a mapa výběru je k dispozici', je.mapa, 'window.PK_VM_MAPA není objekt');

  /* ---- 2) našeptávač: dvě písmena nestačí na nic, tři na obec ---- */
  await p.fill('#vm-q', 'T');
  await p.waitForTimeout(400);
  pravda('jedno písmeno nic nenašeptává (šest návrhů z tisíce míst je k ničemu)',
    await p.evaluate(() => document.querySelector('#vm-navrhy').hidden),
    'seznam návrhů je otevřený už po jednom znaku');

  await p.fill('#vm-q', 'Tišnov');
  await p.waitForTimeout(500);
  const n = await p.evaluate(() => {
    const ul = document.querySelector('#vm-navrhy');
    return { hidden: ul.hidden, pocet: ul.querySelectorAll('li').length,
      prvni: (ul.querySelector('li b') || {}).textContent || '',
      cislo: (ul.querySelector('li i') || {}).textContent || '' };
  });
  pravda('napsaná obec se našeptá', !n.hidden && n.pocet > 0, JSON.stringify(n));
  pravda('a je to ta obec, ne něco podobného', n.prvni === 'Tišnov', 'první návrh: ' + n.prvni);
  pravda('a stojí u něj, kolik nabídek tam je', /^\d+$/.test(n.cislo.trim()) && +n.cislo > 0,
    'u návrhu není počet nabídek: „' + n.cislo + '"');
  pravda('návrhy se našeptávají jen z míst, kde NĚCO JE (žádná nula)',
    await p.evaluate(() => [...document.querySelectorAll('#vm-navrhy li i')]
      .every((i) => +i.textContent.trim() > 0)),
    'některý návrh má nulu nabídek — vede na prázdnou mapu');

  /* ---- 3) návrhy stojí NAD mapou (jinak je mapa spolkne) ---- */
  const vrstvy = await p.evaluate(() => {
    const li = document.querySelector('#vm-navrhy li');
    const r = li.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const nahore = document.elementFromPoint(x, y);
    return { nasel: !!nahore, jeNavrh: !!(nahore && nahore.closest('#vm-navrhy')),
      kdo: nahore ? (nahore.className || nahore.tagName) : null,
      sirka: Math.round(r.width), vyska: Math.round(r.height) };
  });
  // PŘEDPOKLAD: návrh musí mít rozměr, jinak se na jeho střed nedá klepnout
  pravda('návrh je dost velký, aby se na něj dalo klepnout', vrstvy.sirka > 40 && vrstvy.vyska >= 44,
    `návrh je ${vrstvy.sirka}×${vrstvy.vyska} px`);
  pravda('a uprostřed návrhu je OPRAVDU návrh, ne plátno mapy', vrstvy.jeNavrh,
    'na středu návrhu leží „' + String(vrstvy.kdo) + '" — klepnutí půjde tam, ne do výběru');

  /* ---- 4) výběr obce přenese mapu na tu obec ---- */
  const kliklo = await klikni(p, '#vm-navrhy li', 'na návrh se dá klepnout');
  if (!kliklo) { await ctx.close(); await prohlizec.close(); hotovo(); }
  await p.waitForTimeout(1500);
  const po = await p.evaluate(() => {
    const c = window.PK_VM_MAPA.getCenter();
    return { lat: c.lat, lng: c.lng,
      navrhySkryte: document.querySelector('#vm-navrhy').hidden,
      pole: document.querySelector('#vm-q').value,
      pocet: document.querySelector('#vm-pocet').textContent.trim(),
      okZhasle: document.querySelector('#vm-ok').disabled };
  });
  // Tišnov leží na 49,349 / 16,425. Deset kilometrů je tolerance, do které
  // se vejde medián nabídek po obci, ale ne vedlejší okres.
  const km = Math.hypot((po.lat - 49.3487) * 111, (po.lng - 16.4245) * 72);
  pravda('mapa se přenese na vybranou obec', km < 10,
    `střed výběru je ${km.toFixed(1)} km od Tišnova (${po.lat.toFixed(3)}/${po.lng.toFixed(3)})`);
  pravda('a seznam návrhů po výběru zmizí', po.navrhySkryte, 'návrhy zůstaly otevřené přes mapu');
  pravda('a v poli stojí, co je vybrané', po.pole === 'Tišnov', 'v poli je: „' + po.pole + '"');
  pravda('a dá se potvrdit', po.okZhasle === false, 'tlačítko „Zobrazit pozemky" zůstalo zhasnuté');
  slibenyPocet = (po.pocet.match(/^(\d+)/) || [])[1];
  pravda('a okno řekne, kolik pozemků v okruhu je', !!slibenyPocet, 'počet v okně: „' + po.pocet + '"');

  /* ---- 5) slíbený počet je PRAVDA ---- */
  if (!await klikni(p, '#vm-ok', 'výběr se dá potvrdit')) { await ctx.close(); await prohlizec.close(); hotovo(); }
  await p.waitForTimeout(2500);
  const vysledek = await p.evaluate(() => ({
    zavreno: !document.querySelector('.vm-panel'),
    karet: document.querySelectorAll('.opp-item').length,
  }));
  pravda('potvrzením se okno zavře', vysledek.zavreno, 'okno zůstalo otevřené');
  pravda('a ve výpisu je přesně tolik pozemků, kolik okno slíbilo',
    slibenyPocet && vysledek.karet === +slibenyPocet,
    `okno slíbilo ${slibenyPocet}, ve výpisu je ${vysledek.karet}`);
  pravda('a nic se u toho v prohlížeči nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

/* ---- 6) povolená poloha mapu přenese ---- */
{
  const ctx = await prohlizec.newContext({ ...TELEFON, permissions: ['geolocation'],
    geolocation: { latitude: 50.0755, longitude: 14.4378 } });
  const { p, otevreno } = await otevri(ctx);
  if (otevreno) {
    await klikni(p, '#vm-gps', 'na „Moje poloha" se dá klepnout');
    await p.waitForTimeout(3000);
    const v = await p.evaluate(() => {
      const c = window.PK_VM_MAPA.getCenter();
      return { lat: c.lat, lng: c.lng, ok: !document.querySelector('#vm-ok').disabled };
    });
    const km = Math.hypot((v.lat - 50.0755) * 111, (v.lng - 14.4378) * 72);
    pravda('„Moje poloha" přenese výběr na skutečnou polohu', km < 3,
      `střed je ${km.toFixed(1)} km od zadané polohy`);
    pravda('a poloha se počítá za ukázané místo, takže se dá potvrdit', v.ok,
      'tlačítko „Zobrazit pozemky" zůstalo po zjištění polohy zhasnuté');
  } else {
    pravda('„Moje poloha" přenese výběr na skutečnou polohu', false, 'okno se neotevřelo');
  }
  await ctx.close();
}

/* ---- 7) odmítnutá poloha není ticho ---- */
{
  const ctx = await prohlizec.newContext(TELEFON);
  const p0 = await ctx.newPage();
  await p0.close();
  await ctx.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) => err({ code: 1, message: 'denied' });
  });
  const { p, otevreno } = await otevri(ctx);
  if (otevreno) {
    const pred = await p.evaluate(() => document.querySelector('#vm-pocet').textContent.trim());
    await klikni(p, '#vm-gps', 'na „Moje poloha" se dá klepnout i podruhé');
    await p.waitForTimeout(1500);
    const v = await p.evaluate(() => ({
      zprava: document.querySelector('#vm-pocet').textContent.trim(),
      gpsZhasle: document.querySelector('#vm-gps').disabled,
      ziva: document.querySelector('#vm-pocet').getAttribute('aria-live'),
    }));
    pravda('odmítnutá poloha to NAPÍŠE, nezůstane ticho', v.zprava !== pred && /polo/i.test(v.zprava),
      'po odmítnutí stojí v okně pořád: „' + v.zprava + '"');
    pravda('a řekne i náhradní cestu (napsat obec nebo klepnout do mapy)',
      /obec|mapu/i.test(v.zprava), 'zpráva: „' + v.zprava + '"');
    pravda('a tlačítko polohy nezůstane zamrzlé', v.gpsZhasle === false,
      '#vm-gps zůstalo disabled — podruhé už nejde zkusit');
    pravda('a odečítač se to dozví (políčko je aria-live)', v.ziva === 'polite',
      'aria-live u #vm-pocet: ' + v.ziva);
  } else {
    pravda('odmítnutá poloha to NAPÍŠE, nezůstane ticho', false, 'okno se neotevřelo');
  }
  await ctx.close();
}

await prohlizec.close();
hotovo();
