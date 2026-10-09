// Test: soukromá poznámka k pozemku.
//
// Spuštění: node scripts/test-poznamky.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Kdo si vybírá pozemek, obchází jich deset a po týdnu neví, který měl
// rozbitý plot. Web uměl pozemek jen ULOŽIT — tedy ANO/NE, bez jediného
// slova proč.
//
// Hlídá se i to, čím se poznámka stát NESMÍ:
//  • Nesmí tiše mizet. Pole, které si nic nepamatuje, je horší než žádné
//    pole: člověk do něj píše a myslí si, že to má zapsané.
//  • NEPŘIHLÁŠENÉMU nesmí odejít ze zařízení. Tomu stránka slibuje
//    „zůstává jen v tomhle prohlížeči"; kdyby se poznámka přesto
//    odeslala, byla by to lež o soukromí a ještě o cizích lidech
//    („majitel vypadal divně").
//  • PŘIHLÁŠENÉMU odejít MUSÍ — poznámka má být na účtu a vidět
//    i z druhého telefonu. Ale jen když to u políčka doopravdy stojí:
//    hlídá se obojí najednou, protože samo odeslání bez té věty je
//    tentýž rozbitý slib, jen obráceně.
//  • Nesmí růst bez meze. localStorage má kolem 5 MB na celý web
//    a sdílí se s oblíbenými i s hlídáním.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nSoukromá poznámka k pozemku');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Poznámky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}
const stranka = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
pravda('je na čem měřit — stránka pozemku', !!stranka);
if (!stranka) hotovo();

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
/* V textu je schválně nezaměnitelné slovo bez diakritiky. Napoprvé se
   hledalo „Rozbitý plot" — jenže odeslaný text je procentně zakódovaný
   (Rozbit%C3%BD) a sabotáž „pošli poznámku na server" tím proklouzla.
   ZKOUSKAPOZN projde i zakódováním beze změny. */
const ZNACKA = 'ZKOUSKAPOZN';
const TEXT = 'Rozbitý plot u severní hranice ' + ZNACKA + ', majitel volal zpátky.';

/* ---- 1) napsat, uložit, vrátit se ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const chybyJs = [];
  const odeslano = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  /* Všechno, co stránka pošle ven, se zapisuje — poznámka v tom nesmí
     být. Je to jediný způsob, jak ten slib o soukromí ověřit. */
  p.on('request', (r) => {
    let t = (r.postData() || '') + ' ' + r.url();
    // dekódovat MUSÍ: v adrese i v těle bývá text procentně zakódovaný
    try { t += ' ' + decodeURIComponent(t); } catch (e) { /* nevalidní kódování */ }
    if (t.indexOf(ZNACKA) >= 0) odeslano.push(r.method() + ' ' + r.url().slice(0, 90));
  });
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  const je = await p.evaluate(() => {
    const t = document.querySelector('#pz-pozn-text');
    return { pole: !!t, nadpis: !!document.querySelector('#pz-pozn-nadpis'),
      slib: (document.querySelector('#pz-pozn-kde') || {}).textContent || '' };
  });
  // PŘEDPOKLAD: bez pole nemá smysl měřit nic dalšího
  pravda('na stránce pozemku je pole na poznámku', je.pole);
  if (!je.pole) { await prohlizec.close(); hotovo(); }
  pravda('a je u něj nadpis, aby bylo poznat, co to je', je.nadpis);
  pravda('nepřihlášenému stojí u pole, že zůstává jen v prohlížeči',
    /jen v tomhle prohlížeči|neodesílá/i.test(je.slib), je.slib.slice(0, 90));

  await p.fill('#pz-pozn-text', TEXT);
  /* Z pole se MUSÍ odejít. Člověk po napsání poznámky klepne jinam —
     a dokud test zůstával v poli, neproběhlo nic, co se na odchod váže.
     Sabotáž „pošli poznámku na server" tím prošla nepovšimnuta. */
  await p.evaluate(() => document.querySelector('#pz-pozn-text').blur());
  await p.waitForTimeout(1200);
  const po = await p.evaluate(() => ({
    stav: document.querySelector('#pz-pozn-stav').textContent.trim(),
    ulozeno: (() => { try {
      const z = JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}');
      const k = Object.keys(z)[0];
      return k ? z[k].text : null;
    } catch (e) { return 'chyba'; } })(),
  }));
  pravda('napsaná poznámka se uloží', po.ulozeno === TEXT, `uloženo: „${po.ulozeno}"`);
  pravda('a člověk se dozví, že je uloženo', /uložen/i.test(po.stav), `stav: „${po.stav}"`);
  // a hlavně: neodešla ven
  pravda('a NEODEŠLA ven ze zařízení (nepřihlášený)', odeslano.length === 0,
    'poznámka se objevila v požadavku na: ' + odeslano.slice(0, 2).join(', '));

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(2200);
  const znovu = await p.evaluate(() => document.querySelector('#pz-pozn-text').value);
  pravda('a po načtení stránky znovu tam pořád je', znovu === TEXT, `v poli: „${znovu}"`);

  /* Prázdná poznámka se SMAŽE a řekne se to — „uloženo" u prázdného
     pole by znamenalo, že se někam uložilo prázdno. */
  await p.fill('#pz-pozn-text', '');
  await p.waitForTimeout(1200);
  const prazdno = await p.evaluate(() => ({
    stav: document.querySelector('#pz-pozn-stav').textContent.trim(),
    klicu: (() => { try { return Object.keys(JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')).length; }
      catch (e) { return -1; } })(),
  }));
  pravda('vymazaná poznámka se smaže', prazdno.klicu === 0, `klíčů: ${prazdno.klicu}`);
  pravda('a neříká se u toho „uloženo"', /smaz/i.test(prazdno.stav), `stav: „${prazdno.stav}"`);
  pravda('nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

/* ---- 2) meze a plná schránka ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const v = await p.evaluate(() => {
    const P = window.PKPoznamky;
    const m = {};
    for (let i = 0; i < P.STROP + 80; i++) m['k' + i] = { text: 'x', kdy: Date.now() - i * 1000 };
    localStorage.setItem(P.KLIC, JSON.stringify(m));
    P.uloz({ place: 'Zkouška', parcel: '1', okres: 'Benešov', lat: 49.9, lng: 14.7 }, 'nová');
    const z = JSON.parse(localStorage.getItem(P.KLIC));
    return { strop: P.STROP, po: Object.keys(z).length,
      nejnovejsiTam: 'k0' in z, nejstarsiPryc: !('k' + (P.STROP + 79) in z),
      znaku: P.ZNAKU };
  });
  pravda(`poznámek se drží nejvýš ${v.strop}`, v.po <= v.strop, `po úklidu ${v.po}`);
  pravda('a vyhazují se ty NEJSTARŠÍ, ne namátkou',
    v.nejnovejsiTam && v.nejstarsiPryc, JSON.stringify(v));

  const dlouhy = await p.evaluate(() => {
    const P = window.PKPoznamky;
    localStorage.removeItem(P.KLIC);
    const d = { place: 'Zkouška', parcel: '2', okres: 'Benešov', lat: 49.9, lng: 14.7 };
    P.uloz(d, 'a'.repeat(P.ZNAKU + 500));
    return { delka: P.text(d).length, mez: P.ZNAKU };
  });
  pravda(`a jedna poznámka se zkrátí na ${dlouhy.mez} znaků`, dlouhy.delka === dlouhy.mez,
    `uloženo ${dlouhy.delka} znaků`);

  /* Plná schránka: tiché selhání by bylo nejhorší — člověk by psal do
     pole, které si nic nepamatuje. */
  const plno = await p.evaluate(() => {
    const P = window.PKPoznamky;
    const puv = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
    const vysledek = P.uloz({ place: 'X', parcel: '3', okres: 'Benešov', lat: 49.9, lng: 14.7 }, 'text');
    localStorage.setItem = puv;
    return vysledek;
  });
  pravda('a když je paměť plná, ukládání to PŘIZNÁ (nevrací úspěch)', plno === false,
    `uloz() vrátilo ${plno}`);
  await ctx.close();
}

/* ---- 3) poznámka je vidět v porovnání uložených ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2200);
  // ulož pozemek i poznámku
  await p.fill('#pz-pozn-text', TEXT);
  await p.waitForTimeout(900);
  const ulozen = await p.evaluate(() => {
    const b = document.querySelector('#pz-fav');
    if (b) b.click();
    return true;
  });
  await p.waitForTimeout(600);
  await p.goto(`${BASE}/porovnani.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const v = await p.evaluate(() => {
    const e = document.querySelector('.por-pozn');
    return { je: !!e, text: e ? e.textContent.trim() : null,
      radku: document.querySelectorAll('.por-tab tbody tr').length };
  });
  // PŘEDPOKLAD: bez uloženého pozemku není v tabulce co ukazovat
  pravda('uložený pozemek je v porovnání', v.radku > 0, `řádků: ${v.radku}`);
  pravda('a je u něj vidět moje poznámka', v.je && v.text === TEXT,
    `v tabulce: „${v.text}"`);
  await ctx.close();
}

/* ---- 4) mezipaměť rozparsovaných poznámek nesmí zvětrat ----
   text() se volá u KAŽDÉ karty ve výpisu, takže se rozparsovaný JSON
   drží. Naměřeno: při plné schránce (300 × 2 000 znaků = 600 kB) stálo
   šedesát karet 20 ms jen opakovaným parsováním téhož. Mezipaměť to
   srazila na 0,01 ms — ale pokud by zvětrala, pole by ukazovalo starý
   text a člověk by si myslel, že se mu poznámka neuložila. */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const v = await p.evaluate(() => {
    const P = window.PKPoznamky;
    const d = { place: 'Mezipaměť', parcel: '9', okres: 'Benešov', lat: 49.9, lng: 14.7 };
    localStorage.removeItem(P.KLIC);
    const prazdne = P.text(d);        // naplní mezipaměť prázdnotou
    P.uloz(d, 'první');
    const poPrvnim = P.text(d);       // musí vidět zápis, ne tu prázdnotu
    P.uloz(d, 'druhá');
    const poDruhem = P.text(d);       // a přepis taky
    P.uloz(d, '');
    const poSmazani = P.text(d);      // a smazání
    // zápis z jiné karty prohlížeče: schránku změní někdo zvenčí
    P.uloz(d, 'moje');
    const k = Object.keys(JSON.parse(localStorage.getItem(P.KLIC)))[0];
    const m = JSON.parse(localStorage.getItem(P.KLIC));
    m[k] = { text: 'z druhé karty', kdy: Date.now() };
    localStorage.setItem(P.KLIC, JSON.stringify(m));
    window.dispatchEvent(new StorageEvent('storage', { key: P.KLIC }));
    const poCizim = P.text(d);
    // a úprava toho, co vrátí vsechny(), nesmí rozbít, co vidí zbytek webu
    const kopie = P.vsechny();
    Object.keys(kopie).forEach((x) => { kopie[x].text = 'ROZBITO'; });
    const poUprave = P.text(d);
    return { prazdne, poPrvnim, poDruhem, poSmazani, poCizim, poUprave };
  });
  pravda('po uložení vrací text() nový text, ne starou mezipaměť',
    v.prazdne === '' && v.poPrvnim === 'první', JSON.stringify(v));
  pravda('a po přepsání ten přepsaný', v.poDruhem === 'druhá', `vrátilo „${v.poDruhem}"`);
  pravda('a po smazání nic', v.poSmazani === '', `vrátilo „${v.poSmazani}"`);
  pravda('změna z jiné karty prohlížeče mezipaměť zahodí',
    v.poCizim === 'z druhé karty', `vrátilo „${v.poCizim}"`);
  /* Ve schránce v tu chvíli leží „z druhé karty" (přepsala ji ta
     simulovaná druhá karta prohlížeče o pár řádků výš), takže se čeká
     ta hodnota — ne „moje". */
  pravda('a vsechny() vrací kopii — volající nerozbije ostatním výpis',
    v.poUprave === 'z druhé karty', `po úpravě kopie vrátilo „${v.poUprave}"`);
  await ctx.close();
}

/* ---- 5) přihlášenému leží poznámka na účtu ----
   Tohle je ta změna, o kterou šlo: poznámka má být spjatá s profilem
   a vidět i mimo inzerát. Měří se celá cesta — odeslání na server,
   věta u políčka, a hlavně že se poznámka objeví v DRUHÉM prohlížeči,
   který ji v sobě nikdy neměl. */
const PRIHLAS = () => {
  localStorage.setItem('pk_auth', JSON.stringify({
    access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' },
  }));
};
/* config.js míří na OSTROU Supabase. Bez podstrčení by zkouška volala do
   produkce — a protože je ze sandboxu nedostupná, tiše by „neprošla"
   z úplně jiného důvodu, než co měří. Podstrčení je proto součást
   přihlášení, ne volitelná ozdoba. */
async function prihlasenyKontext(sirka, vyska) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: vyska } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200,
    contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';`
      + 'window.PK_MAIL_ZAPNUTO=false;' }));
  await ctx.addInitScript(PRIHLAS);
  return ctx;
}
const TEXT_UCET = 'Na účtu ' + ZNACKA + ' — plot vlevo spadlý.';
{
  const ctx = await prihlasenyKontext(1100, 900);
  const p = await ctx.newPage();
  const naServer = [];
  p.on('request', (r) => {
    if (/\/rpc\/poznamka_uloz/.test(r.url())) naServer.push(r.postData() || '');
  });
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2400);

  const slib = await p.evaluate(() =>
    (document.querySelector('#pz-pozn-kde') || {}).textContent || '');
  pravda('přihlášenému u pole stojí, že se uloží k ÚČTU',
    /k vašemu účtu/i.test(slib), `věta: „${slib.slice(0, 100)}"`);
  pravda('a NESLIBUJE se mu přitom, že se nikam neodesílá',
    !/neodesílá|nevidíme ji ani my/i.test(slib), `věta: „${slib.slice(0, 120)}"`);

  await p.fill('#pz-pozn-text', TEXT_UCET);
  await p.evaluate(() => document.querySelector('#pz-pozn-text').blur());
  await p.waitForTimeout(1200);
  pravda('napsaná poznámka ODEŠLE na účet', naServer.length > 0,
    `požadavků na poznamka_uloz: ${naServer.length}`);
  pravda('a pošle se s ní ten text, co člověk napsal',
    naServer.some((t) => { try { return decodeURIComponent(t).indexOf(ZNACKA) >= 0; }
      catch (e) { return t.indexOf(ZNACKA) >= 0; } }),
    `tělo: ${naServer[0] ? naServer[0].slice(0, 120) : '(žádné)'}`);
  await ctx.close();

  /* DRUHÝ PROHLÍŽEČ, tentýž účet. Prázdná schránka — co se objeví,
     přišlo z účtu, odjinud přijít nemohlo. Tohle je to „vidím ji
     i na jiném telefonu". */
  const ctx2 = await prihlasenyKontext(1100, 900);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p2.waitForTimeout(3000);
  const druhy = await p2.evaluate(() => ({
    vPoli: document.querySelector('#pz-pozn-text').value,
    vSchrance: Object.keys(JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')).length,
  }));
  pravda('v DRUHÉM prohlížeči se poznámka stáhne z účtu',
    druhy.vPoli === TEXT_UCET, `v poli: „${druhy.vPoli}"`);
  pravda('a uloží se do něj, aby čtení bylo dál okamžité',
    druhy.vSchrance > 0, `klíčů ve schránce: ${druhy.vSchrance}`);
  await ctx2.close();

  /* ---- 6) a je vidět VE VÝPISU, mimo inzerát ----
     To byla druhá polovina té prosby: „aby si toho člověk všiml".

     POZOR NA SLEPOU ULIČKU: první verze téhle zkoušky napsala poznámku
     na stránce pozemek-*.html a pak hledala značku na úvodní stránce.
     Nenašla — ale ne proto, že by značka nefungovala. Ten pozemek
     (Benešov) prostě ve výpisu nebyl: výpis ukazuje 26 karet vybraných
     filtrem, ne celou databázi. Zkouška tedy měřila něco jiného, než co
     tvrdila.

     Teď se bere pozemek, který ve výpisu DOOPRAVDY je: přečte se klíč
     z jeho karty, poznámka se k němu uloží NA ÚČET (přes RPC, ne do
     schránky), prohlížeč se vyčistí a stránka načte znovu. Co se pak
     ve výpisu objeví, přišlo z účtu — odjinud přijít nemohlo. Tím je
     změřená celá cesta, o kterou šlo. */
  {
    const ctx3 = await prihlasenyKontext(1280, 1000);
    const p3 = await ctx3.newPage();
    const chybyJs = [];
    p3.on('pageerror', (e) => chybyJs.push(String(e)));
    await p3.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await p3.waitForTimeout(4500);

    const karta = await p3.evaluate(() => {
      const li = document.querySelector('#opp-list li[data-pk]');
      return { karet: document.querySelectorAll('#opp-list li').length,
        klic: li ? li.getAttribute('data-pk') : null };
    });
    // PŘEDPOKLAD: bez karet s klíčem není co měřit
    pravda('karty ve výpisu nesou klíč pozemku', !!karta.klic,
      `karet: ${karta.karet}, klíč první: ${karta.klic}`);

    if (karta.klic) {
      /* Poznámka jde rovnou na účet a schránka se vyčistí — ať je jisté,
         že se do výpisu dostane stažením, ne tím, že tam zůstala. */
      const poslano = await p3.evaluate((k) =>
        window.PKAuth.rpc('poznamka_uloz', { p_klic: k, p_text: 'ZKOUSKAPOZN z účtu' })
          .then((r) => !!(r && r.ok)), karta.klic);
      pravda('poznámka se uloží na účet i pro pozemek z výpisu', poslano === true);
      await p3.evaluate(() => localStorage.removeItem('pk_poznamky_v1'));
      await p3.reload({ waitUntil: 'load' });
      await p3.waitForTimeout(5000);

      const v = await p3.evaluate((k) => {
        const znacky = [...document.querySelectorAll('#opp-list .opp-pozn')];
        const z = znacky[0];
        const li = z ? z.closest('li') : null;
        const rodic = z ? z.parentNode : null;
        return {
          /* Na účtu leží i poznámka z bloku 5 (tentýž účet, tentýž
             falešný server), takže se nečeká „právě jedna" — čeká se, že
             mezi stáhnutými JE ta naše. */
          mamJi: !!JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')[k],
          vSchrance: Object.keys(JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')).length,
          znacek: znacky.length,
          text: z ? z.textContent.trim() : null,
          titulek: z ? z.getAttribute('title') : null,
          naSpravneKarte: li ? li.getAttribute('data-pk') === k : false,
          prvniVRade: rodic ? rodic.firstElementChild === z : false,
          barva: z ? getComputedStyle(z).color : null,
          vidim: z ? (z.getBoundingClientRect().width > 0 && getComputedStyle(z).visibility !== 'hidden') : false,
        };
      }, karta.klic);

      pravda('po načtení s prázdnou schránkou se poznámka stáhne z účtu',
        v.mamJi === true, `klíčů ve schránce: ${v.vSchrance}, ta naše mezi nimi: ${v.mamJi}`);
      pravda('a ve výpisu je u toho pozemku vidět značka',
        v.znacek === 1, `značek: ${v.znacek} (čekala se právě jedna)`);
      pravda('a visí na SPRÁVNÉ kartě, ne na kterékoli', v.naSpravneKarte === true);
      pravda('a nese slovo, ne jen ikonu, ať na kartě plné odznaků nezapadne',
        /Poznámka/i.test(v.text || ''), `text: „${v.text}"`);
      pravda('a po najetí se dozvím, co to je', /poznámk/i.test(v.titulek || ''),
        `title: „${v.titulek}"`);
      pravda('stojí na kartě jako PRVNÍ odznak — je to jediný, co jsem napsal já',
        v.prvniVRade === true);
      pravda('a má jinou barvu než „Nové" (není to měď)',
        v.barva && !/138,\s*85,\s*18/.test(v.barva), `barva: ${v.barva}`);
      pravda('a je doopravdy vidět, ne jen v DOM', v.vidim === true);
    }
    pravda('nic se u toho na úvodní stránce nerozbilo', chybyJs.length === 0,
      chybyJs.slice(0, 2).join(' | '));
    await ctx3.close();
  }
}

/* ---- 7) smazání na jednom zařízení musí platit i na druhém ----
   Tohle je ta nejzrádnější část celého slučování a dřív byla špatně.
   „Místní poznámka, která na účtu není" jsou DVĚ úplně jiné situace:
   buď ji někdo smazal jinde, nebo je napsaná dřív než přihlášení.
   Slučování je bralo obě jako to druhé, takže smazanou poznámku
   vzkřísilo A JEŠTĚ JI NAHRÁLO ZPÁTKY — smazání tedy nedrželo ani
   napodruhé. Rozhoduje příznak `nahrano`: dostane ho jen to, co účet
   doopravdy potvrdil. */
{
  const ctx = await prihlasenyKontext(1100, 900);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2400);

  const d = { place: 'Mazání', parcel: '7', okres: 'Benešov', lat: 49.9, lng: 14.7 };
  /* klicPozemku, ne pkey: pod hrubým pkey ležely poznámky k pěti různým
     pozemkům naráz (viz scripts/test-klic-ulozenych.mjs), takže se klíč
     zpřesnil o výměru. Tady výměra není, takže vyjde „…#v0" — podstatné
     je, že se zkouška ptá TÝMŽ výpočtem jako modul. */
  const klic = await p.evaluate((dd) => window.PKKlic.klicPozemku(dd), d);

  // 1) napsat a nechat potvrdit účtem
  await p.evaluate((dd) => window.PKPoznamky.uloz(dd, 'u plotu je studna'), d);
  await p.waitForTimeout(900);
  const poZapisu = await p.evaluate((k) =>
    (JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')[k] || {}).nahrano === true, klic);
  pravda('potvrzená poznámka se označí jako známá účtu', poZapisu === true,
    'bez toho se nedá poznat smazání od ještě nenahraného');

  // 2) „jiné zařízení" ji smaže — tedy zmizí z účtu, ale ne ze schránky
  const smazano = await p.evaluate((k) =>
    window.PKAuth.rpc('poznamka_uloz', { p_klic: k, p_text: '' }).then((r) => !!(r && r.ok)), klic);
  pravda('jiné zařízení ji z účtu smaže', smazano === true);

  // 3) sync na tomhle zařízení to musí propsat, ne vzkřísit
  const zmen = await p.evaluate(() => window.PKPoznamky.sync());
  const po = await p.evaluate((k) => ({
    jeJeste: !!JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')[k],
    text: window.PKPoznamky.text({ place: 'Mazání', parcel: '7', okres: 'Benešov', lat: 49.9, lng: 14.7 }),
  }), klic);
  pravda('a po sladění zmizí i tady', po.jeJeste === false && po.text === '',
    `ve schránce ${po.jeJeste ? 'pořád je' : 'není'}, text: „${po.text}"`);
  pravda('a sladění to ohlásí jako změnu, ať se výpis překreslí', zmen > 0,
    `sync() vrátil ${zmen}`);

  // 4) a nenahraje ji zpátky na účet
  await p.waitForTimeout(700);
  const naUctu = await p.evaluate(() =>
    window.PKAuth.rpc('moje_poznamky', {}).then((r) => (r && r.data) || []));
  pravda('a nenahraje ji zpátky na účet',
    !naUctu.some((x) => x.klic === klic),
    `na účtu: ${naUctu.map((x) => x.klic).join(', ') || '(nic)'}`);

  /* 5) OPAČNÝ PŘÍPAD. Poznámka napsaná dřív, než se člověk přihlásil,
     na účtu nikdy nebyla — tu smazat NESMÍ, musí ji nahrát. Kdyby se
     opravou mazání rozbilo tohle, přihlášení by lidem mazalo poznámky. */
  const d2 = { place: 'PredPrihlasenim', parcel: '8', okres: 'Benešov', lat: 49.9, lng: 14.7 };
  const klic2 = await p.evaluate((dd) => {
    const k = window.PKKlic.klicPozemku(dd);
    const m = JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}');
    m[k] = { text: 'psáno bez účtu', kdy: Date.now() };   // bez nahrano
    localStorage.setItem('pk_poznamky_v1', JSON.stringify(m));
    return k;
  }, d2);
  await p.evaluate(() => window.PKPoznamky.sync());
  await p.waitForTimeout(900);
  const po2 = await p.evaluate((k) => ({
    jeJeste: !!JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')[k],
  }), klic2);
  const naUctu2 = await p.evaluate(() =>
    window.PKAuth.rpc('moje_poznamky', {}).then((r) => (r && r.data) || []));
  pravda('poznámka psaná před přihlášením se NESMAŽE', po2.jeJeste === true);
  pravda('a nahraje se na účet', naUctu2.some((x) => x.klic === klic2),
    `na účtu: ${naUctu2.map((x) => x.klic).join(', ') || '(nic)'}`);
  await ctx.close();
}

/* --- KARTA A JEJÍ STRÁNKA MUSÍ BÝT TÝŽ POZEMEK --------------------
 *
 * Stížnost od člověka, který web používá: „napsání poznámky nefunguje
 * a neukazuje se u pozemku na hlavní kartě před rozkliknutím."
 *
 * Příčina nebyla v poznámkách. Odstranění duplicit (js/hlidani-logika.js)
 * nejen zahazuje, ono i SKLÁDÁ: u dražby hlášené dvěma zdroji se k té
 * s celou výměrou přebere parcelní číslo z té druhé. Vznikne záznam,
 * jaký v datech samostatně NENÍ — a právě ten je na kartě ve výpisu.
 * Stránka pozemku ale hledala v syrových datech, takže u takové karty
 * přesná shoda nenastala a padalo se na „nejbližší bod do 500 m", tedy
 * v obci s víc dražbami na CIZÍ pozemek. Naměřeno na kartě Rohatce:
 * karta 1 043 887 Kč, stránka 2 795 918 Kč. Tím se rozešel i klíč
 * pozemku, takže se poznámka ukládala pod klíč, který na kartě nikdo
 * nehledá.
 * V ostrých datech je takových karet 20 z 1 955 — tedy jedna z sta,
 * což je přesně ta četnost, kdy to vypadá, že „to prostě nefunguje".
 *
 * Zkouška jde po té nejtěžší kartě: najde ve výpisu tu, jejíž klíč
 * v syrových datech NEEXISTUJE, otevře ji klepnutím a ptá se na dvě
 * věci — ukazuje stránka tentýž pozemek, a najde poznámku napsanou na
 * ní ta karta?
 */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
  await p.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(2600);
  /* Která karta je ta „složená", se počítá ze SKUTEČNÝCH dat týmž
     pravidlem jako web — ne z ručního seznamu, který by zestárl. */
  const slozena = await p.evaluate(async () => {
    const r = await fetch('data/opportunities.json');
    const j = await r.json();
    const syrove = {};
    (j.opportunities || []).forEach((x) => { syrove[window.PKKlic.pkey(x)] = true; });
    const karty = [...document.querySelectorAll('.opp-item')];
    const i = karty.findIndex((e) => !syrove[e.getAttribute('data-pk') || '']);
    if (i === -1) return { zadna: true, karet: karty.length };
    const cena = (karty[i].querySelector('.opp-price') || { textContent: '' }).textContent.replace(/\s/g, '');
    return { i, klic: karty[i].getAttribute('data-pk'), cena, karet: karty.length };
  });
  /* PŘEDPOKLAD: kdyby ve výpisu žádná složená karta nebyla, zkouška by
     neměřila nic — a vada by se vrátila nepozorovaně. */
  pravda('ve výpisu je karta, jejíž záznam vznikl složením dvou (jinak není co měřit)',
    !slozena.zadna, JSON.stringify(slozena));
  if (!slozena.zadna) {
    await p.evaluate((i) => document.querySelectorAll('.opp-item')[i].click(), slozena.i);
    await p.waitForTimeout(3200);
    const stranka = await p.evaluate(() => ({
      url: location.pathname,
      /* Cena stojí v .pz-price > .pv; vedle ní v témže bloku bývá i cena
         za metr, takže se bere ten vnitřní prvek, ne celý blok. */
      cena: ((document.querySelector('.pz-price .pv') || { textContent: '' })
        .textContent.match(/[\d\s\u00a0]+Kč/) || [''])[0].replace(/\s/g, ''),
      poleJe: !!document.getElementById('pz-pozn-text'),
    }));
    pravda('klepnutí na ni vede na stránku pozemku', /pozemek/.test(stranka.url), stranka.url);
    pravda('a ta stránka ukazuje TENTÝŽ pozemek, ne sousední',
      !!stranka.cena && stranka.cena === slozena.cena,
      `karta ${slozena.cena}, stránka ${stranka.cena}`);
    if (stranka.poleJe) {
      await p.evaluate(() => {
        const t = document.getElementById('pz-pozn-text');
        t.value = 'Ověřit v katastru.';
        t.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await p.waitForTimeout(1000);
      /* KLÍČ SE SKLÁDÁ Z OBOJÍHO: z pkey té karty (data-pk) a z výměry,
         kterou si stránka nese vepsanou (window.PK_POZEMEK.v). Prosté
         „začíná na data-pk" by nestačilo — pod jedním pkey leží až pět
         různých pozemků a právě jejich záměna je to, co tahle zkouška
         hlídá od začátku. */
      /* Výměra se čte z toho, co stránka UKAZUJE (řádek „Výměra"), ne
         z ostrůvku window.PK_POZEMEK: na obecné stránce
         pozemek.html?p=… žádný ostrůvek není a vracelo to nulu. */
      const ulozeno = await p.evaluate(() => {
        /* Dlaždice .pz-klic má hodnotu v <b> a popisek v <span>. */
        let v = 0;
        for (const el of document.querySelectorAll('.pz-klic')) {
          const popis = ((el.querySelector('span') || {}).textContent || '').trim();
          if (popis !== 'Výměra') continue;
          const hodnota = ((el.querySelector('b') || {}).textContent || '').replace(/[\s\u00a0]/g, '');
          const m = hodnota.match(/^(\d+)m²/);
          if (m) { v = Number(m[1]); break; }
        }
        return {
          klice: Object.keys(JSON.parse(localStorage.getItem('pk_poznamky_v1') || '{}')),
          vymera: v,
        };
      });
      pravda('a na stránce je vidět výměra, podle které se klíč skládá',
        ulozeno.vymera > 0, 'řádek „Výměra" se nenašel — kontrola níž by měřila nulu');
      const cekanyKlic = slozena.klic + '#v' + Math.round(ulozeno.vymera);
      pravda('poznámka se uloží pod klíč TÉ karty, ze které jsem přišel',
        ulozeno.klice.indexOf(cekanyKlic) !== -1,
        `uloženo pod ${JSON.stringify(ulozeno.klice)}, čekáno ${cekanyKlic}`);
      await p.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
      await p.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
      await p.waitForTimeout(2600);
      const odznak = await p.evaluate((k) => {
        const e = [...document.querySelectorAll('.opp-item')].find((x) => x.getAttribute('data-pk') === k);
        return { kartaJe: !!e, maOdznak: e ? !!e.querySelector('.opp-pozn') : null };
      }, slozena.klic);
      pravda('a ve výpisu je ta karta zase (jinak se odznak nemá kde ukázat)',
        odznak.kartaJe, JSON.stringify(odznak));
      pravda('a nese odznak „Poznámka"', odznak.maOdznak === true, JSON.stringify(odznak));
    }
  }
  await ctx.close();
}

await prohlizec.close();
hotovo();
