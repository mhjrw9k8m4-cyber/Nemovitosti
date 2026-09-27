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

/* ---- Odkaz, který vede na VÍC pozemků ----
   Jedna dražba může mít víc pozemkových celků a každý je u nás vlastní
   záznam se stejnou adresou. Dokud se brala první nalezená, předvyplnil
   se prodávajícímu cizí údaj — a hláška mu přitom tvrdila, že je to
   doplněné správně. U okdrazby.cz/drazba/27824 jde o dvě různé obce
   (Velké Opatovice a Bezděčí u Velkých Opatovic) se stejnou cenou
   i výměrou. Doplnit se proto má jen to, na čem se shodnou. */
{
  const U = 'https://www.okdrazby.cz/drazba/99999';
  const A = { url: U, place: 'Aves', okres: 'Blansko', area: 9340, price: 280200, druh: 'orná půda', site: ['elektrina', 'voda'] };
  const B = { url: U, place: 'Bučina', okres: 'Blansko', area: 9340, price: 280200, druh: 'lesní pozemek', site: ['voda'] };
  const data = [A, B, { url: 'https://www.okdrazby.cz/drazba/1', place: 'Jiná', okres: 'Kolín', area: 1, price: 1 }];

  je('odkaz na dva pozemky najde oba', P.najdiVsePodleOdkazu(U, data).length, 2);
  const co = P.coDoplnit(P.najdiVsePodleOdkazu(U, data));
  je('shodný okres se doplní', co.hodnoty['p-okres'], 'Blansko');
  je('shodná výměra taky', co.hodnoty['p-vymera'], '9340');
  je('i shodná cena', co.hodnoty['p-cena'], '280200');
  pravda('rozdílná obec se NEdoplní', !('p-obec' in co.hodnoty),
    `doplnila se obec „${co.hodnoty['p-obec']}" — přitom se u těch dvou pozemků liší`);
  pravda('ani rozdílný druh', co.druh == null, `doplnil se druh „${co.druh}"`);
  je('a je pojmenované, co se rozchází', co.rozdilne.sort(), ['druh pozemku', 'obec']);
  je('ze sítí zůstane jen to, co mají oba', co.site, ['voda']);
  pravda('hláška řekne, že odkaz vede na víc pozemků', /vede na 2 pozemky/.test(P.hlaska(co)),
    P.hlaska(co).slice(0, 120));
  pravda('a poradí, co si má člověk doplnit sám', /doplňte prosím podle svého pozemku/.test(P.hlaska(co)),
    P.hlaska(co).slice(0, 160));

  // Jeden pozemek se chová jako dřív — o víc pozemcích se nic neplácá.
  const jeden = P.coDoplnit(P.najdiVsePodleOdkazu('https://www.okdrazby.cz/drazba/1', data));
  je('u jednoho pozemku se doplní i obec', jeden.hodnoty['p-obec'], 'Jiná');
  pravda('a hláška o víc pozemcích nemluví', !/vede na/.test(P.hlaska(jeden)), P.hlaska(jeden));

  // Když se rozchází všechno, nemá se tvrdit, že se něco doplnilo.
  const C = { url: 'https://x.cz/a', place: 'C', okres: 'Praha', area: 1, price: 2, druh: 'les' };
  const D = { url: 'https://x.cz/a', place: 'D', okres: 'Brno-město', area: 3, price: 4, druh: 'zahrada' };
  const nic = P.coDoplnit([C, D]);
  je('když se rozchází všechno, nedoplní se nic', Object.keys(nic.hodnoty), []);
  pravda('a řekne se to', /rozcházejí/.test(P.hlaska(nic)), P.hlaska(nic));

  /* A totéž na SKUTEČNÝCH datech. Vícepozemkové dražby tam být nemusí
     (záleží, co robot ten den našel), takže se z jejich nepřítomnosti
     nedělá chyba — jen se pozná, jestli tahle zkouška dnes měřila i na
     skutečných datech, nebo jen na vymyšlených. */
  const nabidky = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities || [];
  const podleAdresy = {};
  for (const d of nabidky) {
    if (!d || !d.url) continue;
    const k = P.normalizujOdkaz(d.url);
    if (!k) continue;
    (podleAdresy[k] = podleAdresy[k] || []).push(d);
  }
  const vice = Object.values(podleAdresy).filter((v) => v.length > 1);
  if (vice.length) {
    const skupina = vice.find((v) => new Set(v.map((d) => d.place)).size > 1) || vice[0];
    const coSkut = P.coDoplnit(skupina);
    pravda(`na datech: ${vice.length} odkazů vede na víc pozemků a počítá se s tím`,
      coSkut.pocet === skupina.length && /vede na/.test(P.hlaska(coSkut)),
      P.hlaska(coSkut).slice(0, 120));
    const obce = new Set(skupina.map((d) => d.place));
    if (obce.size > 1) {
      pravda('a u různých obcí se obec nedoplní', !('p-obec' in coSkut.hodnoty),
        `doplnila se „${coSkut.hodnoty['p-obec']}" z ${[...obce].join(' / ')}`);
    }
  } else {
    pravda('na dnešních datech žádný odkaz nevede na víc pozemků (zkouška výš jela na vymyšlených)', true);
  }
}

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
    odkazovePole: !!document.getElementById('p-odkaz'),
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
  /* Dřív se tu čekalo, že vložený odkaz zůstane v poli „Odkaz na inzerát
     nebo katastr". Jenže to pole nikam nevedlo — create_listing odkaz
     nebere a v tabulce pro něj není sloupec — takže to nebyla vlastnost,
     ale tiché zahození. Pole je pryč a zkouška hlídá, že se nevrátí:
     co formulář nabídne, to musí dojít na server (hlídá i
     scripts/test-staticka.mjs). Co web z odkazu vyčetl, říká hláška. */
  pravda('formulář už nenabízí pole, do kterého by se odkaz zahodil',
    po.odkazovePole === false, 'pole p-odkaz je zpátky, a pořád nikam nevede');
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
