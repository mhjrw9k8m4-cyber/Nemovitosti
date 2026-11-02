// Test: hláška o nových pozemcích jen tomu, kdo si hlídání nastavil.
//
// Spuštění: node scripts/test-hlaska-hlidani.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// PROČ VZNIKL. Úvodní stránka hlásila „Ve vašem okolí přibyly 3 pozemky
// od minule" na základě místa, které si web ukládal SÁM: enterNearAt()
// zapsal „moje místo" při každém vstupu do okolí, tedy i při jednom
// klepnutí do mapy nebo při nalezení podle IP. Majitel 2. 11.: „nechápu,
// jak se to web dozvěděl, když tam nemám nastavené hlídání ani nic
// takového." Web mluvil, jako by si člověk něco nastavil.
//
// Co se tu hlídá — a proč všechno tohle, ne jen „hláška se ukáže":
//  • ODHLÁŠENÉMU SE NEOZVE A ANI SE NIKAM NEVOLÁ. To je to podstatné.
//    Samotné „neukáže se" by splnil i kód, který se na hlídání zeptá
//    a výsledek zahodí — a to je pořád dotaz za každého návštěvníka.
//  • PŘIHLÁŠENÝ BEZ HLÍDÁNÍ taky nedostane nic. Mít účet není totéž
//    jako říct si o hlášky; tohle je ta hranice, o kterou šlo.
//  • PŘIHLÁŠENÝ S HLÍDÁNÍM hlášku dostat MUSÍ, jinak se funkce
//    nezúžila, ale zrušila. A musí v ní být počet a cesta k němu.
//  • MODUL S VÝPOČTEM SE DOTAHUJE JEN TOMU, KDO HLÍDÁNÍ MÁ. Bez téhle
//    kontroly by se 5,5 kB stahovalo i lidem, pro které v nich je
//    jediné `return`.
/* SERVISNÍ PRACOVNÍK VYPNUTÝ: sw.js volá `skipWaiting()` i `clients.claim()`,
   takže by převzal i právě načtenou stránku a obsluhoval `config.js` sám —
   podstrčení přes `ctx.route` by přestalo platit. (Viz CLAUDE.md.) */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Hláška o hlídání', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nHláška o hlídání na úvodní stránce');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Hláška o hlídání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Účty falešného serveru: „majitel" má jedno hlídání (okres Tábor),
   „zájemce" nemá žádné. Oba stavy jsou tedy k mání bez toho, aby si
   zkouška hlídání sama ukládala. */
const UCTY = {
  majitel: { access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } },
  zajemce: { access_token: 'tok-zajemce', refresh_token: 'ref-zajemce',
    user: { id: '22222222-2222-4222-8222-222222222222', email: 'zajemce@test.cz' } },
};

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

/** Načte úvodní stránku v daném přihlášení a vrátí, co se stalo. */
async function navsteva(kdo) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  /* config.js míří na OSTROU Supabase. Bez podstrčení by zkouška volala
     do produkce — a protože je ze sandboxu nedostupná, „neprošla" by
     z úplně jiného důvodu, než co měří. */
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200,
    contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';`
      + 'window.PK_MAIL_ZAPNUTO=false;' }));
  await ctx.addInitScript((u) => {
    if (u) localStorage.setItem('pk_auth', JSON.stringify(u));
  }, kdo ? UCTY[kdo] : null);
  const p = await ctx.newPage();
  const dotazy = [], moduly = [], chybyJs = [];
  p.on('request', (r) => {
    const u = r.url();
    if (/\/rpc\/my_searches\b/.test(u)) dotazy.push('my_searches');
    if (/nove-pozemky\.js/.test(u)) moduly.push('nove-pozemky');
  });
  p.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 120)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  /* Hláška se schválně ozývá až po prvním vykreslení (dva rámy a pak
     síť), takže se čeká na její TEXT, ne na pevný čas. Na prvek čekat
     nejde: hlásná oblast na stránce leží od začátku, jen prázdná —
     `waitForSelector` by se vrátil hned a zkouška by u všech tří stavů
     naměřila prázdno. (Naměřeno: právě takhle napoprvé spadla.)
     Když hláška nepřijde, čekání vyprší a vrátí se prázdno — což je
     u dvou ze tří stavů ten správný výsledek. */
  let text = '';
  try {
    await p.waitForFunction(() => {
      const t = document.querySelector('.toast, #toast');
      return !!(t && (t.textContent || '').trim());
    }, null, { timeout: 8000 });
    text = await p.evaluate(() => {
      const t = document.querySelector('.toast, #toast');
      return t ? (t.textContent || '').trim() : '';
    });
  } catch (e) { text = ''; }
  const odkaz = await p.evaluate(() => {
    const t = document.querySelector('.toast, #toast');
    if (!t) return '';
    const b = t.querySelector('button, a');
    return b ? (b.textContent || '').trim() : '';
  });
  await ctx.close();
  return { dotazy, moduly, chybyJs, text, odkaz };
}

const odhlaseny = await navsteva(null);
pravda('odhlášenému se žádná hláška o hlídání neozve',
  !/[Hh]lídání/.test(odhlaseny.text), `stálo tam „${odhlaseny.text}"`);
pravda('a hlavně se kvůli ní nikam nevolá',
  odhlaseny.dotazy.length === 0, `dotazů na hlídání: ${odhlaseny.dotazy.length}`);
pravda('a nestahuje se ani modul s výpočtem',
  odhlaseny.moduly.length === 0, `stáhlo se: ${odhlaseny.moduly.join(', ')}`);
pravda('a stránka přitom nespadne', odhlaseny.chybyJs.length === 0, odhlaseny.chybyJs[0]);

const bezHlidani = await navsteva('zajemce');
pravda('přihlášený BEZ hlídání taky nic nedostane',
  !/[Hh]lídání/.test(bezHlidani.text), `stálo tam „${bezHlidani.text}"`);
pravda('ale zeptat se na hlídání se smí (účet ho mít může)',
  bezHlidani.dotazy.length === 1, `dotazů: ${bezHlidani.dotazy.length}`);
pravda('a modul se mu nestahuje — nebylo by co počítat',
  bezHlidani.moduly.length === 0, `stáhlo se: ${bezHlidani.moduly.join(', ')}`);

const sHlidanim = await navsteva('majitel');
pravda('kdo hlídání MÁ, hlášku dostane',
  /[Hh]lídání/.test(sHlidanim.text), `stálo tam „${sHlidanim.text}"`);
pravda('a je v ní počet, ne jen „něco je nového"',
  /\d/.test(sHlidanim.text), `stálo tam „${sHlidanim.text}"`);
pravda('a vede k tomu tlačítkem', /[Uu]kázat/.test(sHlidanim.odkaz),
  `na tlačítku stojí „${sHlidanim.odkaz}"`);
pravda('a modul s výpočtem se dotáhl až teď',
  sHlidanim.moduly.length >= 1, 'modul se nestáhl vůbec');
pravda('a stránka přitom nespadne', sHlidanim.chybyJs.length === 0, sHlidanim.chybyJs[0]);

/* MĚŘIDLO: tři stavy se opravdu lišily. Kdyby falešný server přestal
   hlídání vracet, všechny tři by vyšly „bez hlášky" a zkouška by byla
   zelená, přesto že neměří nic. */
pravda('a tři stavy se opravdu rozešly (kontrola měřidla)',
  sHlidanim.text !== odhlaseny.text,
  `s hlídáním „${sHlidanim.text}", odhlášený „${odhlaseny.text}"`);

await prohlizec.close();
hotovo();
