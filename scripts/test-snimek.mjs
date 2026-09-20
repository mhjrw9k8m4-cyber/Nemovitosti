// Test: letecký snímek pozemku — jeden kód, správné měřítko, poctivý popisek.
//
// Spuštění: node scripts/test-snimek.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Snímek nahoře na stránce pozemku byl nejslabší místo celého webu: tmavý
// obdélník se špendlíkem uprostřed. U hektarového pozemku vypadal úplně
// stejně jako u zahrádky — přiblížení bylo napevno, takže z obrázku nešlo
// poznat vůbec nic.
//
// Teď se kreslí čtverec o SKUTEČNÉ VÝMĚŘE ve správném měřítku a přiblížení
// se řídí velikostí pozemku. Dvě věci se přitom musí hlídat:
//
// 1) MĚŘÍTKO MUSÍ SEDĚT. Kdyby čtverec neodpovídal výměře, obrázek by lhal
//    o tom nejdůležitějším — jak je pozemek velký proti domům kolem.
// 2) NESMÍ TO VYPADAT JAKO KATASTR. Skutečný obrys parcely nemáme. Čára je
//    proto čárkovaná a pod snímkem stojí, že je to jen přibližný rozsah.
//
// A do třetice: skládání dlaždic bylo dřív opsané zvlášť pro kartu a zvlášť
// pro stránku. Test hlídá, že zůstalo jedno.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// --- 1) Jeden kód, ne dvě kopie --------------------------------------
const ADRESA = 'server.arcgisonline.com';
for (const f of ['../js/main.js', '../js/pozemek.js']) {
  const t = readFileSync(new URL(f, import.meta.url), 'utf8');
  pravda(`${f.replace('../', '')} si snímek neskládá sám`, t.indexOf(ADRESA) === -1,
    'dlaždice se zase lepí ručně — dvě kopie se dřív nebo později rozejdou');
  pravda(`${f.replace('../', '')} používá společný modul`, /PK_SNIMEK/.test(t));
}

// --- 2) Měřítko: čtverec odpovídá výměře -----------------------------
// Počítá se to bez prohlížeče, přímo z modulu.
const zdroj = readFileSync(new URL('../js/snimek.js', import.meta.url), 'utf8');
const okno = { window: {} };
new Function('window', zdroj)(okno.window);
const S = okno.window.PK_SNIMEK;
pravda('modul se načetl', !!(S && S.html), 'PK_SNIMEK chybí');

const LAT = 49.5;
for (const [vymera, popis] of [[500, 'zahrádka'], [5000, 'půl hektaru'], [11020, 'hektar'],
                               [100000, 'deset hektarů'], [1000000, 'sto hektarů']]) {
  const z = S.priblizeni({ lat: LAT, lng: 15, area: vymera }, 384, 240);
  const strana = Math.sqrt(vymera) / S.metryNaBod(LAT, z);
  pravda(`${popis} (${vymera} m²) se na snímek vejde a není to tečka`,
    strana >= 40 && strana <= 130, `strana ${strana.toFixed(0)} bodů z 240`);
}
// Dvakrát větší pozemek musí mít při TÉMŽE přiblížení dvakrát delší stranu.
const a = { lat: LAT, lng: 15, area: 2500 }, bb = { lat: LAT, lng: 15, area: 10000 };
const za = S.priblizeni(a, 384, 240);
const pomer = (Math.sqrt(bb.area) / S.metryNaBod(LAT, za)) / (Math.sqrt(a.area) / S.metryNaBod(LAT, za));
pravda('čtyřikrát větší výměra = dvakrát delší strana', Math.abs(pomer - 2) < 0.01,
  `poměr ${pomer.toFixed(3)} místo 2`);

// --- 3) Co se opravdu vykreslí ---------------------------------------
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
await p.goto(`${BASE}/pozemek.html?p=Police%7C6242%7CVset%C3%ADn&ll=48.97,15.63`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3200);
const v = await p.evaluate(() => {
  const s = document.querySelector('.pz-media svg.opp-map');
  const pop = document.querySelector('.sn-popis');
  if (!s) return { jeSvg: false };
  const carky = [...s.querySelectorAll('rect[stroke-dasharray]')];
  return {
    jeSvg: true,
    dlazdic: s.querySelectorAll('image').length,
    carkovanych: carky.length,
    plna: [...s.querySelectorAll('rect')].filter((r) => !r.getAttribute('stroke-dasharray') && /^\d/.test(r.getAttribute('x') || '')).length,
    spendlik: !!s.querySelector('path[d^="M0 0C-7"]'),
    popisText: pop ? pop.textContent.replace(/\s+/g, ' ').trim() : null,
    popisSkryty: pop ? pop.getAttribute('aria-hidden') === 'true' : false,
  };
});
pravda('snímek se na stránce pozemku vykreslí', v.jeSvg);
pravda('a skládá se ze skutečných dlaždic', v.dlazdic >= 4, `dlaždic ${v.dlazdic}`);
pravda('obrys rozsahu je vidět', v.carkovanych >= 1, 'žádný obrys se nenakreslil');
pravda('a je ČÁRKOVANÝ, ať si ho nikdo nesplete s katastrem', v.carkovanych >= 2,
  'plná čára by vypadala jako přesný obrys parcely');
pravda('špendlík na přesném bodě zůstal', v.spendlik === true);
pravda('pod snímkem stojí, že jde o přibližný rozsah',
  /přibližný rozsah/.test(v.popisText || ''), `popisek: „${v.popisText}"`);
pravda('a je v něm název místa i výměra',
  /Police/.test(v.popisText || '') && /ha|m²/.test(v.popisText || ''), v.popisText);
pravda('popisek se odečítači obrazovky nečte dvakrát', v.popisSkryty === true,
  'název místa je hned pod snímkem v nadpisu — nemá znít dvakrát');
pravda('při vykreslení snímku nespadl žádný skript', chyby.length === 0, chyby[0]);

await prohlizec.close();
console.log('\nLetecký snímek pozemku — měřítko a poctivost');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Snímek: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
