// Test: co se stane, když data nedojedou, co s dražbou po termínu
// a co když se nestáhne mapová knihovna.
//
// Spuštění: node scripts/test-vypadky.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Tři situace, které na běžně fungujícím webu nikdy neuvidíte, a přitom
// ve všech jde o důvěru:
//
// 1) DATA SE NENAČTOU. Web se do téhle chvíle beze slova přepnul na čtrnáct
//    záložních nabídek a tvářil se, že to je celá republika — v úvodu svítilo
//    „14 pozemků". To je horší než přiznat chybu: člověk si odnese, že u nás
//    nic není, a nevrátí se. Záloha zůstává (prázdná mapa je taky k ničemu),
//    ale musí to být vidět.
//
// 2) DRAŽBA PO TERMÍNU. Odpočet uměl říct „proběhlo", jenže se volal jen
//    u budoucích termínů — prošlá dražba tedy nevypsala nic a vypadala jako
//    živá nabídka. Kdo na takovou klikne, podruhé se nevrátí.
//
// 3) MAPOVÁ KNIHOVNA SE NESTÁHNE. Skript se bez „L" nedostal přes start,
//    takže nebyla mapa ANI seznam pozemků — prázdná stránka beze slova
//    vysvětlení. Stačil k tomu výpadek cizího CDN.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

function den(posun) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + posun);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Jedna dražba po termínu a pár živých nabídek kolem ní.
const PROSLA = { place: 'Prošlá', okres: 'Kolín', type: 'drazba', parcel: '1/1',
  druh: 'orná půda', area: 5000, price: 250000, extra: 'dražba ' + den(-40),
  lat: 50.03, lng: 15.21, url: 'https://example.invalid/x', first_seen: den(-60) };
const ZIVE = [1, 2, 3, 4].map((i) => ({ place: 'Živá ' + i, okres: 'Kolín', type: 'sale',
  parcel: String(i), druh: 'orná půda', area: 4000 + i * 100, price: 300000 + i * 10000,
  extra: 'inzerát', lat: 50.05 + i * 0.01, lng: 15.25 + i * 0.01,
  url: 'https://example.invalid/' + i, first_seen: den(-60) }));
const DATA_S_PROSLOU = { updated: den(0), opportunities: [PROSLA, ...ZIVE] };

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(obsluhaDat, volby) {
  const bezLeafletu = !!(volby && volby.bezLeafletu);
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  // Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      // Rozbité nasazení: knihovna z vlastního serveru se nestáhne.
      if (bezLeafletu && /vendor\/leaflet\/leaflet\.js/.test(u.pathname)) return r.abort();
      return r.continue();
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
    return LEAFLET ? r.abort() : r.continue();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.route('**/data/opportunities.json*', obsluhaDat);
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/index.html`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  return { ctx, p, chyby };
}

// --- 1) Server vrátí chybu -------------------------------------------
{
  const { ctx, p, chyby } = await otevri((r) => r.fulfill({ status: 500, contentType: 'text/plain', body: 'chyba' }));
  const v = await p.evaluate(() => {
    const pas = document.querySelector('.datovy-vypadek');
    return {
      je: !!pas,
      text: pas ? pas.textContent.replace(/\s+/g, ' ').trim() : '',
      znovu: !!(pas && pas.querySelector('.dv-znovu')),
      role: pas ? pas.getAttribute('role') : null,
      polozek: document.querySelectorAll('.opp-item').length,
    };
  });
  pravda('při výpadku dat se objeví hlášení', v.je,
    'web mlčky ukázal záložní nabídky, jako by to byla celá republika');
  pravda('a je v něm napsáno, že jde jen o ukázku', /ukázk/i.test(v.text), `text: „${v.text}"`);
  pravda('je tam tlačítko na nový pokus', v.znovu);
  pravda('hlášení je oznámené i odečítači obrazovky', v.role === 'status', `role=${v.role}`);
  pravda('a seznam přitom nezůstane prázdný', v.polozek > 0, 'prázdná mapa je taky k ničemu');
  pravda('při výpadku nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 2) Data v pořádku → žádné hlášení -------------------------------
{
  const { ctx, p } = await otevri((r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(DATA_S_PROSLOU) }));
  const v = await p.evaluate(() => ({
    pas: !!document.querySelector('.datovy-vypadek'),
    polozky: [...document.querySelectorAll('.opp-item')].map((e) => ({
      text: e.textContent.replace(/\s+/g, ' ').trim(),
      proslo: !!e.querySelector('.opp-proběhlo'),
    })),
  }));
  pravda('když data dojedou, žádné hlášení se neukáže', v.pas === false,
    'planý poplach je horší než žádný');

  /* --- Dražba po termínu ---
     Dřív zůstávala ve výpisu, jen odsunutá dolů a s odznakem „proběhlo".
     Jenže odznak si člověk musel najít sám a nedalo se poznat, jestli
     takový záznam zmizí, nebo zůstane viset. Dražit se po termínu nedá,
     takže to není příležitost: z výpisu i z počtů je venku. Nemá ale
     zmizet TIŠE — nad seznamem je napsané, kolik jich je stranou, a dají
     se zobrazit. */
  pravda('prošlá dražba se do výpisu nedostane',
    !v.polozky.some((x) => x.text.indexOf('Prošlá') !== -1),
    've výpisu: ' + v.polozky.map((x) => x.text.slice(0, 24)).join(' | '));
  pravda('a živé nabídky ve výpisu zůstaly', v.polozky.length > 0, 'výpis je prázdný');
  const pozn = await p.evaluate(() => (document.querySelector('#mc-prosle') || {}).textContent || '');
  pravda('nad seznamem je napsané, že se nějaká skrývá',
    /po termínu \(\d+\)/.test(pozn), `poznámka: „${pozn.trim()}"`);
  // A po vyžádání se ukáže — označená a až za živými nabídkami.
  if (pozn) {
    await p.click('#mc-prosle');
    await p.waitForTimeout(800);
    const po = await p.evaluate(() => [...document.querySelectorAll('.opp-item')].map((e) => ({
      text: e.textContent.replace(/\s+/g, ' ').trim(),
      proslo: !!e.querySelector('.opp-proběhlo'),
    })));
    const prosla = po.find((x) => x.text.indexOf('Prošlá') !== -1);
    pravda('po vyžádání je vidět a označená jako „proběhlo"', !!(prosla && prosla.proslo),
      prosla ? `karta: ${prosla.text.slice(0, 90)}` : 'karta se ani pak nenašla');
    pravda('a je zařazená až za živé nabídky',
      po.length > 1 && po[po.length - 1].proslo === true,
      'pořadí: ' + po.map((x) => (x.proslo ? 'PROŠLÁ' : 'živá')).join(', '));
    pravda('živé nabídky označené nejsou', po.filter((x) => x.proslo).length === 1,
      'označeno ' + po.filter((x) => x.proslo).length + ' položek');
  }
  await ctx.close();
}

// --- 3) Mapová knihovna se nestáhne ----------------------------------
/* Tohle byla tichá katastrofa. Skript se bez „L" nedostal přes start, takže
   se nevykreslila mapa ANI seznam pozemků — člověk viděl prázdnou stránku
   a web mu neřekl ani slovo. Dřív stačil výpadek cizího unpkg.com; od té
   doby se knihovna servíruje z vlastního serveru, ale zmlknout nesmí ani
   při rozbitém nasazení. */
{
  // Nejdřív staticky: knihovna se nesmí vrátit na cizí server.
  const uvod = readFileSync('index.html', 'utf8');
  const cizi = (uvod.match(/<(?:script|link)[^>]+(?:src|href)="https?:\/\/[^"]*leaflet[^"]*"/gi) || []);
  pravda('mapová knihovna se stahuje z vlastního serveru', cizi.length === 0,
    'v index.html je ' + cizi.join(' | '));
  pravda('a soubory knihovny v repozitáři opravdu jsou',
    existsSync('vendor/leaflet/leaflet.js') && existsSync('vendor/leaflet/leaflet.css'),
    'vendor/leaflet/ chybí — stránka by se o mapu vůbec nepokusila');

  const { ctx, p, chyby } = await otevri((r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(DATA_S_PROSLOU) }), { bezLeafletu: true });
  const v = await p.evaluate(() => {
    const m = document.querySelector('#leaflet-map .mapa-nedojela');
    const s = document.getElementById('opp-list');
    return {
      L: typeof window.L !== 'undefined',
      vMape: m ? m.textContent.replace(/\s+/g, ' ').trim() : '',
      role: m ? m.getAttribute('role') : null,
      odkazZMapy: !!(m && m.querySelector('a[href="pozemky-podle-okresu.html"]')),
      vSeznamu: s ? s.textContent.replace(/\s+/g, ' ').trim() : '',
      odkazZeSeznamu: !!(s && s.querySelector('a[href="pozemky-podle-okresu.html"]')),
    };
  });
  pravda('bez knihovny je stránka opravdu bez mapy', v.L === false,
    'zkouška si ji nezablokovala, takže nic neověřila');
  pravda('na místě mapy je vysvětlení, ne prázdná plocha', /nepodařilo/i.test(v.vMape),
    `v mapě stojí: „${v.vMape}"`);
  pravda('vysvětlení uslyší i odečítač obrazovky', v.role === 'status', `role=${v.role}`);
  pravda('a nabídne cestu dál — přehled podle okresů', v.odkazZMapy);
  // Na mobilu je mapa schovaná za přepínačem, takže hláška u ní by zůstala
  // neviděná. Prázdný seznam vidí každý, proto mluví i on.
  pravda('i prázdný seznam řekne proč', /nedojela|nepodařilo/i.test(v.vSeznamu),
    `v seznamu stojí: „${v.vSeznamu.slice(0, 80)}"`);
  pravda('a taky nabídne přehled podle okresů', v.odkazZeSeznamu);
  pravda('a nic se přitom nerozsypalo do konzole', chyby.length === 0, chyby[0]);
  await ctx.close();
}

await prohlizec.close();
console.log('\nVýpadek dat a mrtvé záznamy');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Výpadky: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
