// Test: rozvržení, které se rozpadá jen v určitém rozmezí šířek — a popisky
// stránek pro vyhledávače.
//
// Spuštění: node scripts/test-rozvrzeni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Čtyři věci, které tu nikdo jiný nehlídá, protože nic nespadne:
//
// 1) HLAVIČKA SE ROZPADALA MEZI 881 A 1040 px. Tlačítko s menu naskakovalo
//    až pod 880, ale plná navigace se na jeden řádek vešla až kolem 1040.
//    V tom pásmu se „Ceny pozemků" a „Můj profil" zalomily na dva řádky
//    a logo se dotklo prvního odkazu, takže v liště stálo „ParcelkaMapa".
//    Žádná stránka přitom nejela do strany, takže to neodhalila ani
//    kontrola přetékání — rozvrh se nerozbil, jen zošklivěl.
//
// 2) PROUŽEK S ŽIVÝMI ÚDAJI VYTÉKAL Z RODIČE. Hlavička je svislý flex, který
//    zarovnává potomky na začátek, takže si proužek bral šířku svého OBSAHU:
//    557 px uvnitř 350px sloupce, tedy 187 px mimo obrazovku. Jeho vlastní
//    posuvník neměl co posouvat a poslední údaj se nedal přečíst.
//
// 3) „NAHORU" SEDĚLO NA OBSAHU. Na mobilu to byla pilulka se jménem přes
//    110 px široká a plavala nad seznamem — přímo na řádku s cenou za metr.
//
// 4) TITULKY DELŠÍ NEŽ VÝPIS GOOGLU. Osmnáct stránek mělo titulek přes
//    65 znaků a osmnáct popisek přes 165 — ve výsledcích z nich zbyl cár.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Tentýž server jako ostatní testy: servíruje statické soubory na 8310.
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = new URL('..', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// --- 4) Popisky pro vyhledávače — bez prohlížeče ---------------------
{
  const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  const dlouheT = [], dlouheD = [], bezT = [];
  for (const s of stranky) {
    const h = readFileSync(path.join(KOREN, s), 'utf8');
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
    const d = (h.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1];
    if (!t) bezT.push(s);
    else if (t.length > 65) dlouheT.push(`${s} (${t.length})`);
    // Popisek nemají stránky, které do vyhledávače nepatří (noindex).
    if (d && d.length > 165) dlouheD.push(`${s} (${d.length})`);
    if (!d && !/noindex/.test(h)) bezT.push(s + ' — bez popisku, a přitom se indexuje');
  }
  pravda('každá stránka má titulek', bezT.length === 0, bezT.join(', '));
  pravda('žádný titulek se ve výpisu Googlu neusekne',
    dlouheT.length === 0, `přes 65 znaků: ${dlouheT.slice(0, 6).join(', ')}${dlouheT.length > 6 ? ` … a dalších ${dlouheT.length - 6}` : ''}`);
  pravda('ani žádný popisek', dlouheD.length === 0,
    `přes 165 znaků: ${dlouheD.slice(0, 6).join(', ')}${dlouheD.length > 6 ? ` … a dalších ${dlouheD.length - 6}` : ''}`);
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Stránka o dané šířce, bez cizích zdrojů. */
async function otevri(soubor, sirka, vyska) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: vyska },
    isMobile: sirka < 700, hasTouch: sirka < 700, locale: 'cs-CZ', permissions: [] });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    // Bez Leafletu se skript na hlavní stránce nedostane až k proužku
    // s údaji, takže by kontrola mlčela o prázdné stránce.
    if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
      const f = path.join(LEAFLET, path.basename(u.pathname));
      if (existsSync(f)) return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  if (LEAFLET) {
    await ctx.route(`${BASE}/${soubor}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${soubor}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  return { ctx, p };
}

// --- 1) Hlavička drží na každé šířce ---------------------------------
{
  const spatne = [];
  // Krok po 20 px přes celé sporné pásmo i kus nad ním.
  for (const w of [360, 700, 860, 881, 900, 940, 980, 1020, 1040, 1041, 1100, 1280, 1440]) {
    const { ctx, p } = await otevri('drazby-pozemku.html', w, 700);
    const v = await p.evaluate(() => {
      const nav = document.getElementById('nav');
      const logo = document.querySelector('.logo');
      const burger = document.querySelector('.nav-toggle');
      const vidno = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
      const menuVidno = vidno(burger);
      const odkazy = [...nav.querySelectorAll('a')].filter(vidno);
      if (menuVidno || !odkazy.length) return { menuVidno, radku: 1, mezera: 999, sirsi: [] };
      // Kolik různých řádků odkazy zabírají a jaká je mezera za logem.
      const radku = new Set(odkazy.map((a) => Math.round(a.getBoundingClientRect().top))).size;
      const mezera = Math.round(odkazy[0].getBoundingClientRect().left - logo.getBoundingClientRect().right);
      // Odkaz, který se sám zalomil na dva řádky (kromě tlačítka s výplní).
      const sirsi = odkazy.filter((a) => {
        if (a.classList.contains('btn-primary') || a.classList.contains('header-cta')) return false;
        const r = a.getBoundingClientRect();
        return r.height > parseFloat(getComputedStyle(a).lineHeight) * 1.6;
      }).map((a) => a.textContent.trim());
      return { menuVidno, radku, mezera, sirsi };
    });
    if (!v.menuVidno) {
      if (v.sirsi.length) spatne.push(`${w} px: zalomil se odkaz ${v.sirsi.join(', ')}`);
      // Logo a první odkaz se nesmí dotýkat — jinak z toho je „ParcelkaMapa".
      else if (v.mezera < 20) spatne.push(`${w} px: mezi logem a navigací je jen ${v.mezera} px`);
    }
    await ctx.close();
  }
  pravda('hlavička se nerozpadá na žádné šířce', spatne.length === 0, spatne.join('\n      '));
}

// --- 2) Proužek s údaji se vejde do rodiče ---------------------------
{
  const { ctx, p } = await otevri('index.html', 390, 844);
  await p.waitForTimeout(2600);
  const v = await p.evaluate(() => {
    const e = document.getElementById('hero-live');
    if (!e || e.hidden) return null;
    const r = e.getBoundingClientRect(), rr = e.parentElement.getBoundingClientRect();
    return { sirka: Math.round(r.width), rodic: Math.round(rr.width),
      vpravo: Math.round(r.right), okno: innerWidth,
      posouvaSe: e.scrollWidth > e.clientWidth + 1 };
  });
  pravda('proužek s údaji v úvodu je vidět', !!v, 'element #hero-live chybí nebo zůstal schovaný');
  if (v) {
    // Tohle je jádro: proužek si bral šířku obsahu, ne sloupce.
    pravda('proužek se vejde do svého sloupce', v.sirka <= v.rodic + 1,
      `proužek je ${v.sirka} px v ${v.rodic}px sloupci — vytéká o ${v.sirka - v.rodic} px`);
    pravda('a nepřesahuje obrazovku', v.vpravo <= v.okno + 1,
      `pravý okraj je na ${v.vpravo} px, obrazovka končí na ${v.okno}`);
    // Když se do šířky nevejde, musí jít posunout — jinak je zbytek nedostupný.
    pravda('a co se nevejde, jde posunout do strany', v.posouvaSe,
      'proužek nemá co posouvat — buď je celý vidět, nebo se k poslednímu údaji nelze dostat');
  }
  await ctx.close();
}

// --- 3) „Nahoru" nesedí na obsahu ------------------------------------
{
  const { ctx, p } = await otevri('index.html', 390, 844);
  await p.waitForTimeout(2600);
  await p.evaluate(() => scrollTo(0, 1400));
  await p.waitForTimeout(900);
  const v = await p.evaluate(() => {
    const b = document.getElementById('to-top');
    if (!b || !b.classList.contains('show')) return null;
    const r = b.getBoundingClientRect();
    // Který text karty leží pod tlačítkem?
    const pod = [];
    for (const e of document.querySelectorAll('.opp-item *')) {
      if (e.children.length || !e.textContent.trim()) continue;
      const t = e.getBoundingClientRect();
      if (t.right > r.left && t.left < r.right && t.bottom > r.top && t.top < r.bottom) {
        pod.push(e.textContent.trim().slice(0, 24));
      }
    }
    return { sirka: Math.round(r.width), pod };
  });
  pravda('tlačítko „Nahoru" je po odrolování vidět', !!v, 'nenaskočilo');
  if (v) {
    pravda('a nezakrývá text v kartách', v.pod.length === 0,
      `sedí na: ${v.pod.join(' | ')} — tlačítko je ${v.sirka} px široké`);
  }
  await ctx.close();
}

await prohlizec.close();
console.log('\nRozvržení a popisky stránek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Rozvržení: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
