/* Test: krátká hláška (toast) se odečítači opravdu ohlásí.
   ==================================================================
   Spuštění: node scripts/test-ohlaseni.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TO VZNIKLO. Toast je `<div role="status" aria-live="polite"
   hidden>` a všechny tři jeho obsluhy (js/main.js, js/pozemek.js,
   js/pridat.js) nastavovaly text DŘÍV, než oblast odkryly. `hidden`
   znamená display:none, a takový prvek v přístupnostním stromu NENÍ:
   text vložený do skryté živé oblasti není změna, kterou by odečítač
   viděl, a odkrytí prvku, který už text má, se jako aktualizace
   `aria-live` nehlásí spolehlivě (NVDA a JAWS to běžně minou).
   Nese to přitom věty, které člověk jinak nemá odkud zjistit:
   „Nepovedlo se uložit — plná paměť prohlížeče", „Nepodařilo se
   stáhnout…", „Uloženo mezi oblíbené".

   CO SE TU MĚŘÍ A CO NE. Chování konkrétního odečítače v Chromiu
   změřit nejde a tahle zkouška to netvrdí. Měří POŘADÍ: pozorovatel
   změn (MutationObserver) zaznamená, jestli se první odkryl atribut
   `hidden`, nebo se změnil text. Hlídá se tedy mechanismus — živá
   oblast musí být ve stromu dřív, než se jí změní obsah — ne zážitek.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8338;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Ohlášení hlášky', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2' };
const srv = createServer((q, s) => {
  const f = path.join(KOREN, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(KOREN) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': TYPY[path.extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
/* Pozorovatel se nasadí PŘED vyvoláním hlášky a zapisuje pořadí.
   `spoust` je selektor toho, na co by klepl člověk. */
async function zmerPoradi(adresa, spoust, pripravit) {
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${adresa}`, { waitUntil: 'load' });
  if (pripravit) await pripravit(p);
  await p.waitForSelector(spoust, { timeout: 60000 }).catch(() => {});
  const v = await p.evaluate(async (sel) => {
    const t = document.getElementById('toast');
    if (!t) return { chyba: 'prvek #toast na stránce není' };
    t.setAttribute('hidden', '');
    t.textContent = '';
    const kroky = [];
    const mo = new MutationObserver((zmeny) => {
      for (const z of zmeny) {
        if (z.type === 'attributes' && z.attributeName === 'hidden') {
          kroky.push(t.hasAttribute('hidden') ? 'schováno' : 'odkryto');
        } else if (z.type === 'childList' || z.type === 'characterData') {
          const txt = (t.textContent || '').trim();
          kroky.push(txt ? 'text:' + txt.slice(0, 24) : 'text:prázdno');
        }
      }
    });
    mo.observe(t, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    const b = document.querySelector(sel);
    if (!b) { mo.disconnect(); return { chyba: 'spoušť ' + sel + ' na stránce není' }; }
    b.click();
    await new Promise((r) => setTimeout(r, 900));
    mo.disconnect();
    return { kroky, text: (t.textContent || '').trim() };
  }, spoust);
  await p.close();
  return Object.assign({ chybyJs }, v);
}

/* Jedna sada kontrol na jednu obsluhu, ať je u pádu vidět která. */
function zkontroluj(jmeno, v) {
  pravda(`${jmeno}: hláška se dá vyvolat klepnutím`, !v.chyba, v.chyba);
  if (v.chyba) return;
  // PŘEDPOKLAD: bez zaznamenaných kroků by se neměřilo nic
  pravda(`${jmeno}: je co měřit — pozorovatel zaznamenal ${v.kroky.length} změn (${v.kroky.join(' → ')})`,
    v.kroky.length >= 2, 'pozorovatel nezaznamenal nic — hláška se vůbec nevyvolala?');
  pravda(`${jmeno}: hláška má text`, !!v.text, 'toast zůstal prázdný');
  const prvniOdkryti = v.kroky.indexOf('odkryto');
  const prvniText = v.kroky.findIndex((k) => k.startsWith('text:') && k !== 'text:prázdno');
  pravda(`${jmeno}: oblast se odkryje DŘÍV, než se jí vloží text`,
    prvniOdkryti >= 0 && prvniText >= 0 && prvniOdkryti < prvniText,
    `pořadí: ${v.kroky.join(' → ')}`
      + '\n      text vložený do skryté živé oblasti odečítač nevidí (hidden = display:none)');
  pravda(`${jmeno}: nic se u toho nerozbilo`, v.chybyJs.length === 0, v.chybyJs.join(' | '));
}

/* ---- 1) výpis na úvodní stránce (js/main.js) ---- */
zkontroluj('výpis', await zmerPoradi('index.html', '#opp-list .opp-item .opp-skryt',
  (p) => p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 }).catch(() => {})));

/* ---- 2) stránka pozemku (js/pozemek.js) ----
   Kopírování souřadnic hlášku pustí po obou cestách: i když schránka
   není povolená, záložní cesta text označí a taky to oznámí. */
const stranka = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
// PŘEDPOKLAD: bez stránky pozemku se druhá obsluha nedá měřit
pravda('je na čem měřit druhou obsluhu — stránka pozemku', !!stranka, 'žádná pozemek-*.html');
if (stranka) zkontroluj('pozemek', await zmerPoradi(stranka, '#pz-sour-kop'));

/* ---- 3) formulář (js/pridat.js) — pořadí ČTENÉ ZE ZDROJE ----
   Hláška tu visí na odeslání do databáze; měřit ji v prohlížeči by
   znamenalo falešnou Supabase. Čte se tedy tělo showToast() a hlídá
   se v něm jen to pořadí. Slabší kontrola — viz hlavička. */
{
  const zdroj = readFileSync(path.join(KOREN, 'js/pridat.js'), 'utf8');
  const i = zdroj.indexOf('function showToast(');
  const telo = i < 0 ? '' : zdroj.slice(i, i + 900);
  pravda('js/pridat.js: showToast() se ve zdroji najde', i >= 0, 'funkce zmizela nebo se přejmenovala');
  if (i >= 0) {
    const odkryti = telo.indexOf("removeAttribute('hidden')");
    const vlozeni = telo.indexOf('textContent = msg');
    pravda('js/pridat.js: odkrytí je ve zdroji před vložením textu',
      odkryti >= 0 && vlozeni >= 0 && odkryti < vlozeni,
      `odkrytí na ${odkryti}, text na ${vlozeni} (v těle funkce)`);
    pravda('js/pridat.js: a text se vkládá až v dalším snímku (requestAnimationFrame)',
      /requestAnimationFrame\([\s\S]{0,120}textContent = msg/.test(telo),
      'textContent = msg není uvnitř requestAnimationFrame');
  }
}

/* ---- 4) POČET VÝSLEDKŮ po hledání a filtru (js/main.js) ----
   Nadpis výpisu se při hledání přepisuje, ale nadpis živá oblast není.
   Naměřeno v oddílu 93: po napsání „Brno" se na stránce změní 19 míst
   a v živé oblasti není ani jedno; u vybraného druhu 0 z 13. Hlídá se
   tedy, že #vysledky-stav je ve stromu, je po načtení PRÁZDNÝ a že se
   do něj po zásahu člověka dostane počet — jednou, ne po každém úhozu. */
{
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 }).catch(() => {});

  /* Pozorovatel se nasadí HNED po prvním vykreslení — a hned se taky
     píše. Je to naměřený případ: dokud se „první vykreslení se
     nehlásí" rozhodovalo teprve v čekajícím hlášení, dotaz napsaný do
     700 ms to čekající hlášení zrušil a sám se za „první" vzal. Člověk
     napsal hledání a neohlásilo se nic. */
  const sleduje = await p.evaluate(() => {
    const el = document.getElementById('vysledky-stav');
    if (!el) return false;
    window.__oh = [];
    new MutationObserver(() => window.__oh.push((el.textContent || '').trim()))
      .observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  });
  const zaklad = await p.evaluate(() => {
    const el = document.getElementById('vysledky-stav');
    if (!el) return { chyba: 'prvek #vysledky-stav na stránce není' };
    let skryty = null;
    for (let x = el; x; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (x.hasAttribute('hidden') || s.display === 'none' || s.visibility === 'hidden') {
        skryty = (x === el ? 'sám' : (x.id || x.className || x.tagName)); break;
      }
    }
    return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'),
      text: (el.textContent || '').trim(), skryty };
  });
  pravda('výpis: oblast pro počet výsledků na stránce je', !zaklad.chyba, zaklad.chyba);
  if (!zaklad.chyba) {
    pravda('výpis: je to živá oblast (role=status, aria-live=polite)',
      zaklad.role === 'status' && zaklad.live === 'polite', JSON.stringify(zaklad));
    /* .visually-hidden je posun za okraj, ne display:none — prvek
       tedy v přístupnostním stromu JE (na rozdíl od `hidden`, viz
       oddíl 92). Kdyby se schoval displayem, oblast by zmizela. */
    pravda('výpis: a je ve stromu, ne schovaná displayem', zaklad.skryty === null,
      `schováno přes: ${zaklad.skryty}`);
    // PŘEDPOKLAD: první vykreslení se hlásit NEMÁ (skočilo by do čtení stránky)
    pravda('výpis: po načtení je prázdná (první vykreslení se nehlásí)',
      zaklad.text === '', `stojí v ní „${zaklad.text}"`);
  }
  pravda('výpis: dá se sledovat, co se do oblasti dostane', sleduje === true,
    'oblast chybí, nebylo co sledovat');

  if (sleduje) {
    /* a) dotaz napsaný HNED, ještě než se usadí první vykreslení */
    await p.click('#map-search');
    await p.type('#map-search', 'Brno', { delay: 90 });
    await p.press('#map-search', 'Enter');
    await p.waitForTimeout(1800);
    const hned = await p.evaluate(() => window.__oh.slice());
    pravda(`výpis: hledání napsané hned po načtení se ohlásí (${JSON.stringify(hned)})`,
      hned.length >= 1 && /pozemk|Nic nenalezeno/.test(hned[hned.length - 1] || ''),
      'do oblasti se nedostalo nic — hledání zůstalo neslyšené');
    // Čtyři úhozy, jedno ohlášení: jinak by odečítač mluvil přes psaní.
    pravda(`výpis: čtyři úhozy daly jedno ohlášení, ne čtyři (${hned.length})`,
      hned.length <= 2, `ohlášení: ${JSON.stringify(hned)}`);

    /* b) věta, ze které web něco rozpozná. Odznaky „Rozpoznáno
       z hledání" jsou jinak vidět jenom očima, a právě ony říkají,
       jak web té větě rozumí. */
    await p.evaluate(() => { window.__oh.length = 0; });
    await p.fill('#map-search', 'les do 500 tis');
    await p.press('#map-search', 'Enter');
    await p.waitForTimeout(1800);
    const veta = await p.evaluate(() => ({ oh: window.__oh.slice(),
      odznaky: [...document.querySelectorAll('#ms-chipy .msch')].map((x) => x.textContent.replace(/✕/g, '').trim()) }));
    /* NEZLOMITELNÉ MEZERY ZPÁTKY NA OBYČEJNÉ. Sázecí krok v
       scripts/oprav.mjs po jednoznakovém slově mezeru nahrazuje
       U+00A0 („Z\u00A0hledání"), a hlídá to vlastní zkouška. Vzor
       psaný obyčejnou mezerou by tu proto neprošel — a spadl by na
       správně vysázeném textu. */
    const posledni = (veta.oh[veta.oh.length - 1] || '').replace(/\u00A0/g, ' ');
    pravda('výpis: u napsané věty se ohlásí i to, co se z ní vzalo',
      /Z hledání vzato/.test(posledni), `v oblasti stojí „${posledni}"`);
    pravda(`výpis: a je to totéž, co stojí v odznacích (${JSON.stringify(veta.odznaky)})`,
      veta.odznaky.length > 0 && veta.odznaky.every((o) => posledni.indexOf(o) >= 0),
      `odznaky ${JSON.stringify(veta.odznaky)} vs „${posledni}"`);

    /* c) dotaz, na který nic nevyhovuje. Ten je ze všech nejdůležitější:
       prázdný výpis se nepozná ani hmatem. */
    await p.evaluate(() => { window.__oh.length = 0; });
    await p.fill('#map-search', 'qwrtzpxk');
    await p.press('#map-search', 'Enter');
    await p.waitForTimeout(1800);
    const prazdno = await p.evaluate(() => window.__oh.slice());
    pravda('výpis: „nic nenalezeno" se taky ohlásí',
      /Nic nenalezeno/.test(prazdno[prazdno.length - 1] || ''), JSON.stringify(prazdno));

    /* d) PŘEKRESLENÍ BEZ ZMĚNY DOTAZU se neohlašuje. V životě je to
       posun mapy: výřez se změní, počet „na mapě" taky, ale dotaz ne —
       a opakovat „15 pozemků" po každém tažení je otrava, ne pomoc.
       SPOUŠTÍ SE TO PŘEKRESLENÍM, NE TAŽENÍM MAPY, a má to naměřený
       důvod: první podoba téhle kontroly mapou hýbat zkoušela
       (`PK_MAPA.panBy`), jenže Leaflet se stahuje až když je mapa na
       dohled — na téhle stránce se tedy nepostavil, posun se nestal
       a kontrola byla PLANÁ: prošla i tehdy, když se porovnávání
       dotazu z kódu odebralo. Teď se pošle `change` na řazení BEZ
       změny volby, což je přesně „překresli se stejným dotazem". */
    await p.evaluate(() => { window.__oh.length = 0; });
    const prekresleno = await p.evaluate(() => {
      const pred = window.PK_VYKRESLENI || 0;
      const s = document.getElementById('map-sort');
      if (!s) return false;
      s.dispatchEvent(new Event('change', { bubbles: true }));   // táž volba
      const m = window.PK_MAPA;
      if (m && m.panBy) { try { m.panBy([60, 0]); } catch (e) {} }
      return pred;
    });
    await p.waitForTimeout(1800);
    const posun = await p.evaluate(([pred]) => ({ oh: window.__oh.slice(),
      vykresleni: (window.PK_VYKRESLENI || 0) - pred }), [prekresleno]);
    // PŘEDPOKLAD: bez překreslení by se neměřilo nic
    pravda(`výpis: překreslení se opravdu stalo (${posun.vykresleni}×)`,
      posun.vykresleni >= 1, 'renderList() neproběhl — kontrola níž by byla planá');
    pravda('výpis: překreslení beze změny dotazu se neohlašuje znovu', posun.oh.length === 0,
      JSON.stringify(posun.oh));
    pravda('výpis: nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  }
  await p.close();
}

/* ---- 5) ZPĚTNÁ VAZBA FORMULÁŘŮ na stránkách účtu ----
   Naměřeno v oddílu 94: hlidani.html ani zpravy.html neměly živou
   oblast ANI JEDNU. Po klepnutí na „Přihlásit se" se změní jedno
   jediné místo na stránce — hláška pod formulářem — a živá oblast to
   nebyla, takže se člověk nedozvěděl ani „Zadejte e-mail a heslo",
   ani „Přihlášení se nepovedlo". Přihlašovací formulář je na obou
   stránkách dostupný bez účtu, takže se dá měřit doopravdy. */
for (const [stranka, pole, heslo, tlacitko, oblast] of [
  ['hlidani.html', '#he', '#hp', '#hlogin', 'hauthmsg'],
  ['zpravy.html', '#ze', '#zp', '#zlogin', 'zauthmsg'],
]) {
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  const je = await p.waitForSelector(tlacitko, { timeout: 45000 }).then(() => true).catch(() => false);
  pravda(`${stranka}: přihlašovací formulář se vykreslí`, je, `tlačítko ${tlacitko} nepřišlo`);
  if (je) {
    const v = await p.evaluate(async ([f, h, t]) => {
      const zmeny = [];
      const ziva = (n) => { for (let x = n; x; x = x.parentElement) {
        if (x.hasAttribute && (x.hasAttribute('aria-live') || ['status', 'alert', 'log'].includes(x.getAttribute('role')))) return x.id || x.tagName;
      } return null; };
      const mo = new MutationObserver((zs) => { for (const z of zs) {
        const n = z.target.nodeType === 1 ? z.target : z.target.parentElement;
        if (!n) continue;
        zmeny.push({ kdo: n.id ? '#' + n.id : n.tagName.toLowerCase(), ziva: ziva(n),
          text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) });
      } });
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
      /* Platný e-mail a krátké heslo: na neplatný e-mail by formulář
         zastavila vlastní kontrola prohlížeče a obsluha by se vůbec
         nespustila (naměřeno — a je to past, do které jsem spadl). */
      document.querySelector(f).value = 'kdo@priklad.cz';
      document.querySelector(h).value = '12';
      document.querySelector(t).click();
      await new Promise((r) => setTimeout(r, 900));
      mo.disconnect();
      const m = new Map();
      for (const x of zmeny) { const k = x.kdo + '|' + (x.ziva || '-'); if (!m.has(k)) m.set(k, x); }
      return { zmeny: [...m.values()] };
    }, [pole, heslo, tlacitko]);
    // PŘEDPOKLAD: bez změny na stránce by se neměřilo nic
    pravda(`${stranka}: klepnutí na „Přihlásit se" něco změní (${v.zmeny.length})`,
      v.zmeny.length >= 1, 'na stránce se nezměnilo nic — nebylo co měřit');
    const vZive = v.zmeny.filter((x) => x.ziva);
    pravda(`${stranka}: a ta změna je v živé oblasti (${vZive.map((x) => x.ziva).join(', ') || 'žádná'})`,
      v.zmeny.length > 0 && vZive.length === v.zmeny.length,
      'mimo živou oblast: ' + v.zmeny.filter((x) => !x.ziva).map((x) => x.kdo + ' „' + x.text + '"').join(' | '));
    pravda(`${stranka}: hlásí se to v #${oblast}`, vZive.some((x) => x.ziva === oblast),
      JSON.stringify(vZive));
    pravda(`${stranka}: nic se u toho nerozbilo`, chybyJs.length === 0, chybyJs.join(' | '));
  }
  await p.close();
}

/* ---- 6) Co se bez účtu vyvolat nedá — pořadí ČTENÉ ZE ZDROJE ----
   Uložení hlídání, chyba v rozhovoru a nová zpráva od druhého
   potřebují přihlášení a živou databázi. Čte se tedy zdroj stránek.
   Slabší kontrola, a je tak i pojmenovaná: pozná přepsané místo,
   neprokáže, co prohlížeč udělá. Doopravdy se obojí měří tam, kde se
   ty cesty odehrávají nad falešnou Supabase: nová zpráva
   v scripts/test-chat-prohlizec.mjs, uložení hlídání
   v scripts/test-hlidani-prohlizec.mjs. */
{
  const h = readFileSync(path.join(KOREN, 'hlidani.html'), 'utf8');
  const z = readFileSync(path.join(KOREN, 'zpravy.html'), 'utf8');
  pravda('hlidani.html: hláška u uložení hlídání je živá oblast',
    /id="ns-msg" role="status"/.test(h), 'na #ns-msg není role=status');
  pravda('zpravy.html: chybová hláška v rozhovoru je živá oblast',
    /id="zc-err" role="status"/.test(z), 'na #zc-err není role=status');
  pravda('zpravy.html: a odkrývá se PRÁZDNÁ (text až v dalším snímku)',
    /errEl\.hidden = false;\s*requestAnimationFrame/.test(z),
    'text se vkládá dřív, než se oblast odkryje — viz oddíl 92');
  pravda('zpravy.html: nová zpráva od druhého se ohlásí vlastní větou',
    /id="zc-ohlas"/.test(z) && /Nová zpráva v rozhovoru/.test(z),
    'chybí #zc-ohlas nebo věta, kterou se hlásí');
  /* Celý rozhovor živá oblast být NESMÍ: dotahuje se každých 15 s
     a přepisuje se celý, takže by se po každém dotažení přečetl znovu. */
  pravda('zpravy.html: celý rozhovor (#zc-msgs) živá oblast NENÍ',
    !/id="zc-msgs"[^>]*(aria-live|role="(status|log|alert)")/.test(z),
    'na #zc-msgs je živá oblast — odečítač bude po každém dotažení číst celý rozhovor');
  /* A hláška se nesmí vkládat do oblasti rovnou při jejím vzniku. */
  pravda('obě stránky staví hlášku přihlášení PRÁZDNOU',
    !/id="hauthmsg"[^>]*>' \+ \(msg/.test(h) && !/id="zauthmsg"[^>]*>' \+ \(msg/.test(z),
    'oblast se do stromu přidává už s textem — to je nový uzel, ne změna (oddíl 92)');
}

await ctx.close();
await prohlizec.close();
srv.close();
console.log('\nOhlášení hlášky — živá oblast musí být ve stromu dřív než text');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Ohlášení hlášky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
