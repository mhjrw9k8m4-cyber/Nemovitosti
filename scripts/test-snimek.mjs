// Test: letecký snímek pozemku — jeden kód, správné měřítko, poctivý popisek.
//
// Spuštění: node scripts/test-snimek.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Snímek nahoře na stránce pozemku byl nejslabší místo celého webu: tmavý
// obdélník se špendlíkem uprostřed. U hektarového pozemku vypadal úplně
// stejně jako u zahrádky — přiblížení bylo napevno, takže z obrázku nešlo
// poznat vůbec nic. Teď se PŘIBLÍŽENÍ ŘÍDÍ VÝMĚROU: hektar se ukáže v jiném
// měřítku než zahrádka, a velikost je tím pádem z obrázku vidět.
//
// Čtverec o skutečné výměře tu chvíli byl a je pryč: na leteckém snímku
// působil jako obrys parcely, a ten nemáme — je v katastru. Test proto
// hlídá i to, že se žádná taková čára nevrátila. Radši nic než čára,
// kterou si někdo splete s hranicí pozemku.
//
// A do třetice: skládání dlaždic bylo dřív opsané zvlášť pro kartu a zvlášť
// pro stránku. Test hlídá, že zůstalo jedno.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));


const POZEMEK = adresaPozemku((x) => x.area > 0);
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Snímek', zpravy);
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
const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
pravda('v datech je pozemek s polohou, cenou i výměrou', !!POZEMEK,
  'žádný — kontroly snímku by měřily prázdnou stránku');
await p.goto(`${BASE}/${POZEMEK ? POZEMEK.url : 'pozemek.html'}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3200);
const v = await p.evaluate(() => {
  const s = document.querySelector('.pz-media svg.opp-map');
  const pop = document.querySelector('.sn-popis');
  if (!s) return { jeSvg: false };
  return {
    jeSvg: true,
    dlazdic: s.querySelectorAll('image').length,
    // Jakýkoli obtažený tvar uvnitř snímku by se četl jako hranice pozemku.
    obrysu: [...s.querySelectorAll('rect, polygon, path')].filter((e) => {
      const st = e.getAttribute('stroke') || getComputedStyle(e).stroke;
      const d = e.getAttribute('d') || '';
      if (d.indexOf('M0 0C-7') === 0) return false;        // špendlík
      if (e.tagName === 'path' && /^M\d+ 0V/.test(d)) return false;  // rastr pod dlaždicemi
      return st && st !== 'none' && st !== 'rgba(0, 0, 0, 0)';
    }).length,
    spendlik: !!s.querySelector('path[d^="M0 0C-7"]'),
    popisText: pop ? pop.textContent.replace(/\s+/g, ' ').trim() : null,
    popisSkryty: pop ? pop.getAttribute('aria-hidden') === 'true' : false,
    nadpis: (document.querySelector('h1.pz-place') || {}).textContent || '',
    vymera: [...document.querySelectorAll('.pz-klic')]
      .map((e) => e.textContent).filter((t) => /Výměra/.test(t)).join(' '),
  };
});
pravda('snímek se na stránce pozemku vykreslí', v.jeSvg);
pravda('a skládá se ze skutečných dlaždic', v.dlazdic >= 4, `dlaždic ${v.dlazdic}`);
pravda('do snímku se nekreslí nic, co by vypadalo jako hranice pozemku',
  v.obrysu === 0,
  `našel jsem ${v.obrysu} obtažených tvarů — čára na leteckém snímku se čte jako obrys parcely`);
pravda('špendlík na přesném bodě zůstal', v.spendlik === true);
pravda('pod snímkem stojí, kde je přesný obrys',
  /katastr/.test(v.popisText || ''), `popisek: „${v.popisText}"`);
/* JMÉNO OBCE A VÝMĚRA V POPISKU UŽ NEJSOU, A JE TO ZÁMĚR.
   Stály tam, dokud byl snímek jediné, co se na stránce ukázalo hned.
   Dnes je o řádek níž nadpis „Ostatní plocha 6 336 m² — Benešov,
   okres Benešov", takže popisek přes fotku říkal totéž podruhé.
   Hlídá se tedy, že z TOHO pozemku pochází NADPIS (to je ta past na
   napevno napsanou hodnotu) a že popisek nese jedinou věc, kterou ze
   snímku poznat nelze — kde je přesný obrys. */
pravda('a nadpis stránky nese název místa toho pozemku',
  !!POZEMEK && (v.nadpis || '').indexOf(POZEMEK.d.place) >= 0,
  `nadpis „${v.nadpis}", čekané místo „${POZEMEK ? POZEMEK.d.place : '—'}"`);
/* Výměra se hledá v parametrech, ne v nadpisu: na vlastní stránce
   pozemku ji nadpis nese („Ostatní plocha 6 336 m² — Benešov"),
   kdežto na obecné pozemek.html?p=… je nadpis jen jméno obce.
   Dlaždice „Výměra" je na obou. */
pravda('a výměra stojí v parametrech hned pod cenou',
  /ha|m²/.test(v.vymera || ''), `dlaždice: „${v.vymera}"`);
pravda('a popisek přes snímek neopakuje, co je v nadpisu',
  (v.popisText || '').indexOf(POZEMEK ? POZEMEK.d.place : 'xxx') < 0,
  `popisek „${v.popisText}"`);
pravda('popisek se odečítači obrazovky nečte dvakrát', v.popisSkryty === true,
  'název místa je hned pod snímkem v nadpisu — nemá znít dvakrát');
pravda('při vykreslení snímku nespadl žádný skript', chyby.length === 0, chyby[0]);

await prohlizec.close();
console.log('\nLetecký snímek pozemku — měřítko a poctivost');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Snímek: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
