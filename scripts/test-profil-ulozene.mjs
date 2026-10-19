/* Test: uložené pozemky v profilu — ukazuje se u nich pravda?
 *
 * Spuštění: node scripts/test-profil-ulozene.mjs
 *   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta/k/chrome)
 *
 * TŘI VADY NAJEDNOU, VŠECHNY TICHÉ.
 *
 * 1. KLÍČ SE NESHODOVAL. Mapa ukládá pozemky pod klíčem
 *    „obec|parcela|okres|šířka|délka#výměra" (js/klic.js), profil si ho
 *    skládal po svém jako „obec|parcela|okres". Žádný uložený pozemek se
 *    tedy v datech nenašel a seznam vypisoval jen to, co se dalo přečíst
 *    z klíče: obec, okres, odznak „Uložený". Žádný druh, žádná výměra,
 *    žádná cena — a nikde nic, podle čeho by to šlo poznat. Porovnání
 *    (js/porovnani.js) to přitom celou dobu dělalo správně.
 *
 * 2. SKONČENÁ NABÍDKA SE TVÁŘILA STEJNĚ JAKO ŽIVÁ. Změřeno na archivu:
 *    za sedmnáct říjnových dnů zmizelo 308 nabídek z 1 944 (skoro
 *    šestina) a medián životnosti ukončené nabídky je 19 dní. Uložený
 *    pozemek se tedy běžně stane neexistujícím — a profil o tom mlčel
 *    a ještě nabízel „Zobrazit na mapě", kde nebylo nic.
 *
 * 3. U DRAŽBY CHYBĚL TERMÍN. Ze 109 dražeb a exekucí je 64 do týdne.
 *    Uložený pozemek je přesně ten, ke kterému se chce člověk vrátit
 *    VČAS.
 *
 * A čtvrtá věc, kvůli které to celé může selhat opačně: „nenašel jsem"
 * a „nemám kde hledat" se nesmí plést. Když se data nestáhnou, nesmí
 * profil prohlásit všechny uložené pozemky za skončené.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !existsSync(f) || statSync(f).isDirectory()) { res.statusCode = 404; return res.end('ne'); }
  res.setHeader('content-type', TYPY[path.extname(f)] || 'application/octet-stream');
  res.end(readFileSync(f));
});
const PORT = 8310;
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

let ok = 0, chyb = 0; const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Uložené pozemky v profilu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Datum dražby se počítá ode dneška. Napevno napsané by za týden
   znamenalo něco jiného a za měsíc by to byla proběhlá dražba, o které
   výpis právem mlčí — zkouška by začala padat sama od sebe. */
const zaDnu = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const NABIDKY = [
  { place: 'Sendražice', parcel: '2/2', okres: 'Kolín', type: 'sale', druh: 'stavební pozemek',
    area: 900, price: 650000, lat: 50.05, lng: 15.23, extra: 'inzerát' },
  { place: 'Štítary', parcel: '3/3', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
    area: 2400, price: 310000, lat: 50.04, lng: 15.18, extra: 'dražba ' + zaDnu(3) + ' · OK dražby' },
];
/* Klíč se tu skládá RUČNĚ, schválně. Kdyby se bral z js/klic.js, zkouška
   by jen potvrdila, že se modul shoduje sám se sebou — a přesně tu vadu,
   kvůli které vznikla (profil měl vlastní tvar klíče), by nepoznala. */
const klic = (o) => [o.place, o.parcel, o.okres, o.lat.toFixed(3), o.lng.toFixed(3)].join('|')
  + '#v' + o.area;
const ZTRACENY = 'Mrtvá Ves|9/9|Kolín|49.999|15.999#v100';
const ULOZENE = [klic(NABIDKY[0]), klic(NABIDKY[1]), ZTRACENY];
const UCET = { access_token: 'tok', refresh_token: 'ref',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'test@test.cz' } };

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));

/** Otevře profil s přihlášeným účtem a uloženými pozemky.
    `dataJdou:false` = soubor s nabídkami se nestáhne. */
async function otevri(dataJdou) {
  const ctx = await prohlizec.newContext({ serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  await ctx.route('**/data/opportunities.json*', (r) => (dataJdou
    ? r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ updated: '2026-10-17', opportunities: NABIDKY }) })
    : r.fulfill({ status: 503, contentType: 'text/plain', body: 'mimo provoz' })));
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(UCET) }));
  await ctx.addInitScript(`localStorage.setItem('pk_fav_v1', ${JSON.stringify(JSON.stringify(ULOZENE))});
    localStorage.setItem('pk_auth', ${JSON.stringify(JSON.stringify(UCET))});`);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/muj-inzerat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  /* MEZERA MŮŽE BÝT NEZLOMITELNÁ. Čísla sází toLocaleString('cs-CZ'),
     takže „650 000" nese mezeru U+00A0 (a u některých verzí dokonce
     U+202F). Vzor s obyčejnou mezerou by nenašel nic a zkouška by padala
     na zápis místo na smysl — tahle past tu už stála několik zkoušek. */
  const srovnej = (t) => String(t || '').replace(/[\u00a0\u202f\s]+/g, ' ').trim();
  const polozky = await p.evaluate(() => [...document.querySelectorAll('.sv-item')].map((e) => ({
    odznak: (e.querySelector('.okr-badge') || {}).textContent || '',
    misto: (e.querySelector('.sv-place') || {}).textContent || '',
    meta: (e.querySelector('.sv-meta') || {}).textContent || '',
    mapa: !!e.querySelector('.sv-map'),
    odebrat: !!e.querySelector('[data-unfav]'),
  })));
  await ctx.close();
  return polozky.map((x) => Object.assign({}, x,
    { odznak: srovnej(x.odznak), misto: srovnej(x.misto), meta: srovnej(x.meta) }));
}

// --- 1) Data dorazila ------------------------------------------------
{
  const p = await otevri(true);
  /* Pojistka proti měření prázdna: kdyby se seznam nevykreslil (přihlášení,
     přejmenovaná třída), prošly by všechny kontroly níž na prázdném poli. */
  pravda(`v profilu jsou vypsané všechny tři uložené pozemky (${p.length})`, p.length === 3,
    JSON.stringify(p));
  const prodej = p.find((x) => /Sendražice/.test(x.misto));
  pravda('živý pozemek se spáruje s daty, ne jen s klíčem',
    !!(prodej && /stavební pozemek/.test(prodej.meta) && /900/.test(prodej.meta)
      && /650 000/.test(prodej.meta)), JSON.stringify(prodej));
  pravda('  a má odznak svého druhu nabídky, ne obecné „Uložený"',
    !!(prodej && /Prodej/i.test(prodej.odznak)), JSON.stringify(prodej));
  pravda('  a vede z něj cesta na mapu', !!(prodej && prodej.mapa), JSON.stringify(prodej));

  const drazba = p.find((x) => /Štítary/.test(x.misto));
  pravda('u dražby je vidět termín', !!(drazba && /za 3 dny/.test(drazba.meta)),
    JSON.stringify(drazba));
  pravda('  a je to dražba i podle odznaku', !!(drazba && /Dražba/i.test(drazba.odznak)),
    JSON.stringify(drazba));

  const pryc = p.find((x) => /Mrtvá Ves/.test(x.misto));
  pravda('pozemek, který v datech není, se přizná', !!(pryc && /skončila/i.test(pryc.odznak)),
    JSON.stringify(pryc));
  pravda('  a řekne se to i slovem, ne jen barvou odznaku',
    !!(pryc && /už není v nabídce/.test(pryc.meta)), JSON.stringify(pryc));
  /* Mrtvý odkaz je horší než žádný: vypadá jako cesta dál a končí
     prázdnou mapou. Odebrat se ale musí dát pořád. */
  pravda('  a nenabízí mapu, kde není co ukázat', !!(pryc && !pryc.mapa), JSON.stringify(pryc));
  pravda('  ale odebrat se dá', !!(pryc && pryc.odebrat), JSON.stringify(pryc));
}

// --- 2) Data nedorazila ----------------------------------------------
/* Tohle je ta opačná chyba, a byla by horší: při výpadku sítě prohlásit
   všechny uložené pozemky za skončené. Profil o nich v takové chvíli neví
   nic, takže nesmí tvrdit nic. */
{
  const p = await otevri(false);
  pravda(`i bez dat se uložené pozemky vypíšou (${p.length})`, p.length === 3, JSON.stringify(p));
  const lzi = p.filter((x) => /skončila/i.test(x.odznak) || /už není v nabídce/.test(x.meta));
  pravda('a žádný z nich se bez dat neprohlásí za skončený', lzi.length === 0,
    JSON.stringify(lzi));
}

await prohlizec.close();
server.close();
console.log('\nUložené pozemky v profilu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Uložené pozemky v profilu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
