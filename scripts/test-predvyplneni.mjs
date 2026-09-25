// Předvyplnění inzerátu z odkazu jinam.
//
// Spuštění: node scripts/test-predvyplneni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ: kdo prodává pozemek, má ho skoro vždycky vypsaný ještě někde
// jinde. Přepisovat obec, výměru, cenu a druh podruhé ručně je otrava,
// ve které se dělají chyby — a formulář, který se vyplňuje dvakrát,
// se často nevyplní vůbec.
//
// Nic se nestahuje: nabídky z portálů, které procházíme, máme u sebe
// i s jejich adresou, takže se odkaz jen najde v našich datech. Test
// proto vezme SKUTEČNÝ odkaz z dat, vloží ho do formuláře a kouká, co
// se doplnilo. Kdyby se zkoušel vymyšlený odkaz, ověřilo by se jen to,
// že se nic nestalo.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* ---- 1) Srovnání adresy do jednoho tvaru ---- */
const okno = {};
new Function('window', readFileSync(new URL('../js/predvyplneni.js', import.meta.url), 'utf8'))(okno);
const P = okno.PKPredvyplneni;
pravda('modul se načetl', !!(P && P.najdiPodleOdkazu));

const Z = 'https://www.bezrealitky.cz/nemovitosti-byty-domy/948371-x';
/* Lidé kopírují odkazy s „www", s lomítkem i s ocasem od reklamy —
   a je to pořád tentýž inzerát. */
je('„www" nerozhoduje', P.normalizujOdkaz(Z), P.normalizujOdkaz('https://bezrealitky.cz/nemovitosti-byty-domy/948371-x'));
je('lomítko na konci taky ne', P.normalizujOdkaz(Z), P.normalizujOdkaz(Z + '/'));
je('ani ocas od reklamy', P.normalizujOdkaz(Z), P.normalizujOdkaz(Z + '?utm_source=facebook&fbclid=abc'));
je('ani chybějící https://', P.normalizujOdkaz(Z), P.normalizujOdkaz('www.bezrealitky.cz/nemovitosti-byty-domy/948371-x'));
/* Dotaz se ale nezahazuje celý: u Farmy.cz je číslo nabídky právě v něm,
   takže bez něj by se slily všechny nabídky do jedné. */
pravda('dotaz se nezahazuje — Farmy mají číslo nabídky v něm',
  P.normalizujOdkaz('https://www.farmy.cz/nabidka_detail?nab=1') !== P.normalizujOdkaz('https://www.farmy.cz/nabidka_detail?nab=2'),
  'dvě různé nabídky Farmy.cz vycházejí jako táž adresa');
je('nesmysl není odkaz', P.normalizujOdkaz('tohle není odkaz'), '');
je('a prázdno taky ne', P.normalizujOdkaz(''), '');

/* Popis se nedoplňuje: robot si ho neukládá, takže bychom ho museli
   vymyslet — a vymyšlený popis cizího pozemku na inzerát nepatří. */
{
  const co = P.coDoplnit({ place: 'Kolín', okres: 'Kolín', area: 1200, price: 850000, druh: 'orná půda', parcel: '—' });
  je('doplní se obec, okres, výměra a cena', co.hodnoty,
    { 'p-obec': 'Kolín', 'p-okres': 'Kolín', 'p-vymera': '1200', 'p-cena': '850000' });
  pravda('pomlčka místo parcelního čísla se nepřenáší', !('p-parcela' in co.hodnoty),
    'do formuláře by se dostala „—" jako parcelní číslo');
  pravda('a je řečeno, co se doplnilo', /obec/.test(P.hlaska(co)) && /popis/.test(P.hlaska(co)),
    P.hlaska(co));
}

/* Druh pozemku: katastr jich zná desítky, formulář nabízí šest.
   Bez převodu se do výběru nedostalo nic („lesní pozemek" se s volbou
   „Les" neshoduje) — a hláška přitom tvrdila, že druh doplnila.
   Tvrdit něco, co je na obrazovce vidět jinak, je horší než nedoplnit
   nic. Přišlo se na to až na snímku hotové stránky. */
{
  je('„lesní pozemek" je volba „Les"', P.volbaDruhu('lesní pozemek'), 'Les');
  je('„trvalý travní porost" je „Louka / pastvina"', P.volbaDruhu('trvalý travní porost'), 'Louka / pastvina');
  je('„stavební pozemek" je „Stavební"', P.volbaDruhu('stavební pozemek'), 'Stavební');
  je('„zastavěná plocha a nádvoří" taky', P.volbaDruhu('zastavěná plocha a nádvoří'), 'Stavební');
  je('„vinice" spadne do „Ostatní"', P.volbaDruhu('vinice'), 'Ostatní');
  /* Co se zařadit nedá, se nechá na člověku — a nesmí se to tvářit,
     že jsme to vyplnili. */
  je('holý „pozemek" se nezařazuje', P.volbaDruhu('pozemek'), null);
  const bezDruhu = P.coDoplnit({ place: 'Kolín', druh: 'pozemek' });
  pravda('a hláška pak druh netvrdí', !/druh/.test(P.hlaska(bezDruhu)), P.hlaska(bezDruhu));
  /* A každá volba, kterou převod vrací, musí ve výběru opravdu být. */
  const formular = readFileSync(new URL('../pridat.html', import.meta.url), 'utf8');
  const usek = formular.slice(formular.indexOf('id="p-druh"'));
  const volby = [...usek.slice(0, usek.indexOf('</select>')).matchAll(/<option[^>]*>([^<]+)<\/option>/g)]
    .map((m) => m[1].trim());
  const vraci = [...new Set(['orná půda', 'trvalý travní porost', 'stavební pozemek', 'lesní pozemek',
    'ostatní plocha', 'zahrada', 'vinice', 'ovocný sad', 'zastavěná plocha a nádvoří', 'vodní plocha']
    .map((d) => P.volbaDruhu(d)).filter(Boolean))];
  const chybi = vraci.filter((v) => !volby.includes(v));
  pravda('a všechny volby, které převod vrací, ve formuláři existují', chybi.length === 0,
    `ve výběru chybí: ${chybi.join(', ')} — druh by se „doplnil" a nic by se nestalo`);
}

/* ---- 2) V prohlížeči, se skutečným odkazem z dat ---- */
const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities || [];
const vzor = DATA.find((o) => o.url && o.place && o.area > 0 && o.price > 0 && o.druh);
pravda('v datech je nabídka s odkazem', !!vzor, 'není na čem zkoušet');

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return r.abort();
    if (/\/js\/config\.js/.test(u.pathname)) {
      return r.fulfill({ status: 200, contentType: 'text/javascript',
        body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` });
    }
    return r.continue();
  });
  const p = await ctx.newPage();
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 160)));
  await p.goto(`${BASE}/pridat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  /* Formulář je schovaný za přihlášením (ochrana proti spamu), ale
     zkratka „mám inzerát jinde" má smysl jen u vyplňování — musí tedy
     být vidět tam, kde se vyplňuje. Test si kartu odkryje. */
  await p.evaluate(() => {
    const c = document.getElementById('prodej-card'); if (c) c.hidden = false;
    const g = document.getElementById('auth-gate'); if (g) g.hidden = true;
  });
  /* Když zkratka na stránce není vidět, nemá smysl do ní psát: Playwright
     by se na ni třicet vteřin marně pokoušel klepnout a test by spadl
     výjimkou místo toho, aby řekl, co je špatně. */
  const viditelna = await p.locator('#p-odjinud').isVisible();
  pravda('zkratka je na stránce a je vidět', viditelna,
    'políčko #p-odjinud na stránce přidání není vidět — zkratka je k ničemu');
  /* Stojí NAD formulářem: kdo ji najde až dole, má už všechno přepsané. */
  const poradi = await p.evaluate(() => {
    const a = document.getElementById('p-odjinud'), b = document.getElementById('p-obec');
    return !!(a && b) && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  pravda('a stojí nad formulářem, ne až za ním', poradi,
    'zkratka k vyplnění je až pod poli, která má vyplnit');

  if (!viditelna) { await ctx.close(); await prohlizec.close(); hotovo(); }

  // odkaz, který neznáme
  await p.fill('#p-odjinud', 'https://www.sreality.cz/detail/prodej/pozemek/pole/nekde/123');
  await p.click('#p-odjinud-btn');
  await p.waitForTimeout(1500);
  const cizi = await p.evaluate(() => ({
    hlaska: (document.getElementById('p-odjinud-stav') || {}).textContent || '',
    obec: (document.getElementById('p-obec') || {}).value || '',
  }));
  pravda('u neznámého portálu se nic nevymýšlí', cizi.obec === '',
    `do obce se něco doplnilo: „${cizi.obec}"`);
  pravda('a řekne se to rovnou', /nemáme/i.test(cizi.hlaska), `stojí tam „${cizi.hlaska.trim()}"`);

  // skutečný odkaz z našich dat
  await p.fill('#p-odjinud', vzor.url);
  await p.click('#p-odjinud-btn');
  await p.waitForTimeout(2500);
  const po = await p.evaluate(() => ({
    obec: (document.getElementById('p-obec') || {}).value || '',
    okres: (document.getElementById('p-okres') || {}).value || '',
    vymera: (document.getElementById('p-vymera') || {}).value || '',
    cena: (document.getElementById('p-cena') || {}).value || '',
    druh: (document.getElementById('p-druh') || {}).value || '',
    odkaz: (document.getElementById('p-odkaz') || {}).value || '',
    hlaska: (document.getElementById('p-odjinud-stav') || {}).textContent || '',
  }));
  je('obec se doplnila', po.obec, vzor.place);
  /* Výběr druhu se musí opravdu přepnout, ne jen slíbit v hlášce. */
  const cekanyDruh = P.volbaDruhu(vzor.druh);
  if (cekanyDruh) {
    pravda('a druh pozemku se ve výběru opravdu přepnul', po.druh === cekanyDruh,
      `ve výběru „${po.druh}", čekáno „${cekanyDruh}" (v datech „${vzor.druh}")`);
  }
  je('výměra taky', po.vymera, String(vzor.area));
  je('a cena taky', po.cena, String(vzor.price));
  pravda('a okres, když ho známe', !vzor.okres || po.okres === vzor.okres, `${po.okres} vs ${vzor.okres}`);
  pravda('odkaz zůstane u inzerátu', po.odkaz === vzor.url, po.odkaz);
  pravda('a je napsané, co se doplnilo', /Doplnili jsme/.test(po.hlaska), po.hlaska.trim().slice(0, 90));
  /* Popis se nevymýšlí — a nesmí se stát, že ho zkratka vyplní za člověka. */
  const popis = await p.evaluate(() => (document.getElementById('p-popis') || {}).value || '');
  pravda('popis zůstane prázdný', popis === '', `zkratka napsala popis: „${popis.slice(0, 60)}"`);
  pravda('při předvyplnění nic nespadlo', padlo.length === 0, padlo[0]);
  await ctx.close();
}
await prohlizec.close();
hotovo();

function hotovo() {
  console.log('\nPředvyplnění inzerátu z odkazu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Předvyplnění: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}
