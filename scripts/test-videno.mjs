// Test: „tenhle pozemek už jsem otevřel".
//
// Spuštění: node scripts/test-videno.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Výpis má přes dva tisíce nabídek a lidé se k němu VRACEJÍ — hlídání
// pošle upozornění, člověk proroluje stejný seznam a znovu otevírá, co
// už viděl. Bez značky to nejde poznat: karty vypadají při každé
// návštěvě stejně.
//
// Hlídá se i to, čím se ta značka stát NESMÍ:
//  • Není to „prodáno" ani „nezajímavé". Karta se proto nesmí stmavovat
//    a pořadí se nesmí měnit — kdo si pozemek otevřel dvakrát, mohl ho
//    mít rád. Značka má ušetřit druhé klepnutí, ne radit.
//  • Nesmí růst donekonečna: localStorage má kolem 5 MB na celý web
//    a sdílí se se vším ostatním, co si web pamatuje.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  console.log('\nZnačka „už otevřeno"');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Už otevřeno: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

/* ---- 1) celá cesta: otevřít pozemek → vrátit se → vidět značku ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  pravda('modul „už otevřeno" je na stránce výpisu',
    await p.evaluate(() => typeof window.PKVideno === 'object'),
    'window.PKVideno není — js/videno.js se nenačetlo');

  const pred = await p.evaluate(() => ({
    znacek: document.querySelectorAll('.opp-videne').length,
    karet: document.querySelectorAll('.opp-item').length,
  }));
  // PŘEDPOKLAD: bez karet by se nedalo měřit nic, a se značkami předem by
  // kontrola „po otevření jich přibylo" prošla naprázdno
  pravda('výpis má karty a žádná ještě není označená', pred.karet > 3 && pred.znacek === 0,
    `karet ${pred.karet}, značek ${pred.znacek}`);
  if (!(pred.karet > 3)) { await prohlizec.close(); hotovo(); }

  const misto = await p.evaluate(() =>
    document.querySelector('.opp-item .opp-place').textContent.trim());
  await p.click('.opp-item');
  await p.waitForTimeout(2500);
  pravda('klepnutí otevře stránku pozemku', /pozemek\.html|pozemek-/.test(p.url()),
    p.url());
  pravda('a otevření se zapamatuje', await p.evaluate(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem('pk_otevrene_v1') || '{}')).length === 1; }
    catch (e) { return false; }
  }), 'v pk_otevrene_v1 není po otevření právě jeden záznam');

  await p.goBack();
  await p.waitForTimeout(3000);
  const po = await p.evaluate(() => {
    const li = document.querySelector('.opp-item.je-videne');
    const z = document.querySelectorAll('.opp-videne');
    const prvni = document.querySelector('.opp-item');
    return { znacek: z.length, text: z[0] ? z[0].textContent.trim() : null,
      uKtere: li ? li.querySelector('.opp-place').textContent.trim() : null,
      pruhlednost: li ? getComputedStyle(li).opacity : null,
      prvniJeStejna: prvni ? prvni.querySelector('.opp-place').textContent.trim() : null,
      titulek: z[0] ? z[0].getAttribute('title') : null };
  });
  pravda('po návratu je označená právě jedna karta', po.znacek === 1, `značek: ${po.znacek}`);
  pravda('a je to ta, kterou člověk otevřel', (po.uKtere || '').indexOf(misto) === 0,
    `otevřel „${misto}", označeno „${po.uKtere}"`);
  pravda('a stojí na ní, co to znamená', /otevřen/i.test(po.text || ''), String(po.text));
  pravda('a po najetí se to vysvětlí i slovy', /už otevřeli|už jste/i.test(po.titulek || ''),
    String(po.titulek));
  /* Značka NESMÍ vypadat jako „prodáno": karta se nestmavuje… */
  pravda('označená karta se nestmavuje (není to „prodáno")', po.pruhlednost === '1',
    `průhlednost ${po.pruhlednost}`);
  /* …ani se kvůli ní nepřeskupuje pořadí. */
  pravda('a nepropadne se ve výpisu dolů', po.prvniJeStejna === po.uKtere,
    `první ve výpisu je „${po.prvniJeStejna}", označená „${po.uKtere}"`);
  pravda('nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

/* ---- 2) seznam nesmí růst donekonečna ani pamatovat napořád ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  /* STROP A STÁŘÍ SE MĚŘÍ ZVLÁŠŤ. Napoprvé to bylo v jednom pokusu:
     750 záznamů s dnešním časem plus jeden včerejší — a včerejší vypadl.
     Vypadalo to na chybu v zapomínání, přitom ho správně vytlačil STROP,
     protože 750 novějších bylo před ním. Dva různé důvody ke smazání se
     nedají měřit jedním pokusem. */
  const vStrop = await p.evaluate(() => {
    const V = window.PKVideno;
    const m = {};
    for (let i = 0; i < V.STROP + 150; i++) m['k' + i] = Date.now() - i * 1000;
    localStorage.setItem(V.KLIC, JSON.stringify(m));
    V.oznac({ place: 'Zkouška', parcel: '1', okres: 'Benešov', lat: 49.9, lng: 14.7 });
    const z = JSON.parse(localStorage.getItem(V.KLIC));
    return { strop: V.STROP, po: Object.keys(z).length,
      // nejnovější musí zůstat, nejstarší z přeplněných vypadnout
      nejnovejsiTam: 'k0' in z, nejstarsiPryc: !('k' + (V.STROP + 149) in z) };
  });
  pravda(`seznam se drží na ${vStrop.strop} záznamech`, vStrop.po === vStrop.strop,
    `po úklidu ${vStrop.po}`);
  pravda('a vyhazuje ty NEJSTARŠÍ, ne namátkou',
    vStrop.nejnovejsiTam && vStrop.nejstarsiPryc, JSON.stringify(vStrop));

  const vStari = await p.evaluate(() => {
    const V = window.PKVideno;
    // málo záznamů, ať o výsledku rozhoduje jen stáří, ne strop
    localStorage.setItem(V.KLIC, JSON.stringify({
      prastary: Date.now() - (V.DNI + 30) * 86400000,
      tesnePod: Date.now() - (V.DNI - 5) * 86400000,
      vcerejsi: Date.now() - 2 * 86400000,
    }));
    V.oznac({ place: 'Zkouška', parcel: '1', okres: 'Benešov', lat: 49.9, lng: 14.7 });
    const z = JSON.parse(localStorage.getItem(V.KLIC));
    return { dni: V.DNI, prastaryPryc: !('prastary' in z),
      tesnePodTam: 'tesnePod' in z, vcerejsiTam: 'vcerejsi' in z };
  });
  pravda(`a po ${vStari.dni} dnech zapomíná`, vStari.prastaryPryc,
    'záznam starší než mez v seznamu zůstal');
  // PŘEDPOKLAD: kdyby se mazalo všechno, kontrola výš projde naprázdno
  pravda('ale co je pod mezí, si pamatuje (nemaže se všechno)',
    vStari.vcerejsiTam && vStari.tesnePodTam, JSON.stringify(vStari));
  await ctx.close();
}

/* ---- 3) bez schránky se nesmí nic rozbít ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  /* Soukromé okno, zaplněná schránka, zakázané ukládání — schránka umí
     při zápisu i při čtení vyhodit výjimku. Výpis kvůli tomu nesmí
     zůstat prázdný. */
  await p.addInitScript(() => {
    const vyhod = () => { throw new Error('schránka zakázána'); };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { return { getItem: vyhod, setItem: vyhod, removeItem: vyhod }; },
    });
  });
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const karet = await p.evaluate(() => document.querySelectorAll('.opp-item').length);
  pravda('se zakázanou schránkou se výpis stejně vykreslí', karet > 3, `karet: ${karet}`);
  pravda('a nespadne to', chybyJs.filter((e) => /schránka zakázána/.test(e)).length === 0,
    chybyJs.slice(0, 2).join(' | '));
  await ctx.close();
}

await prohlizec.close();
hotovo();
