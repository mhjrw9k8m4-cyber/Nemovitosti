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
//  • Nesmí odcházet ze zařízení. Stránka slibuje „zůstává jen v tomhle
//    prohlížeči"; kdyby se poznámka odeslala, byla by to lež o soukromí
//    a ještě o cizích lidech („majitel vypadal divně").
//  • Nesmí růst bez meze. localStorage má kolem 5 MB na celý web
//    a sdílí se s oblíbenými i s hlídáním.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (chyb) { console.log('::error::Poznámky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
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
  pravda('a stojí u něj, že zůstává jen v prohlížeči',
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
  pravda('a NEODEŠLA ven ze zařízení', odeslano.length === 0,
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

await prohlizec.close();
hotovo();
