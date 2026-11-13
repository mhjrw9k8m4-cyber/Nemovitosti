// Test: poznámka k pozemku ho uloží mezi vaše — a jen jedním směrem.
//
// Spuštění: node scripts/test-pozn-oblibene.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// PROČ VZNIKL. Majitel 2. 11.: „pokud si někdo napíše poznámku,
// automaticky by se měl pozemek uložit do oblíbených." Kdo si píše, proč
// si pozemek nechává, o něj stojí — a dosud mu zůstal jen uvnitř
// inzerátu: ve výpisu, v porovnání ani v „Uložených" se neobjevil.
//
// Co se tu hlídá — a proč každá z těch věcí:
//  • POZNÁMKA ULOŽÍ. Na stránce pozemku i na kartě rychlého výběru;
//    jsou to dvě různá políčka ve dvou souborech a rozejít se mohou.
//  • A JE TO VIDĚT. Tlačítko musí přepnout na „Uloženo" a políčko to
//    musí napsat. Tiché uložení by byla změna za zády.
//  • JEN JEDNÍM SMĚREM. Smazání poznámky NESMÍ pozemek odebrat
//    z uložených. To je ta polovina, kterou se dá snadno rozbít
//    (stačí podmínku `t.trim()` odstranit) a nikdo si toho nevšimne.
//  • „TENHLE NE" VYHRÁVÁ. Na kartě rychlého výběru poznámka pozemek
//    uloží; kdo kartu potom odmítne, měl by mít pozemek schovaný
//    z výpisu a zároveň uložený — dva protikladné stavy z jednoho
//    sezení. Odvolává se proto to, co přidala poznámka.
//  • A JEN TOHO POZEMKU SE TO TÝKÁ. Rozhodnutí u jedné karty nesmí
//    sahat na pozemky uložené dřív, proto se tu prochází dál.
/* SERVISNÍ PRACOVNÍK VYPNUTÝ: sw.js volá `skipWaiting()` i `clients.claim()`,
   takže by převzal i právě načtenou stránku. (Viz CLAUDE.md.) */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { zivaStranka } from './vzorek-pozemku.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Poznámka a uložené', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nPoznámka pozemek uloží mezi vaše');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Poznámka a uložené: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function kontext(predem) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  if (predem) await ctx.addInitScript((n) => {
    Object.keys(n).forEach((k) => { try { localStorage.setItem(k, n[k]); } catch (e) {} });
  }, predem);
  return ctx;
}
/** Co o pozemcích doopravdy leží v prohlížeči. */
const schranka = (p) => p.evaluate(() => {
  const cti = (k, z) => { try { return JSON.parse(localStorage.getItem(k) || z); } catch (e) { return JSON.parse(z); } };
  return { favs: cti('pk_fav_v1', '[]'), pozn: Object.keys(cti('pk_poznamky_v1', '{}')),
    skryte: cti('pk_skryte_v1', '[]') };
});

/* ---- 1) STRÁNKA POZEMKU ------------------------------------------- */
{
  const stranka = zivaStranka();
  pravda('je na čem měřit — stránka pozemku', !!stranka, 'žádná stránka pozemku v repozitáři');
  if (!stranka) { await prohlizec.close(); hotovo(); }
  const ctx = await kontext(null);
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 120)));
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForSelector('#pz-fav', { timeout: 15000 });

  const pred = await schranka(p);
  pravda('na začátku není uložený ani jeden pozemek (kontrola měřidla)',
    pred.favs.length === 0, `uloženo: ${JSON.stringify(pred.favs)}`);

  /* Políčko je schované za tlačítkem „Přidat poznámku", ať stránka
     zůstane čitelná — klepnout se na ně tedy musí. */
  await p.evaluate(() => {
    const b = document.querySelector('#pz-pozn-vyzva, .pz-pozn-vyzva');
    if (b) b.click();
  });
  await p.fill('#pz-pozn-text', 'Rozbitý plot, majitel volal zpátky.');
  /* Ukládá se po chvíli klidu a při odchodu z pole — tak se to i spustí. */
  await p.evaluate(() => document.querySelector('#pz-pozn-text').blur());
  await p.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('pk_fav_v1') || '[]').length > 0; }
    catch (e) { return false; }
  }, null, { timeout: 8000 }).catch(() => {});

  const poPozn = await schranka(p);
  pravda('poznámka na stránce pozemku ho uloží mezi vaše',
    poPozn.favs.length === 1, `uloženo: ${JSON.stringify(poPozn.favs)}`);
  pravda('a je to TÝŽ pozemek, u kterého se píše',
    poPozn.favs.length === 1 && poPozn.pozn.length === 1 && poPozn.favs[0] === poPozn.pozn[0],
    `uložené ${JSON.stringify(poPozn.favs)} vs. poznámka ${JSON.stringify(poPozn.pozn)}`);
  const btn = await p.evaluate(() => {
    const b = document.getElementById('pz-fav');
    return { on: !!(b && b.classList.contains('on')),
      text: b ? (b.querySelector('span') || {}).textContent || '' : '' };
  });
  pravda('a tlačítko to přizná („Uloženo", ne „Uložit")',
    btn.on && /Uloženo/.test(btn.text), `na tlačítku „${btn.text}", zapnuté: ${btn.on}`);
  const stav = await p.evaluate(() => (document.getElementById('pz-pozn-stav') || {}).textContent || '');
  /* Ptá se na slovo, které je tam NAVÍC. Napoprvé tu stálo
     `/ulož/ && /uložen/` — tím projde i samotné „uloženo", takže
     kontrola neměřila nic a sabotáž přes ni prošla. */
  pravda('a políčko řekne, co se stalo — i to uložení',
    /uložen/i.test(stav) && /přidán/i.test(stav), `stálo tam „${stav}"`);

  /* A TEĎ TA DRUHÁ POLOVINA. */
  await p.fill('#pz-pozn-text', '');
  await p.evaluate(() => document.querySelector('#pz-pozn-text').blur());
  await p.waitForFunction(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')).length === 0; }
    catch (e) { return false; }
  }, null, { timeout: 8000 }).catch(() => {});
  const poSmaz = await schranka(p);
  pravda('smazání poznámky pozemek z uložených NEODEBERE',
    poSmaz.favs.length === 1, `uloženo: ${JSON.stringify(poSmaz.favs)}`);
  pravda('a poznámka je přitom opravdu smazaná (kontrola měřidla)',
    poSmaz.pozn.length === 0, `poznámky: ${JSON.stringify(poSmaz.pozn)}`);
  pravda('a stránka přitom nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}

/* ---- 2) KARTA RYCHLÉHO VÝBĚRU ------------------------------------- */
{
  /* Úvodní obrazovka rychlého výběru se přeskočí jejím vlastním
     záznamem — jinak je políčko poznámky pod ní a nedá se na ně
     klepnout. */
  const ctx = await kontext({ pk_rv_uvod_v1: '1' });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 120)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  /* Přepnutí na seznam přes zkouska-pohled.mjs: ručně psané selektory
     na přepínač nefungují (viz tam). */
  const { naSeznam, otevriNastroje } = await import('./zkouska-pohled.mjs');
  await naSeznam(p);
  /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
     otevření na ně klepnutí nedosáhne. */
  await otevriNastroje(p);
  await p.waitForSelector('#mc-rychly', { timeout: 15000 });
  await p.click('#mc-rychly');
  await p.waitForSelector('#rv-pozn-vyzva', { state: 'visible', timeout: 15000 });

  async function napisPoznamku(text) {
    await p.click('#rv-pozn-vyzva');
    await p.fill('#rv-pozn', text);
    await p.evaluate(() => document.querySelector('#rv-pozn').blur());
    await p.waitForTimeout(1200);
  }

  await napisPoznamku('Krásný výhled, zajet se podívat.');
  const poPozn = await schranka(p);
  pravda('poznámka na kartě rychlého výběru pozemek taky uloží',
    poPozn.favs.length === 1, `uloženo: ${JSON.stringify(poPozn.favs)}`);
  const stavRv = await p.evaluate(() => (document.getElementById('rv-pozn-stav') || {}).textContent || '');
  pravda('a karta to taky řekne', /ulož/i.test(stavRv) && /vaše/i.test(stavRv),
    `stálo tam „${stavRv}"`);

  /* „Tenhle ne" je rozhodnutí a vyhrává. */
  await p.click('#rv-ne');
  await p.waitForTimeout(1500);
  const poNe = await schranka(p);
  pravda('„Tenhle ne" to, co přidala poznámka, odvolá',
    poNe.favs.length === 0, `uloženo: ${JSON.stringify(poNe.favs)}`);
  pravda('a pozemek se opravdu schová (kontrola měřidla)',
    poNe.skryte.length === 1, `skryté: ${JSON.stringify(poNe.skryte)}`);
  /* Poznámka je text člověka, ne náš — ta zůstává. */
  pravda('ale napsaná poznámka zůstane — je jeho, ne naše',
    poNe.pozn.length === 1, `poznámky: ${JSON.stringify(poNe.pozn)}`);

  /* A JEN TÉ JEDNÉ KARTY SE TO TÝKÁ. Druhá karta: poznámka uloží,
     vědomé „Uloženo" to potvrdí, a odmítnutí TŘETÍ karty na to nesmí
     sáhnout. */
  await napisPoznamku('Tenhle se mi zdá dobrý.');
  const poDruhe = await schranka(p);
  pravda('druhá karta se uloží taky', poDruhe.favs.length === 1,
    `uloženo: ${JSON.stringify(poDruhe.favs)}`);
  await p.click('#rv-ano');
  await p.waitForTimeout(1200);
  await p.click('#rv-ne');
  await p.waitForTimeout(1500);
  const poTreti = await schranka(p);
  pravda('a odmítnutí DALŠÍ karty na ni nesahá',
    poTreti.favs.length === 1, `uloženo: ${JSON.stringify(poTreti.favs)}`);
  pravda('a stránka přitom nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}

await prohlizec.close();
hotovo();
