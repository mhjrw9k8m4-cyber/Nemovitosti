/* Test: když server neodpoví, profil NESMÍ tvrdit, že inzeráty nemáte.
   ==================================================================
   Spuštění: node scripts/test-profil-vypadek.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   NALEZENO. muj-inzerat.html si inzeráty vyžádá a při neúspěchu to
   dvakrát zopakuje. Když ani potřetí nic nepřijde, dosadil do dlaždic
   nuly („0 inzerátů, 0 zhlédnutí") a ukázal prázdný stav „Zatím tu
   žádný inzerát nemáte". V kódu u toho stálo, že nový účet stejně nic
   nemá a pomlčka by působila rozbitě.

   Jenže tahle větev nastane i tomu, kdo inzeráty MÁ — vypadne síť,
   server odpoví 500, vyprší session. Takovému člověku web oznámil, že
   o svůj inzerát přišel. To není kosmetika: je to nepravdivé tvrzení
   o cizím majetku, a u placeného zvýraznění důvod k panice.

   Měří se proto obojí a na stejné stránce:
     A) server odpovídá → prázdný účet se pozná jako prázdný
        („Zatím tu žádný inzerát nemáte", dlaždice 0);
     B) server na my_listings neodpovídá → věta o nenačtení,
        tlačítko „Zkusit znovu", a NIKDE na stránce nesmí stát,
        že žádný inzerát nemáte.

   Bez větve A by test prošel i tehdy, kdyby se prázdný stav ztratil
   úplně a profil hlásil poruchu pořád.
   ================================================================== */
import { chromium } from 'playwright-core';
import { UID_MAJITEL } from './falesna-supabase-chat.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Profil při výpadku', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});

/** Otevře profil přihlášeného majitele; `rozbij` shodí jen my_listings. */
async function profil(rozbij) {
  /* DOTYK SE MUSÍ ŘÍCT: pravidla pro telefon stojí za
     `@media (pointer: coarse)` a `(hover: none)`, ne za šířkou okna,
     takže by se v úzkém okně bez emulace dotyku vykreslilo rozvržení
     monitoru. (Jak se to našlo: bod 3da v docs/co-chybi.md.) */
  const ctx = await browser.newContext({ bypassCSP: true,  viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(([u]) => {
    const t = 'tok-' + u;
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: t, refresh_token: t.replace('tok-', 'ref-'),
      user: { id: u, email: u + '@test.cz' },
    }));
  }, [UID_MAJITEL]);
  let pokusu = 0;
  if (rozbij) {
    await page.route('**/rest/v1/rpc/my_listings*', (r) => { pokusu++; r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"nic"}' }); });
  } else {
    await page.route('**/rest/v1/rpc/my_listings*', (r) => { pokusu++; r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  }
  await page.goto(`${BASE}/muj-inzerat.html`, { waitUntil: 'load' });
  /* Tři pokusy s odstupem 600 a 1 200 ms — ať je po nich. */
  await page.waitForTimeout(4500);
  const v = await page.evaluate(() => {
    const vidno = (id) => {
      const e = document.getElementById(id);
      if (!e) return false;
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0;
    };
    const txt = (id) => { const e = document.getElementById(id); return e ? (e.textContent || '').trim() : null; };
    return {
      prazdny: vidno('mi-empty'), chyba: vidno('mi-chyba'), nacitam: vidno('mi-status'),
      znovu: vidno('mi-znovu'),
      pocet: txt('pf-count'), zhlednuti: txt('pf-views'),
      vetaOPrazdnu: /Zatím tu žádný inzerát nemáte/.test(document.body.innerText),
      panel: vidno('mi-panel'),
    };
  });
  v.pokusu = pokusu;
  await ctx.close();
  return v;
}

/* ---- A) server odpovídá: prázdný účet je prázdný ---------------- */
const a = await profil(false);
pravda('přihlášený člověk vidí profil (jinak se měří odhlášená stránka)', a.panel, 'panel profilu není vidět');
pravda(`server se na inzeráty dotázal (${a.pokusu}×)`, a.pokusu >= 1, 'žádný dotaz — test měří prázdno');
pravda('prázdný účet: „Zatím tu žádný inzerát nemáte"', a.prazdny && a.vetaOPrazdnu,
  `prázdný stav vidět ${a.prazdny}, věta ${a.vetaOPrazdnu}`);
pravda('a hlášení o poruše se neukazuje', !a.chyba, 'ukazuje se „nepovedlo načíst" i když server odpověděl');
pravda(`a dlaždice říkají 0 (${a.pocet} / ${a.zhlednuti})`, a.pocet === '0' && a.zhlednuti === '0',
  `počet „${a.pocet}", zhlédnutí „${a.zhlednuti}"`);

/* ---- B) server mlčí: nesmí tvrdit, že nic nemáte ---------------- */
const b = await profil(true);
pravda(`výpadek: zkusilo se to víc než jednou (${b.pokusu}×)`, b.pokusu >= 3,
  `jen ${b.pokusu} pokusy — opakování se ztratilo`);
pravda('výpadek: ukáže se „Inzeráty se teď nepovedlo načíst"', b.chyba, 'hlášení o poruše není vidět');
pravda('a je u něj tlačítko „Zkusit znovu"', b.znovu, 'není kudy to zopakovat');
pravda('a NIKDE nestojí, že žádný inzerát nemáte', !b.vetaOPrazdnu && !b.prazdny,
  'web po výpadku tvrdí, že inzerát neexistuje — tak se ztrácí důvěra i inzerát');
pravda(`a dlaždice nelžou nulou (${b.pocet} / ${b.zhlednuti})`,
  b.pocet !== '0' && b.zhlednuti !== '0',
  `počet „${b.pocet}", zhlédnutí „${b.zhlednuti}" — nula je tvrzení, ne neznalost`);
pravda('nezůstane viset „Načítám…"', !b.nacitam, 'stránka se zasekla na načítání');

/* ---- C) ODKAZ NA OBNOVU HESLA: TOKEN NESMÍ ZŮSTAT V ADRESE -----
   Odkaz z e-mailu přistane na téhle stránce a nese jednorázový token ve
   FRAGMENTU adresy (#access_token=…). Fragment se na server neposílá,
   takže neskončí v logu ani v Referer — ale v adresním řádku a
   v historii prohlížeče zůstával, dokud člověk nové heslo neuložil. Kdo
   to nedokončil, nechal si token v historii, a ta se u přihlášeného
   prohlížeče synchronizuje mezi zařízeními.
   Měří se obojí: že je adresa hned uklizená A že se token nezahodil —
   uložení nového hesla ho musí poslat serveru. Jedna věc bez druhé je
   buď díra, nebo rozbitá obnova hesla. */
{
  const ctx = await browser.newContext({ bypassCSP: true, locale: 'cs-CZ', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let poslanyToken = null;
  await page.route('**/auth/v1/user', (r) => {
    poslanyToken = (r.request().headers()['authorization'] || '').replace(/^Bearer /, '');
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"u1","email":"a@b.cz"}' });
  });
  await page.goto(`${BASE}/muj-inzerat.html#access_token=TESTTOKEN&type=recovery&refresh_token=R`,
    { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const v = await page.evaluate(() => {
    const vidno = (id) => {
      const e = document.getElementById(id);
      if (!e) return false;
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0;
    };
    return { hash: location.hash, adresa: location.pathname + location.search + location.hash,
      formular: vidno('mi-newpw'), prihlaseni: vidno('mi-auth') };
  });
  pravda('obnova hesla: ukáže se formulář na nové heslo', v.formular,
    `formulář není vidět (adresa „${v.adresa}") — pak se neměří obnova hesla`);
  pravda('obnova hesla: token je z adresy hned pryč', v.hash === '',
    `v adrese zůstalo „${v.hash}" — jednorázový token leží v historii prohlížeče`);
  /* A pořád to musí jít dokončit: token žije v proměnné, ne v adrese. */
  await page.fill('#mi-newpass', 'tajneheslo1');
  await page.click('#mi-savepw');
  await page.waitForTimeout(600);
  pravda('obnova hesla: a uložení nového hesla ten token serveru pošle',
    poslanyToken === 'TESTTOKEN', `server dostal „${poslanyToken}"`);
  await ctx.close();
}

/* --- MAZÁNÍ INZERÁTU MUSÍ ODKLIDIT I FOTKY ------------------------
   delete_listing v databázi maže JEN řádek v `listings`. Fotky
   zůstávaly v úložišti navždy — dokud na počet nebyl strop, byla to
   pomalu rostoucí faktura; od 23. 10. je strop 24 fotek na účet
   (supabase/uloziste-strop.sql), takže se účet může zaseknout na
   fotkách po inzerátech, které už nemá.

   Měří se tři věci: že se jde mazat do ÚLOŽIŠTĚ (ne jen do tabulky),
   že se pošlou cesty těch fotek, co inzerát měl, a že se inzerát smaže
   i tehdy, když úložiště mazání odmítne — člověk chtěl smazat inzerát,
   ne fotky, a o zbytek se postará noční úklid. */
{
  const UID = UID_MAJITEL;
  const FOTKY = [
    'https://projekt.supabase.co/storage/v1/object/public/listing-photos/' + UID + '/prvni.jpg',
    'https://projekt.supabase.co/storage/v1/object/public/listing-photos/' + UID + '/druha.jpg',
  ];
  for (const uloziste of ['přijme', 'odmítne']) {
    const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(([u]) => {
      const t = 'tok-' + u;
      localStorage.setItem('pk_auth', JSON.stringify({
        access_token: t, refresh_token: t.replace('tok-', 'ref-'),
        user: { id: u, email: u + '@test.cz' },
      }));
    }, [UID]);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const poradi = [];
    let telo = '';
    await page.route('**/rest/v1/rpc/my_listings*', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'L-1', place: 'Kolín', okres: 'Kolín', area: 1000, price: 500000,
        photos: FOTKY, views: 3, status: 'approved', created_at: new Date().toISOString() }]),
    }));
    await page.route('**/storage/v1/object/listing-photos*', (r) => {
      poradi.push('uloziste');
      telo = r.request().postData() || '';
      return r.fulfill(uloziste === 'přijme'
        ? { status: 200, contentType: 'application/json', body: '{}' }
        : { status: 403, contentType: 'application/json', body: '{"message":"nope"}' });
    });
    await page.route('**/rest/v1/rpc/delete_listing*', (r) => {
      poradi.push('inzerat');
      return r.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
    });
    await page.goto(`${BASE}/muj-inzerat.html`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const tlacitko = await page.$('[data-del]');
    pravda(`mazání (${uloziste}): tlačítko Smazat je na kartě`, !!tlacitko,
      'bez něj by se mazání neměřilo vůbec');
    if (tlacitko) {
      await tlacitko.click().catch(() => {});
      await page.waitForTimeout(1800);
    }
    pravda(`mazání (${uloziste}): fotky se mažou v úložišti, ne jen v tabulce`,
      poradi.indexOf('uloziste') >= 0, 'na úložiště se vůbec nešlo');
    pravda(`mazání (${uloziste}): a dřív než se smaže inzerát`,
      poradi.indexOf('uloziste') >= 0 && poradi.indexOf('uloziste') < poradi.indexOf('inzerat'),
      'pořadí volání: ' + (poradi.join(' → ') || '(žádné)'));
    pravda(`mazání (${uloziste}): pošlou se cesty obou fotek`,
      /prvni\.jpg/.test(telo) && /druha\.jpg/.test(telo) && !/object\/public/.test(telo),
      'tělo: ' + telo.slice(0, 160));
    pravda(`mazání (${uloziste}): inzerát se smaže`, poradi.indexOf('inzerat') >= 0,
      'delete_listing se nezavolal — fotky pryč a inzerát zůstal');
    await ctx.close();
  }
}

await browser.close();
console.log('\nProfil při výpadku serveru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Profil při výpadku: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
